/* ═══════════════════════════════════════════════════
   calendar.js – Kalendarz terminów (krokowy flow)
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
      const info    = availabilityData[dateStr] || { status:'closed', slots:[], free_minutes:0, duration_needed:60 };
      const isPast  = dateStr < todayStr;

      const cell = document.createElement('div');
      cell.textContent = d;
      if (dateStr === todayStr) cell.classList.add('today');
      if (isPast) cell.classList.add('past');
      cell.dataset.date = dateStr;

      // Kolory na podstawie wolnych minut vs czas usługi
      if (isPast || info.status === 'closed') {
        cell.className = `cal-day ${info.status === 'closed' ? 'closed' : ''} ${isPast ? 'past' : ''}`.trim();
      } else {
        const free     = info.free_minutes || 0;
        const needed   = info.duration_needed || 60;
        const freeSlots = (info.slots || []).filter(s => s.available).length;

        if (freeSlots === 0) {
          cell.className = 'cal-day full';
        } else if (free <= needed) {
          cell.className = 'cal-day limited'; // żółty – ledwo się zmieścisz
        } else {
          cell.className = 'cal-day available'; // zielony – dużo czasu
        }

        if (dateStr === todayStr) cell.classList.add('today');

        cell.addEventListener('click', () => onDayClick(cell, dateStr, info.slots));
      }

      grid.appendChild(cell);
    }
  }

  function onDayClick(cell, dateStr, slots) {
    document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
    cell.classList.add('selected');

    // Przekaż do booking.js
    if (window._bookingOnDaySelected) {
      window._bookingOnDaySelected(dateStr, slots);
    }
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
