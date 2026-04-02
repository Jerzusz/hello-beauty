/* ═══════════════════════════════════════════════════
   booking.js – Rezerwacja krokowa (step-by-step flow)
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

// ─── Flow: zarządzanie krokami ────────────────────────
function activateStep(stepNum) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`bflowStep${i}`);
    if (!el) continue;
    el.classList.remove('bflow-step--active');
    const body    = document.getElementById(`bflowBody${i}`);
    const summary = document.getElementById(`bflowSummary${i}`);
    if (i < stepNum) {
      // Zamknięte kroki – pokaż podsumowanie, ukryj body
      el.classList.add('bflow-step--done');
      el.style.display = '';
      if (body) body.style.display = 'none';
      if (summary) summary.style.display = '';
    } else if (i === stepNum) {
      // Aktywny krok
      el.classList.remove('bflow-step--done');
      el.classList.add('bflow-step--active');
      el.style.display = '';
      if (body) body.style.display = '';
      if (summary) summary.style.display = 'none';
      // Płynne przewinięcie
      setTimeout(() => el.scrollIntoView({ behavior:'smooth', block:'nearest' }), 100);
    } else {
      // Przyszłe kroki – ukryte
      el.classList.remove('bflow-step--done');
      el.style.display = 'none';
      if (body) body.style.display = '';
      if (summary) summary.style.display = 'none';
    }
  }
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
    // Zostań na kroku 1, ukryj resztę
    activateStep(1);
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
    // Nie przechodź dalej – czekaj na wybór wariantu
    return;
  } else {
    variantGroup.style.display = 'none';
    selectedVariantIndex = null;
  }

  updateServiceInfo();
  proceedFromService();
}

// ─── Zmiana wariantu ─────────────────────────────────
function onVariantChange() {
  const val = document.getElementById('variantSelect').value;
  if (val === '') {
    selectedVariantIndex = null;
    return;
  }
  selectedVariantIndex = parseInt(val);
  updateServiceInfo();
  proceedFromService();
}

// ─── Przejdź z kroku 1 do kroku 2 ────────────────────
function proceedFromService() {
  const svc = allServices.find(s => s.id === selectedServiceId);
  if (!svc) return;

  // Zapisz podsumowanie
  let summaryText = svc.name;
  if (selectedVariantIndex !== null && svc.variants && svc.variants[selectedVariantIndex]) {
    summaryText += ` – ${svc.variants[selectedVariantIndex].label}`;
  }
  document.getElementById('summaryService').textContent = summaryText;

  // Reset dalszych kroków
  window.selectedDate = null;
  window.selectedTime = null;

  // Przejdź do kroku 2 (kalendarz)
  activateStep(2);

  // Odśwież kalendarz z nową usługą
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

// ─── Krok 2 → 3: Wybrano dzień (wywoływane z calendar.js) ──
window._bookingOnDaySelected = function(dateStr, slots) {
  window.selectedDate = dateStr;
  window.selectedTime = null;

  const monthNamesShort = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
  const dayNames = ['Nd','Pon','Wt','Śr','Czw','Pt','Sob'];
  const [y, m, d] = dateStr.split('-');
  const dayName  = dayNames[new Date(dateStr).getDay()];
  const dateLabel = `${dayName}, ${parseInt(d)} ${monthNamesShort[parseInt(m)-1]} ${y}`;

  // Podsumowanie kroku 2
  document.getElementById('summaryDate').textContent = dateLabel;
  document.getElementById('selectedDateDisplay').textContent = `Dostępne godziny na ${dateLabel}`;

  // Wypełnij sloty
  const slotsContainer = document.getElementById('timeSlots');
  const freeSlots = slots.filter(s => s.available);
  if (freeSlots.length === 0) {
    slotsContainer.innerHTML = '<p style="color:#999;font-size:.82rem;padding:8px 0">Brak wolnych godzin w tym dniu.</p>';
  } else {
    slotsContainer.innerHTML = slots.map(s => `
      <button class="slot-btn ${s.available ? 'slot-free' : 'slot-taken'}"
              data-time="${s.time}"
              ${!s.available ? 'disabled' : ''}>
        ${s.time}
      </button>
    `).join('');
    slotsContainer.querySelectorAll('.slot-free').forEach(btn => {
      btn.addEventListener('click', () => onSlotClick(btn, btn.dataset.time));
    });
  }

  // Przejdź do kroku 3 (godziny)
  activateStep(3);
};

// ─── Krok 3 → 4: Wybrano godzinę ─────────────────────
function onSlotClick(btn, time) {
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  window.selectedTime = time;

  // Podsumowanie kroku 3
  document.getElementById('summaryTime').textContent = `Godzina: ${time}`;

  // Wypełnij podsumowanie formularza
  buildFormSummary();

  // Przejdź do kroku 4 (formularz)
  activateStep(4);
}

function buildFormSummary() {
  const monthNamesShort = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
  const [y, m, d] = window.selectedDate.split('-');
  const infoEl = document.getElementById('formSelectedInfo');
  let html = `<div class="form-info-line">✦ Termin: <strong>${parseInt(d)} ${monthNamesShort[parseInt(m)-1]} ${y}, godz. ${window.selectedTime}</strong></div>`;

  if (selectedServiceId) {
    const svc = allServices.find(s => s.id === selectedServiceId);
    if (svc) {
      html += `<div class="form-info-line">✦ Usługa: <strong>${escHtml(svc.name)}</strong></div>`;
      if (selectedVariantIndex !== null && svc.variants && svc.variants[selectedVariantIndex]) {
        const v = svc.variants[selectedVariantIndex];
        html += `<div class="form-info-line">✦ Wariant: <strong>${escHtml(v.label)}</strong> – ${v.price} zł, ${formatDuration(v.duration_minutes)}</div>`;
      } else if (!svc.variants || svc.variants.length === 0) {
        const p1 = svc.price_from, p2 = svc.price_to;
        const price = p1 === 0 && p2 === 0 ? 'wycena indywidualna' : p1 === p2 ? `${p1} zł` : `${p1}–${p2} zł`;
        html += `<div class="form-info-line">✦ Cena: <strong>${price}</strong></div>`;
      }
      if (svc.workers && svc.workers.length > 0) {
        html += `<div class="form-info-line">✦ Pracownik: <strong>${escHtml(svc.workers.join(' + '))}</strong></div>`;
      }
    }
  }
  infoEl.innerHTML = html;
}

// ─── Cofanie kroków (przyciski "Zmień") ──────────────
document.getElementById('changeService').addEventListener('click', () => {
  selectedServiceId    = null;
  selectedVariantIndex = null;
  window.selectedDate  = null;
  window.selectedTime  = null;
  document.getElementById('serviceSelect').value = '';
  document.getElementById('variantGroup').style.display = 'none';
  document.getElementById('serviceInfo').style.display  = 'none';
  activateStep(1);
});

document.getElementById('changeDate').addEventListener('click', () => {
  window.selectedDate = null;
  window.selectedTime = null;
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  activateStep(2);
  if (window._calRefresh) window._calRefresh();
});

document.getElementById('changeTime').addEventListener('click', () => {
  window.selectedTime = null;
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  activateStep(3);
});

// ─── Formularz rezerwacji ────────────────────────────
const bookingForm    = document.getElementById('bookingForm');
const bookingSuccess = document.getElementById('bookingSuccess');

bookingForm.addEventListener('submit', async e => {
  e.preventDefault();

  // Sprawdź zgodę RODO
  const rodoCheckbox = document.getElementById('rodoConsent');
  if (rodoCheckbox && !rodoCheckbox.checked) {
    showFormError('Musisz wyrazić zgodę na przetwarzanie danych osobowych.');
    return;
  }

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
      // Ukryj wszystkie kroki, pokaż sukces
      for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`bflowStep${i}`);
        if (el) el.style.display = 'none';
      }
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
    bookingForm.querySelector('.form-group').before(err);
  }
  err.textContent = msg;
}

document.getElementById('newBookingBtn').addEventListener('click', () => {
  bookingSuccess.style.display = 'none';
  bookingForm.reset();
  selectedServiceId    = null;
  selectedVariantIndex = null;
  window.selectedDate  = null;
  window.selectedTime  = null;
  document.getElementById('serviceSelect').value = '';
  document.getElementById('variantGroup').style.display = 'none';
  document.getElementById('serviceInfo').style.display  = 'none';
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  document.querySelectorAll('.slot-btn').forEach(s => s.classList.remove('selected'));
  activateStep(1);
  if (window._calRefresh) window._calRefresh();
});

// ─── Wire-up ─────────────────────────────────────────
document.getElementById('serviceSelect').addEventListener('change', onServiceChange);
document.getElementById('variantSelect').addEventListener('change', onVariantChange);

// Start na kroku 1
activateStep(1);
populateServiceSelect();

// ─── Załaduj treść zgody RODO ────────────────────────
(async function loadRodoConsent() {
  try {
    const res = await fetch('/api/rodo');
    if (!res.ok) return;
    const data = await res.json();
    if (data.booking_consent) {
      const textEl = document.getElementById('rodoConsentText');
      if (textEl) {
        textEl.innerHTML = escHtml(data.booking_consent).replace(
          /Polityk[aąę] prywatności/gi,
          '<a href="polityka-prywatnosci.html" target="_blank">$&</a>'
        );
      }
    }
  } catch { /* ignoruj */ }
})();
