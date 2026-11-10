// Helpers to read a Square Online order in plain English.
const TZ = 'Europe/London';

export const money = (m) => (m ? `£${(Number(m.amount) / 100).toFixed(2)}` : '£0.00');

export function pickupFulfillment(order) {
  return (order.fulfillments || []).find((f) => f.type === 'PICKUP') || null;
}

export function pickupAt(order) {
  const f = pickupFulfillment(order);
  return f?.pickup_details?.pickup_at || null;
}

export function customer(order) {
  const r = pickupFulfillment(order)?.pickup_details?.recipient || {};
  return {
    name: r.display_name || [r.given_name, r.family_name].filter(Boolean).join(' ') || 'Customer',
    email: r.email_address || '',
    phone: r.phone_number || '',
  };
}

export function when(iso, opts = {}) {
  if (!iso) return 'no time chosen';
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: opts.short ? 'short' : 'long', day: 'numeric', month: opts.short ? 'short' : 'long' });
  const time = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return `${day} at ${time}`;
}

export function itemLines(order) {
  return (order.line_items || []).map((li) => {
    const bits = [li.variation_name && li.variation_name !== 'Regular' ? li.variation_name : null,
      ...(li.modifiers || []).map((m) => m.name)].filter(Boolean);
    const extra = bits.length ? ` (${bits.join(', ')})` : '';
    const note = li.note ? ` [note: ${li.note}]` : '';
    return `${li.quantity} x ${li.name}${extra}${note}`;
  });
}

export function itemCount(order) {
  return (order.line_items || []).reduce((n, li) => n + Number(li.quantity || 0), 0);
}

export function orderNote(order) {
  return pickupFulfillment(order)?.pickup_details?.note || '';
}

export function shortRef(order) {
  return order.ticket_name || order.reference_id || order.id.slice(-6).toUpperCase();
}

// Text that goes into the Appointments calendar entry.
export function calendarNote(order) {
  const c = customer(order);
  return [
    `ONLINE ORDER #${shortRef(order)}`,
    `Collection: ${when(pickupAt(order))}`,
    `Customer: ${c.name}`,
    c.phone && `Phone: ${c.phone}`,
    c.email && `Email: ${c.email}`,
    ' ',
    'Items:',
    ...itemLines(order),
    ' ',
    orderNote(order) && `Special requests: ${orderNote(order)}`,
    `Total paid: ${money(order.total_money)}`,
  ].filter(Boolean).join('\n');
}

export const meta = (order) => order.metadata || {};
