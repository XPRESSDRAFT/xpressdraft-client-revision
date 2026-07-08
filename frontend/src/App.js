const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth, teamOnly } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = supabase
      .from('projects')
      .select(`*, client:users!projects_client_id_fkey(id, name, email),
        drawings(id, name, uploaded_at, comments(id, status, replies(id))),
        revisions(id, stage, revision_number, is_bonus, confirmed_at)`)
      .order('created_at', { ascending: false });

    if (req.user.role === 'client') {
      query = query.eq('client_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const projects = data.map(p => ({
      ...p,
      revisionSummary: buildRevisionSummary(p.stage, p.revisions || [])
    }));

    res.json({ projects });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.post('/', auth, teamOnly, async (req, res) => {
  try {
    const { name, description, stage, clientId, jobNumber, siteAddress } = req.body;
    if (!name || !stage) return res.status(400).json({ error: 'Name and stage required' });
    if (!['preliminary', 'working_drawings'].includes(stage)) {
      return res.status(400).json({ error: 'Stage must be preliminary or working_drawings' });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name, description, stage,
        client_id: clientId || null,
        job_number: jobNumber || null,
        site_address: siteAddress || null,
        created_by: req.user.id
      })
      .select(`*, client:users!projects_client_id_fkey(id, name, email)`)
      .single();

    if (error) throw error;
    res.status(201).json({ project: { ...data, revisionSummary: buildRevisionSummary(data.stage, []) } });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select(`*, client:users!projects_client_id_fkey(id, name, email),
        drawings(*, comments(*, author:users(id, name, role), replies(*, author:users(id, name, role)))),
        revisions(*)`)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role === 'client' && data.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stageRevisions = (data.revisions || []).filter(r => r.stage === data.stage);
    res.json({ project: { ...data, revisionSummary: buildRevisionSummary(data.stage, stageRevisions) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.put('/:id', auth, teamOnly, async (req, res) => {
  try {
    const { name, description, stage, clientId, jobNumber, siteAddress } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (stage !== undefined) updates.stage = stage;
    if (clientId !== undefined) updates.client_id = clientId;
    if (jobNumber !== undefined) updates.job_number = jobNumber;
    if (siteAddress !== undefined) updates.site_address = siteAddress;

    const { data, error } = await supabase
      .from('projects').update(updates).eq('id', req.params.id)
      .select(`*, client:users!projects_client_id_fkey(id, name, email)`).single();
    if (error) throw error;
    res.json({ project: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', auth, teamOnly, async (req, res) => {
  try {
    const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.post('/:id/bonus-revision', auth, teamOnly, async (req, res) => {
  try {
    const { data: project } = await supabase
      .from('projects').select('*').eq('id', req.params.id).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { data: existing } = await supabase
      .from('revisions').select('revision_number').eq('project_id', req.params.id)
      .eq('stage', project.stage).order('revision_number', { ascending: false }).limit(1);

    const nextNum = (existing?.[0]?.revision_number || 0) + 1;

    const { data, error } = await supabase
      .from('revisions')
      .insert({ project_id: req.params.id, stage: project.stage, revision_number: nextNum, is_bonus: true, confirmed_by: req.user.id })
      .select().single();

    if (error) throw error;
    res.json({ revision: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to grant bonus revision' });
  }
});

router.post('/:id/markup-export', auth, async (req, res) => {
  try {
    const { exportNum } = req.body;
    await supabase.from('projects').update({ markup_export_count: exportNum }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update export count' });
  }
});

function buildRevisionSummary(stage, revisions) {
  const freeAllowed = stage === 'preliminary' ? 2 : 1;
  const stageLabel = stage === 'preliminary' ? 'PR' : 'WD';
  const bonusGranted = revisions.filter(r => r.is_bonus).length;
  const used = revisions.filter(r => !r.is_bonus).length;
  const totalAllowed = freeAllowed + bonusGranted;
  return {
    stage, stageLabel, used, freeAllowed, bonusGranted, totalAllowed,
    remaining: Math.max(0, totalAllowed - used),
    overAllowance: used > totalAllowed,
    displayText: `${stageLabel}: ${used} of ${totalAllowed}`
  };
}

module.exports = router;
