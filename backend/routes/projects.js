const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth, teamOnly } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    let query = supabase
      .from('projects')
      .select(`*, client:users!projects_client_id_fkey(id, name, email),
        drawings(id, name, file_url, uploaded_at, comments(id, status, replies(id))),
        revisions(id, stage, revision_number, is_bonus, confirmed_at)`)
      .order('created_at', { ascending: false });

    if (req.user.role === 'client') {
      query = query.eq('client_id', req.user.id);
    } else if (req.user.role === 'contractor') {
      query = query.eq('contractor_id', req.user.id);
    } else if (req.user.role === 'team') {
      query = query.eq('assigned_to', req.user.id);
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

router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'team') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { name, description, stage, clientId, jobNumber, siteAddress, contractorId, assignedTo } = req.body;
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
        contractor_id: contractorId || null,
        assigned_to: assignedTo || null,
        created_by: req.user.id
      })
      .select(`*, client:users!projects_client_id_fkey(id, name, email)`)
      .single();

    if (error) throw error;

    // New project created with a contractor already assigned — make sure a
    // contractor_jobs row exists so it shows up in their portal.
    if (data.contractor_id) {
      await ensureContractorJob(data.id, data.contractor_id);
    }

    res.status(201).json({ project: { ...data, revisionSummary: buildRevisionSummary(data.stage, []) } });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Admin-only backfill: scans every project that has a contractor_id set and
// makes sure a matching contractor_jobs row exists, creating one (status
// 'pending') where it's missing. Covers assignments made before the
// auto-create logic below existed, or any other gap. Safe to run repeatedly.
router.post('/sync-contractor-jobs', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { data: assignedProjects, error } = await supabase
      .from('projects')
      .select('id, contractor_id, job_number, name')
      .not('contractor_id', 'is', null);
    if (error) throw error;

    let created = 0;
    let alreadyLinked = 0;
    const results = [];

    for (const p of (assignedProjects || [])) {
      const before = await supabase
        .from('contractor_jobs')
        .select('id')
        .eq('project_id', p.id)
        .eq('contractor_id', p.contractor_id)
        .maybeSingle();

      if (before.data) {
        alreadyLinked++;
        continue;
      }

      const job = await ensureContractorJob(p.id, p.contractor_id);
      if (job) {
        created++;
        results.push({ projectId: p.id, jobNumber: p.job_number, name: p.name });
      }
    }

    res.json({ scanned: (assignedProjects || []).length, created, alreadyLinked, results });
  } catch (err) {
    console.error('Sync contractor jobs error:', err);
    res.status(500).json({ error: 'Failed to sync contractor jobs' });
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
    if (req.user.role === 'contractor' && data.contractor_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'team' && data.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stageRevisions = (data.revisions || []).filter(r => r.stage === data.stage);
    res.json({ project: { ...data, revisionSummary: buildRevisionSummary(data.stage, stageRevisions) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'team') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { name, description, stage, clientId, jobNumber, siteAddress, contractorId, assignedTo } = req.body;

    // Grab the current contractor_id before overwriting it, so we know
    // whether this update is actually assigning a *new* contractor.
    const { data: existingProject } = await supabase
      .from('projects').select('contractor_id').eq('id', req.params.id).single();
    const previousContractorId = existingProject?.contractor_id || null;

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (stage !== undefined) updates.stage = stage;
    if (clientId !== undefined) updates.client_id = clientId;
    if (jobNumber !== undefined) updates.job_number = jobNumber;
    if (siteAddress !== undefined) updates.site_address = siteAddress;
    if (contractorId !== undefined) updates.contractor_id = contractorId;
    if (assignedTo !== undefined) updates.assigned_to = assignedTo;

    const { data, error } = await supabase
      .from('projects').update(updates).eq('id', req.params.id)
      .select(`*, client:users!projects_client_id_fkey(id, name, email)`).single();
    if (error) throw error;

    // If a contractor was newly assigned (or changed) via this update,
    // make sure a contractor_jobs row exists for them on this project —
    // otherwise they'd never see it in their portal. The previous
    // contractor's job row (if any) is left untouched as history.
    if (contractorId !== undefined && contractorId && contractorId !== previousContractorId) {
      await ensureContractorJob(req.params.id, contractorId);
    }

    res.json({ project: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete projects' });
    }
    const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.post('/:id/bonus-revision', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'team') {
      return res.status(403).json({ error: 'Access denied' });
    }
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

// Ensures a contractor_jobs row exists linking this contractor to this
// project. Used whenever a contractor is assigned outside the normal
// Proposals-board webhook flow (e.g. manually via the Edit Project modal,
// on project creation, or via the sync endpoint) so the assignment actually
// surfaces in the contractor's portal. Safe to call repeatedly — does
// nothing if a row for this exact project+contractor pair already exists.
async function ensureContractorJob(projectId, contractorId) {
  try {
    const { data: existingJob } = await supabase
      .from('contractor_jobs')
      .select('id')
      .eq('project_id', projectId)
      .eq('contractor_id', contractorId)
      .maybeSingle();

    if (existingJob) return existingJob;

    const { data: newJob, error } = await supabase
      .from('contractor_jobs')
      .insert({ project_id: projectId, contractor_id: contractorId, status: 'pending' })
      .select().single();

    if (error) throw error;
    return newJob;
  } catch (err) {
    console.error('ensureContractorJob error:', err.message);
    return null;
  }
}

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
