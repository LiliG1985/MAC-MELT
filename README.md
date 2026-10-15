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

The catering button goes to her existing Jotform enquiry form.

## Domain (do this last)

When she's happy with the Vercel version:

1. In Vercel → Project → **Settings → Domains**, add `macandmelt.co.uk` and `www.macandmelt.co.uk`.
2. Vercel shows the DNS records to set. Change them wherever the domain is registered (probably Square).
3. Keep her Square account and pre-order page live. Only the domain moves.

## Images

Photos and the logo currently load from her Square site. To make the site fully independent, save them into an `images/` folder and update the `src` paths in `index.html`. Add more food photos the same way; the site will look even better with a photo per dish.

## Check before launch

- Opening hours: "Fridays from 2pm" came from the old site.
- Dish descriptions for the pies and the catering bullet points were written fresh. Have her check them.
- Her Instagram link is `instagram.com/mac_amd_melt_` (with "amd"). That's what the old site uses; confirm it's correct.
