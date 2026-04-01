/* ═══════════════════════════════════════════════════
   rodo.js – Cookie banner + polityka prywatności
   ═══════════════════════════════════════════════════ */

(async function () {
  let rodoData = null;

  try {
    const res = await fetch('/api/rodo');
    if (res.ok) rodoData = await res.json();
  } catch { /* ignoruj */ }

  // ─── Polityka prywatności (tylko na stronie polityki) ──────
  const sectionsEl = document.getElementById('rodo-sections');
  if (sectionsEl && rodoData) {
    const pp = rodoData.privacy_policy;
    if (pp) {
      const titleEl = document.getElementById('rodo-title');
      const introEl = document.getElementById('rodo-intro');
      if (titleEl && pp.title) titleEl.textContent = pp.title;
      if (introEl && pp.intro) introEl.textContent = pp.intro;

      if (pp.sections && pp.sections.length > 0) {
        sectionsEl.innerHTML = pp.sections.map(s =>
          `<div class="privacy-section">
            <h2 class="privacy-heading">${escHtml(s.heading)}</h2>
            <p class="privacy-text">${escHtml(s.content)}</p>
          </div>`
        ).join('');
      } else {
        sectionsEl.innerHTML = '<p style="color:rgba(255,255,255,.5);">Brak treści polityki prywatności.</p>';
      }
    }
  }

  // ─── Cookie banner (na każdej stronie) ─────────────────────
  const banner = document.getElementById('cookieBanner');
  if (!banner) return;

  // Jeśli już wybrał – nie pokazuj
  const consent = localStorage.getItem('cookie_consent');
  if (consent) return;

  // Wypełnij treści z API
  if (rodoData && rodoData.cookie_banner) {
    const cb = rodoData.cookie_banner;
    const textEl = document.getElementById('cookieText');
    const acceptEl = document.getElementById('cookieAccept');
    const rejectEl = document.getElementById('cookieReject');
    const linkEl = document.getElementById('cookieDetailsLink');
    if (textEl && cb.text) textEl.textContent = cb.text;
    if (acceptEl && cb.accept_btn) acceptEl.textContent = cb.accept_btn;
    if (rejectEl && cb.reject_btn) rejectEl.textContent = cb.reject_btn;
    if (linkEl && cb.details_link) linkEl.textContent = cb.details_link;
  }

  banner.style.display = 'block';

  document.getElementById('cookieAccept').addEventListener('click', () => {
    localStorage.setItem('cookie_consent', 'accepted');
    banner.style.display = 'none';
  });

  document.getElementById('cookieReject').addEventListener('click', () => {
    localStorage.setItem('cookie_consent', 'rejected');
    banner.style.display = 'none';
  });

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
