const API_BASE = window.CORRECTOR_API_BASE || '';
    const textInput = document.getElementById('textInput');
    const highlights = document.getElementById('highlights');
    let lastMatches = [];

    function escapeHtml(text) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      if (issueCount !== null) document.getElementById('issueCount').textContent = issueCount;
    }

    function renderHighlights(matches) {
      const text = textInput.value;
      if (!text) { highlights.innerHTML = ''; return; }
      if (!matches.length) { highlights.innerHTML = escapeHtml(text) + '\n'; return; }

      const ordered = [...matches].sort((a, b) => a.offset - b.offset);
      let result = '';
      let lastIndex = 0;

      ordered.forEach(match => {
        result += escapeHtml(text.slice(lastIndex, match.offset));
        result += `<mark data-offset="${match.offset}" data-length="${match.length}">${escapeHtml(text.slice(match.offset, match.offset + match.length))}</mark>`;
        lastIndex = match.offset + match.length;
      });

      result += escapeHtml(text.slice(lastIndex));
      highlights.innerHTML = result + '\n';
      syncScroll();
    }

    function renderIdleState() {
      document.getElementById('grammarResult').innerHTML = `
        <div class="badge warn">Esperando análisis</div>
        <div class="score">Puntuación estimada: --/100</div>
        <div class="legend">Presiona <strong>Analizar</strong> para revisar faltas de ortografía, acentuación, gramática y puntuación.</div>
      `;
    }

    function summarizeList(matches) {
      return matches.slice(0, 8).map(item => `<li>${escapeHtml(item.message || 'Posible error detectado.')}</li>`).join('');
    }

    async function analyzeText() {
      const text = textInput.value;
      updateCounts(text, 0);

      if (!text.trim()) {
        lastMatches = [];
        renderHighlights([]);
        document.getElementById('grammarResult').innerHTML = `
          <div class="badge warn">No hay texto para analizar</div>
          <div class="score">Puntuación estimada: 0/100</div>
          <div class="legend">Pega o escribe contenido en el editor.</div>
        `;
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

        const score = Math.max(0, 100 - (lastMatches.length * 8));
        const resultBox = document.getElementById('grammarResult');

        if (!lastMatches.length) {
          resultBox.innerHTML = `
            <div class="badge ok">Sin errores detectados</div>
            <div class="score">Puntuación estimada: ${score}/100</div>
            <div class="legend">No se detectaron faltas con el análisis actual.</div>
          `;
          return;
        }

        resultBox.innerHTML = `
          <div class="badge warn">Se encontraron observaciones</div>
          <div class="score">Puntuación estimada: ${score}/100</div>
          <ul class="issues">${summarizeList(lastMatches)}</ul>
          <div class="legend">Haz clic sobre una palabra subrayada para ver y aplicar una sugerencia.</div>
        `;
      } catch (error) {
        lastMatches = [];
        renderHighlights([]);
        document.getElementById('grammarResult').innerHTML = `
          <div class="badge warn">Error de conexión</div>
          <div class="score">No se pudo consultar el corrector.</div>
          <div class="legend">${escapeHtml(error.message || 'Revisa config.js o tu backend en Render.')}</div>
        `;
      }
    }

    async function correctText() {
      const text = textInput.value;
      if (!text.trim()) { showToast('No hay texto para corregir.'); return; }

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
        showToast('Texto corregido.');
      } catch (error) {
        showToast(error.message || 'No se pudo corregir el texto.');
      }
    }

    async function copyText() {
      const text = textInput.value;
      if (!text.trim()) { showToast('No hay texto para copiar.'); return; }

      try {
        await navigator.clipboard.writeText(text);
        showToast('Texto copiado al portapapeles.');
      } catch (_error) {
        const helper = document.createElement('textarea');
        helper.value = text;
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
        showToast('Texto copiado al portapapeles.');
      }
    }

    function clearText() {
      textInput.value = '';
      lastMatches = [];
      renderHighlights([]);
      updateCounts('', 0);
      renderIdleState();
    }

    function showSuggestion(match) {
      const selectedText = textInput.value.slice(match.offset, match.offset + match.length);
      const primary = Array.isArray(match.replacements) && match.replacements.length ? match.replacements[0] : '';
      const resultBox = document.getElementById('grammarResult');

      resultBox.innerHTML = `
        <div class="badge warn">Sugerencia encontrada</div>
        <div class="score"><strong>Texto detectado:</strong> ${escapeHtml(selectedText)}</div>
        <div class="score"><strong>Sugerencia:</strong> ${escapeHtml(primary || 'Sin sugerencia disponible')}</div>
        <div class="legend" style="margin-bottom:12px;">${escapeHtml(match.message || 'Posible error detectado.')}</div>
        ${primary ? '<button class="btn-success" id="applySuggestionBtn">Aplicar corrección</button>' : ''}
      `;

      if (primary) {
        document.getElementById('applySuggestionBtn').addEventListener('click', () => {
          const current = textInput.value;
          textInput.value = current.slice(0, match.offset) + primary + current.slice(match.offset + match.length);
          analyzeText();
          showToast('Corrección aplicada.');
        }, { once: true });
      }
    }

    textInput.addEventListener('scroll', syncScroll);
    textInput.addEventListener('input', () => {
      renderHighlights([]);
      updateCounts(textInput.value, 0);
    });

    highlights.addEventListener('click', (event) => {
      const mark = event.target.closest('mark');
      if (!mark) return;
      const offset = Number(mark.dataset.offset);
      const length = Number(mark.dataset.length);
      const match = lastMatches.find(item => item.offset === offset && item.length === length);
      if (match) showSuggestion(match);
    });

    let toastTimer;
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    async function waitForBackend() {
      const loader = document.getElementById('bootLoader');
      const message = document.getElementById('bootMessage');
      const appRoot = document.getElementById('appRoot');
      const healthUrl = `${API_BASE}/health`;

      let attempts = 0;
      const maxAttempts = 20;

      while (attempts < maxAttempts) {
        attempts += 1;
        try {
          message.textContent = attempts === 1
            ? 'Estamos despertando el servidor. Esto puede tardar unos segundos.'
            : `Conectando con el backend... intento ${attempts} de ${maxAttempts}.`;

          const response = await fetch(healthUrl, { method: 'GET', cache: 'no-store' });
          if (response.ok) {
            loader.style.display = 'none';
            appRoot.classList.remove('app-hidden');
            return;
          }
        } catch (_error) {}

        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      message.textContent = 'No se pudo conectar con el backend en este momento. Recarga la página en unos segundos.';
    }

    renderHighlights([]);
    updateCounts('', 0);
    renderIdleState();
    waitForBackend();
