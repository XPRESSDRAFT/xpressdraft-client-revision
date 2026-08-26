const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');

const resend = new Resend(process.env.RESEND_API_KEY);

const MONDAY_GROUP_AWAITING_CLIENT = 'group_mkzqbpx4';

async function moveToAwaitingClient(mondayItemId) {
  try {
    const mutation = `mutation {
      move_item_to_group(
        item_id: ${mondayItemId},
        group_id: "${MONDAY_GROUP_AWAITING_CLIENT}"
      ) { id }
    }`;
    await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.MONDAY_API_TOKEN
      },
      body: JSON.stringify({ query: mutation })
    });
    console.log(`Moved Monday item ${mondayItemId} to AWAITING CLIENT`);
  } catch (err) {
    console.error('Monday move group error:', err);
  }
}

router.post('/magic-link', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user || user.active === false) {
      return res.json({ message: 'If this email is registered, a login link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months

    await supabase.from('magic_links').insert({
      email: user.email,
      token,
      expires_at: expiresAt.toISOString(),
    });

    const loginUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Xpress Draft <noreply@xpressdraft.com.au>',
      to: user.email,
      subject: 'Your Xpress Draft login link',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
          <h2 style="color:#2A2B29;">Sign in to Xpress Draft</h2>
          <p style="color:#5E635B;font-size:15px;line-height:1.8;margin-bottom:32px">
            Hi ${user.name},<br/><br/>
            Click the button below to access your Xpress Draft portal.<br/><br/>
            This link is valid for 6 months.
          </p>
          <a href="${loginUrl}" style="display:inline-block;background:#EA672F;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">
            ${user.role === 'client' ? 'Access my portal →' : 'Access portal →'}
          </a>
          <p style="color:#A9A09B;font-size:13px;margin-top:32px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return res.status(500).json({ error: 'Failed to send login link' });
    }

    res.json({ message: 'If this email is registered, a login link has been sent.' });
  } catch (err) {
    console.error('Magic link error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to send login link' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const { data: link, error } = await supabase
      .from('magic_links')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !link) return res.status(400).json({ error: 'Invalid or expired link' });
    if (new Date(link.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This link has expired. Please request a new one.' });
    }

    // Magic links are intentionally reusable within their validity window
    // (rather than single-use) — clients are expected to find this same
    // email again rather than bookmark a URL, so it needs to keep working
    // every time until it naturally expires or their account is suspended.
    await supabase.from('magic_links').update({ used: true }).eq('id', link.id);

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', link.email)
      .single();

    if (!user) return res.status(400).json({ error: 'Invalid or expired link' });
    if (user.active === false) return res.status(403).json({ error: 'This account has been suspended. Please contact Xpress Draft.' });

    if (user.role === 'client') {
      const { data: projects } = await supabase
        .from('projects')
        .select('monday_item_id')
        .eq('client_id', user.id)
        .not('monday_item_id', 'is', null)
        .eq('locked', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (projects && projects.length > 0 && projects[0].monday_item_id) {
        await moveToAwaitingClient(projects[0].monday_item_id);
      }
    }

    // Session token matches the magic link's 6-month duration — otherwise
    // a client would still be forced to re-click a login link every 7 days
    // even though the link itself stays valid for months.
    const jwtToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '180d' }
    );

    res.json({ token: jwtToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.get('/me', auth, async (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role } });
});

module.exports = router;
