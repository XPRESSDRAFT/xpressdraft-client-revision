// Adds each project's CLIENT STAGE (PROSPECT / CLIENT / INACTIVE) for the
// admin and team views. It is read from the Clients board item linked to the
// project's Overall Projects item. The link column can also hold Team &
// Contractors items, so only items from the Clients board are used.
// Kept for ten minutes, because it changes rarely and the project list loads often.
const CLIENTS_BOARD_ID = '18388617547';
const CLIENT_LINK_COL = 'board_relation_mkxz40gy';
const CLIENT_STAGE_COL = 'color_mm83e03';
const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // monday item id -> { stage, at }

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

// Mutates and returns the list. Never throws: if Monday can't answer, the
// projects simply come back without a stage and the list still loads.
async function attachClientStages(projects) {
  try {
    const now = Date.now();
    const ids = [...new Set(projects.map(p => p.monday_item_id).filter(Boolean).map(String))];
    const need = ids.filter(id => !(cache.get(id) && now - cache.get(id).at < TTL_MS));
    for (let n = 0; n < need.length; n += 50) {
      const chunk = need.slice(n, n + 50);
      const d = await mondayApi(`{
        items(ids: [${chunk.join(',')}]) {
          id
          column_values(ids: ["${CLIENT_LINK_COL}"]) {
            ... on BoardRelationValue { linked_items { id board { id } column_values(ids: ["${CLIENT_STAGE_COL}"]) { id text } } }
          }
        }
      }`);
      (d?.data?.items || []).forEach(it => {
        const linked = (it.column_values?.[0]?.linked_items || []).filter(li => String(li.board?.id) === CLIENTS_BOARD_ID);
        const stage = linked[0]?.column_values?.find(c => c.id === CLIENT_STAGE_COL)?.text || null;
        cache.set(String(it.id), { stage, at: now });
      });
    }
  } catch (e) { console.error('attachClientStages error:', e.message); }
  // Always assign from the cache, even after a failure, so stages already known still show.
  projects.forEach(p => { p.clientStage = (p.monday_item_id && cache.get(String(p.monday_item_id))?.stage) || null; });
  return projects;
}

module.exports = { attachClientStages };
