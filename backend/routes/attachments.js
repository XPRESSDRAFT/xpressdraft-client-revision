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

const INSTRUCTIONS_FILE_COL = 'file_mkzh1knp';

async function uploadFileToMondayColumn(itemId, columnId, buffer, fileName, mimeType) {
  const form = new FormDataNode();
  form.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) { id column_values(ids: ["${columnId}"]) { value } } }`);
  form.append('variables', JSON.stringify({ file: null }));
  form.append('map', JSON.stringify({ file: ['variables.file'] }));
  form.append('file', buffer, { filename: fileName, contentType: mimeType, knownLength: buffer.length });
  const res = await axios.post('https://api.monday.com/v2/file', form, {
    headers: { 'Authorization': process.env.MONDAY_API_TOKEN, ...form.getHeaders() }
  });
  return res.data;
}

// Lets anyone with access to a project (client, team, admin, or the
// assigned contractor) attach a general supporting file — reference
// photos, specs, anything outside the drawing/markup flow — straight to
// the project's Instructions file column on Monday. Logs it directly
// ourselves rather than depending on Monday's webhook, which has been
// confirmed unreliable for files added via the API.
router.post('/:projectId', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File required' });

    const { data: project } = await supabase
      .from('projects').select('id, client_id, contractor_id, monday_item_id').eq('id', req.params.projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const hasAccess = req.user.role === 'admin' || req.user.role === 'team' ||
      (req.user.role === 'client' && project.client_id === req.user.id) ||
      (req.user.role === 'contractor' && project.contractor_id === req.user.id);
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    if (!project.monday_item_id) return res.status(400).json({ error: 'This project is not yet linked to Monday.' });

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
