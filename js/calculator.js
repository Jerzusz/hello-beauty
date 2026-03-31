/* ═══════════════════════════════════════════════════
   calculator.js – Kalkulator ceny przedłużania włosów
   ═══════════════════════════════════════════════════ */

(async () => {
  let calcData = null;
  let selectedLength = null;
  let selectedDensity = null;
  let selectedMethod = null;

  // Pobierz dane kalkulatora
  try {
    const res = await fetch('/api/calculator');
    calcData = await res.json();
  } catch {
    document.getElementById('calcSteps').innerHTML =
      '<div style="text-align:center;color:rgba(255,255,255,.35);padding:60px 20px;">Błąd ładowania kalkulatora.</div>';
    return;
  }

  renderOptions();

  function renderOptions() {
    renderLengths();
    renderDensities();
    renderMethods();
  }

  // ─── Długości ────────────────────────────────────
  function renderLengths() {
    const container = document.getElementById('lengthOptions');
    if (!calcData.lengths || calcData.lengths.length === 0) {
      container.innerHTML = '<span style="color:rgba(255,255,255,.3);font-size:.82rem;">Brak skonfigurowanych długości.</span>';
      return;
    }
    container.innerHTML = calcData.lengths.map(l => `
      <button class="calc-option${selectedLength === l.id ? ' selected' : ''}"
              data-id="${l.id}" onclick="selectLength(${l.id})">${escHtml(l.label)}</button>
    `).join('');
  }

  function renderDensities() {
    const container = document.getElementById('densityOptions');
    if (!calcData.densities || calcData.densities.length === 0) {
      container.innerHTML = '<span style="color:rgba(255,255,255,.3);font-size:.82rem;">Brak skonfigurowanych zagęszczeń.</span>';
      return;
    }
    container.innerHTML = calcData.densities.map(d => `
      <button class="calc-option${selectedDensity === d.id ? ' selected' : ''}"
              data-id="${d.id}" onclick="selectDensity(${d.id})">${escHtml(d.label)}</button>
    `).join('');
  }

  function renderMethods() {
    const container = document.getElementById('methodOptions');
    if (!calcData.methods || calcData.methods.length === 0) {
      container.innerHTML = '<span style="color:rgba(255,255,255,.3);font-size:.82rem;">Brak skonfigurowanych metod.</span>';
      return;
    }
    container.innerHTML = calcData.methods.map(m => `
      <button class="calc-option method-highlight${selectedMethod === m.id ? ' selected' : ''}"
              data-id="${m.id}" onclick="selectMethod(${m.id}, ${!!m.is_keratynowa})">${escHtml(m.label)}</button>
    `).join('');
  }

  // ─── Selekcja ────────────────────────────────────
  window.selectLength = function(id) {
    selectedLength = id;
    renderLengths();
    updateStepState('step-num-1', true);
    updateStepActive('step-density');
    updateResult();
  };

  window.selectDensity = function(id) {
    selectedDensity = id;
    renderDensities();
    updateStepState('step-num-2', true);
    updateStepActive('step-method');
    updateResult();
  };

  window.selectMethod = function(id, isKeratynowa) {
    selectedMethod = id;
    renderMethods();
    updateStepState('step-num-3', true);

    // Pokaż/ukryj info o metodzie keratynowej
    const infoBox = document.getElementById('keraatynowaInfo');
    const infoTxt = document.getElementById('keratynowaTxt');
    if (isKeratynowa && calcData.keratynowa_info) {
      infoTxt.textContent = calcData.keratynowa_info;
      infoBox.classList.add('visible');
    } else {
      infoBox.classList.remove('visible');
    }

    updateResult();
  };

  function updateStepState(numId, done) {
    const el = document.getElementById(numId);
    if (!el) return;
    if (done) {
      el.classList.add('done');
      el.textContent = '✓';
    } else {
      el.classList.remove('done');
      el.textContent = numId.replace('step-num-', '');
    }
  }

  function updateStepActive(stepId) {
    document.querySelectorAll('.calc-step').forEach(s => s.classList.remove('active'));
    const step = document.getElementById(stepId);
    if (step) step.classList.add('active');
  }

  // ─── Wynik ───────────────────────────────────────
  function updateResult() {
    const resultEl  = document.getElementById('calcResult');
    const noPriceEl = document.getElementById('calcNoPrice');

    if (!selectedLength || !selectedDensity || !selectedMethod) {
      resultEl.classList.remove('visible');
      noPriceEl.classList.remove('visible');
      return;
    }

    const key   = `${selectedLength}_${selectedDensity}_${selectedMethod}`;
    const price = calcData.prices && calcData.prices[key];

    const lengthLabel  = calcData.lengths.find(l => l.id === selectedLength)?.label || '';
    const densityLabel = calcData.densities.find(d => d.id === selectedDensity)?.label || '';
    const methodLabel  = calcData.methods.find(m => m.id === selectedMethod)?.label || '';

    if (price !== undefined && price !== null && price !== 0) {
      document.getElementById('resultPrice').textContent = price.toLocaleString('pl-PL');
      document.getElementById('resultSummary').textContent =
        `${lengthLabel} · ${densityLabel} · ${methodLabel}`;
      resultEl.classList.add('visible');
      noPriceEl.classList.remove('visible');
    } else if (price === 0) {
      noPriceEl.classList.add('visible');
      resultEl.classList.remove('visible');
    } else {
      noPriceEl.classList.add('visible');
      resultEl.classList.remove('visible');
    }
  }

  // ─── Reset ───────────────────────────────────────
  document.getElementById('calcReset').addEventListener('click', () => {
    selectedLength  = null;
    selectedDensity = null;
    selectedMethod  = null;
    renderOptions();
    document.getElementById('calcResult').classList.remove('visible');
    document.getElementById('calcNoPrice').classList.remove('visible');
    document.getElementById('keraatynowaInfo').classList.remove('visible');
    ['step-num-1','step-num-2','step-num-3'].forEach((id, i) => updateStepState(id, false));
    document.querySelectorAll('.calc-step').forEach((s, i) => {
      s.classList.remove('active');
      if (i === 0) s.classList.add('active');
    });
    // Przywróć numery kroków
    document.getElementById('step-num-1').textContent = '1';
    document.getElementById('step-num-2').textContent = '2';
    document.getElementById('step-num-3').textContent = '3';
  });

  // ─── Util ────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
