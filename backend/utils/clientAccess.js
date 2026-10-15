const { supabase } = require('../db');

const BOARD_ID = process.env.MONDAY_BOARD_ID;
const DELIVERY_STATUS_COL = 'color_mm64ffyg';
const AWAITING_CLIENT_GROUP = 'group_mkzqbpx4';

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}
// Monday answers HTTP 200 even when it refuses a change, so check the body.
async function run(query) {
  const r = await mondayApi(query);
  if (r?.errors?.length) throw new Error(r.errors[0].message || 'Monday refused the change');
  return r;
}

// Called when a client opens a drawing. The first open after each delivery:
//   - DELIVERY STATUS  READY TO DELIVER / PAID  ->  UNDER REVIEW
//   - item moves to the AWAITING CLIENT group
// Until then none of that happens, which is how the team can see at a
// glance that the client hasn't looked yet. Later opens do nothing.
async function recordClientAccess(projectId, clientId) {
  const { data: p } = await supabase
    .from('projects').select('client_id, locked, delivered_at, client_accessed_at, monday_item_id').eq('id', projectId).single();
  if (!p || p.client_id !== clientId) return;       // only the project's own client counts
  if (p.locked || !p.delivered_at || !p.monday_item_id) return; // nothing delivered, still locked, or no Monday item
  if (p.client_accessed_at && new Date(p.client_accessed_at) >= new Date(p.delivered_at)) return; // already counted

  // Claim it first, so two quick requests can't both fire the Monday writes.
  const claim = supabase.from('projects').update({ client_accessed_at: new Date().toISOString() }).eq('id', projectId);
  const { data: claimed } = await (p.client_accessed_at
    ? claim.eq('client_accessed_at', p.client_accessed_at)
    : claim.is('client_accessed_at', null)).select('id');
  if (!claimed || claimed.length === 0) return;

  try {
    const cur = await mondayApi(`{ items(ids: [${p.monday_item_id}]) { column_values(ids: ["${DELIVERY_STATUS_COL}"]) { text } } }`);
    const status = cur?.data?.items?.[0]?.column_values?.[0]?.text || '';
    // Only move the status on from READY TO DELIVER / PAID, never overwrite anything else.
    if (/ready to deliver|paid/i.test(status)) {
      await run(`mutation { change_column_value(board_id: ${BOARD_ID}, item_id: ${p.monday_item_id}, column_id: "${DELIVERY_STATUS_COL}", value: ${JSON.stringify(JSON.stringify({ label: 'UNDER REVIEW' }))}) { id } }`);
    }
    await run(`mutation { move_item_to_group(item_id: ${p.monday_item_id}, group_id: "${AWAITING_CLIENT_GROUP}") { id } }`);
  } catch (e) {
    console.error('recordClientAccess failed, will retry on the next open:', e.message);
    await supabase.from('projects').update({ client_accessed_at: p.client_accessed_at || null }).eq('id', projectId);
  }
}

module.exports = { recordClientAccess };
