"""
Observatorio Textil, Moda y Calzado MX - Fase 1
Prepara los datos del DENUE (GeoPackage del proyecto) para la app web estática.

Uso (desde la carpeta app_observatorio):
    python preparar_datos.py

Salidas en web/data/:
    puntos.bin      arreglos binarios de todos los establecimientos (ver meta.json -> "binario")
    meta.json       catálogos: capas, clases SCIAN, tamaños, años, entidades, municipios
    entidades.geojson  límites estatales simplificados (EPSG:4326)
    detalle/XX.json nombre del establecimiento y localidad, por entidad, en el mismo
                    orden que los puntos de esa entidad (se carga bajo demanda)

Solo se exportan campos descriptivos públicos del DENUE (nombre del establecimiento,
actividad, tamaño, ubicación). No se exportan teléfono, correo, razón social ni domicilio.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

AQUI = Path(__file__).resolve().parent
GPKG = AQUI.parent / "DENUE_textil_moda.gpkg"
SALIDA = AQUI / "web" / "data"

# Orden de la cadena de valor. segmento: 0 manufactura textil, 1 manufactura de cuero y calzado, 2 comercio, 3 diseño
CAPAS = [
    ("insumos_textiles", "Insumos y acabado textil", "313", 0, "Fibras, hilos, telas y acabado"),
    ("productos_textiles", "Productos textiles", "314", 0, "Blancos, cortinas, bordado, cordelería"),
    ("prendas_vestir", "Prendas de vestir", "315", 0, "Confección en serie y sobre medida"),
    ("curtido", "Curtido de cuero", "3161", 1, "Curtido y acabado de cuero y piel"),
    ("calzado_bolsos", "Calzado y bolsos", "3162 · 316991", 1, "Calzado, bolsos y maletas"),
    ("mayoristas", "Comercio mayorista", "4321", 2, "Telas, cueros, ropa y calzado al por mayor"),
    ("minoristas_textiles", "Tiendas de textiles", "4631", 2, "Telas, blancos y mercería"),
    ("minoristas_moda", "Ropa y accesorios", "4632", 2, "Ropa, lencería, bisutería, sombreros"),
    ("minoristas_calzado", "Zapaterías", "463310", 2, "Comercio al por menor de calzado"),
    ("diseno_candidatos", "Diseño especializado (candidatos)", "541490", 3,
     "Diseño de modas y otros diseños; no es exclusivo de moda"),
]
SEGMENTOS = ["Manufactura textil y confección", "Manufactura de cuero y calzado", "Comercio", "Diseño (candidatos)"]

TAMANOS = ["0 a 5", "6 a 10", "11 a 30", "31 a 50", "51 a 100", "101 a 250", "251 y más"]
ANIO_BASE = 2010


def tamano_idx(txt: str | None) -> int:
    if not txt:
        return 255
    t = txt.strip()
    for i, pref in enumerate(["0 a", "6 a", "11 a", "31 a", "51 a", "101 a", "251"]):
        if t.startswith(pref):
            return i
    return 255


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / "detalle").mkdir(exist_ok=True)

    con = sqlite3.connect(GPKG)
    con.text_factory = lambda b: b.decode("utf-8", errors="replace")
    partes = []
    for i, (capa, *_rest) in enumerate(CAPAS):
        df = pd.read_sql(
            f"""select codigo_act, per_ocu, cve_ent, entidad, cve_mun, municipio,
                       nom_estab, localidad, latitud, longitud, fecha_alta
                from "{capa}" """,
            con,
        )
        df["capa"] = i
        partes.append(df)
        print(f"{capa:22s} {len(df):>8,d}")
    con.close()
    d = pd.concat(partes, ignore_index=True)
    print(f"{'TOTAL':22s} {len(d):>8,d}")

    d["cve_ent"] = d["cve_ent"].astype(str).str.zfill(2)
    d["cve_mun"] = d["cve_mun"].astype(str).str.zfill(3)
    d["cvegeo"] = d["cve_ent"] + d["cve_mun"]
    d["codigo_act"] = d["codigo_act"].astype(str)
    for col in ["nom_estab", "localidad", "municipio", "entidad"]:
        d[col] = d[col].fillna("").astype(str).str.strip().str.replace(r"\s+", " ", regex=True)

    # Catálogo de clases SCIAN, en orden de capa y código
    clases = (
        d.groupby(["capa", "codigo_act"])
        .size()
        .reset_index(name="n")
        .sort_values(["capa", "codigo_act"])
    )
    nombres = pd.read_csv(AQUI.parent / "Clases_SCIAN.csv", dtype=str, encoding="utf-8-sig")
    nombres = dict(zip(nombres["codigo_act"], nombres["nombre_act"]))
    clases["nombre"] = clases["codigo_act"].map(nombres).fillna("")
    clase_idx = {c: i for i, c in enumerate(clases["codigo_act"])}
    d["clase"] = d["codigo_act"].map(clase_idx).astype(np.uint8)

    d["tam"] = d["per_ocu"].map(tamano_idx).astype(np.uint8)
    anio = pd.to_numeric(d["fecha_alta"].astype(str).str[:4], errors="coerce")
    d["anio"] = (anio - ANIO_BASE).fillna(255).clip(0, 255).astype(np.uint8)

    # Municipios
    mun = (
        d.groupby("cvegeo")
        .agg(municipio=("municipio", "first"), cve_ent=("cve_ent", "first"))
        .reset_index()
        .sort_values("cvegeo")
        .reset_index(drop=True)
    )
    mun_idx = {c: i for i, c in enumerate(mun["cvegeo"])}
    d["mun"] = d["cvegeo"].map(mun_idx).astype(np.uint16)

    # Orden: entidad, capa (los puntos de cada entidad quedan contiguos)
    d = d.sort_values(["cve_ent", "capa", "cvegeo"], kind="stable").reset_index(drop=True)
    n = len(d)

    # Binario: lon f32[n], lat f32[n], mun u16[n], capa u8[n], clase u8[n], tam u8[n], anio u8[n]
    bloques = [
        ("lon", d["longitud"].astype(np.float32).to_numpy()),
        ("lat", d["latitud"].astype(np.float32).to_numpy()),
        ("mun", d["mun"].to_numpy(np.uint16)),
        ("capa", d["capa"].to_numpy(np.uint8)),
        ("clase", d["clase"].to_numpy(np.uint8)),
        ("tam", d["tam"].to_numpy(np.uint8)),
        ("anio", d["anio"].to_numpy(np.uint8)),
    ]
    disposicion, desplaz = [], 0
    with open(SALIDA / "puntos.bin", "wb") as f:
        for nombre, arr in bloques:
            # alinear cada bloque a 4 bytes para poder crear vistas tipadas en JS
            relleno = (-desplaz) % 4
            f.write(b"\0" * relleno)
            desplaz += relleno
            f.write(arr.tobytes())
            disposicion.append({"campo": nombre, "tipo": str(arr.dtype), "offset": desplaz})
            desplaz += arr.nbytes

    # Entidades: rango de índices por entidad
    entidades = []
    for cve, g in d.groupby("cve_ent", sort=True):
        entidades.append({
            "cve": cve, "nombre": g["entidad"].iloc[0],
            "inicio": int(g.index.min()), "fin": int(g.index.max()) + 1,
        })
        det = g[["nom_estab", "localidad"]].fillna("").to_numpy().tolist()
        with open(SALIDA / "detalle" / f"{cve}.json", "w", encoding="utf-8") as f:
            json.dump(det, f, ensure_ascii=False, separators=(",", ":"))

    meta = {
        "titulo": "Observatorio Textil, Moda y Calzado MX",
        "fuente": "INEGI, Directorio Estadístico Nacional de Unidades Económicas (DENUE), 05/2026",
        "n": n,
        "binario": disposicion,
        "segmentos": SEGMENTOS,
        "capas": [
            {"clave": c, "nombre": nm, "scian": sc, "segmento": seg, "descripcion": ds,
             "n": int((d["capa"] == i).sum())}
            for i, (c, nm, sc, seg, ds) in enumerate(CAPAS)
        ],
        "clases": [
            {"codigo": r.codigo_act, "nombre": r.nombre, "capa": int(r.capa)}
            for r in clases.itertuples()
        ],
        "tamanos": TAMANOS,
        "anio_base": ANIO_BASE,
        "entidades": entidades,
        "municipios": [[r.cvegeo, r.municipio] for r in mun.itertuples()],
    }
    with open(SALIDA / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))

    # Límites estatales
    ent = gpd.read_file(GPKG, layer="entidades").to_crs(4326)
    ent["geometry"] = ent.geometry.simplify(0.005, preserve_topology=True)
    ent["cve"] = ent["cvegeo"].astype(str).str.zfill(2)
    ent[["cve", "entidad", "geometry"]].to_file(
        SALIDA / "entidades.geojson", driver="GeoJSON", COORDINATE_PRECISION=4
    )

    for p in sorted(SALIDA.rglob("*")):
        if p.is_file() and p.parent.name != "detalle":
            print(f"{p.relative_to(SALIDA)}: {p.stat().st_size/1e6:.2f} MB")
    tam_det = sum(p.stat().st_size for p in (SALIDA / "detalle").glob("*.json"))
    print(f"detalle/: {tam_det/1e6:.2f} MB en {len(entidades)} archivos")


if __name__ == "__main__":
    main()
