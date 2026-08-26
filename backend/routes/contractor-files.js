const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const axios = require('axios');
const FormDataNode = require('form-data');

const OVERALL_BOARD_ID = process.env.MONDAY_BOARD_ID;
const COL = {
  stage: 'color_mky4a52f',
  revision: 'color_mky4x01c',
  reviewStatus: 'color_mky4k55c',
  storageStatus: 'color_mm3be7ph',
};
// PLN/Revit working file columns, by stage + revision letter
const WORKING_COLS = {
  preliminary: { A: 'file_mky4pckw', B: 'file_mky7kzxe', C: 'file_mky71fdz', DEFAULT: 'file_mky8zryv' },
  working_drawings: { A: 'file_mky4tmbd', B: 'file_mky7dxzj', DEFAULT: 'file_mky8kk8s' },
};
// Client-facing outcome (PDF / PDF+DWG) columns, by stage + revision letter
const DELIVERY_COLS = {
  preliminary: { A: 'file_mky78hah', DEFAULT: 'file_mky82vnr' },
  working_drawings: { A: 'file_mky76fb7', DEFAULT: 'file_mky8vv0m' },
};
// Backup storage drive link columns, by stage
const STORAGE_LINK_COLS = { preliminary: 'file_mkzhwq04', working_drawings: 'file_mkzhzwsh' };

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

function parseRevisionLetter(revisionText) {
  const t = (revisionText || '').toUpperCase().trim();
  if (t.includes('FIRST DRAFT')) return 'A';
  const m = t.match(/ISSUE\s*-?\s*([A-Z])/);
  return m ? m[1] : 'A';
}
function stageKeyFromText(stageText) {
  return (stageText || '').toUpperCase().includes('WD') ? 'working_drawings' : 'preliminary';
}
function pickWorkingColumn(stageKey, letter) {
  const cols = WORKING_COLS[stageKey];
  return cols[letter] || cols.DEFAULT;
}
function pickDeliveryColumn(stageKey, letter) {
  const cols = DELIVERY_COLS[stageKey];
  return letter === 'A' ? cols.A : cols.DEFAULT;
}

async function getMondayContext(mondayItemId) {
  const data = await mondayApi(`{
    items(ids: [${mondayItemId}]) {
      column_values(ids: ["${COL.stage}", "${COL.revision}"]) { id text }
    }
  }`);
  const cols = {};
  (data?.data?.items?.[0]?.column_values || []).forEach(c => { cols[c.id] = c.text || ''; });
  const stageKey = stageKeyFromText(cols[COL.stage]);
  const letter = parseRevisionLetter(cols[COL.revision]);
  return { stageKey, letter };
}

async function getStorageLinkUrl(mondayItemId, stageKey) {
  const columnId = STORAGE_LINK_COLS[stageKey];
  const data = await mondayApi(`{
    items(ids: [${mondayItemId}]) { column_values(ids: ["${columnId}"]) { text } }
  }`);
  return data?.data?.items?.[0]?.column_values?.[0]?.text || null;
}

async function uploadFileToMondayColumn(mondayItemId, columnId, buffer, fileName, mimeType) {
  const form = new FormDataNode();
  form.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${mondayItemId}, column_id: "${columnId}", file: $file) { id } }`);
  form.append('variables', JSON.stringify({ file: null }));
  form.append('map', JSON.stringify({ file: ['variables.file'] }));
  form.append('file', buffer, { filename: fileName, contentType: mimeType, knownLength: buffer.length });
  const res = await axios.post('https://api.monday.com/v2/file', form, {
    headers: { 'Authorization': process.env.MONDAY_API_TOKEN, ...form.getHeaders() }
  });
  return res.data;
}

async function setColumnLabel(mondayItemId, boardId, columnId, label) {
  await mondayApi(`mutation {
    change_column_value(board_id: ${boardId}, item_id: ${mondayItemId}, column_id: "${columnId}", value: "{\\"label\\":\\"${label}\\"}") { id }
  }`);
}

// Loads (or creates) the tracking row for this project/stage/revision, and
// checks whether all three required actions are done. If so, moves the
// Monday item to TO BE REVIEWED and sets its status to TO DO. Idempotent —
// safe to call after every individual action.
async function checkAndFinalize(projectId, contractorId, stageKey, letter, mondayItemId) {
  const { data: row } = await supabase
    .from('contractor_uploads').select('*')
    .eq('project_id', projectId).eq('stage', stageKey).eq('revision_letter', letter).maybeSingle();
  if (!row) return row;
  const allDone = row.working_file_uploaded_at && row.delivery_file_uploaded_at && row.storage_confirmed_at;
  if (allDone && mondayItemId) {
    await mondayApi(`mutation { move_item_to_group(item_id: ${mondayItemId}, group_id: "group_title") { id } }`);
    await setColumnLabel(mondayItemId, OVERALL_BOARD_ID, COL.reviewStatus, 'TO DO');
  }
  return row;
}

async function loadJobAndProject(jobId, contractorId) {
  const { data: job } = await supabase
    .from('contractor_jobs')
    .select(`*, project:projects(id, monday_item_id, contractor_id)`)
    .eq('id', jobId).eq('contractor_id', contractorId).single();
  return job;
}

// Current upload status for this job's active revision — used to render
// each action's state (idle / done) in the contractor portal.
router.get('/:jobId/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    const job = await loadJobAndProject(req.params.jobId, req.user.id);
    if (!job || !job.project?.monday_item_id) return res.status(404).json({ error: 'Job or Monday link not found' });

    const { stageKey, letter } = await getMondayContext(job.project.monday_item_id);
    const storageLink = await getStorageLinkUrl(job.project.monday_item_id, stageKey);
    const { data: row } = await supabase
      .from('contractor_uploads').select('*')
      .eq('project_id', job.project.id).eq('stage', stageKey).eq('revision_letter', letter).maybeSingle();

    res.json({
      stage: stageKey, revisionLetter: letter, storageLink,
      workingFileDone: !!row?.working_file_uploaded_at, workingFileName: row?.working_file_name || null,
      deliveryFileDone: !!row?.delivery_file_uploaded_at, deliveryFileNames: row?.delivery_file_names || [],
      storageConfirmed: !!row?.storage_confirmed_at,
    });
  } catch (err) {
    console.error('Upload status error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:jobId/working', auth, upload.single('file'), async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    if (!req.file) return res.status(400).json({ error: 'File required' });
    const job = await loadJobAndProject(req.params.jobId, req.user.id);
    if (!job || !job.project?.monday_item_id) return res.status(404).json({ error: 'Job or Monday link not found' });

    const { stageKey, letter } = await getMondayContext(job.project.monday_item_id);
    const columnId = pickWorkingColumn(stageKey, letter);
    await uploadFileToMondayColumn(job.project.monday_item_id, columnId, req.file.buffer, req.file.originalname, req.file.mimetype);

    await supabase.from('contractor_uploads').upsert({
      project_id: job.project.id, contractor_id: req.user.id, stage: stageKey, revision_letter: letter,
      working_file_uploaded_at: new Date().toISOString(), working_file_name: req.file.originalname,
    }, { onConflict: 'project_id,stage,revision_letter' });

    await checkAndFinalize(job.project.id, req.user.id, stageKey, letter, job.project.monday_item_id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Working file upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:jobId/delivery', auth, upload.array('files', 5), async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'At least one file required' });
    const job = await loadJobAndProject(req.params.jobId, req.user.id);
    if (!job || !job.project?.monday_item_id) return res.status(404).json({ error: 'Job or Monday link not found' });

    const { stageKey, letter } = await getMondayContext(job.project.monday_item_id);
    const ext = (name) => (name.split('.').pop() || '').toLowerCase();
    const hasPdf = req.files.some(f => ext(f.originalname) === 'pdf');
    const hasDwg = req.files.some(f => ext(f.originalname) === 'dwg');
    if (!hasPdf) return res.status(400).json({ error: 'A PDF is required for the delivery upload.' });
    if (stageKey === 'working_drawings' && !hasDwg) return res.status(400).json({ error: 'Working Drawings delivery requires both a PDF and a DWG file.' });

    const columnId = pickDeliveryColumn(stageKey, letter);
    for (const f of req.files) {
      await uploadFileToMondayColumn(job.project.monday_item_id, columnId, f.buffer, f.originalname, f.mimetype);
    }

    await supabase.from('contractor_uploads').upsert({
      project_id: job.project.id, contractor_id: req.user.id, stage: stageKey, revision_letter: letter,
      delivery_file_uploaded_at: new Date().toISOString(), delivery_file_names: req.files.map(f => f.originalname),
    }, { onConflict: 'project_id,stage,revision_letter' });

    await checkAndFinalize(job.project.id, req.user.id, stageKey, letter, job.project.monday_item_id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delivery file upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:jobId/storage-confirm', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    const job = await loadJobAndProject(req.params.jobId, req.user.id);
    if (!job || !job.project?.monday_item_id) return res.status(404).json({ error: 'Job or Monday link not found' });

    const { stageKey, letter } = await getMondayContext(job.project.monday_item_id);
    await setColumnLabel(job.project.monday_item_id, OVERALL_BOARD_ID, COL.storageStatus, 'Done');

    await supabase.from('contractor_uploads').upsert({
      project_id: job.project.id, contractor_id: req.user.id, stage: stageKey, revision_letter: letter,
      storage_confirmed_at: new Date().toISOString(),
    }, { onConflict: 'project_id,stage,revision_letter' });

    await checkAndFinalize(job.project.id, req.user.id, stageKey, letter, job.project.monday_item_id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Storage confirm error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
