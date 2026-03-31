/* ═══════════════════════════════════════════════════
   booking.js – Formularz rezerwacji (service-first flow)
   ═══════════════════════════════════════════════════ */

window.selectedDate = null;
window.selectedTime = null;

let allServices = [];
let selectedServiceId   = null;
let selectedVariantIndex = null;

// ─── Helpers ─────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDuration(minutes) {
  if (!minutes) return '–';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

// ─── Załaduj usługi do selecta ───────────────────────
async function populateServiceSelect() {
  try {
    const res = await fetch('/api/services');
    allServices = await res.json();
    const catLabels = {
      sciaganie:          'Ściąganie i przerobienie',
      keratyna_korekta:   'Keratyna – korekty',
      keratyna_zalozenie: 'Keratyna – założenie',
      biotape:            'Bio Tape',
      tapeon:             'Tape On',
      koloryzacja:        'Koloryzacja',
      pielegnacja:        'Pielęgnacja',
      inne:               'Inne'
    };
    const groups = {};
    allServices.forEach(s => { if (!groups[s.category]) groups[s.category] = []; groups[s.category].push(s); });
    const sel = document.getElementById('serviceSelect');
    let html = '<option value="">– wybierz usługę –</option>';
    for (const [cat, svcs] of Object.entries(groups)) {
      html += `<optgroup label="${escHtml(catLabels[cat] || cat)}">`;
      svcs.forEach(s => { html += `<option value="${s.id}">${escHtml(s.name)}</option>`; });
      html += '</optgroup>';
    }
    sel.innerHTML = html;

    // Wstaw usługę z URL
    const params = new URLSearchParams(window.location.search);
    const presel = params.get('service_id') || params.get('service');
    if (presel) {
      const svc = allServices.find(s => s.id === parseInt(presel) || s.name === presel);
      if (svc) { sel.value = svc.id; onServiceChange(); }
    }
  } catch { /* cicho ignoruj */ }
}

// ─── Zmiana usługi ───────────────────────────────────
function onServiceChange() {
  const sel = document.getElementById('serviceSelect');
  const serviceId = parseInt(sel.value);

  if (!serviceId || isNaN(serviceId)) {
    selectedServiceId    = null;
    selectedVariantIndex = null;
    document.getElementById('variantGroup').style.display = 'none';
    document.getElementById('serviceInfo').style.display  = 'none';
    if (window._calSetService) window._calSetService(null, null);
    return;
  }

  const svc = allServices.find(s => s.id === serviceId);
  if (!svc) return;
  selectedServiceId = serviceId;

  // Warianty
  const variantGroup = document.getElementById('variantGroup');
  const variantSel   = document.getElementById('variantSelect');
  if (svc.variants && svc.variants.length > 0) {
    variantGroup.style.display = 'block';
    variantSel.innerHTML = '<option value="">– wybierz wariant –</option>' +
      svc.variants.map((v, i) =>
        `<option value="${i}">${escHtml(v.label)} – ${v.price} zł (${formatDuration(v.duration_minutes)})</option>`
      ).join('');
    selectedVariantIndex = null;
  } else {
    variantGroup.style.display  = 'none';
    selectedVariantIndex = null;
  }

  updateServiceInfo();
  resetCalendarAndSlots();
  if (window._calSetService) window._calSetService(selectedServiceId, selectedVariantIndex);
}

// ─── Zmiana wariantu ─────────────────────────────────
function onVariantChange() {
  const val = document.getElementById('variantSelect').value;
  selectedVariantIndex = val !== '' ? parseInt(val) : null;
  updateServiceInfo();
  resetCalendarAndSlots();
  if (window._calSetService) window._calSetService(selectedServiceId, selectedVariantIndex);
}

// ─── Aktualizuj info o usłudze ────────────────────────
function updateServiceInfo() {
  const infoEl = document.getElementById('serviceInfo');
  if (!selectedServiceId) { infoEl.style.display = 'none'; return; }
  const svc = allServices.find(s => s.id === selectedServiceId);
  if (!svc) return;

  let price, duration;
  if (selectedVariantIndex !== null && svc.variants && svc.variants[selectedVariantIndex]) {
    const v = svc.variants[selectedVariantIndex];
    price    = `${v.price} zł`;
    duration = formatDuration(v.duration_minutes);
  } else if (svc.variants && svc.variants.length > 0) {
    const prices = svc.variants.map(v => v.price);
    const durs   = svc.variants.map(v => v.duration_minutes);
    price    = `${Math.min(...prices)}–${Math.max(...prices)} zł`;
    duration = `${formatDuration(Math.min(...durs))} – ${formatDuration(Math.max(...durs))}`;
  } else {
    const p1 = svc.price_from, p2 = svc.price_to;
    price    = p1 === 0 && p2 === 0 ? 'Wycena indywidualna' : p1 === p2 ? `${p1} zł` : `${p1}–${p2} zł`;
    duration = formatDuration(svc.duration_minutes);
  }

  const workers = (svc.workers || []).join(' + ') || 'do ustalenia';
  infoEl.innerHTML = `
    <div class="svc-info-row"><span>Pracownik:</span><strong>${escHtml(workers)}</strong></div>
    <div class="svc-info-row"><span>Czas:</span><strong>${escHtml(duration)}</strong></div>
    <div class="svc-info-row"><span>Cena:</span><strong>${escHtml(price)}</strong></div>
  `;
  infoEl.style.display = 'block';
}

// ─── Reset kalendarza i slotów ────────────────────────
function resetCalendarAndSlots() {
  window.selectedDate = null;
  window.selectedTime = null;
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  document.getElementById('timeSlotsSection').style.display = 'none';
  document.getElementById('bookingForm').style.display      = 'none';
  document.getElementById('bookingPlaceholder').style.display = 'block';
}

// ─── Formularz rezerwacji ────────────────────────────
const bookingForm    = document.getElementById('bookingForm');
const bookingSuccess = document.getElementById('bookingSuccess');

bookingForm.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Wysyłanie...';

  const data = {
    client_name:   bookingForm.client_name.value.trim(),
    client_phone:  bookingForm.client_phone.value.trim(),
    service_id:    selectedServiceId,
    variant_index: selectedVariantIndex,
    date:          window.selectedDate,
    time:          window.selectedTime,
    notes:         bookingForm.notes.value.trim()
  };

  try {
    const res  = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (res.ok) {
      bookingForm.style.display = 'none';
      document.getElementById('timeSlotsSection').style.display = 'none';
      bookingSuccess.style.display = 'block';
      document.getElementById('successMessage').textContent = json.message;
    } else {
      showFormError(json.error || 'Wystąpił błąd. Spróbuj ponownie.');
      btn.disabled = false;
      btn.textContent = 'Potwierdź rezerwację';
    }
  } catch {
    showFormError('Brak połączenia z serwerem.');
    btn.disabled = false;
    btn.textContent = 'Potwierdź rezerwację';
  }
});

function showFormError(msg) {
  let err = document.getElementById('formError');
  if (!err) {
    err = document.createElement('div');
    err.id = 'formError';
    err.className = 'form-error-msg';
    document.getElementById('formSelectedInfo').before(err);
  }
  err.textContent = msg;
}

document.getElementById('newBookingBtn').addEventListener('click', () => {
  bookingSuccess.style.display = 'none';
  bookingForm.reset();
  bookingForm.style.display    = 'none';
  document.getElementById('bookingPlaceholder').style.display = 'block';
  document.getElementById('timeSlotsSection').style.display   = 'none';
  window.selectedDate = null;
  window.selectedTime = null;
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  document.querySelectorAll('.slot-btn').forEach(s => s.classList.remove('selected'));
  if (window._calRefresh) window._calRefresh();
});

// ─── Wire-up ─────────────────────────────────────────
document.getElementById('serviceSelect').addEventListener('change', onServiceChange);
document.getElementById('variantSelect').addEventListener('change', onVariantChange);

populateServiceSelect();
