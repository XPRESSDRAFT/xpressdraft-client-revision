const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const { sendAdminSms } = require('../utils/sms');

const PROPOSALS_BOARD_ID = '18389820785';
const OVERALL_BOARD_ID = process.env.MONDAY_BOARD_ID;

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

async function clearBoardRelation(boardId, itemId, columnId) {
  await mondayApi(`mutation {
    change_column_value(
      board_id: ${boardId},
      item_id: ${itemId},
      column_id: "${columnId}",
      value: "{\\"linkedPulseIds\\":[]}"
    ) { id }
  }`);
}

// Batch-fetches live stage/revision/timeline/job type/deal value for
// multiple Monday items in a single call, so the job list doesn't need
// one API call per job. Values are always read live — never cached in
// Supabase — so anything changed on Monday is reflected immediately.
async function getBatchMondayStatus(itemIds) {
  if (itemIds.length === 0) return {};
  const data = await mondayApi(`{
    items(ids: [${itemIds.join(',')}]) {
      id
      column_values(ids: ["color_mky4a52f", "color_mky4x01c", "color_mky440wt", "color_mkxz7cf9", "numeric_mkxzs5c4"]) { id text }
    }
  }`);
  const map = {};
  (data?.data?.items || []).forEach(item => {
    const cols = {};
    item.column_values.forEach(c => { cols[c.id] = c.text || ''; });
    map[item.id] = {
      stage: cols['color_mky4a52f'] || '—',
      revision: cols['color_mky4x01c'] || '—',
      timeline: cols['color_mky440wt'] || '—',
      jobType: cols['color_mkxz7cf9'] || '—',
      dealValue: parseFloat(cols['numeric_mkxzs5c4']) || 0,
    };
  });
  return map;
}

// Searches the Proposals board for the item matching this job's job
// number, confirmed with site address, and pulls the Enquire/Briefing
// text from it. Used as a fallback when the Overall Projects item has
// nothing in that field — the two boards are separate items on Monday,
// linked only by job number + site address, not a shared column.
async function findProposalsBriefing(jobNumber, siteAddress) {
  if (!jobNumber) return '';
  try {
    const data = await mondayApi(`{
      boards(ids: [${PROPOSALS_BOARD_ID}]) {
        items_page(query_params: {rules: [{column_id: "text_mky9p0t3", compare_value: ["${jobNumber}"], operator: any_of}]}) {
          items { id column_values(ids: ["text_mky7ram8", "long_text_mkxzds8g"]) { id text } }
        }
      }
    }`);
    const items = data?.data?.boards?.[0]?.items_page?.items || [];
    for (const it of items) {
      const cols = {};
      it.column_values.forEach(c => { cols[c.id] = c.text || ''; });
      if (!siteAddress || cols['text_mky7ram8'].toLowerCase().includes(siteAddress.toLowerCase()) || siteAddress.toLowerCase().includes(cols['text_mky7ram8'].toLowerCase())) {
        return cols['long_text_mkxzds8g'] || '';
      }
    }
  } catch (e) { console.error('findProposalsBriefing error:', e.message); }
  return '';
}

async function getProposalDetails(mondayItemId, jobNumber, siteAddress) {
  const data = await mondayApi(`{
    items(ids: [${mondayItemId}]) {
      name
      column_values(ids: ["long_text_mkxzds8g", "file_mky1n7q2", "numeric_mkxzs5c4"]) {
        id text value
      }
    }
  }`);
  const item = data?.data?.items?.[0];
  if (!item) return null;
  const cols = {};
  item.column_values.forEach(c => { cols[c.id] = { text: c.text, value: c.value }; });

  let agreementUrl = null;
  try {
    const fileVal = JSON.parse(cols['file_mky1n7q2']?.value || '{}');
    const files = fileVal?.files || [];
    if (files.length > 0) {
      const assetData = await mondayApi(`{ assets(ids: [${files[0].assetId}]) { public_url name } }`);
      agreementUrl = assetData?.data?.assets?.[0]?.public_url;
    }
  } catch(e) {}

  let clientFiles = [];
  let proposalFiles = [];
  try {
    const overallData = await mondayApi(`{
      items(ids: [${mondayItemId}]) {
        column_values(ids: ["file_mky1ggt0", "file_mm1bpafz"]) { id value }
      }
    }`);
    const vals = overallData?.data?.items?.[0]?.column_values || [];
    const receivedCol = vals.find(v => v.id === 'file_mky1ggt0');
    const proposalsCol = vals.find(v => v.id === 'file_mm1bpafz');
    const toFileLinks = (raw) => (JSON.parse(raw || '{}')?.files || []).map(f => ({
      name: f.name,
      url: `https://xpressdraft.monday.com/protected_static/10128130/resources/${f.assetId}/${f.name}`
    }));
    clientFiles = toFileLinks(receivedCol?.value);
    proposalFiles = toFileLinks(proposalsCol?.value);
  } catch(e) {}

  let briefing = cols['long_text_mkxzds8g']?.text || '';
  if (!briefing) briefing = await findProposalsBriefing(jobNumber, siteAddress);

  return {
    briefing,
    dealValue: cols['numeric_mkxzs5c4']?.text || '0',
    agreementUrl,
    clientFiles,
    proposalFiles
  };
}

// Get contractor's pending and active jobs
router.get('/jobs', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { data: jobs } = await supabase
      .from('contractor_jobs')
      .select(`*, project:projects(id, name, job_number, site_address, stage, monday_item_id, client_id, last_instructions_at)`)
      .eq('contractor_id', req.user.id)
      .order('created_at', { ascending: false });

    const itemIds = (jobs || []).map(j => j.project?.monday_item_id).filter(Boolean);
    const statusMap = await getBatchMondayStatus(itemIds);

    const enriched = (jobs || []).map(j => {
      const mondayStatus = j.project?.monday_item_id ? statusMap[j.project.monday_item_id] : null;
      const dollarFee = mondayStatus ? Math.round((mondayStatus.dealValue * (j.total_fee || 0)) / 100) : 0;
      const hasNewInstructions = !!(j.project?.last_instructions_at &&
        (!j.instructions_viewed_at || new Date(j.project.last_instructions_at) > new Date(j.instructions_viewed_at)));
      return { ...j, mondayStatus, dollarFee, hasNewInstructions };
    });

    res.json({ jobs: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get proposal details for a job. Client contact details (name, email, phone)
// are only included once the contractor has accepted the job — they stay
// withheld while the job is pending or declined.
router.get('/jobs/:jobId/details', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { data: job } = await supabase
      .from('contractor_jobs')
      .select(`*, project:projects(id, name, job_number, site_address, stage, monday_item_id, client_id, last_instructions_at)`)
      .eq('id', req.params.jobId)
      .eq('contractor_id', req.user.id)
      .single();

    if (!job) return res.status(404).json({ error: 'Job not found' });

    let proposalDetails = null;
    let mondayStatus = null;
    if (job.project?.monday_item_id) {
      proposalDetails = await getProposalDetails(job.project.monday_item_id, job.project.job_number, job.project.site_address);
      const statusMap = await getBatchMondayStatus([job.project.monday_item_id]);
      mondayStatus = statusMap[job.project.monday_item_id] || null;
    }
    const dollarFee = mondayStatus ? Math.round((mondayStatus.dealValue * (job.total_fee || 0)) / 100) : 0;

    let client = null;
    if (job.status === 'accepted' && job.project?.client_id) {
      const { data: clientUser } = await supabase
        .from('users')
        .select('name, email, phone')
        .eq('id', job.project.client_id)
        .single();
      client = clientUser || null;
    }

    // Real current pending-request state — not just what the frontend
    // remembers locally, so a denial (or approval) is always reflected
    // correctly even without a page reload.
    const { data: pendingRequests } = await supabase
      .from('contractor_fee_requests').select('option_key')
      .eq('contractor_job_id', job.id).eq('status', 'pending');
    const pendingFeeRequestOptions = (pendingRequests || []).map(r => r.option_key);

    res.json({ job, proposalDetails, client, mondayStatus, dollarFee, pendingFeeRequestOptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full instructions/markup history for this job's project, oldest first.
// Opening this tab also marks it viewed, clearing the "new" highlight.
router.get('/jobs/:jobId/instructions', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { data: job } = await supabase
      .from('contractor_jobs').select('id, project_id')
      .eq('id', req.params.jobId).eq('contractor_id', req.user.id).single();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { data: entries } = await supabase
      .from('job_instructions').select('*')
      .eq('project_id', job.project_id).order('created_at', { ascending: true });

    await supabase.from('contractor_jobs').update({ instructions_viewed_at: new Date().toISOString() }).eq('id', job.id);

    res.json({ entries: entries || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update fee selections
router.put('/jobs/:jobId/fee', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { siteVisit, model3d, renders3d } = req.body;

    const { data: current } = await supabase
      .from('contractor_jobs').select('status, site_visit, model_3d, renders_3d')
      .eq('id', req.params.jobId).eq('contractor_id', req.user.id).single();
    if (!current) return res.status(404).json({ error: 'Job not found' });

    // Once accepted, a contractor can remove an option freely but can't
    // newly enable one directly — that has to go through admin approval
    // instead (POST /jobs/:jobId/fee-requests).
    if (current.status === 'accepted') {
      const blocked = [];
      if (siteVisit && !current.site_visit) blocked.push('Site Visit');
      if (model3d && !current.model_3d) blocked.push('3D Model');
      if (renders3d && !current.renders_3d) blocked.push('3D Renders');
      if (blocked.length > 0) return res.status(403).json({ error: `${blocked.join(', ')} require${blocked.length === 1 ? 's' : ''} admin approval — please request ${blocked.length === 1 ? 'it' : 'them'} instead.` });
    }

    const totalFee = 25 + (siteVisit ? 5 : 0) + (model3d ? 5 : 0) + (renders3d ? 5 : 0);

    const { data, error } = await supabase
      .from('contractor_jobs')
      .update({ site_visit: siteVisit, model_3d: model3d, renders_3d: renders3d, total_fee: totalFee })
      .eq('id', req.params.jobId)
      .eq('contractor_id', req.user.id)
      .select(`*, project:projects(monday_item_id)`).single();

    if (error) throw error;

    // Push the live dollar fee to Monday so it stays in sync as the
    // contractor toggles optional extras — not just once they accept.
    try {
      if (data.project?.monday_item_id) {
        const dvData = await mondayApi(`{
          items(ids: [${data.project.monday_item_id}]) { column_values(ids: ["numeric_mkxzs5c4"]) { text } }
        }`);
        const dealValue = parseFloat(dvData?.data?.items?.[0]?.column_values?.[0]?.text) || 0;
        const dollarFee = Math.round((dealValue * totalFee) / 100);
        await mondayApi(`mutation {
          change_column_value(board_id: ${OVERALL_BOARD_ID}, item_id: ${data.project.monday_item_id}, column_id: "numeric_mm6kq445", value: "${dollarFee}") { id }
        }`);
      }
    } catch (mondayErr) { console.error('Fee sync to Monday error:', mondayErr.message); }

    res.json({ job: data, totalFee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contractor requests one specific optional fee be added after acceptance
// — requires admin approval before it actually applies.
router.post('/jobs/:jobId/fee-requests', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    const { optionKey } = req.body;
    if (!['siteVisit', 'model3d', 'renders3d'].includes(optionKey)) return res.status(400).json({ error: 'Invalid option' });

    const { data: job } = await supabase
      .from('contractor_jobs')
      .select(`*, project:projects(job_number, site_address, name)`)
      .eq('id', req.params.jobId).eq('contractor_id', req.user.id).eq('status', 'accepted').single();
    if (!job) return res.status(404).json({ error: 'Accepted job not found' });

    const { data: existingRequest } = await supabase
      .from('contractor_fee_requests').select('id')
      .eq('contractor_job_id', job.id).eq('option_key', optionKey).eq('status', 'pending').maybeSingle();
    if (existingRequest) return res.status(409).json({ error: 'A request for this option is already pending.' });

    await supabase.from('contractor_fee_requests').insert({
      contractor_job_id: job.id, contractor_id: req.user.id, option_key: optionKey
    });

    const jobRef = [job.project.job_number, job.project.site_address].filter(Boolean).join(' — ') || job.project.name;
    const optionLabel = { siteVisit: 'Site Visit', model3d: '3D Model', renders3d: '3D Renders' }[optionKey];
    await sendAdminSms(`Fee request: ${req.user.name} wants to add ${optionLabel} on ${jobRef}. Review in Admin > Contractor Requests.`);
    await resend.emails.send({
      from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>',
      to: 'info@xpressdraft.com.au',
      subject: `Fee option request — ${jobRef}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#2A2B29;">Contractor requested an additional fee option</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.8;"><strong>${req.user.name}</strong> requested <strong>${optionLabel}</strong> be added to their fee on <strong>${jobRef}</strong>. Review and approve or deny it under Admin &gt; Contractor Requests.</p>
      </div>`
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept job
router.post('/jobs/:jobId/accept', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { data: job } = await supabase
      .from('contractor_jobs')
      .select(`*, project:projects(id, job_number, site_address, monday_item_id, client_id)`)
      .eq('id', req.params.jobId)
      .eq('contractor_id', req.user.id)
      .single();

    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Update job status
    await supabase.from('contractor_jobs')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', req.params.jobId);

    // Update project - mark as working partner and link contractor
    await supabase.from('projects')
      .update({ is_working_partner: true, contractor_id: req.user.id })
      .eq('id', job.project.id);

    const jobRef = [job.project.job_number, job.project.site_address].filter(Boolean).join(' — ');
    console.log(`Contractor ${req.user.name} accepted job ${jobRef}`);

    // Notify admin
    await resend.emails.send({
      from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>',
      to: 'info@xpressdraft.com.au',
      subject: `Contractor accepted job — ${jobRef}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#2A2B29;">Job Accepted</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.8;">
          <strong>${req.user.name}</strong> has accepted the job for <strong>${jobRef}</strong>.<br/><br/>
          Agreed fee: <strong>${job.total_fee}%</strong><br/>
          Site Visit: ${job.site_visit ? 'Yes' : 'No'}<br/>
          3D Model: ${job.model_3d ? 'Yes' : 'No'}<br/>
          3D Renders: ${job.renders_3d ? 'Yes' : 'No'}
        </p>
      </div>`
    });

    // Post a welcome message into the project chat so the client gets
    // introduced to their assigned designer right away, then email them
    // to check the portal — same pattern used for any other new message.
    const welcomeMsg = `Hi! I'm now looking after your project and will be in touch here with any updates or questions. Feel free to reach out anytime through this chat. Looking forward to working with you!`;
    await supabase.from('project_messages').insert({
      project_id: job.project.id, sender_id: req.user.id, sender_role: 'contractor', message: welcomeMsg
    });
    await supabase.from('projects').update({ last_message_at: new Date().toISOString() }).eq('id', job.project.id);
    if (job.project.client_id) {
      const { data: clientUser } = await supabase.from('users').select('name, email').eq('id', job.project.client_id).single();
      if (clientUser?.email) {
        await resend.emails.send({
          from: 'Xpress Draft <noreply@xpressdraft.com.au>',
          to: clientUser.email,
          subject: `New message from your designer — ${jobRef}`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
            <h2 style="color:#2A2B29;">New message</h2>
            <p style="color:#5E635B;font-size:15px;line-height:1.8;">Hi ${clientUser.name},<br/><br/>You have a new message from your assigned designer on <strong>${jobRef}</strong> — check the Messages tab in your portal.</p>
            <a href="${process.env.FRONTEND_URL}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-top:16px;">Open portal →</a>
          </div>`
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Decline job
router.post('/jobs/:jobId/decline', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { data: job } = await supabase
      .from('contractor_jobs')
      .select(`*, project:projects(id, job_number, site_address, monday_item_id)`)
      .eq('id', req.params.jobId)
      .eq('contractor_id', req.user.id)
      .single();

    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Update job status
    await supabase.from('contractor_jobs')
      .update({ status: 'declined', declined_at: new Date().toISOString() })
      .eq('id', req.params.jobId);

    // Clear contractor from project
    await supabase.from('projects')
      .update({ is_working_partner: false, contractor_id: null })
      .eq('id', job.project.id);

    // Clear contractor from Monday board relations
    if (job.project?.monday_item_id) {
      try {
        await clearBoardRelation(OVERALL_BOARD_ID, job.project.monday_item_id, 'board_relation_mky4dh21');
        // Also try proposals board if linked
        await clearBoardRelation(PROPOSALS_BOARD_ID, job.project.monday_item_id, 'board_relation_mky4v9kn');
      } catch(e) { console.error('Monday clear error:', e.message); }
    }

    const jobRef = [job.project.job_number, job.project.site_address].filter(Boolean).join(' — ');

    // Notify admin by email and SMS — decline means the project needs
    // reassigning, so it needs to be seen quickly.
    await sendAdminSms(`⚠️ Contractor declined: ${req.user.name} declined ${jobRef}. Reassignment needed.`);
    await resend.emails.send({
      from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>',
      to: 'info@xpressdraft.com.au',
      subject: `⚠️ Contractor declined job — ${jobRef}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#E24B4A;">Job Declined</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.8;">
          <strong>${req.user.name}</strong> has declined the job for <strong>${jobRef}</strong>.<br/><br/>
          Their name has been automatically cleared from Monday.<br/><br/>
          Please reassign the project.
        </p>
        <a href="https://xpressdraft.monday.com/boards/${OVERALL_BOARD_ID}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-top:16px;">View in Monday →</a>
      </div>`
    });

    console.log(`Contractor ${req.user.name} declined job ${jobRef}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
