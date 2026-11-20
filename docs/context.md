# FinLake — Contexte du Projet & Décisions d'Architecture

**Version** : 1.0  
**Date** : 2026-11-20  
**Auteurs** : Équipe Architecture Data & Plateforme FinLake  

---

## 1. Contexte Général et Objectifs du Projet

### 1.1 Contexte Métier
Dans le secteur financier et des technologies de paiement (fintech, mobile-money, néobanques), les systèmes transactionnels traitent quotidiennement des dizaines de millions d'opérations critiques. Ces opérations sont réparties sur des environnements hautement hétérogènes :
* Des **bases opérationnelles (OLTP)** qui garantissent les propriétés ACID des paiements en temps réel.
* Des **systèmes NoSQL et temps réel** assurant la gestion des sessions utilisateurs, des paniers d'achat, du scoring de risque immédiat et des notifications.
* Un **Data Lakehouse analytique (OLAP)** conçu pour consolider l'ensemble des données, exécuter des requêtes analytiques complexes (reporting réglementaire, audit anti-fraude, calculs de volumétrie financière) sans jamais dégrader les performances des bases de production.

### 1.2 Problématique Centrale
Comment concevoir une plateforme d'ingestion et de stockage capable de :
1. **S'interfacer avec n'importe quelle typologie de base de données** (SQL, Document, Clé-Valeur, Séries Temporelles, Colonnes larges, Moteurs de recherche, etc.).
2. **Découpler l'ingestion du stockage** pour absorber les pics de charge sans perte de données.
3. **Consolider les données dans un stockage objet économique et performant** (format colonnaire Apache Parquet, métadonnées ACID Apache Iceberg / Hive Metastore).
4. **Offrir un point d'accès SQL distribué unique** (Trino) pour fédérer l'exploration de toutes les sources.
5. **Démontrer cette architecture localement** dans un environnement conteneurisé Docker Compose reproductible, tout en respectant des contraintes strictes d'empreinte mémoire et de reproductibilité.

---

## 2. Taxonomie Complète des Bases de Données Supportées

Pour répondre à l'exigence d'interopérabilité universelle, FinLake catégorise les sources de données selon la taxonomie moderne des systèmes de gestion de bases de données :

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          TAXONOMIE DES BASES DE DONNÉES FINLAKE                        │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│     A. BASES OPÉRATIONNELLES & OLTP       │      B. BASES ANALYTIQUES & OLAP DÉDIÉES   │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ 1. Relationnelles SQL (RDBMS)             │ 6. Séries Temporelles (Time Series)        │
│ 2. Documents (Document Store)             │ 7. Vectorielles (Vector Databases)         │
│ 3. Clé-Valeur (Key-Value Store)           │ 8. Moteurs de Recherche (Search Engines)   │
│ 4. Colonnes Larges (Wide-Column Store)    │ 9. Entrepôts & Lacs Columnaires (OLAP/Lake)│
│ 5. Graphes (Graph Databases)              │                                            │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

### A. Systèmes Opérationnels et Transactionnels (OLTP)

| Catégorie | Exemples de Moteurs | Modèle de Données & Cas d'Usage Fintech | Mode d'Ingestion FinLake |
| :--- | :--- | :--- | :--- |
| **1. Relationnel SQL** | Microsoft SQL Server, PostgreSQL, MySQL, Oracle | Schémas stricts avec clés primaires/étrangères, transactions ACID. Enregistrement des règlements, grands livres comptables, facturation. | **JDBC Direct** (Keyset pagination $O(1)$) ou **Kafka Source CDC** |
| **2. Document** | MongoDB, Couchbase, AWS DocumentDB | Documents JSON/BSON hiérarchiques et semi-structurés. Profils marchands dynamiques, métadonnées de transactions PaySim enrichies, logs d'audit d'API. | **Kafka Connect MongoDB Source** (flux d'événements JSON vers Kafka) |
| **3. Clé-Valeur** | Redis, AWS DynamoDB, Memcached | Accès ultra-rapide par clé en mémoire (latence sub-milliseconde). Sessions utilisateurs, jetons JWT révoqués, soldes temporaires, plafonds journaliers. | **Kafka Redis Source / Ingestion par scan** vers topic Kafka |
| **4. Colonnes Larges** | Apache Cassandra, ScyllaDB, HBase | Partitionnement horizontal massif par clé de partition et clé de tri. Historiques de transactions par utilisateur à très haute cadence d'écriture. | **Kafka Cassandra Source** |
| **5. Graphe** | Neo4j, Amazon Neptune | Nœuds et relations typées. Analyse des réseaux de fraude en anneau (circuits financiers suspects entre émetteurs et destinataires PaySim). | **Kafka Graph Source** / Export de graphe |

### B. Systèmes Analytiques et Spécialisés (OLAP)

| Catégorie | Exemples de Moteurs | Modèle de Données & Cas d'Usage Fintech | Rôle dans l'Architecture FinLake |
| :--- | :--- | :--- | :--- |
| **6. Séries Temporelles** | InfluxDB, TimescaleDB, QuestDB | Données horodatées avec métriques (taux d'échec d'extraction, latence réseau, débits TPS). | Métriques de supervision et télémétrie des pipelines d'ingestion. |
| **7. Vectorielle** | Milvus, Qdrant, Pinecone, Chroma | Vecteurs d'embeddings (haute dimension) pour similarité sémantique. Détection d'anomalies de comportement bancaire par proximité vectorielle. | Extension du Copilot IA pour recherche vectorielle sur le catalogue métier. |
| **8. Moteur de Recherche** | Elasticsearch, OpenSearch, Meilisearch | Index inversé plein texte. Recherche instantanée dans les descriptions de colonnes, tags de conformité et manifestes de jobs. | Découverte rapide dans le Data Catalog & Business Glossary. |
| **9. Data Warehouse & Lac Colonnaire** | Trino, Apache Iceberg, MinIO, ClickHouse, Snowflake | Stockage colonnaire compressé (Apache Parquet) avec partitionnement et élagage de colonnes/fichiers. | **Cœur de la plateforme FinLake** : consolidation unifiée de toutes les sources pour requêtage SQL distribué. |

---

## 3. Justification de l'Architecture Hybride : Kafka Connect & Sinks

### 3.1 Pourquoi intégrer Kafka et des Kafka Sinks ?
Lorsqu'une organisation manipule des bases de données de natures variées (SQL, MongoDB, Redis, etc.), deux architectures s'affrontent :

1. **L'approche point-à-point (Point-to-Point)** :
   * Chaque base source est extraite par un code spécifique qui tente d'écrire directement dans le Data Lake.
   * *Inconvénients* : Fort couplage, surcharge des bases sources en cas de reprise sur incident, complexité de maintenance $O(N \times M)$.
2. **L'approche bus d'événements avec Kafka & Kafka Sinks (Choix FinLake)** :
   * **Découplage absolu** : N'importe quelle base (SQL Server, MongoDB, Redis, etc.) publie ses enregistrements ou changements de données dans un **topic Kafka** dédié (`finlake.polyglot.<type>.<name>`).
   * **Kafka Sink universel vers MinIO S3** : Un composant de type *Kafka Sink* consomme les événements des topics, les rassemble en micro-batches, les convertit au format colonnaire **Apache Parquet** et les dépose directement dans les préfixes de stockage objet MinIO (`s3://finlake/curated/kafka_sink/`).
   * **Uniformisation analytique** : Quel que soit le format d'origine (ligne SQL, document JSON MongoDB, clé Redis), les données atterrissent dans MinIO sous forme de fichiers Parquet standardisés, catalogués par Hive/Iceberg et immédiatement interrogeables via Trino.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         FLUX DE DONNÉES POLYGLOTTE FINLAKE                             │
│                                                                                        │
│  [SQL Server] ────┐                                                                    │
│  [PostgreSQL] ────┼───► [Kafka Source Connectors] ───► [Topic Kafka]                  │
│  [MongoDB]    ────┤                                          │                         │
│  [Redis]      ────┘                                          ▼                         │
│                                                   [Kafka MinIO S3 Sink]                │
│                                                              │                         │
│                                                     (Format Parquet)                   │
│                                                              ▼                         │
│                                                   [MinIO S3 Data Lake]                 │
│                                                              │                         │
│                                                (Enregistrement Catalogue)              │
│                                                              ▼                         │
│                                                   [Trino Distributed SQL]              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Arbitrage sur le mode de déploiement de Kafka : KRaft (sans Zookeeper)
Dans un contexte de développement local conteneurisé, exécuter un cluster Apache Kafka traditionnel nécessite un service externe Apache ZooKeeper.
* **Problème** : Deux JVM distinctes (ZooKeeper + Kafka Broker), nécessitant plus de 2 à 3 Go de RAM sur Docker Desktop et augmentant le risque d'échec de démarrage.
* **Choix FinLake** : Utilisation d'**Apache Kafka en mode KRaft (Kafka Raft Metadata)**. Le broker gère son propre quorum de métadonnées sans aucun conteneur ZooKeeper.
* **Gestion des ressources** :
  * Variables JVM : `KAFKA_JVM_PERFORMANCE_OPTS: "-Xms256m -Xmx512m"`
  * Le service s'exécute avec une empreinte mémoire maîtrisée (< 512 Mo de RAM), rendant la plateforme fluide sur n'importe quel ordinateur portable de développement.

---

## 4. Justification des Autres Choix Technologiques du Socle

| Composant | Technologie Retenue | Justification & Valeur Ajoutée |
| :--- | :--- | :--- |
| **Plan de Contrôle** | **Java 21 LTS + Spring Boot 3.3.5** | Type-safety absolu, Virtual Threads (Project Loom) pour gérer des milliers de requêtes I/O simultanées, intégration native avec l'écosystème Apache (Parquet, Hadoop S3A, Kafka Client). |
| **Stockage Objet** | **MinIO (API S3 compatible)** | Empreinte légère, 100% compatible AWS S3, permet de tester en local une topologie cloud-ready sans dépendance à un fournisseur cloud payant. |
| **Format Colonnaire** | **Apache Parquet (ZSTD / Snappy)** | Réduction d'espace de plus de 68% par rapport au CSV d'origine PaySim, encodage dictionnaire, statistiques intégrées (Min/Max) pour l'élagage des requêtes. |
| **Catalogue Métadonnées** | **Hive Metastore 4.0.0 & Apache Iceberg** | Permet à Trino de découvrir les schémas et partitions S3. Support des garanties ACID, du voyage dans le temps (*time-travel*) et des rollbacks via Iceberg. |
| **Moteur SQL** | **Trino 452 (Distributed SQL)** | Capacité de requêtage fédéré : une seule requête SQL ANSI peut joindre une table Parquet externe stockée dans MinIO et un flux temps réel provenant d'un topic Kafka via le `trino-kafka-connector`. |
| **Interface Utilisateur** | **Next.js 15 (React 19, TypeScript)** | Interface moderne basée sur les composants serveur (RSC), haut contraste, conforme au Wireframe de la plateforme (`#f8f9fa`, cartes blanches, accessibilité maximale). |

---

## 5. Matrice des Décisions et Compromis (Trade-offs)

| Décision | Option Retenue | Alternative Écartée | Justification |
| :--- | :--- | :--- | :--- |
| **Orchestration** | Docker Compose | Kubernetes (k8s) | Docker Compose garantit un démarrage en 1 commande (`docker compose up -d`) accessible à tout évaluateur, sans cluster Minikube/Kind lourd. |
| **Ingestion Batch** | Keyset Pagination $O(1)$ | Pagination `OFFSET / LIMIT` | `OFFSET` dégrade les performances de manière quadratique sur 6,36 millions de lignes. Le Keyset utilise un index strict sur `id` ou `step`. |
| **Coordination Kafka** | Mode KRaft intégré | Apache ZooKeeper | Suppression d'un composant obsolète, démarrage 3x plus rapide et économie de 1 Go de mémoire vive. |
| **Échange de Données** | Kafka Sinks vers Parquet S3 | Écriture directe fichier par fichier | Kafka Sink isole la source des indisponibilités réseau temporaires de MinIO grâce au tamponnage dans le topic. |

---

## 6. Synthèse

Le document de contexte établit formellement que FinLake n'est pas un simple script d'extraction SQL vers CSV, mais une **plateforme de données polyglotte d'entreprise** :
* Elle modélise et respecte l'ensemble des 8 familles de bases de données (SQL, NoSQL, Séries temporelles, Graphes, Vectorielles, etc.).
* Elle exploite **Kafka et les Kafka Sinks** pour assurer un découplage total entre la production des événements et la persistance analytique colonnaire dans MinIO.
* Elle garantit une reproductibilité intégrale sur machine locale grâce à Docker Compose et une configuration rigoureuse des ressources mémoire.
