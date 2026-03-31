/* ═══════════════════════════════════════════════════
   services.js – Ładowanie i wyświetlanie usług/cennika
   ═══════════════════════════════════════════════════ */

let allServices = [];

async function loadServices() {
  try {
    const res = await fetch('/api/services');
    allServices = await res.json();
    renderServices('all');
  } catch {
    document.getElementById('servicesGrid').innerHTML =
      '<p style="color:#c94;padding:40px;text-align:center;grid-column:1/-1">Nie udało się załadować usług. Upewnij się, że serwer działa.</p>';
  }
}

function renderServices(cat) {
  const grid = document.getElementById('servicesGrid');
  const filtered = cat === 'all' ? allServices : allServices.filter(s => s.category === cat);

  if (filtered.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px;grid-column:1/-1">Brak usług w tej kategorii.</p>';
    return;
  }

  const catLabels = {
    sciaganie: 'Ściąganie',
    keratyna_korekta: 'Korekta (keratyna)',
    keratyna_zalozenie: 'Założenie (keratyna)',
    biotape: 'Bio Tape',
    tapeon: 'Tape On',
    koloryzacja: 'Koloryzacja',
    pielegnacja: 'Pielęgnacja'
  };

  grid.innerHTML = filtered.map(s => {
    const priceText = s.price_from === 0 && s.price_to === 0
      ? '<span class="service-price">Bezpłatna</span>'
      : s.price_to > s.price_from
        ? `<span class="service-price">${s.price_from} – ${s.price_to} zł</span>`
        : `<span class="service-price">od ${s.price_from} zł</span>`;

    const durationText = s.duration_minutes
      ? `<span class="service-duration">~${s.duration_minutes} min</span>`
      : '';

    return `
      <div class="service-card" data-cat="${s.category}">
        <div class="service-cat-badge">${catLabels[s.category] || s.category}</div>
        <h3 class="service-name">${escHtml(s.name)}</h3>
        <p class="service-desc">${escHtml(s.description || '')}</p>
        <div class="service-footer">
          <div>${priceText}${durationText ? '<br>' + durationText : ''}</div>
          <a href="rezerwacja.html?service=${encodeURIComponent(s.name)}" class="service-book-btn">Zarezerwuj</a>
        </div>
      </div>
    `;
  }).join('');
}

// Filtr usług
document.getElementById('servicesFilter').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('#servicesFilter .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderServices(btn.dataset.cat);
});

loadServices();
