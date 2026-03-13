const API_BASE = window.CORRECTOR_API_BASE || '';

const textInput = document.getElementById('textInput');
const highlights = document.getElementById('highlights');

let lastMatches = [];
let activeMatchKey = null;
let toastTimer = null;

const tooltip = document.createElement('div');
tooltip.id = 'suggestionTooltip';
tooltip.className = 'suggestion-tooltip hidden';
document.body.appendChild(tooltip);

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function countWords(text) {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

function countLetters(text) {
  const letters = text.match(/[A-Za-zÁÉÍÓÚáéíóúÜüÑñ]/g);
  return letters ? letters.length : 0;
}

function syncScroll() {
  highlights.scrollTop = textInput.scrollTop;
  highlights.scrollLeft = textInput.scrollLeft;
}

function updateCounts(text, issues = 0) {
  document.getElementById("wordCount").textContent = countWords(text);
  document.getElementById("letterCount").textContent = countLetters(text);
  document.getElementById("charCount").textContent = text.length;
  document.getElementById("issueCount").textContent = issues;
}

function getMatchKey(match) {
  return `${match.offset}-${match.length}`;
}

function renderHighlights(matches) {

  const text = textInput.value;

  if (!text) {
    highlights.innerHTML = "";
    return;
  }

  if (!matches.length) {
    highlights.innerHTML = escapeHtml(text);
    syncScroll();
    return;
  }

  const ordered = [...matches].sort((a,b)=>a.offset-b.offset);

  let result = "";
  let lastIndex = 0;

  ordered.forEach(match=>{

    const key = getMatchKey(match);
    const active = activeMatchKey === key ? " active-error" : "";

    result += escapeHtml(text.slice(lastIndex,match.offset));

    result += `<mark class="error-mark${active}"
      data-offset="${match.offset}"
      data-length="${match.length}"
      data-key="${key}">
      ${escapeHtml(text.slice(match.offset,match.offset+match.length))}
    </mark>`;

    lastIndex = match.offset + match.length;

  });

  result += escapeHtml(text.slice(lastIndex));

  highlights.innerHTML = result;

  syncScroll();

}

function renderIdleState(){

  document.getElementById("grammarResult").innerHTML = `
  <div class="badge warn">Esperando análisis</div>
  <div class="score">Puntuación estimada: --/100</div>
  <div class="legend">
  Presiona <strong>Analizar</strong> para revisar ortografía,
  gramática, acentuación y puntuación.
  </div>`;

}

function buildIssuesList(matches){

  if(!matches.length) return "";

  return `<ul class="issues">
  ${matches.slice(0,12).map(item=>{

    const key = getMatchKey(item);
    const word = textInput.value.slice(item.offset,item.offset+item.length);

    return `<li class="issue-item" data-key="${key}">
      <span class="issue-word">${escapeHtml(word)}</span>
      <span class="issue-separator">—</span>
      <span class="issue-message">${escapeHtml(item.message)}</span>
    </li>`;

  }).join("")}
  </ul>`;

}

function renderAnalysisPanel(matches){

  const score = Math.max(0,100-(matches.length*8));

  const box = document.getElementById("grammarResult");

  if(!matches.length){

    box.innerHTML = `
    <div class="badge ok">Sin errores detectados</div>
    <div class="score">Puntuación estimada: ${score}/100</div>
    <div class="legend">
    El texto no presenta errores gramaticales evidentes.
    </div>`;
    return;
  }

  box.innerHTML = `
  <div class="badge warn">Observaciones encontradas</div>
  <div class="score">Puntuación estimada: ${score}/100</div>
  ${buildIssuesList(matches)}
  <div class="legend">
  Haz clic en una palabra subrayada para corregirla.
  </div>`;

}

async function analyzeText(){

  const text = textInput.value;

  updateCounts(text,0);

  if(!text.trim()){

    lastMatches=[];
    renderHighlights([]);
    renderIdleState();
    return;

  }

  try{

    const response = await fetch(`${API_BASE}/api/check`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text,language:"es"})
    });

    const data = await response.json();

    if(!response.ok) throw new Error();

    lastMatches = data.matches || [];

    renderHighlights(lastMatches);

    updateCounts(text,lastMatches.length);

    renderAnalysisPanel(lastMatches);

  }
  catch{

    renderHighlights([]);

    document.getElementById("grammarResult").innerHTML = `
    <div class="badge warn">Error de conexión</div>
    <div class="legend">
    No se pudo contactar con el motor de corrección.
    </div>`;

  }

}

async function correctText(){

  const text = textInput.value;

  if(!text.trim()){
    showToast("No hay texto para corregir");
    return;
  }

  try{

    const response = await fetch(`${API_BASE}/api/correct`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text,language:"es"})
    });

    const data = await response.json();

    textInput.value = data.correctedText || text;

    await analyzeText();

    showToast("Corrección aplicada");

  }
  catch{

    showToast("No se pudo corregir el texto");

  }

}

async function copyText(){

  const text = textInput.value;

  if(!text.trim()){
    showToast("No hay texto para copiar");
    return;
  }

  await navigator.clipboard.writeText(text);

  showToast("Texto copiado");

}

function clearText(){

  textInput.value="";

  lastMatches=[];

  renderHighlights([]);

  updateCounts("",0);

  renderIdleState();

}

function hideTooltip(){

  tooltip.classList.add("hidden");

  tooltip.innerHTML="";

}

function showTooltip(match,anchor){

  const rect = anchor.getBoundingClientRect();

  const suggestions = match.replacements || [];

  const word = textInput.value.slice(match.offset,match.offset+match.length);

  tooltip.innerHTML=`
  <div class="tooltip-header">
  <div class="tooltip-title">${escapeHtml(word)}</div>
  </div>
  <div class="tooltip-actions">
  ${suggestions.slice(0,6).map((s,i)=>`
  <button class="tooltip-suggestion" data-index="${i}">
  ${escapeHtml(s)}
  </button>`).join("")}
  </div>`;

  tooltip.classList.remove("hidden");

  const top = rect.bottom + window.scrollY + 6;
  const left = rect.left + window.scrollX;

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;

  tooltip.querySelectorAll(".tooltip-suggestion")
  .forEach((btn,i)=>{

    btn.onclick = async ()=>{

      const replacement = suggestions[i];

      const text = textInput.value;

      textInput.value =
      text.slice(0,match.offset)
      + replacement +
      text.slice(match.offset+match.length);

      hideTooltip();

      await analyzeText();

    };

  });

}

highlights.addEventListener("click",(e)=>{

  const mark = e.target.closest("mark");

  if(!mark) return;

  const offset = Number(mark.dataset.offset);
  const length = Number(mark.dataset.length);

  const match = lastMatches.find(m=>m.offset===offset && m.length===length);

  if(!match) return;

  showTooltip(match,mark);

});

textInput.addEventListener("scroll",syncScroll);

textInput.addEventListener("input",()=>{

  renderHighlights([]);

  updateCounts(textInput.value,0);

});

function showToast(msg){

  const toast = document.getElementById("toast");

  toast.textContent = msg;

  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(()=>{
    toast.classList.remove("show");
  },2000);

}

async function waitForBackend(){

  const loader = document.getElementById("bootLoader");
  const message = document.getElementById("bootMessage");
  const app = document.getElementById("appRoot");

  let attempts=0;

  while(attempts<20){

    attempts++;

    try{

      message.textContent = "Iniciando motor de corrección...";

      const r = await fetch(`${API_BASE}/health`);

      if(r.ok){

        loader.style.display="none";

        app.classList.remove("app-hidden");

        return;

      }

    }
    catch{}

    await new Promise(r=>setTimeout(r,3000));

  }

  message.textContent="No se pudo iniciar el motor de corrección.";

}

renderHighlights([]);

updateCounts("",0);

renderIdleState();

waitForBackend();
