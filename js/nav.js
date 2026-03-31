/* ═══════════════════════════════════════════════════
   nav.js – Wspólne zachowanie nawigacji (wszystkie strony)
   ═══════════════════════════════════════════════════ */

// ─── Navbar scroll ──────────────────────────────────
const navbar = document.getElementById('navbar');
// Na podstronach (bez sekcji hero) navbar jest zawsze widoczny
const hasHero = document.querySelector('.hero');
if (!hasHero) navbar.classList.add('scrolled');
window.addEventListener('scroll', () => {
  if (hasHero) navbar.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

// ─── Hamburger menu ─────────────────────────────────
const burger = document.getElementById('navBurger');
const navLinks = document.getElementById('navLinks');
if (burger && navLinks) {
  burger.addEventListener('click', () => navLinks.classList.toggle('open'));
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => navLinks.classList.remove('open'));
  });
}

// ─── Aktywny link w nawigacji (na podstawie bieżącej strony) ────────────────
(function markActiveLink() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const map = {
    'index.html'      : '',
    ''                : '',
    'uslugi.html'     : 'uslugi.html',
    'rezerwacja.html' : 'rezerwacja.html',
    'portfolio.html'  : 'portfolio.html',
  };
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    if (link.dataset.page === (map[page] || '')) {
      link.classList.add('active');
    }
  });
})();

// ─── Globalna funkcja escHtml ────────────────────────
window.escHtml = str =>
  String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
