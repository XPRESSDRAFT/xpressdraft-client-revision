const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const axios = require('axios');
const FormDataNode = require('form-data');

const INSTRUCTIONS_FILE_COL = 'file_mkzh1knp';

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

// Lets anyone with access to a project (client, team, admin, or the
// assigned contractor) attach a general supporting file — reference
// photos, specs, anything outside the drawing/markup flow — straight to
// the project's Instructions file column on Monday. Since this is the
// same column the instructions-updated webhook watches, the upload is
// automatically logged in the project's history and the assigned
// contractor gets notified, with no extra wiring needed here.
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

    await uploadFileToMondayColumn(project.monday_item_id, INSTRUCTIONS_FILE_COL, req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ ok: true });
  } catch (err) {
    console.error('Attachment upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
