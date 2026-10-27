# Mac and Melt website

A plain HTML/CSS/JS site. There's no build step, framework or npm install.

```
index.html   the whole page
styles.css   colours, fonts, layout
script.js    mobile menu and food tabs
vercel.json  Vercel settings (clean URLs)
```

## Put it online

1. Create a new GitHub repo (e.g. `mac-and-melt`) and upload these files, or:
   ```
   git init && git add . && git commit -m "Mac and Melt site"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/mac-and-melt.git
   git push -u origin main
   ```
2. In Vercel: **Add New → Project → Import** the repo. Framework preset: **Other**. Click **Deploy**.
3. Every push to `main` updates the live site automatically.

## Square (orders and payments)

Payments stay in Square. Every order button points at her Square pre-order page. Search `index.html` for `SQUARE:` to find them all:

```
https://book.squareup.com/appointments/wcd63i6rsgu1ch/location/LYRM016FMPTPK/services
```

If she switches to a Square Online ordering page later, swap that URL in those places.

Catering has its own page (`catering.html`) with an enquiry form. Until it's connected, sending the form opens an email to macandmelt2024@outlook.com with all the details filled in. To have enquiries arrive straight in her inbox, create a free form at formspree.io and paste its form URL into `data-endpoint=""` on the form in `catering.html` (search for `ENQUIRY FORM`). The home page has a general "Send us a message" contact form that works the same way (search for `CONTACT FORM` in `index.html`); the same Formspree URL can go in both.

## Domain (do this last)

When she's happy with the Vercel version:

1. In Vercel → Project → **Settings → Domains**, add `macandmelt.co.uk` and `www.macandmelt.co.uk`.
2. Vercel shows the DNS records to set. Change them wherever the domain is registered (probably Square).
3. Keep her Square account and pre-order page live. Only the domain moves.

## Images

Photos and the logo currently load from her Square accounts (the logo is the badge version Square serves on her booking page, because the original logo file is 12,500px wide and would slow the site down). To make the site fully independent, save them into an `images/` folder and update the `src` paths in `index.html`. Add more food photos the same way; the site will look even better with a photo per dish.

## Check before launch

- Opening hours are Friday and Saturday, 2pm to 8pm (from the old site). To change them, edit the hours table in `index.html` and `OPEN_DAYS`, `OPEN` and `CLOSE` near the bottom of `script.js`.
- Dish descriptions for the pies and the catering bullet points were written fresh. Have her check them.
- The WhatsApp link in "Get in touch" uses +44 7546 009465 (search `wa.me` in `index.html` to change it). Check that number is on WhatsApp.
- Her Instagram link is `instagram.com/mac_amd_melt_` (with "amd"). That's what the old site uses; confirm it's correct.

## Dish banner photos

The rotating dish banner under "The food" has one slide per dish. Slides with a photo use crops of the catering photo. The others show the logo on a brand colour. To give a dish its own photo, add the image to `images/` and set it on that slide in `index.html`, for example:

```html
<article class="dish dish--photo" style="--pos: 50% 50%; --size: 100%">
  <div class="dish__media" style="background-image: url(images/curry-goat-pie.jpg)" role="img" aria-label="Curry goat macaroni pie"></div>
```

## Meet Raya

The "Meet Raya" section uses the photo of her at a catering event from the old homepage. The two short paragraphs about her were written fresh, so have her check them. The quote is the mission statement from the old site.

## Newsletter

There is a "Stay in the loop" section near the bottom and a sign-up card that slides in once per visitor. Until it's connected to a mailing list, signing up opens an email to macandmelt2024@outlook.com.

To collect sign-ups properly, create a free form at formspree.io (or a Mailchimp embedded form), then paste its form URL into both `data-endpoint=""` attributes in `index.html` (search for `NEWSLETTER`).
