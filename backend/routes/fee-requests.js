const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');

const OVERALL_BOARD_ID = process.env.MONDAY_BOARD_ID;
async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

const OPTION_FIELD = { siteVisit: 'site_visit', model3d: 'model_3d', renders3d: 'renders_3d' };
const OPTION_LABEL = { siteVisit: 'Site Visit', model3d: '3D Model', renders3d: '3D Renders' };

// Lists all fee option requests for the Admin > Contractor Requests tab.
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { data: requests } = await supabase
      .from('contractor_fee_requests')
      .select(`*, contractor:users!contractor_fee_requests_contractor_id_fkey(name, email),
        job:contractor_jobs(id, total_fee, project:projects(job_number, site_address, name))`)
      .order('requested_at', { ascending: false });
    res.json({ requests: requests || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/approve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { data: request } = await supabase
      .from('contractor_fee_requests')
      .select(`*, job:contractor_jobs(*, project:projects(monday_item_id))`)
      .eq('id', req.params.id).eq('status', 'pending').single();
    if (!request) return res.status(404).json({ error: 'Request not found or already resolved' });

    const field = OPTION_FIELD[request.option_key];
    const job = request.job;
    const newValues = { site_visit: job.site_visit, model_3d: job.model_3d, renders_3d: job.renders_3d, [field]: true };
    const totalFee = 25 + (newValues.site_visit ? 5 : 0) + (newValues.model_3d ? 5 : 0) + (newValues.renders_3d ? 5 : 0);

    await supabase.from('contractor_jobs').update({ ...newValues, total_fee: totalFee }).eq('id', job.id);
    await supabase.from('contractor_fee_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', request.id);

    try {
      if (job.project?.monday_item_id) {
        const dvData = await mondayApi(`{ items(ids: [${job.project.monday_item_id}]) { column_values(ids: ["numeric_mkxzs5c4"]) { text } } }`);
        const dealValue = parseFloat(dvData?.data?.items?.[0]?.column_values?.[0]?.text) || 0;
        const dollarFee = Math.round((dealValue * totalFee) / 100);
        await mondayApi(`mutation { change_column_value(board_id: ${OVERALL_BOARD_ID}, item_id: ${job.project.monday_item_id}, column_id: "numeric_mm6kq445", value: "${dollarFee}") { id } }`);
      }
    } catch (mondayErr) { console.error('Fee sync to Monday error:', mondayErr.message); }

    res.json({ ok: true, optionLabel: OPTION_LABEL[request.option_key], totalFee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/deny', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { error } = await supabase
      .from('contractor_fee_requests')
      .update({ status: 'denied', resolved_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('status', 'pending');
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
