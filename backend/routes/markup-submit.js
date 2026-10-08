const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const axios = require('axios');
const FormDataNode = require('form-data');
const { Resend } = require('resend');
const { sendAdminSms } = require('../utils/sms');
const { logInstructionEntry } = require('../utils/instructionsLog');
const { storeMarkupCopy } = require('../utils/markupStore');

const BOARD_ID = process.env.MONDAY_BOARD_ID;
const DELIVERY_STATUS_COL = 'color_mm64ffyg';
const INSTRUCTIONS_FILE_COL = 'file_mkzh1knp';

// Multer errors happen before the handler runs, so without this an
// oversized PDF would crash with a raw error instead of a clear message.
function wrapUpload(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Your marked-up PDF is too large to submit (the limit is 50MB). Please contact info@xpressdraft.com.au.' });
        return res.status(400).json({ error: err.message || 'Upload failed' });
      }
      next();
    });
  };
}

async function mondayApi(query) {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.MONDAY_API_TOKEN },
    body: JSON.stringify({ query })
  });
  return res.json();
}

// Client submits their marked-up drawing. Order matters here:
//  1. keep our own copy first, so the file can never be lost;
//  2. push it to Monday and actually CHECK Monday's answer (it can reply
//     "OK" while rejecting the file, which used to produce a false
//     "uploaded to Monday" email);
//  3. log it into the contractor's Instructions & Markups history;
//  4. flag the item for review, lock the project, and notify everyone.
router.post('/submit-markup', auth, wrapUpload(upload.single('pdf')), async (req, res) => {
  console.log('SUBMIT MARKUP HIT');
  try {
    const { projectId, commentSummary, isVariation } = req.body;
    const variationRequested = isVariation === 'true';
    const pdfBuffer = req.file?.buffer;
    if (!pdfBuffer) return res.status(400).json({ error: 'PDF required' });
    const { data: project } = await supabase
      .from('projects')
      .select('*, client:users!projects_client_id_fkey(id, name, email), contractor:users!projects_contractor_id_fkey(id, name, email)')
      .eq('id', projectId).single();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const clientName = project.client?.name || 'Client';
    const jobNumber = project.job_number || project.name;
    const fileName = `${jobNumber}-Markup-${Date.now()}.pdf`;

    let copyUrl = null;
    try { copyUrl = await storeMarkupCopy(pdfBuffer, fileName, project.id); } catch (e) { console.error('Markup copy store error:', e.message); }

    let mondayError = null, newest = null;
    if (!project.monday_item_id) {
      mondayError = 'this project is not linked to a Monday item';
    } else {
      try {
        const form = new FormDataNode();
        form.append('query', `mutation ($file: File!) { add_file_to_column(item_id: ${project.monday_item_id}, column_id: "${INSTRUCTIONS_FILE_COL}", file: $file) { id column_values(ids: ["${INSTRUCTIONS_FILE_COL}"]) { value } } }`);
        form.append('variables', JSON.stringify({ file: null }));
        form.append('map', JSON.stringify({ file: ['variables.file'] }));
        form.append('file', Buffer.from(pdfBuffer), { filename: fileName, contentType: 'application/pdf', knownLength: pdfBuffer.length });
        const up = await axios.post('https://api.monday.com/v2/file', form, { headers: { 'Authorization': process.env.MONDAY_API_TOKEN, ...form.getHeaders() } });
        if (up.data?.errors?.length) throw new Error(up.data.errors[0].message || 'Monday rejected the file');
        const colVal = up.data?.data?.add_file_to_column?.column_values?.[0]?.value;
        const files = colVal ? (JSON.parse(colVal)?.files || []) : [];
        newest = files[files.length - 1] || null;
        console.log(`PDF uploaded to Monday for item ${project.monday_item_id}`);
      } catch (e) {
        mondayError = e.response?.data?.errors?.[0]?.message || e.message;
        console.error(`Monday markup upload failed for item ${project.monday_item_id}:`, mondayError);
      }
    }
    if (!copyUrl && mondayError) throw new Error(`Markup could not be saved anywhere (Monday: ${mondayError})`);

    // Logged from our own copy; the Monday asset id (when we have one) lets
    // the Instructions webhook recognise it and skip a duplicate entry.
    if (copyUrl) await logInstructionEntry(project.id, { source: 'client', content_type: 'file', file_name: fileName, file_url: copyUrl, asset_id: newest ? String(newest.assetId) : null });

    if (project.monday_item_id) {
      await mondayApi(`mutation { move_item_to_group(item_id: ${project.monday_item_id}, group_id: "group_title") { id } }`);
      await mondayApi(`mutation { change_column_value(board_id: ${BOARD_ID}, item_id: ${project.monday_item_id}, column_id: "${DELIVERY_STATUS_COL}", value: ${JSON.stringify(JSON.stringify({ index: 5 }))}) { id } }`);
    }
    await supabase.from('projects').update({ locked: true }).eq('id', project.id);

    const resendClient = new Resend(process.env.RESEND_API_KEY);
    const copyLink = copyUrl ? `<a href="${copyUrl}" style="display:inline-block;background:#2A2B29;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:16px;margin-right:8px;">Download marked-up PDF →</a>` : '';
    const comments = commentSummary ? `<div style="background:#F3EAE5;padding:16px;border-radius:8px;margin-top:16px;border-left:3px solid #EA672F;"><p style="font-weight:600;color:#2A2B29;margin:0 0 8px;">Comments:</p><p style="color:#5E635B;font-size:13px;line-height:1.6;margin:0;">${commentSummary}</p></div>` : '';
    if (mondayError) await sendAdminSms(`⚠️ ${jobNumber}: ${clientName}'s markup is saved in the portal but NOT on Monday (${mondayError}). Check your email for the download link.`);
    await resendClient.emails.send({
      from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>', to: 'info@xpressdraft.com.au',
      subject: mondayError ? `⚠️ Markup NOT on Monday — ${jobNumber}` : `Client markup submitted — ${jobNumber}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
        <h2 style="color:${mondayError ? '#E24B4A' : '#2A2B29'};">${mondayError ? 'Markup saved, but NOT on Monday' : 'Client markup submitted'}</h2>
        <p style="color:#5E635B;font-size:15px;line-height:1.8;"><strong>${clientName}</strong> has submitted their markup for <strong>${jobNumber}</strong>.<br/><br/>${mondayError
          ? `It could <strong>not</strong> be added to Monday: <strong>${mondayError}</strong>.<br/><br/>A copy is safely stored in the portal. Download it below and add it to the Instructions column on Monday manually.`
          : `The marked-up PDF has been uploaded to Monday under the Instructions column.<br/><br/>The item has been moved to <strong>TO BE REVIEWED</strong>.`}</p>
        ${comments}
        ${copyLink}<a href="https://xpressdraft.monday.com/boards/${BOARD_ID}" style="display:inline-block;background:#EA672F;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:16px;">View in Monday →</a>
      </div>`
    });
    if (project.contractor?.email) {
      await resendClient.emails.send({
        from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>', to: project.contractor.email,
        subject: `Client markup submitted — ${jobNumber}`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;"><h2 style="color:#2A2B29;">Client markup submitted</h2><p style="color:#5E635B;font-size:15px;line-height:1.8;">Hi ${project.contractor.name},<br/><br/><strong>${clientName}</strong> has submitted their markup for <strong>${jobNumber}</strong>. Please check the Instructions &amp; Markups tab in your portal.</p></div>`
      });
    }
    if (project.client?.email) {
      await resendClient.emails.send({
        from: 'Xpress Draft <noreply@xpressdraft.com.au>', to: project.client.email, cc: 'info@xpressdraft.com.au',
        subject: `Your change request has been received — ${jobNumber}`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
          <h2 style="color:#2A2B29;">Change request received</h2>
          <p style="color:#5E635B;font-size:15px;line-height:1.8;">Hi ${clientName},<br/><br/>This confirms we've received your submitted markup and change request for <strong>${jobNumber}</strong>.</p>
          ${commentSummary ? `<div style="background:#F3EAE5;padding:16px;border-radius:8px;margin:16px 0;border-left:3px solid #EA672F;"><p style="font-weight:600;color:#2A2B29;margin:0 0 8px;">What you requested:</p><p style="color:#5E635B;font-size:13px;line-height:1.6;margin:0;">${commentSummary}</p></div>` : ''}
          ${variationRequested ? `<p style="color:#5E635B;font-size:15px;line-height:1.8;">As noted before submitting, this revision is beyond your included allowance and will incur a <strong>variation fee</strong>. Our team will be in touch shortly with the cost before proceeding with the work.</p>` : `<p style="color:#5E635B;font-size:15px;line-height:1.8;">Our team will review and respond shortly.</p>`}
          <p style="color:#5E635B;font-size:13px;line-height:1.8;">Questions? Reach us at <a href="mailto:info@xpressdraft.com.au" style="color:#EA672F;">info@xpressdraft.com.au</a>.</p>
        </div>`
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Submit markup error:', err);
    await sendAdminSms(`⚠️ Markup submission FAILED for project ${req.body.projectId || 'unknown'}. Check email for details.`);
    try {
      const resendClient = new Resend(process.env.RESEND_API_KEY);
      await resendClient.emails.send({
        from: 'Xpress Draft Portal <noreply@xpressdraft.com.au>', to: 'info@xpressdraft.com.au',
        subject: `⚠️ Markup submission FAILED — check project ${req.body.projectId || ''}`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;">
          <h2 style="color:#E24B4A;">Markup submission failed</h2>
          <p style="color:#5E635B;font-size:15px;line-height:1.8;">A client's markup submission could not be saved.<br/><br/>Project ID: <strong>${req.body.projectId || 'unknown'}</strong><br/>Error: <strong>${err.message}</strong><br/><br/>The client has been told their submission may not have gone through. Please check this project manually.</p>
        </div>`
      });
    } catch (emailErr) { console.error('Failed to send failure notification:', emailErr.message); }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
