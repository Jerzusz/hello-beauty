/* ═══════════════════════════════════════════════════
   calendar.js – Kalendarz terminów (service-aware)
   ═══════════════════════════════════════════════════ */

(function () {
  const grid    = document.getElementById('calendarGrid');
  const title   = document.getElementById('calMonthTitle');
  const prevBtn = document.getElementById('prevMonth');
  const nextBtn = document.getElementById('nextMonth');

  const today = new Date();
  let viewYear  = today.getFullYear();
  let viewMonth = today.getMonth() + 1;
  let availabilityData = {};

  // Service context set by booking.js
  let currentServiceId    = null;
  let currentVariantIndex = null;

  const monthNames = [
    'Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec',
    'Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'
  ];
  const monthNamesShort = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

  async function fetchAvailability(year, month) {
    try {
      let url = `/api/availability/${year}/${month}`;
      const params = new URLSearchParams();
      if (currentServiceId)    params.set('service_id', currentServiceId);
      if (currentVariantIndex !== null && currentVariantIndex !== undefined)
        params.set('variant_index', currentVariantIndex);
      if (params.toString()) url += '?' + params.toString();
      const res = await fetch(url);
      return await res.json();
    } catch { return {}; }
  }

  async function renderCalendar() {
    title.textContent = `${monthNames[viewMonth - 1]} ${viewYear}`;
    const headers = Array.from(grid.querySelectorAll('.cal-day-header'));
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));

    availabilityData = await fetchAvailability(viewYear, viewMonth);

    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    let startOffset = firstDay.getDay();
    startOffset = startOffset === 0 ? 6 : startOffset - 1;

    for (let i = 0; i < startOffset; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day empty';
      grid.appendChild(empty);
    }

    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const todayStr    = formatDate(today);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const info    = availabilityData[dateStr] || { status:'closed', slots:[] };
      const isPast  = dateStr < todayStr;

      const cell = document.createElement('div');
      cell.className = `cal-day ${info.status}`;
      cell.textContent = d;
      if (dateStr === todayStr) cell.classList.add('today');
      if (isPast) cell.classList.add('past');
      cell.dataset.date = dateStr;

      if (!isPast && info.status !== 'closed' && info.status !== 'full') {
        cell.addEventListener('click', () => onDayClick(cell, dateStr, info.slots));
      }
      grid.appendChild(cell);
    }
  }

  function onDayClick(cell, dateStr, slots) {
    document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
    cell.classList.add('selected');
    window.selectedDate = dateStr;
    window.selectedTime = null;

    const slotsSection  = document.getElementById('timeSlotsSection');
    const placeholder   = document.getElementById('bookingPlaceholder');
    const bookingForm   = document.getElementById('bookingForm');
    const bookingSuccess = document.getElementById('bookingSuccess');

    const [y, m, dd] = dateStr.split('-');
    const dayNames = ['Nd','Pon','Wt','Śr','Czw','Pt','Sob'];
    const dayName  = dayNames[new Date(dateStr).getDay()];
    document.getElementById('selectedDateDisplay').textContent =
      `${dayName}, ${parseInt(dd)} ${monthNamesShort[parseInt(m)-1]} ${y}`;

    const slotsContainer = document.getElementById('timeSlots');
    if (slots.length === 0) {
      slotsContainer.innerHTML = '<p style="color:rgba(255,255,255,.35);font-size:.82rem;padding:8px 0">Brak wolnych godzin w tym dniu.</p>';
    } else {
      slotsContainer.innerHTML = slots.map(s => `
        <button class="slot-btn ${s.available ? 'slot-free' : 'slot-taken'}"
                data-time="${s.time}"
                ${!s.available ? 'disabled' : ''}>
          ${s.time}
        </button>
      `).join('');
      slotsContainer.querySelectorAll('.slot-free').forEach(btn => {
        btn.addEventListener('click', () => onSlotClick(btn, btn.dataset.time, dateStr));
      });
    }

    placeholder.style.display = 'none';
    slotsSection.style.display = 'block';
    bookingSuccess.style.display = 'none';
    bookingForm.style.display = 'none';
  }

  function onSlotClick(btn, time, dateStr) {
    document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    window.selectedTime = time;

    const [y, m, d] = dateStr.split('-');
    const infoEl = document.getElementById('formSelectedInfo');

    // Build info summary
    let infoHtml = `<div class="form-info-line">✦ Termin: <strong>${parseInt(d)} ${monthNamesShort[parseInt(m)-1]} ${y}, godz. ${time}</strong></div>`;

    // Append service + variant info from booking.js globals
    if (typeof allServices !== 'undefined' && typeof selectedServiceId !== 'undefined' && selectedServiceId) {
      const svc = allServices.find(s => s.id === selectedServiceId);
      if (svc) {
        infoHtml += `<div class="form-info-line">✦ Usługa: <strong>${svc.name}</strong></div>`;
        if (typeof selectedVariantIndex !== 'undefined' && selectedVariantIndex !== null && svc.variants && svc.variants[selectedVariantIndex]) {
          const v = svc.variants[selectedVariantIndex];
          infoHtml += `<div class="form-info-line">✦ Wariant: <strong>${v.label}</strong> – ${v.price} zł, ${formatDur(v.duration_minutes)}</div>`;
        } else if (!svc.variants || svc.variants.length === 0) {
          const p1 = svc.price_from, p2 = svc.price_to;
          const price = p1 === 0 && p2 === 0 ? 'wycena indywidualna' : p1 === p2 ? `${p1} zł` : `${p1}–${p2} zł`;
          infoHtml += `<div class="form-info-line">✦ Cena: <strong>${price}</strong></div>`;
        }
        if (svc.workers && svc.workers.length > 0) {
          infoHtml += `<div class="form-info-line">✦ Pracownik: <strong>${svc.workers.join(' + ')}</strong></div>`;
        }
      }
    }

    infoEl.innerHTML = infoHtml;
    infoEl.classList.add('visible');

    const bookingForm = document.getElementById('bookingForm');
    const placeholder = document.getElementById('bookingPlaceholder');
    placeholder.style.display = 'none';
    bookingForm.style.display = 'block';
    bookingForm.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  function formatDur(minutes) {
    if (!minutes) return '–';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  }

  prevBtn.addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 1) { viewMonth = 12; viewYear--; }
    renderAndUpdate();
  });
  nextBtn.addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 12) { viewMonth = 1; viewYear++; }
    renderAndUpdate();
  });

  function updateNavBtns() {
    const isCurrent = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
    prevBtn.disabled     = isCurrent;
    prevBtn.style.opacity = isCurrent ? '0.3' : '1';
  }

  async function renderAndUpdate() { await renderCalendar(); updateNavBtns(); }

  // Publiczne API
  window._calRefresh    = renderAndUpdate;
  window._calSetService = function(serviceId, variantIndex) {
    currentServiceId    = serviceId;
    currentVariantIndex = variantIndex;
    renderAndUpdate();
  };

  function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  renderAndUpdate();
})();