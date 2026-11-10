// /api/slots?key=<LINK_SECRET>: which collection times the Appointments calendar accepts next Fri/Sat.
import { sq, locationId, collectionService } from '../lib/square.js';

export async function GET(request) {
  const k = (new URL(request.url).searchParams.get('key') || '').trim().toLowerCase();
  if (!process.env.LINK_SECRET || k !== process.env.LINK_SECRET.trim().toLowerCase()) return new Response('Not found', { status: 404 });
  const [loc, svc] = await Promise.all([locationId(), collectionService()]);
  const start = new Date(Date.now() + 86400000); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 8 * 86400000);
  try {
    const r = await sq('/v2/bookings/availability/search', { method: 'POST', asBuyer: true, body: { query: { filter: {
      start_at_range: { start_at: start.toISOString(), end_at: end.toISOString() }, location_id: loc,
      segment_filters: [{ service_variation_id: svc.id }] } } } });
    const byDay = {};
    for (const a of r.availabilities || []) {
      const d = new Date(a.start_at);
      const day = d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
      (byDay[day] ||= []).push(d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }));
    }
    const summary = Object.fromEntries(Object.entries(byDay).map(([d, t]) => [d, `${t[0]} to ${t[t.length - 1]} (${t.length} slots)`]));
    return Response.json({ uk_times: summary, note: 'Shop offers 15:30 to 19:45 (or 20:00). These should cover the same.' });
  } catch (e) {
    return Response.json({ problem: e.message }, { status: 500 });
  }
}
