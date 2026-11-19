"""Setup and demonstration script for Apache Iceberg table format in FinLake."""

from __future__ import annotations

import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.finlake.trino.client import TrinoClient


def setup_iceberg():
    print("=" * 70)
    print("FINLAKE — PHASE P7 : CONFIGURATION & DEMO APACHE ICEBERG")
    print("=" * 70)

    trino = TrinoClient(catalog="iceberg", schema="default")

    # 1. Test connectivity
    diag = trino.test_connection()
    print(f"\n[1/6] Diagnostic Trino: {diag.get('status')} (v{diag.get('node_version')})")

    # 2. Create Iceberg schema
    print("\n[2/6] Création du schéma Iceberg 'iceberg.finlake_iceberg'...")
    trino.execute("CREATE SCHEMA IF NOT EXISTS iceberg.finlake_iceberg WITH (location = 's3a://finlake/iceberg/')")
    schemas = trino.execute_query("SHOW SCHEMAS FROM iceberg")
    print(f"      Schémas disponibles sous 'iceberg' : {[s.get('Schema') for s in schemas]}")

    # 3. Create Partitioned Iceberg table
    print("\n[3/6] Déclaration de la table partitionnée 'iceberg.finlake_iceberg.transactions'...")
    create_table_sql = """
        CREATE TABLE IF NOT EXISTS iceberg.finlake_iceberg.transactions (
            ingest_row_id BIGINT,
            step INTEGER,
            type VARCHAR,
            amount DOUBLE,
            name_orig VARCHAR,
            oldbalance_org DOUBLE,
            newbalance_orig DOUBLE,
            name_dest VARCHAR,
            oldbalance_dest DOUBLE,
            newbalance_dest DOUBLE,
            is_fraud INTEGER,
            is_flagged_fraud INTEGER,
            event_time_simulated TIMESTAMP(3),
            event_date VARCHAR
        )
        WITH (
            partitioning = ARRAY['event_date'],
            format = 'PARQUET'
        )
    """
    trino.execute(create_table_sql)
    tables = trino.execute_query("SHOW TABLES FROM iceberg.finlake_iceberg")
    print(f"      Tables dans 'iceberg.finlake_iceberg' : {[t.get('Table') for t in tables]}")

    # 4. Insert data from Hive Curated Table
    print("\n[4/6] Chargement de données depuis Hive vers Iceberg (5,000 lignes)...")
    # Check if empty first
    count_res = trino.execute_query("SELECT COUNT(*) AS cnt FROM iceberg.finlake_iceberg.transactions")
    current_count = count_res[0]["cnt"] if count_res else 0
    if current_count == 0:
        insert_sql = """
            INSERT INTO iceberg.finlake_iceberg.transactions
            SELECT
                ingest_row_id, step, type, amount, name_orig, oldbalance_org,
                newbalance_orig, name_dest, oldbalance_dest, newbalance_dest,
                is_fraud, is_flagged_fraud, event_time_simulated, event_date
            FROM hive.finlake_curated.transactions
            WHERE event_date = '2023-01-01'
            LIMIT 5000
        """
        trino.execute(insert_sql)
        print("      [OK] Données initiales insérées dans la table Iceberg.")
    else:
        print(f"      Table déjà alimentée avec {current_count} lignes.")

    # 5. Snapshots and History Inspection
    print("\n[5/6] Inspection des snapshots immuables Iceberg (Table $snapshots)...")
    snapshots = trino.execute_query("""
        SELECT snapshot_id, parent_id, operation, committed_at
        FROM iceberg.finlake_iceberg."transactions$snapshots"
        ORDER BY committed_at ASC
    """)
    for s in snapshots:
        print(f"      Snapshot ID: {s.get('snapshot_id')} | Opération: {s.get('operation')} | Horodatage: {s.get('committed_at')}")

    # 6. ACID Mutation & Time-Travel Demo
    print("\n[6/6] Démonstration ACID & Time-Travel...")
    if snapshots:
        first_snapshot_id = snapshots[0]["snapshot_id"]

        # Run an update if we only have 1 snapshot
        if len(snapshots) < 2:
            print("      Exécution d'une mutation atomique UPDATE (marquage des fraudes importantes)...")
            update_sql = """
                UPDATE iceberg.finlake_iceberg.transactions
                SET is_flagged_fraud = 1
                WHERE is_fraud = 1 AND amount > 50000
            """
            trino.execute(update_sql)
            print("      [OK] Mutation UPDATE appliquée avec succès.")

        # Re-read snapshots
        snapshots_after = trino.execute_query("""
            SELECT snapshot_id, parent_id, operation, committed_at
            FROM iceberg.finlake_iceberg."transactions$snapshots"
            ORDER BY committed_at DESC
        """)
        print(f"      Nombre de snapshots disponibles : {len(snapshots_after)}")

        # Time Travel query
        print(f"\n      -> Requête Time-Travel sur le snapshot initial ({first_snapshot_id}) :")
        tt_query = f"SELECT COUNT(*) AS total_flagged FROM iceberg.finlake_iceberg.transactions FOR VERSION AS OF {first_snapshot_id} WHERE is_flagged_fraud = 1"
        tt_res = trino.execute_query(tt_query)
        flagged_before = tt_res[0]["total_flagged"] if tt_res else 0
        print(f"         is_flagged_fraud = 1 au snapshot v{first_snapshot_id} : {flagged_before}")

        current_res = trino.execute_query("SELECT COUNT(*) AS total_flagged FROM iceberg.finlake_iceberg.transactions WHERE is_flagged_fraud = 1")
        flagged_now = current_res[0]["total_flagged"] if current_res else 0
        print(f"         is_flagged_fraud = 1 sur la version courante (Head)      : {flagged_now}")

    print("\n" + "=" * 70)
    print("DEMONSTRATION APACHE ICEBERG VALIDEE AVEC SUCCES!")
    print("=" * 70)


if __name__ == "__main__":
    setup_iceberg()
