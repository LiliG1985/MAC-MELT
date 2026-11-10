# Mac and Melt order connector

Square shop order → text to Raya → Accept / Decline → Square Appointments calendar + customer email.

Deployed on Vercel with **Root Directory = `orders-connector`**. Settings live in Vercel environment variables (never in this repo):

| Variable | What |
|---|---|
| SQUARE_ACCESS_TOKEN | Square developer app, Production access token |
| SQUARE_WEBHOOK_SIGNATURE_KEY | From the Square webhook subscription |
| SQUARE_WEBHOOK_URL | `https://<vercel-domain>/api/square-webhook` (exactly as entered in Square) |
| PUBLIC_URL | `https://<vercel-domain>` |
| LINK_SECRET | Any long random text |
| TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN | Twilio console |
| TWILIO_FROM | `MacandMelt` (sender name) or a Twilio number |
| RAYA_MOBILE | Raya's mobile, e.g. +447… |
| RESEND_API_KEY | Resend (customer emails) |
| EMAIL_FROM | e.g. `Mac and Melt <orders@macandmelt.co.uk>` |
| PICKUP_ADDRESS | Full collection address (only sent after an order is accepted) |
| SQUARE_SERVICE_NAME | Appointments service used for collections (default "Online order collection") |

Webhook events to subscribe: `payment.created`, `payment.updated`, `order.updated`, `order.fulfillment.updated`.

Check setup: `https://<vercel-domain>/api/health?key=<LINK_SECRET>`. Test locally: `node test/sim.mjs`.

<!-- deployed 2026-11-10T10:13:36Z -->
