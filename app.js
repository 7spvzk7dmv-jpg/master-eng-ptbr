/* ============================================================
   APP.JS — SISTEMA COMPLETO SRS + FILA INTELIGENTE + HISTÓRICO
   VERSÃO: FINAL
   ============================================================ */

const DATA_PATH = "data/frases.json";
const STORAGE_KEY = "srs_progress_v1";
const HISTORY_KEY = "srs_history_v1";

let frases = [];
let srs = {};
let current = null;

const today = new Date().toISOString().slice(0,10);

const el = {
    linha: document.getElementById("linha"),
    fraseEng: document.getElementById("fraseEng"),
    resposta: document.getElementById("resposta"),
    feedback: document.getElementById("feedback"),
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
    toggleTheme: document.getElementById("toggleTheme")
};

/* ============================================================
   FUNÇÕES DE NORMALIZAÇÃO E CORREÇÃO TOLERANTE
   ============================================================ */

function norm(s) {
    return s
        .toLowerCase()
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .replace(/[\"'`.,;:!?()\-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function levenshtein(a, b) {
    const m = [];
    for (let i = 0; i <= a.length; i++) m[i] = [i];
    for (let j = 0; j <= b.length; j++) m[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            m[i][j] = Math.min(
                m[i - 1][j] + 1,
                m[i][j - 1] + 1,
                m[i - 1][j - 1] + cost
            );
        }
    }
    return m[a.length][b.length];
}

function isCorrect(user, target) {
    const a = norm(user);
    const b = norm(target);

    if (a.length === 0) return false;
    if (a === b) return true;

    // TOKEN OVERLAP ≥ 40%
    const at = a.split(" ");
    const bt = b.split(" ");
    const common = at.filter(t => bt.includes(t)).length;
    const ratio = common / Math.max(bt.length, 1);

    if (ratio >= 0.40) return true;

    // LEVENSHTEIN ≤ 30% de diferença
    const dist = levenshtein(a, b);
    const maxDist = Math.ceil(b.length * 0.30);
    return dist <= maxDist;
}
/* ============================================================
   CARREGAMENTO, HISTÓRICO E PROGRESSO
   ============================================================ */

function loadJSON(path){
    return fetch(path).then(r => r.json());
}

function loadProgress(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) srs = JSON.parse(raw);
}

function saveProgress(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(srs));
}

function loadHistory(){
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    try { 
        return JSON.parse(raw); 
    } catch (e){
        return [];
    }
}

function pushHistory(entry){
    const h = loadHistory();
    h.unshift(entry);
    if (h.length > 300) h.length = 300;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

/* ============================================================
   INICIALIZAÇÃO DO SRS
   ============================================================ */

function initSRS(linha){
    if (!srs[linha]) {
        srs[linha] = {
            linha,
            interval: 0,
            ease: 2.5,
            reps: 0,
            lapses: 0,
            due: today,
            corrects: 0,
            wrongs: 0,
            lastAnswer: null
        };
    }
}

function initAll(){
    frases.forEach(f => initSRS(f.linha));
    saveProgress();
}

/* ============================================================
   CONTAGEM E SELEÇÃO DE CARTÕES
   ============================================================ */

function computeDueCount(){
    const now = new Date().toISOString().slice(0,10);
    const due = Object.values(srs).filter(x => x.due <= now).length;
    el.dueCount.textContent = due;
    el.totalCount.textContent = frases.length;
}

function pickNext(){
    const now = new Date().toISOString().slice(0,10);

    // Seleciona todos os cartões vencidos
    let due = frases.filter(f => srs[f.linha].due <= now);

    // Se nenhum estiver vencido, retorna o mais próximo de vencer
    if (due.length === 0){
        return frases.slice().sort((a,b)=>
            new Date(srs[a.linha].due) - new Date(srs[b.linha].due)
        )[0];
    }

    // FILA INTELIGENTE — pesos dinâmicos
    const weighted = due.map(f => {
        const meta = srs[f.linha];
        const weight = 1 
            + meta.lapses * 3     // frases com mais erros aparecem mais
            + (meta.interval === 0 ? 2 : 0);   // frases novas têm prioridade
        return { f, weight };
    });

    const total = weighted.reduce((s,w) => s + w.weight, 0);
    let r = Math.random() * total;

    for (const w of weighted){
        r -= w.weight;
        if (r <= 0) return w.f;
    }

    return weighted[weighted.length - 1].f;
}
/* ============================================================
   RENDERIZAÇÃO DO CARTÃO E FUNÇÕES DE FALA
   ============================================================ */

function renderCard(card){
    current = card;
    el.linha.textContent = card.linha;
    el.fraseEng.textContent = card.ENG;
    el.resposta.value = "";
    el.feedback.innerHTML = "";
    el.due.textContent = srs[card.linha].due;
}

function speak(text){
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
}

/* ============================================================
   ALGORITMO SRS (VERSÃO MELHORADA)
   ============================================================ */

function applySRS(meta, correct){
    if (correct){
        meta.reps += 1;
        meta.corrects++;

        if (meta.reps === 1) meta.interval = 1;
        else if (meta.reps === 2) meta.interval = 3;
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
    meta.lastAnswer = new Date().toISOString();
}

/* ============================================================
   FEEDBACK AO USUÁRIO
   ============================================================ */

function showFeedback(correct, expected){
    if (correct){
        el.feedback.innerHTML = `
            <div class='ok'>
                ✅ Correto!<br>
                <small>${expected}</small>
            </div>`;
    } else {
        el.feedback.innerHTML = `
            <div class='bad'>
                ❌ Incorreto.<br>
                <strong>${expected}</strong>
            </div>`;
    }
}
/* ============================================================
   AÇÕES DO USUÁRIO: CHECK, SKIP, NEXT CARD
   ============================================================ */

function handleCheck(){
    const ans = el.resposta.value.trim();
    const expected = current.PTBR;
    const correct = isCorrect(ans, expected);

    const meta = srs[current.linha];

    applySRS(meta, correct);

    pushHistory({
        linha: current.linha,
        eng: current.ENG,
        user: ans,
        correct,
        ptbr: expected,
        time: new Date().toISOString()
    });

    saveProgress();
    renderStats();
    showFeedback(correct, expected);
}

function handleSkip(){
    const meta = srs[current.linha];

    applySRS(meta, false);

    pushHistory({
        linha: current.linha,
        eng: current.ENG,
        skipped: true,
        correct: false,
        ptbr: current.PTBR,
        time: new Date().toISOString()
    });

    saveProgress();
    renderStats();
    nextCard();
}

function nextCard(){
    const card = pickNext();
    renderCard(card);
}

/* ============================================================
   ESTATÍSTICAS
   ============================================================ */

function renderStats(){
    computeDueCount();

    const history = loadHistory();
    const day = new Date().toISOString().slice(0,10);

    el.todayCorrect.textContent = history.filter(h =>
        h.time.slice(0,10) === day && h.correct
    ).length;

    el.todayWrong.textContent = history.filter(h =>
        h.time.slice(0,10) === day && !h.correct
    ).length;
}
/* ============================================================
   TEMA (DARK MODE) E HISTÓRICO
   ============================================================ */

function tryLoadTheme(){
    const t = localStorage.getItem("ui_theme");

    if (t) {
        document.documentElement.setAttribute("data-theme", t);
    } else {
        // Respeita o tema do sistema
        const prefersDark = window.matchMedia("(prefers-color-scheme:dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }
}

function renderHistoryPanel(){
    const history = loadHistory();
    el.historyList.innerHTML = "";

    history.slice(0,50).forEach(h => {
        const li = document.createElement("li");
        li.innerHTML = `
            <small>${h.time}</small>
            — <strong>#${h.linha}</strong>
            — "${h.eng}"
            — ${h.correct ? "<span style='color:green'>✔</span>" : "<span style='color:red'>✘</span>"}
        `;
        el.historyList.appendChild(li);
    });
}

/* ============================================================
   EVENT LISTENERS (BOTÕES E INTERAÇÕES)
   ============================================================ */

el.listenBtn.addEventListener("click", () => {
    if (current) speak(current.ENG);
});

el.checkBtn.addEventListener("click", handleCheck);

el.skipBtn.addEventListener("click", handleSkip);

el.toggleTheme.addEventListener("click", () => {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("ui_theme", next);
});

try {
    document.getElementById("openHistory")?.addEventListener("click", () => {
        renderHistoryPanel();
        el.historyPanel.classList.remove("hidden");
    });

    el.closeHistory?.addEventListener("click", () => {
        el.historyPanel.classList.add("hidden");
    });
} catch (e){
    console.warn("Painel de histórico não encontrado.");
}

el.openDashboard?.addEventListener("click", () => {
    el.dashboard.classList.toggle("hidden");
    renderStats();
});
/* ============================================================
   BOOT — INICIALIZAÇÃO FINAL DO SISTEMA
   ============================================================ */

async function boot() {
    try {
        frases = await loadJSON(DATA_PATH);
    } catch (e) {
        el.fraseEng.textContent = "Erro ao carregar data/frases.json — verifique o caminho.";
        console.error("Erro ao carregar frases.json:", e);
        return;
    }

    loadProgress();
    initAll();      // inicializa SRS para todas as frases
    renderStats();  // estatísticas iniciais
    nextCard();     // mostra a primeira frase
    tryLoadTheme(); // aplica tema dark/light
}

// Inicia o sistema
boot();
