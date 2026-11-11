"""Pestaña de economía circular del Observatorio: recuperadores, acopiadores y reúso.

Entrada
- ../Reciclaje_textil_SCIAN_DENUE/Reciclaje_textil_SCIAN_DENUE/DENUE_reciclaje_y_reuso_candidatos.csv
- web/data/meta.json  (tamaños)

Salida
- web/data/circular.json

Clases SCIAN (DENUE 05/2026):
  314993 Fabricación de productos textiles reciclados (borras y estopas)  -> transformación
  434319 Comercio al por mayor de otros materiales de desecho             -> acopio mayorista
  562921 Recuperación de residuos, sector privado                         -> recuperación
  562922 Recuperación de residuos, sector público                         -> recuperación
  466410 Comercio al por menor de artículos usados                        -> reúso

Solo 314993 es exclusivamente textil. En las demás se marca el establecimiento
cuando su nombre o razón social contiene palabras ligadas a textiles, piel,
ropa usada o calzado. La marca es indicativa: no mide qué materiales recibe.

    python preparar_circular.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).resolve().parent
CSV = AQUI.parent / "Reciclaje_textil_SCIAN_DENUE" / "Reciclaje_textil_SCIAN_DENUE" / "DENUE_reciclaje_y_reuso_candidatos.csv"
DATOS = AQUI / "web" / "data"

CLASES = [
    ("314993", "Fabricación de productos textiles reciclados (borras y estopas)", "Transformación de residuos textiles"),
    ("434319", "Comercio al por mayor de otros materiales de desecho", "Acopio y venta de materiales para reciclaje"),
    ("562921", "Recuperación de residuos, sector privado", "Acopio, clasificación y compactación"),
    ("562922", "Recuperación de residuos, sector público", "Acopio público"),
    ("466410", "Comercio al por menor de artículos usados", "Reúso de ropa, calzado y otros artículos"),
]
# Marcas por nombre (0 = sin marca)
MARCAS = ["Sin marca", "Nombre textil", "Nombre de piel o cuero", "Nombre de ropa o pacas", "Nombre de calzado"]
RE_TEXTIL = r"TEXTIL|\bTELAS?\b|TRAPO|HILACHA|BORRA|ESTOPA|RETAZO|RETACER|DESPERDICIO TEX|\bFIBRAS? TEX"
RE_PIEL = r"\bCUEROS?\b|\bPIEL\b|\bPIELES\b|PEDACER|PEDAZER|SUELA|CARNAZA|VAQUETA"
RE_ROPA = r"\bROPA\b|\bPACAS?\b|VINTAGE|\bPRENDAS?\b"
RE_CALZADO = r"CALZADO|ZAPAT|\bTENIS\b"


def limpiar(s) -> str:
    return re.sub(r"\s+", " ", str(s)).strip() if isinstance(s, str) else ""


def main() -> None:
    meta = json.loads((DATOS / "meta.json").read_text(encoding="utf-8"))
    tam_idx = {t + " personas": i for i, t in enumerate(meta["tamanos"])}
    df = pd.read_csv(CSV, dtype=str, encoding="utf-8-sig")
    df = df[df.codigo_act.isin([c[0] for c in CLASES])].copy()
    df["ci"] = df.codigo_act.map({c[0]: i for i, c in enumerate(CLASES)})
    txt = (df.nom_estab.fillna("") + " " + df.raz_social.fillna("")).str.upper()
    tex, piel = txt.str.contains(RE_TEXTIL), txt.str.contains(RE_PIEL)
    ropa, calz = txt.str.contains(RE_ROPA), txt.str.contains(RE_CALZADO)
    marca = pd.Series(0, index=df.index)
    acopio = df.ci.isin([1, 2, 3])
    marca[acopio & piel] = 2
    marca[acopio & tex] = 1
    marca[df.ci == 0] = 1
    usados = df.ci == 4
    marca[usados & calz] = 4
    marca[usados & ropa] = 3
    df["marca"] = marca
    # Orden de dibujo: reúso abajo, transformación arriba
    df["orden"] = df.ci.map({4: 0, 1: 1, 3: 2, 2: 3, 0: 4})
    df = df.sort_values(["orden", "cve_ent", "cve_mun"]).reset_index(drop=True)
    df["cve"] = df.cve_ent + df.cve_mun
    muns = df.drop_duplicates("cve")[["cve", "municipio", "entidad"]].sort_values("cve")
    mun_idx = {c: i for i, c in enumerate(muns.cve)}

    def domicilio(r) -> str:
        calle = " ".join(x for x in [limpiar(r.tipo_vial).title(), limpiar(r.nom_vial).title(), limpiar(r.numero_ext)] if x and x != "SN")
        partes = [calle, limpiar(r.nomb_asent).title(), ("C.P. " + limpiar(r.cod_postal)) if limpiar(r.cod_postal) else ""]
        return ", ".join(p for p in partes if p)

    nombres = [limpiar(a) or limpiar(b) for a, b in zip(df.nom_estab, df.raz_social)]
    det = []
    for r in df.itertuples():
        if r.ci == 4:
            det.append(0)
        else:
            det.append([domicilio(r), limpiar(r.telefono), limpiar(r.correoelec).lower(), limpiar(r.www).lower()])
    out = {
        "fuente": "INEGI, DENUE 05/2026. Clases SCIAN de reciclaje, recuperación y reúso.",
        "clases": [{"codigo": c, "nombre": n, "funcion": f} for c, n, f in CLASES],
        "marcas": MARCAS,
        "municipios": [[r.cve, limpiar(r.municipio), limpiar(r.entidad)] for r in muns.itertuples()],
        "x": [round(float(v), 5) for v in df.longitud],
        "y": [round(float(v), 5) for v in df.latitud],
        "c": df.ci.astype(int).tolist(),
        "t": [tam_idx.get(limpiar(p), 255) for p in df.per_ocu],
        "m": [mun_idx[c] for c in df.cve],
        "f": df.marca.astype(int).tolist(),
        "nom": nombres,
        "det": det,
    }
    (DATOS / "circular.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"circular.json: {(DATOS / 'circular.json').stat().st_size / 1e6:.2f} MB, {len(df)} establecimientos")
    print(pd.crosstab(df.codigo_act, df.marca).to_string())
    print("Sin tamaño:", sum(1 for t in out["t"] if t == 255))


if __name__ == "__main__":
    main()
