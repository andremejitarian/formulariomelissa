// Relatório ARCS — lê o snapshot agregado (Supabase) + os enunciados (questions.json)
// e desenha as visualizações. Só dados agregados; nenhum nome é carregado.

const SUPABASE_URL = "https://ppemexnybmpvtfengtpr.supabase.co";
const SUPABASE_KEY = "sb_publishable_JMqXA6jzNABB3rDe3KTICQ_mFNVWczC";

// Paleta (espelha o <style> da página) lida das CSS custom properties, p/ casar tema claro/escuro.
const css = getComputedStyle(document.documentElement);
const C = (name) => css.getPropertyValue(name).trim();
const COLORS = {
    series: C("--series-1"),
    text: C("--text-primary"),
    secondary: C("--text-secondary"),
    muted: C("--muted"),
    grid: C("--grid"),
    surface: C("--surface"),
    good: C("--good"),
    divPos: C("--div-pos"),
    divNeg: C("--div-neg"),
    divMid: C("--div-mid"),
};

const fmt = new Intl.NumberFormat("pt-BR");
const BIN_LABELS = ["0–10", "10–20", "20–30", "30–40", "40–50", "50–60", "60–70", "70–80", "80–90", "90–100"];

function fmtDateBR(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

async function load() {
    try {
        const [reportRes, questionsRes] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/melissa_report?id=eq.arcs&select=data,updated_at,narrative,narrative_generated_at`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
            }),
            fetch("questions.json"),
        ]);
        if (!reportRes.ok) throw new Error(`Supabase ${reportRes.status}`);
        const rows = await reportRes.json();
        if (!rows.length) throw new Error("Relatório ainda não gerado. Assim que houver respostas, ele aparece aqui.");
        const questions = await questionsRes.json();

        render(rows[0].data, rows[0].updated_at, questions);
        renderNarrative(rows[0].narrative, rows[0].narrative_generated_at);
        hide("loading");
        show("report");
    } catch (err) {
        hide("loading");
        const box = document.getElementById("error");
        box.textContent = "Não foi possível carregar o relatório: " + err.message;
        box.classList.remove("hidden");
    }
}

function render(data, updatedAt, questions) {
    // Mapa id → enunciado
    const qById = {};
    questions.forEach((q) => { qById[q.id] = q; });

    // ── Cabeçalho / atualização ──
    const upd = new Date(updatedAt);
    document.getElementById("updated").textContent =
        "Atualizado em " + upd.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

    // ── KPIs ──
    document.getElementById("kpi-n").textContent = fmt.format(data.n);
    document.getElementById("kpi-n-foot").textContent =
        data.n_complete === data.n ? "todas completas" : `${fmt.format(data.n_complete)} completas`;
    document.getElementById("kpi-period").textContent = `${fmtDateBR(data.first_date)} → ${fmtDateBR(data.last_date)}`;
    document.getElementById("kpi-days").textContent = fmt.format(data.by_day.length);

    const alpha = data.cronbach_alpha;
    document.getElementById("kpi-alpha").textContent = alpha === null ? "—" : alpha.toFixed(2).replace(".", ",");
    document.getElementById("kpi-alpha-foot").textContent = alpha === null ? "α de Cronbach" : `α de Cronbach · ${alphaLabel(alpha)}`;

    // ── Coleta ao longo do tempo (cumulativo) ──
    let acc = 0;
    const cum = data.by_day.map((d) => ({ x: fmtDateBR(d.date), y: (acc += d.count) }));
    new Chart(document.getElementById("chart-time"), {
        type: "line",
        data: {
            labels: cum.map((p) => p.x),
            datasets: [{
                label: "Respostas acumuladas",
                data: cum.map((p) => p.y),
                borderColor: COLORS.series,
                backgroundColor: COLORS.series + "22",
                borderWidth: 2,
                fill: true,
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 5,
            }],
        },
        options: baseOpts({ yTitle: "Acumulado", maxTicksX: 8 }),
    });

    // ── Ranking de concordância média ──
    const ranked = data.items
        .map((it) => ({ ...it, q: qById[it.id] }))
        .filter((it) => it.mean !== null)
        .sort((a, b) => b.mean - a.mean);
    new Chart(document.getElementById("chart-ranking"), {
        type: "bar",
        data: {
            labels: ranked.map((it) => it.id.toUpperCase()),
            datasets: [{
                label: "Média",
                data: ranked.map((it) => it.mean),
                backgroundColor: COLORS.series,
                borderRadius: 4,
                borderSkipped: false,
                barPercentage: 0.82,
                categoryPercentage: 0.86,
            }],
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { min: 0, max: 100, grid: { color: COLORS.grid }, ticks: { color: COLORS.muted }, title: { display: true, text: "Discordo (0) → Concordo (100)", color: COLORS.secondary } },
                y: { grid: { display: false }, ticks: { color: COLORS.secondary, font: { size: 11 } } },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const it = ranked[items[0].dataIndex];
                            return it.q ? it.q.statement : it.id;
                        },
                        label: (item) => {
                            const it = ranked[item.dataIndex];
                            return [`Média: ${it.mean}`, `Desvio-padrão: ${it.sd ?? "—"}`, `Mediana: ${it.median ?? "—"}`];
                        },
                    },
                },
            },
        },
    });

    // ── Explorador por item (histograma) ──
    const select = document.getElementById("item-select");
    data.items.forEach((it) => {
        const q = qById[it.id];
        const opt = document.createElement("option");
        opt.value = it.id;
        const short = q ? q.statement.slice(0, 55) + (q.statement.length > 55 ? "…" : "") : it.id;
        opt.textContent = `${it.id.toUpperCase()} — ${short}`;
        select.appendChild(opt);
    });

    let histChart = null;
    function drawItem(id) {
        const it = data.items.find((x) => x.id === id);
        const q = qById[id];
        document.getElementById("item-statement").textContent = q ? q.statement : id;
        document.getElementById("anchor-left").textContent = q ? `◀ ${q.leftLabel} (0)` : "";
        document.getElementById("anchor-right").textContent = q ? `${q.rightLabel} (100) ▶` : "";
        document.getElementById("stat-mean").textContent = it.mean ?? "—";
        document.getElementById("stat-median").textContent = it.median ?? "—";
        document.getElementById("stat-sd").textContent = it.sd ?? "—";
        document.getElementById("stat-n").textContent = fmt.format(it.n);

        if (histChart) histChart.destroy();
        histChart = new Chart(document.getElementById("chart-hist"), {
            type: "bar",
            data: {
                labels: BIN_LABELS,
                datasets: [{
                    label: "Respostas",
                    data: it.hist,
                    backgroundColor: COLORS.series,
                    borderRadius: 4,
                    borderSkipped: false,
                }],
            },
            options: baseOpts({ yTitle: "Nº de respostas", xTitle: "Faixa da escala" }),
        });
    }
    select.addEventListener("change", (e) => drawItem(e.target.value));
    drawItem(data.items[0].id);

    // ── Heatmap de correlação ──
    if (data.corr) buildHeatmap(data.corr, data.items, qById);
    else document.getElementById("heatmap").innerHTML = "<p class='note'>Correlações indisponíveis (amostra insuficiente).</p>";

    // ── Nota metodológica ──
    document.getElementById("method-note").innerHTML = methodNote(data, alpha);
}

function renderNarrative(text, generatedAt) {
    const card = document.getElementById("narrative-card");
    if (!text || !text.trim()) { card.classList.add("hidden"); return; }
    const body = document.getElementById("narrative-body");
    body.innerHTML = "";
    text.trim().split(/\n{2,}|\n/).filter((p) => p.trim()).forEach((para) => {
        const p = document.createElement("p");
        p.textContent = para.trim();
        body.appendChild(p);
    });
    const when = generatedAt ? new Date(generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : null;
    document.getElementById("narrative-meta").textContent =
        "Texto gerado automaticamente por IA" + (when ? ` em ${when}` : "") + " · leitura preliminar, a ser validada pela pesquisadora.";
}

function alphaLabel(a) {
    if (a >= 0.9) return "excelente";
    if (a >= 0.8) return "boa";
    if (a >= 0.7) return "aceitável";
    if (a >= 0.6) return "questionável";
    if (a >= 0.5) return "fraca";
    return "inaceitável";
}

function baseOpts({ yTitle, xTitle, maxTicksX } = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: COLORS.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: maxTicksX || 12 },
                title: xTitle ? { display: true, text: xTitle, color: COLORS.secondary } : undefined,
            },
            y: {
                beginAtZero: true,
                grid: { color: COLORS.grid },
                ticks: { color: COLORS.muted, precision: 0 },
                title: yTitle ? { display: true, text: yTitle, color: COLORS.secondary } : undefined,
            },
        },
        plugins: { legend: { display: false } },
    };
}

// Cor diverging para r ∈ [-1, 1]: vermelho ↔ cinza (neutro) ↔ azul.
function hex2rgb(h) {
    const s = h.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
function corrColor(r) {
    if (r === null || Number.isNaN(r)) return COLORS.surface;
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const mid = hex2rgb(COLORS.divMid);
    const target = hex2rgb(r >= 0 ? COLORS.divPos : COLORS.divNeg);
    const [rr, gg, bb] = mix(mid, target, Math.min(1, Math.abs(r)));
    return `rgb(${rr},${gg},${bb})`;
}

function buildHeatmap(corr, items, qById) {
    const ids = items.map((it) => it.id);
    const table = document.createElement("table");
    table.className = "heat";

    const thead = document.createElement("thead");
    const htr = document.createElement("tr");
    htr.appendChild(document.createElement("th")); // canto
    ids.forEach((id) => {
        const th = document.createElement("th");
        th.className = "col";
        th.textContent = id.toUpperCase();
        htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    corr.forEach((row, i) => {
        const tr = document.createElement("tr");
        const rh = document.createElement("th");
        rh.textContent = ids[i].toUpperCase();
        tr.appendChild(rh);
        row.forEach((r, j) => {
            const td = document.createElement("td");
            td.className = "cell";
            td.style.background = corrColor(r);
            const qi = qById[ids[i]], qj = qById[ids[j]];
            td.title = `${ids[i].toUpperCase()} × ${ids[j].toUpperCase()}\nr = ${r ?? "—"}` +
                (qi && qj ? `\n\n${ids[i].toUpperCase()}: ${qi.statement}\n${ids[j].toUpperCase()}: ${qj.statement}` : "");
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const container = document.getElementById("heatmap");
    container.innerHTML = "";
    container.appendChild(table);
}

function methodNote(data, alpha) {
    return `
        <ul>
            <li><b>Escala.</b> Cada afirmação é respondida num controle contínuo de 0 (Discordo totalmente) a 100 (Concordo totalmente).</li>
            <li><b>Anonimato.</b> Este relatório mostra apenas medidas agregadas — nenhum nome ou resposta individual é exibido.</li>
            <li><b>Consistência interna (α de Cronbach).</b> ${alpha === null ? "Ainda sem amostra suficiente para calcular." : `α = ${alpha.toFixed(3).replace(".", ",")} (${alphaLabel(alpha)}). Mede o quanto os 21 itens variam de forma coerente entre si. Valores moderados são esperados quando a escala mistura afirmações de sentidos opostos (itens diretos e reversos) — a inversão dos itens reversos costuma elevar o α.`}</li>
            <li><b>Correlações.</b> Coeficiente de Pearson calculado sobre os ${fmt.format(data.n_complete)} respondentes que preencheram todos os itens.</li>
            <li><b>Atualização.</b> O relatório é recalculado automaticamente a cada nova resposta enviada.</li>
        </ul>`;
}

load();
