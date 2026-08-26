const express = require('express');
const router = express.Router({ mergeParams: true });
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function notifyClient(project, message) {
  try {
    if (!project.client_id) return;
    const { data: client } = await supabase.from('users').select('name, email').eq('id', project.client_id).single();
    if (!client?.email) return;
    const jobRef = [project.job_number, project.site_address].filter(Boolean).join(' — ') || project.name;
    await resend.emails.send({
      from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>',
      to: client.email,
      subject: `New message — ${jobRef}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#2A2B29;">New message</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.8;">Hi ${client.name},<br/><br/>You have a new message on <strong>${jobRef}</strong>:</p>
        <div style="background:#F3EAE5;padding:16px;border-radius:8px;color:#42453C;font-size:14px;">${message}</div>
        <a href="${process.env.FRONTEND_URL}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-top:16px;">Open portal →</a>
      </div>`
    });
  } catch (e) { console.error('Client message notification error:', e.message); }
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
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
