const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { Resend } = require('resend');
const crypto = require('crypto');

const resend = new Resend(process.env.RESEND_API_KEY);

const PROPOSALS_BOARD_ID = '18389820785';
const STARTED_PROJECTS_GROUP = 'group_mky4ey72';

const COL = {
  email:        'email_mky1wg4h',
  jobNumber:    'text_mky9p0t3',
  siteAddress:  'text_mky7ram8',
  dealAlloc:    'color_mkxzxmmh',
  stage:        'color_mky4a52f',
  revision:     'color_mky4x01c',
  timeline:     'color_mky440wt',
};

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

async function getProposalItem(itemId) {
  const data = await mondayApi(`{
    items(ids: [${itemId}]) {
      id name
      group { id title }
      column_values { id text value }
    }
  }`);
  return data?.data?.items?.[0];
}

router.post('/webhook', async (req, res) => {
  try {
    if (req.body.challenge) return res.json({ challenge: req.body.challenge });

    const event = req.body.event;
    if (!event) return res.json({ ok: true });

    console.log('Proposals webhook event:', JSON.stringify(event).substring(0, 200));

    const { pulseId, groupId, destGroupId } = event;
    const targetGroup = destGroupId || groupId;

    if (targetGroup !== STARTED_PROJECTS_GROUP) {
      return res.json({ ok: true });
    }

    console.log(`Item ${pulseId} moved to STARTED PROJECTS`);

    const item = await getProposalItem(pulseId);
    if (!item) return res.json({ ok: true });

    const cols = {};
    item.column_values.forEach(col => { cols[col.id] = col.text || ''; });

    const clientName = item.name;
    const clientEmail = cols[COL.email];
    const jobNumber = cols[COL.jobNumber];
    const siteAddress = cols[COL.siteAddress];
    const dealAlloc = (cols[COL.dealAlloc] || '').toUpperCase();
    const isWorkingPartner = dealAlloc.includes('WORKING');

    console.log(`Client: ${clientName}, Email: ${clientEmail}, Job: ${jobNumber}, Site: ${siteAddress}, Deal: ${dealAlloc}`);

    if (!clientEmail) {
      console.error('No client email found for item:', pulseId);
      return res.json({ ok: true });
    }

    // Check if user exists in portal, create if not
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', clientEmail.toLowerCase().trim())
      .single();

    if (!user) {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({ name: clientName, email: clientEmail.toLowerCase().trim(), role: 'client' })
        .select().single();
      if (error) {
        console.error('Error creating user:', error.message);
        return res.json({ ok: true });
      }
      user = newUser;
      console.log('Created new user:', user.id);
    }

    // Find or create portal project
    let { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('job_number', jobNumber)
      .ilike('site_address', `%${siteAddress}%`)
      .single();

    if (!project) {
      const { data: newProject } = await supabase
        .from('projects')
        .insert({
          name: clientName,
          job_number: jobNumber,
          site_address: siteAddress,
          stage: 'preliminary',
          client_id: user.id,
          is_working_partner: isWorkingPartner
        })
        .select().single();
      project = newProject;
      console.log('Created new project:', project?.id);
    } else {
      // Update client and working partner flag
      await supabase.from('projects').update({
        client_id: user.id,
        is_working_partner: isWorkingPartner
      }).eq('id', project.id);
    }

    // Generate magic link
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await supabase.from('magic_links').insert({
      email: clientEmail.toLowerCase().trim(),
      token,
      expires_at: expiresAt.toISOString()
    });
    const portalUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;
    const projectRef = [jobNumber, siteAddress].filter(Boolean).join(' — ');

    // Send welcome email
    await resend.emails.send({
      from: 'Xpress Draft <noreply@xpressdraft.com.au>',
      to: clientEmail,
      subject: `Welcome to Xpress Draft — your portal is ready`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
        <img src="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png" alt="Xpress Draft" style="height:48px;margin-bottom:32px;"/>
        ${projectRef ? `<p style="color:#EA672F;font-size:13px;font-weight:600;margin:0 0 8px;">${projectRef}</p>` : ''}
        <h2 style="color:#2A2B29;margin:0 0 16px;">Congratulations on choosing Xpress Draft!</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.8;margin-bottom:24px;">
          Hi ${clientName},<br/><br/>
          Your client portal is now ready.<br/><br/>
          Click below to access it — you can track your project progress, review and mark up drawings${isWorkingPartner ? ', communicate directly with your designer,' : ''} and download your plans.
        </p>
        <a href="${portalUrl}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">
          Access my portal →
        </a>
        <p style="color:#5E635B;font-size:13px;line-height:1.8;">
          If you have any questions, reach out at <a href="mailto:info@xpressdraft.com.au" style="color:#EA672F;">info@xpressdraft.com.au</a> — we're always happy to help.<br/><br/>
          Looking forward to delivering a design you'll love!
        </p>
        <p style="color:#A9A09B;font-size:13px;margin-top:32px;">The Xpress Draft Team</p>
      </div>`
    });

    console.log(`Welcome email sent to ${clientEmail} for ${projectRef}`);
    res.json({ ok: true });

  } catch (err) {
    console.error('Proposals webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get project status for client dashboard
router.get('/project-status/:projectId', async (req, res) => {
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('monday_item_id, job_number, site_address, is_working_partner')
      .eq('id', req.params.projectId)
      .single();

    if (!project?.monday_item_id) {
      return res.json({ status: null });
    }

    // Get status from Monday
    const data = await mondayApi(`{
      items(ids: [${project.monday_item_id}]) {
        column_values(ids: ["${COL.stage}", "${COL.revision}", "${COL.timeline}"]) {
          id text
        }
      }
    }`);

    const cols = {};
    const colVals = data?.data?.items?.[0]?.column_values || [];
    colVals.forEach(c => { cols[c.id] = c.text || ''; });

    res.json({
      stage: cols[COL.stage] || '—',
      revision: cols[COL.revision] || '—',
      timeline: cols[COL.timeline] || '—',
      isWorkingPartner: project.is_working_partner || false
    });

  } catch (err) {
    console.error('Project status error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
