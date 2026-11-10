// Simulates Square/Twilio/Resend so the whole flow can be checked without real accounts.
import { createHmac } from 'node:crypto';
Object.assign(process.env, {
  SQUARE_ACCESS_TOKEN: 'x', SQUARE_WEBHOOK_SIGNATURE_KEY: 'sigkey', SQUARE_WEBHOOK_URL: 'https://hook.test/api/square-webhook',
  LINK_SECRET: 'secret123', PUBLIC_URL: 'https://hook.test', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', RAYA_MOBILE: '+447700900000',
  RESEND_API_KEY: 'r', PICKUP_ADDRESS: '1 Example Road, Sale',
});
const log = [];
let order, version = 1, bookings = {}, refunds = [];
const reset = () => {
  version = 1; bookings = {}; refunds = [];
  order = { id: 'ORD123', location_id: 'L1', version: 1, state: 'OPEN', ticket_name: 'A12',
    total_money: { amount: 3100, currency: 'GBP' }, tenders: [{ payment_id: 'PAY1' }],
    line_items: [{ name: 'The Classic Mac', variation_name: 'Medium', quantity: '2', modifiers: [{ name: 'Baked, ready to eat' }] },
                 { name: 'Curry Goat Macaroni Pie', variation_name: 'Regular', quantity: '1', note: 'extra crispy' }],
    fulfillments: [{ uid: 'F1', type: 'PICKUP', state: 'PROPOSED', pickup_details: { pickup_at: '2026-11-13T15:30:00Z', note: 'Gluten free if possible',
      recipient: { display_name: 'Jane Smith', email_address: 'jane@example.com', phone_number: '+447700900111' } } }] };
};
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), m = opt.method || 'GET', body = opt.body && typeof opt.body === 'string' && opt.body.startsWith('{') ? JSON.parse(opt.body) : opt.body;
  if (u.includes('twilio')) { log.push(['SMS', String(body.get('Body'))]); return json({ sid: 'SM1' }); }
  if (u.includes('resend')) { log.push(['EMAIL', body.to[0], body.subject]); return json({ id: 'E1' }); }
  const p = u.replace(/^https:\/\/[^/]+/, '');
  if (p === '/v2/orders/ORD123' && m === 'GET') return json({ order: structuredClone(order) });
  if (p === '/v2/orders/ORD123' && m === 'PUT') {
    if (body.order.version !== order.version) return json({ errors: [{ code: 'VERSION_MISMATCH' }] }, 400);
    order.metadata = { ...(order.metadata || {}), ...(body.order.metadata || {}) };
    for (const f of body.order.fulfillments || []) Object.assign(order.fulfillments.find((x) => x.uid === f.uid), f);
    order.version++; log.push(['ORDER', JSON.stringify(body.order.metadata || {}), (body.order.fulfillments || []).map((f) => f.state).join()]);
    return json({ order: structuredClone(order) });
  }
  if (p === '/v2/locations') return json({ locations: [{ id: 'L1', status: 'ACTIVE' }] });
  if (p.startsWith('/v2/catalog/search-catalog-items')) return json({ items: [{ item_data: { name: 'Online order collection', variations: [{ id: 'SV1' }] } }] });
  if (p.startsWith('/v2/catalog/object/SV1')) return json({ object: { id: 'SV1', version: 7, item_variation_data: { name: 'Collection', service_duration: 900000 } } });
  if (p.startsWith('/v2/bookings/team-member-booking-profiles')) return json({ team_member_booking_profiles: [{ team_member_id: 'TM1', display_name: 'Soraya Brown' }] });
  if (p === '/v2/customers/search') return json({ customers: [] });
  if (p === '/v2/customers' && m === 'POST') return json({ customer: { id: 'C1' } });
  if (p === '/v2/bookings' && m === 'POST') { const id = 'BK' + (Object.keys(bookings).length + 1); bookings[id] = { id, version: 1, status: 'ACCEPTED', ...body.booking }; log.push(['BOOKING', id, body.booking.start_at]); return json({ booking: bookings[id] }); }
  const bm = p.match(/^\/v2\/bookings\/(BK\d+)(\/cancel)?$/);
  if (bm && m === 'GET') return json({ booking: bookings[bm[1]] });
  if (bm && bm[2]) { bookings[bm[1]].status = 'CANCELLED_BY_SELLER'; log.push(['BOOKING CANCELLED', bm[1]]); return json({ booking: bookings[bm[1]] }); }
  if (bm && m === 'PUT') { bookings[bm[1]].start_at = body.booking.start_at; log.push(['BOOKING MOVED', bm[1], body.booking.start_at]); return json({ booking: bookings[bm[1]] }); }
  if (p === '/v2/payments/PAY1') return json({ payment: { id: 'PAY1', total_money: { amount: 3100, currency: 'GBP' }, refunded_money: { amount: refunds.reduce((a, r) => a + r, 0) } } });
  if (p === '/v2/refunds') { refunds.push(body.amount_money.amount); log.push(['REFUND', body.amount_money.amount]); return json({ refund: { id: 'R1' } }); }
  throw new Error('unmocked ' + m + ' ' + p);
};

const hook = (await import('../api/square-webhook.js')).POST;
const decide = await import('../api/decide.js');
const { sign } = await import('../lib/notify.js');
const send = (event) => { const raw = JSON.stringify(event); const sig = createHmac('sha256', 'sigkey').update('https://hook.test/api/square-webhook' + raw).digest('base64');
  return hook(new Request('https://hook.test/api/square-webhook', { method: 'POST', body: raw, headers: { 'x-square-hmacsha256-signature': sig } })); };
const paid = { type: 'payment.updated', data: { object: { payment: { status: 'COMPLETED', order_id: 'ORD123' } } } };
const post = (fields) => decide.POST(new Request('https://hook.test/api/decide', { method: 'POST', body: new URLSearchParams(fields) }));
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };

// ---- Accept path ----
reset();
let r = await send(paid); check(r.status === 200, 'webhook accepted');
check(log.filter((l) => l[0] === 'SMS').length === 1, 'Raya gets 1 text');
console.log('   text:\n   ' + log.find((l) => l[0] === 'SMS')[1].replace(/\n/g, '\n   '));
await send(paid); check(log.filter((l) => l[0] === 'SMS').length === 1, 'duplicate webhook does not text twice');
const bad = await hook(new Request('https://hook.test/x', { method: 'POST', body: '{}', headers: { 'x-square-hmacsha256-signature': 'nope' } })); check(bad.status === 401, 'fake webhook rejected');
let g = await decide.GET(new Request(`https://hook.test/api/decide?o=ORD123&t=${sign('ORD123')}`)); let html = await g.text();
check(html.includes('Jane Smith') && html.includes('Accept order') && html.includes('Gluten free'), 'review page shows order + buttons');
g = await decide.GET(new Request(`https://hook.test/api/decide?o=ORD123&t=wrong`)); check((await g.text()).includes('isn'), 'wrong link refused');
r = await post({ o: 'ORD123', t: sign('ORD123'), action: 'accept' }); html = await r.text();
check(html.includes('Accepted'), 'accept page confirms');
check(Object.keys(bookings).length === 1 && bookings.BK1.start_at === '2026-11-13T15:30:00Z', 'booking in calendar at collection time');
check(bookings.BK1.seller_note.includes('2 x The Classic Mac (Medium, Baked') && bookings.BK1.seller_note.includes('+447700900111') && bookings.BK1.seller_note.includes('jane@example.com'), 'calendar note has items, phone, email');
console.log('   calendar note:\n   ' + bookings.BK1.seller_note.replace(/\n/g, '\n   '));
check(order.fulfillments[0].state === 'RESERVED', 'order marked accepted in Square');
check(log.some((l) => l[0] === 'EMAIL' && l[2].includes('confirmed')), 'customer emailed confirmation');
await post({ o: 'ORD123', t: sign('ORD123'), action: 'accept' }); check(Object.keys(bookings).length === 1, 'double tap does not double book');
// time change
order.fulfillments[0].pickup_details.pickup_at = '2026-11-14T16:00:00Z'; order.version++;
await send({ type: 'order.fulfillment.updated', data: { id: 'ORD123' } });
check(bookings.BK1.start_at === '2026-11-14T16:00:00Z', 'time change moves the calendar entry');
// cancellation in Square app
order.fulfillments[0].state = 'CANCELED'; order.version++;
await send({ type: 'order.fulfillment.updated', data: { id: 'ORD123' } });
check(bookings.BK1.status.startsWith('CANCELLED'), 'cancelling in Square removes it from calendar');
check(log.some((l) => l[0] === 'SMS' && l[1].includes('cancelled')), 'Raya texted about cancellation');

// ---- Decline path ----
log.length = 0; reset();
await send(paid);
r = await post({ o: 'ORD123', t: sign('ORD123'), action: 'decline', reason: 'Fully booked, sorry!' }); html = await r.text();
check(html.includes('Declined'), 'decline page confirms');
check(refunds.length === 1 && refunds[0] === 3100, 'full refund issued');
check(order.fulfillments[0].state === 'CANCELED', 'order cancelled in Square');
check(Object.keys(bookings).length === 0, 'nothing put in calendar');
check(log.some((l) => l[0] === 'EMAIL' && l[2].includes('About your')), 'customer emailed about decline');
await post({ o: 'ORD123', t: sign('ORD123'), action: 'decline' }); check(refunds.length === 1, 'double tap does not refund twice');
