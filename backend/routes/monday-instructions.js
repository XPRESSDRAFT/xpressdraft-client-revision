const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

const COL = {
  instructionsText: 'text_mkzg2e0',
  instructionsFile: 'file_mkzh1knp',
  jobNumber: 'text_mm06wmkq',
  siteAddress: 'text_mky7ypsg',
  revision: 'color_mky4x01c',
};

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

async function findProject(pulseId) {
  let { data: project } = await supabase
    .from('projects').select('id').eq('monday_item_id', String(pulseId)).maybeSingle();
  if (project) return project;
  const data = await mondayApi(`{
    items(ids: [${pulseId}]) { column_values(ids: ["${COL.jobNumber}", "${COL.siteAddress}"]) { id text } }
  }`);
  const cols = {};
  (data?.data?.items?.[0]?.column_values || []).forEach(c => { cols[c.id] = c.text || ''; });
  if (!cols[COL.jobNumber]) return null;
  const { data: byJobNumber } = await supabase
    .from('projects').select('id')
    .eq('job_number', cols[COL.jobNumber]).ilike('site_address', `%${cols[COL.siteAddress] || ''}%`).maybeSingle();
  return byJobNumber;
}

// Fires whenever the Instructions text or file column changes on Monday.
// Each real change (non-empty text, or a file not seen before) is logged
// as its own history row rather than overwriting the last one, since
// Xpress Draft manually clears/replaces these columns each time.
router.post('/instructions-updated', async (req, res) => {
  try {
    if (req.body.challenge) return res.json({ challenge: req.body.challenge });
    const event = req.body.event;
    if (!event) return res.json({ ok: true });
    const { pulseId } = event;

    const project = await findProject(pulseId);
    if (!project) { console.error(`instructions-updated: no project found for item ${pulseId}`); return res.json({ ok: true }); }

    const data = await mondayApi(`{
      items(ids: [${pulseId}]) {
        column_values(ids: ["${COL.instructionsText}", "${COL.instructionsFile}", "${COL.revision}"]) { id text value }
      }
    }`);
    const cols = {};
    (data?.data?.items?.[0]?.column_values || []).forEach(c => { cols[c.id] = c; });
    const revisionLabel = cols[COL.revision]?.text || '';
    const textVal = (cols[COL.instructionsText]?.text || '').trim();
    let changed = false;

    if (textVal) {
      await supabase.from('job_instructions').insert({
        project_id: project.id, source: 'xpressdraft', content_type: 'text', content: textVal, revision_label: revisionLabel
      });
      changed = true;
    }

    let files = [];
    try { files = JSON.parse(cols[COL.instructionsFile]?.value || '{}')?.files || []; } catch (e) {}
    for (const f of files) {
      const { data: existing } = await supabase
        .from('job_instructions').select('id').eq('project_id', project.id).eq('asset_id', String(f.assetId)).maybeSingle();
      if (existing) continue;
      await supabase.from('job_instructions').insert({
        project_id: project.id, source: 'xpressdraft', content_type: 'file',
        file_name: f.name, asset_id: String(f.assetId), revision_label: revisionLabel,
        file_url: `https://xpressdraft.monday.com/protected_static/10128130/resources/${f.assetId}/${f.name}`
      });
      changed = true;
    }

    if (changed) await supabase.from('projects').update({ last_instructions_at: new Date().toISOString() }).eq('id', project.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Instructions-updated webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
