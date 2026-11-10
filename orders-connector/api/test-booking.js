// One-off check: /api/test-booking?key=<LINK_SECRET>
// Creates a test booking 3 weeks ahead, reports whether Square made it a REQUEST (pending) or ACCEPTED, then cancels it.
import { createBooking, cancelBooking, findOrCreateCustomer, sq, locationId, collectionService } from '../lib/square.js';

export async function GET(request) {
  const k = new URL(request.url).searchParams.get('key');
  const want = (process.env.LINK_SECRET || '').trim().toLowerCase();
  if (!want) return new Response('Not ready: LINK_SECRET is not loaded yet. In Vercel go to Deployments, then ... on the top one, then Redeploy.', { status: 404 });
  if ((k || '').trim().toLowerCase() !== want) return new Response(`Not found: that key doesn't match LINK_SECRET (yours has ${(k || '').trim().length} characters, the saved one has ${want.length}).`, { status: 404 });
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
    let availability;
    try {
      const [loc, svc] = await Promise.all([locationId(), collectionService()]);
      const end = new Date(d.getTime() + 2 * 86400000);
      const r = await sq('/v2/bookings/availability/search', { method: 'POST', asBuyer: true, body: { query: { filter: {
        start_at_range: { start_at: new Date(d.getTime() - 86400000).toISOString(), end_at: end.toISOString() },
        location_id: loc, segment_filters: [{ service_variation_id: svc.id }] } } } });
      availability = `${(r.availabilities || []).length} free slots found for the collection service`;
    } catch (e2) { availability = `availability check failed: ${e2.message}`; }
    return Response.json({ problem: e.message, availability, tried: d.toISOString() }, { status: 500 });
  }
}
