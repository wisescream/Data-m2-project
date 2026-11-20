# FINLAKE — Cahier des charges fonctionnel et technique
**Version : 1.0 — 18 novembre 2026**

## 1. Présentation

### 1.1 Contexte
Atlas Financial Services est une entreprise fictive de services de paiement mobile. Ses équipes Data et Finance souhaitent centraliser des journaux de transactions provenant d'un système relationnel afin de les conserver dans un stockage objet économique et de les interroger en SQL sans solliciter continuellement la base opérationnelle.

Le projet FinLake consiste à construire localement une plateforme de type data lake, entièrement conteneurisée, avec ingestion par lots, stockage colonnaire, catalogue et moteur SQL distribué.

### 1.2 Problématique
Comment extraire de manière fiable plusieurs millions de transactions d'une source relationnelle, les convertir et les organiser dans un stockage objet, puis les rendre interrogeables en SQL tout en mesurant les compromis entre formats, compression, partitionnement et tailles de lots ?

### 1.3 Objectifs
- Connecter une source SQL Server et explorer ses schémas.
- Charger PaySim dans SQL Server comme source de démonstration.
- Extraire les tables par lots avec mémoire bornée.
- Écrire CSV et Parquet dans MinIO.
- Enregistrer les tables dans Hive Metastore.
- Interroger les données avec Trino.
- Exposer les opérations via une API REST.
- Comparer les stratégies de stockage et d'extraction avec une méthodologie reproductible.

## 2. Périmètre

### 2.1 Inclus
- Exécution locale avec Docker Compose.
- Dataset PaySim, version CSV publique d'environ 6,36 millions de lignes.
- SQL Server comme base relationnelle source.
- Control Plane Spring Boot 3.3.5 (Java 21) et moteur d'ingestion natif Java.
- MinIO, Hive Metastore et Trino.
- CSV et Parquet; compression none/Snappy/Zstandard selon compatibilité.
- Partitionnement temporel dérivé de `step`.
- Statuts, erreurs, métadonnées, reprise contrôlée.
- Benchmarks et rapport.

### 2.2 Hors périmètre initial
- Connexion à une vraie banque ou à des données personnelles.
- Déploiement cloud ou Kubernetes.
- Garantie de haute disponibilité ou de reprise multi-nœuds.
- Modèle ML de fraude en production.
- Tableau de bord frontend obligatoire.
- Garanties transactionnelles ACID sur les tables Hive/Parquet simples.

### 2.3 Hypothèses et limites
PaySim est un jeu de données synthétique de transactions de mobile money. Il ne contient pas de véritables noms, adresses ou profils clients. Les identifiants `nameOrig` et `nameDest` sont des identifiants pseudonymes de simulation. La devise n'est pas explicitement normalisée dans le projet : ne pas étiqueter les montants en MAD/EUR/USD sans source fiable.

`step` représente une heure de simulation parmi 744 étapes. Une date/heure analytique peut être dérivée avec une date de départ fictive configurable, mais doit rester étiquetée comme temps simulé.

Le jeu contient 11 colonnes : `step`, `type`, `amount`, `nameOrig`, `oldbalanceOrg`, `newbalanceOrig`, `nameDest`, `oldbalanceDest`, `newbalanceDest`, `isFraud`, `isFlaggedFraud`.

Note de prudence : dans le scénario PaySim, les transactions frauduleuses sont annulées. Les colonnes de soldes avant/après peuvent donc révéler indirectement le processus d'annulation. Elles sont conservées pour l'ingestion et les analyses descriptives, mais ne doivent pas être utilisées sans précaution comme variables prédictives d'un modèle de fraude.

## 3. Acteurs et cas d'utilisation
- Administrateur technique : configure la source, démarre les services, consulte les logs.
- Data Engineer : teste la connexion, explore les tables, lance et surveille les jobs.
- Data Analyst : interroge les tables enregistrées via Trino.
- Responsable projet : consulte les résultats de benchmark et le rapport de validation.

## 4. Architecture cible
`PaySim CSV -> SQL Server / PostgreSQL -> Spring Boot 3.3.5 (Control Plane) -> Native Java Ingestion Engine -> CSV/Parquet -> MinIO -> Hive Metastore -> Trino -> SQL`

### 4.1 Composants
- SQL Server & PostgreSQL : sources relationnelles de démonstration.
- Spring Boot 3.3.5 (Java 21) : découverte, validation des demandes, gestion des jobs, sécurité multi-tenant.
- Native Java Ingestion Engine : extraction par lots (keyset pagination bounded-memory), transformation minimale et écriture Parquet.
- Apache Parquet Java / Hadoop : schéma et sérialisation Parquet optimisée (Snappy, Zstandard).
- MinIO : stockage objet compatible S3.
- Hive Metastore : catalogue de métadonnées.
- Trino : moteur de requêtes SQL.
- Docker Compose : réseau, volumes, configuration et démarrage local.

### 4.2 Principe de fonctionnement
1. Le dataset PaySim est téléchargé depuis sa source publique et son checksum est calculé.
2. Un script d'import charge les données dans SQL Server.
3. L'API découvre les tables et leurs colonnes.
4. L'utilisateur soumet un job d'extraction.
5. Le worker lit la table par lots, écrit les fichiers et les envoie dans MinIO.
6. Le job valide les comptes de lignes et publie un manifeste.
7. La table est enregistrée dans le catalogue.
8. Trino interroge les données.

Le dépôt de fichiers dans MinIO ne suffit pas : une table doit être déclarée dans un catalogue compatible avec le connecteur Trino retenu.

## 5. Modèle de données

### 5.1 Table source
Table recommandée : `dbo.transactions`.

| Champ | Type SQL Server indicatif | Description |
|---|---|---|
| step | INT | Heure de simulation |
| type | VARCHAR(20) | Type de transaction |
| amount | DECIMAL(19,4) | Montant simulé |
| nameOrig | VARCHAR(64) | Compte émetteur pseudonyme |
| oldbalanceOrg | DECIMAL(19,4) | Solde initial émetteur |
| newbalanceOrig | DECIMAL(19,4) | Solde final émetteur |
| nameDest | VARCHAR(64) | Compte destinataire pseudonyme |
| oldbalanceDest | DECIMAL(19,4) | Solde initial destinataire |
| newbalanceDest | DECIMAL(19,4) | Solde final destinataire |
| isFraud | BIT | Label synthétique |
| isFlaggedFraud | BIT | Signalement synthétique |

Ne pas inventer de clé primaire transactionnelle si la source n'en fournit pas. Pour une extraction déterministe, créer une clé technique `ingest_row_id` lors du chargement SQL Server, en documentant qu'elle identifie la ligne importée et non un identifiant métier d'origine.

### 5.2 Tables dérivées optionnelles
Des vues ou dimensions dérivées `accounts` peuvent être créées à partir des identifiants distincts émetteurs/destinataires. Elles ne doivent contenir que les informations réellement observées (identifiant, rôle observé, première/dernière étape observée, compteurs dérivés). Ne pas inventer de données KYC.

## 6. Exigences fonctionnelles

### F-01 — Configuration de source
L'application doit charger la configuration SQL Server depuis des variables d'environnement ou un fichier local ignoré par Git. Les secrets ne doivent jamais être renvoyés par l'API.

### F-02 — Test de connexion
L'API doit pouvoir tester la connexion et retourner un résultat lisible, sans exposer la chaîne de connexion.

### F-03 — Exploration
L'application doit lister les schémas/tables accessibles et afficher nom, type, nullabilité et ordre des colonnes.

### F-04 — Sélection
L'utilisateur doit pouvoir choisir une table et configurer format, colonnes de partition, codec, taille de lot et préfixe de destination.

### F-05 — Extraction par lots
L'extraction doit être à mémoire bornée, configurable et observable. Préférer une clé stable/cursor/lecture serveur à un OFFSET coûteux sur gros volumes.

### F-06 — Écriture et stockage
L'application doit produire CSV ou Parquet, appliquer la compression choisie, téléverser les objets dans MinIO et produire un manifeste décrivant schéma, nombre de lignes, objets, octets, paramètres et checksum.

### F-07 — Partitionnement
Le système doit supporter l'absence de partitionnement et un partitionnement temporel. Pour PaySim, créer une colonne dérivée `event_time_simulated` à partir de `step`, avec une origine configurable. Comparer au minimum sans partition et par jour simulé. Ne pas partitionner par `nameOrig` ou `nameDest`.

### F-08 — Catalogue
Après validation de l'écriture, le système doit créer/enregistrer une table externe Hive ou fournir une commande documentée permettant de le faire. Les métadonnées de partition doivent être visibles dans Trino.

### F-09 — Suivi
Les jobs suivent les états `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`. L'API fournit progression, lignes, fichiers, taille, durée, destination et erreur expurgée.

### F-10 — Reprise
Une relance doit utiliser un nouvel identifiant de tentative ou un préfixe staging isolé. Elle ne doit pas mélanger silencieusement les fichiers d'une tentative échouée avec ceux d'une tentative réussie.

### F-11 — Requêtes SQL
Les analystes doivent pouvoir exécuter des filtres, agrégations, tris et jointures dans Trino.

### F-12 — Benchmark
Les résultats doivent être exportés en CSV/JSON et présentés sous forme de tableau et graphiques dans le rapport.

## 7. API REST attendue

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Santé de l'API |
| GET | `/sources` | Sources configurées |
| POST | `/sources/{id}/test` | Tester la connexion |
| GET | `/sources/{id}/tables` | Lister les tables |
| GET | `/sources/{id}/tables/{table}/schema` | Décrire une table |
| POST | `/storage/jobs` | Créer un job |
| GET | `/storage/jobs/{id}` | Statut/progression |
| GET | `/storage/jobs/{id}/result` | Résultat et manifeste |
| POST | `/storage/jobs/{id}/retry` | Relancer un job (bonus) |
| POST | `/storage/jobs/{id}/cancel` | Annuler (bonus) |

### 7.1 Exemple de demande
```json
{
  "source_id": "sqlserver",
  "schema": "dbo",
  "table": "transactions",
  "format": "parquet",
  "compression": "snappy",
  "batch_size": 10000,
  "partition_by": ["event_date"]
}
```

La création renvoie `202 Accepted` et un `job_id`; l'extraction ne doit pas bloquer la requête HTTP.

## 8. Organisation du stockage
Exemple de convention :
```text
s3://finlake/
  raw/paysim/transactions/
    ingest_date=YYYY-MM-DD/run_id=<uuid>/...
  curated/paysim/transactions/
    event_date=YYYY-MM-DD/...
  manifests/paysim/transactions/<run_id>.json
```
Le préfixe `raw` conserve la représentation aussi proche que possible de la source. `curated` contient les fichiers typés et partitionnés. Éviter la création de petits fichiers; mesurer la taille réelle des objets et ajuster le nombre de lignes par fichier.

## 9. Exigences non fonctionnelles
- Exécution locale reproductible via Docker Compose.
- Aucun secret dans Git, logs ou réponses API.
- Mémoire d'extraction bornée et taille de lot configurable.
- Logs structurés avec `job_id` et `run_id`.
- Endpoints documentés par OpenAPI.
- Tests unitaires et d'intégration.
- Contrôle d'accès minimal aux consoles MinIO et SQL Server.
- Volumes persistants pour les données et métadonnées.
- Messages d'erreur actionnables et absence de fuite de credentials.
- Les versions des images et dépendances sont fixées ou bornées.

## 10. Benchmark et protocole expérimental

### 10.1 Scénarios
| Axe | Scénarios |
|---|---|
| Format | CSV, Parquet |
| Partitionnement | Aucun, jour simulé |
| Compression | Aucune, Snappy, Zstandard (si supporté) |
| Batch | 1 000, 5 000, 10 000, 50 000 lignes |

Toutes les combinaisons ne sont pas obligatoires si les ressources locales sont limitées; le rapport doit expliquer les scénarios exécutés.

### 10.2 Mesures
- Temps de lecture/extraction SQL Server.
- Temps de conversion/écriture locale.
- Temps d'upload MinIO.
- Temps de publication/catalogage.
- Latence Trino par requête.
- Taille totale, nombre d'objets, taille moyenne d'objet.
- Débit lignes/seconde et octets/seconde.
- Mémoire maximale si mesurable.

### 10.3 Requêtes de référence
1. Scan complet avec `COUNT(*)`.
2. Agrégation par `type`.
3. Agrégation temporelle par jour simulé.
4. Filtre sur intervalle temporel.
5. Agrégation du nombre et montant de transactions marquées `isFraud`.
6. Réconciliation des comptes de lignes par partition.

### 10.4 Règles de validité
- Même dataset, mêmes lignes et mêmes requêtes.
- Enregistrer CPU, RAM, versions, configuration Docker et checksum source.
- Faire un échauffement puis au moins trois répétitions; publier médiane et dispersion.
- Distinguer cache froid et cache chaud.
- Ne jamais fabriquer ou extrapoler des mesures.
- Vérifier avec `EXPLAIN` que le partition pruning est réellement appliqué.

## 11. Tests et critères d'acceptation

| ID | Critère d'acceptation |
|---|---|
| A-01 | Tous les services démarrent avec Docker Compose et leurs health checks passent. |
| A-02 | L'import SQL Server permet de retrouver le nombre de lignes source attendu. |
| A-03 | L'API teste la connexion et explore tables/colonnes. |
| A-04 | Une extraction de bout en bout écrit des objets lisibles dans MinIO. |
| A-05 | Les lignes source, exportées et relues depuis Parquet se réconcilient. |
| A-06 | Les tables sont visibles dans Trino via le catalogue. |
| A-07 | Les requêtes SQL de référence retournent des résultats cohérents. |
| A-08 | Un échec est enregistré avec un message expurgé et peut être diagnostiqué. |
| A-09 | Les benchmarks produisent des fichiers de résultats reproductibles. |
| A-10 | Le README permet à un autre utilisateur de reproduire le parcours complet. |

## 12. Phasage de réalisation

1. **P0 — Cadrage et dataset** : récupérer PaySim, vérifier licence/attribution, checksum, profilage, data dictionary.
2. **P1 — Infrastructure** : Docker Compose, SQL Server, MinIO, Hive Metastore, Trino; smoke tests.
3. **P2 — Import et connecteur** : charger PaySim dans SQL Server; tester connexion et exploration.
4. **P3 — Moteur d'ingestion** : batch extraction, CSV/Parquet, manifeste, MinIO.
5. **P4 — Catalogue et SQL** : déclaration de table, partitions, requêtes analytiques.
6. **P5 — API et jobs** : endpoints, worker asynchrone, statuts, erreurs, retry.
7. **P6 — Qualité et benchmarks** : tests, protocole, mesures, rapport.
8. **P7 — Bonus** : Iceberg, incrémental, évolution de schéma, statistiques et modèle de fraude exploratoire.

Chaque phase doit être validée avant de commencer la suivante. Ne pas générer toute l'application en une seule passe.

## 13. Bonus
- Apache Iceberg avec snapshots, évolution de schéma et time travel.
- Ingestion incrémentale par `step` ou watermark technique, en documentant les limites de la source.
- Détection de changements de schéma et stratégie de compatibilité.
- Statistiques de colonnes et de partitions.
- Relance idempotente et nettoyage des préfixes temporaires.
- Comparaison Hive external Parquet vs Iceberg.
- Analyses de fraude exploratoires; ML hors périmètre principal.

## 14. Livrables finaux
- Code source structuré et testé.
- `docker-compose.yml` et `.env.example`.
- Scripts d'import PaySim vers SQL Server.
- API REST et documentation OpenAPI.
- Worker d'ingestion.
- Configuration MinIO, Hive Metastore et Trino.
- DDL et requêtes SQL analytiques.
- Manifeste d'ingestion et rapports qualité.
- Résultats bruts de benchmark CSV/JSON.
- Rapport d'analyse des performances.
- README, diagrammes d'architecture et guide de dépannage.

## 15. Références dataset
- Kaggle: https://www.kaggle.com/datasets/ealaxi/paysim1
- Hugging Face mirror: https://huggingface.co/datasets/LordNR/AMLGraphX-Paysim
- Article dataset: https://pmc.ncbi.nlm.nih.gov/articles/PMC12036017/
- Le miroir Hugging Face est une copie communautaire; conserver l'attribution et vérifier les conditions de réutilisation de la source originale avant redistribution.
