const API_BASE = window.CORRECTOR_API_BASE || '';
const textInput = document.getElementById('textInput');
const highlights = document.getElementById('highlights');

let lastMatches = [];
let activeMatchKey = null;

const tooltip = document.createElement('div');
tooltip.id = 'suggestionTooltip';
tooltip.className = 'suggestion-tooltip hidden';
document.body.appendChild(tooltip);

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function countWords(text) {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

function countLetters(text) {
  const onlyLetters = text.match(/[A-Za-zÁÉÍÓÚáéíóúÜüÑñ]/g);
  return onlyLetters ? onlyLetters.length : 0;
}

function syncScroll() {
  highlights.scrollTop = textInput.scrollTop;
  highlights.scrollLeft = textInput.scrollLeft;
}

function updateCounts(text, issueCount = null) {
  document.getElementById('wordCount').textContent = countWords(text);
  document.getElementById('letterCount').textContent = countLetters(text);
  document.getElementById('charCount').textContent = text.length;

  if (issueCount !== null) {
    document.getElementById('issueCount').textContent = issueCount;
  }
}

function getMatchKey(match) {
  return `${match.offset}-${match.length}`;
}

function renderHighlights(matches) {
  const text = textInput.value;

  if (!text) {
    highlights.innerHTML = '';
    return;
  }

  if (!matches.length) {
    highlights.innerHTML = escapeHtml(text) + '\n';
    syncScroll();
    return;
  }

  const ordered = [...matches].sort((a, b) => a.offset - b.offset);
  let result = '';
  let lastIndex = 0;

  ordered.forEach((match) => {
    const key = getMatchKey(match);
    const isActive = activeMatchKey === key ? ' active-error' : '';

    result += escapeHtml(text.slice(lastIndex, match.offset));

    result += `<mark class="error-mark${isActive}"
      data-offset="${match.offset}"
      data-length="${match.length}"
      data-key="${key}">
      ${escapeHtml(text.slice(match.offset, match.offset + match.length))}
    </mark>`;

    lastIndex = match.offset + match.length;
  });

  result += escapeHtml(text.slice(lastIndex));
  highlights.innerHTML = result;
  syncScroll();
}

function renderIdleState() {
  document.getElementById('grammarResult').innerHTML = `
    <div class="badge warn">Esperando análisis</div>
    <div class="score">Puntuación estimada: --/100</div>
    <div class="legend">
      Presiona <strong>Analizar</strong> para revisar ortografía, gramática,
      acentuación y puntuación.
    </div>
  `;
}

function buildIssuesList(matches) {
  if (!matches.length) return '';

  return `
    <ul class="issues">
      ${matches.slice(0, 12).map((item) => {
        const key = getMatchKey(item);
        const selectedText = textInput.value.slice(item.offset, item.offset + item.length);

        return `
          <li class="issue-item" data-key="${key}">
            <span class="issue-word">${escapeHtml(selectedText)}</span>
            <span class="issue-separator">—</span>
            <span class="issue-message">${escapeHtml(item.message)}</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function renderAnalysisPanel(matches) {
  const score = Math.max(0, 100 - (matches.length * 8));
  const resultBox = document.getElementById('grammarResult');

  if (!matches.length) {
    resultBox.innerHTML = `
      <div class="badge ok">Sin errores detectados</div>
      <div class="score">Puntuación estimada: ${score}/100</div>
      <div class="legend">
        El texto no presenta errores gramaticales evidentes.
      </div>
    `;
    return;
  }

  resultBox.innerHTML = `
    <div class="badge warn">Observaciones encontradas</div>
    <div class="score">Puntuación estimada: ${score}/100</div>
    ${buildIssuesList(matches)}
    <div class="legend">
      Haz clic sobre una palabra subrayada para aplicar una corrección.
    </div>
  `;
}

async function analyzeText() {
  const text = textInput.value;

  updateCounts(text, 0);

  if (!text.trim()) {
    lastMatches = [];
    renderHighlights([]);
    renderIdleState();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: 'es' })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo analizar el texto.');
    }

    lastMatches = Array.isArray(data.matches) ? data.matches : [];
    renderHighlights(lastMatches);
    updateCounts(text, lastMatches.length);
    renderAnalysisPanel(lastMatches);

  } catch (error) {
    lastMatches = [];
    renderHighlights([]);

    document.getElementById('grammarResult').innerHTML = `
      <div class="badge warn">Error de conexión</div>
      <div class="score">No se pudo consultar el motor de corrección.</div>
      <div class="legend">
        Verifica la configuración del servicio de análisis.
      </div>
    `;
  }
}

async function correctText() {
  const text = textInput.value;

  if (!text.trim()) {
    showToast('No hay texto para corregir.');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: 'es' })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo corregir el texto.');
    }

    textInput.value = data.correctedText || text;
    await analyzeText();
    showToast('Corrección aplicada.');

  } catch (error) {
    showToast(error.message || 'No se pudo corregir el texto.');
  }
}

async function copyText() {
  const text = textInput.value;

  if (!text.trim()) {
    showToast('No hay texto para copiar.');
    return;
  }

  await navigator.clipboard.writeText(text);
  showToast('Texto copiado al portapapeles.');
}

function clearText() {
  textInput.value = '';
  lastMatches = [];
  renderHighlights([]);
  updateCounts('', 0);
  renderIdleState();
}

function hideTooltip() {
  tooltip.classList.add('hidden');
}

function showToast(message) {
  const toast = document.getElementById('toast');

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

async function waitForBackend() {
  const loader = document.getElementById('bootLoader');
  const message = document.getElementById('bootMessage');
  const appRoot = document.getElementById('appRoot');

  const healthUrl = `${API_BASE}/health`;

  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {

    attempts++;

    try {

      message.textContent = attempts === 1
        ? 'Iniciando motor de corrección...'
        : `Conectando con GRAMATIA... intento ${attempts} de ${maxAttempts}.`;

      const response = await fetch(healthUrl, { method: 'GET', cache: 'no-store' });

      if (response.ok) {

        loader.style.display = 'none';
        appRoot.classList.remove('app-hidden');
        return;

      }

    } catch (_error) {}

    await new Promise(resolve => setTimeout(resolve, 3000));

  }

  message.textContent = 'No se pudo conectar con el motor de corrección. Recarga la página en unos segundos.';
}

textInput.addEventListener('scroll', syncScroll);

textInput.addEventListener('input', () => {
  renderHighlights([]);
  updateCounts(textInput.value, 0);
});

renderHighlights([]);
updateCounts('', 0);
renderIdleState();
waitForBackend();
