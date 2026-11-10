// Setup check: /api/health?key=<LINK_SECRET>. Shows what's configured, never the secret values.
import { locationId, collectionService, teamMemberId, sq } from '../lib/square.js';

export async function GET(request) {
  const k = new URL(request.url).searchParams.get('key');
  const want = (process.env.LINK_SECRET || '').trim();
  if (!want) return new Response('Not ready: LINK_SECRET is not loaded yet. In Vercel go to Deployments, then ... on the top one, then Redeploy.', { status: 404 });
  if ((k || '').trim() !== want) return new Response(`Not found: that key doesn't match LINK_SECRET (yours has ${(k || '').trim().length} characters, the saved one has ${want.length}).`, { status: 404 });

  const env = ['SQUARE_ACCESS_TOKEN', 'SQUARE_WEBHOOK_SIGNATURE_KEY', 'SQUARE_WEBHOOK_URL', 'LINK_SECRET', 'PUBLIC_URL',
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'RAYA_MOBILE', 'RESEND_API_KEY', 'PICKUP_ADDRESS'];
  const out = { env: Object.fromEntries(env.map((n) => [n, process.env[n] ? 'set' : 'MISSING'])) };
  const check = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = `PROBLEM: ${e.message}`; } };
  await check('square_location', locationId);
  await check('appointments_service', async () => { const s = await collectionService(); return `${s.name || 'found'} (${s.duration} min)`; });
  await check('team_member', teamMemberId);
  await check('appointments_plan', async () => {
    const r = await sq(`/v2/bookings/location-booking-profiles?limit=5`);
    return (r.location_booking_profiles || []).map((p) => `${p.location_id}: online booking ${p.online_booking_enabled ? 'on' : 'off'}`).join(', ') || 'ok';
  });
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
