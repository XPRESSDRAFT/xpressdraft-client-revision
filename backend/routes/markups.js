const express = require('express');
const router = express.Router({ mergeParams: true });
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('markups')
      .select('*, author:users(id, name, role)')
      .eq('drawing_id', req.params.drawingId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ markups: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch markups' });
  }
});

router.put('/', auth, async (req, res) => {
  try {
const { paths, page = 1, canvasWidth = 0, canvasHeight = 0 } = req.body;
    if (!paths) return res.status(400).json({ error: 'Paths required' });

    const markupLayer = req.user.role === 'team' ? 'team' : 'client';

    const { data: existing } = await supabase
      .from('markups').select('id')
      .eq('drawing_id', req.params.drawingId)
      .eq('author_id', req.user.id)
      .eq('page', page).single();

    let data, error;
    if (existing) {
      ({ data, error } = await supabase
.from('markups').update({ paths, page, canvas_width: canvasWidth, canvas_height: canvasHeight, updated_at: new Date().toISOString() })
        .eq('id', existing.id).select().single());
    } else {
      ({ data, error } = await supabase
        .from('markups').insert({
          drawing_id: req.params.drawingId,
          author_id: req.user.id,
          paths, page, layer: markupLayer, canvas_width: canvasWidth, canvas_height: canvasHeight
        }).select().single());
    }

    if (error) throw error;
    res.json({ markup: data });
  } catch (err) {
    console.error('Save markup error:', err);
    res.status(500).json({ error: 'Failed to save markup' });
  }
});

module.exports = router;
