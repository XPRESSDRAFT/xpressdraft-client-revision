const express = require('express');
const router = express.Router({ mergeParams: true });
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const { sendClientSms } = require('../utils/sms');

async function notifyOtherParty(project, senderRole, message) {
  try {
    const jobRef = [project.job_number, project.site_address].filter(Boolean).join(' — ') || project.name;

    // Client recipient gets SMS instead of email — clients reliably have
    // a phone on file, and this reaches them faster than an inbox check.
    if (senderRole !== 'client' && project.client_id) {
      const { data: client } = await supabase.from('users').select('name, phone').eq('id', project.client_id).single();
      if (client?.phone) {
        await sendClientSms(client.phone, `Hi ${client.name}, you have a new message from your designer on ${jobRef}. Please check your Xpress Draft portal to read and reply. Sincerely, XPRESSDRAFT TEAM - No reply.`);
      }
    }
    // Contractor recipient gets SMS only — matches the client side,
    // replacing email entirely for this specific notification.
    if (senderRole !== 'contractor' && project.contractor_id) {
      const { data: contractor } = await supabase.from('users').select('name, phone').eq('id', project.contractor_id).single();
      if (contractor?.phone) {
        await sendClientSms(contractor.phone, `Hi ${contractor.name}, you have a new message from the client on ${jobRef}. Please check your Xpress Draft portal to read and reply.`);
      }
    }
  } catch (e) { console.error('Message notification error:', e.message); }
}

async function checkAccess(req, res) {
  const { data: project } = await supabase.from('projects').select('*').eq('id', req.params.projectId).single();
  if (!project) { res.status(404).json({ error: 'Project not found' }); return null; }
  if (req.user.role === 'admin') return project;
  if (req.user.role === 'client' && project.client_id === req.user.id) {
    const { data: acceptedJob } = await supabase.from('contractor_jobs').select('id')
      .eq('project_id', project.id).eq('status', 'accepted').maybeSingle();
    if (!acceptedJob) { res.status(403).json({ error: 'Chat is not yet available — your contractor has not accepted this job.' }); return null; }
    return project;
  }
  res.status(403).json({ error: 'Access denied' });
  return null;
}

router.get('/', auth, async (req, res) => {
  try {
    const project = await checkAccess(req, res);
    if (!project) return;
    const { data: messages } = await supabase
      .from('project_messages').select('*').eq('project_id', project.id).order('created_at', { ascending: true });
    if (req.user.role === 'client') await supabase.from('projects').update({ client_messages_viewed_at: new Date().toISOString() }).eq('id', project.id);
    res.json({ messages: messages || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const project = await checkAccess(req, res);
    if (!project) return;
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });

    await supabase.from('project_messages').insert({
      project_id: project.id, sender_id: req.user.id, sender_role: req.user.role, message: message.trim()
    });
    await supabase.from('projects').update({ last_message_at: new Date().toISOString() }).eq('id', project.id);
    await notifyOtherParty(project, req.user.role, message.trim());
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
