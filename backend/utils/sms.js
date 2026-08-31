async function sendTwilioSms(toPhone, message) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER || !toPhone) {
    console.log('SMS not sent — Twilio env vars or recipient phone missing');
    return;
  }
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const body = new URLSearchParams({ To: toPhone, From: process.env.TWILIO_FROM_NUMBER, Body: message.slice(0, 1500) });
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) console.error('Twilio SMS failed:', await res.text());
  } catch (e) {
    console.error('SMS send error:', e.message);
  }
}

// Alerts admin — used for internal events like contractor declines or
// failed submissions.
async function sendAdminSms(message) {
  await sendTwilioSms(process.env.ADMIN_SMS_PHONE, message);
}

// Notifies a client directly — used for delivery notifications.
async function sendClientSms(toPhone, message) {
  await sendTwilioSms(toPhone, message);
}

module.exports = { sendAdminSms, sendClientSms };
