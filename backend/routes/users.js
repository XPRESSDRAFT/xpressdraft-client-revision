const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Resend } = require('resend');
const { supabase } = require('../db');
const { auth, teamOnly } = require('../middleware/auth');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(to, subject, html) {
  const { error } = await resend.emails.send({
from: 'Xpress Draft <noreply@xpressdraft.com.au>',
    to,
    subject,
    html,
  });
  if (error) throw new Error(error.message);
}

// Builds the subject + HTML body for an invite/access email, tailored to the
// user's role. Contractors get copy describing the Contractor Portal
// (available jobs, project history, fees, client details, briefs) rather
// than the client-facing "your plans are ready" copy.
function buildInviteEmail(user, loginUrl) {
  if (user.role === 'contractor') {
    return {
      subject: 'Your access to the Xpress Draft Contractor Portal',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#2A2B29;">Welcome to the Contractor Portal</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px">
          Hi ${user.name},<br/><br/>
          You now have access to the Xpress Draft Contractor Portal, where you can:
        </p>
        <ul style="color:#5E635B;font-size:15px;line-height:1.8;margin-bottom:32px;padding-left:20px;">
          <li>See all jobs currently available to you</li>
          <li>View the history of projects you've worked on</li>
          <li>Check agreed payable fees for each job</li>
          <li>Access client details and project briefings</li>
          <li>Upload your invoices directly against a project</li>
          <li>Track payment status once it's confirmed</li>
        </ul>
        <a href="${loginUrl}" style="display:inline-block;background:#EA672F;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">
          Access the Contractor Portal →
        </a>
        <p style="color:#A9A09B;font-size:13px;margin-top:32px;">
          This link is valid for 6 months. Questions? Contact us at info@xpressdraft.com.au
        </p>
      </div>`
    };
  }
  return {
    subject: 'Your plans are ready — Xpress Draft',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
      <h2 style="color:#2A2B29;">Your plans are ready to review</h2>
      <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:32px">
        Hi ${user.name},<br/><br/>
        Your drawings are ready for review on the Xpress Draft client portal.
        Click below to access your plans. This link is valid for 6 months.
      </p>
      <a href="${loginUrl}" style="display:inline-block;background:#EA672F;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">
        Review my plans →
      </a>
      <p style="color:#A9A09B;font-size:13px;margin-top:32px;">
        Questions? Contact us at info@xpressdraft.com.au
      </p>
    </div>`
  };
}

// Same idea, for the "resend invite" flow — shorter copy but still role-aware.
function buildResendEmail(user, loginUrl) {
  if (user.role === 'contractor') {
    return {
      subject: 'Access your Xpress Draft Contractor Portal',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#2A2B29;">Access the Contractor Portal</h2>
        <p style="color:#5E635B;line-height:1.6;">Hi ${user.name}, here is your updated access link to the Contractor Portal — your jobs, project history, fees, client details and briefings.</p>
        <a href="${loginUrl}" style="display:inline-block;background:#EA672F;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Access the Contractor Portal →</a>
        <p style="color:#A9A09B;font-size:13px;margin-top:32px;">This link is valid for 6 months.</p>
      </div>`
    };
  }
  return {
    subject: 'Access your Xpress Draft plans',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
      <h2 style="color:#2A2B29;">Access your plans</h2>
      <p style="color:#5E635B;line-height:1.6;">Hi ${user.name}, here is your updated access link.</p>
      <a href="${loginUrl}" style="display:inline-block;background:#EA672F;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Review my plans →</a>
      <p style="color:#A9A09B;font-size:13px;margin-top:32px;">This link is valid for 6 months.</p>
    </div>`
  };
}

router.post('/', auth, teamOnly, async (req, res) => {
  try {
    const { name, email, role = 'client', phone, sendInvite = false } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
    if (role === 'client' && !phone) return res.status(400).json({ error: 'Phone number is required for client accounts, so they can receive SMS delivery notifications.' });

    const { data: existing } = await supabase
      .from('users').select('id').eq('email', email.toLowerCase().trim()).single();
    if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

    const { data: user, error } = await supabase
      .from('users')
      .insert({ name, email: email.toLowerCase().trim(), role, phone: phone || null })
      .select().single();

    if (error) throw error;

    if (sendInvite) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months
      await supabase.from('magic_links').insert({
        email: user.email, token, expires_at: expiresAt.toISOString()
      });
      const loginUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;
      const { subject, html } = buildInviteEmail(user, loginUrl);
      await sendEmail(user.email, subject, html);
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
      .from('users').select('id, name, email, role, created_at, active')
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
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months
    await supabase.from('magic_links').insert({
      email: user.email, token, expires_at: expiresAt.toISOString()
    });

    const loginUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;
    const { subject, html } = buildResendEmail(user, loginUrl);
    await sendEmail(user.email, subject, html);

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
router.put('/:id', auth, teamOnly, async (req, res) => {
  try {
    const { name, email, role, phone, active } = req.body;
    const { data: existingUser } = await supabase.from('users').select('role, phone').eq('id', req.params.id).single();
    const effectiveRole = role !== undefined ? role : existingUser?.role;
    const effectivePhone = phone !== undefined ? phone : existingUser?.phone;
    if (effectiveRole === 'client' && !effectivePhone) return res.status(400).json({ error: 'Phone number is required for client accounts, so they can receive SMS delivery notifications.' });

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase().trim();
    if (role !== undefined) updates.role = role;
    if (phone !== undefined) updates.phone = phone;
    // Suspend/reactivate is admin-only — team members can edit basic
    // details but shouldn't be able to lock other accounts out.
    if (active !== undefined) {
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can suspend or reactivate accounts' });
      updates.active = active;
    }

    const { data, error } = await supabase
      .from('users').update(updates).eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});
module.exports = router;
