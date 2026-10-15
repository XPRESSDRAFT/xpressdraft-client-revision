const express = require('express');
const router = express.Router({ mergeParams: true });
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const { sendClientSms } = require('../utils/sms');

async function notifyClient(project, message) {
  try {
    if (!project.client_id) return;
    const { data: client } = await supabase.from('users').select('name, phone').eq('id', project.client_id).single();
    if (!client?.phone) return;
    const jobRef = [project.job_number, project.site_address].filter(Boolean).join(' — ') || project.name;
    await sendClientSms(client.phone, `Hi ${client.name}, you have a new message from your designer on ${jobRef}. Please check your Xpress Draft portal to read and reply. Sincerely, XPRESSDRAFT TEAM - No reply.`);
  } catch (e) { console.error('Client message notification error:', e.message); }
}

// Copies each contractor message onto the project's Monday item as an update, so the team can
// follow the conversation without opening the portal. It never names the contractor, and it
// never blocks or fails the chat: if Monday refuses it, it is only logged.
async function mirrorToMonday(itemId, text) {
  if (!itemId) return;
  try {
    const body = `Xpress Draft – contractor message\n\n${text}`;
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
      body: JSON.stringify({ query: `mutation { create_update(item_id: ${itemId}, body: ${JSON.stringify(body)}) { id } }` })
    });
    const data = await res.json();
    if (data?.errors?.length) throw new Error(data.errors[0].message);
  } catch (e) { console.error('Monday chat mirror error:', e.message); }
}

async function loadAcceptedJob(jobId, contractorId) {
  const { data: job } = await supabase
    .from('contractor_jobs').select(`*, project:projects(*)`)
    .eq('id', jobId).eq('contractor_id', contractorId).eq('status', 'accepted').single();
  return job;
}

router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    const job = await loadAcceptedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found' });

    const { data: messages } = await supabase
      .from('project_messages').select('*').eq('project_id', job.project.id).order('created_at', { ascending: true });
    await supabase.from('contractor_jobs').update({ messages_viewed_at: new Date().toISOString() }).eq('id', job.id);
    res.json({ messages: messages || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'contractor') return res.status(403).json({ error: 'Contractor only' });
    const job = await loadAcceptedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Accepted job not found' });
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });

    await supabase.from('project_messages').insert({
      project_id: job.project.id, sender_id: req.user.id, sender_role: 'contractor', message: message.trim()
    });
    await supabase.from('projects').update({ last_message_at: new Date().toISOString() }).eq('id', job.project.id);
    await notifyClient(job.project, message.trim());
    mirrorToMonday(job.project.monday_item_id, message.trim()); // not awaited: never slows the chat
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
