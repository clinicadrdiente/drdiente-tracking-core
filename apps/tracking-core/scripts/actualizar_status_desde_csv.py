# -*- coding: utf-8 -*-
"""Actualiza static/status-data.json con exports frescos de Dentalink (CSV).

Qué actualiza y qué no:

  FRESCO (desde los CSV)         CONSERVADO (del JSON anterior)
  ------------------------       --------------------------------
  dias[].citas / atendidas       dias[].g* / m* (Windsor: publicidad)
  atribucion[].citas/atendidas   dias[].caja / pagosN / presup* (pagos)
  pacientesNuevos[].pacientes    atribucion[].caja / pagos / presupMonto
                                 pacientesNuevos[].caja
                                 recomendadores (viene de pagos)
                                 agendaFutura / seo / mercado / campanasSemana

Como publicidad (Windsor) y caja (export de pagos) NO viajan en estos CSV,
el script deja `cierreAds` y `cierreCaja` en el cierre anterior. El panel usa
esos campos para ventanear el dinero con su propia fecha y etiquetarlo.
Cuando haya export de pagos, se integra y se adelanta cierreCaja.

Reglas de conteo (validadas contra el pipeline anterior, junio: 653 vs 650
citas y 430 vs 426 atendidas; las diferencias son mutaciones retroactivas
de estado en Dentalink — el export fresco es la verdad más reciente):

  cita      = fila con Estado Cita != "Cambio de fecha"
  atendida  = Estado Cita == "Atendido"
  sucursal  = "Drdiente S.A de C.V" -> polanco · "Carlos Enrique Ariza Torcat" -> roma

Uso:
  python3 scripts/actualizar_status_desde_csv.py \
      --agenda ~/Downloads/..._agenda_citas_*.csv \
      --nuevos ~/Downloads/..._pacientes_nuevos_*.csv \
      --hasta 2026-08-05
"""
import argparse, csv, json, shutil, sys, unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parent.parent
JSON_PATH = RAIZ / "static" / "status-data.json"

SUCURSAL = {
    "Drdiente S.A de C.V": "polanco",
    "Carlos Enrique Ariza Torcat": "roma",
}

CAMPOS_DINERO_DIA = ("gImp", "gClics", "gCosto", "gCostoMaps", "gConv", "gLeads",
                     "mImp", "mClics", "mGasto", "mLeads",
                     "presupN", "presupMonto", "presupIni", "caja", "pagosN")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def canal_de(ref: str) -> str:
    """Referencia libre de recepción -> canal del panel (mismo espíritu que el
    pipeline anterior; validado contra junio: Recomendación 245/247, IA 8/8)."""
    r = norm(ref)
    if r in ("", "-", "0", ".", "n/a", "na", "x"):
        return "Sin registro"
    if "google map" in r or "maps" in r:
        return "Google Maps"
    if "google" in r or "internet" in r:
        return "Google"
    if "tik" in r:
        return "TikTok"
    if "chat gpt" in r or "chatgpt" in r or r == "ia" or r.startswith("ia ") or "inteligencia artificial" in r:
        return "IA (ChatGPT)"
    if "instagram" in r or "facebook" in r or "meta" in r or "redes" in r or r == "ig":
        return "Meta / Redes"
    if "doctoralia" in r:
        return "Doctoralia"
    if "whats" in r:
        return "WhatsApp"
    if "pagina web" in r or "sitio web" in r or r == "web":
        return "Página web"
    if "pasando" in r or "cercania" in r or "vive cerca" in r or "caminando" in r:
        return "Cercanía"
    if ("recomend" in r or "referid" in r or "refiere" in r or "ariza" in r
            or r.startswith("dr ") or r.startswith("dra ") or "paciente" in r
            or "familiar" in r or "amig" in r or "hija" in r or "hijo" in r
            or "mama" in r or "papa" in r or "espos" in r or "herman" in r or "prim" in r):
        return "Recomendación"
    return "Otro"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--agenda", required=True)
    ap.add_argument("--nuevos", required=True)
    ap.add_argument("--hasta", required=True, help="YYYY-MM-DD: último día con datos de citas")
    ap.add_argument("--json", default=str(JSON_PATH))
    args = ap.parse_args()

    ruta = Path(args.json)
    viejo = json.loads(ruta.read_text(encoding="utf-8"))
    desde_rango = viejo["rango"]["desde"]
    cierre_anterior = viejo["cierreDatos"]

    # ── agenda: citas/atendidas por día+clínica y por canal ──────────────────
    citas_dia: Counter = Counter()
    atend_dia: Counter = Counter()
    citas_canal: Counter = Counter()
    atend_canal: Counter = Counter()
    with open(args.agenda, encoding="utf-8-sig") as f:
        for x in csv.DictReader(f):
            suc = SUCURSAL.get(x.get("Nombre Sucursal", ""))
            fecha = x.get("Fecha Cita", "")
            if not suc or not (desde_rango <= fecha <= args.hasta):
                continue
            estado = x.get("Estado Cita", "")
            canal = canal_de(x.get("Referencia Paciente", ""))
            if estado != "Cambio de fecha":
                citas_dia[(fecha, suc)] += 1
                citas_canal[(fecha, suc, canal)] += 1
            if estado == "Atendido":
                atend_dia[(fecha, suc)] += 1
                atend_canal[(fecha, suc, canal)] += 1

    # ── dias: citas frescas, dinero/ads conservados ──────────────────────────
    viejos_dias = {(d["fecha"], d["clinica"]): d for d in viejo["dias"]}
    claves = set(viejos_dias) | set(citas_dia) | set(atend_dia)
    dias = []
    for fecha, cli in sorted(claves):
        base = viejos_dias.get((fecha, cli), {})
        fila = {"fecha": fecha, "clinica": cli}
        for c in CAMPOS_DINERO_DIA:
            fila[c] = base.get(c, 0)
        fila["citas"] = citas_dia.get((fecha, cli), 0)
        fila["atendidas"] = atend_dia.get((fecha, cli), 0)
        dias.append(fila)

    # ── atribución: citas frescas por canal, dinero conservado ───────────────
    viejos_atr = {(a["fecha"], a["clinica"], a["canal"]): a for a in viejo["atribucion"]}
    claves_a = set(viejos_atr) | set(citas_canal) | set(atend_canal)
    atribucion = []
    for fecha, cli, canal in sorted(claves_a):
        base = viejos_atr.get((fecha, cli, canal), {})
        atribucion.append({
            "fecha": fecha, "clinica": cli, "canal": canal,
            "caja": base.get("caja", 0), "pagos": base.get("pagos", 0),
            "citas": citas_canal.get((fecha, cli, canal), 0),
            "atendidas": atend_canal.get((fecha, cli, canal), 0),
            "presupMonto": base.get("presupMonto", 0),
        })

    # ── pacientes nuevos: conteos frescos, caja conservada ───────────────────
    pn_fresco: Counter = Counter()
    with open(args.nuevos, encoding="utf-8-sig") as f:
        for x in csv.DictReader(f):
            fecha = x.get("Fecha de afiliación", "")
            if desde_rango <= fecha <= args.hasta:
                pn_fresco[(fecha, canal_de(x.get("Referencia Paciente", "")))] += 1
    viejos_pn = {(p["fecha"], p["canal"]): p for p in viejo["pacientesNuevos"]}
    pacientes_nuevos = []
    for fecha, canal in sorted(set(viejos_pn) | set(pn_fresco)):
        base = viejos_pn.get((fecha, canal), {})
        pacientes_nuevos.append({
            "fecha": fecha, "canal": canal,
            "pacientes": pn_fresco.get((fecha, canal), base.get("pacientes", 0)),
            "caja": base.get("caja", 0),
        })

    # ── invariantes: el dinero no puede moverse ni un centavo ────────────────
    for nombre, antes, ahora in (
        ("dias.caja", sum(d["caja"] for d in viejo["dias"]), sum(d["caja"] for d in dias)),
        ("atribucion.caja", sum(a["caja"] for a in viejo["atribucion"]), sum(a["caja"] for a in atribucion)),
        ("dias.gCosto", round(sum(d["gCosto"] for d in viejo["dias"]), 2), round(sum(d["gCosto"] for d in dias), 2)),
        ("pacientesNuevos.caja", sum(p["caja"] for p in viejo["pacientesNuevos"]), sum(p["caja"] for p in pacientes_nuevos)),
    ):
        if antes != ahora:
            sys.exit(f"ABORTADO: {nombre} cambió ({antes} -> {ahora}); el dinero es intocable aquí.")

    nuevo = dict(viejo)
    nuevo["dias"] = dias
    nuevo["atribucion"] = atribucion
    nuevo["pacientesNuevos"] = pacientes_nuevos
    nuevo["cierreDatos"] = args.hasta
    nuevo["rango"] = {"desde": desde_rango, "hasta": args.hasta}
    # Publicidad y caja siguen cerradas donde estaban (no vinieron en estos CSV).
    nuevo.setdefault("cierreAds", cierre_anterior)
    nuevo.setdefault("cierreCaja", cierre_anterior)
    nuevo["generado"] = datetime.now(ZoneInfo("America/Mexico_City")).strftime("%Y-%m-%dT%H:%M")

    shutil.copy2(ruta, ruta.with_suffix(".prev.json"))
    ruta.write_text(json.dumps(nuevo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # resumen operativo
    ag = [(f, c) for (f, c) in citas_dia if f > cierre_anterior]
    print(f"OK · cierreDatos {cierre_anterior} -> {args.hasta}")
    print(f"   citas frescas en días nuevos: {sum(citas_dia[k] for k in ag)} "
          f"(polanco {sum(v for (f, c), v in citas_dia.items() if f > cierre_anterior and c == 'polanco')}, "
          f"roma {sum(v for (f, c), v in citas_dia.items() if f > cierre_anterior and c == 'roma')})")
    print(f"   pacientes nuevos {cierre_anterior} -> {args.hasta}: "
          f"{sum(v for (f, _), v in pn_fresco.items() if f > cierre_anterior)}")
    print(f"   cierreAds/cierreCaja quedan en {cierre_anterior} (faltan Windsor y export de pagos)")


if __name__ == "__main__":
    main()
