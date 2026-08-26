// Sends a short SMS alert to the admin phone via Twilio's REST API.
// Silently does nothing if Twilio env vars aren't set, so this is safe
// to call from anywhere without breaking the calling route if SMS isn't
// configured yet.
async function sendAdminSms(message) {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER || !process.env.ADMIN_SMS_PHONE) {
      console.log('SMS not sent — Twilio env vars not fully configured');
      return;
    }
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const body = new URLSearchParams({
      To: process.env.ADMIN_SMS_PHONE,
      From: process.env.TWILIO_FROM_NUMBER,
      Body: message.slice(0, 300),
    });
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

module.exports = { sendAdminSms };
