const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

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

async function getProposalDetails(mondayItemId) {
  const data = await mondayApi(`{
    items(ids: [${mondayItemId}]) {
      name
      column_values(ids: ["long_text_mkxzds8g", "file_mky1n7q2", "numeric_mky1cmcv"]) {
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
  try {
    const overallData = await mondayApi(`{
      items(ids: [${mondayItemId}]) {
        column_values(ids: ["file_mky1ggt0"]) { id value }
      }
    }`);
    const fileVal = JSON.parse(overallData?.data?.items?.[0]?.column_values?.[0]?.value || '{}');
    clientFiles = fileVal?.files || [];
  } catch(e) {}

  return {
    briefing: cols['long_text_mkxzds8g']?.text || '',
    dealValue: cols['numeric_mky1cmcv']?.text || '0',
    agreementUrl,
    clientFiles
  };
}

// Get contractor's pending and active jobs
router.get('/jobs', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { data: jobs } = await supabase
      .from('contractor_jobs')
      .select(`*, project:projects(id, name, job_number, site_address, stage, monday_item_id, client_id)`)
      .eq('contractor_id', req.user.id)
      .order('created_at', { ascending: false });

    res.json({ jobs: jobs || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get proposal details for a job
router.get('/jobs/:jobId/details', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { data: job } = await supabase
      .from('contractor_jobs')
      .select(`*, project:projects(id, name, job_number, site_address, stage, monday_item_id)`)
      .eq('id', req.params.jobId)
      .eq('contractor_id', req.user.id)
      .single();

    if (!job) return res.status(404).json({ error: 'Job not found' });

    let proposalDetails = null;
    if (job.project?.monday_item_id) {
      proposalDetails = await getProposalDetails(job.project.monday_item_id);
    }

    res.json({ job, proposalDetails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update fee selections
router.put('/jobs/:jobId/fee', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });

    const { siteVisit, model3d, renders3d } = req.body;
    const totalFee = 25 + (siteVisit ? 5 : 0) + (model3d ? 5 : 0) + (renders3d ? 5 : 0);

    const { data, error } = await supabase
      .from('contractor_jobs')
      .update({ site_visit: siteVisit, model_3d: model3d, renders_3d: renders3d, total_fee: totalFee })
      .eq('id', req.params.jobId)
      .eq('contractor_id', req.user.id)
      .select().single();

    if (error) throw error;
    res.json({ job: data, totalFee });
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

    // Notify admin by email (SMS to be added later)
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
