"""Descarga del SAIC (INEGI, Censos Económicos 2024) para la Fase 2.

Para las 54 clases SCIAN del proyecto descarga, a nivel nacional, estatal y
municipal, las variables del perfil económico. Guarda cada exportación tal como
la entrega el SAIC (CSV decodificado) junto con los parámetros exactos, en
fuentes/ce2024/. Las celdas vacías son datos confidenciales: se conservan vacías.

    python descargar_ce2024.py
"""
from __future__ import annotations

import base64
import csv
import json
import time
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
SALIDA = AQUI / "fuentes" / "ce2024"
URL = "https://www.inegi.org.mx/app/api/saic/exporta/files/2/6/"

VARIABLES = [
    "UE",     # Unidades económicas
    "H001A",  # Personal ocupado total
    "H010A",  # Personal remunerado total
    "J000A",  # Total de remuneraciones (mdp)
    "A111A",  # Producción bruta total (mdp)
    "A131A",  # Valor agregado censal bruto (mdp)
    "M000A",  # Total de ingresos por suministro de bienes y servicios (mdp)
    "Q000A",  # Acervo total de activos fijos (mdp)
]


def clases() -> list[str]:
    with open(RAIZ / "Clases_SCIAN.csv", encoding="utf-8-sig") as f:
        return [r["codigo_act"] for r in csv.DictReader(f)]


def municipios() -> dict[str, list[str]]:
    cat = RAIZ / "CE2024_Textil_Moda_tablas_QGIS" / "Catalogo_municipal_CE2024.csv"
    out: dict[str, list[str]] = {}
    with open(cat, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            out.setdefault(r["E03"], []).append(r["CVEGEO"])
    return out


def consulta(ageos: list[str], actecos: list[str]) -> tuple[dict, str]:
    params = {
        "anios": [2023], "ageos": ageos, "actecos": actecos,
        "varcens": [{"nom": v, "pos": i} for i, v in enumerate(VARIABLES)],
        "indicators": [], "stratums": [0], "calcs": [], "total": False,
        "orden": 0, "desc": False, "page": 0, "reg": 0,
    }
    req = urllib.request.Request(
        URL, data=json.dumps(params).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "observatorio-textil/1.0"},
    )
    for intento in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                b64 = json.load(r)
            texto = base64.b64decode(b64).decode("utf-8-sig").replace("\x00", "")
            return params, texto
        except Exception as e:  # red inestable: reintentar
            if intento == 3:
                raise
            print(f"  reintento {intento + 1}: {e}")
            time.sleep(5 * (intento + 1))
    raise RuntimeError("sin respuesta")


def guardar(nombre: str, params: dict, texto: str) -> int:
    (SALIDA / f"{nombre}.csv").write_text(texto, encoding="utf-8")
    (SALIDA / f"{nombre}_parametros.json").write_text(json.dumps(params, indent=1), encoding="utf-8")
    return sum(1 for l in texto.splitlines() if l.startswith("2023,"))


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    act = clases()
    print(f"{len(act)} clases, variables: {', '.join(VARIABLES)}")
    n = guardar("nacional", *consulta(["00"], act)); print(f"nacional: {n} filas")
    ents = [f"{i:02d}" for i in range(1, 33)]
    n = guardar("estatal", *consulta(ents, act)); print(f"estatal: {n} filas")
    for e, mun in sorted(municipios().items()):
        n = guardar(f"municipal_{e}", *consulta(mun, act)); print(f"municipal {e}: {n} filas")
        time.sleep(0.5)


if __name__ == "__main__":
    main()
