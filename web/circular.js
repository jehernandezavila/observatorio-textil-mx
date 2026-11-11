/* Observatorio Textil, Moda y Calzado MX — Economía circular
 * Recuperadores, acopiadores y comercios de usados del DENUE (preparar_circular.py)
 * cruzados con las plantas manufactureras grandes del Observatorio.
 * Usa el estado S, MAPA (estilos) y las utilidades de app.js.
 *
 * Solo la clase 314993 es exclusivamente textil. En las demás, la "marca" indica
 * que el nombre del establecimiento menciona textiles, piel, ropa o calzado:
 * es indicativa y no mide qué materiales recibe.
 */
"use strict";

// Grupos funcionales: clase (índice en circular.json) -> grupo
const C_GRUPO = [0, 1, 2, 2, 3];
const C_GRUPOS = [
  { nombre: "Transformación textil", corto: "Transformación", desc: "SCIAN 314993, productos textiles reciclados (borras y estopas)" },
  { nombre: "Acopio mayorista de desechos", corto: "Acopio", desc: "SCIAN 434319, comercio al por mayor de materiales de desecho" },
  { nombre: "Recuperación de residuos", corto: "Recuperación", desc: "SCIAN 562921 (privada) y 562922 (pública)" },
  { nombre: "Comercio de artículos usados", corto: "Reúso", desc: "SCIAN 466410, ropa, calzado y otros artículos usados" },
];
// Paleta validada (todos los pares, claro y oscuro); el reúso va en gris neutro
const C_COL = { claro: ["#1baf7a", "#6250d6", "#e34948", "#8a8981"], oscuro: ["#199e70", "#9085e9", "#e66767", "#6b6a64"] };
const colGrupo = (g) => C_COL[esOscuro() ? "oscuro" : "claro"][g];
const sinAcentos = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const CI = {
  datos: null, cargando: null,
  grupos: new Set([0, 1, 2, 3]), soloMarca: false, plantas: true,
  map: null, overlay: null, listo: false, sel: null, puntos: null,
  r: null, munBig: null, filasDir: [],
};

async function cargarCircular() {
  if (CI.datos) return;
  if (!CI.cargando) CI.cargando = fetch("data/circular.json").then((r) => r.json()).then((d) => {
    const n = d.c.length;
    d.n = n;
    d.lon = Float32Array.from(d.x); d.lat = Float32Array.from(d.y);
    d.ent = d.municipios.map((m) => m[0].slice(0, 2));
    d.mEnt = Uint8Array.from(d.m, (m) => S.entIdx[d.ent[m]] ?? 255);
    d.busca = d.nom.map((s, i) => sinAcentos(s + " " + d.municipios[d.m[i]][1]));
    CI.datos = d;
    // Plantas manufactureras de más de 30 personas por municipio (cve -> [textil, cuero y calzado])
    const big = {}, M = S.meta;
    for (let i = 0; i < S.n; i++) {
      const seg = M.capas[S.capa[i]].segmento;
      if (seg > 1 || S.tam[i] < 3 || S.tam[i] === 255) continue;
      const cve = M.municipios[S.mun[i]][0];
      (big[cve] = big[cve] || [0, 0])[seg]++;
    }
    CI.munBig = big;
  });
  await CI.cargando;
}

/* ---------- filtro ---------- */
function calcularCircular() {
  const d = CI.datos, n = d.n, nE = S.meta.entidades.length;
  const entSel = S.f.ent === "" ? -1 : S.entIdx[S.f.ent];
  const tamOk = new Uint8Array(256); tamOk[255] = 1; S.f.tams.forEach((t) => (tamOk[t] = 1));
  const porClase = new Uint32Array(5), porClaseMarca = Array.from({ length: 5 }, () => new Uint32Array(5));
  const porEnt = new Uint32Array(nE), porMun = new Uint32Array(d.municipios.length);
  const idx = new Uint32Array(n); let k = 0;
  const munCls = new Map(); // cve -> [transf, acopio, acopio marcado, recup, usados]
  for (let i = 0; i < n; i++) {
    if (entSel >= 0 && d.mEnt[i] !== entSel) continue;
    if (!tamOk[d.t[i]]) continue;
    const c = d.c[i], g = C_GRUPO[c], f = d.f[i];
    porClase[c]++; porClaseMarca[c][f]++;
    const cve = d.municipios[d.m[i]][0];
    let mc = munCls.get(cve); if (!mc) munCls.set(cve, (mc = [0, 0, 0, 0, 0]));
    if (g === 0) mc[0]++; else if (g === 1) { mc[1]++; if (f) mc[2]++; } else if (g === 2) { mc[3]++; if (f) mc[2]++; } else mc[4]++;
    if (!CI.grupos.has(g)) continue;
    if (CI.soloMarca && !f) continue;
    idx[k++] = i;
    if (d.mEnt[i] < 255) porEnt[d.mEnt[i]]++;
    porMun[d.m[i]]++;
  }
  CI.r = { idx: idx.subarray(0, k), k, porClase, porClaseMarca, porEnt, porMun, munCls, entSel };
}

/* ---------- pintar ---------- */
async function pintarCircular() {
  if (!CI.datos) {
    $("#ci-kpis").innerHTML = `<p class="nota">Cargando 66 mil establecimientos de reciclaje, acopio y reúso…</p>`;
    try { await cargarCircular(); } catch (e) { $("#ci-kpis").innerHTML = `<p class="nota">No se pudieron cargar los datos: ${esc(e.message)}</p>`; return; }
    if (S.tab !== "circular") return;
    iniciarMapaCI();
  }
  calcularCircular();
  const r = CI.r, d = CI.datos, M = S.meta, pc = r.porClase, pm = r.porClaseMarca;
  const ambito = S.f.ent ? M.entidades[r.entSel].nombre : "México";
  $("#ci-kpis").innerHTML = [
    { g: 0, val: pc[0], sub: "Todos textiles · " + ambito },
    { g: 1, val: pc[1], sub: `${fmt.format(pm[1][1])} con nombre textil · ${fmt.format(pm[1][2])} de piel o cuero` },
    { g: 2, val: pc[2] + pc[3], sub: `${fmt.format(pc[2])} privados, ${fmt.format(pc[3])} públicos · ${fmt.format(pm[2][1] + pm[3][1])} con nombre textil` },
    { g: 3, val: pc[4], sub: `${fmt.format(pm[4][3])} con nombre de ropa o pacas · ${fmt.format(pm[4][4])} de calzado` },
  ].map((x) => `<div class="kpi"><div class="etq"><i class="punto" style="background:${colGrupo(x.g)}"></i>${esc(C_GRUPOS[x.g].nombre)}</div><div class="val">${fmt.format(x.val)}</div><div class="sub">${esc(x.sub)}</div></div>`).join("");

  document.querySelectorAll("#ci-grupos .chip").forEach((b) => {
    b.setAttribute("aria-pressed", CI.grupos.has(+b.dataset.g));
    b.querySelector(".punto").style.background = colGrupo(+b.dataset.g);
  });
  $("#ci-marca").checked = CI.soloMarca;
  $("#ci-plantas").checked = CI.plantas;

  pintarMapaCI();
  pintarEntCI();
  pintarMunCI();
  pintarDirCI();
}

function pintarEntCI() {
  const r = CI.r, d = CI.datos, M = S.meta;
  let filas, tit;
  if (S.f.ent) {
    tit = "Municipios con más establecimientos seleccionados · " + M.entidades[r.entSel].nombre;
    filas = [];
    r.porMun.forEach((v, m) => { if (v) filas.push({ etq: d.municipios[m][1], v }); });
  } else {
    tit = "Entidades con más establecimientos seleccionados";
    filas = M.entidades.map((e, i) => ({ etq: e.nombre, v: r.porEnt[i] }));
  }
  filas.sort((a, b) => b.v - a.v);
  $("#ci-g-ent-tit").textContent = tit;
  graficaH($("#ci-g-ent"), filas.slice(0, 15).map((f) => ({
    etq: f.etq, valor: f.v, color: cssVar("--barra"), tip: `<b>${esc(f.etq)}</b><br>${fmt.format(f.v)} establecimientos (${pct(f.v, r.k)})`,
  })), { anchoEtq: 170 });
  $("#ci-t-ent").innerHTML = tablaHTML([{ t: S.f.ent ? "Municipio" : "Entidad" }, { t: "Establecimientos", num: 1 }, { t: "%", num: 1 }],
    filas.filter((f) => f.v).map((f) => [f.etq, fmt.format(f.v), pct(f.v, r.k)]));
}

function pintarMunCI() {
  const r = CI.r, M = S.meta, big = CI.munBig;
  const filas = [];
  for (const [cve, b] of Object.entries(big)) {
    if (S.f.ent && cve.slice(0, 2) !== S.f.ent) continue;
    const mc = r.munCls.get(cve) || [0, 0, 0, 0, 0];
    filas.push({ cve, b, mc });
  }
  const orden = $("#ci-mun-orden").value;
  const clave = { total: (f) => f.b[0] + f.b[1], textil: (f) => f.b[0], cuero: (f) => f.b[1] }[orden];
  filas.sort((a, b) => clave(b) - clave(a) || (b.b[0] + b.b[1]) - (a.b[0] + a.b[1]));
  const nombre = CI._munNom || (CI._munNom = Object.fromEntries(M.municipios.map((m, i) => [m[0], [m[1], M.entidades[S.munEnt[i]].nombre, i]])));
  const top = filas.filter((f) => clave(f) > 0).slice(0, 60);
  const cero = (v, cls = "") => `<td class="num ${v ? cls : "cero"}">${fmt.format(v)}</td>`;
  $("#ci-t-mun").innerHTML = `<thead><tr><th>Municipio</th>${S.f.ent ? "" : "<th>Entidad</th>"}<th class="num" title="Plantas textiles y de confección con más de 30 personas">Plantas textiles</th><th class="num" title="Plantas de curtido, calzado y bolsos con más de 30 personas">Plantas cuero y calzado</th><th class="num" title="SCIAN 314993">Transfor&shy;madores</th><th class="num" title="SCIAN 434319, todos">Acopia&shy;dores</th><th class="num" title="Acopiadores (434319) o recuperadores con nombre textil o de piel">Acopio textil o piel</th><th class="num" title="SCIAN 562921 y 562922">Recupera&shy;dores</th><th class="num" title="SCIAN 466410">Usados</th></tr></thead><tbody>${top
    .map((f) => {
      const [nm, en, i] = nombre[f.cve] || [f.cve, "", -1];
      return `<tr class="clic" tabindex="0" data-mun="${i}"><td>${esc(nm)}</td>${S.f.ent ? "" : `<td>${esc(en)}</td>`}${cero(f.b[0])}${cero(f.b[1])}${cero(f.mc[0], "cl-alto")}${cero(f.mc[1])}${cero(f.mc[2], "cl-alto")}${cero(f.mc[3])}${cero(f.mc[4])}</tr>`;
    }).join("")}</tbody>`;
}

function filasDirectorio() {
  const r = CI.r, d = CI.datos;
  const q = sinAcentos($("#ci-buscar").value.trim());
  const out = [];
  for (let t = 0; t < r.k; t++) {
    const i = r.idx[t];
    if (q && !d.busca[i].includes(q)) continue;
    out.push(i);
  }
  // Primero transformación, recuperación y acopio marcados; luego el resto
  const peso = (i) => [0, 2, 1, 1, 4][d.c[i]] - (d.f[i] ? 0.5 : 0);
  out.sort((a, b) => peso(a) - peso(b) || d.nom[a].localeCompare(d.nom[b], "es"));
  return out;
}

const MAX_DIR = 300;
function pintarDirCI() {
  const d = CI.datos, M = S.meta;
  const filas = filasDirectorio();
  CI.filasDir = filas;
  const vista = filas.slice(0, MAX_DIR);
  $("#ci-dir-nota").textContent = filas.length > MAX_DIR
    ? `Se muestran ${fmt.format(MAX_DIR)} de ${fmt.format(filas.length)} establecimientos. Busca por nombre o municipio, o descarga el CSV completo.`
    : `${fmt.format(filas.length)} establecimientos.`;
  $("#ci-t-dir").innerHTML = `<thead><tr><th>Nombre</th><th>Actividad</th><th>Marca por nombre</th><th>Personal</th><th>Municipio</th><th>Entidad</th><th>Teléfono</th></tr></thead><tbody>${vista
    .map((i) => {
      const det = d.det[i] || ["", ""], mu = d.municipios[d.m[i]];
      return `<tr class="clic" tabindex="0" data-ci="${i}"><td class="envolver"><i class="punto-ci" style="background:${colGrupo(C_GRUPO[d.c[i]])}"></i>${esc(d.nom[i] || "Sin nombre")}</td><td>${esc(C_GRUPOS[C_GRUPO[d.c[i]]].corto)} · ${d.clases[d.c[i]].codigo}</td><td>${d.f[i] ? esc(d.marcas[d.f[i]].replace("Nombre ", "")) : ""}</td><td>${d.t[i] < 7 ? esc(M.tamanos[d.t[i]]) : "—"}</td><td>${esc(mu[1])}</td><td>${esc(mu[2])}</td><td>${esc(det[1] || "")}</td></tr>`;
    }).join("")}</tbody>`;
}

function descargarCSV() {
  const d = CI.datos, M = S.meta;
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const enc = ["scian", "actividad", "grupo", "marca_por_nombre", "nombre", "personal_ocupado", "domicilio", "telefono", "correo", "sitio_web", "municipio", "entidad", "cvegeo", "longitud", "latitud"];
  const lineas = [enc.join(",")];
  for (const i of CI.filasDir) {
    const cl = d.clases[d.c[i]], det = d.det[i] || ["", "", "", ""], mu = d.municipios[d.m[i]];
    lineas.push([cl.codigo, cl.nombre, C_GRUPOS[C_GRUPO[d.c[i]]].nombre, d.f[i] ? d.marcas[d.f[i]] : "", d.nom[i], d.t[i] < 7 ? M.tamanos[d.t[i]] + " personas" : "",
      det[0], det[1], det[2], det[3], mu[1], mu[2], mu[0], d.lon[i].toFixed(5), d.lat[i].toFixed(5)].map(q).join(","));
  }
  const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `economia_circular_${S.f.ent || "nacional"}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- mapa ---------- */
function iniciarMapaCI() {
  if (CI.map) return;
  if (!Object.keys(MAPA.bboxEnt).length) {
    S.geo.features.forEach((f) => {
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      const recorre = (c) => (typeof c[0] === "number" ? (x0 = Math.min(x0, c[0]), x1 = Math.max(x1, c[0]), y0 = Math.min(y0, c[1]), y1 = Math.max(y1, c[1])) : c.forEach(recorre));
      recorre(f.geometry.coordinates);
      MAPA.bboxEnt[f.properties.cve] = [[x0, y0], [x1, y1]];
    });
  }
  const map = new maplibregl.Map({
    container: "mapa-ci", style: estiloBase(), center: [-102.5, 23.6], zoom: 4.2, minZoom: 3, maxZoom: 17,
    attributionControl: { compact: true },
  });
  let caido = false;
  map.on("error", (e) => { if (!caido && !map.isStyleLoaded()) { caido = true; map.setStyle(estiloVacio()); } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  CI.overlay = new deck.MapboxOverlay({ interleaved: false, layers: [], getTooltip: tooltipCI, onClick: clicCI });
  map.addControl(CI.overlay);
  CI.map = map;
  map.on("load", () => {
    CI.listo = true; pintarMapaCI();
    if (S.f.ent && MAPA.bboxEnt[S.f.ent]) map.fitBounds(MAPA.bboxEnt[S.f.ent], { padding: 30, duration: 0 });
  });
}

function pintarMapaCI() {
  pintarLeyendaCI();
  if (!CI.listo) return;
  const d = CI.datos, r = CI.r, oscuro = esOscuro();
  const rgb = [0, 1, 2, 3].map((g) => hexRgb(colGrupo(g)));
  // Reúso (fondo) y recuperadores (encima) en dos capas para darles tamaños distintos
  const usados = [], otros = [];
  for (let t = 0; t < r.k; t++) { const i = r.idx[t]; (d.c[i] === 4 ? usados : otros).push(i); }
  const capas = [];
  const rgbBorde = hexRgb(oscuro ? "#6b6a64" : "#8a8981");
  capas.push(new deck.GeoJsonLayer({
    id: "ci-entidades", data: S.geo, stroked: true, filled: false, getLineColor: (f) => (S.f.ent && f.properties.cve === S.f.ent ? hexRgb(cssVar("--tinta")) : rgbBorde),
    getLineWidth: (f) => (S.f.ent && f.properties.cve === S.f.ent ? 2.5 : 0.8), lineWidthUnits: "pixels", updateTriggers: { getLineColor: [S.f.ent, oscuro], getLineWidth: [S.f.ent] },
  }));
  if (CI.plantas) {
    const pl = [];
    const entSel = S.f.ent === "" ? -1 : S.entIdx[S.f.ent];
    for (let i = 0; i < S.n; i++) {
      if (S.tam[i] < 3 || S.tam[i] === 255) continue;
      const seg = S.meta.capas[S.capa[i]].segmento;
      if (seg > 1) continue;
      if (entSel >= 0 && S.munEnt[S.mun[i]] !== entSel) continue;
      pl.push(i);
    }
    capas.push(new deck.ScatterplotLayer({
      id: "ci-plantas", data: pl, getPosition: (i) => [S.lon[i], S.lat[i]], radiusUnits: "pixels", getRadius: 4.5,
      filled: false, stroked: true, lineWidthUnits: "pixels", getLineWidth: 1.4,
      getLineColor: (i) => [...hexRgb(colSeg(S.meta.capas[S.capa[i]].segmento)), 230], pickable: true,
      updateTriggers: { getLineColor: [oscuro] },
    }));
  }
  capas.push(new deck.ScatterplotLayer({
    id: "ci-usados", data: usados, getPosition: (i) => [d.lon[i], d.lat[i]], radiusUnits: "meters", getRadius: 80,
    radiusMinPixels: 1.2, radiusMaxPixels: 5, getFillColor: (i) => [...rgb[3], d.f[i] ? 200 : 140], pickable: true,
    autoHighlight: true, highlightColor: [255, 255, 255, 220], updateTriggers: { getFillColor: [oscuro] },
  }));
  capas.push(new deck.ScatterplotLayer({
    id: "ci-otros", data: otros, getPosition: (i) => [d.lon[i], d.lat[i]], radiusUnits: "pixels", getRadius: (i) => (d.f[i] ? 5.5 : 3.6),
    getFillColor: (i) => [...rgb[C_GRUPO[d.c[i]]], 235], stroked: true, lineWidthUnits: "pixels",
    getLineWidth: (i) => (d.f[i] ? 2 : 0.6), getLineColor: (i) => (d.f[i] ? hexRgb(cssVar("--tinta")) : hexRgb(cssVar("--superficie"))),
    pickable: true, autoHighlight: true, highlightColor: [255, 255, 255, 220], updateTriggers: { getFillColor: [oscuro], getLineColor: [oscuro] },
  }));
  if (CI.sel != null) {
    const i = CI.sel;
    capas.push(new deck.ScatterplotLayer({
      id: "ci-sel", data: [i], getPosition: (i) => [d.lon[i], d.lat[i]], getRadius: 9, radiusUnits: "pixels",
      stroked: true, filled: false, getLineColor: hexRgb(cssVar("--tinta")), lineWidthMinPixels: 2,
    }));
  }
  CI.overlay.setProps({ layers: capas });
}

function pintarLeyendaCI() {
  const r = CI.r;
  $("#ci-leyenda").innerHTML = `<h3>${fmt.format(r.k)} establecimientos</h3><div class="escala escala-col">${C_GRUPOS
    .map((g, i) => `<span${CI.grupos.has(i) ? "" : ' class="apagado"'}><i style="background:${colGrupo(i)};border-radius:50%;width:12px"></i>${esc(g.nombre)}</span>`).join("")}
    <span><i class="aro"></i>Con nombre textil o de piel</span>
    ${CI.plantas ? `<span><i class="aro" style="border-color:${colSeg(0)}"></i>Planta textil de más de 30 personas</span><span><i class="aro" style="border-color:${colSeg(1)}"></i>Planta de cuero y calzado de más de 30 personas</span>` : ""}</div>
    <p class="nota">Los comercios de usados se dibujan debajo y en gris para no tapar a los recuperadores.</p>`;
}

const estiloTip = () => ({ backgroundColor: cssVar("--superficie"), color: cssVar("--tinta"), border: `1px solid ${cssVar("--borde")}`, borderRadius: "8px", fontSize: "12.5px", padding: "6px 9px", maxWidth: "300px" });
function tooltipCI(info) {
  if (!info.layer || info.index < 0 || info.object == null) return null;
  const d = CI.datos, M = S.meta;
  if (info.layer.id === "ci-plantas") {
    const i = info.object, cl = M.clases[S.clase[i]];
    return { html: `<b>Planta manufacturera</b><br>${esc(cl.nombre)}<br>${esc(M.tamanos[S.tam[i]])} personas · ${esc(M.municipios[S.mun[i]][1])}`, style: estiloTip() };
  }
  if (info.layer.id !== "ci-usados" && info.layer.id !== "ci-otros") return null;
  const i = info.object, mu = d.municipios[d.m[i]];
  return { html: `<b>${esc(d.nom[i] || "Sin nombre")}</b><br>${esc(d.clases[d.c[i]].nombre)} (${d.clases[d.c[i]].codigo})${d.f[i] ? `<br>${esc(d.marcas[d.f[i]])}` : ""}<br>${esc(mu[1])}, ${esc(mu[2])}`, style: estiloTip() };
}
function clicCI(info) {
  if (!info.layer || info.object == null) return;
  if (info.layer.id === "ci-usados" || info.layer.id === "ci-otros") mostrarDetalleCI(info.object);
}
function mostrarDetalleCI(i) {
  const d = CI.datos, M = S.meta, det = d.det[i] || null, mu = d.municipios[d.m[i]], cl = d.clases[d.c[i]];
  CI.sel = i; pintarMapaCI();
  $("#ci-info").innerHTML = `<h3>${esc(d.nom[i] || "Sin nombre registrado")}</h3><dl>
    <dt>Actividad</dt><dd>${esc(cl.nombre)} (${cl.codigo})</dd>
    <dt>Función</dt><dd>${esc(cl.funcion)}</dd>
    ${d.f[i] ? `<dt>Marca</dt><dd>${esc(d.marcas[d.f[i]])}</dd>` : ""}
    <dt>Personal</dt><dd>${d.t[i] < 7 ? esc(M.tamanos[d.t[i]]) + " personas" : "No especificado"}</dd>
    ${det && det[0] ? `<dt>Domicilio</dt><dd>${esc(det[0])}</dd>` : ""}
    ${det && det[1] ? `<dt>Teléfono</dt><dd>${esc(det[1])}</dd>` : ""}
    ${det && det[2] ? `<dt>Correo</dt><dd>${esc(det[2])}</dd>` : ""}
    ${det && det[3] ? `<dt>Sitio web</dt><dd>${esc(det[3])}</dd>` : ""}
    <dt>Municipio</dt><dd>${esc(mu[1])}</dd><dt>Entidad</dt><dd>${esc(mu[2])}</dd></dl>
    <p class="nota">Fuente: DENUE 05/2026. Verifica con el establecimiento qué materiales recibe y en qué volumen.</p>`;
}
function irAMunCI(m) {
  if (m < 0 || !CI.map) return;
  const cve = S.meta.municipios[m][0], d = CI.datos;
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90, n = 0;
  const suma = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); n++; };
  for (let i = 0; i < S.n; i++) if (S.mun[i] === m) suma(S.lon[i], S.lat[i]);
  for (let i = 0; i < d.n; i++) if (d.municipios[d.m[i]][0] === cve) suma(d.lon[i], d.lat[i]);
  if (!n) return;
  CI.map.fitBounds([[x0, y0], [x1, y1]], { padding: 40, maxZoom: 13, duration: 800 });
  $("#mapa-ci").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- controles ---------- */
function construirCircular() {
  $("#ci-grupos").innerHTML = C_GRUPOS.map((g, i) => `<button type="button" class="chip" data-g="${i}" aria-pressed="true" title="${esc(g.desc)}"><i class="punto"></i>${esc(g.nombre)}</button>`).join("");
  $("#ci-grupos").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-g]"); if (!b) return;
    const g = +b.dataset.g;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) CI.grupos = new Set([g]);
    else { CI.grupos.has(g) ? CI.grupos.delete(g) : CI.grupos.add(g); if (!CI.grupos.size) CI.grupos.add(g); }
    CI.sel = null; pintarActual();
  });
  $("#ci-marca").addEventListener("change", (ev) => { CI.soloMarca = ev.target.checked; CI.sel = null; pintarActual(); });
  $("#ci-plantas").addEventListener("change", (ev) => { CI.plantas = ev.target.checked; pintarMapaCI(); });
  let pend;
  $("#ci-buscar").addEventListener("input", () => { clearTimeout(pend); pend = setTimeout(pintarDirCI, 150); });
  $("#ci-csv").addEventListener("click", descargarCSV);
  $("#ci-mun-orden").addEventListener("change", pintarMunCI);
  $("#ci-t-dir").addEventListener("click", (ev) => {
    const tr = ev.target.closest("tr[data-ci]"); if (!tr) return;
    const i = +tr.dataset.ci, d = CI.datos;
    mostrarDetalleCI(i);
    if (CI.map) CI.map.flyTo({ center: [d.lon[i], d.lat[i]], zoom: Math.max(CI.map.getZoom(), 13), duration: 800 });
    $("#mapa-ci").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#ci-t-mun").addEventListener("click", (ev) => { const tr = ev.target.closest("tr[data-mun]"); if (tr) irAMunCI(+tr.dataset.mun); });
  for (const id of ["#ci-t-dir", "#ci-t-mun"]) {
    $(id).addEventListener("keydown", (ev) => { if (ev.key === "Enter") ev.target.closest("tr")?.click(); });
  }
}
function encuadrarCI() {
  if (!CI.map || !CI.listo) return;
  if (S.f.ent && MAPA.bboxEnt[S.f.ent]) CI.map.fitBounds(MAPA.bboxEnt[S.f.ent], { padding: 30, duration: 600 });
  else CI.map.flyTo({ center: [-102.5, 23.6], zoom: 4.2, duration: 600 });
}
