const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const { supabase } = require('../db');
const { auth, teamOnly } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/', auth, teamOnly, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });
    if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'File must be a PDF' });

    const { projectId } = req.params;

    const { data: project } = await supabase
      .from('projects').select('id').eq('id', projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const fileName = `${projectId}/${Date.now()}_${req.file.originalname.replace(/\s/g, '_')}`;
    const { error: uploadError } = await supabase.storage
      .from('drawings')
      .upload(fileName, req.file.buffer, { contentType: 'application/pdf', upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = await supabase.storage
      .from('drawings')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    const drawingName = req.file.originalname.replace('.pdf', '').replace(/_/g, ' ');

    const { data: drawing, error } = await supabase
      .from('drawings')
      .insert({ project_id: projectId, name: drawingName, file_path: fileName,
        file_url: urlData.signedUrl, uploaded_by: req.user.id })
      .select().single();

    if (error) throw error;
    res.status(201).json({ drawing });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload drawing' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { projectId } = req.params;

    if (req.user.role === 'client') {
      const { data: project } = await supabase
        .from('projects').select('client_id').eq('id', projectId).single();
      if (!project || project.client_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { data, error } = await supabase
      .from('drawings')
      .select(`*, comments(id, type, status, pin_x, pin_y,
        author:users(name, role),
        replies(id, created_at, author:users(name, role)))`)
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: true });

    if (error) throw error;

    const drawings = await Promise.all(data.map(async d => {
      const { data: urlData } = await supabase.storage
        .from('drawings').createSignedUrl(d.file_path, 60 * 60 * 2);
      return { ...d, file_url: urlData?.signedUrl || d.file_url };
    }));

    res.json({ drawings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drawings' });
  }
});

router.delete('/:drawingId', auth, teamOnly, async (req, res) => {
  try {
    const { data: drawing } = await supabase
      .from('drawings').select('file_path').eq('id', req.params.drawingId).single();
    if (!drawing) return res.status(404).json({ error: 'Drawing not found' });

    await supabase.storage.from('drawings').remove([drawing.file_path]);
    await supabase.from('drawings').delete().eq('id', req.params.drawingId);

    res.json({ message: 'Drawing deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete drawing' });
  }
});

module.exports = router;
