const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const axios = require('axios');
const FormDataNode = require('form-data');

const PAYMENT_BOARD_ID = '18388612677';
const PAYMENT_GROUP = 'group_mky12wa5';
const COL = {
  jobTag: 'tag_mkxz9v9m',
  amount: 'numeric_mkxz32sz',
  amountGst: 'numeric_mky1x0ve',
  invoiceFile: 'file_mky1vgaf',
  paymentStatus: 'color_mky1hrw4',
};
const GST_RATE = 0.10; // Australian GST — flag if this business operates under a different rate

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

async function findJobTagId(jobNumber) {
  const data = await mondayApi(`{ tags { id name } }`);
  const tags = data?.data?.tags || [];
  const match = tags.find(t => (t.name || '').trim().toLowerCase() === (jobNumber || '').trim().toLowerCase());
  return match ? match.id : null;
}

async function uploadFileToMondayColumn(itemId, columnId, buffer, fileName, mimeType) {
  const form = new FormDataNode();
  form.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id } }`);
  form.append('variables', JSON.stringify({ file: null }));
  form.append('map', JSON.stringify({ file: ['variables.file'] }));
  form.append('file', buffer, { filename: fileName, contentType: mimeType, knownLength: buffer.length });
  await axios.post('https://api.monday.com/v2/file', form, {
    headers: { 'Authorization': process.env.MONDAY_API_TOKEN, ...form.getHeaders() }
  });
}

async function loadAcceptedJobAndDollarFee(jobId, contractorId) {
  const { data: job } = await supabase
    .from('contractor_jobs')
    .select(`*, project:projects(id, name, job_number, site_address, monday_item_id)`)
    .eq('id', jobId).eq('contractor_id', contractorId).eq('status', 'accepted').single();
  if (!job || !job.project?.monday_item_id) return { job: null, dollarFee: 0 };

  const data = await mondayApi(`{
    items(ids: [${job.project.monday_item_id}]) { column_values(ids: ["numeric_mkxzs5c4"]) { text } }
  }`);
  const dealValue = parseFloat(data?.data?.items?.[0]?.column_values?.[0]?.text) || 0;
  const dollarFee = Math.round((dealValue * (job.total_fee || 0)) / 100);
  return { job, dollarFee };
}

// Pre-fills the invoice amount from the job's already-calculated fee, so
// the contractor doesn't have to work it out themselves — editable after.
router.get('/jobs/:jobId/invoice-prefill', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    const { job, dollarFee } = await loadAcceptedJobAndDollarFee(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found' });
    res.json({
      jobNumber: job.project.job_number,
      amount: dollarFee,
      amountGst: Math.round(dollarFee * (1 + GST_RATE)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submits an invoice: creates the payment-control item on Monday, uploads
// the invoice file, tags it with the matching job number, and records it
// locally so the contractor can see it and its live payment status later.
router.post('/jobs/:jobId/invoices', auth, upload.single('file'), async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    if (!req.file) return res.status(400).json({ error: 'Invoice file required' });
    const { amount, amountGst } = req.body;
    if (!amount) return res.status(400).json({ error: 'Amount required' });

    const { job } = await loadAcceptedJobAndDollarFee(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found' });

    const tagId = await findJobTagId(job.project.job_number);
    const columnValuesObj = {
      [COL.amount]: Number(amount),
      [COL.amountGst]: Number(amountGst) || Number(amount),
      ...(tagId ? { [COL.jobTag]: { tag_ids: [Number(tagId)] } } : {})
    };
    const itemNameLiteral = JSON.stringify(req.user.name || 'Contractor');
    const columnValuesLiteral = JSON.stringify(JSON.stringify(columnValuesObj));

    const createRes = await mondayApi(`mutation {
      create_item(board_id: ${PAYMENT_BOARD_ID}, group_id: "${PAYMENT_GROUP}", item_name: ${itemNameLiteral}, column_values: ${columnValuesLiteral}) { id }
    }`);
    const newItemId = createRes?.data?.create_item?.id;
    if (!newItemId) throw new Error('Failed to create Monday payment item');

    await uploadFileToMondayColumn(newItemId, COL.invoiceFile, req.file.buffer, req.file.originalname, req.file.mimetype);

    await supabase.from('contractor_invoices').insert({
      project_id: job.project.id, contractor_id: req.user.id, job_number: job.project.job_number,
      amount: Number(amount), amount_gst: Number(amountGst) || Number(amount),
      file_name: req.file.originalname, monday_item_id: String(newItemId),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Invoice submission error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Lists this contractor's past invoices for a job, with live payment
// status pulled from Monday (never cached) for each one.
router.get('/jobs/:jobId/invoices', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    const { data: job } = await supabase
      .from('contractor_jobs').select('project_id').eq('id', req.params.jobId).eq('contractor_id', req.user.id).single();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { data: invoices } = await supabase
      .from('contractor_invoices').select('*')
      .eq('project_id', job.project_id).eq('contractor_id', req.user.id)
      .order('submitted_at', { ascending: false });

    const itemIds = (invoices || []).map(i => i.monday_item_id).filter(Boolean);
    let statusMap = {};
    if (itemIds.length > 0) {
      const data = await mondayApi(`{
        items(ids: [${itemIds.join(',')}]) { id column_values(ids: ["${COL.paymentStatus}"]) { text } }
      }`);
      (data?.data?.items || []).forEach(it => { statusMap[it.id] = it.column_values?.[0]?.text || 'Outstanding'; });
    }

    const enriched = (invoices || []).map(i => ({ ...i, paymentStatus: statusMap[i.monday_item_id] || 'Outstanding' }));
    res.json({ invoices: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
