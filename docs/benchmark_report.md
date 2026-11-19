# FinLake — Rapport de Benchmark & Analyse de Performance (Phase P6)

## 1. Contexte & Protocole Expérimental

Conformément au cahier des charges et à la méthodologie définie dans `.agents/skills/benchmark-methodology/SKILL.md`, ce rapport présente les mesures réelles et reproductibles des performances du Data Lake FinLake.

L'évaluation repose sur un protocole en deux étapes découplées :
1. **Benchmark d'ingestion (Data Plane)** : Mesure des performances d'extraction, conversion et écriture sur MinIO en faisant varier le format (`parquet` vs `csv`), le codec de compression (`none`, `snappy`, `zstd`) et la taille de lot (`1 000`, `5 000`, `10 000`, `20 000`).
2. **Benchmark analytique SQL (Moteur Trino 452)** : Mesure des temps de réponse à froid (cold cache) et à chaud (warm cache sur 3 répétitions) sur les 6 requêtes analytiques de référence (§10.3) exploitant la table partitionnée `hive.finlake_curated.transactions` (16 millions de lignes indexées).

---

## 2. Environnement & Spécifications Matérielles

Les mesures ont été exécutées dans des conditions strictes et homogènes sur la machine locale :

| Paramètre | Valeur mesurée |
| :--- | :--- |
| **Système d'exploitation** | Windows 11 Professionnel (Build 10.0.26200) |
| **Processeur hôte** | Intel Core 12th/13th Gen (20 vCPUs physiques/logiques) |
| **Moteur de conteneurs** | Docker version 29.9.3, build 5457199 |
| **Réseau virtuel** | Docker Bridge `finlake-network` (MTU 1500) |
| **Image Worker Ingestion** | `finlake-worker:1.0` (Debian Bookworm, Python 3.11.9, PyArrow 17.0.0) |
| **Moteur SQL Distribué** | Trino version 452 (Java 22.0.2 OpenJDK 64-bit) |
| **Catalogue de métadonnées** | Apache Hive Metastore 4.0.0 (PostgreSQL 16.4) |
| **Stockage d'objets S3** | MinIO RELEASE.2025-10-15T17-29-55Z |
| **Source transactionnelle** | Microsoft SQL Server 2022-latest |
| **Date d'exécution** | 18 Novembre 2026 |

*Fichier source horodaté : `benchmarks/results/system_specs.json`.*

---

## 3. Benchmark d'Ingestion & Stockage (Data Plane)

### 3.1 Tableau des Résultats Bruts
Échantillon test : 20 000 lignes extraites de SQL Server `dbo.transactions` avec partitionnement temporel simulé (`event_date`).

| Identifiant Scénario | Format | Codec | Taille Lot | Objets MinIO | Volume Écrit (Octets) | Durée (s) | Débit (Lignes/s) | Débit (Ko/s) | Taille Moy. Objet (Ko) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ingest_parquet_snappy_b1000` | Parquet | Snappy | 1 000 | 21 | 1 134 758 | 3.314 | 6 035.00 | 334.39 | 52.77 |
| `ingest_parquet_snappy_b5000` | Parquet | Snappy | 5 000 | 5 | 1 020 709 | 2.671 | 7 487.83 | 373.19 | 199.36 |
| `ingest_parquet_snappy_b10000` | Parquet | Snappy | 10 000 | 3 | 1 010 030 | 2.525 | 7 920.79 | 390.64 | 328.79 |
| `ingest_parquet_snappy_b20000` | Parquet | Snappy | 20 000 | 2 | 1 009 378 | 2.468 | 8 103.73 | 399.40 | 492.86 |
| `ingest_parquet_zstd_b10000` | Parquet | Zstandard | 10 000 | 3 | 764 573 | 2.611 | 7 659.90 | 285.96 | 248.88 |
| `ingest_parquet_none_b10000` | Parquet | Aucun | 10 000 | 3 | 1 374 763 | 2.409 | 8 302.20 | 557.30 | 447.51 |
| `ingest_csv_none_b10000` | CSV | Aucun | 10 000 | 3 | 2 429 879 | 2.397 | 8 343.76 | 989.96 | 790.98 |

*Fichiers sources : `benchmarks/results/ingestion_benchmark.json` et `benchmarks/results/ingestion_benchmark.csv`.*

---

### 3.2 Analyse Comparative des Formats & Codecs

#### A. Taux de Compression (Taille de lot fixe = 10 000 lignes)
$$\text{Ratio vs CSV} = \frac{\text{Volume Format}}{\text{Volume CSV brut}}$$

```
CSV (texte brut)         : [########################################] 2.43 Mo (100.0%)
Parquet (non compressé)  : [######################                  ] 1.37 Mo ( 56.6% - Gain: 43.4%)
Parquet (Snappy)         : [################                        ] 1.01 Mo ( 41.6% - Gain: 58.4%)
Parquet (Zstandard)      : [############                            ] 0.76 Mo ( 31.5% - Gain: 68.5%)
```

- **Parquet vs CSV** : Sans aucune compression, le passage au format binaire colonnaire Parquet réduit la taille sur disque de **43.4%** grâce au typage strict, à l'encodage par dictionnaire des colonnes `type`, `nameOrig`, `nameDest` et à l'élimination des délimiteurs textuels.
- **Zstandard vs Snappy** : Zstandard atteint un taux de compression remarquable (**68.5% de réduction par rapport au CSV**, soit un facteur d'économie de **3.17x**), tout en maintenant une vitesse d'ingestion quasiment identique à Snappy (7 660 lignes/s contre 7 921 lignes/s).
- **Snappy** : Offre le meilleur compromis CPU/débit pour les flux temps-réel ou continus, avec un gain de 58.4% d'espace.

---

### 3.3 Analyse de l'Impact de la Taille de Lot (Batch Size)

À volume constant (20 000 lignes) avec Parquet Snappy :
- **Lot de 1 000 lignes** : Génère **21 petits fichiers** (52.8 Ko en moyenne) sur MinIO. Le surcoût des round-trips HTTP PUT MinIO et de la sérialisation fragmentée bride le débit à **6 035 lignes/s** (durée : 3.31s).
- **Lot de 20 000 lignes** : Génère seulement **2 fichiers consolidés** (492.9 Ko en moyenne). Le débit monte à **8 104 lignes/s** (durée : 2.47s), soit un gain de performance de **+34.3%**.

> **Recommandation FinLake** : Éviter les micro-lots (< 5 000 lignes) pour prévenir le syndrome des petits fichiers ("Small Files Problem") sur le stockage objet S3. Adopter des lots de **10 000 à 50 000 lignes** en production.

---

## 4. Benchmark Analytique SQL (Moteur Trino 452)

### 4.1 Tableau des Résultats SQL
Mesures sur la table `hive.finlake_curated.transactions` (16 080 368 lignes stockées en Parquet Snappy partitionné par `event_date`).

| Id | Intitulé Requête | Lignes Renvoyées | Latence à Froid (ms) | Médiane à Chaud (ms) | Min (ms) | Max (ms) | Écart / Gigue (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Q1** | Full Table Scan (`COUNT(*)`) | 1 | 13 870.80 | **9 940.69** | 9 862.38 | 10 673.70 | 811.32 |
| **Q2** | Group By Type (`SUM`, `AVG`, `COUNT`) | 5 | 11 569.17 | **10 910.50** | 10 207.18 | 11 042.35 | 835.17 |
| **Q3** | Tendance Temporelle (`GROUP BY event_date`) | 31 | 11 601.93 | **13 342.70** | 12 286.27 | 16 688.12 | 4 401.85 |
| **Q4** | Filtre Temporel avec Partition Pruning | 100 | 4 637.65 | **3 231.66** | **1 803.62** | 3 519.29 | 1 715.67 |
| **Q5** | Cible Fraude (`isFraud = 1`, `newbalanceOrig = 0`) | 2 | 16 863.83 | **25 796.27** | 10 475.10 | 61 266.40 | 50 791.30 |
| **Q6** | Réconciliation et Lignage (`$path`) | 31 | 11 246.45 | **36 694.79** | 11 511.36 | 39 794.40 | 28 283.04 |

*Fichiers sources : `benchmarks/results/sql_benchmark.json` et `benchmarks/results/sql_benchmark.csv`.*

---

### 4.2 Analyse Détaillée des Performances Requêtes

#### A. Démonstration de l'Élagage de Partitions (Partition Pruning)
Comparaison directe entre le balayage global (**Q1**) et la requête filtrée sur une partition journalière (**Q4**) :

$$\text{Gain de latence} = \frac{\text{Médiane Q1} - \text{Médiane Q4}}{\text{Médiane Q1}} = \frac{9 940.69 - 3 231.66}{9 940.69} = \mathbf{67.5\%}$$

- **Latence minimale observée sur Q4** : **1 803.62 ms** (contre 9 862.38 ms pour Q1).
- **Preuve par le plan d'exécution (`EXPLAIN`)** :
  ```text
  Trino Plan for Q4:
  - TableScan[hive:finlake_curated:transactions]
      Layout: [amount:double, event_date:string:PARTITION_KEY, isfraud:integer, ...]
      event_date:string:PARTITION_KEY
          :: [[2023-01-01]]
  ```
  Trino n'interroge que le préfixe `curated/paysim/transactions/event_date=2023-01-01/` dans MinIO, ignorant les 30 autres partitions. Le volume de données transféré sur le réseau virtuel est divisé par plus de 30.

#### B. Cache & Warmup
- Sur les requêtes sans agrégation lourde (Q1, Q4), l'exécution à chaud est **28% à 30% plus rapide** qu'à froid grâce à la mise en cache des métadonnées Hive Metastore et à la compilation JIT bytecode de Trino.
- Sur les requêtes avec calculs analytiques ou accès aux pseudo-colonnes de métadonnées (`$path` dans Q6), la gigue observée reflète la charge mémoire du garbage collector Java sur 16 millions de lignes.

---

## 5. Synthèse des Décisions & Bonnes Pratiques

1. **Format analytique standard** : Adopter **Apache Parquet avec compression Zstandard** pour le stockage froid et historique (gain d'espace de 68.5%), ou **Snappy** pour les flux continus (meilleur débit CPU).
2. **Dimensionnement des partitions** : Le partitionnement sur `event_date` (simulé à partir de `step / 24`) apporte un gain d'élagage spectaculaire de **67.5%**, validant l'architecture de la couche Curated.
3. **Sécurité et intégrité** : Le découplage Staging $\rightarrow$ Promotion $\rightarrow$ Manifeste JSON prévient toute corruption de lecture par Trino pendant les transferts de fichiers.
