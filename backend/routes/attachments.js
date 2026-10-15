const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const axios = require('axios');
const FormDataNode = require('form-data');
const { logInstructionEntry } = require('../utils/instructionsLog');
const { rehostMondayAsset } = require('../utils/mondayFileRehost');
const { sendAdminSms } = require('../utils/sms');
const { findMondayItemForProject } = require('../utils/projectMatch');

const INSTRUCTIONS_FILE_COL = 'file_mkzh1knp';
const OVERALL_BOARD_ID = process.env.MONDAY_BOARD_ID;

// Multer errors happen before the route handler runs, so without this a
// too-large file would crash with a raw error instead of a clear message.
function wrapUpload(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That file is too large (the limit is 50MB). Please email it to info@xpressdraft.com.au instead.' });
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      next();
    });
  };
}

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

async function uploadFileToMondayColumn(itemId, columnId, buffer, fileName, mimeType) {
  const form = new FormDataNode();
  form.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id column_values(ids: ["${columnId}"]) { value } } }`);
  form.append('variables', JSON.stringify({ file: null }));
  form.append('map', JSON.stringify({ file: ['variables.file'] }));
  form.append('file', buffer, { filename: fileName, contentType: mimeType, knownLength: buffer.length });
  const res = await axios.post('https://api.monday.com/v2/file', form, {
    headers: { 'Authorization': process.env.MONDAY_API_TOKEN, ...form.getHeaders() }
  });
  // Monday can answer 200 and still reject the file — surface that instead
  // of telling the user it worked.
  if (res.data?.errors?.length) throw new Error(res.data.errors[0].message || 'Monday rejected the file');
  return res.data;
}

// Lets anyone with access to a project (client, team, admin, or the
// assigned contractor) attach a general supporting file — reference
// photos, specs, anything outside the drawing/markup flow — straight to
// the project's Instructions file column on Monday. Logs it directly
// ourselves rather than depending on Monday's webhook, which has been
// confirmed unreliable for files added via the API.
router.post('/:projectId', auth, wrapUpload(upload.single('file')), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });

    const { data: project } = await supabase
      .from('projects').select('id, job_number, site_address, source_proposal_id, client_id, contractor_id, monday_item_id').eq('id', req.params.projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const hasAccess = req.user.role === 'admin' || req.user.role === 'team' ||
      (req.user.role === 'client' && project.client_id === req.user.id) ||
      (req.user.role === 'contractor' && project.contractor_id === req.user.id);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    if (!project.monday_item_id) {
      // A project created at engagement has no Monday link yet: find its item by SOURCE PROPOSAL ID,
      // then job number + address (exactly one match), rather than by job number alone.
      const found = await findMondayItemForProject(project);
      const foundItemId = found.itemId;
      if (foundItemId) {
        await supabase.from('projects').update({ monday_item_id: String(foundItemId) }).eq('id', project.id);
        project.monday_item_id = String(foundItemId);
      } else {
        await sendAdminSms(`File upload blocked: ${req.user.name} tried to share a file on ${project.job_number || project.id}, but no Monday item matches its job number. Check the Job Number on Monday.`);
        return res.status(400).json({ error: "We couldn't attach your file just yet because your project is still being set up on our side. We've let the team know. Please try again soon, or email the file to info@xpressdraft.com.au." });
      }
    }

    const uploadResult = await uploadFileToMondayColumn(project.monday_item_id, INSTRUCTIONS_FILE_COL, req.file.buffer, req.file.originalname, req.file.mimetype);
    try {
      const colVal = uploadResult?.data?.add_file_to_column?.column_values?.[0]?.value;
      const files = colVal ? (JSON.parse(colVal)?.files || []) : [];
      const newest = files[files.length - 1];
      if (newest) {
        const rehostedUrl = await rehostMondayAsset(newest.assetId, newest.name, project.id).catch(e => { console.error('Rehost error:', e.message); return null; });
        if (rehostedUrl) await logInstructionEntry(project.id, { source: req.user.role === 'client' ? 'client' : 'xpressdraft', content_type: 'file', file_name: newest.name, asset_id: String(newest.assetId), file_url: rehostedUrl });
      }
    } catch (logErr) { console.error('Instructions log error:', logErr.message); }

    res.json({ ok: true });
  } catch (err) {
    console.error('Attachment upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
