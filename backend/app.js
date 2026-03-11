const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 10000;
const LANGUAGETOOL_URL = process.env.LANGUAGETOOL_URL || 'https://api.languagetool.org/v2/check';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

function normalizeLanguage(value) {
  const lang = String(value || 'es').toLowerCase();
  if (['es', 'es-mx', 'es_es', 'es-es', 'es_ar', 'es-co', 'es-cl', 'es-pe'].includes(lang)) {
    return 'es';
  }
  return 'es';
}

function buildRequestBody(text, language = 'es') {
  const params = new URLSearchParams();
  params.set('text', text);
  params.set('language', normalizeLanguage(language));
  return params;
}

function mapMatch(match) {
  return {
    message: match.message || 'Posible error detectado.',
    shortMessage: match.shortMessage || '',
    offset: Number(match.offset || 0),
    length: Number(match.length || 0),
    sentence: match.context?.text || '',
    context: {
      text: match.context?.text || '',
      offset: Number(match.context?.offset || 0),
      length: Number(match.context?.length || 0)
    },
    rule: {
      id: match.rule?.id || '',
      description: match.rule?.description || '',
      category: match.rule?.category?.name || '',
      issueType: match.rule?.issueType || ''
    },
    replacements: Array.isArray(match.replacements)
      ? match.replacements.slice(0, 8).map(item => item.value).filter(Boolean)
      : []
  };
}

function applyCorrections(text, matches) {
  if (!Array.isArray(matches) || matches.length === 0) return text;

  const sorted = [...matches]
    .filter(match => typeof match.offset === 'number' && typeof match.length === 'number')
    .filter(match => Array.isArray(match.replacements) && match.replacements.length > 0)
    .sort((a, b) => b.offset - a.offset);

  let corrected = text;

  for (const match of sorted) {
    const replacement = match.replacements[0];
    corrected =
      corrected.slice(0, match.offset) +
      replacement +
      corrected.slice(match.offset + match.length);
  }

  return corrected;
}

function classifySummary(matches) {
  const summary = {
    total: matches.length,
    spelling: 0,
    grammar: 0,
    punctuation: 0,
    style: 0,
    other: 0
  };

  for (const match of matches) {
    const issueType = String(match.rule?.issueType || '').toLowerCase();
    const category = String(match.rule?.category?.name || '').toLowerCase();

    if (issueType.includes('misspelling') || category.includes('ortograf')) {
      summary.spelling += 1;
    } else if (issueType.includes('typographical') || category.includes('puntu')) {
      summary.punctuation += 1;
    } else if (issueType.includes('grammar') || category.includes('gram')) {
      summary.grammar += 1;
    } else if (issueType.includes('style') || category.includes('estilo')) {
      summary.style += 1;
    } else {
      summary.other += 1;
    }
  }

  return summary;
}

async function requestLanguageTool(text, language) {
  const body = buildRequestBody(text, language);

  const response = await fetch(LANGUAGETOOL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LanguageTool respondió con ${response.status}: ${errorText}`);
  }

  return response.json();
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'Corrector backend activo'
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'corrector-backend',
    languagetool_url: LANGUAGETOOL_URL
  });
});

app.post('/api/check', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const language = normalizeLanguage(req.body?.language);

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: 'Debes enviar un texto para analizar.'
      });
    }

    const data = await requestLanguageTool(text, language);
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const mappedMatches = matches.map(mapMatch);
    const correctedText = applyCorrections(text, mappedMatches);
    const summary = classifySummary(matches);

    return res.json({
      ok: true,
      language,
      text,
      correctedText,
      summary,
      matches: mappedMatches
    });
  } catch (error) {
    console.error('Error en /api/check:', error.message);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo analizar el texto en este momento.',
      details: error.message
    });
  }
});

app.post('/api/correct', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const language = normalizeLanguage(req.body?.language);

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: 'Debes enviar un texto para corregir.'
      });
    }

    const data = await requestLanguageTool(text, language);
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const mappedMatches = matches.map(mapMatch);
    const correctedText = applyCorrections(text, mappedMatches);
    const summary = classifySummary(matches);

    return res.json({
      ok: true,
      language,
      originalText: text,
      correctedText,
      summary,
      matches: mappedMatches
    });
  } catch (error) {
    console.error('Error en /api/correct:', error.message);

    return res.status(500).json({
      ok: false,
      error: 'No se pudo corregir el texto en este momento.',
      details: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor activo en puerto ${PORT}`);
  console.log(`Conectado a LanguageTool en ${LANGUAGETOOL_URL}`);
});