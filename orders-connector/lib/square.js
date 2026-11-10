// Minimal Square REST client (no SDK needed).
const BASE = process.env.SQUARE_ENV === 'sandbox'
  ? 'https://connect.squareupsandbox.com'
  : 'https://connect.squareup.com';
const VERSION = '2025-01-23';

export class SquareError extends Error {
  constructor(status, errors) {
    super((errors || []).map((e) => `${e.code}: ${e.detail || ''}`).join('; ') || `Square HTTP ${status}`);
    this.status = status;
    this.errors = errors || [];
  }
  has(code) { return this.errors.some((e) => e.code === code); }
}

export async function sq(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Square-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors?.length) throw new SquareError(res.status, data.errors);
  return data;
}

export const key = () => crypto.randomUUID();

export async function getOrder(id) {
  return (await sq(`/v2/orders/${id}`)).order;
}

// Sparse update. Returns the new order. Throws VERSION_MISMATCH if someone else updated first.
export async function updateOrder(order, patch) {
  const body = { idempotency_key: key(), order: { location_id: order.location_id, version: order.version, ...patch } };
  return (await sq(`/v2/orders/${order.id}`, { method: 'PUT', body })).order;
}

export async function getPayment(id) {
  return (await sq(`/v2/payments/${id}`)).payment;
}

export async function refundPayment(paymentId, amountMoney, reason) {
  return (await sq('/v2/refunds', {
    method: 'POST',
    body: { idempotency_key: key(), payment_id: paymentId, amount_money: amountMoney, reason },
  })).refund;
}

// ---------- Customers ----------
export async function findOrCreateCustomer({ name, email, phone }) {
  if (email) {
    const r = await sq('/v2/customers/search', {
      method: 'POST',
      body: { query: { filter: { email_address: { exact: email } } }, limit: 1 },
    });
    if (r.customers?.length) return r.customers[0];
  }
  if (phone) {
    const r = await sq('/v2/customers/search', {
      method: 'POST',
      body: { query: { filter: { phone_number: { exact: phone } } }, limit: 1 },
    }).catch(() => ({}));
    if (r.customers?.length) return r.customers[0];
  }
  const [given, ...rest] = (name || 'Online customer').trim().split(/\s+/);
  const body = { idempotency_key: key(), given_name: given, family_name: rest.join(' ') || undefined, email_address: email || undefined };
  if (phone) body.phone_number = phone;
  try {
    return (await sq('/v2/customers', { method: 'POST', body })).customer;
  } catch (e) {
    // A badly formatted phone number shouldn't block the booking.
    delete body.phone_number;
    body.idempotency_key = key();
    body.note = phone ? `Phone: ${phone}` : undefined;
    return (await sq('/v2/customers', { method: 'POST', body })).customer;
  }
}

// ---------- Appointments setup lookups (cached per warm instance) ----------
let cache = {};

export async function locationId() {
  if (process.env.SQUARE_LOCATION_ID) return process.env.SQUARE_LOCATION_ID;
  if (!cache.location) {
    const { locations = [] } = await sq('/v2/locations');
    cache.location = (locations.find((l) => l.status === 'ACTIVE') || locations[0])?.id;
  }
  return cache.location;
}

export async function collectionService() {
  if (cache.service) return cache.service;
  const name = (process.env.SQUARE_SERVICE_NAME || 'Online order collection').toLowerCase();
  let variationId = process.env.SQUARE_SERVICE_VARIATION_ID;
  if (!variationId) {
    const r = await sq('/v2/catalog/search-catalog-items', {
      method: 'POST',
      body: { text_filter: process.env.SQUARE_SERVICE_NAME || 'Online order collection', product_types: ['APPOINTMENTS_SERVICE'] },
    });
    const item = (r.items || []).find((i) => i.item_data?.name?.toLowerCase() === name) || r.items?.[0];
    variationId = item?.item_data?.variations?.[0]?.id;
    if (!variationId) throw new Error(`Couldn't find the Appointments service "${name}". Create it in Square (Service library).`);
  }
  const obj = (await sq(`/v2/catalog/object/${variationId}`)).object;
  cache.service = {
    id: obj.id,
    version: obj.version,
    name: obj.item_variation_data?.name,
    duration: Math.max(5, Math.round((obj.item_variation_data?.service_duration || 15 * 60000) / 60000)),
  };
  return cache.service;
}

export async function teamMemberId() {
  if (process.env.SQUARE_TEAM_MEMBER_ID) return process.env.SQUARE_TEAM_MEMBER_ID;
  if (!cache.team) {
    const r = await sq('/v2/bookings/team-member-booking-profiles?bookable_only=true&limit=10');
    const want = (process.env.SQUARE_TEAM_MEMBER_NAME || 'Soraya').toLowerCase();
    const p = (r.team_member_booking_profiles || []);
    cache.team = (p.find((t) => t.display_name?.toLowerCase().includes(want)) || p[0])?.team_member_id;
    if (!cache.team) throw new Error('No bookable team member found in Square Appointments.');
  }
  return cache.team;
}

// ---------- Bookings ----------
export async function createBooking({ startAt, customerId, customerNote, sellerNote }) {
  const [loc, svc, tm] = await Promise.all([locationId(), collectionService(), teamMemberId()]);
  const make = (withSellerNote) => sq('/v2/bookings', {
    method: 'POST',
    body: {
      idempotency_key: key(),
      booking: {
        location_id: loc,
        start_at: startAt,
        customer_id: customerId,
        customer_note: customerNote?.slice(0, 1500),
        seller_note: withSellerNote ? sellerNote?.slice(0, 1500) : undefined,
        appointment_segments: [{
          service_variation_id: svc.id,
          service_variation_version: svc.version,
          team_member_id: tm,
          duration_minutes: svc.duration,
        }],
      },
    },
  });
  try { return (await make(true)).booking; }
  catch (e) { if (sellerNote) return (await make(false)).booking; throw e; }
}

export async function getBooking(id) {
  return (await sq(`/v2/bookings/${id}`)).booking;
}

export async function cancelBooking(id) {
  const b = await getBooking(id);
  if (b.status?.startsWith('CANCELLED')) return b;
  return (await sq(`/v2/bookings/${id}/cancel`, {
    method: 'POST',
    body: { idempotency_key: key(), booking_version: b.version },
  })).booking;
}

export async function moveBooking(id, startAt) {
  const b = await getBooking(id);
  if (b.start_at === startAt) return b;
  return (await sq(`/v2/bookings/${id}`, {
    method: 'PUT',
    body: { idempotency_key: key(), booking: { version: b.version, start_at: startAt } },
  })).booking;
}
