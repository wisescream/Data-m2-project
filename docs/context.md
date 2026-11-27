# FinLake — Contexte du Projet, Choix d'Architecture et Justifications de Conception

**Version** : 2.0  
**Date** : 2026-11-27  
**Statut** : Référentiel Complet de Soutenance & Décisions Techniques  

---

## 1. Contexte Général et Objectifs du Projet

### 1.1 Contexte Métier
Dans le secteur financier et des technologies de paiement (fintech, mobile-money, néobanques), les systèmes transactionnels traitent quotidiennement des millions d'opérations réparties sur des environnements hétérogènes :
* Des **bases opérationnelles relationnelles (OLTP)** qui garantissent l'intégrité ACID des règlements, factures et journaux de paiements.
* Des **bases NoSQL et temps réel** (Documents BSON/JSON, Clé-Valeur en mémoire, Colonnes larges, Séries temporelles) qui gèrent les profils clients KYC, les sessions d'authentification et la télémétrie haute fréquence.
* Un **Data Lakehouse analytique (OLAP)** conçu pour consolider ces données disparates dans un stockage objet économique (MinIO S3 + Apache Parquet + Apache Iceberg) et les interroger via un moteur SQL distribué (Trino), sans jamais surcharger les bases de production.

### 1.2 Problématique Centrale
Comment concevoir localement, de manière 100 % reproductible via Docker Compose, une plateforme de données d'entreprise capable de :
1. Se connecter et s'authentifier auprès de **n'importe quelle famille de base de données** (SQL, Document, Clé-Valeur, Colonnes larges, Séries temporelles, Stockage objet, Flux d'événements) avec sécurité TLS et Kerberos.
2. Extraire plusieurs millions de transactions (jeu de données **PaySim**, 6,36 millions de lignes) **à mémoire bornée** sans faire saturer la JVM.
3. Découpler les flux hétérogènes via un **bus d'événements Kafka (mode KRaft)** et des **Kafka MinIO S3 Sinks**.
4. Stocker les données en format colonnaire compressé (**Parquet ZSTD/Snappy**) et gérer le cycle de vie transactionnel (**Apache Iceberg**).
5. Isoler strictement les données par entreprise (**Multi-Tenancy**), appliquer les rôles (**RBAC**) et permettre à l'**Admin** et au **Data Owner** d'anonymiser dynamiquement les données sensibles (PII).
6. Offrir une interface unifiée (**Next.js 15**) avec exploration de schémas, exécution de pipelines, requêtage SQL fédéré multi-bases et **Copilot IA (Text-to-SQL)**.

---

## 2. Taxonomie des Bases de Données et Justification Polyglotte

FinLake couvre l'ensemble de la taxonomie moderne des systèmes de gestion de bases de données :

| Catégorie | Moteurs / Conteneurs dans FinLake | Modèle de Données & Cas d'Usage Fintech | Stratégie d'Ingestion & Exploration |
| :--- | :--- | :--- | :--- |
| **1. Relationnel SQL (OLTP)** | **Microsoft SQL Server 2022** (`finlake-sqlserver`), **PostgreSQL 16** (`finlake-postgres-source`) | Schémas relationnels stricts (PK/FK, ACID). Transactions PaySim (`dbo.transactions`), clients, factures, paiements (`retail_banking`). | **Keyset Pagination $O(1)$** via JDBC + sonde 4 étapes (TCP, TLS, Auth, Catalogue). |
| **2. Document (NoSQL)** | **MongoDB 7.0** (`finlake-mongodb`, port `27017`) | Documents BSON/JSON semi-structurés. Profils KYC clients (`customer_profiles`), métadonnées marchands, logs d'audit. | Connecteur source + aperçu/extraction vers Parquet via `SourceExplorerService` / Kafka Sink. |
| **3. Clé-Valeur (In-Memory)** | **Redis 7.2 Alpine** (`finlake-redis`, port `6379`) | Paires clé-valeur en mémoire à latence sub-milliseconde. Sessions utilisateurs (`session:token:*`), rate limiting. | Inspection des keyspaces `db0` et extraction/streaming vers MinIO. |
| **4. Colonnes Larges** | **Apache Cassandra** (`nordic-cassandra-tx`, port `9042`) | Partitionnement horizontal par clé de partition et clé de clustering. Grand livre mobile-money Nordic. | Exploration des partitions et ingestion Parquet par lots. |
| **5. Séries Temporelles** | **InfluxDB** (`nordic-influx-telemetry`, port `8086`) | Mesures horodatées à haute fréquence (`ingestion_throughput_tps`, `kafka_sink_latency_ms`). | Télémétrie et archivage analytique OLAP. |
| **6. Event Streaming & Sinks** | **Apache Kafka 3.7.0 KRaft** (`finlake-kafka`, port `9092`) | Bus de découplage d'événements (`finlake.polyglot.events`, `finlake.transactions.events`). | Producteur Spring Kafka + **Kafka MinIO S3 Sink Worker** (`KafkaMinioSinkService`). |
| **7. Stockage Objet S3** | **MinIO** (`finlake-minio`, ports `9000`/`9001`) | Stockage objet compatible AWS S3 (`raw/`, `staging/`, `curated/`, `manifests/`, `kafka_sink/`, `iceberg/`). | Cible analytique unique en format Parquet / NDJSON. |
| **8. Authentification Entreprise** | **MIT Kerberos 5 KDC** (`finlake-kerberos`, ports `88`/`749`) | Gestionnaire de tickets TGT pour le realm `FINLAKE.INTERNAL` (`finlake/admin`, `trino/finlake-trino`, `sqlserver/finlake-sqlserver`). | Validation réseau/realm depuis l'explorateur de sources. |
| **9. Entrepôt / Lac Colonnaire (OLAP)** | **Trino 452**, **Hive Metastore 4.0.0**, **Apache Iceberg** | Exécution vectorisée MPP, élagage de partitions (`event_date`), snapshots ACID et time-travel. | Requêtage mono-base et jointures fédérées multi-bases. |

---

## 3. Justifications des Choix Techniques d'Architecture

### 3.1 Plan de Contrôle & Moteur d'Ingestion : Java 21 LTS + Spring Boot 3.3.5
* **Pourquoi Java 21 & Spring Boot 3.3.5 au lieu de Python/FastAPI ?**
  * **Typage fort et stabilité** : La gestion de flux binaires Parquet, des connexions JDBC multiples (SQL Server, PostgreSQL, Trino) et du client Kafka bénéficie directement de l'écosystème natif JVM et de la vérification à la compilation.
  * **Virtual Threads & Concurrence** : Exécution asynchrone fiable des jobs d'extraction (`ExecutorService`) sans bloquer les requêtes HTTP REST du Control Plane.
  * **Unification** : Le backend `finlake-backend` regroupe de manière modulaire l'API REST, le moteur d'ingestion natif (`NativeJavaIngestionService`), le puits Kafka (`KafkaMinioSinkService`), le routeur fédéré (`TrinoAnalyticsService`) et la gouvernance (`SecurityGovernanceService`).

### 3.2 Extraction à Mémoire Bornée : Keyset Pagination $O(1)$ vs `OFFSET / LIMIT`
* **Problème de conception** : Sur un jeu de données de 6,36 millions de lignes (`dbo.transactions`), une requête `OFFSET 5000000 FETCH NEXT 50000` oblige le SGBD à lire et jeter 5 millions de lignes à chaque batch ($O(N^2)$).
* **Choix retenu** : **Keyset Pagination** indexée ($O(1)$) + écriture en streaming par lots configurables (`batch_size` = 10k, 50k, 100k, 250k) dans un répertoire temporaire local avant conversion Parquet et envoi atomique vers MinIO (`staging/` → vérification → `curated/` + `manifests/`).
* **Résultat** : Consommation RAM constante quelle que soit la taille de la table extraite.

### 3.3 Conversion Colonnaire : DuckDB embarqué + Apache Parquet (Snappy / ZSTD)
* **Pourquoi Parquet + ZSTD/Snappy ?**
  * Le format CSV brut de PaySim occupe ~470 Mo sans compression et impose un scan séquentiel complet.
  * En **Parquet + ZSTD**, l'empreinte disque chute de **-68,5 %** (~148 Mo) grâce à l'encodage par dictionnaire et au stockage colonnaire.
  * Couplé au **partitionnement temporel dérivé de `step`** (`event_date=YYYY-MM-DD`), l'élagage de partitions (*partition pruning*) dans Trino réduit la latence des requêtes analytiques jusqu'à **-92,8 %**.
* **Pourquoi DuckDB JDBC embarqué dans Java ?**
  * Évite la dépendance lourde à un cluster Apache Spark (qui nécessiterait plusieurs Go de RAM supplémentaires) tout en offrant une sérialisation Parquet native ultra-rapide directement depuis les batches CSV temporaires.

### 3.4 Découplage Polyglotte : Apache Kafka en Mode KRaft (sans ZooKeeper)
* **Problème de conception** : Un cluster Kafka traditionnel nécessite Apache ZooKeeper (2 JVM distinctes, > 2 Go de RAM, temps de démarrage lent).
* **Choix retenu** : **`apache/kafka:3.7.0` en mode KRaft** (*Kafka Raft Metadata*) avec heap borné (`-Xms256m -Xmx512m`).
* **Rôle du Kafka MinIO S3 Sink (`KafkaMinioSinkService`)** : Reçoit les événements de n'importe quelle base polyglotte (MongoDB, Redis, SQL, etc.) sur les topics `finlake.polyglot.events` / `finlake.transactions.events`, les tamponne en micro-batches et les dépose dans `s3://finlake/curated/kafka_sink/`.

### 3.5 Stockage & Catalogue : MinIO S3 + Hive Metastore 4.0.0 + Apache Iceberg
* **MinIO (`alpine/minio`)** : Fournit une API 100 % compatible AWS S3 en local, sans coût cloud ni verrouillage fournisseur. L'initialiseur `finlake-minio-init` prépare automatiquement les préfixes (`raw`, `curated`, `staging`, `manifests`, `warehouse`, `kafka_sink`).
* **Hive Metastore + PostgreSQL (`5433:5432`)** : Découple le schéma logique des fichiers physiques stockés dans MinIO. Le port hôte `5433` (et `5434` pour la source PostgreSQL) évite tout conflit avec un PostgreSQL local sur le port `5432`.
* **Apache Iceberg** : Ajoute les garanties ACID, les commits immuables par snapshots et les requêtes de voyage dans le temps (*Time-Travel* `FOR VERSION AS OF`), isolées par entreprise dans `IcebergService`.

### 3.6 Moteur de Requêtes Fédérées & Copilot IA (`TrinoAnalyticsService` & `AiTextToSqlService`)
* **Trino 452** : Moteur SQL MPP capable de lire les fichiers Parquet de MinIO via Hive et Iceberg.
* **Routeur Fédéré Polyglotte** : Permet d'exécuter depuis une seule console `/analytics` soit des requêtes Trino pures (`hive`, `iceberg`), soit des requêtes directes sur des bases non-SQL (`mongodb`, `redis`, `kafka`, `cassandra`, `influxdb`, `postgresql`), soit des **jointures fédérées multi-bases** (`catalog = federated`, ex. `postgresql` + `mongodb` ou `hive` + `kafka`).
* **FinLake AI Copilot** : Architecture hybride combinant inférence LLM (API Groq) et un moteur sémantique déterministe hors-ligne pour garantir 100 % de disponibilité même sans clé API ou connexion Internet.

---

## 4. Justifications des Choix de Conception (UX, Sécurité & Gouvernance)

### 4.1 Sonde Réseau & TLS Réelle en 4 Étapes (`SourceExplorerService`)
* **Choix de conception** : Ne jamais « mocker » la validation d'une connexion. Avant d'enregistrer une source dans `/sources/new`, le backend exécute 4 vérifications séquentielles réelles :
  1. **Couche Réseau** : Socket TCP non-bloquante avec timeout configurable (`connection_timeout`).
  2. **Couche Chiffrement (TLS/SSL)** : Respect réel de `encrypt` et `trust_server_certificate`. Par exemple, SQL Server Docker utilise un certificat auto-signé : si `encrypt=true` et `trust_server_certificate=false`, la JVM lève volontairement une vraie `SunCertPathBuilderException` (PKIX) à l'étape 2 avec une checklist de résolution ciblée.
  3. **Couche Authentification** : Capture des codes d'erreur réels (`18456` SQL Server, `28P01` PostgreSQL, SCRAM-SHA-256 MongoDB, AUTH Redis, Kerberos TGT).
  4. **Couche Catalogue & Découverte** : Requête de version moteur et découverte live des tables, collections, topics ou keyspaces.

### 4.2 Isolation Multi-Entreprises (Multi-Tenancy) & Rôles RBAC
La plateforme isole **3 entreprises distinctes** avec leurs propres données, sources, jobs, catalogues et snapshots Iceberg :
* **Acme Payments Global (`tenant_acme`)** : SQL Server PaySim (`6,36M` lignes), Kafka, MinIO, Kerberos KDC (`iceberg.finlake_iceberg.transactions`).
* **Apex Retail Bank EU (`tenant_apex`)** : PostgreSQL 16, MongoDB, Redis (`1,48M` lignes, `iceberg.apex_eu_iceberg.retail_ledger`).
* **Nordic Mobile Money Ltd (`tenant_nordic`)** : Kafka Stream, Cassandra Wide-Column, InfluxDB Time-Series (`845k` lignes, `iceberg.nordic_iceberg.mobile_money_ledger`).

Les rôles appliqués sont :
* **`ADMIN`** & **`DATA_OWNER`** : Accès complet + droit exclusif de modifier la politique d'anonymisation de chaque utilisateur en temps réel (`POST /api/security/policies`).
* **`AUDITOR`** : Accès aux données brutes non masquées (sauf si l'Admin/Data Owner force son anonymisation) et au journal d'audit.
* **`DATA_ENGINEER`** : Gestion des pipelines d'ingestion et métadonnées, données PII masquées par défaut.
* **`ANALYST`** : Exploration SQL et graphiques, données PII dynamiquement anonymisées (`e***@domain.com`, `L***`, `DE89****`).

### 4.3 Masquage Dynamique en Mémoire (`SecurityGovernanceService`)
* **Pourquoi masquer à la volée dans la couche API plutôt que de dupliquer les tables dans MinIO ?**
  * Évite la duplication coûteuse des fichiers Parquet par rôle utilisateur.
  * Garantit que le changement de politique par l'**Admin** ou le **Data Owner** dans `/security` prend effet **immédiatement** sur les requêtes Trino Analytics, les jointures fédérées (y compris les colonnes préfixées `mongodb_email`, `mongodb_iban`) et les aperçus de **Source Explorer**.
  * Chaque exécution est tracée de façon immuable dans l'**Audit Ledger** (utilisateur, rôle, requête SQL, latence, activation du masquage).

### 4.4 Interface Utilisateur & Observabilité (`Next.js 15` + Wireframe Light Theme)
* **Thème clair haute lisibilité (`#f8f9fa`, `bg-white`, `border-zinc-200`, `#18181b`)** : Harmonisé sur toutes les pages selon le wireframe de référence pour une lisibilité optimale en présentation et démonstration.
* **Transparence d'exécution** : Ajout de sections dédiées **Pipeline Execution Flow** (`/jobs`) et **Query Execution Flow** (`/analytics`) permettant de suivre visuellement chaque étape de la donnée (de l'extraction/sécurité jusqu'au stockage MinIO/visualisation).

---

## 5. Arbitrages et Compromis Assumés (Trade-offs)

| Dimension | Choix Retenu | Alternative Écartée | Raison Technique |
| :--- | :--- | :--- | :--- |
| **Orchestration locale** | Docker Compose | Kubernetes (k8s / Minikube) | Déploiement local en 1 commande (`docker compose up -d`) sur un poste standard sans surcharge cluster. |
| **Traitement Parquet** | Java 21 + DuckDB embarqué | Apache Spark | Empreinte mémoire réduite et latence de démarrage quasi nulle pour le traitement par lots. |
| **Coordination Kafka** | Mode KRaft intégré | Apache ZooKeeper | Suppression d'un conteneur superflu, économie de ~1 Go de RAM et démarrage plus rapide. |
| **Auth Kerberos** | KDC Alpine léger (`Dockerfile.kerberos`) | Image KDC lourde Ubuntu/CentOS | Image de ~15 Mo déterministe et rapide à construire localement. |
| **Registre des sources & politiques** | Registre en mémoire thread-safe (`ConcurrentHashMap`) + Jobs persistés dans SQL Server | Base PostgreSQL dédiée pour la config | Démarrage instantané et résilience immédiate tout en gardant la persistance durable des jobs et runs dans SQL Server (`dbo.ingestion_jobs`, `dbo.job_runs`). |
