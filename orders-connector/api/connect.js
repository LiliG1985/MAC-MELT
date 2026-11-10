// One-time setup: /api/connect?key=<LINK_SECRET>
// Sends Raya to Square to approve "customer-level" booking permission, so online orders
// arrive in Appointments as booking REQUESTS (Square then texts her to accept/decline).
export async function GET(request) {
  const url = new URL(request.url);
  const want = (process.env.LINK_SECRET || '').trim().toLowerCase();
  if (!want || (url.searchParams.get('key') || '').trim().toLowerCase() !== want) return new Response('Not found', { status: 404 });
  if (!process.env.SQUARE_APP_ID) return new Response('SQUARE_APP_ID is missing in Vercel.', { status: 400 });
  const auth = new URL('https://connect.squareup.com/oauth2/authorize');
  auth.searchParams.set('client_id', process.env.SQUARE_APP_ID);
  auth.searchParams.set('scope', 'APPOINTMENTS_READ APPOINTMENTS_WRITE CUSTOMERS_READ CUSTOMERS_WRITE');
  auth.searchParams.set('session', 'false');
  auth.searchParams.set('state', 'mm');
  const href = auth.toString().replace(/&/g, '&amp;');
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<body style="font:17px/1.5 system-ui;max-width:560px;margin:40px auto;padding:0 16px;color:#1d2b2e">
<h2 style="color:#0B4A54">Connect Mac and Melt orders to Appointments</h2>
<p>Click the button, check it says <b>Mac and Melt</b>, then click <b>Allow</b>.</p>
<p><a href="${href}" style="display:inline-block;background:#0B4A54;color:#fff;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none">Continue to Square →</a></p>
</body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
