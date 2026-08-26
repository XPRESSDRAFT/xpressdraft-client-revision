const express = require('express');
const router = express.Router({ mergeParams: true });
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function notifyOtherParty(project, senderRole, message) {
  try {
    const recipients = [];
    if (senderRole !== 'client' && project.client_id) {
      const { data: client } = await supabase.from('users').select('name, email').eq('id', project.client_id).single();
      if (client?.email) recipients.push(client);
    }
    if (senderRole !== 'contractor' && project.contractor_id) {
      const { data: contractor } = await supabase.from('users').select('name, email').eq('id', project.contractor_id).single();
      if (contractor?.email) recipients.push(contractor);
    }
    const jobRef = [project.job_number, project.site_address].filter(Boolean).join(' — ') || project.name;
    for (const r of recipients) {
      await resend.emails.send({
        from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>',
        to: r.email,
        subject: `New message — ${jobRef}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
          <h2 style="color:#2A2B29;">New message</h2>
          <p style="color:#5E635B;font-size:15px;line-height:1.8;">Hi ${r.name},<br/><br/>You have a new message on <strong>${jobRef}</strong>:</p>
          <div style="background:#F3EAE5;padding:16px;border-radius:8px;color:#42453C;font-size:14px;">${message}</div>
          <a href="${process.env.FRONTEND_URL}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-top:16px;">Open portal →</a>
        </div>`
      });
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
