const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Resend } = require('resend');
const { supabase } = require('../db');
const { auth, teamOnly } = require('../middleware/auth');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(to, subject, html) {
  const { error } = await resend.emails.send({
    from: 'Xpress Draft <onboarding@resend.dev>',
    to,
    subject,
    html,
  });
  if (error) throw new Error(error.message);
}

router.post('/', auth, teamOnly, async (req, res) => {
  try {
    const { name, email, role = 'client', sendInvite = false } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

    const { data: existing } = await supabase
      .from('users').select('id').eq('email', email.toLowerCase().trim()).single();
    if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

    const { data: user, error } = await supabase
      .from('users')
      .insert({ name, email: email.toLowerCase().trim(), role })
      .select().single();

    if (error) throw error;

    if (sendInvite) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await supabase.from('magic_links').insert({
        email: user.email, token, expires_at: expiresAt.toISOString()
      });
      const loginUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;
      await sendEmail(
        user.email,
        'Your plans are ready — Xpress Draft',
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
          <h2 style="color:#2A2B29;">Your plans are ready to review</h2>
          <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:32px">
            Hi ${name},<br/><br/>
            Your drawings are ready for review on the Xpress Draft client portal.
            Click below to access your plans. This link is valid for 48 hours.
          </p>
          <a href="${loginUrl}" style="display:inline-block;background:#EA672F;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">
            Review my plans →
          </a>
          <p style="color:#A9A09B;font-size:13px;margin-top:32px;">
            Questions? Contact us at info@xpressdraft.com.au
          </p>
        </div>`
      );
    }

    res.status(201).json({ user });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: err.message || 'Failed to create user' });
  }
});

router.get('/', auth, teamOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users').select('id, name, email, role, created_at')
      .neq('role', 'admin')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/:id/invite', auth, teamOnly, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users').select('*').eq('id', req.params.id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await supabase.from('magic_links').insert({
      email: user.email, token, expires_at: expiresAt.toISOString()
    });

    const loginUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;
    await sendEmail(
      user.email,
      'Access your Xpress Draft plans',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#2A2B29;">Access your plans</h2>
        <p style="color:#5E635B;line-height:1.6;">Hi ${user.name}, here is your updated access link.</p>
        <a href="${loginUrl}" style="display:inline-block;background:#EA672F;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Review my plans →</a>
        <p style="color:#A9A09B;font-size:13px;margin-top:32px;">This link expires in 48 hours.</p>
      </div>`
    );

    res.json({ message: 'Invite sent' });
  } catch (err) {
    console.error('Resend invite error:', err);
    res.status(500).json({ error: err.message || 'Failed to resend invite' });
  }
});

router.delete('/:id', auth, teamOnly, async (req, res) => {
  try {
    const { error } = await supabase
      .from('users').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
