# Big Drive

Intercity student transport booking site for ABUAD (Afe Babalola University).

## Structure
```
BigDrive/
├── index.html          Main page (routes, booking flow, admin dashboard, tracking)
├── favicon.png          Placeholder favicon — replace with the real logo mark
├── styles/
│   └── style.css        All styling
├── scripts/
│   └── script.js        All app logic
├── images/               Drop hero.jpg, logo.png, etc. here, then reference them
│                         from index.html / style.css as "images/filename.ext"
└── assets/               Anything else (documents, extra icons, etc.)
```

## Editing the essentials
Open `scripts/script.js` and look for `DEFAULT_CONFIG` near the top — that's where
routes, prices, bank details, luggage fees, WhatsApp numbers, and the admin PIN live
as starting values. Once the site has been opened once, all of this is editable live
from the **Admin** button in the footer (PIN `2580` by default) without touching code.

## Adding your real logo
1. Drop your logo file into `images/` (e.g. `images/logo.png`).
2. In `index.html`, replace the inline SVG logo mark in the header (search for `logo-mark`)
   with `<img src="images/logo.png" class="logo-mark" alt="Big Drive">`.
3. Do the same anywhere else the placeholder mark appears (loading screen, ticket, admin header).
4. Replace `favicon.png` with a real favicon export of your logo.
5. Update the color variables at the top of `styles/style.css` (the `:root` block) to
   match your brand palette.

## Data & storage
This site's real backend is **Supabase** — a single `kv_store` table (see
`supabase/schema.sql`) holding `config` and `bookings` as JSON. Every device that
opens the site reads/writes the same data, so bookings, routes, and admin changes
sync everywhere automatically — no per-browser limitation.

The `Storage` adapter (top of `scripts/script.js`) talks to Supabase directly via
its REST API using the project URL + anon key configured there. If a request fails
outright (e.g. the device is offline), it falls back to that browser's own
`localStorage` so the app doesn't hard-break — but that fallback data stays local
until the connection is back and won't appear on other devices.

**Known limitation:** the database currently allows any request with the site's
public anon key to read/write — there's no login system yet, so anyone with basic
technical knowledge could interact with the data directly. Fine for MVP testing;
before a wider real-money launch, add proper admin authentication (e.g. Supabase
Auth) and tighten the Row Level Security policies in `supabase/schema.sql` so only
authenticated admins can update booking status and trip details.

## Deploying
Any static host works since there's no build step:
- **GitHub Pages:** push this repo, enable Pages on the `main` branch, root folder.
- **Netlify/Vercel:** drag-and-drop the folder, or connect the repo.
- **Custom domain:** point your domain's DNS at whichever host you choose, per their docs.

## Admin dashboard
Footer → "Admin" → PIN `2580` (change it under Admin → Settings).
Tabs: Bookings (search, verify payments, assign driver/bus/seat/pickup),
Routes (add/remove, plus a Resumption/Vacation season toggle that flips every
route's direction automatically), Settings (WhatsApp numbers, bank details, PIN).
