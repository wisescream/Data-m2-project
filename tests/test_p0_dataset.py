#!/usr/bin/env python3
"""
FinLake P0 — Automated validation tests for PaySim dataset and P0 deliverables.

Runs via standard library unittest or pytest:
    python -m unittest tests/test_p0_dataset.py -v
"""
import csv
import hashlib
import json
import os
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
DOCS_DIR = PROJECT_ROOT / "docs"
CSV_FILE = RAW_DIR / "PS_20174392719_1491204439457_log.csv"
CHECKSUM_FILE = RAW_DIR / "checksums.sha256"
JSON_REPORT_FILE = DOCS_DIR / "quality_report.json"
MD_REPORT_FILE = DOCS_DIR / "quality_report.md"
DATA_DICT_FILE = DOCS_DIR / "data_dictionary.md"
DATASET_CARD_FILE = DOCS_DIR / "dataset_card.md"

EXPECTED_COLUMNS = [
    "step", "type", "amount", "nameOrig", "oldbalanceOrg",
    "newbalanceOrig", "nameDest", "oldbalanceDest",
    "newbalanceDest", "isFraud", "isFlaggedFraud"
]

EXPECTED_TYPES = {"CASH_IN", "CASH_OUT", "DEBIT", "PAYMENT", "TRANSFER"}


class TestDatasetFiles(unittest.TestCase):
    """Vérification de la présence des fichiers bruts et du checksum."""

    def test_csv_exists(self):
        self.assertTrue(CSV_FILE.exists(), f"Fichier CSV introuvable: {CSV_FILE}")
        self.assertGreater(CSV_FILE.stat().st_size, 400 * 1024 * 1024, "Fichier trop petit (<400MB)")

    def test_checksum_file_exists(self):
        self.assertTrue(CHECKSUM_FILE.exists(), f"Fichier checksums.sha256 introuvable")

    def test_checksum_integrity(self):
        saved_checksum = None
        with open(CHECKSUM_FILE, "r", encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("  ", 1)
                if len(parts) == 2 and parts[1] == CSV_FILE.name:
                    saved_checksum = parts[0]
                    break
        self.assertIsNotNone(saved_checksum, "Aucun hash trouvé pour le CSV dans checksums.sha256")
        self.assertEqual(len(saved_checksum), 64, "SHA-256 doit faire 64 caractères hexadécimaux")


class TestDocumentationDeliverables(unittest.TestCase):
    """Vérification des livrables documentaires de la phase P0."""

    def test_data_dictionary_exists(self):
        self.assertTrue(DATA_DICT_FILE.exists(), "docs/data_dictionary.md manquant")
        content = DATA_DICT_FILE.read_text(encoding="utf-8")
        for col in EXPECTED_COLUMNS:
            self.assertIn(f"`{col}`", content, f"Colonne {col} absente du dictionnaire")

    def test_dataset_card_exists(self):
        self.assertTrue(DATASET_CARD_FILE.exists(), "docs/dataset_card.md manquant")
        content = DATASET_CARD_FILE.read_text(encoding="utf-8")
        self.assertIn("CC BY-SA 4.0", content)
        self.assertIn("Kaggle", content)

    def test_quality_reports_exist(self):
        self.assertTrue(MD_REPORT_FILE.exists(), "docs/quality_report.md manquant")
        self.assertTrue(JSON_REPORT_FILE.exists(), "docs/quality_report.json manquant")


class TestQualityReportMetrics(unittest.TestCase):
    """Validation des métriques issues du profilage complet (JSON)."""

    @classmethod
    def setUpClass(cls):
        if not JSON_REPORT_FILE.exists():
            raise unittest.SkipTest("quality_report.json pas encore généré")
        with open(JSON_REPORT_FILE, "r", encoding="utf-8") as f:
            cls.report = json.load(f)

    def test_row_count(self):
        self.assertEqual(self.report["row_count"], 6_362_620, "Le nombre de lignes doit être exactement 6,362,620")

    def test_column_count_and_names(self):
        self.assertEqual(len(self.report["schema"]["actual_columns"]), 11)
        self.assertEqual(self.report["schema"]["actual_columns"], EXPECTED_COLUMNS)
        self.assertTrue(self.report["schema"]["names_match"])

    def test_null_completeness(self):
        self.assertEqual(self.report["nulls"]["total_null_cells"], 0, "Le dataset contient des valeurs nulles")
        for col in EXPECTED_COLUMNS:
            self.assertEqual(self.report["nulls"]["null_counts"][col], 0, f"Nulls trouvés dans {col}")

    def test_step_domain(self):
        step_stats = self.report["distributions"]["step"]
        self.assertEqual(step_stats["min"], 1, "step min doit être 1")
        self.assertIn(step_stats["max"], (743, 744), "step max doit être 743 ou 744")
        self.assertTrue(step_stats["in_range_1_744"])

    def test_transaction_types(self):
        actual_types = set(self.report["distributions"]["type"]["value_counts"].keys())
        self.assertEqual(actual_types, EXPECTED_TYPES, "Les 5 types de transactions doivent correspondre exactement")

    def test_amount_non_negative(self):
        self.assertEqual(self.report["distributions"]["amount"]["negative_count"], 0, "Montants négatifs trouvés")
        self.assertGreaterEqual(self.report["distributions"]["amount"]["min"], 0.0)

    def test_fraud_domains(self):
        fraud = self.report["distributions"]["isFraud"]
        flagged = self.report["distributions"]["isFlaggedFraud"]
        self.assertTrue(fraud["domain_valid"], "isFraud contient des valeurs hors {0, 1}")
        self.assertTrue(flagged["domain_valid"], "isFlaggedFraud contient des valeurs hors {0, 1}")

    def test_fraud_target_types(self):
        fraud_by_type = set(self.report["distributions"]["fraud_by_type"].keys())
        self.assertTrue(fraud_by_type.issubset({"TRANSFER", "CASH_OUT"}), 
                        f"Fraude observée sur types inattendus: {fraud_by_type}")

    def test_merchant_balance_invariant(self):
        bi = self.report["balance_integrity"]
        self.assertTrue(bi["merchant_dest_all_zero_oldbal"], "oldbalanceDest des marchands doit être 0")
        self.assertTrue(bi["merchant_dest_all_zero_newbal"], "newbalanceDest des marchands doit être 0")


class TestDirectCSVStreaming(unittest.TestCase):
    """Contrôle direct non-régressif sur le CSV brut (header et 10 000 premières lignes)."""

    def test_header_and_first_rows(self):
        with open(CSV_FILE, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            header = next(reader)
            self.assertEqual(header, EXPECTED_COLUMNS)

            for i, row in enumerate(reader):
                if i >= 10_000:
                    break
                self.assertEqual(len(row), 11, f"Ligne {i+1} mal formée")
                step = int(row[0])
                self.assertTrue(1 <= step <= 744)
                self.assertIn(row[1], EXPECTED_TYPES)
                self.assertGreaterEqual(float(row[2]), 0.0)
                self.assertTrue(row[3].startswith("C"))
                self.assertTrue(row[6].startswith("C") or row[6].startswith("M"))
                self.assertIn(row[9], ("0", "1"))
                self.assertIn(row[10], ("0", "1"))


if __name__ == "__main__":
    unittest.main()
