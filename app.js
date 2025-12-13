let frases = [];

let estado = JSON.parse(localStorage.getItem("estadoTreino")) || {
  indiceAtual: 0,
  stats: {},
  acertos: 0,
  erros: 0,
  dataset: "frases" // "frases" ou "palavras"
};

const fraseENG = document.getElementById("fraseENG");
const resposta = document.getElementById("resposta");
const resultado = document.getElementById("resultado");
const linha = document.getElementById("linha");
const nivel = document.getElementById("nivel");

function carregarDataset() {
  const arquivo = estado.dataset === "frases"
    ? "data/frases.json"
    : "data/palavras.json";

  fetch(arquivo)
    .then(r => r.json())
    .then(d => {
      frases = d;
      estado.indiceAtual = 0;
      estado.stats = {};
      salvar();
      mostrarFrase();
      atualizarGrafico();
    });
}

carregarDataset();

function normalizar(txt) {
  return txt
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function similar(a, b) {
  let acertos = 0;
  const wa = a.split(" ");
  const wb = b.split(" ");
  wa.forEach(w => {
    if (wb.includes(w)) acertos++;
  });
  return acertos / Math.max(wa.length, wb.length);
}

function mostrarFrase() {
  const f = frases[estado.indiceAtual];
  fraseENG.textContent = f.ENG;
  linha.textContent = estado.indiceAtual + 1;
  nivel.textContent = f.CEFR;
  resposta.value = "";
  resultado.textContent = "";
}

document.getElementById("ouvir").onclick = () => {
  const u = new SpeechSynthesisUtterance(fraseENG.textContent);
  u.lang = "en-US";
  speechSynthesis.speak(u);
};

document.getElementById("conferir").onclick = () => {
  const f = frases[estado.indiceAtual];
  const rUser = normalizar(resposta.value);
  const rOk = normalizar(f.PTBR);

  const score = similar(rUser, rOk);

  estado.stats[estado.indiceAtual] ??= { tentativas: 0, erros: 0 };
  estado.stats[estado.indiceAtual].tentativas++;

  if (score >= 0.6) {
    resultado.textContent = "✅ Correto!";
    estado.acertos++;
  } else {
    resultado.textContent = `❌ Correto seria: ${f.PTBR}`;
    estado.erros++;
    estado.stats[estado.indiceAtual].erros++;
  }

  salvar();
  atualizarGrafico();
};

document.getElementById("proxima").onclick = () => {
  estado.indiceAtual = escolherProxima();
  mostrarFrase();
};

function escolherProxima() {
  const pesos = frases.map((_, i) => {
    const e = estado.stats[i]?.erros || 0;
    return e + 1;
  });

  const total = pesos.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;

  for (let i = 0; i < pesos.length; i++) {
    if ((r -= pesos[i]) <= 0) return i;
  }
  return 0;
}

function salvar() {
  localStorage.setItem("estadoTreino", JSON.stringify(estado));
}

document.getElementById("resetProgress").onclick = () => {
  if (confirm("Resetar todo o progresso?")) {
    localStorage.removeItem("estadoTreino");
    location.reload();
  }
};

document.getElementById("toggleTheme").onclick = () => {
  document.documentElement.classList.toggle("dark");
};

/* 🔁 BOTÃO-CHAVE: FRASES ↔ PALAVRAS */
document.getElementById("toggleDataset").onclick = () => {
  estado.dataset = estado.dataset === "frases" ? "palavras" : "frases";
  salvar();
  carregarDataset();
};

let chart;
function atualizarGrafico() {
  const ctx = document.getElementById("grafico");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Acertos', 'Erros'],
      datasets: [{
        data: [estado.acertos, estado.erros]
      }]
    }
  });
}
