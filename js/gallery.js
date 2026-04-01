/* ═══════════════════════════════════════════════════
   gallery.js – Portfolio / lightbox
   ═══════════════════════════════════════════════════ */

(function () {
  let portfolioItems = [];
  let filteredItems = [];
  let currentLightboxIndex = 0;

  const grid = document.getElementById('portfolioGrid');
  const empty = document.getElementById('portfolioEmpty');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxDesc = document.getElementById('lightboxDesc');

  async function loadPortfolio() {
    try {
      const res = await fetch('/api/portfolio');
      portfolioItems = await res.json();
      renderPortfolio('all');
    } catch (err) {
      console.error('Błąd ładowania portfolio:', err);
    }
  }

  function renderPortfolio(cat) {
    filteredItems = cat === 'all' ? portfolioItems : portfolioItems.filter(p => p.category === cat);

    if (filteredItems.length === 0) {
      // Zachowaj oryginalny "empty" jeśli brak zdjęć w ogóle
      grid.innerHTML = '';
      if (portfolioItems.length === 0) {
        grid.appendChild(empty);
      } else {
        grid.innerHTML = `
          <div class="portfolio-empty">
            <div class="empty-icon">🔍</div>
            <p>Brak zdjęć w tej kategorii.</p>
          </div>
        `;
      }
      return;
    }

    const catLabels = {
      przedluzanie: 'Przedłużanie', 'zagęszczanie': 'Zagęszczanie',
      koloryzacja: 'Koloryzacja', general: 'Inne'
    };

    grid.innerHTML = filteredItems.map((item, idx) => `
      <div class="portfolio-item" data-index="${idx}">
        <img src="/uploads/${item.filename}" alt="${escHtml(item.title || 'Portfolio')}" loading="lazy" />
        ${(item.title || item.description) ? `<div class="portfolio-desc-bar">
          ${item.title ? `<h4>${escHtml(item.title)}</h4>` : ''}
          ${item.description ? `<p>${escHtml(item.description)}</p>` : ''}
        </div>` : ''}
        <span class="portfolio-cat-badge">${catLabels[item.category] || item.category}</span>
      </div>
    `).join('');

    // Klik otwiera lightbox
    grid.querySelectorAll('.portfolio-item').forEach(el => {
      el.addEventListener('click', () => openLightbox(parseInt(el.dataset.index)));
    });
  }

  // ─── Lightbox ──────────────────────────────────────
  function openLightbox(index) {
    currentLightboxIndex = index;
    showLightboxItem(index);
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function showLightboxItem(index) {
    const item = filteredItems[index];
    if (!item) return;
    lightboxImg.src = `/uploads/${item.filename}`;
    lightboxImg.alt = item.title || 'Portfolio';
    lightboxTitle.textContent = item.title || '';
    lightboxDesc.textContent = item.description || '';

    document.getElementById('lightboxPrev').style.opacity = index > 0 ? '1' : '0.3';
    document.getElementById('lightboxNext').style.opacity = index < filteredItems.length - 1 ? '1' : '0.3';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev').addEventListener('click', () => {
    if (currentLightboxIndex > 0) showLightboxItem(--currentLightboxIndex);
  });
  document.getElementById('lightboxNext').addEventListener('click', () => {
    if (currentLightboxIndex < filteredItems.length - 1) showLightboxItem(++currentLightboxIndex);
  });
  lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft' && currentLightboxIndex > 0) showLightboxItem(--currentLightboxIndex);
    if (e.key === 'ArrowRight' && currentLightboxIndex < filteredItems.length - 1) showLightboxItem(++currentLightboxIndex);
  });

  // ─── Filter ────────────────────────────────────────
  document.getElementById('portfolioFilter').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#portfolioFilter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPortfolio(btn.dataset.cat);
  });

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  loadPortfolio();
})();
