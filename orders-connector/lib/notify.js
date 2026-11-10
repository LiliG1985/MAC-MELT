// Texts to Raya (Twilio) and emails to customers (Resend).
import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------- Signed links so only Raya's link can accept/decline ----------
export function sign(orderId) {
  return createHmac('sha256', process.env.LINK_SECRET).update(`order:${orderId}`).digest('base64url').slice(0, 32);
}
export function verify(orderId, token) {
  if (!orderId || !token) return false;
  const a = Buffer.from(sign(orderId));
  const b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}
export function reviewLink(orderId) {
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/api/decide?o=${encodeURIComponent(orderId)}&t=${sign(orderId)}`;
}

// ---------- SMS to Raya ----------
export async function textRaya(body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const to = process.env.RAYA_MOBILE;
  if (!sid || !tok || !to) { console.warn('SMS not configured; message was:', body); return null; }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM || 'MacandMelt', Body: body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio: ${data.message || res.status}`);
  return data.sid;
}

// ---------- Email ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function email({ to, subject, heading, paragraphs = [], list = [] }) {
  if (!to) return null;
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('Email not configured; would have emailed', to, subject); return null; }
  const html = `<!doctype html><html><body style="margin:0;background:#F7F1E3;font-family:Arial,Helvetica,sans-serif;color:#1d2b2e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0B4A54;padding:22px 28px;color:#F5C02E;font-size:22px;font-weight:bold">Mac and Melt</td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 14px;font-size:22px;color:#0B4A54">${esc(heading)}</h1>
      ${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${esc(p)}</p>`).join('')}
      ${list.length ? `<ul style="margin:6px 0 16px;padding-left:18px;font-size:15px;line-height:1.6">${list.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      <p style="margin:18px 0 0;font-size:14px;color:#555">Any questions, just reply to this email.<br>Raya, Mac and Melt</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
  const text = [heading, '', ...paragraphs, '', ...list.map((l) => `- ${l}`), '', 'Any questions, just reply to this email.', 'Raya, Mac and Melt'].join('\n');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Mac and Melt <orders@macandmelt.co.uk>',
      reply_to: process.env.EMAIL_REPLY_TO || 'macandmelt2024@outlook.com',
      to: [to], subject, html, text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Email: ${data.message || res.status}`);
  return data.id;
}
