# -*- coding: utf-8 -*-
"""Actualiza publicidad y campañas de ``static/status-data.json`` desde Data Hub.

No consulta ni modifica campañas. Solo lee métricas ya sincronizadas para
DrDiente Polanco y Roma Norte, conserva intactos Dentalink/caja/SEO y escribe
los cortes por plataforma para evitar presentar fuentes desfasadas como si
fueran del mismo día.

Uso:
  uv run --with 'psycopg[binary]' python \
    scripts/actualizar_status_ads_desde_data_hub.py \
    --database-url "$ELEVATOR_SUPABASE_DATABASE_URL"

También acepta ``--secrets /ruta/elevator-data-hub.json``; el archivo debe
contener ``ELEVATOR_SUPABASE_DATABASE_URL`` y nunca debe versionarse.
"""
from __future__ import annotations

import argparse
import json
import shutil
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parent.parent
JSON_PATH = RAIZ / "static" / "status-data.json"
CLINICS = {
    "drdiente-polanco": "polanco",
    "drdiente-roma-norte": "roma",
}
ADS_FIELDS = (
    "gImp", "gClics", "gCosto", "gCostoMaps", "gConv", "gLeads",
    "mImp", "mClics", "mGasto", "mLeads",
)
CLINICAL_FIELDS = (
    "citas", "atendidas", "presupN", "presupMonto", "presupIni", "caja", "pagosN",
)


def is_maps(name: str) -> bool:
    return "maps" in (name or "").lower()


def pct_delta(current: float, previous: float) -> float | None:
    if previous == 0:
        return None
    return round(((current - previous) / previous) * 100, 1)


def load_database_url(args: argparse.Namespace) -> str:
    if args.database_url:
        return args.database_url
    if args.secrets:
        payload = json.loads(Path(args.secrets).expanduser().read_text(encoding="utf-8"))
        value = payload.get("ELEVATOR_SUPABASE_DATABASE_URL")
        if value:
            return str(value)
    raise SystemExit("Falta --database-url o --secrets con ELEVATOR_SUPABASE_DATABASE_URL")


def query_rows(conn: Any, start: str, end: str) -> list[dict[str, Any]]:
    sql = """
      SELECT c.slug, aa.platform, cm.metric_date, cp.campaign_name AS name,
             SUM(cm.spend)::float8 AS spend,
             SUM(cm.impressions)::float8 AS impressions,
             SUM(cm.clicks)::float8 AS clicks,
             SUM(cm.conversions)::float8 AS conversions
      FROM public.campaign_metrics_daily cm
      JOIN public.campaigns cp ON cp.id = cm.campaign_id
      JOIN public.ad_accounts aa ON aa.id = cp.ad_account_id
      JOIN public.clients c ON c.id = aa.client_id
      WHERE c.slug = ANY(%s)
        AND aa.platform IN ('google_ads', 'meta_ads')
        AND cm.metric_date BETWEEN %s AND %s
      GROUP BY c.slug, aa.platform, cm.metric_date, cp.campaign_name
      ORDER BY cm.metric_date, c.slug, aa.platform, cp.campaign_name
    """
    with conn.cursor() as cur:
        cur.execute(sql, (list(CLINICS), start, end))
        columns = [d.name for d in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def query_campaigns(conn: Any, start: str, end: str, previous_start: str, previous_end: str) -> list[dict[str, Any]]:
    sql = """
      SELECT c.slug, cp.campaign_name AS name, cp.status,
             COALESCE(SUM(cm.spend) FILTER (WHERE cm.metric_date BETWEEN %s AND %s), 0)::float8 AS spend,
             COALESCE(SUM(cm.conversions) FILTER (WHERE cm.metric_date BETWEEN %s AND %s), 0)::float8 AS leads,
             COALESCE(SUM(cm.spend) FILTER (WHERE cm.metric_date BETWEEN %s AND %s), 0)::float8 AS previous_spend
      FROM public.campaigns cp
      JOIN public.ad_accounts aa ON aa.id = cp.ad_account_id
      JOIN public.clients c ON c.id = aa.client_id
      LEFT JOIN public.campaign_metrics_daily cm ON cm.campaign_id = cp.id
        AND cm.metric_date BETWEEN %s AND %s
      WHERE c.slug = ANY(%s) AND aa.platform = 'google_ads'
      GROUP BY c.slug, cp.id, cp.campaign_name, cp.status
      ORDER BY c.slug, spend DESC, cp.campaign_name
    """
    with conn.cursor() as cur:
        cur.execute(sql, (
            start, end, start, end, previous_start, previous_end,
            previous_start, end, list(CLINICS),
        ))
        columns = [d.name for d in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def merge_ads(data: dict[str, Any], rows: list[dict[str, Any]], campaign_rows: list[dict[str, Any]], today: str) -> dict[str, Any]:
    daily: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: {field: 0.0 for field in ADS_FIELDS})
    cutoffs: dict[str, str] = {}
    clinic_cutoffs: dict[str, dict[str, str]] = {"polanco": {}, "roma": {}}

    for row in rows:
        clinic = CLINICS[row["slug"]]
        platform = row["platform"]
        metric_date = row["metric_date"].isoformat() if hasattr(row["metric_date"], "isoformat") else str(row["metric_date"])
        cutoffs[platform] = max(cutoffs.get(platform, metric_date), metric_date)
        clinic_cutoffs[clinic][platform] = max(clinic_cutoffs[clinic].get(platform, metric_date), metric_date)
        item = daily[(metric_date, clinic)]
        if platform == "google_ads":
            item["gImp"] += row["impressions"]
            item["gClics"] += row["clicks"]
            item["gCosto"] += row["spend"]
            item["gConv"] += row["conversions"]
            if is_maps(row["name"]):
                item["gCostoMaps"] += row["spend"]
            else:
                item["gLeads"] += row["conversions"]
        else:
            item["mImp"] += row["impressions"]
            item["mClics"] += row["clicks"]
            item["mGasto"] += row["spend"]
            item["mLeads"] += row["conversions"]

    old_days = {(row["fecha"], row["clinica"]): dict(row) for row in data.get("dias", [])}
    keys = set(old_days) | set(daily)
    merged_days: list[dict[str, Any]] = []
    for key in sorted(keys):
        base = old_days.get(key, {"fecha": key[0], "clinica": key[1]})
        for field in (*ADS_FIELDS, *CLINICAL_FIELDS):
            base.setdefault(field, 0)
        fresh = daily.get(key)
        if fresh is not None:
            for field in ADS_FIELDS:
                value = fresh[field]
                base[field] = round(value, 6)
        merged_days.append(base)
    data["dias"] = merged_days

    google_cutoff = cutoffs.get("google_ads")
    meta_cutoff = cutoffs.get("meta_ads")
    if google_cutoff:
        data["cierreGoogleAds"] = google_cutoff
    if meta_cutoff:
        data["cierreMetaAds"] = meta_cutoff
    available = [value for value in (google_cutoff, meta_cutoff) if value]
    if available:
        data["cierreAds"] = max(available)
        data["rango"]["hasta"] = max(data["rango"].get("hasta", ""), max(available))
    data["cortesAdsPorClinica"] = {
        clinic: {
            "googleAds": values.get("google_ads"),
            "metaAds": values.get("meta_ads"),
        }
        for clinic, values in clinic_cutoffs.items()
    }

    accounts: dict[str, list[dict[str, Any]]] = {"polanco": [], "roma": []}
    for row in campaign_rows:
        clinic = CLINICS[row["slug"]]
        spend = float(row["spend"])
        leads = float(row["leads"])
        accounts[clinic].append({
            "nombre": row["name"],
            "estado": row["status"],
            "gasto": round(spend, 2),
            "leads": round(leads, 6),
            "cpl": round(spend / leads, 2) if leads > 0 else None,
            "esMaps": is_maps(row["name"]),
            "deltaGasto": pct_delta(spend, float(row["previous_spend"])),
        })

    window_end = google_cutoff or today
    window_start = (date.fromisoformat(window_end) - timedelta(days=6)).isoformat()
    data["campanasSemana"] = {
        "ventana": {"desde": window_start, "hasta": window_end},
        "cuentas": accounts,
    }
    data.setdefault("notas", {})["meta"] = (
        f"Google Ads actualizado al {google_cutoff or 'sin datos'}; "
        f"Meta/Windsor: Polanco al {clinic_cutoffs['polanco'].get('meta_ads', 'sin datos')} y "
        f"Roma Norte al {clinic_cutoffs['roma'].get('meta_ads', 'sin datos')}. "
        "Los resultados de plataforma no equivalen automáticamente a citas o pacientes."
    )
    data["generado"] = datetime.now(ZoneInfo("America/Mexico_City")).strftime("%Y-%m-%dT%H:%M")
    return data


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url")
    parser.add_argument("--secrets")
    parser.add_argument("--json", default=str(JSON_PATH))
    parser.add_argument("--hasta", default=date.today().isoformat())
    args = parser.parse_args()

    path = Path(args.json)
    data = json.loads(path.read_text(encoding="utf-8"))
    start = data["rango"]["desde"]
    end = args.hasta
    campaign_start = (date.fromisoformat(end) - timedelta(days=6)).isoformat()
    previous_end = (date.fromisoformat(campaign_start) - timedelta(days=1)).isoformat()
    previous_start = (date.fromisoformat(previous_end) - timedelta(days=6)).isoformat()

    import psycopg  # dependencia opcional, solo requerida al ejecutar este script

    with psycopg.connect(load_database_url(args), connect_timeout=20) as conn:
        rows = query_rows(conn, start, end)
        campaigns = query_campaigns(conn, campaign_start, end, previous_start, previous_end)

    updated = merge_ads(data, rows, campaigns, end)
    shutil.copy2(path, path.with_suffix(".prev.json"))
    path.write_text(json.dumps(updated, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"OK · Google Ads al {updated.get('cierreGoogleAds', 'sin datos')} · "
        f"Meta al {updated.get('cierreMetaAds', 'sin datos')} · "
        f"{len(rows)} filas agregadas"
    )


if __name__ == "__main__":
    main()
