const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

const OVERALL_BOARD_ID = process.env.MONDAY_BOARD_ID;
const CONTRACTOR_COL = 'board_relation_mky4dh21';
const COL = { jobNumber: 'text_mm06wmkq', siteAddress: 'text_mky7ypsg' };

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}
async function addMondayNote(itemId, note) {
  await mondayApi(`mutation { create_update(item_id: ${itemId}, body: "${note}") { id } }`);
}
async function getContractorFromRelation(itemId) {
  const data = await mondayApi(`{
    items(ids: [${itemId}]) {
      column_values(ids: ["${CONTRACTOR_COL}"]) { ... on BoardRelationValue { linked_items { id name } } }
    }
  }`);
  const linked = data?.data?.items?.[0]?.column_values?.[0]?.linked_items;
  if (!linked || linked.length === 0) return null;
  const cId = linked[0].id;
  const cData = await mondayApi(`{
    items(ids: [${cId}]) { name column_values(ids: ["email_mkxzp1qw", "phone_mkxzazqw"]) { id text } }
  }`);
  const ci = cData?.data?.items?.[0];
  if (!ci) return null;
  const cols = {};
  ci.column_values.forEach(c => { cols[c.id] = c.text || ''; });
  return { name: ci.name, email: cols['email_mkxzp1qw'], phone: cols['phone_mkxzazqw'] };
}

// Fires the moment the contractor relation column changes on the Overall
// Projects board — independent of DELIVERY STATUS. This lets a contractor
// see the job (and its briefing) in their portal immediately on assignment,
// rather than only once the project reaches READY TO DELIVER.
router.post('/contractor-assigned', async (req, res) => {
  try {
    if (req.body.challenge) return res.json({ challenge: req.body.challenge });
    const event = req.body.event;
    if (!event) return res.json({ ok: true });
    const { pulseId, boardId } = event;

    const itemData = await mondayApi(`{
      items(ids: [${pulseId}]) { column_values(ids: ["${COL.jobNumber}", "${COL.siteAddress}"]) { id text } }
    }`);
    const cols = {};
    (itemData?.data?.items?.[0]?.column_values || []).forEach(c => { cols[c.id] = c.text || ''; });
    const jobNumber = cols[COL.jobNumber];
    const siteAddress = cols[COL.siteAddress];

    let { data: project } = await supabase
      .from('projects').select('*')
      .eq('monday_item_id', String(pulseId)).maybeSingle();
    if (!project && jobNumber) {
      const { data: byJobNumber } = await supabase
        .from('projects').select('*')
        .eq('job_number', jobNumber).ilike('site_address', `%${siteAddress || ''}%`).maybeSingle();
      project = byJobNumber;
    }
    if (!project) {
      console.error(`contractor-assigned: no project found for job ${jobNumber}`);
      await addMondayNote(pulseId, `⚠️ Xpress Draft Portal: Could not match this item to a portal project (job "${jobNumber}") when linking the contractor. Please check manually.`);
      return res.json({ ok: true });
    }

    const contractor = await getContractorFromRelation(pulseId);
    if (!contractor || !contractor.email) return res.json({ ok: true });

    let { data: contractorUser } = await supabase
      .from('users').select('*').eq('email', contractor.email.toLowerCase().trim()).single();
    if (!contractorUser) {
      const { data: newContractor } = await supabase
        .from('users')
        .insert({ name: contractor.name, email: contractor.email.toLowerCase().trim(), role: 'contractor', phone: contractor.phone || null })
        .select().single();
      contractorUser = newContractor;
    }
    if (!contractorUser) return res.json({ ok: true });

    await supabase.from('projects').update({
      contractor_id: contractorUser.id,
      is_working_partner: true,
      monday_item_id: String(pulseId),
    }).eq('id', project.id);

    const { data: existingJob } = await supabase
      .from('contractor_jobs').select('id')
      .eq('contractor_id', contractorUser.id).eq('project_id', project.id).maybeSingle();
    if (!existingJob) {
      await supabase.from('contractor_jobs').insert({ contractor_id: contractorUser.id, project_id: project.id, status: 'pending' });
      console.log(`Contractor ${contractor.name} assigned immediately to job ${jobNumber}`);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Contractor-assigned webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
