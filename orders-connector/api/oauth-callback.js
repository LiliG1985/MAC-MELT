// Square sends Raya back here after she clicks Allow. Shows the one value to paste into Vercel.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = (body) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<body style="font:16px/1.5 system-ui;max-width:640px;margin:30px auto;padding:0 16px;color:#1d2b2e">${body}</body>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code');
  if (!code) return page('<h2>No approval received</h2><p>Please start again from the connect link.</p>');
  const res = await fetch('https://connect.squareup.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' },
    body: JSON.stringify({ client_id: process.env.SQUARE_APP_ID, client_secret: process.env.SQUARE_APP_SECRET, code, grant_type: 'authorization_code' }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.refresh_token) return page(`<h2>Square said no</h2><p>${esc(d.errors?.[0]?.detail || d.message || res.status)}</p>`);
  return page(`<h2 style="color:#0B4A54">✓ Approved</h2>
<p><b>Last step:</b> copy the value below and add it in Vercel → Environment Variables as a <b>Secret</b>:</p>
<p>Key: <code>SQUARE_BOOKING_REFRESH_TOKEN</code></p>
<textarea readonly style="width:100%;height:90px;font:14px monospace" onclick="this.select()">${esc(d.refresh_token)}</textarea>
<p>Then Redeploy. Don't share this value with anyone, and close this page when done.</p>`);
}
