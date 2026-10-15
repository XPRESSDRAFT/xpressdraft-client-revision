const { supabase } = require('../db');
const { sendAdminSms } = require('./sms');

const OVERALL_BOARD_ID = process.env.MONDAY_BOARD_ID;
const COL = { jobNumber: 'text_mm06wmkq', siteAddress: 'text_mky7ypsg', sourceProposal: 'text_mm83tq9f' };

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

// ---------------------------------------------------------------------
// Addresses are compared word by word, not as raw text, so "16 Ridgeway
// Avenue, Southport, Qld 4169, Australia" matches "16 Ridgeway Ave
// Southport" — but "16 Ridgeway Ave" never matches "116 Ridgeway Ave".
// ---------------------------------------------------------------------
const ABBREVIATIONS = {
  avenue: 'ave', av: 'ave', street: 'st', road: 'rd', drive: 'dr', court: 'ct', place: 'pl',
  crescent: 'cres', cr: 'cres', lane: 'ln', terrace: 'tce', parade: 'pde', boulevard: 'blvd',
  circuit: 'cct', close: 'cl', highway: 'hwy', mount: 'mt',
};
const DROP = new Set(['australia', 'qld', 'queensland', 'nsw', 'vic', 'act', 'tas', 'nt', 'sa', 'wa', 'unit', 'apt', 'apartment']);

function addressTokens(addr) {
  return String(addr || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(Boolean).map(t => ABBREVIATIONS[t] || t).filter(t => !DROP.has(t));
}
// Same words in the same order from the start; one side may carry extra
// trailing words (suburb, postcode). Very short addresses must match exactly.
function addressesMatch(a, b) {
  const ta = addressTokens(a), tb = addressTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length < 3) return ta.join(' ') === tb.join(' ');
  return short.every((t, i) => long[i] === t);
}

// ---------------------------------------------------------------------
// Monday item  ->  portal project.
//   1. the project already linked to this exact Monday item
//   2. SOURCE PROPOSAL ID (the Proposals item ID; never shared by clients)
//   3. job number + site address, ONLY when exactly one project matches
// Never "the first match". A project already tied to a different proposal
// is never reused. Returns { project, how } or { project: null, reason }.
// When it found the project by 2 or 3, it also links the Monday item to it.
// ---------------------------------------------------------------------
async function findProjectForMondayItem({ pulseId, sourceProposalId, jobNumber, siteAddress, select = '*', link = true }) {
  let result = { project: null, reason: 'none' };

  if (pulseId) {
    const { data } = await supabase.from('projects').select(select).eq('monday_item_id', String(pulseId)).limit(2);
    if (data && data.length === 1) return { project: data[0], how: 'linked item' };
    if (data && data.length > 1) return { project: null, reason: 'several', how: 'linked item' };
  }
  if (sourceProposalId) {
    const { data } = await supabase.from('projects').select(select).eq('source_proposal_id', String(sourceProposalId)).limit(2);
    if (data && data.length === 1) result = { project: data[0], how: 'proposal id' };
    else if (data && data.length > 1) return { project: null, reason: 'several', how: 'proposal id' };
  }
  if (!result.project && jobNumber && siteAddress) {
    const { data } = await supabase.from('projects').select(select).eq('job_number', jobNumber);
    const hits = (data || []).filter(p => addressesMatch(p.site_address, siteAddress))
      .filter(p => !sourceProposalId || !p.source_proposal_id || p.source_proposal_id === String(sourceProposalId));
    if (hits.length === 1) result = { project: hits[0], how: 'job number + address' };
    else if (hits.length > 1) return { project: null, reason: 'several', how: 'job number + address' };
  }

  if (link && result.project && pulseId && result.how !== 'linked item') {
    // A proposal-ID match is certain, so it may replace a stale link (a recreated item).
    // A job-number match is less certain, so it only fills an empty link.
    if (result.how === 'proposal id' || !result.project.monday_item_id) {
      await supabase.from('projects').update({ monday_item_id: String(pulseId) }).eq('id', result.project.id);
      result.project.monday_item_id = String(pulseId);
    }
  }
  return result;
}

// ---------------------------------------------------------------------
// Portal project  ->  Monday Overall Projects item (for a project that has
// no link yet). Same rules: SOURCE PROPOSAL ID first, then job number +
// address with exactly one match. Returns { itemId, how } or { itemId: null, reason }.
// ---------------------------------------------------------------------
async function findMondayItemForProject(project) {
  const search = async (columnId, value) => {
    const data = await mondayApi(`{
      boards(ids: [${OVERALL_BOARD_ID}]) {
        items_page(query_params: {rules: [{column_id: "${columnId}", compare_value: [${JSON.stringify(String(value))}], operator: any_of}]}) {
          items { id column_values(ids: ["${COL.siteAddress}", "${COL.sourceProposal}"]) { id text } }
        }
      }
    }`);
    return (data?.data?.boards?.[0]?.items_page?.items || []).map(it => {
      const cols = {}; it.column_values.forEach(c => { cols[c.id] = c.text || ''; });
      return { id: it.id, address: cols[COL.siteAddress], source: cols[COL.sourceProposal] };
    });
  };
  try {
    if (project.source_proposal_id) {
      const items = await search(COL.sourceProposal, project.source_proposal_id);
      if (items.length === 1) return { itemId: items[0].id, how: 'proposal id' };
      if (items.length > 1) return { itemId: null, reason: 'several' };
    }
    if (project.job_number && project.site_address) {
      const items = await search(COL.jobNumber, project.job_number);
      const hits = items.filter(it => addressesMatch(project.site_address, it.address))
        .filter(it => !it.source || !project.source_proposal_id || it.source === String(project.source_proposal_id));
      if (hits.length === 1) return { itemId: hits[0].id, how: 'job number + address' };
      if (hits.length > 1) return { itemId: null, reason: 'several' };
    }
  } catch (e) { console.error('findMondayItemForProject error:', e.message); }
  return { itemId: null, reason: 'none' };
}

// Texts the owner about an unmatched item, at most once an hour per key,
// because Monday webhooks can fire several times for one change.
const alerted = new Map();
async function alertOnce(key, message) {
  const last = alerted.get(key);
  if (last && Date.now() - last < 60 * 60 * 1000) return;
  alerted.set(key, Date.now());
  try { await sendAdminSms(message); } catch (e) { console.error('alertOnce error:', e.message); }
}

module.exports = { addressesMatch, findProjectForMondayItem, findMondayItemForProject, alertOnce };
