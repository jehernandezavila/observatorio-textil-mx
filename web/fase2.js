/* Observatorio Textil, Moda y Calzado MX — Fase 2
 * Perfil económico (Censos Económicos 2024), Comercio exterior (UN Comtrade)
 * y Ficha municipal. Usa el estado S y las utilidades de app.js.
 *
 * Confidencialidad: un agregado de varias clases es la suma de las clases
 * publicadas; "cobertura" = unidades económicas con dato publicado / total.
 * Si la cobertura es < 100 % el valor se marca como parcial (≥, barra clara).
 * Los cocientes (productividad, remuneración media…) se calculan solo con las
 * clases publicadas y se omiten si la cobertura es menor a COB_MIN.
 */
"use strict";

const COB_MIN = 0.5;
const fmt0 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const mdp = (v) => (v >= 100 ? fmt0.format(v) : fmt1.format(v));
const VAR = { UE: 0, H001A: 1, H010A: 2, J000A: 3, A111A: 4, A131A: 5, M000A: 6, Q000A: 7 };

/* ---------- agregación con confidencialidad ---------- */
function aggVacio() { return { UE: 0, UEpub: 0, H001A: 0, H010A: 0, J000A: 0, A111A: 0, A131A: 0, M000A: 0, Q000A: 0, n: 0 }; }
/** Suma filas de clase [ci, UE, H001A, …] (null = no publicado) */
function aggClases(filas, ok) {
  const a = aggVacio();
  for (const f of filas) {
    if (!ok(f[0])) continue;
    a.UE += f[1]; a.n++;
    if (f[2] == null) continue;
    a.UEpub += f[1];
    a.H001A += f[2]; a.H010A += f[3]; a.J000A += f[4]; a.A111A += f[5]; a.A131A += f[6]; a.M000A += f[7]; a.Q000A += f[8];
  }
  a.cob = a.UE ? a.UEpub / a.UE : 0;
  return a;
}
/** Suma filas municipales por eslabón [capa, UE, UEpub, H001A, …] */
function aggMun(filas, ok) {
  const a = aggVacio();
  for (const f of filas || []) {
    if (!ok(f[0])) continue;
    a.UE += f[1]; a.n++;
    if (!f[2]) continue;
    a.UEpub += f[2];
    a.H001A += f[3]; a.H010A += f[4]; a.J000A += f[5]; a.A111A += f[6]; a.A131A += f[7]; a.M000A += f[8]; a.Q000A += f[9];
  }
  a.cob = a.UE ? a.UEpub / a.UE : 0;
  return a;
}
function filasNac() { return S.ce._nac || (S.ce._nac = S.ce.nacional.map((v, ci) => [ci, ...v])); }
function filasEnt(cve) { return S.ce.estatal[cve] || []; }
const capaDeClase = (ci) => S.meta.clases[ci].capa;

/* ---------- indicadores ---------- */
const IND = {
  po: { etq: "Personal ocupado", corto: "Personal ocupado", ext: true, f: (a) => a.H001A, fmt: (v) => fmt.format(Math.round(v)), tick: compacto,
    def: "Personas que trabajaron en las unidades económicas en 2023, remuneradas o no." },
  va: { etq: "Valor agregado censal bruto", corto: "Valor agregado", ext: true, f: (a) => a.A131A, fmt: (v) => mdp(v) + " mdp", tick: (v) => fmt.format(v),
    def: "Valor que se añade en el proceso productivo, en millones de pesos de 2023 (mdp)." },
  prod: { etq: "Productividad laboral", corto: "Productividad", f: (a) => (a.H001A ? (a.A131A * 1000) / a.H001A : null), fmt: (v) => fmt.format(Math.round(v)) + " mil $", tick: (v) => fmt.format(v),
    def: "Valor agregado por persona ocupada, en miles de pesos de 2023 al año." },
  rem: { etq: "Remuneración media anual", corto: "Remuneración media", f: (a) => (a.H010A ? (a.J000A * 1000) / a.H010A : null), fmt: (v) => fmt.format(Math.round(v)) + " mil $", tick: (v) => fmt.format(v),
    def: "Remuneraciones por persona remunerada, en miles de pesos de 2023 al año (incluye prestaciones y contribuciones)." },
  remu: { etq: "Personal remunerado", corto: "% remunerado", f: (a) => (a.H001A ? (100 * a.H010A) / a.H001A : null), fmt: (v) => fmt1.format(v) + " %", tick: (v) => fmt.format(v) + " %",
    def: "Porcentaje del personal ocupado que recibe un sueldo. Un valor bajo indica negocios atendidos por propietarios y familiares." },
  ue: { etq: "Unidades económicas", corto: "Unidades económicas", ext: true, completo: true, f: (a) => a.UE, fmt: (v) => fmt.format(v), tick: compacto,
    def: "Unidades económicas censadas en 2023 (no equivalen a establecimientos del DENUE 2026)." },
};
/** Valor de un indicador con su estado: {v, parcial} o null si no hay base suficiente */
function valorInd(k, a) {
  const I = IND[k];
  if (!a.UE) return null;
  if (I.completo) return { v: I.f(a), parcial: false };
  if (!a.UEpub || (!I.ext && a.cob < COB_MIN)) return null;
  const v = I.f(a);
  // Solo los totales son "mínimos" cuando faltan clases; un cociente parcial es una estimación con las clases publicadas
  return v == null ? null : { v, parcial: !!I.ext && a.cob < 0.9995 };
}
const txtInd = (k, x) => (x == null ? "C" : (x.parcial && IND[k].ext ? "≥ " : "") + IND[k].fmt(x.v));
const txtCob = (a) => (a.cob >= 0.9995 ? "Datos publicados para todas las unidades" : `Datos publicados para ${fmt1.format(100 * a.cob)} % de las unidades`);

/* ---------- PERFIL ECONÓMICO ---------- */
function construirFase2() {
  $("#p-ind").innerHTML = Object.entries(IND).map(([k, I]) => `<button role="radio" aria-checked="${k === S.ind}" data-ind="${k}">${esc(I.corto)}</button>`).join("");
  $("#p-ind").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-ind]"); if (!b) return;
    S.ind = b.dataset.ind;
    document.querySelectorAll("#p-ind button").forEach((x) => x.setAttribute("aria-checked", x.dataset.ind === S.ind));
    pintarActual();
  });
  // Comercio: años
  const C = S.comercio;
  S.anioCom = C.anios[C.anios.length - 1];
  $("#c-anio").innerHTML = C.anios.map((a) => `<button role="radio" aria-checked="${a === S.anioCom}" data-anio="${a}">${a}</button>`).join("");
  $("#c-anio").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-anio]"); if (!b) return;
    S.anioCom = +b.dataset.anio;
    document.querySelectorAll("#c-anio button").forEach((x) => x.setAttribute("aria-checked", +x.dataset.anio === S.anioCom));
    pintarComercio();
  });
  // Ficha: buscador
  const M = S.meta;
  S._munEtq = M.municipios.map((m, i) => `${m[1]}, ${M.entidades[S.munEnt[i]].nombre}`);
  $("#ficha-lista").innerHTML = S._munEtq.map((t) => `<option value="${esc(t)}"></option>`).join("");
  const buscar = () => {
    const i = S._munEtq.indexOf($("#ficha-buscar").value.trim());
    if (i >= 0 && i !== S.fichaMun) { S.fichaMun = i; pintarActual(); }
  };
  $("#ficha-buscar").addEventListener("change", buscar);
  $("#ficha-buscar").addEventListener("input", buscar);
  $("#ficha-mapa").addEventListener("click", () => { if (S.fichaMun != null) irAMunicipio(S.fichaMun); });
  $("#ficha-imprimir").addEventListener("click", () => window.print());
  $("#ficha-cont").addEventListener("click", (ev) => { const b = ev.target.closest("[data-ficha]"); if (b) abrirFicha(+b.dataset.ficha); });
}

function pintarPerfil() {
  const M = S.meta, ent = S.f.ent, k = S.ind, I = IND[k];
  const ambito = ent ? M.entidades[S.entIdx[ent]].nombre : "México";
  const filas = ent ? filasEnt(ent) : filasNac();
  const okCapa = (c) => S.f.capas.has(c);
  const a = aggClases(filas, (ci) => okCapa(capaDeClase(ci)));

  // KPIs
  const kp = ["ue", "po", "va", "prod", "rem", "remu"].map((kk) => {
    const x = valorInd(kk, a);
    return { etq: IND[kk].etq, val: txtInd(kk, x), sub: kk === "ue" ? ambito + " · 2023" : x == null ? "Sin datos publicados suficientes" : a.cob < 0.9995 ? (x.parcial ? "Parcial: " : "Con ") + txtCob(a).toLowerCase() : kk === "prod" ? "Valor agregado por persona" : "" };
  });
  $("#p-kpis").innerHTML = kp.map((x) => `<div class="kpi"><div class="etq">${esc(x.etq)}</div><div class="val">${esc(x.val)}</div><div class="sub">${esc(x.sub)}</div></div>`).join("");

  // Por eslabón
  $("#p-capas-tit").textContent = `${I.etq} por eslabón · ${ambito}`;
  $("#p-ind-def").textContent = I.def;
  leyendaSeg($("#ley-seg3"));
  const porCapa = M.capas.map((c, i) => ({ c, i, a: aggClases(filas, (ci) => capaDeClase(ci) === i) })).filter((x) => okCapa(x.i));
  const filasG = porCapa.map(({ c, a }) => {
    const x = valorInd(k, a);
    return {
      etq: c.nombre, valor: x ? x.v : 0, parcial: x && x.parcial, color: colSeg(c.segmento),
      tip: `<b>${esc(c.nombre)}</b><br>${esc(I.etq)}: ${esc(txtInd(k, x))}<br><span class="tt-sub">${esc(a.UE ? txtCob(a) : "Sin unidades censadas")}</span>`,
    };
  });
  graficaH($("#p-capas"), filasG, { fmtVal: I.fmt, fmtTick: I.tick });
  $("#pt-capas").innerHTML = tablaHTML(
    [{ t: "Eslabón" }, ...["ue", "po", "va", "prod", "rem", "remu"].map((kk) => ({ t: IND[kk].corto, num: 1 })), { t: "Cobertura", num: 1 }],
    porCapa.map(({ c, a }) => [c.nombre, ...["ue", "po", "va", "prod", "rem", "remu"].map((kk) => txtInd(kk, valorInd(kk, a))), a.UE ? fmt1.format(100 * a.cob) + " %" : "—"])
  );

  // Empleo frente a valor agregado
  const totPO = porCapa.reduce((s, x) => s + x.a.H001A, 0), totVA = porCapa.reduce((s, x) => s + x.a.A131A, 0);
  const cPO = cssVar("--barra"), cVA = cssVar("--acento");
  $("#ley-mix").innerHTML = `<span><i style="background:${cPO}"></i>Personal ocupado</span><span><i style="background:${cVA}"></i>Valor agregado</span>`;
  graficaPares($("#p-mix"), porCapa.filter((x) => x.a.UEpub).map(({ c, a }) => ({
    etq: c.nombre, v: [totPO ? (100 * a.H001A) / totPO : 0, totVA ? (100 * a.A131A) / totVA : 0],
    tip: `<b>${esc(c.nombre)}</b><br>${fmt1.format(totPO ? (100 * a.H001A) / totPO : 0)} % del personal ocupado<br>${fmt1.format(totVA ? (100 * a.A131A) / totVA : 0)} % del valor agregado${a.cob < 0.9995 ? `<br><span class="tt-sub">${esc(txtCob(a))}</span>` : ""}`,
  })), [cPO, cVA], (v) => fmt1.format(v) + " %");

  // Geografía: entidades o municipios de la entidad
  let geo;
  if (ent) {
    $("#p-geo-tit").textContent = `Municipios de ${ambito} · ${I.etq}`;
    geo = [];
    for (const [cve, f] of Object.entries(S.ce.municipal)) {
      if (cve.slice(0, 2) !== ent) continue;
      const am = aggMun(f, okCapa), x = valorInd(k, am);
      if (am.UE) geo.push({ nom: nombreMunCE(cve), a: am, x });
    }
  } else {
    $("#p-geo-tit").textContent = `Entidades · ${I.etq}`;
    geo = M.entidades.map((e) => { const ae = aggClases(filasEnt(e.cve), (ci) => okCapa(capaDeClase(ci))); return { nom: e.nombre, a: ae, x: valorInd(k, ae) }; });
  }
  const conDato = geo.filter((g) => g.x).sort((p, q) => q.x.v - p.x.v);
  const sinDato = geo.length - conDato.length;
  $("#p-geo-nota").textContent = `${ent ? "Se muestran los 20 municipios" : "Se muestran las 20 entidades"} con mayor valor. ` +
    (I.ext ? "Barra clara y ≥: valor mínimo, porque faltan clases confidenciales. " : `Cocientes calculados con las clases publicadas; se omiten si cubren menos del ${COB_MIN * 100} % de las unidades. `) +
    (sinDato ? `${fmt.format(sinDato)} ${ent ? "municipios" : "entidades"} sin dato publicado suficiente.` : "");
  graficaH($("#p-geo"), conDato.slice(0, 20).map((g) => ({
    etq: g.nom, valor: g.x.v, parcial: g.x.parcial, color: cssVar("--barra"),
    tip: `<b>${esc(g.nom)}</b><br>${esc(I.etq)}: ${esc(txtInd(k, g.x))}<br>${fmt.format(g.a.UE)} unidades económicas<br><span class="tt-sub">${esc(txtCob(g.a))}</span>`,
  })), { anchoEtq: 200, fmtVal: I.fmt, fmtTick: I.tick });
  $("#pt-geo").innerHTML = tablaHTML(
    [{ t: ent ? "Municipio" : "Entidad" }, ...["ue", "po", "va", "prod", "rem", "remu"].map((kk) => ({ t: IND[kk].corto, num: 1 })), { t: "Cobertura", num: 1 }],
    geo.sort((p, q) => (q.x ? q.x.v : -1) - (p.x ? p.x.v : -1)).map((g) => [g.nom, ...["ue", "po", "va", "prod", "rem", "remu"].map((kk) => txtInd(kk, valorInd(kk, g.a))), fmt1.format(100 * g.a.cob) + " %"])
  );

  // Clases SCIAN
  $("#p-clases-tit").textContent = `Clases SCIAN · ${ambito}`;
  const v = (x, d = 0) => (x == null ? "C" : d ? mdp(x) : fmt.format(x));
  $("#pt-clases").innerHTML = `<thead><tr><th>SCIAN</th><th>Clase de actividad</th><th>Eslabón</th><th class="num">Unidades</th><th class="num">Personal ocupado</th><th class="num">Remuneraciones</th><th class="num">Producción bruta</th><th class="num">Valor agregado</th><th class="num">Productividad (mil $)</th></tr></thead><tbody>${filas
    .filter((f) => okCapa(capaDeClase(f[0])))
    .sort((p, q) => capaDeClase(p[0]) - capaDeClase(q[0]) || (q[2] ?? -1) - (p[2] ?? -1))
    .map((f) => { const cl = M.clases[f[0]]; return `<tr><td>${cl.codigo}</td><td class="envolver">${esc(cl.nombre)}</td><td>${esc(M.capas[cl.capa].nombre)}</td><td class="num">${fmt.format(f[1])}</td><td class="num">${v(f[2])}</td><td class="num">${v(f[4], 1)}</td><td class="num">${v(f[5], 1)}</td><td class="num">${v(f[6], 1)}</td><td class="num">${f[2] ? fmt.format(Math.round((f[6] * 1000) / f[2])) : "C"}</td></tr>`; })
    .join("")}</tbody>`;
}
function nombreMunCE(cve) {
  const m = munIdx(cve);
  return m >= 0 ? S.meta.municipios[m][1] : cve;
}
function munIdx(cve) {
  if (!S._munPorCve) { S._munPorCve = {}; S.meta.municipios.forEach((m, i) => (S._munPorCve[m[0]] = i)); }
  return S._munPorCve[cve] ?? -1;
}

/** Dos barras por fila (p. ej. % del empleo y % del valor agregado). filas: {etq, v:[a,b], tip} */
function graficaPares(cont, filas, colores, fmtVal) {
  cont.innerHTML = "";
  const W = Math.max(280, cont.clientWidth), etq = Math.min(190, W * 0.42);
  const alto = 9, sep = 2, fila = 2 * alto + sep + 14, top = 4, abajo = 22;
  const H = top + filas.length * fila + abajo;
  const max = Math.max(1, ...filas.flatMap((f) => f.v));
  const ticks = ticksLimpios(max), tmax = ticks[ticks.length - 1];
  const x1 = W - 56, sx = (v) => etq + ((x1 - etq) * v) / tmax;
  const svg = el("svg", { width: W, height: H, role: "img" }, cont);
  ticks.forEach((t) => {
    el("line", { x1: sx(t), x2: sx(t), y1: top, y2: H - abajo + 2, class: t === 0 ? "base" : "ret" }, svg);
    el("text", { x: sx(t), y: H - 6, "text-anchor": "middle", class: "tick" }, svg).textContent = fmt.format(t) + " %";
  });
  filas.forEach((f, i) => {
    const y0 = top + i * fila + 7, g = el("g", { class: "fila" }, svg);
    el("text", { x: etq - 8, y: y0 + alto + 4, "text-anchor": "end" }, g).textContent = recortar(f.etq, etq - 12);
    f.v.forEach((v, j) => {
      const y = y0 + j * (alto + sep);
      el("path", { d: barraH(sx(0), y, sx(v) - sx(0), alto, 3), fill: colores[j], class: "marca" }, g);
      el("text", { x: sx(v) + 5, y: y + alto - 1, class: "valor chico" }, g).textContent = fmtVal(v);
    });
    const hit = el("rect", { x: 0, y: top + i * fila, width: W, height: fila, class: "hit" }, g);
    hit.addEventListener("mousemove", (ev) => mostrarTip(f.tip, ev.clientX, ev.clientY));
    hit.addEventListener("mouseleave", ocultarTip);
  });
  svg.setAttribute("aria-label", filas.map((f) => `${f.etq}: ${f.v.map(fmtVal).join(" y ")}`).join("; "));
}

/* ---------- COMERCIO EXTERIOR ---------- */
const mdd = (v) => (v == null ? "—" : fmt.format(Math.round(v / 1e6)) + " mdd");
const varPct = (a, b) => (a && b != null ? (b / a - 1) * 100 : null);
const txtVar = (p) => (p == null ? "—" : (p > 0 ? "+" : "") + fmt1.format(p) + " %");

function pintarComercio() {
  const C = S.comercio, A = C.anios, n = A.length, M = S.meta;
  const sumaGrupo = (g, j) => C.capitulos.filter((c) => g == null || c.grupo === g).reduce((s, c) => s + (c.valores[j] || 0), 0);
  const tot = A.map((_, j) => sumaGrupo(null, j));
  const ult = n - 1;
  $("#c-kpis").innerHTML = [
    { etq: `Importaciones ${A[ult]}`, val: mdd(tot[ult]), sub: `${txtVar(varPct(tot[0], tot[ult]))} frente a ${A[0]}` },
    ...C.grupos.map((g, gi) => {
      const s = A.map((_, j) => sumaGrupo(gi, j));
      return { etq: g.nombre, val: mdd(s[ult]), sub: `${fmt1.format((100 * s[ult]) / tot[ult])} % del total · ${txtVar(varPct(s[0], s[ult]))} vs ${A[0]}` };
    }),
  ].map((x) => `<div class="kpi"><div class="etq">${esc(x.etq)}</div><div class="val">${esc(x.val)}</div><div class="sub">${esc(x.sub)}</div></div>`).join("");

  // Grupos × años (tonos secuenciales: año más reciente = más oscuro)
  const seq = esOscuro() ? SEQ_OSCURO : SEQ_CLARO;
  const tonos = n === 3 ? [seq[1], seq[2], seq[4]] : A.map((_, j) => seq[Math.round((j * 4) / Math.max(1, n - 1))]);
  $("#ley-anios").innerHTML = A.map((a, j) => `<span><i style="background:${tonos[j]}"></i>${a}</span>`).join("");
  const filasG = C.grupos.map((g, gi) => {
    const s = A.map((_, j) => sumaGrupo(gi, j));
    return { etq: g.nombre, v: s.map((x) => x / 1e6), tip: `<b>${esc(g.nombre)}</b><br>${A.map((a, j) => `${a}: ${mdd(s[j])}`).join("<br>")}<br>Variación ${A[0]}–${A[ult]}: ${txtVar(varPct(s[0], s[ult]))}<br><span class="tt-sub">Eslabón relacionado: ${esc(M.capas[g.capa].nombre)}</span>` };
  });
  graficaGrupos($("#c-grupos"), filasG, tonos, (v) => fmt.format(Math.round(v)));
  $("#ct-grupos").innerHTML = tablaHTML(
    [{ t: "Grupo" }, ...A.map((a) => ({ t: `${a} (mdd)`, num: 1 })), { t: `Var. ${A[0]}–${A[ult]}`, num: 1 }, { t: "Eslabón relacionado" }],
    C.grupos.map((g, gi) => { const s = A.map((_, j) => sumaGrupo(gi, j)); return [g.nombre, ...s.map((x) => fmt.format(Math.round(x / 1e6))), txtVar(varPct(s[0], s[ult])), M.capas[g.capa].nombre]; })
  );

  // Capítulos del año elegido
  const j = A.indexOf(S.anioCom);
  const caps = [...C.capitulos].sort((p, q) => (q.valores[j] || 0) - (p.valores[j] || 0));
  graficaH($("#c-caps"), caps.map((c) => ({
    etq: `${c.hs} ${c.nombre}`, valor: (c.valores[j] || 0) / 1e6, color: cssVar("--barra"),
    tip: `<b>Capítulo ${c.hs}. ${esc(c.nombre)}</b><br>${A.map((a, i) => `${a}: ${mdd(c.valores[i])}`).join("<br>")}<br>Variación ${A[0]}–${A[ult]}: ${txtVar(varPct(c.valores[0], c.valores[ult]))}<br><span class="tt-sub">${esc(C.grupos[c.grupo].nombre)}</span>`,
  })), { anchoEtq: 230, fmtVal: (v) => fmt.format(Math.round(v)), fmtTick: (v) => fmt.format(v) });
  $("#ct-caps").innerHTML = tablaHTML(
    [{ t: "HS" }, { t: "Capítulo" }, ...A.map((a) => ({ t: `${a} (mdd)`, num: 1 })), { t: `Var. ${A[0]}–${A[ult]}`, num: 1 }],
    C.capitulos.map((c) => [c.hs, c.nombre, ...c.valores.map((x) => (x == null ? "—" : fmt.format(Math.round(x / 1e6)))), txtVar(varPct(c.valores[0], c.valores[ult]))])
      .concat([["6310", "Trapos y desperdicios textiles (parte del capítulo 63)", ...C.trapos_6310.map((x) => (x == null ? "—" : fmt1.format(x / 1e6))), txtVar(varPct(C.trapos_6310[0], C.trapos_6310[ult]))]])
  );

  // Lectura con la cadena (cifras nacionales CE2024 por eslabón)
  const nac = filasNac();
  const vaCapa = (ci) => aggClases(nac, (c) => capaDeClase(c) === ci);
  const prendasCE = vaCapa(C.grupos[1].capa), calzCE = vaCapa(C.grupos[3].capa), insCE = vaCapa(C.grupos[0].capa);
  const gUlt = (gi) => sumaGrupo(gi, ult);
  $("#c-lectura").innerHTML = `
    <p><strong>Prendas de vestir:</strong> México importó ${mdd(gUlt(1))} en ${A[ult]}. La confección nacional generó ${mdp(prendasCE.A131A)} millones de pesos de valor agregado en 2023 con ${fmt.format(prendasCE.H001A)} personas ocupadas.</p>
    <p><strong>Calzado:</strong> importaciones por ${mdd(gUlt(3))} en ${A[ult]}, frente a ${fmt.format(calzCE.H001A)} personas ocupadas en la fabricación nacional de calzado y bolsos.</p>
    <p><strong>Fibras, hilados y tejidos:</strong> son el grupo más grande (${mdd(gUlt(0))}). Abastecen a la confección y a los productos textiles nacionales; la industria nacional de insumos ocupa a ${fmt.format(insCE.H001A)} personas.</p>
    <p class="nota">Los montos de comercio están en dólares corrientes y los censales en pesos de 2023: compáralos como órdenes de magnitud, no como cocientes. Para medir la penetración de importaciones se necesitarían exportaciones y producción en la misma unidad y año.</p>`;
}

/** Barras agrupadas horizontales: filas {etq, v:[...], tip}; una barra por serie */
function graficaGrupos(cont, filas, colores, fmtVal) {
  cont.innerHTML = "";
  const ns = colores.length, W = Math.max(280, cont.clientWidth), etq = Math.min(210, W * 0.42);
  const alto = 8, sep = 2, fila = ns * (alto + sep) + 16, top = 4, abajo = 22;
  const H = top + filas.length * fila + abajo;
  const max = Math.max(1, ...filas.flatMap((f) => f.v));
  const ticks = ticksLimpios(max), tmax = ticks[ticks.length - 1];
  const x1 = W - 56, sx = (v) => etq + ((x1 - etq) * v) / tmax;
  const svg = el("svg", { width: W, height: H, role: "img" }, cont);
  ticks.forEach((t) => {
    el("line", { x1: sx(t), x2: sx(t), y1: top, y2: H - abajo + 2, class: t === 0 ? "base" : "ret" }, svg);
    el("text", { x: sx(t), y: H - 6, "text-anchor": "middle", class: "tick" }, svg).textContent = fmt.format(t);
  });
  filas.forEach((f, i) => {
    const y0 = top + i * fila + 8, g = el("g", { class: "fila" }, svg);
    el("text", { x: etq - 8, y: y0 + (ns * (alto + sep)) / 2 + 3, "text-anchor": "end" }, g).textContent = recortar(f.etq, etq - 12);
    f.v.forEach((v, j) => {
      const y = y0 + j * (alto + sep);
      el("path", { d: barraH(sx(0), y, sx(v) - sx(0), alto, 3), fill: colores[j], class: "marca" }, g);
      if (j === ns - 1) el("text", { x: sx(Math.max(...f.v)) + 5, y: y + alto - 1, class: "valor chico" }, g).textContent = fmtVal(v);
    });
    const hit = el("rect", { x: 0, y: top + i * fila, width: W, height: fila, class: "hit" }, g);
    hit.addEventListener("mousemove", (ev) => mostrarTip(f.tip, ev.clientX, ev.clientY));
    hit.addEventListener("mouseleave", ocultarTip);
  });
  svg.setAttribute("aria-label", filas.map((f) => `${f.etq}: ${f.v.map(fmtVal).join(", ")}`).join("; "));
}

/* ---------- FICHA MUNICIPAL ---------- */
function abrirFicha(m) {
  S.fichaMun = m;
  cambiarTab("ficha");
  scrollTo({ top: 0 });
}

function pintarFicha() {
  const M = S.meta, cont = $("#ficha-cont"), m = S.fichaMun;
  $("#ficha-mapa").disabled = $("#ficha-imprimir").disabled = m == null;
  if (m == null) {
    // Sugerencias: municipios con más establecimientos
    const top = M.municipios.map((_, i) => i).sort((a, b) => totMun(b) - totMun(a)).slice(0, 16);
    cont.innerHTML = `<div class="tarjeta"><h2>Elige un municipio</h2><p class="nota">Escribe el nombre arriba, usa el botón <em>Ficha</em> en la tabla de municipios del Panorama o haz clic en un establecimiento del mapa. Municipios con más establecimientos del sector:</p>
      <div class="sugerencias">${top.map((i) => `<button type="button" class="chip" data-ficha="${i}">${esc(S._munEtq[i])}</button>`).join("")}</div></div>`;
    return;
  }
  $("#ficha-buscar").value = S._munEtq[m];
  const nC = M.capas.length, e = S.munEnt[m], ent = M.entidades[e], cve = M.municipios[m][0];
  const n = totMun(m), nNac = S.n;
  const rank = 1 + M.municipios.reduce((s, _, i) => s + (totMun(i) > n ? 1 : 0), 0);
  let nEnt = 0; for (let i = ent.inicio; i < ent.fin; i++) nEnt++;
  const micro = S.munTam[m * 8];
  const ceF = S.ce.municipal[cve];
  const a = aggMun(ceF, () => true);

  const kp = [
    { etq: "Establecimientos (DENUE 2026)", val: fmt.format(n), sub: `Lugar ${fmt.format(rank)} de ${fmt.format(M.municipios.length)} municipios` },
    { etq: "Peso en la entidad", val: pct(n, nEnt), sub: `del sector en ${ent.nombre}` },
    { etq: "Micronegocios", val: pct(micro, n), sub: "0 a 5 personas" },
    { etq: "Personal ocupado (CE 2023)", val: txtInd("po", valorInd("po", a)), sub: a.UE ? txtCob(a) : "Sin unidades censadas" },
    { etq: "Valor agregado (CE 2023)", val: txtInd("va", valorInd("va", a)), sub: "millones de pesos" },
    { etq: "Productividad (CE 2023)", val: txtInd("prod", valorInd("prod", a)), sub: "valor agregado por persona" },
  ];

  cont.innerHTML = `
    <header class="ficha-cab">
      <p class="ceja-ficha">Ficha municipal · ${esc(ent.nombre)} · clave ${esc(cve)}</p>
      <h2 class="ficha-tit">${esc(M.municipios[m][1])}</h2>
    </header>
    <div class="kpis">${kp.map((x) => `<div class="kpi"><div class="etq">${esc(x.etq)}</div><div class="val">${esc(x.val)}</div><div class="sub">${esc(x.sub)}</div></div>`).join("")}</div>
    <div class="rejilla">
      <article class="tarjeta"><h2>Establecimientos por eslabón</h2><p class="nota">DENUE 05/2026, todos los tamaños.</p><div class="leyenda" id="fl-seg"></div><div class="grafica" id="fi-capas"></div></article>
      <article class="tarjeta"><h2>Especialización por eslabón (CL)</h2><p class="nota" id="fi-cl-nota"></p><div class="grafica" id="fi-cl"></div></article>
      <article class="tarjeta"><h2>Tamaño por personal ocupado</h2><p class="nota">DENUE 05/2026.</p><div class="grafica" id="fi-tam"></div></article>
    </div>
    <article class="tarjeta tarjeta-completa"><h2>Perfil económico por eslabón</h2><p class="nota">Censos Económicos 2024 (año 2023) junto al conteo del DENUE 2026. <strong>C</strong> = confidencial; ≥ = parcial (faltan clases confidenciales). Valor agregado en millones de pesos; productividad en miles de pesos por persona.</p><div id="fi-ce"></div></article>
    <p class="nota ficha-pie">Fuentes: INEGI, DENUE 05/2026; INEGI, Censos Económicos 2024. Unidades económicas censales y establecimientos del DENUE son universos distintos. Consulta: ${new Date().toLocaleDateString("es-MX")}.</p>`;

  leyendaSeg($("#fl-seg"));
  graficaH($("#fi-capas"), M.capas.map((c, i) => {
    const v = S.munCapa[m * nC + i];
    return { etq: c.nombre, valor: v, color: colSeg(c.segmento), tip: `<b>${esc(c.nombre)}</b><br>${fmt.format(v)} establecimientos (${pct(v, n)})` };
  }));

  // CL por eslabón frente al país (sin filtros)
  // En barras el gris del punto medio del mapa casi no se ve sobre el fondo: se usa un gris medio
  const div = [...(esOscuro() ? DIV_OSCURO : DIV_CLARO)]; div[2] = esOscuro() ? "#6b6a64" : "#b5b4ac";
  if (n < MIN_CL) {
    $("#fi-cl-nota").textContent = `El municipio tiene menos de ${MIN_CL} establecimientos del sector: el CL no es confiable.`;
    $("#fi-cl").innerHTML = "";
  } else {
    $("#fi-cl-nota").textContent = "Peso del eslabón en el municipio dividido entre su peso nacional. La línea marca CL = 1 (igual que el país); mayor a 1.25 indica especialización.";
    const filasCL = M.capas.map((c, i) => {
      const v = S.munCapa[m * nC + i], cl = (v / n) / (S.nacCapa[i] / nNac);
      return { etq: c.nombre, valor: cl, color: div[binCL(cl)],
        tip: `<b>${esc(c.nombre)}</b><br>CL: ${fmt2.format(cl)}<br>${pct(v, n)} del sector en el municipio frente a ${pct(S.nacCapa[i], nNac)} en el país` };
    });
    graficaH($("#fi-cl"), filasCL, { fmtVal: (v) => fmt2.format(v), fmtTick: (v) => fmt.format(v), ref: 1 });
  }

  graficaH($("#fi-tam"), M.tamanos.map((t, i) => {
    const v = S.munTam[m * 8 + i];
    return { etq: t + " personas", valor: v, color: cssVar("--barra"), tip: `<b>${esc(t)} personas</b><br>${fmt.format(v)} establecimientos (${pct(v, n)})` };
  }), { anchoEtq: 130 });

  // Tabla CE por eslabón
  if (!ceF) { $("#fi-ce").innerHTML = `<p class="nota">El municipio no tiene unidades censadas en estas clases.</p>`; return; }
  const filas = M.capas.map((c, i) => {
    const am = aggMun(ceF, (k) => k === i);
    if (!am.UE) return [c.nombre, fmt.format(S.munCapa[m * nC + i]), "0", "—", "—", "—"];
    return [c.nombre, fmt.format(S.munCapa[m * nC + i]), fmt.format(am.UE), txtInd("po", valorInd("po", am)), txtInd("va", valorInd("va", am)).replace(" mdp", ""), txtInd("prod", valorInd("prod", am))];
  });
  filas.push(["Total", fmt.format(n), fmt.format(a.UE), txtInd("po", valorInd("po", a)), txtInd("va", valorInd("va", a)).replace(" mdp", ""), txtInd("prod", valorInd("prod", a))]);
  $("#fi-ce").innerHTML = tablaHTML([{ t: "Eslabón" }, { t: "DENUE 2026", num: 1 }, { t: "Unidades CE", num: 1 }, { t: "Personal ocupado", num: 1 }, { t: "Valor agregado", num: 1 }, { t: "Productividad", num: 1 }], filas);
}
function totMun(m) { const nC = S.meta.capas.length; let s = 0; for (let c = 0; c < nC; c++) s += S.munCapa[m * nC + c]; return s; }
