/* ═══════════════════════════════════════════════════
   faq.js – Strona FAQ
   ═══════════════════════════════════════════════════ */

(async () => {
  const list = document.getElementById('faqList');

  let items = [];
  try {
    const res = await fetch('/api/faq');
    items = await res.json();
  } catch {
    list.innerHTML = '<div class="faq-empty">Błąd ładowania pytań.</div>';
    return;
  }

  if (!items.length) {
    list.innerHTML = '<div class="faq-empty">Brak pytań i odpowiedzi. Wróć wkrótce.</div>';
    return;
  }

  list.innerHTML = items.map((item, idx) => `
    <div class="faq-item" id="faq-item-${idx}" onclick="toggleFaq(${idx})">
      <div class="faq-question">
        <div class="faq-question-text">${escHtml(item.question)}</div>
        <div class="faq-icon">+</div>
      </div>
      <div class="faq-answer">
        <div class="faq-answer-inner">${escHtml(item.answer)}</div>
      </div>
    </div>
  `).join('');

  window.toggleFaq = function(idx) {
    const item = document.getElementById(`faq-item-${idx}`);
    const isOpen = item.classList.contains('open');

    // Zamknij wszystkie
    document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('open'));

    // Otwórz kliknięty (jeśli nie był otwarty)
    if (!isOpen) item.classList.add('open');
  };

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
