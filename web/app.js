/* Observatorio Textil, Moda y Calzado MX — Fases 1 y 2
 * Datos: web/data (preparar_datos.py y preparar_fase2.py). Fase 2 en fase2.js.
 * Todo se calcula en el navegador a partir de arreglos tipados.
 */
"use strict";

const fmt = new Intl.NumberFormat("es-MX");
const fmt1 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt2 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pct = (a, b) => (b ? fmt1.format((100 * a) / b) + " %" : "—");
const compacto = (v) => (v >= 10000 ? fmt.format(Math.round(v / 1000)) + " mil" : fmt.format(v));
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const MIN_CL = 30; // mínimo de establecimientos del sector para calcular CL municipal

const S = {
  meta: null, n: 0,
  lon: null, lat: null, mun: null, capa: null, clase: null, tam: null, anio: null,
  munEnt: null, entIdx: {}, geo: null,
  f: { ent: "", capas: new Set(), tams: new Set() },
  r: null,          // resultados agregados del filtro
  tab: "panorama",
  modo: "puntos",
  ce: null, comercio: null,   // Fase 2
  ind: "po", fichaMun: null, anioCom: null,
  detalle: {},      // cache por entidad
};

/* ---------- colores ---------- */
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function hexRgb(h) { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
const esOscuro = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
const colSeg = (s) => cssVar(`--seg-${s}`);
const colCapa = (c) => colSeg(S.meta.capas[c].segmento);

// Secuencial azul (claro→oscuro en modo claro; invertido hacia la luz en oscuro)
const SEQ_CLARO = ["#cde2fb", "#9ec5f4", "#5598e7", "#256abf", "#104281"];
const SEQ_OSCURO = ["#0d366b", "#184f95", "#256abf", "#3987e5", "#86b6ef"];
// Divergente azul ↔ rojo con gris neutro en CL ≈ 1
const DIV_CLARO = ["#256abf", "#9ec5f4", "#f0efec", "#f2a09f", "#c93a3a"];
const DIV_OSCURO = ["#3987e5", "#1c5cab", "#383835", "#9e3434", "#e66767"];
const CL_CORTES = [0.5, 0.8, 1.25, 2];
const CL_ETQ = ["Menor de 0.5", "0.5 a 0.8", "0.8 a 1.25 (similar al nacional)", "1.25 a 2", "2 o más"];

/* ---------- carga ---------- */
async function cargar() {
  const [meta, buf, geo, ce, comercio] = await Promise.all([
    fetch("data/meta.json").then((r) => r.json()),
    fetch("data/puntos.bin").then((r) => r.arrayBuffer()),
    fetch("data/entidades.geojson").then((r) => r.json()),
    fetch("data/ce2024.json").then((r) => r.json()),
    fetch("data/comercio.json").then((r) => r.json()),
  ]);
  S.meta = meta; S.n = meta.n; S.geo = geo; S.ce = ce; S.comercio = comercio;
  const T = { float32: Float32Array, uint16: Uint16Array, uint8: Uint8Array };
  for (const b of meta.binario) S[b.campo] = new T[b.tipo](buf, b.offset, meta.n);
  meta.entidades.forEach((e, i) => (S.entIdx[e.cve] = i));
  S.munEnt = new Uint8Array(meta.municipios.length);
  meta.municipios.forEach((m, i) => (S.munEnt[i] = S.entIdx[m[0].slice(0, 2)]));
  meta.capas.forEach((_, i) => S.f.capas.add(i));
  meta.tamanos.forEach((_, i) => S.f.tams.add(i));
  // Conteos fijos por municipio × eslabón y municipio × tamaño (para la ficha municipal)
  const nC = meta.capas.length, nM = meta.municipios.length;
  S.munCapa = new Uint32Array(nM * nC); S.munTam = new Uint32Array(nM * 8); S.nacCapa = new Uint32Array(nC);
  for (let i = 0; i < meta.n; i++) {
    const m = S.mun[i], c = S.capa[i];
    S.munCapa[m * nC + c]++; S.nacCapa[c]++;
    S.munTam[m * 8 + (S.tam[i] === 255 ? 7 : S.tam[i])]++;
  }
}

/* ---------- filtro y agregados ---------- */
function calcular() {
  const { n, capa, tam, mun, clase, anio, munEnt } = S;
  const nC = S.meta.capas.length, nE = S.meta.entidades.length, nM = S.meta.municipios.length;
  const capaOk = new Uint8Array(nC); S.f.capas.forEach((c) => (capaOk[c] = 1));
  const tamOk = new Uint8Array(256); tamOk[255] = 1; S.f.tams.forEach((t) => (tamOk[t] = 1));
  const entSel = S.f.ent === "" ? -1 : S.entIdx[S.f.ent];

  const allEnt = new Uint32Array(nE), selEnt = new Uint32Array(nE);
  const allMun = new Uint32Array(nM), selMun = new Uint32Array(nM);
  const porCapaTodas = new Uint32Array(nC);   // ignora el filtro de eslabones (para la cadena)
  const porCapa = new Uint32Array(nC), porTam = new Uint32Array(8), porClase = new Uint32Array(S.meta.clases.length);
  const porClaseTodas = new Uint32Array(S.meta.clases.length);
  const porAnio = new Uint32Array(32);
  const idx = new Uint32Array(n); let k = 0;

  for (let i = 0; i < n; i++) {
    if (!tamOk[tam[i]]) continue;
    const m = mun[i], e = munEnt[m], c = capa[i];
    allEnt[e]++; allMun[m]++;
    const enEnt = entSel < 0 || e === entSel;
    if (enEnt) { porCapaTodas[c]++; porClaseTodas[clase[i]]++; }
    if (!capaOk[c]) continue;
    selEnt[e]++; selMun[m]++;
    if (!enEnt) continue;
    idx[k++] = i;
    porCapa[c]++; porClase[clase[i]]++;
    porTam[tam[i] === 255 ? 7 : tam[i]]++;
    if (anio[i] < 32) porAnio[anio[i]]++;
  }
  let totAll = 0, totSel = 0;
  for (let e = 0; e < nE; e++) { totAll += allEnt[e]; totSel += selEnt[e]; }
  const ref = totAll ? totSel / totAll : 0;
  const clEnt = Array.from(allEnt, (a, e) => (a && ref ? selEnt[e] / a / ref : null));
  const clMun = Array.from(allMun, (a, m) => (a >= MIN_CL && ref ? selMun[m] / a / ref : null));
  const todasCapas = S.f.capas.size === nC;

  S.r = { idx: idx.subarray(0, k), k, allEnt, selEnt, allMun, selMun, porCapa, porCapaTodas, porTam, porClase,
          porClaseTodas, porAnio, clEnt, clMun, todasCapas, entSel };
}

/* ---------- tooltip compartido ---------- */
const tip = { el: null };
function mostrarTip(html, x, y) {
  const el = tip.el; el.innerHTML = html; el.hidden = false;
  const r = el.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  el.style.left = Math.max(8, left) + "px"; el.style.top = Math.max(8, top) + "px";
}
function ocultarTip() { tip.el.hidden = true; }

/* ---------- gráficas SVG ---------- */
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function ticksLimpios(max, n = 4) {
  if (max <= 0) return [0];
  const paso0 = max / n, mag = Math.pow(10, Math.floor(Math.log10(paso0)));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= paso0);
  const out = [0]; while (out[out.length - 1] < max - 1e-9) out.push(out.length * paso);
  return out;
}
function barraH(x0, y, w, h, r = 4) {
  if (w <= 0) return "";
  r = Math.min(r, w, h / 2);
  return `M${x0},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}z`;
}
function barraV(x, y0, w, h, r = 4) {
  if (h <= 0) return "";
  r = Math.min(r, h, w / 2);
  return `M${x},${y0}v${-(h - r)}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - r}z`;
}

/** Barras horizontales. filas: {etq, valor, color, tip} */
function graficaH(cont, filas, { anchoEtq = 190, fmtVal = (v) => fmt.format(v), fmtTick = compacto, ref = null } = {}) {
  cont.innerHTML = "";
  const W = Math.max(280, cont.clientWidth);
  const etq = Math.min(anchoEtq, W * 0.42);
  const fila = 28, alto = 16, top = 4, abajo = 22;
  const H = top + filas.length * fila + abajo;
  const max = Math.max(1, ...filas.map((f) => f.valor));
  const ticks = ticksLimpios(max);
  const tmax = ticks[ticks.length - 1];
  const x1 = W - 64; // espacio para el valor en la punta
  const sx = (v) => etq + ((x1 - etq) * v) / tmax;
  const svg = el("svg", { width: W, height: H, role: "img" }, cont);
  ticks.forEach((t) => {
    el("line", { x1: sx(t), x2: sx(t), y1: top, y2: H - abajo + 2, class: t === 0 ? "base" : "ret" }, svg);
    const tx = el("text", { x: sx(t), y: H - 6, "text-anchor": "middle", class: "tick" }, svg);
    tx.textContent = fmtTick(t);
  });
  if (ref != null && ref <= tmax) el("line", { x1: sx(ref), x2: sx(ref), y1: top - 2, y2: H - abajo + 2, class: "ref" }, svg);
  filas.forEach((f, i) => {
    const y = top + i * fila + (fila - alto) / 2;
    const g = el("g", { class: "fila" }, svg);
    const t = el("text", { x: etq - 8, y: y + alto / 2 + 4, "text-anchor": "end" }, g);
    t.textContent = recortar(f.etq, etq - 12);
    el("path", { d: barraH(sx(0), y, sx(f.valor) - sx(0), alto), fill: f.color, class: "marca" + (f.parcial ? " parcial" : "") }, g);
    const v = el("text", { x: sx(f.valor) + 6, y: y + alto / 2 + 4, class: "valor" }, g);
    v.textContent = (f.parcial ? "≥ " : "") + fmtVal(f.valor);
    const hit = el("rect", { x: 0, y: top + i * fila, width: W, height: fila, class: "hit" }, g);
    hit.addEventListener("mousemove", (ev) => mostrarTip(f.tip, ev.clientX, ev.clientY));
    hit.addEventListener("mouseleave", ocultarTip);
  });
  svg.setAttribute("aria-label", filas.map((f) => `${f.etq}: ${fmtVal(f.valor)}`).join("; "));
}

/** Columnas verticales. filas: {etq, valor, tip} */
function graficaV(cont, filas, color) {
  cont.innerHTML = "";
  const W = Math.max(280, cont.clientWidth), H = 220;
  const izq = 48, der = 8, top = 22, abajo = 26;
  const max = Math.max(1, ...filas.map((f) => f.valor));
  const ticks = ticksLimpios(max), tmax = ticks[ticks.length - 1];
  const sy = (v) => H - abajo - ((H - abajo - top) * v) / tmax;
  const banda = (W - izq - der) / filas.length;
  const bw = Math.min(24, banda * 0.7);
  const svg = el("svg", { width: W, height: H, role: "img" }, cont);
  ticks.forEach((t) => {
    el("line", { x1: izq, x2: W - der, y1: sy(t), y2: sy(t), class: t === 0 ? "base" : "ret" }, svg);
    const tx = el("text", { x: izq - 6, y: sy(t) + 4, "text-anchor": "end", class: "tick" }, svg);
    tx.textContent = compacto(t);
  });
  const cada = Math.ceil(filas.length / Math.max(1, Math.floor((W - izq) / 44)));
  let iMax = 0; filas.forEach((f, i) => { if (f.valor > filas[iMax].valor) iMax = i; });
  filas.forEach((f, i) => {
    const x = izq + i * banda + (banda - bw) / 2;
    const g = el("g", { class: "fila" }, svg);
    el("path", { d: barraV(x, sy(0), bw, sy(0) - sy(f.valor)), fill: color, class: "marca" }, g);
    if (i % cada === 0) {
      const t = el("text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle", class: "tick" }, g);
      t.textContent = f.etq;
    }
    if (i === iMax && f.valor > 0) {
      const v = el("text", { x: x + bw / 2, y: sy(f.valor) - 5, "text-anchor": "middle", class: "valor" }, g);
      v.textContent = compacto(f.valor);
    }
    const hit = el("rect", { x: izq + i * banda, y: top, width: banda, height: H - top - abajo, class: "hit" }, g);
    hit.addEventListener("mousemove", (ev) => mostrarTip(f.tip, ev.clientX, ev.clientY));
    hit.addEventListener("mouseleave", ocultarTip);
  });
  svg.setAttribute("aria-label", filas.map((f) => `${f.etq}: ${fmt.format(f.valor)}`).join("; "));
}

let medidor;
function recortar(txt, px) {
  medidor = medidor || document.createElement("canvas").getContext("2d");
  medidor.font = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";
  if (medidor.measureText(txt).width <= px) return txt;
  let s = txt;
  while (s.length > 1 && medidor.measureText(s + "…").width > px) s = s.slice(0, -1);
  return s + "…";
}

function tablaHTML(cols, filas) {
  return `<div class="tabla-cont"><table class="tabla"><thead><tr>${cols
    .map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.t)}</th>`).join("")}</tr></thead><tbody>${filas
    .map((f) => `<tr>${f.map((v, i) => `<td class="${cols[i].num ? "num" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function leyendaSeg(cont) {
  cont.innerHTML = S.meta.segmentos.map((s, i) => `<span><i style="background:${colSeg(i)}"></i>${esc(s)}</span>`).join("");
}

/* ---------- PANORAMA ---------- */
function pintarPanorama() {
  const r = S.r, M = S.meta;
  const porSeg = [0, 0, 0];
  M.capas.forEach((c, i) => (porSeg[c.segmento] += r.porCapa[i]));
  const micro = r.porTam[0];
  const ambito = S.f.ent ? M.entidades[r.entSel].nombre : "México";
  $("#kpis").innerHTML = [
    { etq: "Establecimientos", val: fmt.format(r.k), sub: ambito },
    { etq: "Manufactura", val: fmt.format(porSeg[0]), sub: pct(porSeg[0], r.k) + " del total", seg: 0 },
    { etq: "Comercio", val: fmt.format(porSeg[1]), sub: pct(porSeg[1], r.k) + " del total", seg: 1 },
    { etq: "Diseño (candidatos)", val: fmt.format(porSeg[2]), sub: "Clase 541490, no exclusiva de moda", seg: 2 },
    { etq: "Micronegocios (0 a 5 personas)", val: pct(micro, r.k), sub: fmt.format(micro) + " establecimientos" },
  ].map((k) => `<div class="kpi"><div class="etq">${k.seg !== undefined ? `<i class="punto" style="background:${colSeg(k.seg)}"></i>` : ""}${esc(k.etq)}</div><div class="val">${k.val}</div><div class="sub">${esc(k.sub)}</div></div>`).join("");

  leyendaSeg($("#ley-seg"));
  const filasCapa = M.capas.map((c, i) => ({
    etq: c.nombre, valor: r.porCapa[i], color: colSeg(c.segmento),
    tip: `<b>${esc(c.nombre)}</b> · SCIAN ${esc(c.scian)}<br>${fmt.format(r.porCapa[i])} establecimientos (${pct(r.porCapa[i], r.k)})<br><span class="tt-sub">${esc(c.descripcion)}</span>`,
  }));
  graficaH($("#g-capas"), filasCapa);
  $("#t-capas").innerHTML = tablaHTML(
    [{ t: "Eslabón" }, { t: "SCIAN" }, { t: "Segmento" }, { t: "Establecimientos", num: 1 }, { t: "%", num: 1 }],
    M.capas.map((c, i) => [c.nombre, c.scian, M.segmentos[c.segmento], fmt.format(r.porCapa[i]), pct(r.porCapa[i], r.k)])
  );

  // Entidades (si hay entidad seleccionada, se muestran sus municipios)
  let filasEnt, titulo;
  if (S.f.ent) {
    titulo = `Municipios con más establecimientos · ${M.entidades[r.entSel].nombre}`;
    filasEnt = [];
    r.selMun.forEach((v, m) => { if (S.munEnt[m] === r.entSel && v > 0) filasEnt.push({ m, v }); });
    filasEnt.sort((a, b) => b.v - a.v);
    filasEnt = filasEnt.slice(0, 15).map(({ m, v }) => ({
      etq: M.municipios[m][1], valor: v, color: cssVar("--barra"),
      tip: `<b>${esc(M.municipios[m][1])}</b><br>${fmt.format(v)} establecimientos`,
    }));
  } else {
    titulo = "Entidades con más establecimientos";
    filasEnt = M.entidades.map((e, i) => ({ e, i, v: r.selEnt[i] })).sort((a, b) => b.v - a.v).slice(0, 15).map(({ e, i, v }) => ({
      etq: e.nombre, valor: v, color: cssVar("--barra"),
      tip: `<b>${esc(e.nombre)}</b><br>${fmt.format(v)} establecimientos · ${pct(v, r.k)} del país${!r.todasCapas && r.clEnt[i] != null ? `<br>CL: ${fmt2.format(r.clEnt[i])}` : ""}`,
    }));
  }
  $("#g-ent-tit").textContent = titulo;
  graficaH($("#g-ent"), filasEnt, { anchoEtq: 170 });
  $("#t-ent").innerHTML = S.f.ent ? "" : tablaHTML(
    [{ t: "Entidad" }, { t: "Establecimientos", num: 1 }, { t: "% del país", num: 1 }, { t: "CL", num: 1 }],
    M.entidades.map((e, i) => ({ e, i })).sort((a, b) => r.selEnt[b.i] - r.selEnt[a.i])
      .map(({ e, i }) => [e.nombre, fmt.format(r.selEnt[i]), pct(r.selEnt[i], r.k), r.todasCapas || r.clEnt[i] == null ? "—" : fmt2.format(r.clEnt[i])])
  );

  // Tamaño
  const etqTam = M.tamanos.map((t) => t + " personas");
  const filasTam = etqTam.map((t, i) => ({
    etq: t, valor: r.porTam[i], color: cssVar("--barra"),
    tip: `<b>${esc(t)}</b><br>${fmt.format(r.porTam[i])} establecimientos (${pct(r.porTam[i], r.k)})`,
  }));
  graficaH($("#g-tam"), filasTam, { anchoEtq: 130 });
  $("#t-tam").innerHTML = tablaHTML([{ t: "Personal ocupado" }, { t: "Establecimientos", num: 1 }, { t: "%", num: 1 }],
    filasTam.map((f) => [f.etq, fmt.format(f.valor), pct(f.valor, r.k)]));

  // Año de incorporación
  let a0 = 31, a1 = 0;
  r.porAnio.forEach((v, i) => { if (v) { a0 = Math.min(a0, i); a1 = Math.max(a1, i); } });
  const filasAnio = [];
  for (let i = a0; i <= a1; i++) {
    const anio = M.anio_base + i;
    filasAnio.push({ etq: String(anio), valor: r.porAnio[i], tip: `<b>${anio}</b><br>${fmt.format(r.porAnio[i])} registros incorporados o actualizados` });
  }
  graficaV($("#g-anio"), filasAnio, cssVar("--barra"));
  $("#t-anio").innerHTML = tablaHTML([{ t: "Año" }, { t: "Establecimientos", num: 1 }], filasAnio.map((f) => [f.etq, fmt.format(f.valor)]));

  pintarMunicipios();
}

function pintarMunicipios() {
  const r = S.r, M = S.meta;
  const q = $("#mun-buscar").value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const orden = $("#mun-orden").value;
  let filas = [];
  for (let m = 0; m < M.municipios.length; m++) {
    if (r.entSel >= 0 && S.munEnt[m] !== r.entSel) continue;
    if (!r.selMun[m]) continue;
    if (q) {
      const nom = (M.municipios[m][1] + " " + M.entidades[S.munEnt[m]].nombre).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (!nom.includes(q)) continue;
    }
    filas.push(m);
  }
  const cl = (m) => (r.todasCapas ? null : r.clMun[m]);
  filas.sort(orden === "cl" ? (a, b) => (cl(b) ?? -1) - (cl(a) ?? -1) : (a, b) => r.selMun[b] - r.selMun[a]);
  const total = filas.length;
  filas = filas.slice(0, 300);
  const t = $("#t-mun");
  t.innerHTML = `<thead><tr><th>#</th><th>Municipio</th><th>Entidad</th><th class="num">Establecimientos</th><th class="num">% del sector en el municipio</th><th class="num">CL</th><th><span class="sr">Ficha</span></th></tr></thead><tbody>${filas
    .map((m, i) => {
      const c = cl(m);
      return `<tr class="clic" data-mun="${m}" tabindex="0"><td class="num">${i + 1}</td><td>${esc(M.municipios[m][1])}</td><td>${esc(M.entidades[S.munEnt[m]].nombre)}</td><td class="num">${fmt.format(r.selMun[m])}</td><td class="num">${pct(r.selMun[m], r.allMun[m])}</td><td class="num ${c >= 1.25 ? "cl-alto" : ""}">${c == null ? "—" : fmt2.format(c)}</td><td><button type="button" class="enlace" data-ficha="${m}">Ficha</button></td></tr>`;
    }).join("")}</tbody>${total > 300 ? `<tfoot><tr><td colspan="7" class="nota">Se muestran 300 de ${fmt.format(total)} municipios. Usa la búsqueda para encontrar otros.</td></tr></tfoot>` : ""}`;
  if (r.todasCapas) {
    t.querySelector("thead th:last-child").title = "Selecciona uno o varios eslabones para calcular el CL";
  }
}

/* ---------- MAPA ---------- */
const MAPA = { map: null, overlay: null, listo: false, bboxEnt: {}, sel: null };

function estiloBase() {
  return esOscuro()
    ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
    : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
}
function estiloVacio() {
  return { version: 8, sources: {}, layers: [{ id: "fondo", type: "background", paint: { "background-color": cssVar("--superficie") } }] };
}

function iniciarMapa() {
  if (MAPA.map) return;
  S.geo.features.forEach((f) => {
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    const recorre = (c) => (typeof c[0] === "number" ? (x0 = Math.min(x0, c[0]), x1 = Math.max(x1, c[0]), y0 = Math.min(y0, c[1]), y1 = Math.max(y1, c[1])) : c.forEach(recorre));
    recorre(f.geometry.coordinates);
    MAPA.bboxEnt[f.properties.cve] = [[x0, y0], [x1, y1]];
  });
  const map = new maplibregl.Map({
    container: "mapa", style: estiloBase(), center: [-102.5, 23.6], zoom: 4.2, minZoom: 3, maxZoom: 17,
    attributionControl: { compact: true },
  });
  let caido = false;
  map.on("error", (e) => {
    if (!caido && !map.isStyleLoaded()) { caido = true; console.warn("Mapa base no disponible; se usa fondo liso.", e.error); map.setStyle(estiloVacio()); }
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  MAPA.overlay = new deck.MapboxOverlay({ interleaved: false, layers: [], getTooltip: tooltipMapa, onClick: clicMapa });
  map.addControl(MAPA.overlay);
  MAPA.map = map;
  map.on("load", () => {
    MAPA.listo = true; pintarMapa();
    if (S.f.ent && MAPA.bboxEnt[S.f.ent]) map.fitBounds(MAPA.bboxEnt[S.f.ent], { padding: 30, duration: 0 });
  });
}

function construirPuntos() {
  // Orden de dibujo: comercio primero, manufactura encima, diseño al final
  const r = S.r, idx = r.idx, capas = S.meta.capas;
  const orden = [1, 0, 2];
  const pos = new Float32Array(r.k * 2), col = new Uint8Array(r.k * 4), map = new Uint32Array(r.k);
  const rgb = [0, 1, 2].map((s) => hexRgb(colSeg(s)));
  const alfa = r.k > 100000 ? 150 : r.k > 20000 ? 190 : 230;
  let j = 0;
  for (const seg of orden) {
    for (let t = 0; t < r.k; t++) {
      const i = idx[t];
      if (capas[S.capa[i]].segmento !== seg) continue;
      pos[2 * j] = S.lon[i]; pos[2 * j + 1] = S.lat[i];
      const c = rgb[seg];
      col[4 * j] = c[0]; col[4 * j + 1] = c[1]; col[4 * j + 2] = c[2]; col[4 * j + 3] = alfa;
      map[j++] = i;
    }
  }
  MAPA.puntos = { length: j, map, attributes: { getPosition: { value: pos, size: 2 }, getFillColor: { value: col, size: 4, normalized: true } } };
}

function binCL(v) { if (v == null) return -1; let b = 0; while (b < CL_CORTES.length && v >= CL_CORTES[b]) b++; return b; }
function cortesConteo(vals) {
  const s = vals.filter((v) => v > 0).sort((a, b) => a - b);
  if (!s.length) return [1, 2, 3, 4];
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const c = [q(0.2), q(0.4), q(0.6), q(0.8)].map((v) => redondeo(v));
  for (let i = 1; i < c.length; i++) if (c[i] <= c[i - 1]) c[i] = c[i - 1] + 1;
  return c;
}
function redondeo(v) { if (v < 100) return Math.max(1, Math.round(v)); const m = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / m) * m; }

function pintarMapa() {
  if (!MAPA.listo) return;
  const r = S.r, modo = S.modo, oscuro = esOscuro();
  const capas = [];
  const rgbBorde = hexRgb(oscuro ? "#6b6a64" : "#8a8981");
  const valores = S.meta.entidades.map((_, i) => r.selEnt[i]);
  const cortes = cortesConteo(valores);
  const seq = oscuro ? SEQ_OSCURO : SEQ_CLARO, div = oscuro ? DIV_OSCURO : DIV_CLARO;
  const relleno = (f) => {
    const i = S.entIdx[f.properties.cve];
    if (i === undefined) return [0, 0, 0, 0];
    if (modo === "conteo") {
      const v = r.selEnt[i]; if (!v) return [...hexRgb(oscuro ? "#2c2c2a" : "#f0efec"), 255];
      let b = 0; while (b < 4 && v >= cortes[b]) b++;
      return [...hexRgb(seq[b]), 235];
    }
    if (modo === "cl") {
      const b = r.todasCapas ? 2 : binCL(r.clEnt[i]);
      return b < 0 ? [0, 0, 0, 0] : [...hexRgb(div[b]), 235];
    }
    return [0, 0, 0, 0];
  };
  const entSel = S.f.ent;
  capas.push(new deck.GeoJsonLayer({
    id: "entidades", data: S.geo, pickable: modo !== "puntos", stroked: true, filled: true,
    getFillColor: relleno, getLineColor: (f) => (entSel && f.properties.cve === entSel ? hexRgb(cssVar("--tinta")) : rgbBorde),
    getLineWidth: (f) => (entSel && f.properties.cve === entSel ? 2.5 : 0.8), lineWidthUnits: "pixels",
    updateTriggers: { getFillColor: [modo, r.k, oscuro, S.f.capas.size, entSel], getLineColor: [entSel, oscuro], getLineWidth: [entSel] },
  }));
  if (modo === "puntos") {
    construirPuntos();
    capas.push(new deck.ScatterplotLayer({
      id: "puntos", data: MAPA.puntos, pickable: true, radiusUnits: "meters", getRadius: 90,
      radiusMinPixels: 1.3, radiusMaxPixels: 7, stroked: false, autoHighlight: true, highlightColor: [255, 255, 255, 220],
    }));
    if (MAPA.sel != null) {
      const i = MAPA.sel;
      capas.push(new deck.ScatterplotLayer({
        id: "seleccion", data: [i], getPosition: (i) => [S.lon[i], S.lat[i]], getRadius: 7, radiusUnits: "pixels",
        stroked: true, filled: false, getLineColor: hexRgb(cssVar("--tinta")), lineWidthMinPixels: 2,
      }));
    }
  }
  MAPA.overlay.setProps({ layers: capas });
  pintarLeyendaMapa(cortes, seq, div);
}

function pintarLeyendaMapa(cortes, seq, div) {
  const L = $("#mapa-leyenda"), r = S.r;
  if (S.modo === "puntos") {
    L.innerHTML = `<h3>${fmt.format(r.k)} establecimientos</h3><div class="escala">${S.meta.segmentos
      .map((s, i) => `<span><i style="background:${colSeg(i)};border-radius:50%;width:12px"></i>${esc(s)}</span>`).join("")}</div>
      <p class="nota">Cada punto es un establecimiento. La manufactura se dibuja sobre el comercio para que no quede oculta.</p>`;
  } else if (S.modo === "conteo") {
    const et = [`1 a ${fmt.format(cortes[0] - 1)}`, ...cortes.slice(0, 3).map((c, i) => `${fmt.format(c)} a ${fmt.format(cortes[i + 1] - 1)}`), `${fmt.format(cortes[3])} o más`];
    L.innerHTML = `<h3>Establecimientos por entidad</h3><div class="escala">${seq.map((c, i) => `<span><i style="background:${c}"></i>${et[i]}</span>`).join("")}</div>
      <p class="nota">Clases por quintiles de las entidades. Refleja también el tamaño de la población.</p>`;
  } else {
    L.innerHTML = `<h3>Especialización relativa (CL)</h3>${r.todasCapas
      ? `<p class="nota"><strong>Selecciona uno o varios eslabones</strong> en los filtros: con todos activos el CL vale 1 en todas las entidades.</p>` : ""}
      <div class="escala">${div.map((c, i) => `<span><i style="background:${c}"></i>${CL_ETQ[i]}</span>`).join("")}</div>
      <p class="nota">Peso de los eslabones seleccionados en el total textil-moda de la entidad, dividido entre ese peso a nivel nacional.</p>`;
  }
}

function tooltipMapa(info) {
  if (!info.layer) return null;
  const st = { backgroundColor: cssVar("--superficie"), color: cssVar("--tinta"), border: `1px solid ${cssVar("--borde")}`, borderRadius: "8px", fontSize: "12.5px", padding: "6px 9px", maxWidth: "300px" };
  if (info.layer.id === "puntos" && info.index >= 0) {
    const i = MAPA.puntos.map[info.index], M = S.meta, cl = M.clases[S.clase[i]];
    return { html: `<b>${esc(cl.nombre)}</b><br>${esc(M.capas[S.capa[i]].nombre)} · SCIAN ${cl.codigo}<br>${esc(M.municipios[S.mun[i]][1])}, ${esc(M.entidades[S.munEnt[S.mun[i]]].nombre)}<br>${S.tam[i] < 7 ? esc(M.tamanos[S.tam[i]]) + " personas" : "Tamaño no especificado"}`, style: st };
  }
  if (info.layer.id === "entidades" && info.object) {
    const i = S.entIdx[info.object.properties.cve], r = S.r;
    if (i === undefined) return null;
    const e = S.meta.entidades[i];
    return { html: `<b>${esc(e.nombre)}</b><br>${fmt.format(r.selEnt[i])} establecimientos seleccionados<br>${pct(r.selEnt[i], r.allEnt[i])} del sector en la entidad${r.todasCapas ? "" : `<br>CL: ${r.clEnt[i] == null ? "—" : fmt2.format(r.clEnt[i])}`}`, style: st };
  }
  return null;
}

async function clicMapa(info) {
  if (info.layer && info.layer.id === "entidades" && info.object) {
    $("#f-ent").value = info.object.properties.cve; aplicar(); encuadrarEnt(); return;
  }
  if (!info.layer || info.layer.id !== "puntos" || info.index < 0) return;
  const i = MAPA.puntos.map[info.index], M = S.meta;
  const e = S.munEnt[S.mun[i]], ent = M.entidades[e];
  MAPA.sel = i; pintarMapa();
  const cl = M.clases[S.clase[i]];
  const panel = $("#mapa-info");
  panel.innerHTML = `<h3>Establecimiento</h3><p class="nota">Cargando…</p>`;
  if (!S.detalle[ent.cve]) S.detalle[ent.cve] = await fetch(`data/detalle/${ent.cve}.json`).then((r) => r.json());
  if (MAPA.sel !== i) return;
  const [nom, loc] = S.detalle[ent.cve][i - ent.inicio] || ["", ""];
  panel.innerHTML = `<h3>${esc(nom || "Sin nombre registrado")}</h3><dl>
    <dt>Actividad</dt><dd>${esc(cl.nombre)} (${cl.codigo})</dd>
    <dt>Eslabón</dt><dd>${esc(M.capas[S.capa[i]].nombre)}</dd>
    <dt>Personal</dt><dd>${S.tam[i] < 7 ? esc(M.tamanos[S.tam[i]]) + " personas" : "No especificado"}</dd>
    <dt>Localidad</dt><dd>${esc(loc)}</dd>
    <dt>Municipio</dt><dd>${esc(M.municipios[S.mun[i]][1])}</dd>
    <dt>Entidad</dt><dd>${esc(ent.nombre)}</dd>
    <dt>Alta DENUE</dt><dd>${S.anio[i] < 255 ? M.anio_base + S.anio[i] : "—"}</dd></dl>
    <p><button type="button" class="enlace" data-ficha="${S.mun[i]}">Ver ficha del municipio</button></p>
    <p class="nota">Fuente: DENUE 05/2026. Los datos de contacto se consultan en el propio DENUE.</p>`;
}

function encuadrarEnt() {
  if (!MAPA.map) return;
  if (S.f.ent && MAPA.bboxEnt[S.f.ent]) MAPA.map.fitBounds(MAPA.bboxEnt[S.f.ent], { padding: 30, duration: 700 });
  else MAPA.map.flyTo({ center: [-102.5, 23.6], zoom: 4.2, duration: 700 });
}

function irAMunicipio(m) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90, n = 0;
  const e = S.meta.entidades[S.munEnt[m]];
  for (let i = e.inicio; i < e.fin; i++) {
    if (S.mun[i] !== m) continue;
    const x = S.lon[i], y = S.lat[i];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; n++;
  }
  if (!n) return;
  S.modo = "puntos"; marcarModo();
  cambiarTab("mapa");
  const ir = () => MAPA.map.fitBounds([[x0, y0], [x1, y1]], { padding: 40, maxZoom: 13, duration: 800 });
  if (MAPA.listo) ir(); else MAPA.map.once("load", ir);
}

/* ---------- CADENA DE VALOR ---------- */
// Posición de cada capa en columnas (orden de CAPAS en preparar_datos.py)
const CADENA = {
  cols: ["Insumos", "Transformación", "Distribución", "Venta al público"],
  nodos: { 0: [0, 0], 3: [0, 2], 1: [1, 0], 2: [1, 1], 4: [1, 2], 5: [2, 1], 6: [3, 0], 7: [3, 1], 8: [3, 2], 9: [0, -1] },
  aristas: [[0, 1], [0, 2], [3, 4], [1, 5], [2, 5], [4, 5], [5, 6], [5, 7], [5, 8], [2, 7], [4, 8], [9, 2], [9, 4]],
};
function pintarCadena() {
  const cont = $("#cadena-svg"), r = S.r, M = S.meta;
  leyendaSeg($("#ley-seg2"));
  cont.innerHTML = "";
  const W = Math.max(860, cont.clientWidth), cw = 200, ch = 92, gapY = 26, top = 34;
  const colX = (c) => 12 + c * ((W - 24 - cw) / 3);
  const filaY = (f) => top + (f + 1) * (ch + gapY);
  const H = filaY(2) + ch + 10;
  const svg = el("svg", { width: W, height: H }, cont);
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "punta", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0L10,5L0,10z", fill: cssVar("--eje") }, mk);
  CADENA.cols.forEach((c, i) => { const t = el("text", { x: colX(i), y: top + ch + gapY - 14, class: "col-tit" }, svg); t.textContent = c; });
  const tDis = el("text", { x: colX(0), y: 14, class: "col-tit" }, svg); tDis.textContent = "Diseño";
  const centro = (k) => { const [c, f] = CADENA.nodos[k]; return { x: colX(c), y: filaY(f) }; };
  CADENA.aristas.forEach(([a, b]) => {
    const A = centro(a), B = centro(b);
    let d;
    if (CADENA.nodos[a][0] === CADENA.nodos[b][0]) { // misma columna (diseño → abajo), rodeando por la derecha
      const off = b === 4 ? 44 : 24, xs = A.x + cw - (b === 4 ? 12 : 32), yb = B.y + ch / 2;
      d = `M${xs},${A.y + ch}C${xs},${A.y + ch + 30} ${A.x + cw + off},${A.y + ch + 20} ${A.x + cw + off},${A.y + ch + 60}L${A.x + cw + off},${yb - 20}C${A.x + cw + off},${yb} ${A.x + cw + 12},${yb} ${A.x + cw + 2},${yb}`;
    } else {
      const x1 = A.x + cw, y1 = A.y + ch / 2, x2 = B.x - 2, y2 = B.y + ch / 2, mx = (x1 + x2) / 2;
      d = `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
    }
    el("path", { d, class: "flecha", "marker-end": "url(#punta)" }, svg);
  });
  const maxN = Math.max(1, ...r.porCapaTodas);
  Object.keys(CADENA.nodos).forEach((ks) => {
    const k = +ks, c = M.capas[k], { x, y } = centro(k), activo = S.f.capas.has(k);
    const g = el("g", { class: "nodo" + (activo ? " activo" : ""), tabindex: 0, role: "button", "aria-pressed": activo,
      "aria-label": `${c.nombre}, ${fmt.format(r.porCapaTodas[k])} establecimientos. ${activo ? "Incluido" : "Excluido"} en el filtro.` }, svg);
    el("rect", { x, y, width: cw, height: ch, rx: 8, class: "caja" }, g);
    el("rect", { x, y: y + 8, width: 4, height: ch - 16, rx: 2, fill: colSeg(c.segmento) }, g);
    const t1 = el("text", { x: x + 14, y: y + 22 }, g); t1.textContent = recortar(c.nombre, cw - 24);
    const t2 = el("text", { x: x + 14, y: y + 38, class: "t2" }, g); t2.textContent = "SCIAN " + c.scian;
    const t3 = el("text", { x: x + 14, y: y + 64, class: "t3" }, g); t3.textContent = fmt.format(r.porCapaTodas[k]);
    const tot = r.porCapaTodas.reduce((a, b) => a + b, 0);
    const t4 = el("text", { x: x + cw - 12, y: y + 64, class: "t2", "text-anchor": "end" }, g); t4.textContent = pct(r.porCapaTodas[k], tot);
    const bw = cw - 28;
    el("rect", { x: x + 14, y: y + ch - 16, width: bw, height: 4, rx: 2, class: "pista" }, g);
    el("rect", { x: x + 14, y: y + ch - 16, width: Math.max(2, (bw * r.porCapaTodas[k]) / maxN), height: 4, rx: 2, fill: colSeg(c.segmento) }, g);
    const alternar = () => { S.f.capas.has(k) ? S.f.capas.delete(k) : S.f.capas.add(k); if (!S.f.capas.size) S.f.capas.add(k); sincronizarChips(); aplicar(); };
    g.addEventListener("click", alternar);
    g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); alternar(); } });
    g.addEventListener("mousemove", (ev) => mostrarTip(`<b>${esc(c.nombre)}</b><br>${esc(c.descripcion)}<br>${fmt.format(r.porCapaTodas[k])} establecimientos<br><span class="tt-sub">Clic para ${activo ? "excluir" : "incluir"}</span>`, ev.clientX, ev.clientY));
    g.addEventListener("mouseleave", ocultarTip);
  });

  // Tabla de clases
  const filas = M.clases.map((cl, i) => ({ cl, i })).filter(({ cl }) => S.f.capas.has(cl.capa));
  const totCapa = (c) => r.porCapaTodas[c];
  $("#t-clases").innerHTML = `<thead><tr><th>SCIAN</th><th>Clase de actividad</th><th>Eslabón</th><th class="num">Establecimientos</th><th class="num">% del eslabón</th></tr></thead><tbody>${filas
    .sort((a, b) => a.cl.capa - b.cl.capa || r.porClaseTodas[b.i] - r.porClaseTodas[a.i])
    .map(({ cl, i }) => `<tr><td>${cl.codigo}</td><td class="envolver">${esc(cl.nombre)}</td><td>${esc(M.capas[cl.capa].nombre)}</td><td class="num">${fmt.format(r.porClaseTodas[i])}</td><td class="num">${pct(r.porClaseTodas[i], totCapa(cl.capa))}</td></tr>`).join("")}</tbody>`;
}

/* ---------- filtros UI ---------- */
function construirFiltros() {
  const M = S.meta;
  $("#f-ent").insertAdjacentHTML("beforeend", M.entidades.map((e) => `<option value="${e.cve}">${esc(e.nombre)}</option>`).join(""));
  $("#f-capas").innerHTML = M.capas.map((c, i) => `<button type="button" class="chip" data-capa="${i}" aria-pressed="true" title="SCIAN ${esc(c.scian)} · ${esc(c.descripcion)}"><i class="punto" style="background:${colSeg(c.segmento)}"></i>${esc(c.nombre)}</button>`).join("");
  $("#f-tam").innerHTML = M.tamanos.map((t, i) => `<button type="button" class="chip" data-tam="${i}" aria-pressed="true">${esc(t)}</button>`).join("");

  $("#f-ent").addEventListener("change", () => { aplicar(); encuadrarEnt(); });
  $("#f-capas").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-capa]"); if (!b) return;
    const k = +b.dataset.capa;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) { S.f.capas = new Set([k]); } // solo este
    else { S.f.capas.has(k) ? S.f.capas.delete(k) : S.f.capas.add(k); if (!S.f.capas.size) S.f.capas.add(k); }
    sincronizarChips(); aplicar();
  });
  $("#f-capas-todas").addEventListener("click", () => { M.capas.forEach((_, i) => S.f.capas.add(i)); sincronizarChips(); aplicar(); });
  $("#f-tam").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-tam]"); if (!b) return;
    const k = +b.dataset.tam;
    S.f.tams.has(k) ? S.f.tams.delete(k) : S.f.tams.add(k); if (!S.f.tams.size) S.f.tams.add(k);
    sincronizarChips(); aplicar();
  });
  $("#f-reset").addEventListener("click", () => {
    $("#f-ent").value = ""; M.capas.forEach((_, i) => S.f.capas.add(i)); M.tamanos.forEach((_, i) => S.f.tams.add(i));
    sincronizarChips(); aplicar(); encuadrarEnt();
  });
  $("#mun-buscar").addEventListener("input", pintarMunicipios);
  $("#mun-orden").addEventListener("change", pintarMunicipios);
  $("#t-mun").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-ficha]"); if (b) { abrirFicha(+b.dataset.ficha); return; }
    const tr = ev.target.closest("tr[data-mun]"); if (tr) irAMunicipio(+tr.dataset.mun);
  });
  $("#mapa-info").addEventListener("click", (ev) => { const b = ev.target.closest("[data-ficha]"); if (b) abrirFicha(+b.dataset.ficha); });
  $("#t-mun").addEventListener("keydown", (ev) => { if (ev.target.closest("button")) return; const tr = ev.target.closest("tr[data-mun]"); if (tr && ev.key === "Enter") irAMunicipio(+tr.dataset.mun); });

  document.querySelectorAll(".pestanas button").forEach((b) => b.addEventListener("click", () => cambiarTab(b.dataset.tab)));
  document.querySelectorAll(".segmentado button").forEach((b) => b.addEventListener("click", () => { S.modo = b.dataset.modo; marcarModo(); pintarActual(); }));
}
function sincronizarChips() {
  document.querySelectorAll("#f-capas .chip").forEach((b) => b.setAttribute("aria-pressed", S.f.capas.has(+b.dataset.capa)));
  document.querySelectorAll("#f-tam .chip").forEach((b) => b.setAttribute("aria-pressed", S.f.tams.has(+b.dataset.tam)));
}
function marcarModo() { document.querySelectorAll(".segmentado button").forEach((b) => b.setAttribute("aria-checked", b.dataset.modo === S.modo)); }

const TABS = ["panorama", "mapa", "cadena", "perfil", "comercio", "ficha"];
function cambiarTab(t) {
  S.tab = t;
  document.querySelectorAll(".pestanas button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
  TABS.forEach((n) => ($("#tab-" + n).hidden = n !== t));
  // Filtros: el comercio exterior y la ficha municipal no los usan; el perfil CE2024 no usa el tamaño
  $(".filtros").hidden = t === "comercio" || t === "ficha";
  $("#filtro-tam").classList.toggle("inactivo", t === "perfil");
  try { localStorage.setItem("obs-tab", t); } catch (e) { /* sin almacenamiento */ }
  pintarActual();
  if (t === "mapa") { iniciarMapa(); MAPA.map.resize(); }
}

function aplicar() {
  S.f.ent = $("#f-ent").value;
  MAPA.sel = null;
  calcular();
  pintarActual();
}
/* Estado en la URL: #mapa&ent=11&capas=2,4&tam=0,1&modo=cl (para compartir vistas) */
function escribirHash() {
  const M = S.meta, p = [S.tab];
  if (S.f.ent) p.push("ent=" + S.f.ent);
  if (S.f.capas.size < M.capas.length) p.push("capas=" + [...S.f.capas].sort((a, b) => a - b).join(","));
  if (S.f.tams.size < M.tamanos.length) p.push("tam=" + [...S.f.tams].sort((a, b) => a - b).join(","));
  if (S.modo !== "puntos") p.push("modo=" + S.modo);
  if (S.tab === "perfil" && S.ind !== "po") p.push("ind=" + S.ind);
  if (S.tab === "ficha" && S.fichaMun != null) p.push("mun=" + S.meta.municipios[S.fichaMun][0]);
  try { history.replaceState(null, "", "#" + p.join("&")); } catch (e) { /* nada */ }
}
function leerHash() {
  const partes = location.hash.slice(1).split("&").filter(Boolean);
  if (!partes.length) return null;
  const M = S.meta, lista = (v, n) => v.split(",").map(Number).filter((x) => x >= 0 && x < n);
  let tab = null;
  for (const p of partes) {
    const [k, v = ""] = p.split("=");
    if (TABS.includes(k)) tab = k;
    else if (k === "ind" && IND[v]) S.ind = v;
    else if (k === "mun") { const m = M.municipios.findIndex((x) => x[0] === v); if (m >= 0) S.fichaMun = m; }
    else if (k === "ent" && S.entIdx[v] !== undefined) $("#f-ent").value = v;
    else if (k === "capas") { const l = lista(v, M.capas.length); if (l.length) S.f.capas = new Set(l); }
    else if (k === "tam") { const l = lista(v, M.tamanos.length); if (l.length) S.f.tams = new Set(l); }
    else if (k === "modo" && ["puntos", "conteo", "cl"].includes(v)) S.modo = v;
  }
  S.f.ent = $("#f-ent").value;
  sincronizarChips(); marcarModo();
  return tab;
}

function pintarActual() {
  escribirHash();
  if (S.tab === "panorama") pintarPanorama();
  else if (S.tab === "mapa") pintarMapa();
  else if (S.tab === "cadena") pintarCadena();
  else if (S.tab === "perfil") pintarPerfil();
  else if (S.tab === "comercio") pintarComercio();
  else pintarFicha();
}

/* ---------- arranque ---------- */
(async function () {
  tip.el = $("#tooltip");
  try {
    await cargar();
  } catch (e) {
    $("#cargando").innerHTML = `No se pudieron cargar los datos. Abre la app con <code>iniciar_app.bat</code> (servidor local); los navegadores bloquean la lectura de archivos con doble clic.<br><small>${esc(e.message)}</small>`;
    return;
  }
  $("#cargando").remove();
  construirFiltros();
  construirFase2();
  let t0 = leerHash();
  calcular();
  if (!t0) { try { t0 = localStorage.getItem("obs-tab"); } catch (e) { /* nada */ } }
  t0 = t0 || "panorama";
  cambiarTab(t0);
  let pend;
  new ResizeObserver(() => { clearTimeout(pend); pend = setTimeout(() => { if (S.tab !== "mapa") pintarActual(); }, 120); }).observe(document.querySelector("main"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    pintarActual(); leyendaSeg($("#ley-seg"));
    if (MAPA.map) { MAPA.listo = false; MAPA.map.setStyle(estiloBase()); MAPA.map.once("styledata", () => { MAPA.listo = true; pintarMapa(); }); }
  });
})();
