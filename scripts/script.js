const DEFAULT_CONFIG = {
  whatsappNumbers: ["2348000000000"],
  adminPin: "2580",
  bank: { accountName: "Utseoritselaju Atigan Priestly", accountNumber: "8082824688", bankName: "OPay" },
  // "resumption" = city → ABUAD. "vacation" = ABUAD → city. Toggle in Admin → Settings;
  // every route's displayed direction is derived from this automatically.
  season: "resumption",
  // Durations sourced from real road-distance data for Ado-Ekiti (ABUAD's location). Prices are placeholders — update from Admin → Routes.
  routes: [
    { id: "r1", city: "Lagos", price: 8500, duration: "4h 30m", times: ["07:00"] },
    { id: "r2", city: "Benin City", price: 6000, duration: "3h 30m", times: ["07:00"] },
    { id: "r3", city: "Warri", price: 9000, duration: "4h 45m", times: ["07:00"] },
    { id: "r4", city: "Abuja", price: 12000, duration: "6h 30m", times: ["07:00"] }
  ],
  luggageOptions: [
    { id: "l1", label: "Extra bag (beyond 2 free bags)", price: 10000 },
    { id: "l2", label: "Fragile / special handling item", price: 8000 }
  ]
};

function routeCities(r){
  return CONFIG.season === 'vacation' ? { from: 'ABUAD', to: r.city } : { from: r.city, to: 'ABUAD' };
}
const STATUS_LABELS = {
  pending: '🟡 Waiting for Payment Verification',
  confirmed: '✅ Confirmed',
  completed: '🏁 Completed',
  cancelled: '❌ Cancelled'
};
function statusLabel(s){ return STATUS_LABELS[s] || s; }

let CONFIG = null;
let BOOKINGS = [];
let STORAGE_OK = true;
let booking = {};
let step = 0;
let adminTab = 'bookings';
let adminPollTimer = null;

/* Real shared backend: Supabase (Postgres + auto-generated REST API).
   Every device that opens this site reads/writes the same kv_store table,
   so bookings, routes, and settings sync everywhere — no per-browser limitation.
   If the network request fails outright (e.g. offline), falls back to this
   browser's own localStorage so the app doesn't hard-break, but that data
   won't be visible on other devices until the connection is back. */
const SUPABASE_URL = "https://btaayiaitqxlixtpnaje.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0YWF5aWFpdHF4bGl4dHBuYWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NTM3NjMsImV4cCI6MjEwMTUyOTc2M30.GWDSeS1niyiLXlLRAPGKp2RaRvj28Xnz12mcId-uM4c";
const SB_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json'
};
const Storage = {
  async get(key, shared){
    try{
      const res = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(key)}&select=value`, { headers: SB_HEADERS });
      if(!res.ok) throw new Error('supabase get failed: ' + res.status);
      const rows = await res.json();
      if(!rows.length) throw new Error('not found');
      return { key, value: JSON.stringify(rows[0].value), shared: true };
    } catch(e){
      const raw = localStorage.getItem('bigdrive_' + key);
      if(raw === null) throw new Error('not found');
      return { key, value: raw, shared: !!shared };
    }
  },
  async set(key, value, shared){
    try{
      const res = await fetch(`${SUPABASE_URL}/rest/v1/kv_store`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ key, value: JSON.parse(value) })
      });
      if(!res.ok) throw new Error('supabase set failed: ' + res.status);
      return { key, value, shared: true };
    } catch(e){
      localStorage.setItem('bigdrive_' + key, value);
      return { key, value, shared: !!shared };
    }
  }
};

async function loadConfig(){
  try {
    const res = await Storage.get('config', true);
    return migrateConfig(JSON.parse(res.value));
  } catch(e){
    try { await Storage.set('config', JSON.stringify(DEFAULT_CONFIG), true); } catch(e2){}
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}
function migrateConfig(cfg){
  if(!cfg.whatsappNumbers){
    cfg.whatsappNumbers = cfg.whatsappNumber ? [cfg.whatsappNumber] : [...DEFAULT_CONFIG.whatsappNumbers];
  }
  if(!cfg.season) cfg.season = DEFAULT_CONFIG.season;
  return cfg;
}
function primaryWhatsapp(){ return (CONFIG.whatsappNumbers && CONFIG.whatsappNumbers[0]) || DEFAULT_CONFIG.whatsappNumbers[0]; }
async function persistConfig(){
  try { await Storage.set('config', JSON.stringify(CONFIG), true); return true; }
  catch(e){ flagStorageIssue(); return false; }
}
async function loadBookings(){
  try {
    const res = await Storage.get('bookings', true);
    return JSON.parse(res.value);
  } catch(e){
    try { await Storage.set('bookings', JSON.stringify([]), true); } catch(e2){}
    return [];
  }
}
async function persistBookings(){
  try { await Storage.set('bookings', JSON.stringify(BOOKINGS), true); return true; }
  catch(e){ flagStorageIssue(); return false; }
}
function flagStorageIssue(){
  STORAGE_OK = false;
  document.getElementById('storage-banner').classList.add('show');
}

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
  const items = CONFIG.routes.map(r => { const c = routeCities(r); return `<span><b>${c.from}</b> → ${c.to} · ₦${r.price.toLocaleString()} · ${r.duration}</span>`; }).join('');
  el.innerHTML = items + items;
}
function renderRouteBoard(){
  const board = document.getElementById('route-board');
  if(!CONFIG.routes.length){
    board.innerHTML = `<div class="empty-board">No routes yet. Add one from Admin → Routes.</div>`;
    return;
  }
  board.innerHTML = CONFIG.routes.map(r => { const c = routeCities(r); return `
    <div class="route-row" onclick="startBooking('${r.id}')">
      <div class="route-line"><span class="route-city">${c.from}</span><span class="route-track"></span><span class="route-city">${c.to}</span></div>
      <div class="route-meta"><span>${r.duration}</span><span class="route-price">₦${r.price.toLocaleString()}</span></div>
      <span class="route-arrow">→</span>
    </div>`; }).join('');
}
function scrollToRoutes(){ document.getElementById('routes').scrollIntoView({behavior:'smooth'}); }
function scrollToTrack(){ document.getElementById('track').scrollIntoView({behavior:'smooth'}); }

function startBooking(routeId){
  const route = CONFIG.routes.find(r => r.id === routeId);
  const c = routeCities(route);
  booking = { route, from: c.from, to: c.to, time:null, luggage:[], name:'', phone:'', emergencyContact:'', ref: genRef(), saving:false };
  step = 0;
  document.getElementById('booking-modal').classList.add('open');
  renderStep();
}
function closeBooking(){ document.getElementById('booking-modal').classList.remove('open'); }
function genRef(){ return 'BD-' + Math.floor(1000 + Math.random()*9000); }

const TOTAL_STEPS = 5;
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
function grandTotal(){ return (booking.route ? booking.route.price : 0) + luggageTotal(); }

function ticketMarkup(b, opts){
  opts = opts || {};
  const showTrip = (b.status === 'confirmed' || b.status === 'completed') && (b.driver || b.busNumber || b.seat || b.pickup);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(b.ref)}`;
  return `
    <div class="ticket"${opts.maxWidth ? ` style="max-width:${opts.maxWidth}px;"` : ''}>
      <div class="ticket-main">
        <div class="ticket-brand-row">
          <div class="ticket-brand"><img src="images/logo.png" alt="" class="ticket-logo">BIG DRIVE</div>
          <span class="jvs-badge">JVS • Verified by Jerla</span>
        </div>
        <div class="ticket-route"><span class="city">${b.from}</span><span class="arrow">✈ →</span><span class="city">${b.to}</span></div>
        <div class="ticket-grid">
          <div><div class="k">Departure</div><div class="v">${b.time}</div></div>
          <div><div class="k">Passenger</div><div class="v">${b.name}</div></div>
        </div>
        ${showTrip ? `
        <div class="ticket-grid" style="margin-top:10px;">
          ${b.driver ? `<div><div class="k">Driver</div><div class="v">${b.driver}</div></div>` : ''}
          ${b.busNumber ? `<div><div class="k">Bus</div><div class="v">${b.busNumber}</div></div>` : ''}
          ${b.seat ? `<div><div class="k">Seat</div><div class="v">${b.seat}</div></div>` : ''}
          ${b.pickup ? `<div><div class="k">Pickup</div><div class="v">${b.pickup}</div></div>` : ''}
        </div>` : ''}
        ${(b.status==='confirmed'||b.status==='completed') ? `<img src="${qrUrl}" alt="Ticket QR code" style="margin-top:12px;border-radius:6px;" width="90" height="90">` : ''}
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
    body.innerHTML = `
      <div class="field"><label>Choose a departure time</label>
        <div class="time-pills">${booking.route.times.map(t => `<button class="pill ${booking.time===t?'selected':''}" onclick="selectTime('${t}')">${t}</button>`).join('')}</div>
      </div>
      <button class="btn-block" ${booking.time?'':'disabled'} onclick="nextStep()">Continue</button>`;
  } else if(step === 1){
    title.textContent = 'Luggage';
    body.innerHTML = `
      <div class="option-list">${CONFIG.luggageOptions.map(o => `
        <label class="option ${booking.luggage.includes(o.id)?'selected':''}">
          <input type="checkbox" ${booking.luggage.includes(o.id)?'checked':''} onchange="toggleLuggage('${o.id}')">
          <span class="desc">${o.label}</span><span class="price">+₦${o.price.toLocaleString()}</span>
        </label>`).join('')}</div>
      <p style="color:var(--slate-400);font-size:0.85rem;margin-top:14px;">First two bags are free. Only select what applies beyond that.</p>
      <button class="btn-block" onclick="nextStep()">Continue</button>
      <button class="btn-back" onclick="prevStep()">← Back</button>`;
  } else if(step === 2){
    title.textContent = 'Your details';
    body.innerHTML = `
      <div class="field"><label>Full name</label><input id="f-name" value="${booking.name}" placeholder="As on your student ID"></div>
      <div class="field"><label>Phone number</label><input id="f-phone" value="${booking.phone}" placeholder="080..."></div>
      <div class="field"><label>Emergency contact (name &amp; phone) — optional</label><input id="f-emergency" value="${booking.emergencyContact}"></div>
      <div class="error-text" id="details-error">Please fill in your name and phone number.</div>
      <button class="btn-block" onclick="submitDetails()">Continue to payment</button>
      <button class="btn-back" onclick="prevStep()">← Back</button>`;
  } else if(step === 3){
    title.textContent = 'Payment';
    body.innerHTML = `
      <div class="summary-line"><span>${booking.from} → ${booking.to}, ${booking.time}</span><span>₦${booking.route.price.toLocaleString()}</span></div>
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
      <p style="color:var(--slate-400);font-size:0.85rem;">Once you've transferred the total above, tap below. Your booking will be sent to Big Drive on WhatsApp and marked as waiting for payment verification.</p>
      <button class="btn-block" id="confirm-pay-btn" onclick="confirmPayment()">I've sent the transfer</button>
      <button class="btn-back" onclick="prevStep()">← Back</button>`;
  } else if(step === 4){
    title.textContent = 'Your ticket';
    body.innerHTML = `
      ${ticketMarkup({ ref: booking.ref, from: booking.from, to: booking.to, time: booking.time, name: booking.name, status: 'pending' })}
      <p style="color:var(--slate-400);font-size:0.85rem;margin-top:16px;">Screenshot this ticket. You can look it up anytime with reference <b style="color:var(--amber-400);">${booking.ref}</b> under "Track your booking" — from any device.</p>
      ${!STORAGE_OK ? `<p style="color:var(--bad);font-size:0.8rem;">Note: this booking could not be synced to shared storage. Make sure your WhatsApp message went through, as that's the backup record.</p>` : ''}
      <button class="btn-block" onclick="closeBooking(); renderRouteBoard();">Done</button>`;
  }
}

function selectTime(t){ booking.time = t; renderStep(); }
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

  const record = {
    ref: booking.ref, from: booking.from, to: booking.to, time: booking.time,
    name: booking.name, phone: booking.phone,
    emergencyContact: booking.emergencyContact, luggage: booking.luggage, total: grandTotal(),
    status: 'pending', createdAt: new Date().toISOString(),
    driver: '', busNumber: '', seat: '', pickup: ''
  };
  BOOKINGS.push(record);
  await persistBookings();

  const msg = [
    `NEW BOOKING — ${booking.ref}`,
    `Route: ${booking.from} → ${booking.to} (${booking.time})`,
    `Passenger: ${booking.name}`,
    `Phone: ${booking.phone}`,
    booking.emergencyContact ? `Emergency contact: ${booking.emergencyContact}` : null,
    booking.luggage.length ? `Luggage add-ons: ${booking.luggage.map(id=>CONFIG.luggageOptions.find(o=>o.id===id).label).join(', ')}` : null,
    `Total: ₦${grandTotal().toLocaleString()}`,
    `Reference: ${booking.ref}`
  ].filter(Boolean).join('\n');
  window.open(`https://wa.me/${primaryWhatsapp()}?text=${encodeURIComponent(msg)}`, '_blank');

  setTimeout(() => { nextStep(); }, 900);
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

function openAdminGate(){
  document.getElementById('admin-pin-error').classList.remove('show');
  document.getElementById('admin-pin-input').value = '';
  document.getElementById('admin-gate-modal').classList.add('open');
}
function closeAdminGate(){ document.getElementById('admin-gate-modal').classList.remove('open'); }
function checkAdminPin(){
  const val = document.getElementById('admin-pin-input').value.trim();
  if(val === CONFIG.adminPin){
    closeAdminGate();
    openAdmin();
  } else {
    document.getElementById('admin-pin-error').classList.add('show');
  }
}

function openAdmin(){
  document.getElementById('admin-modal').classList.add('open');
  switchAdminTab('bookings');
  adminPollTimer = setInterval(refreshAdminBookings, 10000);
}
function closeAdmin(){
  document.getElementById('admin-modal').classList.remove('open');
  if(adminPollTimer){ clearInterval(adminPollTimer); adminPollTimer = null; }
}

function switchAdminTab(tab){
  adminTab = tab;
  ['bookings','routes','settings'].forEach(t => document.getElementById('tab-'+t).classList.toggle('active', t===tab));
  if(tab === 'bookings') renderAdminBookings();
  else if(tab === 'routes') renderAdminRoutes();
  else renderAdminSettings();
}

let bookingSearch = '';
function renderAdminBookings(){
  const body = document.getElementById('admin-body');
  const filtered = BOOKINGS.filter(b => {
    if(!bookingSearch) return true;
    const q = bookingSearch.toLowerCase();
    return b.ref.toLowerCase().includes(q) || b.name.toLowerCase().includes(q) || b.phone.includes(q);
  }).slice().reverse();

  body.innerHTML = `
    <div class="admin-toolbar">
      <input placeholder="Search by ref, name, or phone" value="${bookingSearch}" oninput="onSearchInput(this.value)">
      <button class="refresh-btn" onclick="refreshAdminBookings()">↻ Refresh</button>
      <span class="save-note" id="admin-save-note">Saved</span>
    </div>
    ${filtered.length === 0 ? `<div class="empty-state">No bookings yet.</div>` : `
    <table class="booking-table">
      <thead><tr><th>Ref</th><th>Route</th><th>Passenger</th><th>Total</th><th>Status</th><th>Trip</th></tr></thead>
      <tbody>
        ${filtered.map(b => `
          <tr>
            <td class="mono">${b.ref}</td>
            <td>${b.from} → ${b.to}<br><span style="color:var(--slate-400);font-size:0.78rem;">${b.time}</span></td>
            <td>${b.name}<br><span style="color:var(--slate-400);font-size:0.78rem;">${b.phone}</span></td>
            <td class="mono">₦${b.total.toLocaleString()}</td>
            <td>
              <select class="status-select" onchange="updateBookingStatus('${b.ref}', this.value)">
                ${['pending','confirmed','completed','cancelled'].map(s => `<option value="${s}" ${b.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
              </select>
            </td>
            <td><button class="refresh-btn" onclick="openTripDetails('${b.ref}')">${b.driver || b.busNumber ? 'Edit' : 'Assign'}</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`}
  `;
}
function onSearchInput(val){ bookingSearch = val; renderAdminBookings(); }

async function refreshAdminBookings(){
  try{
    BOOKINGS = await loadBookings();
    if(adminTab === 'bookings') renderAdminBookings();
  } catch(e){ }
}

async function updateBookingStatus(ref, status){
  const b = BOOKINGS.find(x => x.ref === ref);
  if(!b) return;
  b.status = status;
  const ok = await persistBookings();
  const note = document.getElementById('admin-save-note');
  if(note){ note.textContent = ok ? 'Saved' : 'Save failed — retry'; note.classList.add('show'); setTimeout(()=>note.classList.remove('show'), 1500); }
}

let tripModalRef = null;
function openTripDetails(ref){
  const b = BOOKINGS.find(x => x.ref === ref);
  if(!b) return;
  tripModalRef = ref;
  document.getElementById('trip-modal-ref').textContent = ref;
  document.getElementById('trip-driver').value = b.driver || '';
  document.getElementById('trip-bus').value = b.busNumber || '';
  document.getElementById('trip-seat').value = b.seat || '';
  document.getElementById('trip-pickup').value = b.pickup || '';
  document.getElementById('trip-modal').classList.add('open');
}
function closeTripDetails(){ document.getElementById('trip-modal').classList.remove('open'); tripModalRef = null; }
async function saveTripDetails(){
  const b = BOOKINGS.find(x => x.ref === tripModalRef);
  if(!b) return;
  b.driver = document.getElementById('trip-driver').value.trim();
  b.busNumber = document.getElementById('trip-bus').value.trim();
  b.seat = document.getElementById('trip-seat').value.trim();
  b.pickup = document.getElementById('trip-pickup').value.trim();
  await persistBookings();
  closeTripDetails();
  renderAdminBookings();
}

function renderAdminRoutes(){
  const body = document.getElementById('admin-body');
  body.innerHTML = `
    <div class="field">
      <label>Current season</label>
      <select id="season-select" onchange="changeSeason(this.value)">
        <option value="resumption" ${CONFIG.season==='resumption'?'selected':''}>Resumption (city → ABUAD)</option>
        <option value="vacation" ${CONFIG.season==='vacation'?'selected':''}>Vacation (ABUAD → city)</option>
      </select>
    </div>
    <p class="settings-hint">Switching season instantly flips the direction of every route below — no need to re-enter them.</p>
    <div class="field"><label>Current routes</label><div id="route-admin-list"></div></div>
    <div class="field-row">
      <div class="field"><label>City</label><input id="new-route-city" placeholder="e.g. Benin City"></div>
      <div class="field"><label>Price (₦)</label><input id="new-route-price" type="number"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Duration</label><input id="new-route-duration" placeholder="4h 30m"></div>
      <div class="field"><label>Times (comma separated, 24h)</label><input id="new-route-times" placeholder="07:00"></div>
    </div>
    <button class="btn-block secondary" onclick="addRoute()">+ Add route</button>
  `;
  renderRouteAdminList();
}
async function changeSeason(val){
  CONFIG.season = val;
  await persistConfig();
  renderTicker();
  renderRouteBoard();
}
function renderRouteAdminList(){
  const el = document.getElementById('route-admin-list');
  if(!CONFIG.routes.length){ el.innerHTML = `<p style="color:var(--slate-400);font-size:0.85rem;">No routes yet.</p>`; return; }
  el.innerHTML = CONFIG.routes.map(r => { const c = routeCities(r); return `
    <div class="route-admin-row">
      <span>${c.from} → ${c.to} · ₦${r.price.toLocaleString()} · ${r.times.join(', ')}</span>
      <button class="del-btn" onclick="removeRoute('${r.id}')">Remove</button>
    </div>`; }).join('');
}
async function removeRoute(id){
  CONFIG.routes = CONFIG.routes.filter(r => r.id !== id);
  await persistConfig();
  renderRouteAdminList();
  renderRouteBoard();
  renderTicker();
}
async function addRoute(){
  const city = document.getElementById('new-route-city').value.trim();
  const price = parseInt(document.getElementById('new-route-price').value, 10);
  const duration = document.getElementById('new-route-duration').value.trim();
  const times = document.getElementById('new-route-times').value.split(',').map(t=>t.trim()).filter(Boolean);
  if(!city || !price || !times.length){ alert('Please fill in city, price and at least one time.'); return; }
  CONFIG.routes.push({ id: 'r' + Date.now(), city, price, duration: duration || '—', times });
  await persistConfig();
  ['new-route-city','new-route-price','new-route-duration','new-route-times'].forEach(id => document.getElementById(id).value = '');
  renderRouteAdminList();
  renderRouteBoard();
  renderTicker();
}

function renderAdminSettings(){
  const body = document.getElementById('admin-body');
  body.innerHTML = `
    <p class="settings-hint">These changes save to shared storage immediately and apply for everyone who opens this site.</p>
    <div class="field">
      <label>WhatsApp numbers (international format, digits only) — first one receives booking messages</label>
      <div id="wa-number-list"></div>
      <div class="field-row" style="margin-top:8px;">
        <input id="new-wa-number" placeholder="e.g. 2348012345678">
        <button class="refresh-btn" onclick="addWhatsappNumber()">+ Add number</button>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Bank account name</label><input id="set-acc-name" value="${CONFIG.bank.accountName}"></div>
      <div class="field"><label>Bank account number</label><input id="set-acc-num" value="${CONFIG.bank.accountNumber}"></div>
    </div>
    <div class="field"><label>Bank name</label><input id="set-bank-name" value="${CONFIG.bank.bankName}"></div>
    <div class="field"><label>Admin PIN</label><input id="set-pin" value="${CONFIG.adminPin}"></div>
    <button class="btn-block" onclick="saveSettings()">Save settings</button>
    <span class="save-note" id="settings-save-note">Saved</span>
  `;
  renderWaNumberList();
}
function renderWaNumberList(){
  const el = document.getElementById('wa-number-list');
  el.innerHTML = CONFIG.whatsappNumbers.map((n, i) => `
    <div class="route-admin-row">
      <span>${n} ${i===0 ? '<b style="color:var(--amber-400);">(primary)</b>' : ''}</span>
      ${CONFIG.whatsappNumbers.length > 1 ? `<button class="del-btn" onclick="removeWhatsappNumber(${i})">Remove</button>` : ''}
    </div>`).join('');
}
async function addWhatsappNumber(){
  const val = document.getElementById('new-wa-number').value.trim();
  if(!val) return;
  CONFIG.whatsappNumbers.push(val);
  document.getElementById('new-wa-number').value = '';
  renderWaNumberList();
}
async function removeWhatsappNumber(i){
  CONFIG.whatsappNumbers.splice(i, 1);
  renderWaNumberList();
}
async function saveSettings(){
  CONFIG.bank.accountName = document.getElementById('set-acc-name').value.trim();
  CONFIG.bank.accountNumber = document.getElementById('set-acc-num').value.trim();
  CONFIG.bank.bankName = document.getElementById('set-bank-name').value.trim();
  CONFIG.adminPin = document.getElementById('set-pin').value.trim() || DEFAULT_CONFIG.adminPin;
  const ok = await persistConfig();
  renderTicker();
  const note = document.getElementById('settings-save-note');
  note.textContent = ok ? 'Saved' : 'Save failed — try again';
  note.classList.add('show');
  setTimeout(()=>note.classList.remove('show'), 1500);
}

/* Scroll-reveal: fade/slide in cards and section heads as they enter view */
(function setupScrollReveal(){
  const targets = document.querySelectorAll('.step-card, .trust-card, .section-head, .track-box');
  targets.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if(entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); } });
  }, { threshold: 0.15 });
  targets.forEach(el => io.observe(el));
})();

document.getElementById('booking-modal').addEventListener('click', e => { if(e.target.id==='booking-modal') closeBooking(); });
document.getElementById('admin-gate-modal').addEventListener('click', e => { if(e.target.id==='admin-gate-modal') closeAdminGate(); });
document.getElementById('admin-modal').addEventListener('click', e => { if(e.target.id==='admin-modal') closeAdmin(); });
document.getElementById('trip-modal').addEventListener('click', e => { if(e.target.id==='trip-modal') closeTripDetails(); });
