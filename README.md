# Big Drive

Intercity student transport booking site for ABUAD (Afe Babalola University).

## Structure
```
BigDrive/
├── index.html            Customer site (routes, booking flow, tracking)
├── admin/
│   └── index.html         Separate admin dashboard — served at /admin
├── favicon.png
├── styles/
│   ├── style.css          Shared styling (customer site + admin)
│   └── admin.css          Admin-only layout styles
├── scripts/
│   ├── shared.js           Data layer: Supabase, CONFIG/BOOKINGS, load/persist —
│   │                       used by BOTH index.html and admin/index.html
│   ├── script.js            Customer-facing booking flow logic only
│   └── admin.js             Admin dashboard logic only
├── supabase/
│   └── schema.sql           Run once in Supabase → SQL Editor
├── images/                  Drop hero.jpg, etc. here
├── assets/
└── vercel.json               Clean URL config so /admin works without .html
```

## Admin dashboard
Live at **/admin** (separate from the customer site — doesn't affect the booking
experience at all). PIN-gated (default `2580`, changeable under Admin → Settings).

Flow: **Departure Board** (pick a route) → **Travel Dates** (pick a date, shows
passenger counts computed live from bookings) → **Bookings** (full detail table for
that route+date: confirm/cancel/delete, assign driver/bus/seat/pickup, search).
Also: **Manage Routes** (season toggle, add/remove routes, open/close travel dates,
seat capacity) and **Settings** (WhatsApp numbers, bank details, PIN).

A 🔔 pending-count badge shows in the header whenever bookings are awaiting payment
verification.

## Editing the essentials
Open `scripts/shared.js` and look for `DEFAULT_CONFIG` near the top — starting
values for routes, prices, bank details, luggage fees, WhatsApp numbers, and the
admin PIN. Once the site has been opened once, all of this is editable live from
the admin dashboard without touching code.

## Data & storage
Real backend: **Supabase** (a single `kv_store` table — see `supabase/schema.sql`).
Every device that opens either page reads/writes the same data, so bookings,
routes, and settings sync everywhere automatically.

`scripts/shared.js`'s `Storage` adapter talks to Supabase directly. It reports
whether a write actually reached Supabase (`viaSupabase: true/false`) — critical
operations like clearing bookings check this and refuse to report success if the
write silently fell back to local-only storage (this was a real bug in an earlier
version: clears could appear to work in the UI while the database still had the
old data). If a request fails outright (e.g. offline), it falls back to that
browser's own `localStorage` so the app doesn't hard-break, but that data won't be
visible on other devices until the connection is back.

**Known limitation:** the database currently allows any request with the site's
public anon key to read/write — there's no login system yet beyond the admin PIN.
Fine for MVP testing; before a wider real-money launch, add proper admin
authentication (e.g. Supabase Auth) and tighten the Row Level Security policies in
`supabase/schema.sql`.

## Deploying
Static site, no build step. Push to GitHub, connect the repo in Vercel (or
Netlify/GitHub Pages), done. `vercel.json` ensures `/admin` resolves cleanly.

## Branding
"Powered by Jerla" appears as a small, muted credit line in two places — the
header tagline and the ticket — not as a competing badge. Big Drive's own logo and
wordmark stay the primary focus everywhere.
