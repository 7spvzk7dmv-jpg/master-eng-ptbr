/* app_eng.js – Corrigido
   Ajustes:
   – ID correto: feedback
   – Mostrar SEMPRE a tradução antes do SRS
   – Corrigido erro de sintaxe HTML
   – Não sobrescreve tradução
*/

const DATA_PATH_ENG = "data/frases.json";
const STORAGE_KEY_ENG = "srs_eng_progress_v1";
const HISTORY_KEY_ENG = "srs_eng_history_v1";

let frasesEng = [];
let srsEng = {};
let currentEng = null;

let nivelAtualEng = "A1"; 
let janelaContagemEng = 0;
let acertosJanelaEng = 0;
const todayStr = new Date().toISOString().slice(0,10);

/* DOM */
const elEng = {
    linha: document.getElementById("linha"),
    frase: document.getElementById("fraseEng"),
    resposta: document.getElementById("resposta"),
    resultado: document.getElementById("feedback"),   // <-- CORRIGIDO
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

/* Normalização */
function normText(s){
    if(!s) return "";
    return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/[\"'.,;:!?()\-]/g,"")
        .replace(/\s+/g," ")
        .trim();
}

function levenshtein(a,b){
    const m = [];
    for(let i=0;i<=a.length;i++) m[i]=[i];
    for(let j=0;j<=b.length;j++) m[0][j]=j;
    for(let i=1;i<=a.length;i++){
        for(let j=1;j<=b.length;j++){
            const cost = a[i-1]===b[j-1]?0:1;
            m[i][j] = Math.min(
                m[i-1][j]+1,
                m[i][j-1]+1,
                m[i-1][j-1]+cost
            );
        }
    }
    return m[a.length][b.length];
}

function isCorrectEng(user, target){
    const a = normText(user);
    const b = normText(target);
    if(a.length===0) return false;
    if(a === b) return true;

    const at = a.split(" ");
    const bt = b.split(" ");
    const common = at.filter(t => bt.includes(t)).length;
    if(common / bt.length >= 0.55) return true;

    const dist = levenshtein(a,b);
    return dist <= Math.ceil(b.length * 0.18);
}

/* Storage */
function loadProgressEng(){
    const raw = localStorage.getItem(STORAGE_KEY_ENG);
    if(raw) try { srsEng = JSON.parse(raw); } catch(e){}
}
function saveProgressEng(){
    localStorage.setItem(STORAGE_KEY_ENG, JSON.stringify(srsEng));
}

function loadHistoryEng(){
    const raw = localStorage.getItem(HISTORY_KEY_ENG);
    if(!raw) return [];
    try { return JSON.parse(raw); } catch(e){ return []; }
}
function pushHistoryEng(entry){
    const h = loadHistoryEng();
    h.unshift(entry);
    if(h.length > 500) h.length = 500;
    localStorage.setItem(HISTORY_KEY_ENG, JSON.stringify(h));
}

/* SRS */
function initSrsEntryEng(linha){
    if(!srsEng[linha]){
        srsEng[linha] = {
            linha, reps:0, ease:2.5, interval:0, lapses:0, corrects:0, wrongs:0, due: todayStr
        };
    }
}

function initAllEng(){
    frasesEng.forEach(f => initSrsEntryEng(f.linha));
    saveProgressEng();
}

function computeDueCountEng(){
    const now = new Date().toISOString().slice(0,10);
    const due = Object.values(srsEng).filter(x => x.due <= now).length;
    if(elEng.dueCount) elEng.dueCount.textContent = due;
    if(elEng.totalCount) elEng.totalCount.textContent = frasesEng.length;
}

function pickNextEng(){
    const now = new Date().toISOString().slice(0,10);
    let candidates = frasesEng.filter(f => srsEng[f.linha].due <= now);
    if(!candidates.length){
        candidates = frasesEng.filter(f => f.nivel === nivelAtualEng);
        if(!candidates.length) candidates = frasesEng.slice();
    }
    const weighted = candidates.map(f => {
        const meta = srsEng[f.linha];
        return { f, weight: 1 + meta.lapses*3 + (meta.interval===0?2:0) };
    });
    const total = weighted.reduce((s,w)=>s+w.weight,0);
    let r = Math.random()*total;
    for(const w of weighted){
        r -= w.weight;
        if(r <= 0) return w.f;
    }
    return weighted[candidates.length-1].f;
}

/* Render */
function renderCardEng(card){
    currentEng = card;
    elEng.linha.textContent = card.linha;
    elEng.frase.textContent = card.ENG;
    elEng.resposta.value = "";
    elEng.resultado.innerHTML = "";
    elEng.due.textContent = srsEng[card.linha].due;
}

function speakEng(text){
    if(!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
}

/* SRS apply */
function applySrsEng(meta, correct){
    if(correct){
        meta.reps++;
        meta.corrects++;
        if(meta.reps===1) meta.interval = 1;
        else if(meta.reps===2) meta.interval = 3;
        else meta.interval = Math.round(meta.interval * meta.ease);
        meta.ease = Math.max(1.3, meta.ease + 0.03);
    } else {
        meta.lapses++;
        meta.wrongs++;
        meta.reps = 0;
        meta.interval = 0;
        meta.ease = Math.max(1.3, meta.ease - 0.15);
    }
    const next = new Date();
    next.setDate(next.getDate() + meta.interval);
    meta.due = next.toISOString().slice(0,10);
    saveProgressEng();
}

/* Adaptive */
function updateAdaptiveEng(correct){
    janelaContagemEng++;
    if(correct) acertosJanelaEng++;
    if(janelaContagemEng >= 12){
        const acc = acertosJanelaEng / janelaContagemEng;
        if(acc >= 0.75){
            if(nivelAtualEng==="A1") nivelAtualEng="A2";
            else if(nivelAtualEng==="A2") nivelAtualEng="B1";
            else if(nivelAtualEng==="B1") nivelAtualEng="B2";
            else if(nivelAtualEng==="B2") nivelAtualEng="C1";
        } else if(acc <= 0.35){
            if(nivelAtualEng==="C1") nivelAtualEng="B2";
            else if(nivelAtualEng==="B2") nivelAtualEng="B1";
            else if(nivelAtualEng==="B1") nivelAtualEng="A2";
            else if(nivelAtualEng==="A2") nivelAtualEng="A1";
        }
        janelaContagemEng = 0;
        acertosJanelaEng = 0;
    }
}

/* EXIBIR SEMPRE A TRADUÇÃO – NOVO */
function mostrarTraducaoEng(pt){
    elEng.resultado.innerHTML = `
        <div>
            <strong>📘 Tradução:</strong><br>${pt}
        </div>
    `;
}

/* -------- HANDLERS -------- */
function handleCheckEng(){
    const user = elEng.resposta.value.trim();
    const expected = currentEng.PTBR;

    /* Mostrar tradução SEMPRE */
    mostrarTraducaoEng(expected);

    const correct = isCorrectEng(user, expected);
    const meta = srsEng[currentEng.linha];

    applySrsEng(meta, correct);
    updateAdaptiveEng(correct);

    /* Acrescentar acerto/erro sem apagar a tradução */
    elEng.resultado.innerHTML += correct
        ? `<div class="ok">✅ Correto</div>`
        : `<div class="bad">❌ Incorreto</div>`;

    pushHistoryEng({
        time: new Date().toISOString(),
        linha: currentEng.linha,
        ENG: currentEng.ENG,
        PTBR: expected,
        answer: user,
        correct: correct,
        nivel: currentEng.nivel
    });

    renderStatsEng();
}

function handleSkipEng(){
    const meta = srsEng[currentEng.linha];
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
    nextCardEng();
}

/* Stats */
function renderStatsEng(){
    computeDueCountEng();
    const h = loadHistoryEng();
    const t = todayStr;
    elEng.todayCorrect.textContent = h.filter(x=>x.time?.slice(0,10)===t && x.correct).length;
    elEng.todayWrong.textContent = h.filter(x=>x.time?.slice(0,10)===t && !x.correct).length;
}

/* Boot */
async function bootEng(){
    try {
        frasesEng = await fetch(DATA_PATH_ENG).then(r => r.json());
    } catch(e){
        elEng.frase.textContent = "Erro ao carregar dataset";
        return;
    }
    loadProgressEng();
    initAllEng();
    renderStatsEng();
    nextCardEng();
}

bootEng();

/* Buttons */
elEng.listenBtn.addEventListener("click",()=> speakEng(currentEng.ENG));
elEng.checkBtn.addEventListener("click",handleCheckEng);
elEng.skipBtn.addEventListener("click",handleSkipEng);
