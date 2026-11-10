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
  return Response.redirect(auth.toString(), 302);
}
