const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Monday column IDs
const COL = {
  deliveryStatus: 'color_mm64ffyg',
  deliveryFile:   'file_mm67ta3v',
  partialPayment: 'link_mm67z48y',
  finalPayment:   'link_mm67gfzc',
  variationLink:  'link_mm64wrwb',
  revision:       'color_mky4x01c',
  stage:          'color_mky4a52f',
};

const APPROVAL_NOTE = `<p style="color:#5E635B;font-size:13px;line-height:1.6;margin-top:24px;padding:16px;background:#F3EAE5;border-radius:8px;border-left:3px solid #EA672F;">
  <strong>Happy with the drawings?</strong> Please send a confirmation email to
  <a href="mailto:info@xpressdraft.com.au" style="color:#EA672F;">info@xpressdraft.com.au</a>
  saying <em>"I approve the drawings. Please proceed to final set"</em> so we can issue the final drawings.
</p>`;

const logoHtml = `<img src="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png" alt="Xpress Draft" style="height:48px;margin-bottom:32px;"/>`;
const footerHtml = `<p style="color:#A9A09B;font-size:13px;margin-top:32px;">Questions? Contact us at <a href="mailto:info@xpressdraft.com.au" style="color:#EA672F;">info@xpressdraft.com.au</a></p>`;
const btnStyle = `display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-bottom:24px;`;

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

async function getMondayItem(itemId) {
  const data = await mondayApi(`{
    items(ids: [${itemId}]) {
      id name
      column_values { id title text value }
      board { id }
    }
  }`);
  return data?.data?.items?.[0];
}

async function getMondayFileUrl(itemId, columnId) {
  const data = await mondayApi(`{
    items(ids: [${itemId}]) {
      column_values(ids: ["${columnId}"]) {
        ... on FileValue { files { asset_id name file_size url url_thumbnail } }
      }
    }
  }`);
  const files = data?.data?.items?.[0]?.column_values?.[0]?.files || [];
  return files;
}

async function updateMondayStatus(itemId, boardId, columnId, value) {
  await mondayApi(`mutation {
    change_column_value(
      board_id: ${boardId}, item_id: ${itemId},
      column_id: "${columnId}",
      value: "{\\"label\\":\\"${value}\\"}"
    ) { id }
  }`);
}

async function addMondayNote(itemId, boardId, note) {
  await mondayApi(`mutation {
    create_update(item_id: ${itemId}, body: "${note}") { id }
  }`);
}

async function sendEmail(to, subject, html, attachments = []) {
  const payload = { from: 'Xpress Draft <noreply@xpressdraft.com.au>', to, subject, html };
  if (attachments.length > 0) payload.attachments = attachments;
  const { error } = await resend.emails.send(payload);
  if (error) throw new Error(error.message);
}

function paymentEmailHtml(clientName, paymentLink, isWD = false) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
    ${logoHtml}
    <h2 style="color:#2A2B29;margin:0 0 16px;">Your ${isWD ? 'working drawings are' : 'plans are'} ready</h2>
    <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px;">
      Hi ${clientName},<br/><br/>
      Your ${isWD ? 'working drawings' : 'updated plans'} are ready. Please complete the payment below to access your files.
    </p>
    <a href="${paymentLink}" style="${btnStyle}">Pay and access my ${isWD ? 'drawings' : 'plans'} →</a>
    ${APPROVAL_NOTE}
    ${footerHtml}
  </div>`;
}

function firstDeliveryEmailHtml(clientName, portalUrl) {
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
    ${logoHtml}
    <h2 style="color:#2A2B29;margin:0 0 16px;">Your plans are ready for review</h2>
    <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px;">
      Hi ${clientName},<br/><br/>
      Great news — your drawings are ready for your review. Please click below to access
      the Xpress Draft portal, where you can view your plans, add comments and request changes.
    </p>
    <a href="${portalUrl}" style="${btnStyle}">Review my plans →</a>
    <p style="color:#5E635B;font-size:13px;line-height:1.6;">
      Your plan includes <strong>2 complimentary revisions</strong> at the Preliminary stage
      and <strong>1 revision</strong> at the Working Drawings stage.
    </p>
    ${APPROVAL_NOTE}
    ${footerHtml}
  </div>`;
}

function freeRevisionEmailHtml(clientName, portalUrl, isWD = false, dwgUrl = null) {
  const dwgBtn = dwgUrl ? `<a href="${dwgUrl}" style="${btnStyle.replace('#EA672F','#2A2B29')}">Download DWG files →</a>` : '';
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
    ${logoHtml}
    <h2 style="color:#2A2B29;margin:0 0 16px;">Your updated ${isWD ? 'working drawings are' : 'plans are'} ready</h2>
    <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px;">
      Hi ${clientName},<br/><br/>
      We have updated your drawings based on your feedback. Please click below to review the changes.
    </p>
    <a href="${portalUrl}" style="${btnStyle}">Review my ${isWD ? 'working drawings' : 'updated plans'} →</a>
    ${dwgBtn}
    ${APPROVAL_NOTE}
    ${footerHtml}
  </div>`;
}

function portalAccessEmailHtml(clientName, portalUrl, isWD = false, dwgUrl = null) {
  const dwgBtn = dwgUrl ? `<a href="${dwgUrl}" style="${btnStyle.replace('#EA672F','#2A2B29')}">Download DWG files →</a>` : '';
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
    ${logoHtml}
    <h2 style="color:#2A2B29;margin:0 0 16px;">Payment confirmed — your ${isWD ? 'working drawings are' : 'plans are'} ready</h2>
    <p style="color:#5E635B;font-size:15px;line-height:1.6;margin-bottom:24px;">
      Hi ${clientName},<br/><br/>
      Thank you for your payment. Your ${isWD ? 'working drawings' : 'updated plans'} are now available.
    </p>
    <a href="${portalUrl}" style="${btnStyle}">Review my ${isWD ? 'working drawings' : 'plans'} →</a>
    ${dwgBtn}
    ${APPROVAL_NOTE}
    ${footerHtml}
  </div>`;
}

router.post('/webhook', async (req, res) => {
  try {
    if (req.body.challenge) return res.json({ challenge: req.body.challenge });

    const event = req.body.event;
    if (!event) return res.json({ ok: true });

    const { pulseId, boardId, columnId, value } = event;

    // Only process DELIVERY STATUS column changes
    if (columnId !== COL.deliveryStatus) return res.json({ ok: true });

    const newStatus = value?.label?.text || value?.label || '';
    if (newStatus.toUpperCase() !== 'READY TO DELIVER') return res.json({ ok: true });

    console.log(`Monday webhook: item ${pulseId}, status: READY TO DELIVER`);

    const item = await getMondayItem(pulseId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Extract column values by ID
    const cols = {};
    item.column_values.forEach(col => {
      cols[col.id] = col.text || '';
    });

    const jobNumber = item.name;
    const revisionLabel = (cols[COL.revision] || '').toUpperCase().trim();
    const stageLabel = (cols[COL.stage] || '').toUpperCase().trim();
    const partialPayment = (cols[COL.partialPayment] || '').trim();
    const finalPayment = (cols[COL.finalPayment] || '').trim();
    const variationLink = (cols[COL.variationLink] || '').trim();

    const isWD = stageLabel.includes('WD');
    const isFirstIssue = revisionLabel.includes('FIRST DRAFT') || revisionLabel === 'ISSUE - A' || revisionLabel === 'ISSUE-A' || revisionLabel === 'ISSUE A';

    console.log(`Job: ${jobNumber}, Stage: ${stageLabel}, Revision: ${revisionLabel}, isWD: ${isWD}, isFirstIssue: ${isFirstIssue}`);

    // Find project in our DB
    const { data: project } = await supabase
      .from('projects')
      .select('*, client:users!projects_client_id_fkey(id, name, email)')
      .eq('job_number', jobNumber)
      .single();

    if (!project || !project.client) {
      console.error(`No project/client found for job: ${jobNumber}`);
      await addMondayNote(pulseId, boardId, `⚠️ Xpress Draft Portal: No project or client found for job number "${jobNumber}". Please check the portal.`);
      return res.json({ ok: true });
    }

    const { name: clientName, email: clientEmail } = project.client;

    // Get files from Monday
    const files = await getMondayFileUrl(pulseId, COL.deliveryFile);
    const pdfFile = files.find(f => f.name?.toLowerCase().endsWith('.pdf'));
    const zipFile = files.find(f => f.name?.toLowerCase().endsWith('.zip') || f.name?.toLowerCase().endsWith('.dwg'));

    // Download and upload PDF to Supabase Storage
    let pdfDrawingId = null;
    if (pdfFile) {
      try {
        const pdfRes = await fetch(pdfFile.url, {
          headers: { 'Authorization': process.env.MONDAY_API_TOKEN }
        });
        const pdfBuffer = await pdfRes.arrayBuffer();
        const fileName = `${jobNumber}-${Date.now()}.pdf`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('drawings')
          .upload(`${project.id}/${fileName}`, Buffer.from(pdfBuffer), {
            contentType: 'application/pdf', upsert: true
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(`${project.id}/${fileName}`);
          const { data: drawing } = await supabase.from('drawings').insert({
            project_id: project.id,
            name: pdfFile.name,
            file_url: urlData.publicUrl,
            file_path: `${project.id}/${fileName}`
          }).select().single();
          pdfDrawingId = drawing?.id;
          console.log(`PDF uploaded: ${fileName}`);
        }
      } catch (e) {
        console.error('PDF upload error:', e);
        await addMondayNote(pulseId, boardId, `⚠️ Xpress Draft Portal: Failed to upload PDF for job "${jobNumber}". Please upload manually.`);
      }
    }

    // Upload ZIP to Supabase Storage and get download URL
    let dwgDownloadUrl = null;
    if (zipFile && isWD) {
      try {
        const zipRes = await fetch(zipFile.url, {
          headers: { 'Authorization': process.env.MONDAY_API_TOKEN }
        });
        const zipBuffer = await zipRes.arrayBuffer();

        // Check file size (40MB limit for email)
        if (zipBuffer.byteLength > 40 * 1024 * 1024) {
          await addMondayNote(pulseId, boardId, `⚠️ Xpress Draft Portal: DWG/ZIP file for job "${jobNumber}" is too large to attach to email. Client will need to download separately.`);
        } else {
          const zipName = `${jobNumber}-dwg-${Date.now()}.zip`;
          const { error: zipError } = await supabase.storage
            .from('drawings')
            .upload(`${project.id}/${zipName}`, Buffer.from(zipBuffer), {
              contentType: 'application/zip', upsert: true
            });

          if (!zipError) {
            const { data: zipUrlData } = supabase.storage.from('drawings').getPublicUrl(`${project.id}/${zipName}`);
            dwgDownloadUrl = zipUrlData.publicUrl;
            console.log(`ZIP uploaded: ${zipName}`);
          }
        }
      } catch (e) {
        console.error('ZIP upload error:', e);
        await addMondayNote(pulseId, boardId, `⚠️ Xpress Draft Portal: Failed to upload DWG files for job "${jobNumber}".`);
      }
    }

    // Generate magic link
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await supabase.from('magic_links').insert({ email: clientEmail, token, expires_at: expiresAt.toISOString() });
    const portalUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;

    // Determine delivery type and send email
    let deliveryType, emailSubject, emailHtml, paymentLink = null;

    if (isFirstIssue && !isWD && partialPayment) {
      // PR first issue - requires partial payment
      deliveryType = 'pr_first_payment';
      paymentLink = partialPayment;
      emailSubject = 'Your plans are ready — Xpress Draft';
      emailHtml = paymentEmailHtml(clientName, partialPayment, false);
      await supabase.from('projects').update({ stripe_payment_link: partialPayment, monday_item_id: String(pulseId), locked: true }).eq('id', project.id);

    } else if (isWD && finalPayment) {
      // WD stage - requires final payment
      deliveryType = 'wd_final_payment';
      paymentLink = finalPayment;
      emailSubject = 'Your working drawings are ready — Xpress Draft';
      emailHtml = paymentEmailHtml(clientName, finalPayment, true);
      await supabase.from('projects').update({ stripe_payment_link: finalPayment, monday_item_id: String(pulseId), locked: true }).eq('id', project.id);

    } else if (!isFirstIssue && variationLink) {
      // Variation payment required
      deliveryType = 'variation_payment';
      paymentLink = variationLink;
      emailSubject = 'Your updated plans are ready — payment required';
      emailHtml = paymentEmailHtml(clientName, variationLink, isWD);
      await supabase.from('projects').update({ stripe_payment_link: variationLink, monday_item_id: String(pulseId), locked: true }).eq('id', project.id);

    } else if (isFirstIssue && !isWD && !partialPayment) {
      // PR first issue - free (gift project)
      deliveryType = 'pr_first_free';
      emailSubject = 'Your plans are ready for review — Xpress Draft';
      emailHtml = firstDeliveryEmailHtml(clientName, portalUrl);
      await supabase.from('projects').update({ monday_item_id: String(pulseId), locked: false }).eq('id', project.id);

    } else {
      // Free revision
      deliveryType = isWD ? 'wd_free_revision' : 'pr_free_revision';
      emailSubject = `Your updated ${isWD ? 'working drawings' : 'plans'} are ready — Xpress Draft`;
      emailHtml = freeRevisionEmailHtml(clientName, portalUrl, isWD, dwgDownloadUrl);
      await supabase.from('projects').update({ monday_item_id: String(pulseId), locked: false }).eq('id', project.id);
    }

    await sendEmail(clientEmail, emailSubject, emailHtml);

    await supabase.from('deliveries').insert({
      project_id: project.id,
      monday_item_id: String(pulseId),
      delivery_type: deliveryType,
      variation_link: paymentLink || null,
      sent_to: clientEmail
    });

    // Update Monday status for free deliveries
    if (!paymentLink) {
      await updateMondayStatus(pulseId, boardId, COL.deliveryStatus, 'UNDER REVIEW');
    }

    console.log(`Delivery sent: ${deliveryType} to ${clientEmail}`);
    res.json({ ok: true, deliveryType });

  } catch (err) {
    console.error('Monday webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook - payment confirmed
router.post('/stripe-webhook', async (req, res) => {
  try {
    const event = req.body;
    if (event.type !== 'checkout.session.completed' && event.type !== 'payment_intent.succeeded') {
      return res.json({ received: true });
    }

    const session = event.data.object;
    const paymentLink = session.url || session.payment_link;

    const { data: project } = await supabase
      .from('projects')
      .select('*, client:users!projects_client_id_fkey(id, name, email)')
      .eq('stripe_payment_link', paymentLink)
      .single();

    if (!project || !project.client) return res.json({ received: true });

    const { name: clientName, email: clientEmail } = project.client;
    const isWD = project.stage === 'working_drawings';

    // Generate magic link
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await supabase.from('magic_links').insert({ email: clientEmail, token, expires_at: expiresAt.toISOString() });
    const portalUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;

    // Get DWG download URL if WD stage
    let dwgDownloadUrl = null;
    if (isWD && project.monday_item_id) {
      const files = await getMondayFileUrl(project.monday_item_id, COL.deliveryFile);
      const zipFile = files.find(f => f.name?.toLowerCase().endsWith('.zip') || f.name?.toLowerCase().endsWith('.dwg'));
      if (zipFile) {
        const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(`${project.id}/${zipFile.name}`);
        dwgDownloadUrl = urlData?.publicUrl;
      }
    }

    // Unlock project
    await supabase.from('projects').update({ locked: false, stripe_payment_link: null }).eq('id', project.id);

    // Send portal access email
    await sendEmail(
      clientEmail,
      `Payment confirmed — your ${isWD ? 'working drawings are' : 'plans are'} ready — Xpress Draft`,
      portalAccessEmailHtml(clientName, portalUrl, isWD, dwgDownloadUrl)
    );

    // Update Monday status
    if (project.monday_item_id) {
      const item = await getMondayItem(project.monday_item_id);
      if (item) {
        await updateMondayStatus(project.monday_item_id, process.env.MONDAY_BOARD_ID, COL.deliveryStatus, 'PAID');
        setTimeout(async () => {
          await updateMondayStatus(project.monday_item_id, process.env.MONDAY_BOARD_ID, COL.deliveryStatus, 'UNDER REVIEW');
        }, 3000);
      }
    }

    console.log(`Portal access sent after payment to ${clientEmail}`);
    res.json({ received: true });

  } catch (err) {
    console.error('Stripe webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
