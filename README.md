# SonoRiva

> Play sound. Play the scene.

SonoRiva est une régie son web inspirée de SoundShow. Les médias sont stockés en ligne, préparés hors connexion dans une PWA, puis joués localement avec Web Audio pour éviter la latence du réseau pendant un spectacle.

L’identité visuelle repose sur le monogramme **SR** et un accent aqua ; les identifiants techniques et le déploiement utilisent le nom `sonoriva`.

## Fonctionnalités actuelles

- comptes multiples avec espace de travail isolé, sessions sécurisées et mots de passe dérivés avec `scrypt` ;
- administration commerciale intégrée sous `/admin` avec gestion des utilisateurs, comptes, forfaits, quotas, essais et rôles de plateforme ;
- droits fonctionnels configurables par forfait pour les dispositions personnalisées, les playlists, la télécommande et le nombre de spectacles ;
- forfait interne de démonstration avec durée d’inactivité, imports, taille de fichier et stockage configurables ;
- plusieurs spectacles et catégories colorées, réordonnables et supprimables, avec recherche globale ;
- sous-catégories de morceaux en tuiles compactes avec ouverture dans un tiroir ;
- import audio MP3, WAV, OGG, FLAC et AAC et vidéo MP4/WebM jusqu’à 250 Mo ;
- projection vidéo dans une fenêtre séparée avec aperçu, boucle, points d’entrée/sortie, fondus et noir écran ;
- recherche Freesound avec filtres de durée minimale et maximale, préécoute, renommage et import dans la catégorie choisie ;
- import complet d’un projet SoundShow `.ssp` avec catégories, couleurs, boucles et points d’entrée/sortie ;
- lecture polyphonique plafonnée par spectacle, navigation dans le morceau, boucles, volume limité à 100 % et fondus animés, avec lecteurs compacts automatiques et commandes indépendantes pour chaque instance ;
- playlists persistantes organisées en rangées séquentielles ou aléatoires, avec plusieurs morceaux simultanés par rangée, boucle, démarrage automatique, silence réglable ou mix par fondu enchaîné ;
- progression de lecture, catégorie active, chronomètre et réglages d'affichage restaurés après actualisation ;
- mise à disposition hors ligne des sons par catégorie, conservée après actualisation ;
- import rapide de plusieurs fichiers par glisser-déposer sur toute la fenêtre vers la catégorie active ;
- console d'en-tête avec volume du prochain son réinitialisable ou verrouillable, chronomètre et horloge ;
- actions configurables par spectacle pour les clics gauche et droit : démarrer, fondu enchaîné, fondu d’entrée, remplacer, arrêter ou aucune action ;
- éditeur graphique de forme d’onde avec poignées début/fin, zoom jusqu’à 64× et préécoute de la sélection ;
- raccourcis `1` à `9` et arrêt général avec `Échap` ;
- télécommande temps réel via WebSocket ;
- téléchargement d’un projet dans le cache hors ligne ;
- interface responsive installable comme PWA.
- notes de version par utilisateur et installation différée des mises à jour PWA afin de ne jamais interrompre une lecture.
- centre de documentation public avec recherche, guides pratiques, référence, dépannage et notes de version.

## Développement local

Prérequis : Node.js 22 ou 24 et Docker, ou une instance PostgreSQL locale.

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

L’interface est disponible sur `http://localhost:5173` et l’API sur `http://127.0.0.1:8100`.

La documentation se développe séparément sur `http://localhost:5174` :

```bash
npm run dev:docs
```

## Vérification

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Déploiement Alwaysdata

Pour mettre à jour la production depuis le Mac d’administration après avoir poussé `main` :

```bash
./scripts/deploy-alwaysdata.sh
```

Le script refuse un dépôt sale ou non poussé, récupère les variables du site via l’API Alwaysdata, compile l’application, applique les migrations, redémarre le site et contrôle son endpoint de santé. Le jeton d’API n’est jamais stocké dans Git : il est lu dans le trousseau Apple (`sonoriva-alwaysdata-api` / `myconcretelab`).

## Publier une version

Chaque version doit être déclarée simultanément dans `package.json`, `CHANGELOG.md`, `src/server/releases.ts` et `docs/nouveautes/<version>.md`. Avant de committer une publication :

```bash
npm run release:check
npm run typecheck
npm run lint
npm test
npm run build
```

Après le déploiement, les utilisateurs déjà inscrits voient les nouveautés une seule fois. Les nouveaux comptes commencent directement sur la version courante. Une PWA déjà ouverte signale qu’une mise à jour est prête mais refuse son installation tant qu’un son est en lecture.

Pour une installation initiale manuelle :

1. Créer une base PostgreSQL et un utilisateur dans **Bases de données > PostgreSQL**.
2. Choisir Node.js 24 dans **Environnement > Node.js**.
3. Déployer le dépôt dans `/home/<compte>/sonoriva`.
4. Configurer les variables d’environnement suivantes dans le site Node.js :

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://<utilisateur>:<mot-de-passe>@postgresql-<compte>.alwaysdata.net:5433/<base>
SESSION_SECRET=<une-valeur-aleatoire-d-au-moins-32-caracteres>
STORAGE_PATH=/home/<compte>/sonoriva/storage
PUBLIC_URL=https://<votre-domaine>
FREESOUND_API_KEY=<clé-api-freesound>
OPENVERSE_CLIENT_ID=<identifiant-client-openverse-optionnel>
OPENVERSE_CLIENT_SECRET=<secret-client-openverse-optionnel>
SUPER_ADMIN_EMAILS=<adresse-du-super-administrateur>
STRIPE_MODE=test
STRIPE_SECRET_KEY=<clé-restreinte-ou-secrète-test>
STRIPE_WEBHOOK_SECRET=<secret-whsec-du-webhook-test>
STRIPE_PORTAL_CONFIGURATION_ID=
STRIPE_CHECKOUT_ENABLED=false
STRIPE_AUTOMATIC_TAX=false
BILLING_GRACE_PERIOD_DAYS=7
BILLING_RECONCILIATION_INTERVAL_MINUTES=360
```

`SUPER_ADMIN_EMAILS` accepte plusieurs adresses séparées par des virgules. Lors de l’inscription, une adresse présente dans cette liste reçoit le rôle `super_admin`. Les autres utilisateurs reçoivent le rôle `user`. Le forfait `Solo`, créé par la migration du module commercial, fournit 5 Go et 14 jours d’essai ; ses valeurs et les autres forfaits se modifient dans `/admin`.

## Stripe Billing

L’intégration utilise un catalogue distinct par `STRIPE_MODE`. En phase de test, la clé doit commencer par `sk_test_` ou `rk_test_`. Une clé live est refusée tant que le mode vaut `test`.

Le webhook Stripe pointe vers :

```text
https://app.sonoriva.fr/api/billing/webhook
```

Événements configurés :

- `checkout.session.completed` ;
- `customer.subscription.created` ;
- `customer.subscription.updated` ;
- `customer.subscription.deleted` ;
- `customer.subscription.trial_will_end` ;
- `invoice.paid` ;
- `invoice.payment_failed` ;
- `invoice.payment_action_required`.

Après définition de la clé et du secret de webhook, chaque forfait est enregistré puis synchronisé depuis **Administration → Forfaits → Synchroniser les tarifs Stripe**. `STRIPE_CHECKOUT_ENABLED=true` rend ensuite les commandes de souscription visibles aux propriétaires d’espace.

La création d’un compte demande un forfait. Lorsque tous les tarifs renseignés du forfait valent `0`, l’espace est activé immédiatement avec son quota, sans client ni abonnement Stripe. Pour un forfait payant, la périodicité est demandée puis Stripe Checkout est ouvert. L’espace reste en lecture seule jusqu’à la confirmation du Checkout par webhook. Stripe démarre alors l’essai défini sur le forfait et conserve le moyen de paiement pour la première échéance à la fin de cet essai. Une annulation du Checkout laisse le compte existant et permet de reprendre la souscription depuis **Paramètres → Offre et stockage**.

SonoRiva Bridge est inclus lorsqu’un forfait comporte au moins un tarif positif. L’association, les requêtes natives et l’accès au téléchargement exigent un compte en essai payant, actif ou en délai de grâce. L’API publique des forfaits expose ce droit dans `bridgeIncluded` pour le bloc tarifaire WordPress.

5. Depuis SSH, préparer l’application :

```bash
cd /home/<compte>/sonoriva
npm ci --include=optional
npm run build
npm run db:migrate
npm prune --omit=dev
```

6. Créer un site de type **Node.js** avec cette commande :

```bash
node /home/<compte>/sonoriva/dist/server/index.js
```

Le serveur utilise automatiquement les variables `IP` et `PORT` fournies par Alwaysdata. Dans les réglages avancés du site, mettre le temps d’inactivité à `0` afin de conserver les connexions WebSocket. Activer HTTPS et vérifier que `PUBLIC_URL` contient exactement l’origine publique.

Les fichiers audio résident dans `STORAGE_PATH`, jamais dans PostgreSQL. Ils sont servis uniquement après contrôle de la session et avec prise en charge des requêtes HTTP `Range`.

La recherche Openverse interroge les catalogues audio Freesound, Jamendo, Wikimedia Commons et ccMixter. Plusieurs sources peuvent être filtrées simultanément. Les préécoutes peuvent être écoutées sans stockage ou importées dans le spectacle sous un nouveau nom, dans la catégorie et la sous-catégorie choisies. SonoRiva télécharge alors le média dans `STORAGE_PATH` et conserve l’auteur, la licence, la source et son URL. La recherche fonctionne sans authentification ; `OPENVERSE_CLIENT_ID` et `OPENVERSE_CLIENT_SECRET` activent l’authentification OAuth côté serveur lorsque les deux variables sont définies. L’ancienne intégration Freesound reste disponible côté serveur mais n’est plus exposée dans l’interface.

## Structure

```text
src/client/       interface React, PWA et moteur audio
src/server/       API Fastify et serveur WebSocket
src/server/db/    schéma et migrations Drizzle
migrations/       migrations PostgreSQL versionnées
storage/          médias locaux, ignorés par Git
public/           manifeste, icône et service worker
docs/             documentation VitePress publiée sous /docs/
```

## Importer un projet SoundShow

Dans la régie, utiliser **Importer SoundShow**, puis sélectionner le dossier qui contient le fichier `.ssp`. Après l’analyse, les fichiers trouvés sont envoyés individuellement afin d’afficher la progression et de pouvoir importer de gros projets. Si le projet référence des médias situés ailleurs, utiliser **Ajouter un dossier de médias externe** avant de lancer l’import. Les médias Freesound manquants peuvent être récupérés directement depuis leur URL d’origine.

## Limites connues de cette première version

- un téléphone contrôleur doit se connecter avec le même compte ;
- les playlists et séquences SoundShow sont détectées mais ne sont pas encore recréées ;
- le routage vers plusieurs périphériques audio dépend fortement du navigateur ;
