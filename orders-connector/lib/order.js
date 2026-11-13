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

// +4407943… / +447943… -> 07943…
export function ukPhone(p) {
  if (!p) return '';
  const d = String(p).replace(/[^\d+]/g, '');
  if (d.startsWith('+440')) return '0' + d.slice(4);
  if (d.startsWith('+44')) return '0' + d.slice(3);
  return p;
}

export function customer(order) {
  const r = pickupFulfillment(order)?.pickup_details?.recipient || {};
  return {
    name: r.display_name || [r.given_name, r.family_name].filter(Boolean).join(' ') || 'Customer',
    email: r.email_address || '',
    phone: ukPhone(r.phone_number || ''),
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
  const f = pickupFulfillment(order);
  return f?.pickup_details?.note || order.note || f?.pickup_details?.recipient?.note || '';
}

export function shortRef(order) {
  return order.ticket_name || order.reference_id || order.id.slice(-6).toUpperCase();
}

// Text that goes into the Appointments calendar entry.
export function calendarNote(order) {
  const c = customer(order);
  return [
    `PAID ONLINE: ${money(order.total_money)} (nothing to charge at collection)`,
    `ONLINE ORDER #${shortRef(order)}`,
    `Collection: ${when(pickupAt(order))}`,
    `Customer: ${c.name}`,
    c.phone && `Phone: ${c.phone}`,
    c.email && `Email: ${c.email}`,
    'ITEMS:',
    ...itemLines(order).map((l) => `• ${l}`),
    orderNote(order) && `Special requests: ${orderNote(order)}`,
    `Total paid: ${money(order.total_money)}`,
    `Ref: ${order.id}`,
  ].filter((l) => l && l.trim()).join(' | ');
}

export const meta = (order) => order.metadata || {};
