const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { Resend } = require('resend');
const crypto = require('crypto');
const resend = new Resend(process.env.RESEND_API_KEY);
const { sendClientSms } = require('../utils/sms');
const PROPOSALS_BOARD_ID = '18389820785';
const STARTED_PROJECTS_GROUP = 'group_mky4ey72';
const CONTRACTOR_COL_PROPOSALS = 'board_relation_mky4v9kn';
const CONTRACTOR_EMAIL_COL = 'email_mkxzp1qw';
const CONTRACTOR_PHONE_COL = 'phone_mkxzazqw';
const COL = {
  email:        'email_mky1wg4h',
  phone:        'phone_mky18hs6',
  jobNumber:    'text_mky9p0t3',
  siteAddress:  'text_mky7ram8',
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
async function addMondayNote(itemId, note) {
  await mondayApi(`mutation { create_update(item_id: ${itemId}, body: "${note}") { id } }`);
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
async function getContractorFromRelation(itemId, columnId) {
  const data = await mondayApi(`{
    items(ids: [${itemId}]) {
      column_values(ids: ["${columnId}"]) {
        ... on BoardRelationValue { linked_items { id name } }
      }
    }
  }`);
  const linked = data?.data?.items?.[0]?.column_values?.[0]?.linked_items;
  if (!linked || linked.length === 0) return null;
  const cId = linked[0].id;
  const cData = await mondayApi(`{
    items(ids: [${cId}]) {
      name
      column_values(ids: ["${CONTRACTOR_EMAIL_COL}", "${CONTRACTOR_PHONE_COL}"]) { id text }
    }
  }`);
  const ci = cData?.data?.items?.[0];
  if (!ci) return null;
  const cols = {};
  ci.column_values.forEach(c => { cols[c.id] = c.text || ''; });
  return { name: ci.name, email: cols[CONTRACTOR_EMAIL_COL], phone: cols[CONTRACTOR_PHONE_COL] };
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
    // The Email column sometimes contains duplicated/malformed text (e.g.
    // from a duplicated Monday item) — extract the first valid email
    // rather than blindly trusting the whole field, so a corrupted value
    // like "x@y.com - x@y.com" doesn't get saved verbatim as the account.
    const rawEmail = cols[COL.email] || '';
    const emailMatch = rawEmail.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const clientEmail = emailMatch ? emailMatch[0] : null;
    const clientPhone = cols[COL.phone];
    const jobNumber = cols[COL.jobNumber];
    const siteAddress = cols[COL.siteAddress];
    console.log(`Client: ${clientName}, Email: ${clientEmail} (raw: ${rawEmail}), Phone: ${clientPhone || 'none'}, Job: ${jobNumber}, Site: ${siteAddress}`);
    if (!clientEmail) {
      console.error('No valid client email found for item:', pulseId);
      await addMondayNote(pulseId, `⚠️ Xpress Draft Portal: Could not find a valid email address in the Email column (raw value: "${rawEmail}"). Please fix and re-trigger.`);
      return res.json({ ok: true });
    }
    // Get contractor from Proposals board relation
    let contractorId = null;
    try {
      const contractor = await getContractorFromRelation(pulseId, CONTRACTOR_COL_PROPOSALS);
      if (contractor && contractor.email) {
        let { data: contractorUser } = await supabase
          .from('users').select('*').eq('email', contractor.email.toLowerCase().trim()).single();
        if (!contractorUser) {
          const { data: nc } = await supabase
            .from('users')
            .insert({ name: contractor.name, email: contractor.email.toLowerCase().trim(), role: 'contractor', phone: contractor.phone || null })
            .select().single();
          contractorUser = nc;
          console.log(`Created contractor: ${contractor.name}`);
        }
        contractorId = contractorUser?.id || null;
        console.log(`Contractor linked: ${contractor.name}`);
      }
    } catch(e) { console.error('Contractor error:', e.message); }
    // Check if user exists in portal, create if not
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', clientEmail.toLowerCase().trim())
      .single();
    if (!user) {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({ name: clientName, email: clientEmail.toLowerCase().trim(), role: 'client', phone: clientPhone || null })
        .select().single();
      if (error) {
        console.error('Error creating user:', error.message);
        return res.json({ ok: true });
      }
      user = newUser;
      console.log('Created new user:', user.id);
    } else if (!user.phone && clientPhone) {
      await supabase.from('users').update({ phone: clientPhone }).eq('id', user.id);
      user.phone = clientPhone;
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
          contractor_id: contractorId,
          is_working_partner: contractorId !== null
        })
        .select().single();
      project = newProject;
      console.log('Created new project:', project?.id);
    } else {
      await supabase.from('projects').update({
        client_id: user.id,
        contractor_id: contractorId,
        is_working_partner: contractorId !== null
      }).eq('id', project.id);
    }
    // Create contractor job offer if contractor assigned
    if (contractorId && project) {
      try {
        const { data: existingJob } = await supabase
          .from('contractor_jobs').select('id').eq('contractor_id', contractorId).eq('project_id', project.id).single();
        if (!existingJob) {
          await supabase.from('contractor_jobs').insert({
            contractor_id: contractorId,
            project_id: project.id,
            status: 'pending'
          });
          console.log('Created contractor job offer');
        }
      } catch(e) { console.error('Contractor job error:', e.message); }
    }
    // Generate magic link
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months
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
          Click below to access it — you can track your project progress, review and mark up drawings${contractorId ? ', communicate directly with your assigned designer,' : ''} and download your plans.
        </p>
        <a href="${portalUrl}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">
          Access my portal →
        </a>
        <p style="color:#5E635B;font-size:13px;line-height:1.8;">
          From here, our design team will be looking after your project directly — for any questions, reach out to Luiz Braga at <a href="mailto:luiz.braga@xpressdraft.com.au" style="color:#EA672F;">luiz.braga@xpressdraft.com.au</a> or 0466 515 532.<br/><br/>
          Looking forward to delivering a design you'll love!
        </p>
        <p style="color:#A9A09B;font-size:13px;margin-top:32px;">The Xpress Draft Team</p>
      </div>`
    });
    await sendClientSms(user.phone, `Hi ${clientName}, congrats on choosing Xpressdraft! Check your email for the pre-consultation form and portal access - please complete it well, it helps your first sketch. We'll text when drawings are ready. From now, contact Luiz Braga (design team) on 0466 515 532 or luiz.braga@xpressdraft.com.au. All the best!`);
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
      .select('monday_item_id, job_number, site_address, is_working_partner, contractor_id')
      .eq('id', req.params.projectId)
      .single();
    // Designer info is only shown to the client once the contractor has
    // actually accepted the job — not merely assigned/pending.
    const getAcceptedDesigner = async () => {
      if (!project?.is_working_partner || !project?.contractor_id) return { designerName: null, designerPhone: null };
      const { data: acceptedJob } = await supabase
        .from('contractor_jobs').select('id').eq('project_id', req.params.projectId)
        .eq('contractor_id', project.contractor_id).eq('status', 'accepted').maybeSingle();
      if (!acceptedJob) return { designerName: null, designerPhone: null };
      const { data: contractor } = await supabase
        .from('users').select('name, phone').eq('id', project.contractor_id).single();
      return contractor ? { designerName: contractor.name, designerPhone: contractor.phone } : { designerName: null, designerPhone: null };
    };
    if (!project?.monday_item_id) {
      const { designerName, designerPhone } = await getAcceptedDesigner();
      return res.json({ status: null, designerName, designerPhone });
    }
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
    const { designerName, designerPhone } = await getAcceptedDesigner();
    res.json({
      stage: cols[COL.stage] || '—',
      revision: cols[COL.revision] || '—',
      timeline: cols[COL.timeline] || '—',
      isWorkingPartner: project.is_working_partner || false,
      designerName,
      designerPhone
    });
  } catch (err) {
    console.error('Project status error:', err);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
