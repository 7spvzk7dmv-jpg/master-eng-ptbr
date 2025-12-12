// ==========================
// CONFIGURAÇÕES GERAIS
// ==========================

const DATA_PATH = "data/frases.json";
let frases = [];
let filaInteligente = [];
let fraseAtual = null;

// Histórico: linha → { acertos, erros }
let historico = JSON.parse(localStorage.getItem("historico_eng")) || {};

// Modo adaptativo
let nivelAtual = "AUTO";

// SRS — Pesos
const PESO_ACERTO = 0.8;
const PESO_ERRO = 2.5;

// Tolerância mínima de similaridade
const SIM_MIN = 0.82;


// ==========================
// CARREGAR DATASET
// ==========================
async function carregarFrases() {
    const resposta = await fetch(DATASET_URL);
    frases = await resposta.json();
    construirFilaInicial();
    proximaFrase();
}


// ==========================
// FILA INTELIGENTE
// ==========================
function construirFilaInicial() {
    filaInteligente = [];

    frases.forEach(f => {
        const hist = historico[f.linha] || { acertos: 0, erros: 0 };
        const erros = hist.erros || 0;
        const acertos = hist.acertos || 0;

        // Score que determina prioridade
        let score = 1 + erros * PESO_ERRO - acertos * PESO_ACERTO;
        if (score < 1) score = 1;

        filaInteligente.push({ ...f, score });
    });

    filaInteligente.sort((a, b) => b.score - a.score);
}


// ==========================
// ESCOLHA ADAPTATIVA
// ==========================
function escolherFraseAdaptativa() {
    const distribuicao = {
        "A1": 0.30,
        "A2": 0.30,
        "B1": 0.25,
        "B2": 0.15
    };

    const r = Math.random();
    let acumulado = 0;

    for (const nivel of ["A1", "A2", "B1", "B2"]) {
        acumulado += distribuicao[nivel];
        if (r <= acumulado) {
            const grupo = filaInteligente.filter(f => f.nivel === nivel);
            if (grupo.length > 0) {
                return grupo[Math.floor(Math.random() * grupo.length)];
            }
        }
    }

    // fallback
    return filaInteligente[Math.floor(Math.random() * filaInteligente.length)];
}


// ==========================
// EXIBIR FRASE
// ==========================
function proximaFrase() {
    fraseAtual = escolherFraseAdaptativa();

    document.getElementById("frase-eng").innerText = fraseAtual.ENG;
    document.getElementById("linha-info-eng").innerText = "Line " + fraseAtual.linha;
    document.getElementById("resultado-eng").innerText = "";
    document.getElementById("resposta-eng").value = "";
}


// ==========================
// TTS — Inglês Americano
// ==========================
function falarFraseEng() {
    const utter = new SpeechSynthesisUtterance(fraseAtual.ENG);
    utter.lang = "en-US";
    speechSynthesis.speak(utter);
}


// ==========================
// FUNÇÃO DE SIMILARIDADE
// ==========================
function similaridade(a, b) {
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();

    if (a === b) return 1.0;

    const arrA = a.split("");
    const arrB = b.split("");
    const len = Math.max(arrA.length, arrB.length);
    let iguais = 0;

    for (let i = 0; i < len; i++) {
        if (arrA[i] === arrB[i]) iguais++;
    }

    return iguais / len;
}


// ==========================
// CONFERIR TRADUÇÃO
// ==========================
function conferirENG() {
    const resp = document.getElementById("resposta-eng").value.trim();
    const correta = fraseAtual.PTBR.trim();

    const sim = similaridade(resp, correta);
    const acertou = sim >= SIM_MIN;

    atualizarHistoricoEng(fraseAtual.linha, acertou);

    document.getElementById("resultado-eng").innerHTML =
        acertou
            ? "✔ Correct! Translation: <b>" + correta + "</b>"
            : "✖ Incorrect. Correct translation: <b>" + correta + "</b>";

    construirFilaInicial();
}


// ==========================
// ATUALIZA HISTÓRICO
// ==========================
function atualizarHistoricoEng(linha, acertou) {
    if (!historico[linha]) historico[linha] = { acertos: 0, erros: 0 };

    if (acertou) historico[linha].acertos++;
    else historico[linha].erros++;

    localStorage.setItem("historico_eng", JSON.stringify(historico));
}


// ==========================
// BOTÕES
// ==========================
document.getElementById("btn-ouvir-eng").onclick = falarFraseEng;
document.getElementById("btn-conferir-eng").onclick = conferirENG;
document.getElementById("btn-proxima-eng").onclick = proximaFrase;


// ==========================
// START
// ==========================
carregarFrases();
