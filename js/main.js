/* ═══════════════════════════════════════════════════
   main.js – Nawigacja, usługi, formularz rezerwacji
   ═══════════════════════════════════════════════════ */

// ─── Navbar scroll ──────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// ─── Hamburger menu ─────────────────────────────────
const burger = document.getElementById('navBurger');
const navLinks = document.getElementById('navLinks');
burger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

// ─── Active nav link on scroll ───────────────────────
const sections = document.querySelectorAll('section[id]');
const navLinkEls = document.querySelectorAll('.nav-link[href^="#"]');
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinkEls.forEach(l => l.classList.remove('active'));
      const active = document.querySelector(`.nav-link[href="#${e.target.id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, { threshold: 0.4 });
sections.forEach(s => observer.observe(s));

// ─── Usługi ─────────────────────────────────────────
let allServices = [];

async function loadServices() {
  try {
    const res = await fetch('/api/services');
    allServices = await res.json();
    renderServices('all');
    populateServiceSelect();
  } catch (err) {
    console.error('Błąd ładowania usług:', err);
    document.getElementById('servicesGrid').innerHTML =
      '<p style="color:#c94;padding:40px;text-align:center">Nie udało się załadować usług. Upewnij się, że serwer działa.</p>';
  }
}

function renderServices(cat) {
  const grid = document.getElementById('servicesGrid');
  const filtered = cat === 'all' ? allServices : allServices.filter(s => s.category === cat);

  if (filtered.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px;grid-column:1/-1">Brak usług w tej kategorii.</p>';
    return;
  }

  grid.innerHTML = filtered.map(s => {
    const priceText = s.price_from === 0 && s.price_to === 0
      ? '<span class="service-price">Bezpłatna</span>'
      : s.price_to > s.price_from
        ? `<span class="service-price">${s.price_from} – ${s.price_to} zł</span>`
        : `<span class="service-price">od ${s.price_from} zł</span>`;

    const durationText = s.duration_minutes
      ? `<span class="service-duration">~${s.duration_minutes} min</span>`
      : '';

    const catLabels = {
      przedluzanie: 'Przedłużanie', 'zagęszczanie': 'Zagęszczanie',
      pielegnacja: 'Pielęgnacja', koloryzacja: 'Koloryzacja', konsultacja: 'Konsultacja'
    };

    return `
      <div class="service-card" data-cat="${s.category}">
        <div class="service-cat-badge">${catLabels[s.category] || s.category}</div>
        <h3 class="service-name">${escHtml(s.name)}</h3>
        <p class="service-desc">${escHtml(s.description || '')}</p>
        <div class="service-footer">
          <div>${priceText}${durationText ? '<br>' + durationText : ''}</div>
          <button class="service-book-btn" onclick="bookService('${escHtml(s.name)}')">Zarezerwuj</button>
        </div>
      </div>
    `;
  }).join('');
}

function populateServiceSelect() {
  const sel = document.getElementById('serviceSelect');
  sel.innerHTML = '<option value="">– wybierz usługę –</option>' +
    allServices.map(s => `<option value="${escHtml(s.name)}">${escHtml(s.name)}</option>`).join('');
}

// Filtr usług
document.getElementById('servicesFilter').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('#servicesFilter .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderServices(btn.dataset.cat);
});

// Klik "Zarezerwuj" na karcie usługi
window.bookService = function(serviceName) {
  document.getElementById('serviceSelect').value = serviceName;
  document.getElementById('rezerwacja').scrollIntoView({ behavior: 'smooth' });
};

// ─── Formularz rezerwacji ────────────────────────────
const bookingForm = document.getElementById('bookingForm');
const bookingSuccess = document.getElementById('bookingSuccess');

bookingForm.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Wysyłanie...';

  const data = {
    client_name: bookingForm.client_name.value.trim(),
    client_phone: bookingForm.client_phone.value.trim(),
    client_email: bookingForm.client_email.value.trim(),
    service: bookingForm.service.value,
    date: window.selectedDate,
    time: window.selectedTime,
    notes: bookingForm.notes.value.trim()
  };

  try {
    const res = await fetch('/api/reservations', {
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
      btn.disabled = false; btn.textContent = 'Potwierdź rezerwację';
    }
  } catch {
    showFormError('Brak połączenia z serwerem.');
    btn.disabled = false; btn.textContent = 'Potwierdź rezerwację';
  }
});

function showFormError(msg) {
  let err = document.getElementById('formError');
  if (!err) {
    err = document.createElement('div');
    err.id = 'formError';
    err.style.cssText = 'background:rgba(201,76,76,.15);border:1px solid rgba(201,76,76,.3);border-radius:8px;padding:12px 14px;font-size:.82rem;color:#e07070;margin-bottom:12px;';
    bookingForm.querySelector('.form-selected-info').after(err);
  }
  err.textContent = msg;
}

document.getElementById('newBookingBtn').addEventListener('click', () => {
  bookingSuccess.style.display = 'none';
  bookingForm.reset();
  bookingForm.style.display = 'none';
  document.getElementById('bookingPlaceholder').style.display = 'block';
  window.selectedDate = null; window.selectedTime = null;
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  document.querySelectorAll('.slot-btn').forEach(s => s.classList.remove('selected'));
  if (window._calRefresh) window._calRefresh();
});

// ─── Helpers ─────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────
loadServices();

// Eksport helperów dla innych modułów
window.escHtml = escHtml;
window.selectedDate = null;
window.selectedTime = null;
