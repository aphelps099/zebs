# ZFIT — Ecommerce Site & Sales Funnel

The ZFIT store for Zeb's 10-minute workout video series and the ZFIT Fuel
supplement line. Static HTML — host it anywhere (Netlify, GitHub Pages,
Squarespace code blocks won't work; use a real static host).

## Pages

| Page | Role in the funnel |
|---|---|
| `index.html` | Simple homepage / storefront — 3 videos, bundle, supplements teaser |
| `start.html` | **Landing page (funnel entry).** Sticky CTA bar, scroll progress, motivation-heavy copy, two email opt-ins. Send all ads/social traffic here. |
| `free-workout.html` | Post-opt-in: delivers the free video + tripwire bundle offer ($39) |
| `abs.html` / `booty.html` | Product pages — $19 each, bundle upsell strip |
| `total.html` | Video #3 — **working title "10 Min Total"**, waitlist capture until Zeb names/films it |
| `supplements.html` | ZFIT Fuel — 4 SKUs + Full Stack bundle ($129) |
| `thanks.html` | Post-purchase confirmation + cross-sell (set as Stripe redirect) |

## The funnel

```
Social / YouTube / ads
        │
        ▼
 start.html  ── email opt-in (lead magnet: free 10-min workout)
        │
        ▼
 free-workout.html ── watch free video → tripwire: $39 All-Access Bundle
        │                                   │
        ▼                                   ▼
 email nurture (see ../email/)         Stripe Checkout
   weekly value + launch emails             │
        │                                   ▼
        ▼                              thanks.html ── cross-sell: ZFIT Fuel
 single video pages ($19) ──────────────────┘         supplements ($39–129)
```

Ascension ladder: **Free workout → $19 single → $39 bundle → $39–129 Fuel →
1-on-1 / online coaching with Zeb** (the back-end, see ../products/packages.html).

## Plugging in Stripe (the only step required to go live)

Everything is wired through **`config.js`** — no other file needs editing.

1. Stripe Dashboard → Products → create one product per item.
2. Create a **Payment Link** for each, set after-payment redirect to
   `https://YOURDOMAIN/zfit/thanks.html`.
3. Paste each link into `STRIPE_LINKS` in `config.js`.

Until a link is set, that Buy button gracefully falls back to the email
opt-in, so no click is ever wasted.

## Plugging in email

Set `OPTIN_ACTION` in `config.js` to your Mailchimp/ConvertKit/Beehiiv form
action URL. Until then, sign-ups are stored in the visitor's localStorage and
redirected to `free-workout.html` (fine for demos, not for launch).

## Before launch checklist

- [ ] Stripe payment links pasted into `config.js`
- [ ] Email provider action URL in `config.js`
- [ ] Free workout video embed pasted into `free-workout.html`
- [ ] Zeb names video #3 → update `total.html`, `index.html`, `free-workout.html`, `config.js`
- [ ] Real testimonials swapped in (current ones are placeholders)
- [ ] Photos of Zeb added to hero/product cards (currently typographic placeholders)
