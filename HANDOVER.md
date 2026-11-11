# Mac and Melt: handover notes

Full handover (with diagrams and tables): https://claude.ai/artifact/3gPjUCactamgA8RZKVNjVo
This file is the short version for anyone (person or AI) editing this repo.

## What lives where
- Website: this repo, static HTML/CSS/JS, GitHub Pages, domain www.macandmelt.co.uk (CNAME file). Push to `main` = deploy.
- DNS: GoDaddy (Raya). A @ -> 185.199.108-111.153, CNAME www -> lilig1985.github.io.
- Shop: https://macandmelt.square.site (Square Online, Order Online page). All Preorder buttons link here.
- Order connector: `orders-connector/` -> Vercel project `mac-melt-orders-connector`. Turns paid shop orders into
  Square Appointments booking requests; Raya accepts/declines in Square; decline = automatic refund.
  Tests: `node orders-connector/test/sim.mjs`. Env var names are in `orders-connector/README.md`. No secrets in the repo.
- Forms: catering.html / wholesale.html post to Formspree (`data-endpoint`), emailed to macandmelt2024@outlook.com.

## Editing rules
- After changing styles.css or script.js, bump `?v=` on every page.
- Check every change on phone width (390px) and desktop.
- Brand: cheese #F5C02E, turquoise #0F5F6B / #0B4A54, cream #FFF4D6. No navy, no green. Fraunces headings, Figtree body,
  Bagel Fat One for the wordmark only. Real photos, drips must blend, no dotted/grain backgrounds.
- Never publish the house number. No phone or WhatsApp on the site. British English.
- Markers: `<!-- MARKET DATES -->`, `<!-- OFF MENU (restore when back) -->`, `<!-- REVIEW LINK -->`.

## Square gotchas
- Shop menu = Item library. Old booking menu = Service library (all off except "Online order collection", which must stay
  bookable online; Appointments online booking must stay enabled).
- Shop: location hours Fri/Sat 15:30-20:00, 1 pickup per 15 min, 7 days ahead, item prep 5 min.
  Appointments: 15-min intervals, 1h notice, 90 days, 18/day, accept automatically OFF. Keep them matched
  (check https://mac-melt-orders-connector.vercel.app/api/slots?key=<LINK_SECRET>).
- Never click "Undo catalogue" in the Item library.
