const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function getMondayItem(itemId) {
  const query = `{
    items(ids: [${itemId}]) {
      id
      name
      column_values {
        id
        title
        text
        value
      }
      board { id name }
    }
  }`;
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.MONDAY_API_TOKEN
    },
    body: JSON.stringify({ query })
  });
  const data = await res.json();
  return data?.data?.items?.[0];
}

async function updateMondayStatus(itemId, boardId, columnId, value) {
  const mutation = `mutation {
    change_column_value(
      board_id: ${boardId},
      item_id: ${itemId},
      column_id: "${columnId}",
      value: "${JSON.stringify({ label: value }).replace(/"/g, '\\"')}"
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
}

async function sendEmail(to, subject, html) {
  const { error } = await resend.emails.send({
    from: 'Xpress Draft <noreply@xpressdraft.com.au>',
    to, subject, html
  });
  if (error) throw new Error(error.message);
}

function paymentEmailHtml(clientName, paymentLink, portalUrl) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
    <img src="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png" alt="Xpress Draft" style="height:48px;margin-bottom:32px;"/>
    <h2 style="color:#2A2B29;margin:0 0 16px;">Your updated plans are ready</h2>
    <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px;">
      Hi ${clientName},<br/><br/>
      Your revised drawings are ready. As this revision falls outside your included allowance,
      a variation fee applies. Please complete the payment below to access your updated plans.
    </p>
    <a href="${paymentLink}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">
      Pay and access my plans →
    </a>
    <p style="color:#A9A09B;font-size:13px;margin-top:32px;">
      Questions? Contact us at <a href="mailto:info@xpressdraft.com.au" style="color:#EA672F;">info@xpressdraft.com.au</a>
    </p>
  </div>`;
}

function firstDeliveryEmailHtml(clientName, portalUrl) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
    <img src="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png" alt="Xpress Draft" style="height:48px;margin-bottom:32px;"/>
    <h2 style="color:#2A2B29;margin:0 0 16px;">Your plans are ready for review</h2>
    <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px;">
      Hi ${clientName},<br/><br/>
      Great news — your drawings are ready for your review. Please click below to access
      the Xpress Draft portal, where you can view your plans, add comments and request changes.
    </p>
    <a href="${portalUrl}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">
      Review my plans →
    </a>
    <p style="color:#5E635B;font-size:13px;line-height:1.6;">
      Your plan includes <strong>2 complimentary revisions</strong> at the Preliminary stage
      and <strong>1 revision</strong> at the Working Drawings stage.
    </p>
    <p style="color:#A9A09B;font-size:13px;margin-top:32px;">
      Questions? Contact us at <a href="mailto:info@xpressdraft.com.au" style="color:#EA672F;">info@xpressdraft.com.au</a>
    </p>
  </div>`;
}

function freeRevisionEmailHtml(clientName, portalUrl) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
    <img src="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png" alt="Xpress Draft" style="height:48px;margin-bottom:32px;"/>
    <h2 style="color:#2A2B29;margin:0 0 16px;">Your updated plans are ready</h2>
    <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px;">
      Hi ${clientName},<br/><br/>
      We have updated your drawings based on your feedback. Please click below to review
      the changes and let us know if everything looks good.
    </p>
    <a href="${portalUrl}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">
      Review my updated plans →
    </a>
    <p style="color:#A9A09B;font-size:13px;margin-top:32px;">
      Questions? Contact us at <a href="mailto:info@xpressdraft.com.au" style="color:#EA672F;">info@xpressdraft.com.au</a>
    </p>
  </div>`;
}

function portalAccessEmailHtml(clientName, portalUrl) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
    <img src="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png" alt="Xpress Draft" style="height:48px;margin-bottom:32px;"/>
    <h2 style="color:#2A2B29;margin:0 0 16px;">Payment confirmed — your plans are ready</h2>
    <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px;">
      Hi ${clientName},<br/><br/>
      Thank you for your payment. Your updated plans are now available for review.
      Click below to access the portal.
    </p>
    <a href="${portalUrl}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;">
      Review my plans →
    </a>
    <p style="color:#A9A09B;font-size:13px;margin-top:32px;">
      Questions? Contact us at <a href="mailto:info@xpressdraft.com.au" style="color:#EA672F;">info@xpressdraft.com.au</a>
    </p>
  </div>`;
}

// Monday webhook - triggered when DELIVERY status changes
router.post('/webhook', async (req, res) => {
  try {
    // Monday sends a challenge for webhook verification
    if (req.body.challenge) {
      return res.json({ challenge: req.body.challenge });
    }

    const event = req.body.event;
    if (!event) return res.status(400).json({ error: 'No event' });

    const { pulseId, boardId, columnId, value } = event;

    // Only process DELIVERY column changes
    const newStatus = value?.label?.text || value?.label;
    if (!newStatus) return res.json({ ok: true });

    console.log(`Monday webhook: item ${pulseId}, status: ${newStatus}`);

    if (newStatus !== 'READY TO DELIVER') {
      return res.json({ ok: true });
    }

    // Get full item details from Monday
    const item = await getMondayItem(pulseId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Extract column values
    const cols = {};
    item.column_values.forEach(col => {
      cols[col.title] = col.text || col.value;
    });

    const jobNumber = item.name;
    const variationLink = cols['Variation Link'] || cols['variation_link'] || '';

    console.log(`Job: ${jobNumber}, Variation link: ${variationLink}`);

    // Find matching project in our DB by job number
    const { data: project } = await supabase
      .from('projects')
      .select('*, client:users!projects_client_id_fkey(id, name, email)')
      .eq('job_number', jobNumber)
      .single();

    if (!project) {
      console.error(`No project found for job number: ${jobNumber}`);
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.client) {
      console.error(`No client assigned to project: ${jobNumber}`);
      return res.json({ ok: true, message: 'No client assigned' });
    }

    const clientName = project.client.name;
    const clientEmail = project.client.email;

    // Check delivery history
    const { data: prevDeliveries } = await supabase
      .from('deliveries')
      .select('id')
      .eq('project_id', project.id);

    const isFirstDelivery = !prevDeliveries || prevDeliveries.length === 0;
    const isPaidRevision = variationLink && variationLink.trim() !== '';

    // Generate portal access URL with magic link
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await supabase.from('magic_links').insert({
      email: clientEmail, token, expires_at: expiresAt.toISOString()
    });
    const portalUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;

    let deliveryType;
    let emailSubject;
    let emailHtml;

    if (isPaidRevision) {
      // Paid revision - send payment email first, portal access after Stripe payment
      deliveryType = 'paid_revision';
      emailSubject = 'Your updated plans are ready — payment required';
      emailHtml = paymentEmailHtml(clientName, variationLink, portalUrl);

      // Store the portal URL for after payment
      await supabase.from('projects').update({
        stripe_payment_link: variationLink,
        monday_item_id: String(pulseId),
        locked: true
      }).eq('id', project.id);

    } else if (isFirstDelivery) {
      // First delivery - send portal access immediately
      deliveryType = 'first_delivery';
      emailSubject = 'Your plans are ready for review — Xpress Draft';
      emailHtml = firstDeliveryEmailHtml(clientName, portalUrl);

      await supabase.from('projects').update({
        monday_item_id: String(pulseId),
        locked: false
      }).eq('id', project.id);

    } else {
      // Free revision - send portal access immediately
      deliveryType = 'free_revision';
      emailSubject = 'Your updated plans are ready — Xpress Draft';
      emailHtml = freeRevisionEmailHtml(clientName, portalUrl);

      await supabase.from('projects').update({
        monday_item_id: String(pulseId),
        locked: false
      }).eq('id', project.id);
    }

    // Send email
    await sendEmail(clientEmail, emailSubject, emailHtml);

    // Record delivery
    await supabase.from('deliveries').insert({
      project_id: project.id,
      monday_item_id: String(pulseId),
      delivery_type: deliveryType,
      variation_link: variationLink || null,
      sent_to: clientEmail
    });

    // Update Monday status to UNDER REVIEW for free/first delivery
    if (!isPaidRevision) {
      await updateMondayStatus(pulseId, boardId, columnId, 'UNDER REVIEW');
    }

    console.log(`Delivery email sent: ${deliveryType} to ${clientEmail}`);
    res.json({ ok: true, deliveryType });

  } catch (err) {
    console.error('Monday webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook - triggered when payment is confirmed
router.post('/stripe-webhook', async (req, res) => {
  try {
    const event = req.body;

    if (event.type !== 'checkout.session.completed' &&
        event.type !== 'payment_intent.succeeded') {
      return res.json({ received: true });
    }

    const session = event.data.object;
    const paymentLink = session.url || session.payment_link;

    // Find project by stripe payment link
    const { data: project } = await supabase
      .from('projects')
      .select('*, client:users!projects_client_id_fkey(id, name, email)')
      .eq('stripe_payment_link', paymentLink)
      .single();

    if (!project || !project.client) {
      console.log('No matching project for Stripe payment');
      return res.json({ received: true });
    }

    const clientName = project.client.name;
    const clientEmail = project.client.email;

    // Generate new magic link for portal access
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await supabase.from('magic_links').insert({
      email: clientEmail, token, expires_at: expiresAt.toISOString()
    });
    const portalUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;

    // Unlock project
    await supabase.from('projects').update({
      locked: false,
      stripe_payment_link: null
    }).eq('id', project.id);

    // Send portal access email
    await sendEmail(
      clientEmail,
      'Payment confirmed — your plans are ready — Xpress Draft',
      portalAccessEmailHtml(clientName, portalUrl)
    );

    // Update Monday status to PAID then UNDER REVIEW
    if (project.monday_item_id) {
      const boardId = process.env.MONDAY_BOARD_ID;
      // Find the delivery column ID
      const item = await getMondayItem(project.monday_item_id);
      if (item) {
        const deliveryCol = item.column_values.find(c => c.title === 'DELIVERY');
        if (deliveryCol) {
          await updateMondayStatus(project.monday_item_id, boardId, deliveryCol.id, 'PAID');
          setTimeout(async () => {
            await updateMondayStatus(project.monday_item_id, boardId, deliveryCol.id, 'UNDER REVIEW');
          }, 2000);
        }
      }
    }

    console.log(`Portal access email sent after payment to ${clientEmail}`);
    res.json({ received: true });

  } catch (err) {
    console.error('Stripe webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
