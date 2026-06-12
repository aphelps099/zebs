/* ==========================================================================
   ZFIT — STORE CONFIG
   This is the ONLY file you touch to plug Stripe in.

   HOW TO CONNECT STRIPE (no code, ~10 minutes):
   1. In the Stripe Dashboard, create a Product for each item below.
   2. For each product, create a PAYMENT LINK (Stripe > Payment Links > New).
      - Set the price shown on the site.
      - Set the "After payment" redirect to:  https://YOURDOMAIN/zfit/thanks.html
   3. Paste each Payment Link URL into STRIPE_LINKS below.
   4. Done. Every Buy button on the site reads from this file.

   Until a link is filled in, Buy buttons fall back to the email opt-in
   (so the funnel still captures the lead instead of dead-ending).
   ========================================================================== */

const ZFIT = {

  // Stripe Payment Link URLs — paste them between the quotes.
  STRIPE_LINKS: {
    'abs':         '',   // 10 MIN ABS — $19
    'booty':       '',   // 10 MIN BOOTY — $19
    'total':       '',   // 10 MIN TOTAL — $19  (working title — rename when Zeb names video #3)
    'bundle':      '',   // ZFIT ALL-ACCESS BUNDLE (all 3 videos) — $39
    'supp-daily':  '',   // ZFIT FUEL — Daily Essentials — $49
    'supp-active': '',   // ZFIT FUEL — Active Support — $39
    'supp-joint':  '',   // ZFIT FUEL — Joint Support — $39
    'supp-rest':   '',   // ZFIT FUEL — Rest & Recovery — $39
    'supp-stack':  '',   // ZFIT FUEL — Full Stack — $129
  },

  // Email opt-in form endpoint (Mailchimp / ConvertKit / Beehiiv form action URL).
  // Leave blank to store sign-ups in the browser and show a thank-you message
  // (fine for testing, replace before launch).
  OPTIN_ACTION: '',

  // Where leads land after opting in (the free workout / funnel step 2).
  OPTIN_REDIRECT: 'free-workout.html',
};

/* --------------------------------------------------------------------------
   Wiring — no need to edit below this line.
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {

  // Buy buttons: <a class="js-buy" data-product="abs">
  document.querySelectorAll('.js-buy').forEach(btn => {
    const key = btn.dataset.product;
    const link = ZFIT.STRIPE_LINKS[key];
    if (link) {
      btn.setAttribute('href', link);
    } else {
      // No Stripe link yet — send the click to the opt-in so we never lose a lead.
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const optin = document.querySelector('.optin input[type="email"]');
        if (optin) {
          optin.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => optin.focus({ preventScroll: true }), 500);
        } else {
          window.location.href = 'start.html';
        }
      });
    }
  });

  // Opt-in forms: <form class="js-optin">
  document.querySelectorAll('.js-optin').forEach(form => {
    if (ZFIT.OPTIN_ACTION) {
      form.setAttribute('action', ZFIT.OPTIN_ACTION);
      form.setAttribute('method', 'POST');
      return;
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]').value;
      try {
        const leads = JSON.parse(localStorage.getItem('zfit_leads') || '[]');
        leads.push({ email, at: new Date().toISOString() });
        localStorage.setItem('zfit_leads', JSON.stringify(leads));
      } catch (err) { /* private mode — still redirect */ }
      window.location.href = ZFIT.OPTIN_REDIRECT;
    });
  });

  // Fade-up on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) en.target.classList.add('visible'); });
  }, { threshold: 0.12 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));

  // Sticky CTA bar — appears after the visitor scrolls past the hero
  const sticky = document.querySelector('.sticky-cta');
  if (sticky) {
    window.addEventListener('scroll', () => {
      sticky.classList.toggle('show', window.scrollY > window.innerHeight * 0.7);
    }, { passive: true });
  }

  // Scroll progress bar
  const progress = document.querySelector('.progress');
  if (progress) {
    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const pct = h.scrollTop / (h.scrollHeight - h.clientHeight) * 100;
      progress.style.width = pct + '%';
    }, { passive: true });
  }
});
