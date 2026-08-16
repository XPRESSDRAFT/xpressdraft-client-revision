const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { Resend } = require('resend');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const { auth } = require('../middleware/auth');

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
      column_values { id text value }
      board { id }
    }
  }`);
  console.log('Monday API response:', JSON.stringify(data?.data?.items?.length), 'error:', JSON.stringify(data?.errors));
  return data?.data?.items?.[0];
}

async function getMondayFileUrl(itemId, columnId) {
  const data = await mondayApi(`{
    items(ids: [${itemId}]) {
      column_values(ids: ["${columnId}"]) {
        id value text
      }
    }
  }`);
  console.log('File column raw:', JSON.stringify(data?.data?.items?.[0]?.column_values?.[0]));
  const colVal = data?.data?.items?.[0]?.column_values?.[0];
  if (!colVal?.value) return [];
  try {
    const parsed = JSON.parse(colVal.value);
    const files = parsed?.files || [];
    console.log('Files found:', files.length);
   return files.map(f => ({
      name: f.name,
      url: `https://xpressdraft.monday.com/protected_static/10128130/resources/${f.assetId}/${f.name}`,
      asset_id: f.assetId
    }));
  } catch(e) {
    console.error('File parse error:', e.message);
    return [];
  }
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
    <p style="color:#5E635B;font-size:13px;line-height:1.6;">
      If you are happy with the drawings, you can also click the <strong>Approve drawings</strong> button directly in the portal to confirm your approval and request the final set.
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

    if (columnId !== COL.deliveryStatus) return res.json({ ok: true });

    const newStatus = (value?.label?.text || value?.label?.index?.toString() || JSON.stringify(value?.label) || '').toString();
    console.log('Status value received:', JSON.stringify(value));
    if (!newStatus.toUpperCase().includes('READY TO DELIVER')) return res.json({ ok: true });

    console.log(`Monday webhook: item ${pulseId}, status: READY TO DELIVER`);

    const item = await getMondayItem(pulseId);
    console.log('Monday item fetched:', item ? item.name : 'NULL');
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const cols = {};
    item.column_values.forEach(col => { cols[col.id] = col.text || ''; });

    const jobNumber = item.name;
    const revisionLabel = (cols[COL.revision] || '').toUpperCase().trim();
    const stageLabel = (cols[COL.stage] || '').toUpperCase().trim();
    const partialPayment = (cols[COL.partialPayment] || '').trim();
    const finalPayment = (cols[COL.finalPayment] || '').trim();
    const variationLink = (cols[COL.variationLink] || '').trim();

    const isWD = stageLabel.includes('WD');
    const isFirstIssue = revisionLabel.includes('FIRST DRAFT') || revisionLabel === 'ISSUE - A' || revisionLabel === 'ISSUE-A' || revisionLabel === 'ISSUE A';

    console.log(`Job: ${jobNumber}, Stage: ${stageLabel}, Revision: ${revisionLabel}, isWD: ${isWD}, isFirstIssue: ${isFirstIssue}`);

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

    const files = await getMondayFileUrl(pulseId, COL.deliveryFile);
    const pdfFile = files.find(f => f.name?.toLowerCase().endsWith('.pdf'));
    const zipFile = files.find(f => f.name?.toLowerCase().endsWith('.zip') || f.name?.toLowerCase().endsWith('.dwg'));

    let pdfDrawingId = null;
    if (pdfFile) {
      try {
const assetQuery = `{ assets(ids: [${pdfFile.asset_id}]) { public_url } }`;
        const assetData = await mondayApi(assetQuery);
        const publicUrl = assetData?.data?.assets?.[0]?.public_url;
        console.log('Asset public URL:', publicUrl);
        const pdfRes = await fetch(publicUrl || pdfFile.url);
        const pdfBuffer = await pdfRes.arrayBuffer();
        const fileName = `${jobNumber}-${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from('drawings')
          .upload(`${project.id}/${fileName}`, Buffer.from(pdfBuffer), {
            contentType: 'application/pdf', upsert: true
          });

        if (!uploadError) {
          const { data: signedData } = await supabase.storage.from('drawings').createSignedUrl(`${project.id}/${fileName}`, 365 * 24 * 60 * 60);
          const { data: drawing } = await supabase.from('drawings').insert({
            project_id: project.id,
            name: pdfFile.name,
            file_url: signedData?.signedUrl,
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

    let dwgDownloadUrl = null;
    if (zipFile && isWD) {
      try {
        const zipRes = await fetch(zipFile.url, {
          headers: { 'Authorization': process.env.MONDAY_API_TOKEN }
        });
        const zipBuffer = await zipRes.arrayBuffer();
        if (zipBuffer.byteLength > 40 * 1024 * 1024) {
          await addMondayNote(pulseId, boardId, `⚠️ Xpress Draft Portal: DWG/ZIP file for job "${jobNumber}" is too large. Client will need to download separately.`);
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

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await supabase.from('magic_links').insert({ email: clientEmail, token, expires_at: expiresAt.toISOString() });
    const portalUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;

    let deliveryType, emailSubject, emailHtml, paymentLink = null;

    if (isFirstIssue && !isWD && partialPayment) {
      deliveryType = 'pr_first_payment';
      paymentLink = partialPayment;
      emailSubject = 'Your plans are ready — Xpress Draft';
      emailHtml = paymentEmailHtml(clientName, partialPayment, false);
      await supabase.from('projects').update({ stripe_payment_link: partialPayment, monday_item_id: String(pulseId), locked: true }).eq('id', project.id);
    } else if (isWD && finalPayment && !isFirstIssue) {
      deliveryType = 'wd_final_payment';
      paymentLink = finalPayment;
      emailSubject = 'Your working drawings are ready — Xpress Draft';
      emailHtml = paymentEmailHtml(clientName, finalPayment, true);
      await supabase.from('projects').update({ stripe_payment_link: finalPayment, monday_item_id: String(pulseId), locked: true }).eq('id', project.id);
    } else if (isWD && finalPayment && isFirstIssue) {
      deliveryType = 'wd_first_payment';
      paymentLink = finalPayment;
      emailSubject = 'Your working drawings are ready — Xpress Draft';
      emailHtml = paymentEmailHtml(clientName, finalPayment, true);
      await supabase.from('projects').update({ stripe_payment_link: finalPayment, monday_item_id: String(pulseId), locked: true }).eq('id', project.id);
    } else if (isWD && isFirstIssue && !finalPayment) {
      deliveryType = 'wd_first_free';
      emailSubject = 'Your working drawings are ready for review — Xpress Draft';
      emailHtml = freeRevisionEmailHtml(clientName, portalUrl, true, dwgDownloadUrl);
      await supabase.from('projects').update({ monday_item_id: String(pulseId), locked: false }).eq('id', project.id);
    } else if (!isFirstIssue && variationLink) {
      deliveryType = 'variation_payment';
      paymentLink = variationLink;
      emailSubject = 'Your updated plans are ready — payment required';
      emailHtml = paymentEmailHtml(clientName, variationLink, isWD);
      await supabase.from('projects').update({ stripe_payment_link: variationLink, monday_item_id: String(pulseId), locked: true }).eq('id', project.id);
    } else if (isFirstIssue && !isWD && !partialPayment) {
      deliveryType = 'pr_first_free';
      emailSubject = 'Your plans are ready for review — Xpress Draft';
      emailHtml = firstDeliveryEmailHtml(clientName, portalUrl);
      await supabase.from('projects').update({ monday_item_id: String(pulseId), locked: false }).eq('id', project.id);
    } else {
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

router.post('/stripe-webhook', async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Stripe signature error:', err.message);
      return res.status(400).json({ error: err.message });
    }

    console.log('Stripe event type:', event.type);

    if (event.type !== 'checkout.session.completed' && event.type !== 'payment_intent.succeeded') {
      return res.json({ received: true });
    }

const session = event.data.object;
    const paymentLinkId = session.payment_link;

    console.log('Payment link ID:', paymentLinkId);

    if (!paymentLinkId) {
      console.log('No payment link ID found in event');
      return res.json({ received: true });
    }

    // Retrieve full payment link URL from Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let paymentLink = null;
    try {
      const pl = await stripe.paymentLinks.retrieve(paymentLinkId);
      paymentLink = pl.url;
      console.log('Payment link URL from Stripe:', paymentLink);
    } catch(e) {
      console.log('Could not retrieve payment link URL:', e.message);
    }

    const { data: project } = await supabase
      .from('projects')
      .select('*, client:users!projects_client_id_fkey(id, name, email)')
      .ilike('stripe_payment_link', `%${paymentLinkId}%`)
      .single();

    if (!project || !project.client) {
      console.log('No project found for payment link:', paymentLink);
      return res.json({ received: true });
    }

    const { name: clientName, email: clientEmail } = project.client;
    const isWD = project.stage === 'working_drawings';

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await supabase.from('magic_links').insert({ email: clientEmail, token, expires_at: expiresAt.toISOString() });
    const portalUrl = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;

    let dwgDownloadUrl = null;
    if (isWD && project.monday_item_id) {
      const files = await getMondayFileUrl(project.monday_item_id, COL.deliveryFile);
      const zipFile = files.find(f => f.name?.toLowerCase().endsWith('.zip') || f.name?.toLowerCase().endsWith('.dwg'));
      if (zipFile) {
        const { data: urlData } = supabase.storage.from('drawings').getPublicUrl(`${project.id}/${zipFile.name}`);
        dwgDownloadUrl = urlData?.publicUrl;
      }
    }

    await supabase.from('projects').update({ locked: false, stripe_payment_link: null }).eq('id', project.id);

    await sendEmail(
      clientEmail,
      `Payment confirmed — your ${isWD ? 'working drawings are' : 'plans are'} ready — Xpress Draft`,
      portalAccessEmailHtml(clientName, portalUrl, isWD, dwgDownloadUrl)
    );

    if (project.monday_item_id) {
      await updateMondayStatus(project.monday_item_id, process.env.MONDAY_BOARD_ID, COL.deliveryStatus, 'PAID');
      setTimeout(async () => {
        await updateMondayStatus(project.monday_item_id, process.env.MONDAY_BOARD_ID, COL.deliveryStatus, 'UNDER REVIEW');
      }, 3000);
    }

    console.log(`Portal access sent after payment to ${clientEmail}`);
    res.json({ received: true });

  } catch (err) {
    console.error('Stripe webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/approve', auth, async (req, res) => {
  try {
    const { projectId } = req.body;

    const { data: project } = await supabase
      .from('projects')
      .select('*, client:users!projects_client_id_fkey(id, name, email)')
      .eq('id', projectId)
      .single();

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const clientName = project.client?.name || 'Client';
    const jobNumber = project.job_number || project.name;

    const resendClient = new Resend(process.env.RESEND_API_KEY);
    await resendClient.emails.send({
      from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>',
      to: 'info@xpressdraft.com.au',
      subject: `Drawings approved — ${jobNumber}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#2A2B29;">Drawings Approved</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.6;">
          <strong>${clientName}</strong> has approved the drawings for <strong>${jobNumber}</strong>.
        </p>
        <p style="color:#5E635B;font-size:15px;line-height:1.6;">
          Client message: <em>"I approve the drawings. Please proceed to final set."</em>
        </p>
        <a href="https://xpressdraft.monday.com/boards/${process.env.MONDAY_BOARD_ID}"
           style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-top:16px;">
          View in Monday →
        </a>
      </div>`
    });

    if (project.monday_item_id) {
      await mondayApi(`mutation {
        move_item_to_group(item_id: ${project.monday_item_id}, group_id: "group_title") { id }
      }`);
      await mondayApi(`mutation {
        change_column_value(
          board_id: ${process.env.MONDAY_BOARD_ID},
          item_id: ${project.monday_item_id},
          column_id: "${COL.deliveryStatus}",
          value: "{\\"label\\":\\"PR APPROVED\\"}"
        ) { id }
      }`);
    }

    console.log(`Approval sent for ${jobNumber}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/submit-markup', auth, upload.single('pdf'), async (req, res) => {
  console.log('SUBMIT MARKUP HIT');
  try {
const { projectId, commentSummary } = req.body;
console.log('Submit received, file:', req.file ? req.file.size + ' bytes' : 'NO FILE');
    console.log('Submit markup for project:', projectId);
    const pdfBuffer = req.file?.buffer;

    if (!pdfBuffer) return res.status(400).json({ error: 'PDF required' });

    const { data: project } = await supabase
      .from('projects')
      .select('*, client:users!projects_client_id_fkey(id, name, email)')
      .eq('id', projectId)
      .single();

    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.monday_item_id) return res.json({ ok: true, message: 'No Monday item linked' });

    const clientName = project.client?.name || 'Client';
    const jobNumber = project.job_number || project.name;
    const fileName = `${jobNumber}-Markup-${Date.now()}.pdf`;

const axios = require('axios');
    const FormDataNode = require('form-data');
    const mondayForm = new FormDataNode();
    mondayForm.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${project.monday_item_id}, column_id: "file_mkzh1knp", file: $file) { id } }`);
    mondayForm.append('variables', JSON.stringify({ file: null }));
    mondayForm.append('map', JSON.stringify({ file: ['variables.file'] }));
    mondayForm.append('file', Buffer.from(pdfBuffer), { filename: fileName, contentType: 'application/pdf', knownLength: pdfBuffer.length });

    const uploadRes = await axios.post('https://api.monday.com/v2/file', mondayForm, {
      headers: { 'Authorization': process.env.MONDAY_API_TOKEN, ...mondayForm.getHeaders() }
    });
    console.log('Monday file upload result:', JSON.stringify(uploadRes.data));

    console.log(`PDF uploaded to Monday for item ${project.monday_item_id}`);

const moveResult = await mondayApi(`mutation {
      move_item_to_group(
        item_id: ${project.monday_item_id},
        group_id: "group_title"
      ) { id }
    }`);
    console.log('Move result:', JSON.stringify(moveResult?.errors || moveResult?.data));

    const statusResult = await mondayApi(`mutation {
      change_column_value(
        board_id: ${process.env.MONDAY_BOARD_ID},
        item_id: ${project.monday_item_id},
        column_id: "${COL.deliveryStatus}",
        value: "{\\"index\\":5}"
      ) { id }
    }`);
    console.log('Status reset result:', JSON.stringify(statusResult?.errors || statusResult?.data));

    await supabase.from('projects').update({ locked: true }).eq('id', project.id);
    console.log('Project locked');

    const resendClient = new Resend(process.env.RESEND_API_KEY);
    await resendClient.emails.send({
      from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>',
      to: 'info@xpressdraft.com.au',
      subject: `Client markup submitted — ${jobNumber}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:#2A2B29;">Client markup submitted</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.6;">
          <strong>${clientName}</strong> has submitted their markup for <strong>${jobNumber}</strong>.
        </p>
        <p style="color:#5E635B;font-size:14px;line-height:1.6;">
          The marked-up PDF has been uploaded to Monday under the Instructions column.
          The item has been moved to <strong>TO BE REVIEWED</strong>.
        </p>
        ${commentSummary ? `<div style="background:#F3EAE5;padding:16px;border-radius:8px;margin-top:16px;border-left:3px solid #EA672F;">
          <p style="font-weight:600;color:#2A2B29;margin:0 0 8px;">Comments:</p>
          <p style="color:#5E635B;font-size:13px;line-height:1.6;margin:0;">${commentSummary}</p>
        </div>` : ''}
        <a href="https://xpressdraft.monday.com/boards/${process.env.MONDAY_BOARD_ID}"
           style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;margin-top:24px;">
          View in Monday →
        </a>
      </div>`
    });

    console.log(`Submission notification sent for ${jobNumber}`);
    res.json({ ok: true });

  } catch (err) {
    console.error('Submit markup error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
