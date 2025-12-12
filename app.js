/* app.js - Inglês → PTBR
   dataset: data/frases.json
   TTS: en-US
   SRS (SM-2 simplificado)
   Anti-falso-positivo: overlap >=55% ou Levenshtein <=18%
   Código revisado: correções de sintaxe, validações e pequenas melhorias UX
*/

const DATA_PATH_ENG = "data/frases.json";
const STORAGE_KEY_ENG = "srs_eng_progress_v1";
const HISTORY_KEY_ENG = "srs_eng_history_v1";

let frasesEng = [];
let srsEng = {};
let currentEng = null;
let nivelAtualEng = "A1"; // adaptativo
let janelaContagemEng = 0;
let acertosJanelaEng = 0;

const todayStr = new Date().toISOString().slice(0,10);

/* DOM elements */
const elEng = {
  linha: document.getElementById("linha"),
  frase: document.getElementById("fraseEng"),
  resposta: document.getElementById("resposta"),
  resultado: document.getElementById("resultado"),
  listenBtn: document.getElementById("listenBtn"),
  checkBtn: document.getElementById("checkBtn"),
  skipBtn: document.getElementById("skipBtn"),
  due: document.getElementById("due"),
  totalCount: document.getElementById("totalCount"),
  dueCount: document.getElementById("dueCount"),
  todayCorrect: document.getElementById("todayCorrect"),
  todayWrong: document.getElementById("todayWrong"),
  dashboard: document.getElementById("dashboard"),
  historyPanel: document.getElementById("historyPanel"),
  historyList: document.getElementById("historyList"),
  closeHistory: document.getElementById("closeHistory"),
  openDashboard: document.getElementById("openDashboard"),
  toggleTheme: document.getElementById("toggleTheme"),
  exportBtn: document.getElementById("exportBtn"),
  resetBtn: document.getElementById("resetBtn"),
  downloadData: document.getElementById("downloadData")
};

/* ---------- Normalization & tolerant matching ---------- */
function normText(s){
  if(!s) return "";
  return s.toString()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[\"'.,;:!?()\-]/g,"")
    .replace(/\s+/g," ")
    .trim();
}

function levenshtein(a,b){
  const la = a.length, lb = b.length;
  if(la === 0) return lb;
  if(lb === 0) return la;
  const m = Array.from({length: la + 1}, (_, i) => new Array(lb + 1).fill(0));
  for(let i=0;i<=la;i++) m[i][0]=i;
  for(let j=0;j<=lb;j++) m[0][j]=j;
  for(let i=1;i<=la;i++){
    for(let j=1;j<=lb;j++){
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + cost);
    }
  }
  return m[la][lb];
}

function isCorrectEng(user, target){
  const a = normText(user);
  const b = normText(target);
  if(a.length === 0) return false;
  if(a === b) return true;

  const at = a.split(" ");
  const bt = b.split(" ");
  const common = at.filter(t => bt.includes(t)).length;
  const ratio = common / Math.max(bt.length,1);
  if(ratio >= 0.55) return true;

  const dist = levenshtein(a, b);
  const maxDist = Math.ceil(b.length * 0.18);
  return dist <= maxDist;
}

/* ---------- Storage & history ---------- */
function loadProgressEng(){
  const raw = localStorage.getItem(STORAGE_KEY_ENG);
  if(raw) try { srsEng = JSON.parse(raw); } catch(e){ srsEng = {}; }
}

function saveProgressEng(){
  try { localStorage.setItem(STORAGE_KEY_ENG, JSON.stringify(srsEng)); } catch(e){}
}

function loadHistoryEng(){
  const raw = localStorage.getItem(HISTORY_KEY_ENG);
  if(!raw) return [];
  try { return JSON.parse(raw); } catch(e) { return []; }
}

function pushHistoryEng(entry){
  const h = loadHistoryEng();
  h.unshift(entry);
  if(h.length > 500) h.length = 500;
  try { localStorage.setItem(HISTORY_KEY_ENG, JSON.stringify(h)); } catch(e){}
}

/* ---------- SRS initialization ---------- */
function initSrsEntryEng(linha){
  if(!srsEng[linha]){
    srsEng[linha] = {
      linha,
      reps: 0,
      ease: 2.5,
      interval: 0,
      lapses: 0,
      corrects: 0,
      wrongs: 0,
      due: todayStr
    };
  }
}

function initAllEng(){
  frasesEng.forEach(f => initSrsEntryEng(f.linha));
  saveProgressEng();
}

/* ---------- Selection & stats ---------- */
function computeDueCountEng(){
  const now = new Date().toISOString().slice(0,10);
  const due = Object.values(srsEng).filter(x => x.due <= now).length;
  if(elEng.dueCount) elEng.dueCount.textContent = due;
  if(elEng.totalCount) elEng.totalCount.textContent = frasesEng.length;
}

function pickNextEng(){
  const now = new Date().toISOString().slice(0,10);
  let candidates = frasesEng.filter(f => srsEng[f.linha] && srsEng[f.linha].due <= now);

  if(candidates.length === 0){
    candidates = frasesEng.filter(f => f.nivel === nivelAtualEng);
    if(candidates.length === 0) candidates = frasesEng.slice();
  }

  const weighted = candidates.map(f => {
    const meta = srsEng[f.linha] || {lapses:0, interval:0};
    const weight = 1 + (meta.lapses || 0) * 3 + ((meta.interval || 0) === 0 ? 2 : 0);
    return {f, weight};
  });

  const total = weighted.reduce((s,w) => s + w.weight, 0);
  let r = Math.random() * total;
  for(const w of weighted){
    r -= w.weight;
    if(r <= 0) return w.f;
  }
  return weighted[weighted.length - 1].f;
}

/* ---------- Render & TTS ---------- */
function renderCardEng(card){
  currentEng = card;
  if(elEng.linha) elEng.linha.textContent = card.linha || "—";
  if(elEng.frase) elEng.frase.textContent = card.ENG || "—";
  if(elEng.resposta) elEng.resposta.value = "";
  if(elEng.resultado) elEng.resultado.innerHTML = "";
  if(elEng.due && srsEng[card.linha]) elEng.due.textContent = srsEng[card.linha].due || "—";
}

function speakEng(text){
  if(!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/* ---------- Apply SRS ---------- */
function applySrsEng(meta, correct){
  if(correct){
    meta.reps = (meta.reps || 0) + 1;
    meta.corrects = (meta.corrects || 0) + 1;
    if(meta.reps === 1) meta.interval = 1;
    else if(meta.reps === 2) meta.interval = 3;
    else meta.interval = Math.round((meta.interval || 1) * (meta.ease || 2.5));
    meta.ease = Math.max(1.3, (meta.ease || 2.5) + 0.03);
  } else {
    meta.lapses = (meta.lapses || 0) + 1;
    meta.wrongs = (meta.wrongs || 0) + 1;
    meta.reps = 0;
    meta.interval = 0;
    meta.ease = Math.max(1.3, (meta.ease || 2.5) - 0.15);
  }
  const next = new Date();
  next.setDate(next.getDate() + (meta.interval || 0));
  meta.due = next.toISOString().slice(0,10);
  saveProgressEng();
}

/* ---------- Adaptive level controller ---------- */
function updateAdaptiveEng(correct){
  janelaContagemEng++;
  if(correct) acertosJanelaEng++;

  if(janelaContagemEng >= 12){
    const acc = acertosJanelaEng / janelaContagemEng;
    if(acc >= 0.75){
      if(nivelAtualEng === "A1") nivelAtualEng = "A2";
      else if(nivelAtualEng === "A2") nivelAtualEng = "B1";
      else if(nivelAtualEng === "B1") nivelAtualEng = "B2";
      else if(nivelAtualEng === "B2") nivelAtualEng = "C1";
    } else if(acc <= 0.35){
      if(nivelAtualEng === "C1") nivelAtualEng = "B2";
      else if(nivelAtualEng === "B2") nivelAtualEng = "B1";
      else if(nivelAtualEng === "B1") nivelAtualEng = "A2";
      else if(nivelAtualEng === "A2") nivelAtualEng = "A1";
    }
    janelaContagemEng = 0;
    acertosJanelaEng = 0;
  }
}

/* ---------- Handlers ---------- */
function handleCheckEng(){
  if(!currentEng) return;
  const user = elEng.resposta ? elEng.resposta.value.trim() : "";
  const expected = currentEng ? currentEng.PTBR : "";
  const correct = isCorrectEng(user, expected);
  const meta = srsEng[currentEng.linha] || {};
  applySrsEng(meta, correct);

  pushHistoryEng({
    time: new Date().toISOString(),
    linha: currentEng.linha,
    ENG: currentEng.ENG,
    PTBR: expected,
    answer: user,
    correct: correct,
    nivel: currentEng.nivel
  });

  updateAdaptiveEng(correct);

  if(elEng.resultado){
    if(correct){
      elEng.resultado.innerHTML = `<div class="ok">✅ Correto<br><small>${expected}</small></div>`;
    } else {
      elEng.resultado.innerHTML = `<div class="bad">❌ Incorreto<br><strong>${expected}</strong></div>`;
    }
  }

  renderStatsEng();
}

function handleSkipEng(){
  if(!currentEng) return;
  const meta = srsEng[currentEng.linha] || {};
  applySrsEng(meta, false);
  pushHistoryEng({
    time: new Date().toISOString(),
    linha: currentEng.linha,
    ENG: currentEng.ENG,
    PTBR: currentEng.PTBR,
    skipped: true,
    correct: false,
    nivel: currentEng.nivel
  });
  renderStatsEng();
  nextCardEng();
}

function nextCardEng(){
  if(frasesEng.length === 0) return;
  const card = pickNextEng();
  renderCardEng(card);
}

/* ---------- Stats / History UI ---------- */
function renderStatsEng(){
  computeDueCountEng();
  const history = loadHistoryEng();
  const t = new Date().toISOString().slice(0,10);
  if(elEng.todayCorrect) elEng.todayCorrect.textContent = history.filter(h => h.time && h.time.slice(0,10) === t && h.correct).length;
  if(elEng.todayWrong) elEng.todayWrong.textContent = history.filter(h => h.time && h.time.slice(0,10) === t && !h.correct).length;
}

function renderHistoryEng(){
  const h = loadHistoryEng();
  if(!elEng.historyList) return;
  elEng.historyList.innerHTML = "";
  h.slice(0,200).forEach(item => {
    const li = document.createElement("li");
    li.innerHTML = `<small>${item.time}</small> — <strong>#${item.linha}</strong> — "${item.ENG}" — ${item.correct ? "<span style='color:green'>✔</span>" : "<span style='color:red'>✖</span>"}`;
    elEng.historyList.appendChild(li);
  });
}

/* ---------- Theme, export, reset ---------- */
function tryLoadThemeEng(){
  const t = localStorage.getItem("ui_theme");
  if(t) document.documentElement.setAttribute("data-theme", t);
  else {
    const prefers = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefers ? "dark" : "light");
  }
}

function exportSrsEng(){
  const blob = new Blob([JSON.stringify(srsEng, null, 2)], {type: "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "srs_eng_export.json";
  a.click();
  setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
}

function resetProgressEng(){
  if(!confirm("Resetar todo o progresso do treino de Inglês?")) return;
  localStorage.removeItem(STORAGE_KEY_ENG);
  localStorage.removeItem(HISTORY_KEY_ENG);
  srsEng = {};
  initAllEng();
  renderStatsEng();
  nextCardEng();
}

/* ---------- Events binding ---------- */
if(elEng.listenBtn) elEng.listenBtn.addEventListener("click", ()=> speakEng(currentEng ? currentEng.ENG : ""));
if(elEng.checkBtn) elEng.checkBtn.addEventListener("click", handleCheckEng);
if(elEng.skipBtn) elEng.skipBtn.addEventListener("click", handleSkipEng);
if(elEng.openDashboard) elEng.openDashboard.addEventListener("click", ()=> {
  if(elEng.dashboard) elEng.dashboard.classList.toggle("hidden");
  renderStatsEng();
});
if(elEng.closeHistory) elEng.closeHistory.addEventListener("click", ()=> {
  if(elEng.historyPanel) elEng.historyPanel.classList.add("hidden");
});
if(elEng.toggleTheme) elEng.toggleTheme.addEventListener("click", ()=> {
  const root = document.documentElement;
  const cur = root.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("ui_theme", next);
});
if(elEng.exportBtn) elEng.exportBtn.addEventListener("click", exportSrsEng);
if(elEng.resetBtn) elEng.resetBtn.addEventListener("click", resetProgressEng);
if(elEng.downloadData) elEng.downloadData.addEventListener("click", ()=>{
  const data = { srs: srsEng, history: loadHistoryEng() };
  const blob = new Blob([JSON.stringify(data,null,2)], {type: "application/json"});
  elEng.downloadData.href = URL.createObjectURL(blob);
});

/* ---------- Boot ---------- */
async function bootEng(){
  try {
    const resp = await fetch(DATA_PATH_ENG);
    if(!resp.ok) throw new Error("fetch failed");
    frasesEng = await resp.json();
  } catch(e){
    if(elEng.frase) elEng.frase.textContent = "Erro ao carregar dataset (data/frases.json)";
    return;
  }

  loadProgressEng();
  initAllEng();
  renderStatsEng();
  tryLoadThemeEng();
  nextCardEng();
}

bootEng();
