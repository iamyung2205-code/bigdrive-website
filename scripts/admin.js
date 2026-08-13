/* ============================================================
   ADMIN DASHBOARD LOGIC
   Data layer (Supabase, CONFIG, BOOKINGS, Storage) lives in
   shared.js, loaded before this file.
   ============================================================ */

let currentView = 'board';   // 'board' | 'dates' | 'bookings' | 'manage-routes' | 'settings'
let selectedRouteId = null;
let selectedDate = null;
let bookingSearch = '';
let adminPollTimer = null;
let expandedRouteId = null;

async function initAdminApp(){
  document.getElementById('app-error').style.display = 'none';
  document.getElementById('app-loading').style.display = 'flex';
  try{
    CONFIG = await loadConfig();
    BOOKINGS = await loadBookings();
    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('admin-gate').style.display = 'flex';
  } catch(e){
    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app-error').style.display = 'flex';
  }
}
initAdminApp();

function checkAdminPin(){
  const val = document.getElementById('admin-pin-input').value.trim();
  if(val === CONFIG.adminPin){
    document.getElementById('admin-gate').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    goToView('board');
    renderPendingBadgeAdmin();
    adminPollTimer = setInterval(async () => {
      try{ BOOKINGS = await loadBookings(); renderPendingBadgeAdmin(); if(currentView==='bookings') renderBookingsView(); } catch(e){}
    }, 15000);
  } else {
    document.getElementById('admin-pin-error').classList.add('show');
  }
}

function renderPendingBadgeAdmin(){
  const el = document.getElementById('pending-badge-admin');
  const count = BOOKINGS.filter(b => b.status === 'pending').length;
  if(count > 0){ el.textContent = `🔔 ${count} pending`; el.style.display = 'inline-block'; }
  else { el.style.display = 'none'; }
}

function goToView(view){
  currentView = view;
  selectedRouteId = null;
  selectedDate = null;
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  render();
}

function render(){
  if(currentView === 'board') renderBoardView();
  else if(currentView === 'dates') renderDatesView();
  else if(currentView === 'bookings') renderBookingsView();
  else if(currentView === 'manage-routes') renderManageRoutesView();
  else if(currentView === 'settings') renderSettingsView();
  renderBreadcrumb();
}

function renderBreadcrumb(){
  const el = document.getElementById('admin-breadcrumb');
  const crumbs = [`<a onclick="goToView('board')">Departure Board</a>`];
  if(currentView === 'dates' || currentView === 'bookings'){
    const route = CONFIG.routes.find(r => r.id === selectedRouteId);
    const c = route ? routeCities(route) : null;
    crumbs.push(`<a onclick="showDatesFor('${selectedRouteId}')">${c ? c.from + ' → ' + c.to : 'Route'}</a>`);
  }
  if(currentView === 'bookings'){
    crumbs.push(`<span>${selectedDate}</span>`);
  }
  if(currentView === 'manage-routes') { document.querySelectorAll('.admin-nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view==='manage-routes')); }
  el.innerHTML = crumbs.join(' <span style="color:var(--navy-600);">/</span> ');
}

/* ---------- Step 1: Departure Board ---------- */
function renderBoardView(){
  const el = document.getElementById('admin-content');
  el.innerHTML = `
    <h2 class="admin-section-title">Departure Board</h2>
    <div class="admin-card-grid">
      ${CONFIG.routes.map(r => {
        const c = routeCities(r);
        const pending = BOOKINGS.filter(b => b.routeId === r.id && b.status === 'pending').length;
        return `
        <div class="admin-card ${r.active===false ? 'closed' : ''}" onclick="showDatesFor('${r.id}')">
          <div class="route-line-mini">${c.from} → ${c.to} ${r.active===false ? '<span class="badge cancelled" style="margin-left:6px;">Inactive</span>' : ''}</div>
          <div class="meta">₦${r.price.toLocaleString()} · ${r.duration} · ${r.seatCapacity || 14} seats/departure</div>
          ${pending > 0 ? `<div class="count">🔔 ${pending} pending</div>` : `<div class="count" style="font-size:0.85rem;color:var(--slate-400);">No pending bookings</div>`}
        </div>`;
      }).join('')}
    </div>
    ${CONFIG.routes.length === 0 ? `<p style="color:var(--slate-400);">No routes yet — add one under Manage Routes.</p>` : ''}
  `;
}

/* ---------- Step 2: Travel Dates for a route ---------- */
function showDatesFor(routeId){
  selectedRouteId = routeId;
  currentView = 'dates';
  render();
}
function renderDatesView(){
  const el = document.getElementById('admin-content');
  const route = CONFIG.routes.find(r => r.id === selectedRouteId);
  if(!route){ el.innerHTML = `<p>Route not found.</p>`; return; }
  const c = routeCities(route);
  const dates = (route.availableDates || []).slice().sort((a,b) => a.date < b.date ? -1 : 1);
  el.innerHTML = `
    <h2 class="admin-section-title">${c.from} → ${c.to}</h2>
    ${dates.length === 0 ? `<p style="color:var(--slate-400);">No travel dates open for this route yet — add some under Manage Routes.</p>` : `
    <div class="admin-card-grid">
      ${dates.map(d => {
        const bookingsForDate = BOOKINGS.filter(b => b.routeId === route.id && b.date === d.date);
        const passengers = bookingsForDate.reduce((sum,b) => sum + (b.seatsBooked||1), 0);
        return `
        <div class="admin-card ${d.closed?'closed':''} ${passengers===0?'empty-count':''}" onclick="showBookingsFor('${route.id}','${d.date}')">
          <div class="route-line-mini" style="font-size:1rem;">${d.date}${d.closed ? ' (closed)' : ''}</div>
          <div class="meta">${bookingsForDate.length} booking${bookingsForDate.length===1?'':'s'}</div>
          <div class="count">${passengers === 0 ? 'No bookings' : passengers + ' passenger' + (passengers===1?'':'s')}</div>
        </div>`;
      }).join('')}
    </div>`}
  `;
}

/* ---------- Step 3: Bookings for a route + date ---------- */
function showBookingsFor(routeId, date){
  selectedRouteId = routeId;
  selectedDate = date;
  currentView = 'bookings';
  render();
}
function renderBookingsView(){
  const el = document.getElementById('admin-content');
  const route = CONFIG.routes.find(r => r.id === selectedRouteId);
  const c = route ? routeCities(route) : null;
  const filtered = BOOKINGS.filter(b => {
    if(b.routeId !== selectedRouteId || b.date !== selectedDate) return false;
    if(!bookingSearch) return true;
    const q = bookingSearch.toLowerCase();
    return b.ref.toLowerCase().includes(q) || b.name.toLowerCase().includes(q) || b.phone.includes(q);
  }).slice().reverse();
  const passengers = filtered.reduce((sum,b) => sum + (b.seatsBooked||1), 0);

  el.innerHTML = `
    <h2 class="admin-section-title">${c ? c.from + ' → ' + c.to : ''} · ${selectedDate}</h2>
    <p style="color:var(--slate-400);margin-top:-10px;margin-bottom:18px;">${filtered.length} booking${filtered.length===1?'':'s'} · ${passengers} passenger${passengers===1?'':'s'}</p>
    <div class="admin-toolbar">
      <input placeholder="Search by ref, name, or phone" value="${bookingSearch}" oninput="onBookingSearch(this.value)">
      <button class="refresh-btn" id="refresh-btn" onclick="refreshBookings()"><span id="refresh-icon">↻</span> Refresh</button>
      <span class="save-note" id="admin-save-note">Saved</span>
    </div>
    ${filtered.length === 0 ? `<div class="empty-state">No bookings ${bookingSearch ? 'match this search' : 'for this date yet'}.</div>` : `
    <table class="booking-table">
      <thead><tr><th>Ref</th><th>Passenger</th><th>Emergency</th><th>Seats</th><th>Luggage</th><th>Total</th><th>Booked</th><th>Status</th><th>Trip</th><th></th></tr></thead>
      <tbody>
        ${filtered.map(b => `
          <tr>
            <td class="mono">${b.ref}</td>
            <td>${b.name}<br><span style="color:var(--slate-400);font-size:0.78rem;">${b.phone}</span></td>
            <td style="color:var(--slate-400);font-size:0.85rem;">${b.emergencyContact || '—'}</td>
            <td class="mono">${b.seatsBooked || 1}</td>
            <td style="font-size:0.8rem;color:var(--slate-400);">${(b.luggage||[]).length ? b.luggage.map(id=>{const o=CONFIG.luggageOptions.find(x=>x.id===id);return o?o.label:id;}).join(', ') : '—'}</td>
            <td class="mono">₦${b.total.toLocaleString()}</td>
            <td style="font-size:0.78rem;color:var(--slate-400);">${b.bookingDate ? new Date(b.bookingDate).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
            <td>
              <select class="status-select" onchange="updateBookingStatus('${b.ref}', this.value)">
                ${['pending','confirmed','cancelled'].map(s => `<option value="${s}" ${b.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
              </select>
            </td>
            <td><button class="refresh-btn" onclick="openTripDetails('${b.ref}')">${b.driver || b.busNumber ? 'Edit' : 'Assign'}</button></td>
            <td><button class="del-btn" onclick="deleteBooking('${b.ref}')">Delete</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`}
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
      ${filtered.length > 0 ? `<button class="refresh-btn" style="color:var(--coral-500);border-color:var(--coral-500);" onclick="clearScopedBookings()">Clear bookings for this date (${filtered.length})</button>` : ''}
      <button class="refresh-btn" style="color:var(--coral-500);border-color:var(--coral-500);" onclick="clearAllBookings()">Clear ALL bookings (everywhere)</button>
    </div>
  `;
}
function onBookingSearch(val){ bookingSearch = val; renderBookingsView(); }

async function refreshBookings(){
  const btn = document.getElementById('refresh-btn');
  const icon = document.getElementById('refresh-icon');
  if(btn) btn.disabled = true;
  if(icon) icon.style.animation = 'spin 0.7s linear infinite';
  try{
    BOOKINGS = await loadBookings();
    renderPendingBadgeAdmin();
    if(currentView === 'bookings') renderBookingsView();
  } catch(e){
  } finally {
    if(btn) btn.disabled = false;
    if(icon) icon.style.animation = '';
  }
}

async function updateBookingStatus(ref, status){
  const b = BOOKINGS.find(x => x.ref === ref);
  if(!b) return;
  const prev = b.status;
  b.status = status;
  const ok = await persistBookings();
  const note = document.getElementById('admin-save-note');
  if(!ok){
    b.status = prev; // roll back the in-memory change since it didn't actually save
    alert('Could not save this status change — the write to the server failed. Please check your connection and try again.');
    renderBookingsView();
    return;
  }
  renderPendingBadgeAdmin();
  if(note){ note.textContent = 'Saved'; note.classList.add('show'); setTimeout(()=>note.classList.remove('show'), 1500); }
}

async function deleteBooking(ref){
  if(!confirm(`Delete booking ${ref}? This cannot be undone.`)) return;
  const before = BOOKINGS.length;
  BOOKINGS = BOOKINGS.filter(b => b.ref !== ref);
  const ok = await persistBookings();
  if(!ok){
    alert('Could not delete this booking — the write to the server failed. Reloading current data.');
    BOOKINGS = await loadBookings();
  }
  renderPendingBadgeAdmin();
  renderBookingsView();
}

/* Clearing bookings — fixed to guarantee the deletion actually reached Supabase.
   persistBookings() now returns false (not a silent success) if the write fell
   back to localStorage, and we additionally read the data straight back from
   Supabase afterward to confirm the delete really stuck. */
async function clearScopedBookings(){
  const toRemove = new Set(BOOKINGS.filter(b => b.routeId === selectedRouteId && b.date === selectedDate).map(b => b.ref));
  if(toRemove.size === 0) return;
  if(!confirm(`Are you sure you want to clear these ${toRemove.size} booking(s) for ${selectedDate}? This action cannot be undone.`)) return;
  await performClear(b => !toRemove.has(b.ref));
}
async function clearAllBookings(){
  if(BOOKINGS.length === 0) return;
  if(!confirm(`Are you sure you want to clear ALL ${BOOKINGS.length} booking(s) across every route and date? This action cannot be undone.`)) return;
  if(!confirm(`Final check: this permanently deletes every booking in the system. Click OK to proceed.`)) return;
  await performClear(() => false);
}
async function performClear(keepFn){
  BOOKINGS = BOOKINGS.filter(keepFn);
  const ok = await persistBookings();
  if(!ok){
    alert('The server did not confirm the deletion — nothing may have actually been cleared. Please check your connection and try again.');
    BOOKINGS = await loadBookings();
    renderPendingBadgeAdmin();
    render();
    return;
  }
  // Verify by reading straight back from Supabase, not from memory.
  try{
    const res = await Storage.get('bookings', true);
    if(res.viaSupabase){
      BOOKINGS = JSON.parse(res.value);
    }
  } catch(e){ /* keep the in-memory state if verification read fails */ }
  renderPendingBadgeAdmin();
  render();
}

/* ---------- Trip details modal (shared across bookings view) ---------- */
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
  const prev = { driver: b.driver, busNumber: b.busNumber, seat: b.seat, pickup: b.pickup };
  b.driver = document.getElementById('trip-driver').value.trim();
  b.busNumber = document.getElementById('trip-bus').value.trim();
  b.seat = document.getElementById('trip-seat').value.trim();
  b.pickup = document.getElementById('trip-pickup').value.trim();
  const ok = await persistBookings();
  if(!ok){
    Object.assign(b, prev);
    alert('Could not save trip details — the write to the server failed.');
    return;
  }
  closeTripDetails();
  renderBookingsView();
}
document.getElementById('trip-modal').addEventListener('click', e => { if(e.target.id==='trip-modal') closeTripDetails(); });

/* ---------- Manage Routes ---------- */
let routeEditId = null;
function openRouteEditor(routeId){
  const r = CONFIG.routes.find(x => x.id === routeId);
  if(!r) return;
  routeEditId = routeId;
  const c = routeCities(r);
  document.getElementById('route-edit-direction').textContent = `Currently displayed as: ${c.from} → ${c.to}`;
  document.getElementById('edit-route-city').value = r.city;
  document.getElementById('edit-route-price').value = r.price;
  document.getElementById('edit-route-capacity').value = r.seatCapacity || 14;
  document.getElementById('edit-route-duration').value = r.duration;
  document.getElementById('edit-route-times').value = (r.times || []).join(', ');
  document.getElementById('edit-route-active').value = r.active === false ? 'false' : 'true';
  document.getElementById('route-edit-modal').classList.add('open');
}
function closeRouteEditor(){ document.getElementById('route-edit-modal').classList.remove('open'); routeEditId = null; }
async function saveRouteEdit(){
  const r = CONFIG.routes.find(x => x.id === routeEditId);
  if(!r) return;
  const city = document.getElementById('edit-route-city').value.trim();
  const price = parseInt(document.getElementById('edit-route-price').value, 10);
  const capacity = Math.max(1, parseInt(document.getElementById('edit-route-capacity').value, 10) || 14);
  const duration = document.getElementById('edit-route-duration').value.trim();
  const times = document.getElementById('edit-route-times').value.split(',').map(t=>t.trim()).filter(Boolean);
  const active = document.getElementById('edit-route-active').value === 'true';
  if(!city || !price || !times.length){ alert('Please fill in city, price and at least one time.'); return; }

  // Mutate the existing route object in place — id is never reassigned, so every
  // booking that stores this route's id keeps pointing at the same route.
  r.city = city;
  r.price = price;
  r.seatCapacity = capacity;
  r.duration = duration || '—';
  r.times = times;
  r.active = active;

  const ok = await persistConfig();
  if(!ok){ alert('Could not save — the write to the server failed. Please try again.'); return; }
  closeRouteEditor();
  renderRouteAdminList();
}
document.getElementById('route-edit-modal').addEventListener('click', e => { if(e.target.id==='route-edit-modal') closeRouteEditor(); });

function renderManageRoutesView(){
  const el = document.getElementById('admin-content');
  el.innerHTML = `
    <h2 class="admin-section-title">Manage Routes</h2>
    <div class="field">
      <label>Current season</label>
      <select id="season-select" onchange="changeSeason(this.value)">
        <option value="resumption" ${CONFIG.season==='resumption'?'selected':''}>Resumption (city → ABUAD)</option>
        <option value="vacation" ${CONFIG.season==='vacation'?'selected':''}>Vacation (ABUAD → city)</option>
      </select>
    </div>
    <p class="settings-hint">Switching season instantly flips the direction of every route below.</p>
    <div id="route-admin-list"></div>
    <h3 style="font-family:var(--display);font-size:1.05rem;margin:24px 0 12px;">Add a new route</h3>
    <div class="field-row">
      <div class="field"><label>City</label><input id="new-route-city" placeholder="e.g. Benin City"></div>
      <div class="field"><label>Price (₦)</label><input id="new-route-price" type="number"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Duration</label><input id="new-route-duration" placeholder="4h 30m"></div>
      <div class="field"><label>Times (comma separated, 24h)</label><input id="new-route-times" placeholder="07:00"></div>
    </div>
    <div class="field"><label>Seats per departure</label><input id="new-route-capacity" type="number" value="14"></div>
    <button class="btn-block secondary" onclick="addRoute()">+ Add route</button>
  `;
  renderRouteAdminList();
}
async function changeSeason(val){
  CONFIG.season = val;
  await persistConfig();
  render();
}
function toggleRouteDates(id){ expandedRouteId = expandedRouteId === id ? null : id; renderRouteAdminList(); }
function renderRouteAdminList(){
  const listEl = document.getElementById('route-admin-list');
  if(!listEl) return;
  if(!CONFIG.routes.length){ listEl.innerHTML = `<p style="color:var(--slate-400);font-size:0.85rem;">No routes yet.</p>`; return; }
  listEl.innerHTML = CONFIG.routes.map(r => {
    const c = routeCities(r);
    const dates = (r.availableDates||[]).slice().sort((a,b)=>a.date<b.date?-1:1);
    return `
    <div class="route-admin-row" style="flex-direction:column;align-items:stretch;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="flex:1;">
          ${c.from} → ${c.to} · ₦${r.price.toLocaleString()} · ${r.times.join(', ')} · <input type="number" value="${r.seatCapacity||14}" style="width:52px;background:var(--navy-950);border:1px solid var(--navy-600);color:var(--ink);border-radius:6px;padding:2px 6px;" onchange="updateCapacity('${r.id}', this.value)"> seats
          <span class="badge ${r.active===false ? 'cancelled' : 'confirmed'}" style="margin-left:8px;">${r.active===false ? 'Inactive' : 'Active'}</span>
        </span>
        <button class="refresh-btn" onclick="openRouteEditor('${r.id}')">Edit</button>
        <button class="refresh-btn" onclick="toggleRouteDates('${r.id}')">${expandedRouteId===r.id ? 'Hide dates' : `Dates (${dates.filter(d=>!d.closed).length})`}</button>
        <button class="del-btn" onclick="removeRoute('${r.id}')">Remove</button>
      </div>
      ${expandedRouteId===r.id ? `
      <div style="margin-top:10px;padding:10px;background:var(--navy-950);border-radius:8px;">
        ${dates.length === 0 ? `<p style="color:var(--slate-400);font-size:0.82rem;">No travel dates open yet.</p>` : dates.map(d => `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;">
            <span style="flex:1;${d.closed?'text-decoration:line-through;color:var(--slate-400);':''}">${d.date}</span>
            <button class="refresh-btn" onclick="toggleDateClosed('${r.id}','${d.date}')">${d.closed ? 'Reopen' : 'Close'}</button>
            <button class="del-btn" onclick="removeRouteDate('${r.id}','${d.date}')">Remove</button>
          </div>`).join('')}
        <div style="display:flex;gap:8px;margin-top:8px;">
          <input type="date" id="add-date-${r.id}" style="flex:1;background:var(--navy-950);border:1px solid var(--navy-600);color:var(--ink);border-radius:6px;padding:6px;">
          <button class="refresh-btn" onclick="addRouteDate('${r.id}')">+ Add date</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');
}
async function addRouteDate(routeId){
  const input = document.getElementById('add-date-'+routeId);
  const val = input.value;
  if(!val) return;
  const r = CONFIG.routes.find(x => x.id === routeId);
  if(!r) return;
  if(!r.availableDates) r.availableDates = [];
  if(!r.availableDates.some(d => d.date === val)) r.availableDates.push({ date: val, closed:false });
  input.value = '';
  await persistConfig();
  renderRouteAdminList();
}
async function toggleDateClosed(routeId, date){
  const r = CONFIG.routes.find(x => x.id === routeId);
  if(!r) return;
  const d = (r.availableDates||[]).find(x => x.date === date);
  if(!d) return;
  d.closed = !d.closed;
  await persistConfig();
  renderRouteAdminList();
}
async function removeRouteDate(routeId, date){
  const r = CONFIG.routes.find(x => x.id === routeId);
  if(!r) return;
  r.availableDates = (r.availableDates||[]).filter(d => d.date !== date);
  await persistConfig();
  renderRouteAdminList();
}
async function updateCapacity(id, val){
  const r = CONFIG.routes.find(x => x.id === id);
  if(!r) return;
  r.seatCapacity = Math.max(1, parseInt(val, 10) || 14);
  await persistConfig();
}
async function removeRoute(id){
  if(!confirm('Remove this route? Existing bookings for it are kept, but it will no longer be bookable.')) return;
  CONFIG.routes = CONFIG.routes.filter(r => r.id !== id);
  await persistConfig();
  renderRouteAdminList();
}
async function addRoute(){
  const city = document.getElementById('new-route-city').value.trim();
  const price = parseInt(document.getElementById('new-route-price').value, 10);
  const duration = document.getElementById('new-route-duration').value.trim();
  const times = document.getElementById('new-route-times').value.split(',').map(t=>t.trim()).filter(Boolean);
  const seatCapacity = Math.max(1, parseInt(document.getElementById('new-route-capacity').value, 10) || 14);
  if(!city || !price || !times.length){ alert('Please fill in city, price and at least one time.'); return; }
  CONFIG.routes.push({ id: 'r' + Date.now(), city, price, duration: duration || '—', times, seatCapacity, availableDates: seedDates(5), active: true });
  await persistConfig();
  ['new-route-city','new-route-price','new-route-duration','new-route-times'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('new-route-capacity').value = '14';
  renderRouteAdminList();
}

/* ---------- Settings ---------- */
function renderSettingsView(){
  const el = document.getElementById('admin-content');
  el.innerHTML = `
    <h2 class="admin-section-title">Settings</h2>
    <p class="settings-hint">These changes save to shared storage immediately and apply for everyone.</p>
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
function addWhatsappNumber(){
  const val = document.getElementById('new-wa-number').value.trim();
  if(!val) return;
  CONFIG.whatsappNumbers.push(val);
  document.getElementById('new-wa-number').value = '';
  renderWaNumberList();
}
function removeWhatsappNumber(i){
  CONFIG.whatsappNumbers.splice(i, 1);
  renderWaNumberList();
}
async function saveSettings(){
  CONFIG.bank.accountName = document.getElementById('set-acc-name').value.trim();
  CONFIG.bank.accountNumber = document.getElementById('set-acc-num').value.trim();
  CONFIG.bank.bankName = document.getElementById('set-bank-name').value.trim();
  CONFIG.adminPin = document.getElementById('set-pin').value.trim() || DEFAULT_CONFIG.adminPin;
  const ok = await persistConfig();
  const note = document.getElementById('settings-save-note');
  note.textContent = ok ? 'Saved' : 'Save failed — try again';
  note.classList.add('show');
  setTimeout(()=>note.classList.remove('show'), 1500);
}
