import importlib.util
import unittest
from datetime import date
from pathlib import Path

SCRIPT = Path(__file__).with_name("actualizar_status_ads_desde_data_hub.py")
SPEC = importlib.util.spec_from_file_location("actualizar_status_ads", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MergeAdsTests(unittest.TestCase):
    def base_data(self):
        return {
            "rango": {"desde": "2026-08-01", "hasta": "2026-08-05"},
            "dias": [
                {
                    "fecha": "2026-08-05",
                    "clinica": "roma",
                    "gImp": 100,
                    "gClics": 10,
                    "gCosto": 50,
                    "gCostoMaps": 0,
                    "gConv": 2,
                    "gLeads": 2,
                    "mImp": 200,
                    "mClics": 20,
                    "mGasto": 30,
                    "mLeads": 3,
                    "citas": 4,
                    "atendidas": 2,
                    "presupN": 1,
                    "presupMonto": 1000,
                    "presupIni": 1,
                    "caja": 500,
                    "pagosN": 1,
                }
            ],
            "campanasSemana": {"ventana": {}, "cuentas": {}},
            "notas": {},
        }

    def test_google_only_refresh_preserves_existing_meta(self):
        rows = [{
            "slug": "drdiente-roma-norte",
            "platform": "google_ads",
            "metric_date": date(2026, 8, 5),
            "name": "Search",
            "spend": 75,
            "impressions": 150,
            "clicks": 15,
            "conversions": 4,
        }]
        result = MODULE.merge_ads(self.base_data(), rows, [], "2026-08-17")
        day = result["dias"][0]
        self.assertEqual(day["gCosto"], 75)
        self.assertEqual(day["mGasto"], 30)
        self.assertEqual(day["mImp"], 200)

    def test_meta_only_refresh_preserves_existing_google(self):
        rows = [{
            "slug": "drdiente-roma-norte",
            "platform": "meta_ads",
            "metric_date": date(2026, 8, 5),
            "name": "Meta",
            "spend": 45,
            "impressions": 250,
            "clicks": 25,
            "conversions": 5,
        }]
        result = MODULE.merge_ads(self.base_data(), rows, [], "2026-08-17")
        day = result["dias"][0]
        self.assertEqual(day["mGasto"], 45)
        self.assertEqual(day["gCosto"], 50)
        self.assertEqual(day["gImp"], 100)

    def test_refresh_does_not_extend_shared_clinical_range(self):
        rows = [
            {
                "slug": slug,
                "platform": platform,
                "metric_date": date(2026, 8, cutoff),
                "name": "Campaign",
                "spend": 1,
                "impressions": 1,
                "clicks": 1,
                "conversions": 0,
            }
            for slug, platform, cutoff in (
                ("drdiente-polanco", "google_ads", 17),
                ("drdiente-roma-norte", "google_ads", 17),
                ("drdiente-polanco", "meta_ads", 17),
                ("drdiente-roma-norte", "meta_ads", 12),
            )
        ]
        result = MODULE.merge_ads(self.base_data(), rows, [], "2026-08-17")
        self.assertEqual(result["rango"]["hasta"], "2026-08-05")
        self.assertEqual(result["cierreGoogleAds"], "2026-08-17")
        self.assertEqual(result["cierreMetaAds"], "2026-08-12")
        self.assertEqual(result["cierreAds"], "2026-08-12")


if __name__ == "__main__":
    unittest.main()
