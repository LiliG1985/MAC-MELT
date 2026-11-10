// What happens to an order: new -> text Raya -> accept/decline -> calendar, emails, refunds.
import * as S from './square.js';
import * as O from './order.js';
import { textRaya, reviewLink, email } from './notify.js';

const fulfillUid = (order) => O.pickupFulfillment(order)?.uid;
const fState = (order) => O.pickupFulfillment(order)?.state;

// Write our status into the order. Uses the order version as a lock so two
// webhooks arriving together can't both act.
async function setMeta(order, fields, extra = {}) {
  return S.updateOrder(order, { metadata: { ...fields }, ...extra });
}

// 1. A paid order has arrived.
export async function newPaidOrder(orderId) {
  let order = await S.getOrder(orderId);
  if (!O.pickupFulfillment(order)) return { skipped: 'no pickup' };
  const m = O.meta(order);
  if (m.mm_texted || (m.mm_status && m.mm_status !== 'pending')) return { skipped: 'already handled' };
  // Another delivery of the same event is mid-way through; let it finish.
  if (m.mm_status === 'pending' && Date.now() - Number(m.mm_pending_at || 0) < 120000) return { skipped: 'in progress' };
  if (['CANCELED', 'COMPLETED'].includes(fState(order))) return { skipped: 'not active' };

  {
    try {
      order = await setMeta(order, { mm_status: 'pending', mm_pending_at: String(Date.now()), mm_pickup: O.pickupAt(order) || '' });
    } catch (e) {
      if (e instanceof S.SquareError && e.has('VERSION_MISMATCH')) return { skipped: 'race' };
      throw e;
    }
  }

  const c = O.customer(order);
  await textRaya([
    `New Mac and Melt order #${O.shortRef(order)}`,
    O.when(O.pickupAt(order), { short: true }),
    `${c.name}, ${O.itemCount(order)} items, ${O.money(order.total_money)}`,
    `Accept or decline: ${reviewLink(order.id)}`,
  ].join('\n'));
  await setMeta(await S.getOrder(orderId), { mm_texted: '1' }).catch(() => {});
  return { notified: true };
}

// 2a. Raya accepts.
export async function accept(orderId) {
  let order = await S.getOrder(orderId);
  const m = O.meta(order);
  if (m.mm_status === 'accepted') return { order, already: true };
  if (m.mm_status === 'declined' || m.mm_status === 'cancelled' || fState(order) === 'CANCELED') {
    throw new Error('This order has already been declined or cancelled.');
  }
  if (!O.pickupAt(order)) throw new Error('This order has no collection time, so it can\'t go in the calendar.');

  const c = O.customer(order);
  let booking;
  if (m.mm_booking) {
    booking = await S.getBooking(m.mm_booking);
  } else {
    const cust = order.customer_id
      ? { id: order.customer_id }
      : await S.findOrCreateCustomer({ name: c.name, email: c.email, phone: c.phone });
    booking = await S.createBooking({
      startAt: O.pickupAt(order),
      customerId: cust.id,
      sellerNote: O.calendarNote(order),
      customerNote: O.orderNote(order) || undefined,
    });
  }

  const patch = { metadata: { mm_status: 'accepted', mm_booking: booking.id, mm_pickup: O.pickupAt(order) } };
  if (fState(order) === 'PROPOSED') patch.fulfillments = [{ uid: fulfillUid(order), state: 'RESERVED' }];
  order = await S.updateOrder(order, patch);

  await email({
    to: c.email,
    subject: `Your Mac and Melt order is confirmed: ${O.when(O.pickupAt(order), { short: true })}`,
    heading: `You're booked in, ${c.name.split(' ')[0]}!`,
    paragraphs: [
      `Raya has accepted your order #${O.shortRef(order)}. Your collection time is ${O.when(O.pickupAt(order))}.`,
      process.env.PICKUP_ADDRESS ? `Collection address: ${process.env.PICKUP_ADDRESS}` : 'We\'ll send the collection address separately.',
      process.env.PICKUP_INSTRUCTIONS || 'When you arrive, please knock to let us know you\'re here, with your order number, and wait in the car for your order to be brought out.',
      'Your order:',
    ],
    list: [...O.itemLines(order), `Total paid: ${O.money(order.total_money)}`],
  });
  return { order, booking };
}

// 2b. Raya declines: refund in full, cancel, tell the customer.
export async function decline(orderId, reason) {
  let order = await S.getOrder(orderId);
  const m = O.meta(order);
  if (m.mm_status === 'declined') return { order, already: true };
  if (m.mm_booking) await S.cancelBooking(m.mm_booking).catch(() => {});

  const refunds = [];
  for (const t of order.tenders || []) {
    if (!t.payment_id) continue;
    const p = await S.getPayment(t.payment_id);
    const left = Number(p.total_money?.amount || 0) - Number(p.refunded_money?.amount || 0);
    if (left > 0) refunds.push(await S.refundPayment(p.id, { amount: left, currency: p.total_money.currency }, reason || 'Order declined by Mac and Melt'));
  }

  const patch = { metadata: { mm_status: 'declined' } };
  if (!['CANCELED', 'COMPLETED'].includes(fState(order))) patch.fulfillments = [{ uid: fulfillUid(order), state: 'CANCELED' }];
  order = await S.updateOrder(await S.getOrder(orderId), patch);

  const c = O.customer(order);
  await email({
    to: c.email,
    subject: 'About your Mac and Melt order',
    heading: `Sorry, ${c.name.split(' ')[0]}`,
    paragraphs: [
      `Unfortunately we can't fulfil your order #${O.shortRef(order)} for ${O.when(O.pickupAt(order))}.`,
      reason ? `Raya says: ${reason}` : 'We\'re a small home kitchen and sometimes have to limit orders. We\'re really sorry.',
      `You've been refunded in full (${O.money(order.total_money)}). It usually shows in your account within 3 to 5 working days.`,
      'We\'d love to cook for you another time.',
    ],
  });
  return { order, refunds };
}

// 3. Something changed on the order (cancelled in the Square app, time moved, refunded).
export async function sync(orderId) {
  const order = await S.getOrder(orderId);
  const m = O.meta(order);
  if (!m.mm_status || m.mm_status === 'declined' || m.mm_status === 'cancelled') return { skipped: true };

  if (fState(order) === 'CANCELED' || order.state === 'CANCELED') {
    if (m.mm_booking) await S.cancelBooking(m.mm_booking).catch((e) => console.error('cancel booking', e.message));
    await S.updateOrder(order, { metadata: { mm_status: 'cancelled' } }).catch(() => {});
    await textRaya(`Order #${O.shortRef(order)} (${O.customer(order).name}) was cancelled${m.mm_booking ? ' and removed from your calendar' : ''}.`);
    return { cancelled: true };
  }

  const now = O.pickupAt(order);
  if (m.mm_status === 'accepted' && m.mm_booking && now && now !== m.mm_pickup) {
    await S.moveBooking(m.mm_booking, now);
    await S.updateOrder(order, { metadata: { mm_pickup: now } });
    await textRaya(`Order #${O.shortRef(order)} (${O.customer(order).name}) moved to ${O.when(now, { short: true })}. Calendar updated.`);
    return { moved: true };
  }
  return { nochange: true };
}
