// The page Raya opens from her text: see the order, tap Accept or Decline.
import { getOrder } from '../lib/square.js';
import * as O from '../lib/order.js';
import { verify } from '../lib/notify.js';
import { accept, decline } from '../lib/flow.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(title, body) {
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} | Mac and Melt</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#F7F1E3;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2b2e}
  header{background:#0B4A54;color:#F5C02E;padding:16px 18px;font-weight:800;font-size:20px}
  main{max-width:520px;margin:0 auto;padding:18px 16px 40px}
  .card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 6px 20px rgba(11,74,84,.08);margin-bottom:16px}
  h1{font-size:22px;margin:0 0 4px;color:#0B4A54} .muted{color:#5b6b6e;font-size:14px}
  dl{margin:12px 0 0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px} dt{font-weight:700} dd{margin:0;word-break:break-word}
  ul{padding-left:18px;margin:8px 0} li{margin:4px 0}
  .btn{display:block;width:100%;border:0;border-radius:12px;padding:16px;font-size:18px;font-weight:800;cursor:pointer;margin-top:10px}
  .yes{background:#0F5F6B;color:#fff} .no{background:#fff;color:#B3261E;border:2px solid #B3261E}
  textarea{width:100%;border:1px solid #c9c2b0;border-radius:10px;padding:10px;font:inherit;min-height:70px}
  .status{padding:12px 14px;border-radius:10px;font-weight:700} .ok{background:#E3F4EA;color:#14532D} .bad{background:#FDECEA;color:#8A1C14}
  details summary{cursor:pointer;color:#B3261E;font-weight:700;margin-top:14px}
</style></head><body><header>Mac and Melt orders</header><main>${body}</main></body></html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function summary(order) {
  const c = O.customer(order);
  const note = O.orderNote(order);
  return `<div class="card">
    <h1>Order #${esc(O.shortRef(order))}</h1>
    <div class="muted">${esc(O.when(O.pickupAt(order)))}</div>
    <dl>
      <dt>Name</dt><dd>${esc(c.name)}</dd>
      ${c.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></dd>` : ''}
      ${c.email ? `<dt>Email</dt><dd>${esc(c.email)}</dd>` : ''}
      <dt>Total</dt><dd>${esc(O.money(order.total_money))}</dd>
    </dl>
    <ul>${O.itemLines(order).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    ${note ? `<p><strong>Special requests:</strong> ${esc(note)}</p>` : ''}
  </div>`;
}

function statusBox(order) {
  const s = O.meta(order).mm_status;
  if (s === 'accepted') return '<div class="status ok">✓ Accepted. It\'s in your Appointments calendar and the customer has been emailed.</div>';
  if (s === 'declined') return '<div class="status bad">Declined. The customer has been refunded in full and emailed.</div>';
  if (s === 'cancelled') return '<div class="status bad">This order was cancelled.</div>';
  return '';
}

async function load(request) {
  const url = new URL(request.url);
  let o = url.searchParams.get('o'), t = url.searchParams.get('t');
  let form = null;
  if (request.method === 'POST') {
    form = await request.formData();
    o = form.get('o'); t = form.get('t');
  }
  if (!verify(o, t)) return { error: page('Link not valid', '<div class="card"><h1>That link isn\'t valid</h1><p>Please use the link in your latest order text.</p></div>') };
  return { o, t, form };
}

export async function GET(request) {
  const { o, t, error } = await load(request);
  if (error) return error;
  const order = await getOrder(o);
  const done = statusBox(order);
  return page(`Order #${O.shortRef(order)}`, summary(order) + (done || `
    <form method="post"><input type="hidden" name="o" value="${esc(o)}"><input type="hidden" name="t" value="${esc(t)}">
      <button class="btn yes" name="action" value="accept">✓ Accept order</button>
      <details><summary>Decline this order</summary>
        <p class="muted">The customer is refunded in full and emailed. You can add a short reason for them (optional).</p>
        <textarea name="reason" maxlength="200" placeholder="e.g. Fully booked this weekend, sorry!"></textarea>
        <button class="btn no" name="action" value="decline">Decline and refund</button>
      </details>
    </form>`));
}

export async function POST(request) {
  const { o, form, error } = await load(request);
  if (error) return error;
  const action = form.get('action');
  try {
    const r = action === 'accept' ? await accept(o)
      : action === 'decline' ? await decline(o, String(form.get('reason') || '').trim())
      : null;
    if (!r) return page('Nothing done', '<div class="card">Nothing was changed.</div>');
    const order = await getOrder(o);
    return page('Done', statusBox(order) + summary(order));
  } catch (e) {
    console.error('decide', action, e.message);
    return page('Problem', `<div class="status bad">Something went wrong: ${esc(e.message)}</div>
      <p>Nothing has been charged twice. Please try again, or handle this order in the Square app.</p>`);
  }
}
