// Square calls this when payments and orders change.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { newPaidOrder, sync, bookingChanged } from '../lib/flow.js';
import { textRaya } from '../lib/notify.js';

function validSignature(raw, header) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const url = process.env.SQUARE_WEBHOOK_URL;
  if (!key || !url || !header) return false;
  const expected = createHmac('sha256', key).update(url + raw).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('x-square-hmacsha256-signature'))) {
    return new Response('bad signature', { status: 401 });
  }
  let event;
  try { event = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }

  const type = event.type || '';
  try {
    let result = { ignored: type };
    if (type.startsWith('payment.')) {
      const p = event.data?.object?.payment;
      if (p?.status === 'COMPLETED' && p.order_id) result = await newPaidOrder(p.order_id);
    } else if (type === 'booking.updated' || type === 'booking.created') {
      const id = event.data?.object?.booking?.id || event.data?.id;
      if (id) result = await bookingChanged(id);
    } else if (type === 'order.fulfillment.updated' || type === 'order.updated') {
      if (event.data?.id) result = await sync(event.data.id);
    }
    console.log(type, JSON.stringify(result));
    return Response.json({ ok: true, result });
  } catch (e) {
    console.error(type, e.message);
    // Let Raya know something needs a manual look, then ask Square to retry.
    if (type.startsWith('payment.')) {
      await textRaya(`Mac and Melt: a new order came in but the auto-text hit a problem (${e.message.slice(0, 80)}). Please check Orders in the Square app.`).catch(() => {});
    }
    return new Response('error', { status: 500 });
  }
}

export function GET() {
  return new Response('Mac and Melt order connector is running.');
}
