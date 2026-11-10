// One-off check: /api/test-booking?key=<LINK_SECRET>
// Creates a test booking 3 weeks ahead, reports whether Square made it a REQUEST (pending) or ACCEPTED, then cancels it.
import { createBooking, cancelBooking, findOrCreateCustomer } from '../lib/square.js';

export async function GET(request) {
  const k = new URL(request.url).searchParams.get('key');
  const want = (process.env.LINK_SECRET || '').trim();
  if (!want) return new Response('Not ready: LINK_SECRET is not loaded yet. In Vercel go to Deployments, then ... on the top one, then Redeploy.', { status: 404 });
  if ((k || '').trim() !== want) return new Response(`Not found: that key doesn't match LINK_SECRET (yours has ${(k || '').trim().length} characters, the saved one has ${want.length}).`, { status: 404 });
  const d = new Date(Date.now() + 21 * 86400000);
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1); // a Friday
  d.setUTCHours(16, 0, 0, 0);
  try {
    const cust = await findOrCreateCustomer({ name: 'Test Connector', email: 'test-connector@example.com' });
    const b = await createBooking({ startAt: d.toISOString(), customerId: cust.id, sellerNote: 'TEST from order connector, will be cancelled', customerNote: 'TEST' });
    const status = b.status;
    await cancelBooking(b.id).catch(() => {});
    const verdict = status === 'PENDING'
      ? 'PENDING: orders will arrive as booking requests. Square will text Raya to accept/decline, just like now.'
      : `${status}: Square accepted it straight away (no request text). We need the extra permission step.`;
    return Response.json({ status, verdict, cancelled_after_test: true });
  } catch (e) {
    return Response.json({ problem: e.message }, { status: 500 });
  }
}
