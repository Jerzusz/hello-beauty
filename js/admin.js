/* ═══════════════════════════════════════════════════
   admin.js – Logika panelu administracyjnego
   ═══════════════════════════════════════════════════ */

// ─── Globalny wrapper fetch – obsługa wygaśnięcia sesji (401) ──────────────
async function authFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    document.getElementById('adminLayout').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginError').textContent = 'Sesja wygasła. Zaloguj się ponownie.';
    throw new Error('401 Unauthorized');
  }
  return res;
}

// ─── Sprawdź sesję przy ładowaniu ───────────────────
(async () => {
  const res = await fetch('/api/admin/check');
  const data = await res.json();
  if (data.loggedIn) showAdmin();
})();

// ─── Logowanie ──────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('loginUser').value,
      password: document.getElementById('loginPass').value
    })
  });
  const json = await res.json();
  if (json.success) showAdmin();
  else errEl.textContent = json.error || 'Błąd logowania';
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  document.getElementById('adminLayout').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
});

function showAdmin() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminLayout').style.display = 'flex';
  loadReservations();
  loadPortfolioAdmin();
  loadServicesAdmin();
  loadWorkersAdmin();
  loadHomepageAdmin();
  loadCalculatorAdmin();
  loadFaqAdmin();
}

// ─── Nawigacja sidebar ───────────────────────────────
document.querySelectorAll('.sn-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sn-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`panel-${btn.dataset.panel}`).classList.remove('hidden');
  });
});

// ═══════════════════════════════════════════════════
// REZERWACJE
// ═══════════════════════════════════════════════════
let allReservations = [];
let currentStatusFilter = 'all';

async function loadReservations() {
  try {
    const res = await authFetch('/api/admin/reservations');
    allReservations = await res.json();
    renderReservations();
    updatePendingBadge();
  } catch {
    document.getElementById('reservationsTable').innerHTML =
      '<div class="loading-msg">Błąd ładowania rezerwacji</div>';
  }
}

function updatePendingBadge() {
  const pending = allReservations.filter(r => r.status === 'pending').length;
  document.getElementById('pendingBadge').textContent = pending || '';
}

function renderReservations() {
  const filtered = currentStatusFilter === 'all'
    ? allReservations
    : allReservations.filter(r => r.status === currentStatusFilter);

  const container = document.getElementById('reservationsTable');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="loading-msg">Brak rezerwacji w tej kategorii.</div>';
    return;
  }

  const rows = filtered.map(r => {
    const svcDisplay = r.service_name
      ? (r.variant_label ? `${escHtml(r.service_name)}<br><small style="color:#aaa">${escHtml(r.variant_label)}</small>` : escHtml(r.service_name))
      : escHtml(r.service || '–');
    const workersDisplay = (r.workers && r.workers.length) ? escHtml(r.workers.join(', ')) : '–';
    const durationDisplay = r.duration_minutes ? `${r.duration_minutes} min` : '–';
    return `
    <tr>
      <td>${escHtml(r.date)} <strong>${escHtml(r.time)}</strong><br><small style="color:#888">${durationDisplay}</small></td>
      <td>${escHtml(r.client_name)}</td>
      <td>${escHtml(r.client_phone)}</td>
      <td>${svcDisplay}</td>
      <td>${workersDisplay}</td>
      <td><span class="status-badge status-${r.status}">${statusLabel(r.status)}</span></td>
      <td style="max-width:130px;font-size:.75rem;color:#666">${escHtml(r.notes || '–')}</td>
      <td>
        ${r.status !== 'confirmed' ? `<button class="action-btn action-confirm" onclick="changeStatus(${r.id},'confirmed')">✓ Potwierdź</button>` : ''}
        ${r.status !== 'cancelled' ? `<button class="action-btn action-cancel" onclick="changeStatus(${r.id},'cancelled')">✕ Anuluj</button>` : ''}
        <button class="action-btn action-delete" onclick="deleteReservation(${r.id})">🗑</button>
      </td>
    </tr>
  `}).join('');

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>Termin</th><th>Klient</th><th>Telefon</th><th>Usługa</th>
        <th>Pracownik</th><th>Status</th><th>Uwagi</th><th>Akcje</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStatusFilter = btn.dataset.status;
    renderReservations();
  });
});

window.changeStatus = async (id, status) => {
  await authFetch(`/api/admin/reservations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  loadReservations();
};

window.deleteReservation = async (id) => {
  if (!confirm('Na pewno usunąć tę rezerwację?')) return;
  await authFetch(`/api/admin/reservations/${id}`, { method: 'DELETE' });
  loadReservations();
};

window.slotChangeStatus = async (id, status, date) => {
  await authFetch(`/api/admin/reservations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (window.adminRefreshDay) window.adminRefreshDay(date);
  loadReservations();
};

function statusLabel(s) {
  return { pending: 'Oczekuje', confirmed: 'Potwierdzona', cancelled: 'Anulowana' }[s] || s;
}

// ═══════════════════════════════════════════════════
// KALENDARZ ADMINA
// ═══════════════════════════════════════════════════
(function () {
  const MONTH_NAMES = [
    'Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
    'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'
  ];
  const MONTH_SHORT = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
  const DAY_NAMES   = ['Nd','Pon','Wt','Śr','Czw','Pt','Sob'];

  const today = new Date();
  let viewYear  = today.getFullYear();
  let viewMonth = today.getMonth() + 1;
  let activeDate = null;

  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  async function fetchAvail() {
    try {
      const r = await fetch(`/api/availability/${viewYear}/${viewMonth}`);
      return await r.json();
    } catch { return {}; }
  }

  async function fetchVacationsMap() {
    try {
      const r = await authFetch('/api/admin/vacations');
      const vacations = await r.json();
      const map = {};
      for (const v of vacations) {
        let cur = new Date(v.date_from + 'T00:00:00');
        const end = new Date(v.date_to + 'T00:00:00');
        while (cur <= end) {
          const ds = fmtDate(cur);
          if (!map[ds]) map[ds] = [];
          map[ds].push(v.worker_name);
          cur.setDate(cur.getDate() + 1);
        }
      }
      return map;
    } catch { return {}; }
  }

  async function renderAdminCal() {
    const titleEl = document.getElementById('adminCalMonthTitle');
    const grid    = document.getElementById('adminCalendarGrid');
    if (!titleEl || !grid) return;

    titleEl.textContent = `${MONTH_NAMES[viewMonth - 1]} ${viewYear}`;
    const headers = Array.from(grid.querySelectorAll('.cal-day-header'));
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));

    const [avail, vacMap] = await Promise.all([fetchAvail(), fetchVacationsMap()]);

    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    let offset = firstDay.getDay();
    offset = offset === 0 ? 6 : offset - 1;
    for (let i = 0; i < offset; i++) {
      const e = document.createElement('div'); e.className = 'cal-day empty'; grid.appendChild(e);
    }

    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const todayStr    = fmtDate(today);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const info    = avail[dateStr] || { status:'closed', slots:[] };
      const isPast  = dateStr < todayStr;

      const cell = document.createElement('div');
      cell.className = `cal-day ${info.status}`;
      cell.textContent = d;
      if (dateStr === todayStr)   cell.classList.add('today');
      if (dateStr === activeDate) cell.classList.add('selected');
      if (isPast)                 cell.classList.add('past');
      if (vacMap[dateStr])        cell.classList.add('has-vacation');
      cell.dataset.date = dateStr;
      // Admin może kliknąć DOWOLNY dzień, również Niedzielę czy historię
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => loadAdminDaySlots(cell, dateStr));
      grid.appendChild(cell);
    }
    updateAdminNavBtns();
  }

  async function loadAdminDaySlots(cell, dateStr) {
    document.querySelectorAll('#adminCalendarGrid .cal-day').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    activeDate = dateStr;

    const [y, m, d] = dateStr.split('-');
    const titleEl = document.getElementById('adminDayTitle');
    const slotsEl = document.getElementById('adminDaySlots');
    const msgEl   = document.getElementById('adminBlockMsg');
    if (!slotsEl) return;

    if (titleEl) titleEl.textContent =
      `${DAY_NAMES[new Date(dateStr).getDay()]}, ${parseInt(d)} ${MONTH_SHORT[parseInt(m)-1]} ${y}`;
    msgEl.textContent = '';
    slotsEl.innerHTML = '<div class="loading-msg">Ładowanie...</div>';

    try {
      const res  = await authFetch(`/api/admin/slots/${dateStr}`);
      const data = await res.json();
      const slots = data.slots || (Array.isArray(data) ? data : []);
      const workersOnVacation = data.workersOnVacation || [];
      renderAdminSlots(slots, dateStr, workersOnVacation);
    } catch {
      slotsEl.innerHTML = '<div class="loading-msg">Błąd ładowania slotów.</div>';
    }
  }

  function renderAdminSlots(slots, dateStr, workersOnVacation) {
    const slotsEl = document.getElementById('adminDaySlots');
    let html = '';

    if (workersOnVacation && workersOnVacation.length > 0) {
      const names = workersOnVacation
        .map(w => `<strong>${escHtml(w.name)}</strong>${w.reason ? ` (${escHtml(w.reason)})` : ''}`)
        .join(', ');
      html += `<div class="admin-vacation-banner">🏖️ Na urlopie: ${names}</div>`;
    }

    html += `<div class="admin-slots-header">
      <button class="btn-action btn-danger btn-sm" onclick="adminBlockDay('${dateStr}')">🚫 Zablokuj cały dzień</button>
    </div>`;

    if (slots.length === 0) {
      html += '<div class="loading-msg">Brak slotów w tym dniu.</div>';
    } else {
      html += slots.map(s => {
        let cls = 'admin-slot';
        let detail = '';
        let action = '';

        if (s.status === 'blocked') {
          cls += ' admin-slot-blocked';
          detail = `<span class="admin-slot-info">🚫 ${s.reason ? escHtml(s.reason) : 'Zablokowany'}</span>`;
          action = `<button class="action-btn action-confirm btn-sm" onclick="adminUnblock('${dateStr}','${s.time}')">Odblokuj</button>`;
        } else if (s.status === 'booked') {
          const isPending = s.reservation && s.reservation.res_status === 'pending';
          cls += isPending ? ' admin-slot-pending' : ' admin-slot-confirmed';
          const r = s.reservation;
          const icon = isPending ? '🔵' : '✅';
          const durTxt = r && r.duration_minutes ? ` <small style="color:#888">(${r.duration_minutes} min)</small>` : '';
          detail = r
            ? `<span class="admin-slot-info">${icon} ${escHtml(r.client_name)} – ${escHtml(r.service_name || '–')}${durTxt}</span>`
            : `<span class="admin-slot-info">${icon} Zarezerwowany</span>`;
          if (r) {
            if (isPending) {
              action = `<button class="action-btn action-confirm btn-sm" onclick="slotChangeStatus(${r.id},'confirmed','${dateStr}')">✓ Potwierdź</button>`
                     + `<button class="action-btn action-cancel btn-sm" onclick="slotChangeStatus(${r.id},'cancelled','${dateStr}')">&#x2715; Anuluj</button>`;
            } else {
              action = `<button class="action-btn action-cancel btn-sm" onclick="slotChangeStatus(${r.id},'cancelled','${dateStr}')">&#x2715; Anuluj</button>`;
            }
          }
        } else if (s.status === 'ongoing') {
          const isPending = s.reservation && s.reservation.res_status === 'pending';
          cls += isPending ? ' admin-slot-ongoing admin-slot-pending' : ' admin-slot-ongoing admin-slot-confirmed';
          const r = s.reservation;
          detail = r
            ? `<span class="admin-slot-info">↳ w trakcie: ${escHtml(r.client_name)} – ${escHtml(r.service_name || '–')} <small style="color:#888">(od ${r.start_time}, ${r.duration_minutes} min)</small></span>`
            : '<span class="admin-slot-info">↳ w trakcie</span>';
        } else {
          cls += ' admin-slot-free';
          action = `<button class="action-btn btn-sm" onclick="adminBlock('${dateStr}','${s.time}')">Zablokuj</button>`;
        }

        return `<div class="${cls}">
          <div class="admin-slot-time">${s.time}</div>
          ${detail}
          <div class="admin-slot-actions">${action}</div>
        </div>`;
      }).join('');
    }
    slotsEl.innerHTML = html;
  }

  function openReasonModal(title, onConfirm) {
    const modal   = document.getElementById('blockReasonModal');
    const titleEl = document.getElementById('blockReasonTitle');
    const input   = document.getElementById('blockReasonInput');
    const btnOk   = document.getElementById('blockReasonConfirm');
    const btnCancel = document.getElementById('blockReasonCancel');
    titleEl.textContent = title;
    input.value = '';
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 50);
    function close() {
      modal.style.display = 'none';
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', close);
      input.removeEventListener('keydown', onKey);
    }
    function onOk() { close(); onConfirm(input.value.trim()); }
    function onKey(e) { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') close(); }
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', close);
    input.addEventListener('keydown', onKey);
  }

  window.adminBlock = (date, time) => {
    openReasonModal(`Zablokuj termin ${time} (${date})`, async (reason) => {
      const msgEl = document.getElementById('adminBlockMsg');
      try {
        const res  = await authFetch('/api/admin/block', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, time, reason })
        });
        const json = await res.json();
        if (json.success) {
          showMsg(msgEl, `✓ Termin ${time} zablokowany.`, 'ok');
          refreshActiveDay(date); renderAdminCal();
        } else { showMsg(msgEl, json.error || 'Błąd', 'err'); }
      } catch { showMsg(msgEl, 'Błąd połączenia.', 'err'); }
    });
  };

  window.adminUnblock = async (date, time) => {
    const msgEl = document.getElementById('adminBlockMsg');
    try {
      const res  = await authFetch('/api/admin/block', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time })
      });
      const json = await res.json();
      if (json.success) {
        showMsg(msgEl, `✓ Termin ${time} odblokowany.`, 'ok');
        refreshActiveDay(date); renderAdminCal();
      } else { showMsg(msgEl, json.error || 'Błąd', 'err'); }
    } catch { showMsg(msgEl, 'Błąd połączenia.', 'err'); }
  };

  window.adminBlockDay = (dateStr) => {
    openReasonModal(`Zablokuj cały dzień ${dateStr}`, async (reason) => {
      const msgEl = document.getElementById('adminBlockMsg');
      try {
        for (let h = 9; h <= 17; h++) {
          const time = `${String(h).padStart(2,'0')}:00`;
          await authFetch('/api/admin/block', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dateStr, time, reason })
          });
        }
        showMsg(msgEl, `✓ Cały dzień ${dateStr} zablokowany.`, 'ok');
        refreshActiveDay(dateStr); renderAdminCal();
      } catch { showMsg(msgEl, 'Błąd blokowania.', 'err'); }
    });
  };

  window.adminRefreshDay = function(date) { refreshActiveDay(date); };

  async function refreshActiveDay(date) {
    const slotsEl = document.getElementById('adminDaySlots');
    if (!slotsEl || !activeDate) return;
    try {
      const res  = await authFetch(`/api/admin/slots/${date}`);
      const data = await res.json();
      const slots = data.slots || (Array.isArray(data) ? data : []);
      const workersOnVacation = data.workersOnVacation || [];
      renderAdminSlots(slots, date, workersOnVacation);
    } catch { slotsEl.innerHTML = '<div class="loading-msg">Błąd.</div>'; }
  }

  function updateAdminNavBtns() {
    const prev = document.getElementById('adminPrevMonth');
    if (!prev) return;
    const isCurrent = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
    prev.disabled = isCurrent;
    prev.style.opacity = isCurrent ? '0.3' : '1';
  }

  document.getElementById('adminPrevMonth').addEventListener('click', () => {
    viewMonth--; if (viewMonth < 1) { viewMonth = 12; viewYear--; }
    renderAdminCal();
  });
  document.getElementById('adminNextMonth').addEventListener('click', () => {
    viewMonth++; if (viewMonth > 12) { viewMonth = 1; viewYear++; }
    renderAdminCal();
  });

  // Inicjalizuj gdy panel kalendarza zostaje otwarty
  document.querySelectorAll('.sn-btn').forEach(btn => {
    if (btn.dataset.panel === 'calendar') {
      btn.addEventListener('click', () => renderAdminCal());
    }
  });
})();

// ═══════════════════════════════════════════════════
// PORTFOLIO
// ═══════════════════════════════════════════════════
let portfolioItems = [];

async function loadPortfolioAdmin() {
  const res = await fetch('/api/portfolio');
  portfolioItems = await res.json();
  renderPortfolioAdmin();
}

function renderPortfolioAdmin() {
  const grid = document.getElementById('portfolioAdminGrid');
  document.getElementById('photoCount').textContent = portfolioItems.length;
  if (portfolioItems.length === 0) {
    grid.innerHTML = '<div class="loading-msg">Brak zdjęć. Dodaj pierwsze zdjęcie powyżej.</div>';
    return;
  }
  grid.innerHTML = portfolioItems.map(p => `
    <div class="pad-item">
      <img src="/uploads/${p.filename}" alt="${escHtml(p.title || '')}" loading="lazy" />
      <div class="pad-overlay">
        <div class="pad-title">${escHtml(p.title || p.filename)}</div>
        <button class="pad-delete" onclick="deletePhoto(${p.id})">🗑 Usuń</button>
      </div>
    </div>
  `).join('');
}

window.deletePhoto = async (id) => {
  if (!confirm('Usunąć to zdjęcie?')) return;
  await authFetch(`/api/admin/portfolio/${id}`, { method: 'DELETE' });
  loadPortfolioAdmin();
};

// ─── Drag & drop upload ─────────────────────────────
const drop = document.getElementById('uploadDrop');
const fileInput = document.getElementById('photoFile');
const preview = document.getElementById('uploadPreview');
const previewImg = document.getElementById('previewImg');

drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });

function setFile(file) {
  previewImg.src = URL.createObjectURL(file);
  preview.style.display = 'inline-block';
  drop.style.display = 'none';
}

document.getElementById('removePreview').addEventListener('click', () => {
  fileInput.value = '';
  preview.style.display = 'none';
  drop.style.display = 'block';
});

document.getElementById('uploadForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.getElementById('uploadMsg');
  const progress = document.getElementById('uploadProgress');
  const fill = document.getElementById('progressFill');

  if (!fileInput.files[0]) { showMsg(msg, 'Wybierz plik zdjęcia.', 'err'); return; }

  const formData = new FormData(e.target);
  // Upewnij się, że plik jest w FormData
  if (!formData.get('photo') || formData.get('photo').size === 0) {
    formData.set('photo', fileInput.files[0]);
  }

  progress.style.display = 'block';

  // Symuluj postęp podczas wysyłania
  let p = 0;
  const interval = setInterval(() => { p = Math.min(p + 10, 90); fill.style.width = p + '%'; }, 100);

  try {
    const res = await authFetch('/api/admin/portfolio', { method: 'POST', body: formData });
    const json = await res.json();
    clearInterval(interval);
    fill.style.width = '100%';
    setTimeout(() => { progress.style.display = 'none'; fill.style.width = '0%'; }, 500);

    if (json.success) {
      showMsg(msg, '✓ Zdjęcie dodane pomyślnie!', 'ok');
      e.target.reset();
      preview.style.display = 'none';
      drop.style.display = 'block';
      loadPortfolioAdmin();
    } else {
      showMsg(msg, json.error || 'Błąd podczas przesyłania.', 'err');
    }
  } catch {
    clearInterval(interval);
    showMsg(msg, 'Brak połączenia z serwerem.', 'err');
  }
});

// ═══════════════════════════════════════════════════
// USŁUGI
// ═══════════════════════════════════════════════════
let allServicesAdmin = [];
let allWorkersAdmin  = [];

async function loadServicesAdmin() {
  const res = await fetch('/api/services');
  allServicesAdmin = await res.json();
  renderServicesAdmin();
}

function catLabel(cat) {
  return {
    sciaganie: 'Ściąganie', keratyna_korekta: 'Keratyna – korekty',
    keratyna_zalozenie: 'Keratyna – założenie', biotape: 'Bio Tape',
    tapeon: 'Tape On', koloryzacja: 'Koloryzacja',
    pielegnacja: 'Pielęgnacja', inne: 'Inne'
  }[cat] || cat;
}

function renderServicesAdmin() {
  const list = document.getElementById('servicesAdminList');
  if (allServicesAdmin.length === 0) {
    list.innerHTML = '<div class="loading-msg">Brak usług.</div>';
    return;
  }
  list.innerHTML = allServicesAdmin.map(s => {
    const price = s.price_from === 0 && s.price_to === 0 ? 'Wycena indywidualna'
      : s.price_to > s.price_from ? `${s.price_from}–${s.price_to} zł` : `od ${s.price_from} zł`;
    const workers  = (s.workers || []).join(' + ') || '–';
    const variants = s.variants && s.variants.length ? `${s.variants.length} wariantów` : `${s.duration_minutes} min`;
    return `
      <div class="svc-row">
        <div class="svc-row-info">
          <div class="svc-row-name">${escHtml(s.name)}</div>
          <div class="svc-row-meta">${catLabel(s.category)} · ${variants} · ${escHtml(workers)}</div>
        </div>
        <div class="svc-row-price">${price}</div>
        <div class="svc-row-actions">
          <button class="action-btn action-confirm btn-sm" onclick="editService(${s.id})">✎ Edytuj</button>
          <button class="action-btn action-delete btn-sm" onclick="deleteSvc(${s.id})">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('addServiceBtn').addEventListener('click', () => {
  document.getElementById('serviceFormTitle').textContent = 'Nowa usługa';
  document.getElementById('editServiceId').value = '';
  document.getElementById('svcName').value = '';
  document.getElementById('svcDesc').value = '';
  document.getElementById('svcCat').value  = 'inne';
  document.getElementById('svcDuration').value  = 60;
  document.getElementById('svcPriceFrom').value = 0;
  document.getElementById('svcPriceTo').value   = 0;
  document.getElementById('hasVariants').checked = false;
  document.getElementById('variantsList').innerHTML = '';
  document.getElementById('variantsPriceSection').style.display = 'none';
  document.getElementById('simplePriceSection').style.display   = '';
  loadWorkerCheckboxes([]);
  document.getElementById('serviceForm').classList.remove('hidden');
  document.getElementById('serviceForm').scrollIntoView({ behavior:'smooth' });
});

document.getElementById('cancelServiceBtn').addEventListener('click', () => {
  document.getElementById('serviceForm').classList.add('hidden');
});

document.getElementById('hasVariants').addEventListener('change', function() {
  document.getElementById('variantsPriceSection').style.display = this.checked ? '' : 'none';
  document.getElementById('simplePriceSection').style.display   = this.checked ? 'none' : '';
});

document.getElementById('addVariantBtn').addEventListener('click', () => addVariantRow());

function addVariantRow(v) {
  const list = document.getElementById('variantsList');
  const row  = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input type="text"   class="var-label" placeholder="Wariant (np. do 50 gr)" value="${escHtml(v ? v.label : '')}" />
    <input type="number" class="var-price" placeholder="Cena (zł)" min="0" value="${v ? v.price : ''}" />
    <input type="number" class="var-dur"   placeholder="Czas (min)" min="5" step="5" value="${v ? v.duration_minutes : ''}" />
    <button type="button" class="remove-variant-btn" title="Usuń">✕</button>
  `;
  row.querySelector('.remove-variant-btn').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

async function loadWorkerCheckboxes(selectedWorkers) {
  const res = await fetch('/api/workers');
  const workers = await res.json();
  allWorkersAdmin = workers;
  const box = document.getElementById('svcWorkersCheckboxes');
  box.innerHTML = workers.map(w => `
    <label>
      <input type="checkbox" class="worker-cb" value="${escHtml(w.name)}"
        ${selectedWorkers.includes(w.name) ? 'checked' : ''} />
      ${escHtml(w.name)}
    </label>
  `).join('');
}

window.editService = (id) => {
  const s = allServicesAdmin.find(x => x.id === id);
  if (!s) return;
  document.getElementById('serviceFormTitle').textContent = 'Edytuj usługę';
  document.getElementById('editServiceId').value  = id;
  document.getElementById('svcName').value = s.name;
  document.getElementById('svcDesc').value = s.description || '';
  document.getElementById('svcCat').value  = s.category;
  document.getElementById('svcDuration').value  = s.duration_minutes;
  document.getElementById('svcPriceFrom').value = s.price_from;
  document.getElementById('svcPriceTo').value   = s.price_to;

  const hasV = s.variants && s.variants.length > 0;
  document.getElementById('hasVariants').checked = hasV;
  document.getElementById('variantsPriceSection').style.display = hasV ? '' : 'none';
  document.getElementById('simplePriceSection').style.display   = hasV ? 'none' : '';

  const list = document.getElementById('variantsList');
  list.innerHTML = '';
  if (hasV) s.variants.forEach(v => addVariantRow(v));

  loadWorkerCheckboxes(s.workers || []);
  document.getElementById('serviceForm').classList.remove('hidden');
  document.getElementById('serviceForm').scrollIntoView({ behavior:'smooth' });
};

document.getElementById('saveServiceBtn').addEventListener('click', async () => {
  const id   = document.getElementById('editServiceId').value;
  const hasV = document.getElementById('hasVariants').checked;

  const selectedWorkers = Array.from(document.querySelectorAll('.worker-cb:checked')).map(c => c.value);

  let variants = [];
  if (hasV) {
    variants = Array.from(document.querySelectorAll('#variantsList .variant-row')).map(row => ({
      label:            row.querySelector('.var-label').value.trim(),
      price:            parseFloat(row.querySelector('.var-price').value) || 0,
      duration_minutes: parseInt(row.querySelector('.var-dur').value)   || 60,
    })).filter(v => v.label);
  }

  const body = {
    name:        document.getElementById('svcName').value.trim(),
    description: document.getElementById('svcDesc').value.trim(),
    category:    document.getElementById('svcCat').value,
    workers:     selectedWorkers,
    variants,
    price_from:       hasV ? 0 : parseInt(document.getElementById('svcPriceFrom').value) || 0,
    price_to:         hasV ? 0 : parseInt(document.getElementById('svcPriceTo').value) || 0,
    duration_minutes: hasV ? 60 : parseInt(document.getElementById('svcDuration').value) || 60,
  };
  if (!body.name) { alert('Podaj nazwę usługi'); return; }

  const url    = id ? `/api/admin/services/${id}` : '/api/admin/services';
  const method = id ? 'PUT' : 'POST';
  await fetch(url, { method, headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) });
  document.getElementById('serviceForm').classList.add('hidden');
  loadServicesAdmin();
});

window.deleteSvc = async (id) => {
  if (!confirm('Usunąć tę usługę?')) return;
  await authFetch(`/api/admin/services/${id}`, { method:'DELETE' });
  loadServicesAdmin();
};

// ═══════════════════════════════════════════════════
// PRACOWNICY
// ═══════════════════════════════════════════════════
async function loadWorkersAdmin() {
  const res = await authFetch('/api/admin/workers');
  const workers = await res.json();
  renderWorkersAdmin(workers);
  // Uzupełnij listę pracowników w formularzu urlopów
  const sel = document.getElementById('vacWorker');
  if (sel) {
    sel.innerHTML = '<option value="">– wybierz pracownika –</option>' +
      workers.map(w => `<option value="${escHtml(w.name)}">${escHtml(w.name)}</option>`).join('');
  }
  loadVacations();
}

const DAY_NAMES = ['Nd','Pon','Wt','Śr','Czw','Pt','Sob'];

function renderWorkersAdmin(workers) {
  const list = document.getElementById('workersAdminList');
  if (workers.length === 0) {
    list.innerHTML = '<div class="loading-msg">Brak pracowników.</div>';
    return;
  }
  list.innerHTML = workers.map(w => {
    const days = (w.work_days || []).map(d => DAY_NAMES[d]).join(', ');
    return `
      <div class="svc-row">
        <div class="svc-row-info">
          <div class="svc-row-name">${escHtml(w.name)}</div>
          <div class="svc-row-meta">${days} · ${escHtml(w.work_start || '09:00')} – ${escHtml(w.work_end || '18:00')}</div>
        </div>
        <div class="svc-row-actions">
          <button class="action-btn action-confirm btn-sm" onclick="editWorker(${w.id})">✎ Edytuj</button>
          <button class="action-btn action-delete btn-sm" onclick="deleteWorker(${w.id})">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('addWorkerBtn').addEventListener('click', () => {
  document.getElementById('workerFormTitle').textContent = 'Nowy pracownik';
  document.getElementById('editWorkerId').value = '';
  document.getElementById('workerName').value  = '';
  document.getElementById('workerStart').value = '09:00';
  document.getElementById('workerEnd').value   = '18:00';
  document.querySelectorAll('.day-cb').forEach(cb => { cb.checked = cb.value !== '0'; });
  document.getElementById('workerForm').classList.remove('hidden');
  document.getElementById('workerForm').scrollIntoView({ behavior:'smooth' });
});

document.getElementById('cancelWorkerBtn').addEventListener('click', () => {
  document.getElementById('workerForm').classList.add('hidden');
});

window.editWorker = async (id) => {
  const res = await authFetch('/api/admin/workers');
  const workers = await res.json();
  const w = workers.find(x => x.id === id);
  if (!w) return;
  document.getElementById('workerFormTitle').textContent = 'Edytuj pracownika';
  document.getElementById('editWorkerId').value = id;
  document.getElementById('workerName').value  = w.name;
  document.getElementById('workerStart').value = w.work_start || '09:00';
  document.getElementById('workerEnd').value   = w.work_end   || '18:00';
  document.querySelectorAll('.day-cb').forEach(cb => { cb.checked = (w.work_days || []).includes(parseInt(cb.value)); });
  document.getElementById('workerForm').classList.remove('hidden');
  document.getElementById('workerForm').scrollIntoView({ behavior:'smooth' });
};

document.getElementById('saveWorkerBtn').addEventListener('click', async () => {
  const id        = document.getElementById('editWorkerId').value;
  const name      = document.getElementById('workerName').value.trim();
  const work_start = document.getElementById('workerStart').value;
  const work_end   = document.getElementById('workerEnd').value;
  const work_days  = Array.from(document.querySelectorAll('.day-cb:checked')).map(c => parseInt(c.value));
  if (!name) { alert('Podaj imię pracownika'); return; }

  const url    = id ? `/api/admin/workers/${id}` : '/api/admin/workers';
  const method = id ? 'PUT' : 'POST';
  await fetch(url, { method, headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ name, work_days, work_start, work_end }) });
  document.getElementById('workerForm').classList.add('hidden');
  loadWorkersAdmin();
  // Reload worker checkboxes in service form if open
  const editId = document.getElementById('editServiceId').value;
  if (editId) {
    const svc = allServicesAdmin.find(s => s.id === parseInt(editId));
    if (svc) loadWorkerCheckboxes(svc.workers || []);
  }
});

window.deleteWorker = async (id) => {
  if (!confirm('Usunąć tego pracownika?')) return;
  await authFetch(`/api/admin/workers/${id}`, { method:'DELETE' });
  loadWorkersAdmin();
};
// ═══════════════════════════════════════════════════
// URLOPY
// ═══════════════════════════════════════════════════
let allVacations = [];

async function loadVacations() {
  const list = document.getElementById('vacationsList');
  if (!list) return;
  try {
    const res = await authFetch('/api/admin/vacations');
    allVacations = await res.json();
    renderVacations();
  } catch {
    list.innerHTML = '<div class="loading-msg">Błąd ładowania urlopów.</div>';
  }
}

function renderVacations() {
  const list = document.getElementById('vacationsList');
  if (!list) return;
  if (allVacations.length === 0) {
    list.innerHTML = '<div class="loading-msg">Brak zaplanowanych urlopów.</div>';
    return;
  }
  const sorted = [...allVacations].sort((a, b) => a.date_from.localeCompare(b.date_from));
  list.innerHTML = sorted.map(v => `
    <div class="vacation-row">
      <div class="vacation-info">
        <strong>${escHtml(v.worker_name)}</strong>
        <span class="vacation-dates">${escHtml(v.date_from)} – ${escHtml(v.date_to)}</span>
        ${v.reason ? `<small class="vacation-reason">${escHtml(v.reason)}</small>` : ''}
      </div>
      <button class="action-btn action-delete btn-sm" onclick="deleteVacation(${v.id})">🗑 Usuń</button>
    </div>
  `).join('');
}

document.getElementById('saveVacationBtn').addEventListener('click', async () => {
  const worker_name = document.getElementById('vacWorker').value;
  const date_from   = document.getElementById('vacFrom').value;
  const date_to     = document.getElementById('vacTo').value;
  const reason      = document.getElementById('vacReason').value.trim();
  const msgEl       = document.getElementById('vacMsg');
  if (!worker_name) { showMsg(msgEl, 'Wybierz pracownika.', 'err'); return; }
  if (!date_from || !date_to) { showMsg(msgEl, 'Podaj daty urlopu.', 'err'); return; }
  if (date_from > date_to) { showMsg(msgEl, 'Data "od" musi być wcześniejsza niż "do".', 'err'); return; }
  const res = await authFetch('/api/admin/vacations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worker_name, date_from, date_to, reason })
  });
  const json = await res.json();
  if (json.success) {
    showMsg(msgEl, '✓ Urlop dodany.', 'ok');
    document.getElementById('vacWorker').value = '';
    document.getElementById('vacFrom').value   = '';
    document.getElementById('vacTo').value     = '';
    document.getElementById('vacReason').value = '';
    loadVacations();
  } else { showMsg(msgEl, json.error || 'Błąd', 'err'); }
});

window.deleteVacation = async (id) => {
  if (!confirm('Usunąć ten urlop?')) return;
  await authFetch(`/api/admin/vacations/${id}`, { method: 'DELETE' });
  loadVacations();
};
// ─── Helpers ─────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `${el.className.split(' ')[0]} ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = el.className.split(' ')[0]; }, 4000);
}

// ═══════════════════════════════════════════════════
// STRONA GŁÓWNA – edycja treści
// ═══════════════════════════════════════════════════
async function loadHomepageAdmin() {
  try {
    const res = await fetch('/api/homepage');
    if (!res.ok) return;
    const d = await res.json();

    const val = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };

    val('hp-hero-tagline',  d.hero?.tagline);
    val('hp-hero-title',    d.hero?.title);
    val('hp-hero-title-em', d.hero?.title_em);
    val('hp-hero-sub',      d.hero?.sub);

    if (d.strip) d.strip.forEach((txt, i) => val(`hp-strip-${i}`, txt));

    val('hp-offer-eyebrow', d.offer?.eyebrow);
    val('hp-offer-title',   d.offer?.title);
    val('hp-offer-desc',    d.offer?.desc);

    val('hp-contact-address',   d.contact?.address);
    val('hp-contact-phone',     d.contact?.phone);
    val('hp-contact-email',     d.contact?.email);
    val('hp-contact-hours',     d.contact?.hours);
    val('hp-contact-instagram', d.contact?.instagram);
    val('hp-contact-facebook',  d.contact?.facebook);
  } catch { /* ignoruj */ }
}

document.getElementById('saveHomepageBtn').addEventListener('click', async () => {
  const msg = document.getElementById('homepageMsg');
  const get = id => { const el = document.getElementById(id); return el ? el.value : ''; };

  const body = {
    hero: {
      tagline:  get('hp-hero-tagline'),
      title:    get('hp-hero-title'),
      title_em: get('hp-hero-title-em'),
      sub:      get('hp-hero-sub')
    },
    strip: [0,1,2,3].map(i => get(`hp-strip-${i}`)),
    offer: {
      eyebrow: get('hp-offer-eyebrow'),
      title:   get('hp-offer-title'),
      desc:    get('hp-offer-desc')
    },
    contact: {
      address:   get('hp-contact-address'),
      phone:     get('hp-contact-phone'),
      email:     get('hp-contact-email'),
      hours:     get('hp-contact-hours'),
      instagram: get('hp-contact-instagram'),
      facebook:  get('hp-contact-facebook')
    }
  };

  try {
    const res = await authFetch('/api/admin/homepage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (json.success) showMsg(msg, '✓ Zapisano zmiany na stronie głównej!', 'ok');
    else showMsg(msg, json.error || 'Błąd zapisu', 'err');
  } catch {
    showMsg(msg, 'Brak połączenia z serwerem.', 'err');
  }
});
// ═══════════════════════════════════════════════════
// KALKULATOR – Panel admina
// ═══════════════════════════════════════════════════
let calcAdminData = null;

async function loadCalculatorAdmin() {
  try {
    const res = await authFetch('/api/admin/calculator');
    calcAdminData = await res.json();
    renderCalcLengths();
    renderCalcDensities();
    renderCalcMethods();
    renderPriceMatrix();
    const taInfo = document.getElementById('keraatynowaInfoAdmin');
    if (taInfo) taInfo.value = calcAdminData.keratynowa_info || '';
  } catch {
    showCalcMsg('Błąd ładowania danych kalkulatora', 'err');
  }
}

// ─── Długości ────────────────────────────────────
function renderCalcLengths() {
  const el = document.getElementById('calcLengthsList');
  if (!el || !calcAdminData) return;
  const arr = calcAdminData.lengths || [];
  if (arr.length === 0) { el.innerHTML = '<div class="loading-msg">Brak długości.</div>'; return; }
  el.innerHTML = arr.map(l => `
    <div class="svc-row" id="calc-length-row-${l.id}">
      <div class="svc-row-info" id="calc-length-view-${l.id}">
        <div class="svc-row-name">${escHtml(l.label)}</div>
      </div>
      <div class="svc-row-info hidden" id="calc-length-edit-${l.id}" style="flex:1">
        <input type="text" id="calc-length-input-${l.id}" value="${escHtml(l.label)}"
               style="background:#111;border:1px solid #444;border-radius:6px;color:#fff;padding:8px 10px;font-size:.85rem;width:100%;" />
      </div>
      <div class="svc-row-actions" id="calc-length-actions-view-${l.id}">
        <button class="action-btn action-confirm btn-sm" onclick="startEditCalcLength(${l.id})">✎ Edytuj</button>
        <button class="action-btn action-delete btn-sm" onclick="deleteCalcLength(${l.id})">🗑</button>
      </div>
      <div class="svc-row-actions hidden" id="calc-length-actions-edit-${l.id}">
        <button class="action-btn action-confirm btn-sm" onclick="saveCalcLength(${l.id})">✓ Zapisz</button>
        <button class="action-btn btn-cancel btn-sm" onclick="cancelEditCalcLength(${l.id})">Anuluj</button>
      </div>
    </div>
  `).join('');
}

window.startEditCalcLength = (id) => {
  document.getElementById(`calc-length-view-${id}`).classList.add('hidden');
  document.getElementById(`calc-length-edit-${id}`).classList.remove('hidden');
  document.getElementById(`calc-length-actions-view-${id}`).classList.add('hidden');
  document.getElementById(`calc-length-actions-edit-${id}`).classList.remove('hidden');
};
window.cancelEditCalcLength = (id) => {
  document.getElementById(`calc-length-view-${id}`).classList.remove('hidden');
  document.getElementById(`calc-length-edit-${id}`).classList.add('hidden');
  document.getElementById(`calc-length-actions-view-${id}`).classList.remove('hidden');
  document.getElementById(`calc-length-actions-edit-${id}`).classList.add('hidden');
};
window.saveCalcLength = async (id) => {
  const label = document.getElementById(`calc-length-input-${id}`).value.trim();
  if (!label) { alert('Podaj nazwę'); return; }
  const res = await authFetch(`/api/admin/calculator/lengths/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label })
  });
  const json = await res.json();
  if (json.success) { await loadCalculatorAdmin(); } else { alert(json.error); }
};
window.addCalcLength = async () => {
  const label = document.getElementById('newLengthLabel').value.trim();
  if (!label) { alert('Podaj nazwę długości'); return; }
  const res = await authFetch('/api/admin/calculator/lengths', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label })
  });
  const json = await res.json();
  if (json.success) { document.getElementById('newLengthLabel').value = ''; await loadCalculatorAdmin(); }
  else { alert(json.error); }
};
window.deleteCalcLength = async (id) => {
  if (!confirm('Usunąć tę długość? Spowoduje to usunięcie powiązanych cen.')) return;
  await authFetch(`/api/admin/calculator/lengths/${id}`, { method: 'DELETE' });
  await loadCalculatorAdmin();
};

// ─── Zagęszczenia ────────────────────────────────
function renderCalcDensities() {
  const el = document.getElementById('calcDensitiesList');
  if (!el || !calcAdminData) return;
  const arr = calcAdminData.densities || [];
  if (arr.length === 0) { el.innerHTML = '<div class="loading-msg">Brak zagęszczeń.</div>'; return; }
  el.innerHTML = arr.map(d => `
    <div class="svc-row" id="calc-density-row-${d.id}">
      <div class="svc-row-info" id="calc-density-view-${d.id}">
        <div class="svc-row-name">${escHtml(d.label)}</div>
      </div>
      <div class="svc-row-info hidden" id="calc-density-edit-${d.id}" style="flex:1">
        <input type="text" id="calc-density-input-${d.id}" value="${escHtml(d.label)}"
               style="background:#111;border:1px solid #444;border-radius:6px;color:#fff;padding:8px 10px;font-size:.85rem;width:100%;" />
      </div>
      <div class="svc-row-actions" id="calc-density-actions-view-${d.id}">
        <button class="action-btn action-confirm btn-sm" onclick="startEditCalcDensity(${d.id})">✎ Edytuj</button>
        <button class="action-btn action-delete btn-sm" onclick="deleteCalcDensity(${d.id})">🗑</button>
      </div>
      <div class="svc-row-actions hidden" id="calc-density-actions-edit-${d.id}">
        <button class="action-btn action-confirm btn-sm" onclick="saveCalcDensity(${d.id})">✓ Zapisz</button>
        <button class="action-btn btn-cancel btn-sm" onclick="cancelEditCalcDensity(${d.id})">Anuluj</button>
      </div>
    </div>
  `).join('');
}

window.startEditCalcDensity = (id) => {
  document.getElementById(`calc-density-view-${id}`).classList.add('hidden');
  document.getElementById(`calc-density-edit-${id}`).classList.remove('hidden');
  document.getElementById(`calc-density-actions-view-${id}`).classList.add('hidden');
  document.getElementById(`calc-density-actions-edit-${id}`).classList.remove('hidden');
};
window.cancelEditCalcDensity = (id) => {
  document.getElementById(`calc-density-view-${id}`).classList.remove('hidden');
  document.getElementById(`calc-density-edit-${id}`).classList.add('hidden');
  document.getElementById(`calc-density-actions-view-${id}`).classList.remove('hidden');
  document.getElementById(`calc-density-actions-edit-${id}`).classList.add('hidden');
};
window.saveCalcDensity = async (id) => {
  const label = document.getElementById(`calc-density-input-${id}`).value.trim();
  if (!label) { alert('Podaj nazwę'); return; }
  const res = await authFetch(`/api/admin/calculator/densities/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label })
  });
  const json = await res.json();
  if (json.success) { await loadCalculatorAdmin(); } else { alert(json.error); }
};
window.addCalcDensity = async () => {
  const label = document.getElementById('newDensityLabel').value.trim();
  if (!label) { alert('Podaj nazwę zagęszczenia'); return; }
  const res = await authFetch('/api/admin/calculator/densities', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label })
  });
  const json = await res.json();
  if (json.success) { document.getElementById('newDensityLabel').value = ''; await loadCalculatorAdmin(); }
  else { alert(json.error); }
};
window.deleteCalcDensity = async (id) => {
  if (!confirm('Usunąć to zagęszczenie? Spowoduje to usunięcie powiązanych cen.')) return;
  await authFetch(`/api/admin/calculator/densities/${id}`, { method: 'DELETE' });
  await loadCalculatorAdmin();
};

// ─── Metody ──────────────────────────────────────
function renderCalcMethods() {
  const el = document.getElementById('calcMethodsList');
  if (!el || !calcAdminData) return;
  const arr = calcAdminData.methods || [];
  if (arr.length === 0) { el.innerHTML = '<div class="loading-msg">Brak metod.</div>'; return; }
  el.innerHTML = arr.map(m => `
    <div class="svc-row" id="calc-method-row-${m.id}">
      <div class="svc-row-info" id="calc-method-view-${m.id}">
        <div class="svc-row-name">${escHtml(m.label)}${m.is_keratynowa ? ' <small style="color:#c0c0c0;font-size:.7rem;">(keratynowa)</small>' : ''}</div>
      </div>
      <div class="svc-row-info hidden" id="calc-method-edit-${m.id}" style="flex:1;display:flex;gap:10px;align-items:center">
        <input type="text" id="calc-method-input-${m.id}" value="${escHtml(m.label)}"
               style="background:#111;border:1px solid #444;border-radius:6px;color:#fff;padding:8px 10px;font-size:.85rem;flex:1;" />
        <label style="display:flex;align-items:center;gap:6px;font-size:.75rem;color:rgba(255,255,255,.5);white-space:nowrap;cursor:pointer;">
          <input type="checkbox" id="calc-method-kera-${m.id}" ${m.is_keratynowa ? 'checked' : ''} style="width:14px;height:14px;" />
          keratynowa
        </label>
      </div>
      <div class="svc-row-actions" id="calc-method-actions-view-${m.id}">
        <button class="action-btn action-confirm btn-sm" onclick="startEditCalcMethod(${m.id})">✎ Edytuj</button>
        <button class="action-btn action-delete btn-sm" onclick="deleteCalcMethod(${m.id})">🗑</button>
      </div>
      <div class="svc-row-actions hidden" id="calc-method-actions-edit-${m.id}">
        <button class="action-btn action-confirm btn-sm" onclick="saveCalcMethod(${m.id})">✓ Zapisz</button>
        <button class="action-btn btn-cancel btn-sm" onclick="cancelEditCalcMethod(${m.id})">Anuluj</button>
      </div>
    </div>
  `).join('');
}

window.startEditCalcMethod = (id) => {
  document.getElementById(`calc-method-view-${id}`).classList.add('hidden');
  document.getElementById(`calc-method-edit-${id}`).classList.remove('hidden');
  document.getElementById(`calc-method-actions-view-${id}`).classList.add('hidden');
  document.getElementById(`calc-method-actions-edit-${id}`).classList.remove('hidden');
};
window.cancelEditCalcMethod = (id) => {
  document.getElementById(`calc-method-view-${id}`).classList.remove('hidden');
  document.getElementById(`calc-method-edit-${id}`).classList.add('hidden');
  document.getElementById(`calc-method-actions-view-${id}`).classList.remove('hidden');
  document.getElementById(`calc-method-actions-edit-${id}`).classList.add('hidden');
};
window.saveCalcMethod = async (id) => {
  const label = document.getElementById(`calc-method-input-${id}`).value.trim();
  const is_keratynowa = document.getElementById(`calc-method-kera-${id}`).checked;
  if (!label) { alert('Podaj nazwę'); return; }
  const res = await authFetch(`/api/admin/calculator/methods/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, is_keratynowa })
  });
  const json = await res.json();
  if (json.success) { await loadCalculatorAdmin(); } else { alert(json.error); }
};
window.addCalcMethod = async () => {
  const label = document.getElementById('newMethodLabel').value.trim();
  const is_keratynowa = document.getElementById('newMethodIsKeratynowa').checked;
  if (!label) { alert('Podaj nazwę metody'); return; }
  const res = await authFetch('/api/admin/calculator/methods', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, is_keratynowa })
  });
  const json = await res.json();
  if (json.success) {
    document.getElementById('newMethodLabel').value = '';
    document.getElementById('newMethodIsKeratynowa').checked = false;
    await loadCalculatorAdmin();
  } else { alert(json.error); }
};
window.deleteCalcMethod = async (id) => {
  if (!confirm('Usunąć tę metodę? Spowoduje to usunięcie powiązanych cen.')) return;
  await authFetch(`/api/admin/calculator/methods/${id}`, { method: 'DELETE' });
  await loadCalculatorAdmin();
};

// ─── Keratynowa info ─────────────────────────────
window.saveKeratynowaaInfo = async () => {
  const keratynowa_info = document.getElementById('keraatynowaInfoAdmin').value.trim();
  const msgEl = document.getElementById('keratynowaaInfoMsg');
  const res = await authFetch('/api/admin/calculator/keratynowa-info', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keratynowa_info })
  });
  const json = await res.json();
  if (json.success) showMsg(msgEl, '✓ Zapisano informację!', 'ok');
  else showMsg(msgEl, json.error || 'Błąd', 'err');
};

// ─── Macierz cen ─────────────────────────────────
function renderPriceMatrix() {
  const el = document.getElementById('priceMatrixTable');
  if (!el || !calcAdminData) return;
  const lengths   = calcAdminData.lengths  || [];
  const densities = calcAdminData.densities|| [];
  const methods   = calcAdminData.methods  || [];
  const prices    = calcAdminData.prices   || {};

  if (lengths.length === 0 || densities.length === 0 || methods.length === 0) {
    el.innerHTML = '<div class="loading-msg" style="color:rgba(255,150,50,.6)">Najpierw dodaj długości, zagęszczenia i metody, a następnie wróć do macierzy cen.</div>';
    return;
  }

  // Nagłówki kolumn: metody
  let html = `<table style="border-collapse:collapse;min-width:600px;font-size:.8rem;">
    <thead>
      <tr>
        <th style="padding:8px 12px;text-align:left;color:rgba(255,255,255,.35);font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.08);">Długość / Zagęszczenie</th>`;
  methods.forEach(m => {
    html += `<th style="padding:8px 12px;text-align:center;color:rgba(255,255,255,.35);font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.08);">${escHtml(m.label)}</th>`;
  });
  html += `</tr></thead><tbody>`;

  lengths.forEach(l => {
    densities.forEach((d, dIdx) => {
      html += `<tr>`;
      if (dIdx === 0) {
        html += `<td rowspan="${densities.length}" style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);border-right:1px solid rgba(255,255,255,.06);vertical-align:top;font-weight:600;color:rgba(255,255,255,.7);">${escHtml(l.label)}</td>`;
      }
      html += `<td style="padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.03);color:rgba(255,255,255,.5);font-size:.72rem;padding-left:12px;">${escHtml(d.label)}</td>`;
      methods.forEach(m => {
        const key = `${l.id}_${d.id}_${m.id}`;
        const val = prices[key] !== undefined ? prices[key] : '';
        html += `<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.03);">
          <input type="number" min="0" data-key="${key}" value="${val}"
                 style="width:90px;background:#111;border:1px solid #333;border-radius:4px;color:#fff;padding:5px 8px;font-size:.82rem;text-align:center;"
                 placeholder="0" />
        </td>`;
      });
      html += `</tr>`;
    });
  });

  html += `</tbody></table>`;
  el.innerHTML = html;
}

window.savePriceMatrix = async () => {
  const msgEl = document.getElementById('priceMatrixMsg');
  const inputs = document.querySelectorAll('#priceMatrixTable input[data-key]');
  const prices = {};
  inputs.forEach(inp => {
    const val = inp.value.trim();
    prices[inp.dataset.key] = val === '' ? null : parseFloat(val) || 0;
  });
  const res = await authFetch('/api/admin/calculator/prices', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prices })
  });
  const json = await res.json();
  if (json.success) { showMsg(msgEl, '✓ Ceny zapisane!', 'ok'); await loadCalculatorAdmin(); }
  else showMsg(msgEl, json.error || 'Błąd', 'err');
};

function showCalcMsg(msg, type) {
  console.warn('[Kalkulator admin]', msg);
}

// ═══════════════════════════════════════════════════
// FAQ – Panel admina
// ═══════════════════════════════════════════════════
let allFaqAdmin = [];

async function loadFaqAdmin() {
  try {
    const res = await authFetch('/api/admin/faq');
    allFaqAdmin = await res.json();
    renderFaqAdmin();
  } catch {
    document.getElementById('faqAdminList').innerHTML = '<div class="loading-msg">Błąd ładowania FAQ.</div>';
  }
}

function renderFaqAdmin() {
  const el = document.getElementById('faqAdminList');
  if (!el) return;
  if (allFaqAdmin.length === 0) {
    el.innerHTML = '<div class="loading-msg">Brak pytań. Kliknij „+ Dodaj pytanie".</div>';
    return;
  }
  el.innerHTML = allFaqAdmin.map((item, idx) => `
    <div class="svc-row" id="faq-admin-row-${item.id}">
      <div class="svc-row-info" style="flex:1">
        <div class="svc-row-name" style="font-size:.88rem;">${escHtml(item.question)}</div>
        <div class="svc-row-meta" style="max-width:600px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(item.answer)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        ${idx > 0 ? `<button class="action-btn btn-sm" onclick="moveFaqUp(${item.id})" title="Przesuń wyżej">↑</button>` : ''}
        ${idx < allFaqAdmin.length - 1 ? `<button class="action-btn btn-sm" onclick="moveFaqDown(${item.id})" title="Przesuń niżej">↓</button>` : ''}
        <button class="action-btn action-confirm btn-sm" onclick="editFaq(${item.id})">✎ Edytuj</button>
        <button class="action-btn action-delete btn-sm" onclick="deleteFaq(${item.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('addFaqBtn').addEventListener('click', () => {
  document.getElementById('faqFormTitle').textContent = 'Nowe pytanie';
  document.getElementById('editFaqId').value = '';
  document.getElementById('faqQuestion').value = '';
  document.getElementById('faqAnswer').value = '';
  document.getElementById('faqFormMsg').textContent = '';
  document.getElementById('faqForm').classList.remove('hidden');
  document.getElementById('faqForm').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('cancelFaqBtn').addEventListener('click', () => {
  document.getElementById('faqForm').classList.add('hidden');
});

document.getElementById('saveFaqBtn').addEventListener('click', async () => {
  const id       = document.getElementById('editFaqId').value;
  const question = document.getElementById('faqQuestion').value.trim();
  const answer   = document.getElementById('faqAnswer').value.trim();
  const msgEl    = document.getElementById('faqFormMsg');
  if (!question || !answer) { showMsg(msgEl, 'Wypełnij pytanie i odpowiedź.', 'err'); return; }

  const url    = id ? `/api/admin/faq/${id}` : '/api/admin/faq';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, answer })
  });
  const json = await res.json();
  if (json.success) {
    showMsg(msgEl, '✓ Zapisano!', 'ok');
    document.getElementById('faqForm').classList.add('hidden');
    loadFaqAdmin();
  } else { showMsg(msgEl, json.error || 'Błąd', 'err'); }
});

window.editFaq = (id) => {
  const item = allFaqAdmin.find(f => f.id === id);
  if (!item) return;
  document.getElementById('faqFormTitle').textContent = 'Edytuj pytanie';
  document.getElementById('editFaqId').value = id;
  document.getElementById('faqQuestion').value = item.question;
  document.getElementById('faqAnswer').value = item.answer;
  document.getElementById('faqFormMsg').textContent = '';
  document.getElementById('faqForm').classList.remove('hidden');
  document.getElementById('faqForm').scrollIntoView({ behavior: 'smooth' });
};

window.deleteFaq = async (id) => {
  if (!confirm('Usunąć to pytanie?')) return;
  await authFetch(`/api/admin/faq/${id}`, { method: 'DELETE' });
  loadFaqAdmin();
};

window.moveFaqUp = async (id) => {
  const idx = allFaqAdmin.findIndex(f => f.id === id);
  if (idx <= 0) return;
  const order = allFaqAdmin.map(f => f.id);
  [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
  await authFetch('/api/admin/faq-reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order })
  });
  loadFaqAdmin();
};

window.moveFaqDown = async (id) => {
  const idx = allFaqAdmin.findIndex(f => f.id === id);
  if (idx < 0 || idx >= allFaqAdmin.length - 1) return;
  const order = allFaqAdmin.map(f => f.id);
  [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
  await authFetch('/api/admin/faq-reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order })
  });
  loadFaqAdmin();
};

// ═══════════════════════════════════════════════════
// EKSPORT CSV
// ═══════════════════════════════════════════════════
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  window.location.href = '/api/admin/reservations/export/csv';
});

// ═══════════════════════════════════════════════════
// RĘCZNA REZERWACJA
// ═══════════════════════════════════════════════════
let mrServices = [];

document.getElementById('addReservationBtn').addEventListener('click', async () => {
  const form = document.getElementById('manualReservationForm');
  if (!form.classList.contains('hidden')) { form.classList.add('hidden'); return; }

  // Załaduj usługi jeśli nie załadowane
  if (mrServices.length === 0) {
    try {
      const res = await fetch('/api/services');
      mrServices = await res.json();
    } catch {}
  }
  const sel = document.getElementById('mrServiceId');
  sel.innerHTML = '<option value="">— Dowolna / inna —</option>';
  mrServices.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });

  // Ustaw dzisiejszą datę jako domyślną
  document.getElementById('mrDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('mrMsg').textContent = '';
  form.classList.remove('hidden');
});

document.getElementById('cancelMrBtn').addEventListener('click', () => {
  document.getElementById('manualReservationForm').classList.add('hidden');
});

document.getElementById('mrServiceId').addEventListener('change', () => {
  const svcId = parseInt(document.getElementById('mrServiceId').value);
  const svc = mrServices.find(s => s.id === svcId);
  const variantGroup = document.getElementById('mrVariantGroup');
  const variantSel = document.getElementById('mrVariantIndex');

  if (svc && svc.variants && svc.variants.length > 0) {
    variantSel.innerHTML = '';
    svc.variants.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${v.label} – ${v.price} zł`;
      variantSel.appendChild(opt);
    });
    variantGroup.style.display = '';
  } else {
    variantGroup.style.display = 'none';
  }
});

document.getElementById('saveMrBtn').addEventListener('click', async () => {
  const msgEl = document.getElementById('mrMsg');
  const svcId = document.getElementById('mrServiceId').value;
  const variantIndex = document.getElementById('mrVariantIndex').value;
  const body = {
    client_name:    document.getElementById('mrClientName').value.trim(),
    client_phone:   document.getElementById('mrClientPhone').value.trim(),
    date:           document.getElementById('mrDate').value,
    time:           document.getElementById('mrTime').value,
    status:         document.getElementById('mrStatus').value,
    notes:          document.getElementById('mrNotes').value.trim(),
    service_id:     svcId || undefined,
    variant_index:  svcId && document.getElementById('mrVariantGroup').style.display !== 'none' ? variantIndex : undefined
  };

  if (!body.client_name || !body.client_phone || !body.date || !body.time) {
    msgEl.textContent = 'Wypełnij wymagane pola.';
    msgEl.className = 'upload-msg error';
    return;
  }

  try {
    const res = await authFetch('/api/admin/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (json.success) {
      msgEl.textContent = 'Rezerwacja dodana!';
      msgEl.className = 'upload-msg success';
      loadReservations();
      setTimeout(() => {
        document.getElementById('manualReservationForm').classList.add('hidden');
        msgEl.textContent = '';
      }, 1500);
    } else {
      msgEl.textContent = json.error || 'Błąd zapisu';
      msgEl.className = 'upload-msg error';
    }
  } catch {
    msgEl.textContent = 'Błąd sieci';
    msgEl.className = 'upload-msg error';
  }
});