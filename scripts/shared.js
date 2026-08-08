/* ============================================================
   SHARED DATA LAYER — used by both index.html (customer site)
   and admin/index.html (admin dashboard). Keeping this in one
   file means both pages always talk to Supabase the same way,
   with no drift between them.
   ============================================================ */

function seedDates(n){
  const out = [];
  const today = new Date();
  for(let i=1;i<=n;i++){
    const d = new Date(today); d.setDate(d.getDate() + i);
    out.push({ date: d.toISOString().slice(0,10), closed:false });
  }
  return out;
}

const DEFAULT_CONFIG = {
  whatsappNumbers: ["2348000000000"],
  adminPin: "2580",
  bank: { accountName: "Utseoritselaju Atigan Priestly", accountNumber: "8082824688", bankName: "OPay" },
  // "resumption" = city → ABUAD. "vacation" = ABUAD → city. Toggle in Admin → Routes;
  // every route's displayed direction is derived from this automatically.
  season: "resumption",
  // Durations sourced from real road-distance data for Ado-Ekiti (ABUAD's location). Prices are placeholders.
  // availableDates are admin-controlled — customers only ever see dates the admin has opened.
  routes: [
    { id: "r1", city: "Lagos", price: 8500, duration: "4h 30m", times: ["07:00"], seatCapacity: 14, availableDates: seedDates(5) },
    { id: "r2", city: "Benin City", price: 6000, duration: "3h 30m", times: ["07:00"], seatCapacity: 14, availableDates: seedDates(5) },
    { id: "r3", city: "Warri", price: 9000, duration: "4h 45m", times: ["07:00"], seatCapacity: 14, availableDates: seedDates(5) },
    { id: "r4", city: "Abuja", price: 12000, duration: "6h 30m", times: ["07:00"], seatCapacity: 14, availableDates: seedDates(5) }
  ],
  luggageOptions: [
    { id: "l1", label: "Extra bag (beyond 2 free bags per passenger)", price: 10000 },
    { id: "l2", label: "Fragile / special handling item", price: 8000 }
  ]
};

function routeCities(r){
  return CONFIG.season === 'vacation' ? { from: 'ABUAD', to: r.city } : { from: r.city, to: 'ABUAD' };
}

const STATUS_LABELS = {
  pending: '🟡 Waiting for Payment Verification',
  confirmed: '✅ Confirmed',
  cancelled: '❌ Cancelled'
};
function statusLabel(s){ return STATUS_LABELS[s] || s; }

let CONFIG = null;
let BOOKINGS = [];
let STORAGE_OK = true;

/* Real shared backend: Supabase (Postgres + auto-generated REST API), single kv_store table.
   Every device that opens either page reads/writes the same data.
   IMPORTANT: Storage.set/get report whether the write/read actually reached Supabase
   (viaSupabase: true/false). Callers doing anything destructive (like clearing bookings)
   MUST check this — silently falling back to localStorage on a failed Supabase write
   used to be reported as "success" even though nothing was actually deleted server-side.
   That was the root cause of "clear bookings doesn't stick after refresh." */
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
      return { key, value: JSON.stringify(rows[0].value), shared: true, viaSupabase: true };
    } catch(e){
      const raw = localStorage.getItem('bigdrive_' + key);
      if(raw === null) throw new Error('not found');
      return { key, value: raw, shared: !!shared, viaSupabase: false };
    }
  },
  async set(key, value, shared){
    try{
      // on_conflict=key makes the upsert target explicit — without it, some PostgREST
      // configurations reject the merge-duplicates upsert with a 409, which was silently
      // swallowed by the catch block below and masked as a successful save.
      const res = await fetch(`${SUPABASE_URL}/rest/v1/kv_store?on_conflict=key`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key, value: JSON.parse(value) })
      });
      if(!res.ok){
        const errText = await res.text().catch(()=>'');
        throw new Error('supabase set failed: ' + res.status + ' ' + errText);
      }
      return { key, value, shared: true, viaSupabase: true };
    } catch(e){
      console.error('[Storage] Supabase write failed, falling back to localStorage:', e);
      localStorage.setItem('bigdrive_' + key, value);
      return { key, value, shared: !!shared, viaSupabase: false };
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
  if(cfg.routes){
    cfg.routes.forEach(r => {
      if(!r.seatCapacity) r.seatCapacity = 14;
      if(!r.availableDates) r.availableDates = seedDates(5);
    });
  }
  return cfg;
}
function primaryWhatsapp(){ return (CONFIG.whatsappNumbers && CONFIG.whatsappNumbers[0]) || DEFAULT_CONFIG.whatsappNumbers[0]; }

async function persistConfig(){
  const result = await Storage.set('config', JSON.stringify(CONFIG), true);
  if(!result.viaSupabase){ flagStorageIssue(); return false; }
  return true;
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
  const result = await Storage.set('bookings', JSON.stringify(BOOKINGS), true);
  if(!result.viaSupabase){ flagStorageIssue(); return false; }
  return true;
}
function flagStorageIssue(){
  STORAGE_OK = false;
  const banner = document.getElementById('storage-banner');
  if(banner) banner.classList.add('show');
}

function seatsBookedFor(routeId, date, time){
  return BOOKINGS.filter(b => b.routeId === routeId && b.date === date && b.time === time && b.status !== 'cancelled')
    .reduce((sum, b) => sum + (b.seatsBooked || 1), 0);
}
function seatsLeftFor(route, date, time){
  return Math.max(0, (route.seatCapacity || 14) - seatsBookedFor(route.id, date, time));
}
