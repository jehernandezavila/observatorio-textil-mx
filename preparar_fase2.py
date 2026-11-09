"""Fase 2 del Observatorio: perfil económico (CE2024) y comercio exterior.

Entradas
- fuentes/ce2024/*.csv  (descargar_ce2024.py: SAIC nacional, estatal, municipal)
- ../UN_Comtrade_importaciones_textiles_Mexico_2023_2025.csv
- web/data/meta.json    (preparar_datos.py: orden de clases y eslabones)

Salidas
- web/data/ce2024.json
- web/data/comercio.json

Confidencialidad: las celdas vacías del SAIC se conservan como null. Nunca se
imputan. Los agregados de varias clases se calculan en el navegador como suma
de las clases publicadas y se acompañan de su cobertura (proporción de unidades
económicas cuyas clases tienen el dato publicado).

    python preparar_fase2.py
"""
from __future__ import annotations

import csv
import io
import json
from decimal import Decimal
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
FUENTE = AQUI / "fuentes" / "ce2024"
DATOS = AQUI / "web" / "data"

VARIABLES = ["UE", "H001A", "H010A", "J000A", "A111A", "A131A", "M000A", "Q000A"]
ETIQUETAS = {
    "UE": "Unidades económicas",
    "H001A": "Personal ocupado total",
    "H010A": "Personal remunerado",
    "J000A": "Remuneraciones (millones de pesos)",
    "A111A": "Producción bruta total (millones de pesos)",
    "A131A": "Valor agregado censal bruto (millones de pesos)",
    "M000A": "Ingresos por suministro de bienes y servicios (millones de pesos)",
    "Q000A": "Activos fijos (millones de pesos)",
}

# Capítulos del Sistema Armonizado (HS) y su relación con los eslabones
CAPITULOS = {
    "50": ("Seda", "Fibras, hilados y tejidos"),
    "51": ("Lana y pelo fino", "Fibras, hilados y tejidos"),
    "52": ("Algodón", "Fibras, hilados y tejidos"),
    "53": ("Otras fibras vegetales", "Fibras, hilados y tejidos"),
    "54": ("Filamentos sintéticos o artificiales", "Fibras, hilados y tejidos"),
    "55": ("Fibras sintéticas o artificiales discontinuas", "Fibras, hilados y tejidos"),
    "56": ("Guata, fieltro, cordeles y cuerdas", "Fibras, hilados y tejidos"),
    "57": ("Alfombras y revestimientos textiles", "Artículos textiles confeccionados"),
    "58": ("Tejidos especiales, encajes y bordados", "Fibras, hilados y tejidos"),
    "59": ("Tejidos impregnados y textiles técnicos", "Fibras, hilados y tejidos"),
    "60": ("Tejidos de punto", "Fibras, hilados y tejidos"),
    "61": ("Prendas de vestir de punto", "Prendas de vestir"),
    "62": ("Prendas de vestir, excepto de punto", "Prendas de vestir"),
    "63": ("Otros artículos textiles confeccionados y prendería", "Artículos textiles confeccionados"),
    "64": ("Calzado", "Calzado"),
}
GRUPOS = ["Fibras, hilados y tejidos", "Prendas de vestir", "Artículos textiles confeccionados", "Calzado"]
# Eslabón (clave de capa) con el que se relaciona cada grupo de importaciones
GRUPO_CAPA = {
    "Fibras, hilados y tejidos": "insumos_textiles",
    "Prendas de vestir": "prendas_vestir",
    "Artículos textiles confeccionados": "productos_textiles",
    "Calzado": "calzado_bolsos",
}


def num(s: str) -> float | None:
    s = s.strip()
    return None if s == "" else float(Decimal(s))


def leer_saic(nombre: str, n_geo: int) -> list[tuple[list[str], str, list[float | None]]]:
    """Filas (claves geográficas, clase SCIAN, valores) de una exportación SAIC."""
    texto = (FUENTE / f"{nombre}.csv").read_text(encoding="utf-8")
    out = []
    for fila in csv.reader(io.StringIO(texto)):
        if not fila or fila[0] != "2023":
            continue
        geo = [g.split(" ", 1)[0] for g in fila[1:1 + n_geo]]
        clase = fila[1 + n_geo].split(" ")[1]
        vals = [num(v) for v in fila[2 + n_geo:2 + n_geo + len(VARIABLES)]]
        out.append((geo, clase, vals))
    return out


def redondear(vals: list[float | None]) -> list[float | None]:
    return [None if v is None else (int(v) if i in (0, 1, 2) else round(v, 3)) for i, v in enumerate(vals)]


def ce2024(meta: dict) -> dict:
    idx_clase = {c["codigo"]: i for i, c in enumerate(meta["clases"])}
    capa_de = [c["capa"] for c in meta["clases"]]

    nacional = [None] * len(idx_clase)
    for _, cl, v in leer_saic("nacional", 1):
        nacional[idx_clase[cl]] = redondear(v)

    estatal: dict[str, list] = {}
    for (ent,), cl, v in leer_saic("estatal", 1):
        estatal.setdefault(ent, []).append([idx_clase[cl], *redondear(v)])

    # Municipal: por eslabón, suma de clases publicadas + UE totales y UE con dato publicado
    municipal: dict[str, dict[int, list]] = {}
    for e in sorted(p.stem.split("_")[1] for p in FUENTE.glob("municipal_??.csv")):
        for (ent, mun), cl, v in leer_saic(f"municipal_{e}", 2):
            cve = ent + mun
            capa = capa_de[idx_clase[cl]]
            acc = municipal.setdefault(cve, {}).setdefault(capa, [0, 0] + [Decimal(0)] * (len(VARIABLES) - 1))
            acc[0] += int(v[0])           # UE totales
            if v[1] is not None:          # las 7 variables se publican o se omiten juntas
                acc[1] += int(v[0])       # UE con dato publicado
                for j in range(1, len(VARIABLES)):
                    acc[1 + j] += Decimal(str(v[j]))
    mun_out = {
        cve: [[c, a[0], a[1]] + [(int(x) if j < 2 else round(float(x), 3)) if a[1] else None
                                 for j, x in enumerate(a[2:])] for c, a in sorted(capas.items())]
        for cve, capas in sorted(municipal.items())
    }
    return {
        "anio_referencia": 2023,
        "fuente": "INEGI, Censos Económicos 2024, resultados definitivos (SAIC). Montos en millones de pesos corrientes de 2023.",
        "variables": VARIABLES,
        "etiquetas": ETIQUETAS,
        "nacional": nacional,
        "estatal": estatal,
        "municipal_campos": ["capa", "UE", "UE_publicadas"] + VARIABLES[1:],
        "municipal": mun_out,
    }


def comercio(meta: dict) -> dict:
    capa_idx = {c["clave"]: i for i, c in enumerate(meta["capas"])}
    datos: dict[str, dict[int, float]] = {}
    with open(RAIZ / "UN_Comtrade_importaciones_textiles_Mexico_2023_2025.csv", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["flowCode"] != "M" or r["partnerCode"] != "0":
                continue
            datos.setdefault(r["cmdCode"], {})[int(r["refYear"])] = float(r["primaryValue"])
    anios = sorted({a for v in datos.values() for a in v})
    caps = [
        {"hs": hs, "nombre": nom, "grupo": GRUPOS.index(gr), "valores": [datos.get(hs, {}).get(a) for a in anios]}
        for hs, (nom, gr) in CAPITULOS.items()
    ]
    trapos = datos.get("6310")
    return {
        "fuente": "UN Comtrade, importaciones de México (reportadas por México), todos los orígenes. Dólares corrientes, valor CIF/primario.",
        "anios": anios,
        "grupos": [{"nombre": g, "capa": capa_idx[GRUPO_CAPA[g]]} for g in GRUPOS],
        "capitulos": caps,
        "trapos_6310": [trapos.get(a) if trapos else None for a in anios],
    }


def main() -> None:
    meta = json.loads((DATOS / "meta.json").read_text(encoding="utf-8"))
    ce = ce2024(meta)
    (DATOS / "ce2024.json").write_text(json.dumps(ce, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    co = comercio(meta)
    (DATOS / "comercio.json").write_text(json.dumps(co, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for n in ("ce2024.json", "comercio.json"):
        print(f"{n}: {(DATOS / n).stat().st_size / 1e6:.2f} MB")
    nac = [sum(v[j] for v in ce["nacional"]) for j in range(len(VARIABLES))]
    print("Nacional:", dict(zip(VARIABLES, [round(x, 1) for x in nac])))
    print("Municipios con CE:", len(ce["municipal"]), "· sin DENUE:",
          len(set(ce["municipal"]) - {m[0] for m in meta["municipios"]}))


if __name__ == "__main__":
    main()
