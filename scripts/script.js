/* ============================================================
   CUSTOMER-FACING SITE LOGIC
   Data layer (Supabase, CONFIG, BOOKINGS, Storage) lives in
   shared.js, loaded before this file. Admin logic now lives
   entirely in admin/index.html + scripts/admin.js — this file
   no longer contains any admin code.
   ============================================================ */

let booking = {};
let step = 0;

async function initApp(){
  document.getElementById('app-error').style.display = 'none';
  document.getElementById('app-loading').style.display = 'flex';
  try{
    CONFIG = await loadConfig();
    BOOKINGS = await loadBookings();
    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('year').textContent = new Date().getFullYear();
    renderTicker();
    renderRouteBoard();
  } catch(e){
    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app-error').style.display = 'flex';
  }
}
initApp();

function renderTicker(){
  const el = document.getElementById('ticker-track');
  const items = CONFIG.routes.filter(r => r.active !== false).map(r => { const c = routeCities(r); return `<span><b>${c.from}</b> → ${c.to} · ₦${r.price.toLocaleString()} · ${r.duration}</span>`; }).join('');
  el.innerHTML = items + items;
}
function renderRouteBoard(){
  const board = document.getElementById('route-board');
  const visibleRoutes = CONFIG.routes.filter(r => r.active !== false);
  if(!visibleRoutes.length){
    board.innerHTML = `<div class="empty-board">No routes yet. Add one from Admin → Routes.</div>`;
    return;
  }
  board.innerHTML = visibleRoutes.map(r => { const c = routeCities(r); return `
    <div class="route-row" onclick="startBooking('${r.id}')">
      <div class="route-line"><span class="route-city">${c.from}</span><span class="route-track"></span><span class="route-city">${c.to}</span></div>
      <div class="route-meta"><span>${r.duration}</span><span class="route-price">₦${r.price.toLocaleString()}</span></div>
      <span class="route-arrow">→</span>
    </div>`; }).join('');
}
function scrollToRoutes(){ document.getElementById('routes').scrollIntoView({behavior:'smooth'}); }
function scrollToTrack(){ document.getElementById('track').scrollIntoView({behavior:'smooth'}); }
function toggleMobileNav(){ document.getElementById('nav-links').classList.toggle('open'); }
function closeMobileNav(){ document.getElementById('nav-links').classList.remove('open'); }

function startBooking(routeId){
  const route = CONFIG.routes.find(r => r.id === routeId);
  const c = routeCities(route);
  booking = { route, from: c.from, to: c.to, date:null, time:null, seats:1, luggage:[], name:'', phone:'', emergencyContact:'', ref: genRef(), saving:false };
  step = 0;
  document.getElementById('booking-modal').classList.add('open');
  renderStep();
}
function closeBooking(){ document.getElementById('booking-modal').classList.remove('open'); }
function genRef(){ return 'BD-' + Math.floor(1000 + Math.random()*9000); }

function availableDatesFor(route){
  const todayStr = new Date().toISOString().slice(0,10);
  return (route.availableDates || [])
    .filter(d => !d.closed && d.date >= todayStr)
    .sort((a,b) => a.date < b.date ? -1 : 1)
    .map(d => ({
      value: d.date,
      label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short' })
    }));
}

const TOTAL_STEPS = 6;
function updateProgress(){
  const bar = document.getElementById('progress-bar');
  bar.innerHTML = '';
  for(let i=0;i<TOTAL_STEPS;i++){
    const el = document.createElement('i');
    if(i <= step) el.classList.add('done');
    bar.appendChild(el);
  }
}
function luggageTotal(){
  return booking.luggage.reduce((sum,id) => {
    const opt = CONFIG.luggageOptions.find(o=>o.id===id);
    return sum + (opt ? opt.price : 0);
  }, 0);
}
function grandTotal(){ return (booking.route ? booking.route.price * booking.seats : 0) + luggageTotal(); }

function ticketMarkup(b, opts){
  opts = opts || {};
  const showTrip = b.status === 'confirmed' && (b.driver || b.busNumber || b.seat || b.pickup);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(b.ref)}`;
  return `
    <div class="ticket"${opts.maxWidth ? ` style="max-width:${opts.maxWidth}px;"` : ''}>
      <div class="ticket-main">
        <div class="ticket-brand-row">
          <div class="ticket-brand"><img src="images/logo.png" alt="" class="ticket-logo">BIG DRIVE</div>
          <span class="jvs-credit">Powered by Jerla</span>
        </div>
        <div class="ticket-route"><span class="city">${b.from}</span><span class="arrow">✈ →</span><span class="city">${b.to}</span></div>
        <div class="ticket-grid">
          <div><div class="k">Travel date</div><div class="v">${b.date || '—'}</div></div>
          <div><div class="k">Departure</div><div class="v">${b.time}</div></div>
          <div><div class="k">Passenger</div><div class="v">${b.name}</div></div>
          <div><div class="k">Seats</div><div class="v">${b.seatsBooked || 1}</div></div>
        </div>
        ${showTrip ? `
        <div class="ticket-grid" style="margin-top:10px;">
          ${b.driver ? `<div><div class="k">Driver</div><div class="v">${b.driver}</div></div>` : ''}
          ${b.busNumber ? `<div><div class="k">Bus</div><div class="v">${b.busNumber}</div></div>` : ''}
          ${b.seat ? `<div><div class="k">Seat</div><div class="v">${b.seat}</div></div>` : ''}
          ${b.pickup ? `<div><div class="k">Pickup</div><div class="v">${b.pickup}</div></div>` : ''}
        </div>` : ''}
        ${b.status==='confirmed' ? `<img src="${qrUrl}" alt="Ticket QR code" style="margin-top:12px;border-radius:6px;" width="90" height="90">` : ''}
      </div>
      <div class="ticket-perf"></div>
      <div class="ticket-stub"><span class="ticket-ref">${b.ref}</span><span class="ticket-status ${b.status}">${statusLabel(b.status)}</span></div>
    </div>`;
}

function renderStep(){
  updateProgress();
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title');

  if(step === 0){
    title.textContent = `${booking.from} → ${booking.to}`;
    const dates = availableDatesFor(booking.route);
    body.innerHTML = `
      <div class="field"><label>Choose a travel date</label>
        ${dates.length ? `<div class="time-pills">${dates.map(d => `<button class="pill ${booking.date===d.value?'selected':''}" onclick="selectDate('${d.value}')">${d.label}</button>`).join('')}</div>`
          : `<p style="color:var(--slate-400);font-size:0.88rem;">No travel dates are open for this route yet — check back soon or contact Big Drive directly.</p>`}
      </div>
      ${booking.date ? `
      <div class="field"><label>Choose a departure time</label>
        <div class="time-pills">${booking.route.times.map(t => {
          const left = seatsLeftFor(booking.route, booking.date, t);
          const full = left <= 0;
          return `<button class="pill ${booking.time===t?'selected':''}" ${full?'disabled style="opacity:0.4;cursor:not-allowed;"':''} onclick="${full?'':`selectTime('${t}')`}">${t}${full ? ' — full' : (left <= 4 ? ` · ${left} left` : '')}</button>`;
        }).join('')}</div>
      </div>` : ''}
      <button class="btn-block" ${(booking.date && booking.time)?'':'disabled'} onclick="nextStep()">Continue</button>`;
  } else if(step === 1){
    title.textContent = 'Number of seats';
    const left = seatsLeftFor(booking.route, booking.date, booking.time);
    body.innerHTML = `
      <div class="field">
        <label>How many seats do you need?</label>
        <div style="display:flex;align-items:center;gap:16px;justify-content:center;padding:20px 0;">
          <button class="pill" style="width:44px;height:44px;font-size:1.2rem;" onclick="changeSeats(-1)">−</button>
          <span style="font-family:var(--mono);font-size:1.8rem;color:var(--amber-400);min-width:40px;text-align:center;">${booking.seats}</span>
          <button class="pill" style="width:44px;height:44px;font-size:1.2rem;" onclick="changeSeats(1)">+</button>
        </div>
        <p style="color:var(--slate-400);font-size:0.82rem;text-align:center;">${left} seat${left===1?'':'s'} left on this departure</p>
      </div>
      <div class="summary-line total"><span>Subtotal</span><span>₦${(booking.route.price * booking.seats).toLocaleString()}</span></div>
      <button class="btn-block" onclick="nextStep()">Continue</button>
      <button class="btn-back" onclick="prevStep()">← Back</button>`;
  } else if(step === 2){
    title.textContent = 'Luggage';
    body.innerHTML = `
      <div class="narration-alert" style="border-color:var(--good);background:rgba(76,175,125,0.1);color:#8fd6ac;">✓ Included: 2 free bags per passenger (${booking.seats * 2} bags total for ${booking.seats} seat${booking.seats===1?'':'s'})</div>
      <div class="option-list">${CONFIG.luggageOptions.map(o => `
        <label class="option ${booking.luggage.includes(o.id)?'selected':''}">
          <input type="checkbox" ${booking.luggage.includes(o.id)?'checked':''} onchange="toggleLuggage('${o.id}')">
          <span class="desc">${o.label}</span><span class="price">+₦${o.price.toLocaleString()}</span>
        </label>`).join('')}</div>
      <p style="color:var(--slate-400);font-size:0.85rem;margin-top:14px;">Only select extras beyond what's included above.</p>
      <button class="btn-block" onclick="nextStep()">Continue</button>
      <button class="btn-back" onclick="prevStep()">← Back</button>`;
  } else if(step === 3){
    title.textContent = 'Your details';
    body.innerHTML = `
      <div class="field"><label>Full name</label><input id="f-name" value="${booking.name}" placeholder="As on your student ID"></div>
      <div class="field"><label>Phone number</label><input id="f-phone" value="${booking.phone}" placeholder="080..."></div>
      <div class="field"><label>Emergency contact (name &amp; phone) — optional</label><input id="f-emergency" value="${booking.emergencyContact}"></div>
      <div class="error-text" id="details-error">Please fill in your name and phone number.</div>
      <button class="btn-block" onclick="submitDetails()">Continue to payment</button>
      <button class="btn-back" onclick="prevStep()">← Back</button>`;
  } else if(step === 4){
    title.textContent = 'Payment';
    body.innerHTML = `
      <div class="summary-line"><span>${booking.from} → ${booking.to}, ${booking.date} at ${booking.time} · ${booking.seats} seat${booking.seats===1?'':'s'}</span><span>₦${(booking.route.price * booking.seats).toLocaleString()}</span></div>
      ${booking.luggage.map(id => {
        const o = CONFIG.luggageOptions.find(x=>x.id===id);
        return `<div class="summary-line"><span>${o.label}</span><span>₦${o.price.toLocaleString()}</span></div>`;
      }).join('')}
      <div class="summary-line total"><span>Total due</span><span>₦${grandTotal().toLocaleString()}</span></div>
      <div class="bank-box">
        <div class="row"><span>Account name</span><b>${CONFIG.bank.accountName}</b></div>
        <div class="row"><span>Account number</span><b>${CONFIG.bank.accountNumber}</b></div>
        <div class="row"><span>Bank</span><b>${CONFIG.bank.bankName}</b></div>
        <div class="row"><span>Narration (important)</span><b>${booking.ref}</b></div>
      </div>
      <div class="narration-alert">⚠️ Use <b>${booking.ref}</b> as your transfer narration/description — this is how we match your payment to your booking.</div>
      <p style="color:var(--slate-400);font-size:0.85rem;">Once you've transferred the total above, tap below. Your booking will be saved and marked as waiting for payment verification.</p>
      <button class="btn-block" id="confirm-pay-btn" onclick="confirmPayment()">I've sent the transfer</button>
      <button class="btn-back" onclick="prevStep()">← Back</button>`;
  } else if(step === 5){
    title.textContent = 'Your ticket';
    body.innerHTML = `
      ${ticketMarkup({ ref: booking.ref, from: booking.from, to: booking.to, date: booking.date, time: booking.time, name: booking.name, seatsBooked: booking.seats, status: 'pending' })}
      <p style="color:var(--slate-400);font-size:0.85rem;margin-top:16px;">Screenshot this ticket. You can look it up anytime with reference <b style="color:var(--amber-400);">${booking.ref}</b> under "Track your booking" — from any device.</p>
      ${!STORAGE_OK ? `<p style="color:var(--bad);font-size:0.8rem;">Note: this booking could not be synced to shared storage. Make sure it reaches Big Drive on WhatsApp below, since that's the backup record.</p>` : ''}
      <button class="btn-block" onclick="sendWhatsapp()">📲 Send Booking Details on WhatsApp</button>
      <button class="btn-block secondary" onclick="closeBooking(); renderRouteBoard();">Done</button>`;
  }
}

function selectDate(d){ booking.date = d; booking.time = null; renderStep(); }
function selectTime(t){ booking.time = t; renderStep(); }
function changeSeats(delta){
  const left = seatsLeftFor(booking.route, booking.date, booking.time);
  const next = booking.seats + delta;
  if(next < 1) return;
  if(next > left) return;
  booking.seats = next;
  renderStep();
}
function toggleLuggage(id){
  const i = booking.luggage.indexOf(id);
  if(i>-1) booking.luggage.splice(i,1); else booking.luggage.push(id);
  renderStep();
}
function nextStep(){ step++; renderStep(); }
function prevStep(){ step--; renderStep(); }

function submitDetails(){
  const name = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  if(!name || !phone){ document.getElementById('details-error').classList.add('show'); return; }
  booking.name = name;
  booking.phone = phone;
  booking.emergencyContact = document.getElementById('f-emergency').value.trim();
  nextStep();
}

async function confirmPayment(){
  const btn = document.getElementById('confirm-pay-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }

  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:30px 0;">
      <div class="spinner"></div>
      <p style="color:var(--slate-400);font-size:0.9rem;text-align:center;">Submitting your booking for payment verification…</p>
    </div>`;

  // Final capacity check against the freshest data available, to catch the rare case
  // where someone else filled the last seat between this student picking a time and
  // tapping "I've sent the transfer".
  try{ BOOKINGS = await loadBookings(); } catch(e){ /* fall through with whatever we have in memory */ }
  if(seatsLeftFor(booking.route, booking.date, booking.time) < booking.seats){
    document.getElementById('modal-body').innerHTML = `
      <p style="color:var(--bad);">Sorry — there aren't enough seats left on that departure for your party. Please go back and adjust.</p>
      <button class="btn-block secondary" onclick="step=0; renderStep();">← Choose another slot</button>`;
    return;
  }

  const record = {
    ref: booking.ref, routeId: booking.route.id, from: booking.from, to: booking.to,
    travelDate: booking.date, date: booking.date, time: booking.time,
    seatsBooked: booking.seats, seatNumbers: [],
    name: booking.name, phone: booking.phone,
    emergencyContact: booking.emergencyContact, luggage: booking.luggage, total: grandTotal(),
    status: 'pending', bookingDate: new Date().toISOString(), createdAt: new Date().toISOString(),
    driver: '', busNumber: '', seat: '', pickup: '',
    vehicleId: null, tripId: null, driverId: null
  };
  BOOKINGS.push(record);
  await persistBookings();
  booking.savedRecord = record;

  setTimeout(() => { nextStep(); }, 500);
}

function sendWhatsapp(){
  const r = booking.savedRecord || booking;
  const bookedDate = new Date(r.bookingDate || Date.now());
  const msg = [
    `NEW BOOKING — ${booking.ref}`,
    `Route: ${booking.from} → ${booking.to}`,
    `Travel date: ${booking.date}`,
    `Departure: ${booking.time}`,
    `Passenger: ${booking.name}`,
    `Phone: ${booking.phone}`,
    `Seats: ${booking.seats}`,
    booking.emergencyContact ? `Emergency contact: ${booking.emergencyContact}` : null,
    booking.luggage.length ? `Luggage: ${booking.luggage.map(id=>CONFIG.luggageOptions.find(o=>o.id===id).label).join(', ')}` : null,
    `Total: ₦${grandTotal().toLocaleString()}`,
    `Reference: ${booking.ref}`
  ].filter(Boolean).join('\n');
  window.open(`https://wa.me/${primaryWhatsapp()}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function trackBooking(){
  const ref = document.getElementById('track-ref').value.trim().toUpperCase();
  const phone = document.getElementById('track-phone').value.trim();
  const resultEl = document.getElementById('track-result');
  resultEl.innerHTML = `<p style="color:var(--slate-400);">Looking up…</p>`;

  try{
    const res = await Storage.get('bookings', true);
    const all = JSON.parse(res.value);
    const found = all.find(b => b.ref.toUpperCase() === ref && b.phone === phone);
    if(!found){
      resultEl.innerHTML = `<p style="color:var(--slate-400);">No matching booking found. Check your reference and phone number.</p>`;
      return;
    }
    resultEl.innerHTML = ticketMarkup(found, { maxWidth: 420 });
  } catch(e){
    resultEl.innerHTML = `<p style="color:var(--bad);">Couldn't reach storage right now — try again in a moment.</p>`;
  }
}

/* Scroll-reveal: fade/slide in cards and section heads as they enter view */
/* Subtle scroll parallax for the hero's story illustrations — purely decorative,
   touches nothing booking-related. Applied to the container (not the van/icons
   themselves, since those already have their own CSS float animations on
   `transform` — animating both on the same element would fight each other).
   Skipped entirely for reduced-motion users. */
(function setupParallax(){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.querySelector('.hero-emblem');
  if(!layer) return;
  let ticking = false;
  function apply(){
    layer.style.transform = `translateY(${window.scrollY * 0.05}px)`;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if(!ticking){ requestAnimationFrame(apply); ticking = true; }
  }, { passive: true });
})();

(function setupScrollReveal(){
  const targets = document.querySelectorAll('.step-card, .trust-point, .section-head, .track-box, .editorial-copy, .editorial-visual, .faq-item');
  targets.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if(entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); } });
  }, { threshold: 0.15 });
  targets.forEach(el => io.observe(el));
})();

document.getElementById('booking-modal').addEventListener('click', e => { if(e.target.id==='booking-modal') closeBooking(); });
