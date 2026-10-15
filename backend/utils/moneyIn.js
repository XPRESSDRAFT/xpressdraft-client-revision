const { supabase } = require('../db');
const { sendAdminSms } = require('./sms');

const MONEY_IN_BOARD_ID = '18388611262';
const COL = {
  paymentType:  'color_mm83rtc7',   // PAYMENT TYPE (monday files the row into its group from this)
  amountExGst:  'numeric_mkxzma79', // Payment = ex GST
  amountIncGst: 'numeric_mkxz5z2j', // Pay + GST = incl. GST
  dateReceived: 'date_mkxzbpss',
  jobTag:       'tag_mkxz9v9m',
};
const PROJECT_TYPE_COL = 'color_mky7m0zk'; // Overall Projects: STANDARD JOB / AS CONSTRUCTED / VARIATION

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
  if (r?.errors?.length) throw new Error(r.errors[0].message || 'Monday refused the request');
  return r;
}
const round2 = n => Math.round(n * 100) / 100;
// Date Received is a calendar date in the owner's time zone, not UTC.
const brisbaneToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' });

async function findOrCreateTagId(name) {
  if (!name) return null;
  try {
    const d = await mondayApi('{ tags { id name } }');
    const hit = (d?.data?.tags || []).find(t => (t.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (hit) return hit.id;
    const c = await mondayApi(`mutation { create_or_get_tag(tag_name: ${JSON.stringify(name)}, board_id: ${MONEY_IN_BOARD_ID}) { id } }`);
    return c?.data?.create_or_get_tag?.id || null;
  } catch (e) { return null; }
}

async function readProjectType(itemId) {
  if (!itemId) return '';
  const d = await mondayApi(`{ items(ids: [${itemId}]) { column_values(ids: ["${PROJECT_TYPE_COL}"]) { text } } }`);
  return d?.data?.items?.[0]?.column_values?.[0]?.text || '';
}

// Which payment link a payment came from tells us its type, and the
// delivery record stores that link. PARTIAL PAYMENT -> PR DELIVERY 40%;
// VARIATION LINK -> VARIATION FEE; FINAL PAYMENT -> WD DELIVERY 40% on a
// STANDARD JOB, or FINAL 80% on an AS CONSTRUCTED / VARIATION job.
// Anything unclear is UNMATCHED (and the owner is told), never guessed.
async function decidePaymentType(project, paymentLink) {
  const { data: rows } = await supabase.from('deliveries').select('delivery_type')
    .eq('project_id', project.id).eq('variation_link', paymentLink);
  const kinds = new Set((rows || []).map(r =>
    r.delivery_type === 'pr_first_payment' ? 'PR'
    : r.delivery_type === 'variation_payment' ? 'VAR'
    : /^wd_(first|final)_payment$/.test(r.delivery_type || '') ? 'WD' : 'OTHER'));
  if (kinds.size === 0) return { label: 'UNMATCHED', reason: 'could not tell which payment link this came from' };
  if (kinds.size > 1 || kinds.has('OTHER')) return { label: 'UNMATCHED', reason: 'this payment link was used for more than one kind of delivery' };
  const kind = [...kinds][0];
  if (kind === 'PR') return { label: 'PR DELIVERY 40%' };
  if (kind === 'VAR') return { label: 'VARIATION FEE' };
  const projectType = await readProjectType(project.monday_item_id);
  if (/standard/i.test(projectType)) return { label: 'WD DELIVERY 40%' };
  if (/as.?constructed|variation/i.test(projectType)) return { label: 'FINAL 80%' };
  return { label: 'UNMATCHED', reason: `FINAL PAYMENT link, but the Project Type is "${projectType || 'blank'}"` };
}

// Writes one Money In row for a confirmed Stripe payment. One row per
// Stripe payment ID (checked first, recorded after), always with Date
// Received and Pay + GST because turnover is counted from those two
// columns. Never throws: if anything fails the owner is texted so the row
// can be added by hand, and Stripe is not made to retry.
async function recordMoneyIn({ project, clientName, session, paymentLink }) {
  const paymentId = session.payment_intent || session.id;
  const jobNumber = project.job_number || project.name;
  let incl = null;
  try {
    const { data: already } = await supabase.from('stripe_payments').select('payment_id').eq('payment_id', paymentId).maybeSingle();
    if (already) return { duplicate: true };
    if (!session.amount_total) throw new Error('Stripe did not report an amount');

    incl = round2(session.amount_total / 100);
    const tax = (session.total_details?.amount_tax || 0) / 100;
    const ex = tax > 0 ? round2(incl - tax) : round2(incl / 1.1); // GST is 10%
    const decided = await decidePaymentType(project, paymentLink);
    const name = `${clientName} - ${jobNumber} - ${decided.label}`;
    const tagId = await findOrCreateTagId(jobNumber);
    const values = {
      [COL.paymentType]: { label: decided.label },
      [COL.amountExGst]: ex,
      [COL.amountIncGst]: incl,
      [COL.dateReceived]: { date: brisbaneToday() },
      ...(tagId ? { [COL.jobTag]: { tag_ids: [Number(tagId)] } } : {}),
    };
    const created = await run(`mutation { create_item(board_id: ${MONEY_IN_BOARD_ID}, item_name: ${JSON.stringify(name)}, column_values: ${JSON.stringify(JSON.stringify(values))}) { id } }`);
    const itemId = created?.data?.create_item?.id;
    if (!itemId) throw new Error('Monday did not return the new item');

    const note = `Stripe payment ID: ${paymentId}\nRecorded automatically by the portal.${decided.reason ? `\n⚠️ ${decided.reason}` : ''}`;
    try { await run(`mutation { create_update(item_id: ${itemId}, body: ${JSON.stringify(note)}) { id } }`); } catch (e) { console.error('Money In note failed:', e.message); }

    await supabase.from('stripe_payments').insert({
      payment_id: paymentId, project_id: project.id, money_in_item_id: String(itemId), payment_type: decided.label, amount_incl_gst: incl,
    });
    if (decided.label === 'UNMATCHED') {
      await sendAdminSms(`⚠️ Payment of $${incl} for ${jobNumber} was recorded on Money In as UNMATCHED (${decided.reason}). Please set its payment type.`);
    }
    return { itemId, label: decided.label };
  } catch (e) {
    console.error('recordMoneyIn failed:', e.message);
    await sendAdminSms(`⚠️ Payment${incl !== null ? ` of $${incl}` : ''} received for ${jobNumber}, but the Money In row FAILED (${e.message}). Please add it by hand. Stripe ID ${paymentId}.`);
    return { failed: true };
  }
}

module.exports = { recordMoneyIn, decidePaymentType };
