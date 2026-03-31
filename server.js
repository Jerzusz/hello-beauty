require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Foldery ────────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_DIR = path.join(__dirname, 'db');
[UPLOADS_DIR, DB_DIR].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

// ─── Prosta baza JSON ────────────────────────────────────────────────────────
function dbPath(table) { return path.join(DB_DIR, `${table}.json`); }
function readDB(table) {
  try { return JSON.parse(fs.readFileSync(dbPath(table), 'utf8')); }
  catch { return []; }
}
function writeDB(table, data) { fs.writeFileSync(dbPath(table), JSON.stringify(data, null, 2), 'utf8'); }
function nextId(arr) { return arr.length ? Math.max(...arr.map(r => r.id)) + 1 : 1; }

// ─── Inicjalizacja baz ───────────────────────────────────────────────────────
if (!fs.existsSync(dbPath('admin')) || readDB('admin').length === 0) {
  writeDB('admin', [{ id:1, username:'admin', password_hash: bcrypt.hashSync('admin123', 10) }]);
}
if (!fs.existsSync(dbPath('workers')) || readDB('workers').length === 0) {
  writeDB('workers', [
    { id:1, name:'Sandra', work_days:[1,2,3,4,5,6], work_start:'09:00', work_end:'18:00' },
    { id:2, name:'Nikola', work_days:[1,2,3,4,5,6], work_start:'09:00', work_end:'18:00' },
  ]);
}
['reservations','portfolio','blocked_slots','services','vacations','faq'].forEach(t => { if (!fs.existsSync(dbPath(t))) writeDB(t, []); });

// ─── Pomocniki czasu ─────────────────────────────────────────────────────────
function timeToMin(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function minToTime(m) { return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function getPossibleStarts(durationMin, workStartMin = 9*60, workEndMin = 18*60) {
  const starts = [];
  for (let t = workStartMin; t + durationMin <= workEndMin; t += 60) starts.push(minToTime(t));
  return starts;
}

function isSlotAvailable(date, startTime, durationMin, requiredWorkers, reservations, blockedSlots, vacations) {
  for (const worker of requiredWorkers) {
    if ((vacations||[]).some(v => v.worker_name === worker && date >= v.date_from && date <= v.date_to)) return false;
  }
  const start = timeToMin(startTime);
  const end   = start + durationMin;
  for (const b of blockedSlots.filter(b => b.date === date)) {
    const bMin = timeToMin(b.time);
    if (bMin >= start && bMin < end) return false;
  }
  const dayRes = reservations.filter(r => r.date === date && r.status !== 'cancelled');
  if (requiredWorkers.length > 0) {
    for (const worker of requiredWorkers) {
      for (const res of dayRes) {
        if (!res.workers || !res.workers.includes(worker)) continue;
        const rStart = timeToMin(res.time);
        const rEnd   = rStart + (res.duration_minutes || 60);
        if (!(end <= rStart || start >= rEnd)) return false;
      }
    }
  } else {
    // Brak przypisanych pracowników – sprawdź wszystkie rezerwacje
    for (const res of dayRes) {
      const rStart = timeToMin(res.time);
      const rEnd   = rStart + (res.duration_minutes || 60);
      if (!(end <= rStart || start >= rEnd)) return false;
    }
  }
  return true;
}

// ─── Rate limiting ───────────────────────────────────────────────────────────
const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  if (attempts.length >= 10) return false;
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  return true;
}

const reservationAttempts = new Map();
function checkReservationRateLimit(ip) {
  const now = Date.now();
  const attempts = (reservationAttempts.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
  if (attempts.length >= 20) return false;
  attempts.push(now);
  reservationAttempts.set(ip, attempts);
  return true;
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Blokada dostępu do wrażliwych plików serwera (musi być PRZED express.static)
const BLOCKED_STATIC = ['/db', '/node_modules', '/server.js', '/package.json', '/package-lock.json'];
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (BLOCKED_STATIC.some(b => p === b || p.startsWith(b + '/'))) {
    return res.status(403).end();
  }
  next();
});

app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(UPLOADS_DIR));
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  proxy: true,
  store: new FileStore({ path: path.join(__dirname, 'db', 'sessions'), ttl: 8 * 60 * 60, retries: 1, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || 'salon-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000, httpOnly: true, secure: isProduction ? 'auto' : false, sameSite: 'lax' }
}));

// Nagłówki bezpieczeństwa
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ─── Multer ──────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `photo_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits:{ fileSize:10*1024*1024 }, fileFilter:(req,file,cb)=>cb(null,/jpeg|jpg|png|webp/i.test(path.extname(file.originalname))) });

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error:'Brak autoryzacji' });
}

// ═══ PRACOWNICY ═══════════════════════════════════════════════════════════════
app.get('/api/workers', (req, res) => res.json(readDB('workers')));

// ═══ USŁUGI ═══════════════════════════════════════════════════════════════════
app.get('/api/services', (req, res) => res.json(readDB('services')));

// ═══ DOSTĘPNOŚĆ ═══════════════════════════════════════════════════════════════
app.get('/api/availability/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const serviceId    = req.query.service_id ? parseInt(req.query.service_id) : null;
  const variantIndex = req.query.variant_index !== undefined ? parseInt(req.query.variant_index) : null;
  const prefix = `${year}-${String(month).padStart(2,'0')}`;

  const services = readDB('services');
  let durationMin     = 60;
  let requiredWorkers = [];
  if (serviceId) {
    const svc = services.find(s => s.id === serviceId);
    if (svc) {
      requiredWorkers = svc.workers || [];
      if (variantIndex !== null && svc.variants && svc.variants[variantIndex]) {
        durationMin = svc.variants[variantIndex].duration_minutes || 60;
      } else if (svc.variants && svc.variants.length > 0) {
        durationMin = svc.variants[0].duration_minutes || 60;
      } else {
        durationMin = svc.duration_minutes || 60;
      }
    }
  }

  const reservations = readDB('reservations').filter(r => r.date && r.date.startsWith(prefix));
  const blocked      = readDB('blocked_slots').filter(b => b.date && b.date.startsWith(prefix));
  const vacations    = readDB('vacations');
  const workers      = readDB('workers');
  const daysInMonth  = new Date(year, month, 0).getDate();
  const result = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${prefix}-${String(d).padStart(2,'0')}`;
    const dayOfWeek = new Date(dateStr).getDay();

    let isWorkDay = true;
    if (requiredWorkers.length > 0) {
      isWorkDay = requiredWorkers.every(wName => {
        const w = workers.find(wr => wr.name === wName);
        if (!w || !w.work_days.includes(dayOfWeek)) return false;
        return !vacations.some(v => v.worker_name === wName && dateStr >= v.date_from && dateStr <= v.date_to);
      });
    } else {
      isWorkDay = dayOfWeek !== 0;
    }
    if (!isWorkDay) { result[dateStr] = { status:'closed', slots:[] }; continue; }

    // Oblicz wspólne godziny pracy (iloczyn godzin wszystkich wymaganych pracowników)
    let workStartMin = 9 * 60;
    let workEndMin   = 18 * 60;
    if (requiredWorkers.length > 0) {
      requiredWorkers.forEach(wName => {
        const w = workers.find(wr => wr.name === wName);
        if (w) {
          workStartMin = Math.max(workStartMin, timeToMin(w.work_start || '09:00'));
          workEndMin   = Math.min(workEndMin,   timeToMin(w.work_end   || '18:00'));
        }
      });
    }

    const slots = getPossibleStarts(durationMin, workStartMin, workEndMin).map(time => ({
      time,
      available: isSlotAvailable(dateStr, time, durationMin, requiredWorkers, reservations, blocked, vacations)
    }));
    const free = slots.filter(s => s.available).length;
    result[dateStr] = { status: free===0?'full':free<=2?'limited':'available', slots };
  }
  res.json(result);
});

// ═══ REZERWACJE ════════════════════════════════════════════════════════════════
const DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

app.post('/api/reservations', (req, res) => {
  if (!checkReservationRateLimit(req.ip))
    return res.status(429).json({ error: 'Zbyt wiele prób rezerwacji. Spróbuj ponownie za godzinę.' });
  const { client_name, client_phone, service_id, variant_index, date, time, notes } = req.body;
  if (!client_name || !client_phone || !date || !time || !service_id)
    return res.status(400).json({ error:'Wypełnij wszystkie wymagane pola' });

  if (!DATE_RE.test(date) || !TIME_RE.test(time))
    return res.status(400).json({ error:'Nieprawidłowy format daty lub godziny' });

  if (String(client_name).length > 100 || String(client_phone).length > 20 || String(notes||'').length > 500)
    return res.status(400).json({ error:'Przekroczono dozwolony limit znaków w polach formularza' });

  const services = readDB('services');
  const svc = services.find(s => s.id === parseInt(service_id));
  if (!svc) return res.status(400).json({ error:'Nieznana usługa' });

  const vIdx = (variant_index !== undefined && variant_index !== null && variant_index !== '') ? parseInt(variant_index) : null;
  let variantLabel = null;
  let durationMin, price;
  if (vIdx !== null && svc.variants && svc.variants[vIdx]) {
    variantLabel = svc.variants[vIdx].label;
    durationMin  = svc.variants[vIdx].duration_minutes;
    price        = svc.variants[vIdx].price;
  } else {
    durationMin  = svc.duration_minutes || 60;
    price        = svc.price_from;
  }

  const requiredWorkers = svc.workers || [];
  const reservations    = readDB('reservations');
  const blocked         = readDB('blocked_slots');

  const vacations = readDB('vacations');
  if (!isSlotAvailable(date, time, durationMin, requiredWorkers, reservations, blocked, vacations))
    return res.status(409).json({ error:'Ten termin jest już zajęty dla wymaganych pracowników' });

  const item = {
    id: nextId(reservations),
    client_name, client_phone,
    service_id: svc.id, service_name: svc.name,
    variant_label: variantLabel,
    workers: requiredWorkers,
    duration_minutes: durationMin,
    price,
    date, time,
    status:'pending',
    notes: notes||'',
    created_at: new Date().toISOString()
  };
  reservations.push(item);
  writeDB('reservations', reservations);
  res.json({ success:true, id:item.id, message:'Rezerwacja złożona pomyślnie! Skontaktujemy się z Tobą wkrótce.' });
});

// ═══ PORTFOLIO ════════════════════════════════════════════════════════════════
app.get('/api/portfolio', (req, res) => res.json(readDB('portfolio').sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))));

// ═══ ADMIN – AUTH ═════════════════════════════════════════════════════════════
app.post('/api/admin/login', (req, res) => {
  if (!checkRateLimit(req.ip))
    return res.status(429).json({ error:'Zbyt wiele nieudanych prób. Poczekaj 15 minut.' });
  const { username, password } = req.body;
  const admin = readDB('admin').find(a=>a.username===username);
  if (!admin||!bcrypt.compareSync(password, admin.password_hash)) return res.status(401).json({ error:'Nieprawidłowy login lub hasło' });
  loginAttempts.delete(req.ip);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error:'Nie udało się utworzyć sesji' });
    req.session.adminId = admin.id;
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ error:'Nie udało się zapisać sesji' });
      res.json({ success:true });
    });
  });
});
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success:true }));
});
app.get('/api/admin/check', (req, res) => res.json({ loggedIn:!!(req.session&&req.session.adminId) }));

// ═══ ADMIN – REZERWACJE ════════════════════════════════════════════════════════
app.get('/api/admin/reservations', requireAuth, (req, res) =>
  res.json(readDB('reservations').sort((a,b)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time))));

app.patch('/api/admin/reservations/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const ALLOWED_STATUSES = ['pending', 'confirmed', 'cancelled'];
  if (!ALLOWED_STATUSES.includes(req.body.status))
    return res.status(400).json({ error:'Nieprawidłowy status' });
  const data = readDB('reservations');
  const idx = data.findIndex(r=>r.id===id);
  if (idx===-1) return res.status(404).json({ error:'Nie znaleziono' });
  data[idx].status = req.body.status;
  writeDB('reservations', data);
  res.json({ success:true });
});
app.delete('/api/admin/reservations/:id', requireAuth, (req, res) => {
  writeDB('reservations', readDB('reservations').filter(r=>r.id!==parseInt(req.params.id)));
  res.json({ success:true });
});

// Eksport CSV rezerwacji
app.get('/api/admin/reservations/export/csv', requireAuth, (req, res) => {
  const reservations = readDB('reservations').sort((a,b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const escape = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const header = ['ID','Data','Godzina','Klient','Telefon','Usługa','Wariant','Pracownicy','Czas (min)','Cena (zł)','Status','Uwagi','Złożono'];
  const rows = reservations.map(r => [
    r.id, r.date, r.time,
    r.client_name, r.client_phone,
    r.service_name || '', r.variant_label || '',
    (r.workers || []).join('; '),
    r.duration_minutes || '', r.price || '',
    r.status, r.notes || '',
    r.created_at ? r.created_at.slice(0,16).replace('T',' ') : ''
  ].map(escape).join(','));

  const bom = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rezerwacje_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(bom + [header.map(escape).join(','), ...rows].join('\r\n'));
});

// Ręczna rezerwacja przez admina (pomija rate limit, nie wymaga dostępności)
app.post('/api/admin/reservations', requireAuth, (req, res) => {
  const { client_name, client_phone, service_id, variant_index, date, time, notes, status } = req.body;
  if (!client_name || !client_phone || !date || !time)
    return res.status(400).json({ error: 'Wypełnij wymagane pola' });
  if (!DATE_RE.test(date) || !TIME_RE.test(time))
    return res.status(400).json({ error: 'Nieprawidłowy format daty lub godziny' });

  const services = readDB('services');
  const svc = service_id ? services.find(s => s.id === parseInt(service_id)) : null;
  const vIdx = (variant_index !== undefined && variant_index !== null && variant_index !== '') ? parseInt(variant_index) : null;
  let variantLabel = null, durationMin = 60, price = 0;
  if (svc) {
    if (vIdx !== null && svc.variants && svc.variants[vIdx]) {
      variantLabel = svc.variants[vIdx].label;
      durationMin  = svc.variants[vIdx].duration_minutes;
      price        = svc.variants[vIdx].price;
    } else {
      durationMin = svc.duration_minutes || 60;
      price       = svc.price_from || 0;
    }
  }

  const reservations = readDB('reservations');
  const item = {
    id: nextId(reservations),
    client_name: String(client_name).trim(),
    client_phone: String(client_phone).trim(),
    service_id: svc ? svc.id : null,
    service_name: svc ? svc.name : 'Inna',
    variant_label: variantLabel,
    workers: svc ? (svc.workers || []) : [],
    duration_minutes: durationMin,
    price,
    date, time,
    status: ['pending','confirmed','cancelled'].includes(status) ? status : 'confirmed',
    notes: String(notes || '').slice(0, 500),
    created_at: new Date().toISOString()
  };
  reservations.push(item);
  writeDB('reservations', reservations);
  res.json({ success: true, id: item.id });
});

// ═══ ADMIN – SLOTY DNIA ════════════════════════════════════════════════════════
app.get('/api/admin/slots/:date', requireAuth, (req, res) => {
  const { date } = req.params;
  const reservations = readDB('reservations');
  const blocked      = readDB('blocked_slots');
  const vacations    = readDB('vacations');
  const workers      = readDB('workers');
  const workersOnVacation = workers
    .filter(w => vacations.some(v => v.worker_name === w.name && date >= v.date_from && date <= v.date_to))
    .map(w => {
      const vac = vacations.find(v => v.worker_name === w.name && date >= v.date_from && date <= v.date_to);
      return { name: w.name, reason: vac ? (vac.reason || '') : '' };
    });
  const slots = [];
  for (let h = 9; h <= 17; h++) {
    const time = `${String(h).padStart(2,'0')}:00`;
    const slotMin = timeToMin(time);
    const blockedEntry = blocked.find(b => b.date === date && b.time === time);
    const startingRes  = reservations.find(r => r.date === date && r.time === time && r.status !== 'cancelled');
    const ongoingRes   = (!startingRes && !blockedEntry)
      ? reservations.find(r => {
          if (r.date !== date || r.status === 'cancelled') return false;
          const rStart = timeToMin(r.time);
          return rStart < slotMin && rStart + (r.duration_minutes || 60) > slotMin;
        })
      : null;

    let status = 'free';
    let resData = null;
    if (blockedEntry) {
      status = 'blocked';
    } else if (startingRes) {
      status = 'booked';
      resData = { id: startingRes.id, client_name: startingRes.client_name, service_name: startingRes.service_name || startingRes.service, res_status: startingRes.status, duration_minutes: startingRes.duration_minutes, start_time: startingRes.time };
    } else if (ongoingRes) {
      status = 'ongoing';
      resData = { id: ongoingRes.id, client_name: ongoingRes.client_name, service_name: ongoingRes.service_name || ongoingRes.service, res_status: ongoingRes.status, duration_minutes: ongoingRes.duration_minutes, start_time: ongoingRes.time };
    }

    slots.push({
      time, status,
      reason:      blockedEntry ? (blockedEntry.reason || null) : null,
      reservation: resData
    });
  }
  res.json({ slots, workersOnVacation });
});

// ═══ ADMIN – URLOPY ════════════════════════════════════════════════════════════
app.get('/api/admin/vacations', requireAuth, (req, res) => res.json(readDB('vacations')));
app.post('/api/admin/vacations', requireAuth, (req, res) => {
  const { worker_name, date_from, date_to, reason } = req.body;
  if (!worker_name || !date_from || !date_to) return res.status(400).json({ error:'Wypełnij wymagane pola' });
  if (date_from > date_to) return res.status(400).json({ error:'Data "od" musi być wcześniejsza niż data "do"' });
  const data = readDB('vacations');
  const item = { id:nextId(data), worker_name, date_from, date_to, reason:reason||'' };
  data.push(item); writeDB('vacations', data);
  res.json({ success:true, id:item.id });
});
app.delete('/api/admin/vacations/:id', requireAuth, (req, res) => {
  writeDB('vacations', readDB('vacations').filter(v => v.id !== parseInt(req.params.id)));
  res.json({ success:true });
});

// ═══ ADMIN – BLOKOWANIE ════════════════════════════════════════════════════════
app.post('/api/admin/block', requireAuth, (req, res) => {
  const { date, time, reason } = req.body;
  const data = readDB('blocked_slots');
  if (!data.find(b=>b.date===date&&b.time===time)) data.push({ id:nextId(data), date, time, reason:reason||'' });
  writeDB('blocked_slots', data);
  res.json({ success:true });
});
app.delete('/api/admin/block', requireAuth, (req, res) => {
  writeDB('blocked_slots', readDB('blocked_slots').filter(b=>!(b.date===req.body.date&&b.time===req.body.time)));
  res.json({ success:true });
});

// ═══ ADMIN – PORTFOLIO ════════════════════════════════════════════════════════
app.post('/api/admin/portfolio', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error:'Brak pliku' });
  const { title, description, category } = req.body;
  const data = readDB('portfolio');
  const item = { id:nextId(data), title:title||'', description:description||'', filename:req.file.filename, category:category||'general', created_at:new Date().toISOString() };
  data.push(item); writeDB('portfolio', data);
  res.json({ success:true, filename:req.file.filename });
});
app.delete('/api/admin/portfolio/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const data = readDB('portfolio');
  const item = data.find(p=>p.id===id);
  if (item) { const fp=path.join(UPLOADS_DIR,item.filename); if(fs.existsSync(fp))fs.unlinkSync(fp); writeDB('portfolio',data.filter(p=>p.id!==id)); }
  res.json({ success:true });
});

// ═══ ADMIN – USŁUGI ════════════════════════════════════════════════════════════
function deriveServicePrices(body) {
  const { price_from, price_to, duration_minutes, variants } = body;
  if (variants && variants.length > 0) {
    return {
      price_from:       Math.min(...variants.map(v => +v.price)),
      price_to:         Math.max(...variants.map(v => +v.price)),
      duration_minutes: Math.min(...variants.map(v => +v.duration_minutes)),
    };
  }
  return { price_from: +price_from||0, price_to: +price_to||0, duration_minutes: +duration_minutes||60 };
}

app.post('/api/admin/services', requireAuth, (req, res) => {
  const { name, description, category, workers, variants } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error:'Podaj nazwę usługi' });
  const data = readDB('services');
  const computed = deriveServicePrices(req.body);
  const item = { id:nextId(data), name, description:description||'', category:category||'inne', workers:workers||[], variants:variants||[], ...computed };
  data.push(item); writeDB('services', data);
  res.json({ success:true, id:item.id });
});
app.put('/api/admin/services/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, category, workers, variants } = req.body;
  const data = readDB('services');
  const idx = data.findIndex(s=>s.id===id);
  if (idx===-1) return res.status(404).json({ error:'Nie znaleziono' });
  const computed = deriveServicePrices(req.body);
  data[idx] = { ...data[idx], name, description:description||'', category, workers:workers||[], variants:variants||[], ...computed };
  writeDB('services', data);
  res.json({ success:true });
});
app.delete('/api/admin/services/:id', requireAuth, (req, res) => {
  writeDB('services', readDB('services').filter(s=>s.id!==parseInt(req.params.id)));
  res.json({ success:true });
});

// ═══ ADMIN – PRACOWNICY ═══════════════════════════════════════════════════════
app.get('/api/admin/workers', requireAuth, (req, res) => res.json(readDB('workers')));
app.post('/api/admin/workers', requireAuth, (req, res) => {
  const { name, work_days, work_start, work_end } = req.body;
  if (!name) return res.status(400).json({ error:'Podaj imię pracownika' });
  const data = readDB('workers');
  const item = { id:nextId(data), name, work_days:work_days||[1,2,3,4,5,6], work_start:work_start||'09:00', work_end:work_end||'18:00' };
  data.push(item); writeDB('workers', data);
  res.json({ success:true, id:item.id });
});
app.put('/api/admin/workers/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, work_days, work_start, work_end } = req.body;
  const data = readDB('workers');
  const idx = data.findIndex(w=>w.id===id);
  if (idx===-1) return res.status(404).json({ error:'Nie znaleziono' });
  data[idx] = { ...data[idx], name, work_days:work_days||[1,2,3,4,5,6], work_start:work_start||'09:00', work_end:work_end||'18:00' };
  writeDB('workers', data);
  res.json({ success:true });
});
app.delete('/api/admin/workers/:id', requireAuth, (req, res) => {
  writeDB('workers', readDB('workers').filter(w=>w.id!==parseInt(req.params.id)));
  res.json({ success:true });
});

// ═══ STRONA GŁÓWNA – TREŚĆ ════════════════════════════════════════════════════
app.get('/api/homepage', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DB_DIR, 'homepage.json'), 'utf8'));
    res.json(data);
  } catch { res.status(500).json({ error: 'Błąd odczytu' }); }
});

app.put('/api/admin/homepage', requireAuth, (req, res) => {
  try {
    fs.writeFileSync(path.join(DB_DIR, 'homepage.json'), JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Błąd zapisu' }); }
});

// ═══ KALKULATOR ═══════════════════════════════════════════════════════════════
function readCalculator() {
  try { return JSON.parse(fs.readFileSync(dbPath('calculator'), 'utf8')); }
  catch { return { lengths: [], densities: [], methods: [], keratynowa_info: '', prices: {} }; }
}
function writeCalculator(data) {
  fs.writeFileSync(dbPath('calculator'), JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/calculator', (req, res) => res.json(readCalculator()));

// Admin – pobierz
app.get('/api/admin/calculator', requireAuth, (req, res) => res.json(readCalculator()));

// Admin – zapisz całość (lengths, densities, methods, keratynowa_info, prices)
app.put('/api/admin/calculator', requireAuth, (req, res) => {
  const { lengths, densities, methods, keratynowa_info, prices } = req.body;
  const current = readCalculator();
  const updated = {
    lengths:        Array.isArray(lengths)   ? lengths   : current.lengths,
    densities:      Array.isArray(densities) ? densities : current.densities,
    methods:        Array.isArray(methods)   ? methods   : current.methods,
    keratynowa_info: typeof keratynowa_info === 'string' ? keratynowa_info : current.keratynowa_info,
    prices:         (prices && typeof prices === 'object') ? prices : current.prices
  };
  writeCalculator(updated);
  res.json({ success: true });
});

// ─── Helpers dla options (lengths / densities / methods) ─────────────────────
function calcOptionAdd(field, label, extra) {
  const data = readCalculator();
  const arr  = data[field] || [];
  const ids  = arr.map(x => x.id).filter(Number.isInteger);
  const newId = ids.length ? Math.max(...ids) + 1 : 1;
  const item  = { id: newId, label, ...extra };
  arr.push(item);
  data[field] = arr;
  writeCalculator(data);
  return item;
}
function calcOptionUpdate(field, id, label, extra) {
  const data = readCalculator();
  const arr  = data[field] || [];
  const idx  = arr.findIndex(x => x.id === id);
  if (idx === -1) return null;
  arr[idx] = { ...arr[idx], label, ...extra };
  data[field] = arr;
  writeCalculator(data);
  return arr[idx];
}
function calcOptionDelete(field, id) {
  const data = readCalculator();
  data[field] = (data[field] || []).filter(x => x.id !== id);
  // Wyczyść ceny powiązane z usuniętą opcją
  if (field === 'lengths' || field === 'densities' || field === 'methods') {
    const newPrices = {};
    for (const [key, val] of Object.entries(data.prices || {})) {
      const parts = key.split('_').map(Number);
      const fieldIdx = { lengths: 0, densities: 1, methods: 2 }[field];
      if (parts[fieldIdx] !== id) newPrices[key] = val;
    }
    data.prices = newPrices;
  }
  writeCalculator(data);
}

app.post('/api/admin/calculator/lengths',   requireAuth, (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'Podaj nazwę' });
  res.json({ success: true, item: calcOptionAdd('lengths', label, {}) });
});
app.put('/api/admin/calculator/lengths/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'Podaj nazwę' });
  const item = calcOptionUpdate('lengths', id, label, {});
  if (!item) return res.status(404).json({ error: 'Nie znaleziono' });
  res.json({ success: true, item });
});
app.delete('/api/admin/calculator/lengths/:id', requireAuth, (req, res) => {
  calcOptionDelete('lengths', parseInt(req.params.id));
  res.json({ success: true });
});

app.post('/api/admin/calculator/densities',   requireAuth, (req, res) => {
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'Podaj nazwę' });
  res.json({ success: true, item: calcOptionAdd('densities', label, {}) });
});
app.put('/api/admin/calculator/densities/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { label } = req.body;
  if (!label) return res.status(400).json({ error: 'Podaj nazwę' });
  const item = calcOptionUpdate('densities', id, label, {});
  if (!item) return res.status(404).json({ error: 'Nie znaleziono' });
  res.json({ success: true, item });
});
app.delete('/api/admin/calculator/densities/:id', requireAuth, (req, res) => {
  calcOptionDelete('densities', parseInt(req.params.id));
  res.json({ success: true });
});

app.post('/api/admin/calculator/methods',   requireAuth, (req, res) => {
  const { label, is_keratynowa } = req.body;
  if (!label) return res.status(400).json({ error: 'Podaj nazwę' });
  res.json({ success: true, item: calcOptionAdd('methods', label, { is_keratynowa: !!is_keratynowa }) });
});
app.put('/api/admin/calculator/methods/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { label, is_keratynowa } = req.body;
  if (!label) return res.status(400).json({ error: 'Podaj nazwę' });
  const item = calcOptionUpdate('methods', id, label, { is_keratynowa: !!is_keratynowa });
  if (!item) return res.status(404).json({ error: 'Nie znaleziono' });
  res.json({ success: true, item });
});
app.delete('/api/admin/calculator/methods/:id', requireAuth, (req, res) => {
  calcOptionDelete('methods', parseInt(req.params.id));
  res.json({ success: true });
});

// Admin – keratynowa info
app.put('/api/admin/calculator/keratynowa-info', requireAuth, (req, res) => {
  const { keratynowa_info } = req.body;
  if (typeof keratynowa_info !== 'string') return res.status(400).json({ error: 'Nieprawidłowe dane' });
  const data = readCalculator();
  data.keratynowa_info = keratynowa_info;
  writeCalculator(data);
  res.json({ success: true });
});

// Admin – ceny (macierz)
app.put('/api/admin/calculator/prices', requireAuth, (req, res) => {
  const { prices } = req.body;
  if (!prices || typeof prices !== 'object') return res.status(400).json({ error: 'Nieprawidłowe dane' });
  // Walidacja kluczy i wartości
  const clean = {};
  for (const [key, val] of Object.entries(prices)) {
    if (/^\d+_\d+_\d+$/.test(key) && (val === null || (Number.isFinite(+val) && +val >= 0))) {
      clean[key] = val === null ? null : +val;
    }
  }
  const data = readCalculator();
  data.prices = clean;
  writeCalculator(data);
  res.json({ success: true });
});

// ═══ FAQ ══════════════════════════════════════════════════════════════════════
app.get('/api/faq', (req, res) => res.json(readDB('faq')));

app.get('/api/admin/faq', requireAuth, (req, res) => res.json(readDB('faq')));

app.post('/api/admin/faq', requireAuth, (req, res) => {
  const { question, answer } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Pytanie i odpowiedź są wymagane' });
  if (String(question).length > 500 || String(answer).length > 3000)
    return res.status(400).json({ error: 'Przekroczono limit znaków' });
  const data = readDB('faq');
  const item = { id: nextId(data), question: String(question).trim(), answer: String(answer).trim() };
  data.push(item);
  writeDB('faq', data);
  res.json({ success: true, item });
});

app.put('/api/admin/faq/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const { question, answer } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Pytanie i odpowiedź są wymagane' });
  if (String(question).length > 500 || String(answer).length > 3000)
    return res.status(400).json({ error: 'Przekroczono limit znaków' });
  const data = readDB('faq');
  const idx = data.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Nie znaleziono' });
  data[idx] = { ...data[idx], question: String(question).trim(), answer: String(answer).trim() };
  writeDB('faq', data);
  res.json({ success: true });
});

app.delete('/api/admin/faq/:id', requireAuth, (req, res) => {
  writeDB('faq', readDB('faq').filter(f => f.id !== parseInt(req.params.id)));
  res.json({ success: true });
});

// Admin – zmień kolejność FAQ (reorder)
app.put('/api/admin/faq-reorder', requireAuth, (req, res) => {
  const { order } = req.body; // tablica id w nowej kolejności
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Nieprawidłowe dane' });
  const data = readDB('faq');
  const sorted = order.map(id => data.find(f => f.id === id)).filter(Boolean);
  // Dołącz te które nie były w order (na koniec)
  data.forEach(f => { if (!sorted.find(s => s.id === f.id)) sorted.push(f); });
  writeDB('faq', sorted);
  res.json({ success: true });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Nie znaleziono zasobu' });
  }
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✨ Hello Beauty Studio działa na http://localhost:${PORT}`);
  console.log(`🔑 Panel admina: http://localhost:${PORT}/admin.html`);
  const adminUsers = readDB('admin').map(a => a.username).join(', ') || 'brak';
  console.log(`   Konta admin: ${adminUsers}\n`);
});
