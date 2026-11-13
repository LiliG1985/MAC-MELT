// What happens to an order: new -> text Raya -> accept/decline -> calendar, emails, refunds.
import * as S from './square.js';
import * as O from './order.js';
import { textRaya, reviewLink, email, alertRaya } from './notify.js';

const fulfillUid = (order) => O.pickupFulfillment(order)?.uid;
const fState = (order) => O.pickupFulfillment(order)?.state;

// Write our status into the order. Uses the order version as a lock so two
// webhooks arriving together can't both act.
async function setMeta(order, fields, extra = {}) {
  return S.updateOrder(order, { metadata: { ...fields }, ...extra });
}

// No text service configured: put the order into Square Appointments as a booking
// request, so Square sends Raya its usual accept/decline text and emails the customer.
export const squareMode = () => !process.env.TWILIO_ACCOUNT_SID;

async function requestInAppointments(order) {
  if (!O.pickupAt(order)) throw new Error('Order has no collection time');
  const c = O.customer(order);
  const cust = order.customer_id ? { id: order.customer_id } : await S.findOrCreateCustomer(c);
  let booking;
  try {
    booking = await S.createBooking({
      startAt: O.pickupAt(order),
      customerId: cust.id,
      sellerNote: O.calendarNote(order),
      customerNote: O.calendarNote(order),
    });
  } catch (e) {
    // Square refused the request (too short notice, day full, time unavailable).
    // Nothing goes in the calendar unaccepted: refund the customer and tell Raya.
    const refused = e instanceof S.SquareError && e.status >= 400 && e.status < 500 && ![401, 403].includes(e.status);
    if (!refused) {
      await alertRaya(`URGENT: order #${O.shortRef(order)} (${c.name}, ${O.when(O.pickupAt(order))}) could not be sent to your calendar (${e.message.slice(0, 120)}). Please check Square > Orders.`).catch(() => {});
      throw e;
    }
    await decline(order.id, 'Sorry, we could not take an order for that collection time. Please choose another time.');
    await alertRaya(`Order #${O.shortRef(order)} from ${c.name} for ${O.when(O.pickupAt(order))} was NOT accepted (Square refused the time: ${e.message.slice(0, 120)}). The customer has been refunded in full.`).catch(() => {});
    return { refused: true, reason: e.message };
  }
  if (booking.status === 'ACCEPTED') {
    // Should never happen with "Accept bookings automatically" off. Undo it: cancel + refund + tell Raya.
    await S.updateOrder(await S.getOrder(order.id), { metadata: { mm_booking: booking.id } }).catch(() => {});
    await decline(order.id, 'Sorry, we could not confirm this order. Please try again.');
    await alertRaya(`Order #${O.shortRef(order)} from ${c.name} came in already confirmed, so it was cancelled and refunded. Check Appointments > Settings: "Accept bookings automatically" must be OFF.`).catch(() => {});
    return { cancelled_auto_accepted: booking.id };
  }
  const accepted = false;
  const patch = { metadata: { mm_status: accepted ? 'accepted' : 'requested', mm_booking: booking.id, mm_pickup: O.pickupAt(order), mm_texted: '1' } };
  if (accepted && fState(order) === 'PROPOSED') patch.fulfillments = [{ uid: fulfillUid(order), state: 'RESERVED' }];
  await S.updateOrder(await S.getOrder(order.id), patch);
  return { booking: booking.id, bookingStatus: booking.status };
}

// Raya accepted / declined / cancelled the booking in Square Appointments.
export async function bookingChanged(bookingId) {
  const b = await S.getBooking(bookingId);
  const ref = /Ref: (\S+)/.exec(`${b.seller_note || ''}\n${b.customer_note || ''}`)?.[1];
  if (!ref) {
    // Someone booked the free "Online order collection" slot directly on the booking page,
    // without ordering any food. Cancel it so it can't block a real order.
    const svc = await S.collectionService().catch(() => null);
    const usesCollection = svc && (b.appointment_segments || []).some((x) => x.service_variation_id === svc.id);
    if (usesCollection && !/CANCELLED|DECLINED/.test(b.status || '')) {
      await S.cancelBooking(b.id).catch((e) => console.error('auto-cancel stray booking', e.message));
      return { cancelled_stray_collection_booking: b.id };
    }
    return { skipped: 'not an online order' };
  }
  let order = await S.getOrder(ref);
  const m = O.meta(order);
  if (m.mm_booking !== b.id) return { skipped: 'booking not linked' };
  if (b.status === 'ACCEPTED' && m.mm_status === 'requested') {
    const patch = { metadata: { mm_status: 'accepted' } };
    if (fState(order) === 'PROPOSED') patch.fulfillments = [{ uid: fulfillUid(order), state: 'RESERVED' }];
    await S.updateOrder(order, patch);
    return { accepted: true };
  }
  if (/DECLINED|CANCELLED|NO_SHOW/.test(b.status || '') && !['declined', 'cancelled'].includes(m.mm_status)) {
    await decline(order.id, b.status === 'DECLINED' ? '' : '');
    return { refunded: true, status: b.status };
  }
  if (b.status === 'ACCEPTED' && m.mm_status === 'accepted' && b.start_at && b.start_at !== m.mm_pickup) {
    await S.updateOrder(order, { metadata: { mm_pickup: b.start_at } }).catch(() => {});
    return { moved: true };
  }
  return { nochange: b.status };
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

  if (squareMode()) return requestInAppointments(order);

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
      customerNote: O.calendarNote(order),
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
