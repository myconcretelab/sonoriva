# SonoRiva Bridge

SonoRiva Bridge 1.1.0 contient le moteur audio natif et une régie locale facultative de SonoRiva. L’application web reste autonome et utilise Web Audio lorsque le bridge n’est pas sélectionné.

## Composants

- application de bureau Tauri 2 pour macOS 11 ou version ultérieure et Windows x64 ;
- moteur audio CPAL/Rodio avec une sortie ouverte par périphérique utilisé ;
- routage individuel des lectures avec changement de périphérique à la même position ;
- serveur HTTP local sur `127.0.0.1:43821` ;
- canal WebSocket local pour l’état des lectures ;
- fichiers compressés dans le dossier de données de l’utilisateur, avec migration de l’ancien cache ;
- nombre de fichiers et taille totale du cache affichés dans la fenêtre ;
- jeton d’appareil et clé locale dans le fichier privé `credentials.json` ;
- association par URL `sonoriva-bridge://pair` et ticket SonoRiva temporaire.
- mise à jour automatique signée du moteur depuis la dernière publication GitHub stable ;
- régie locale, spectacles, imports et journal de synchronisation conservés sur disque ;
- mises à jour signées de l’interface indépendantes de la compilation native.

## Compilation

Rust et les outils de développement de la plateforme cible sont requis. La compilation macOS utilise Xcode Command Line Tools. La compilation Windows utilise Microsoft C++ Build Tools et WebView2.

```sh
npm ci
npm --prefix bridge ci
npm run bridge:check
npm run bridge:test
npm run bridge:build
```

L’application et son paquet sont produits sous `bridge/src-tauri/target/release/bundle/`. macOS produit une image disque avec une signature ad hoc, sans certificat Apple Developer ni notarisation. Son fond bilingue illustre le glisser-déposer dans Applications et le chemin **Réglages Système → Confidentialité et sécurité → Ouvrir quand même**. Windows produit un installateur NSIS x64 non signé.

Le fichier `bridge/package.json` et son lockfile contiennent uniquement l’outillage de compilation du bridge. L’installation npm située à la racine ne contient pas Tauri.

Au démarrage, le Bridge consulte `latest.json` dans la dernière publication GitHub. Une nouvelle version est téléchargée et vérifiée avec la clé publique intégrée. Elle est installée et le Bridge redémarre uniquement si aucune lecture audio n’a commencé pendant le téléchargement. Sinon, l’installation est différée et signalée dans le panneau **Mises à jour**. Le bouton **Vérifier les mises à jour** lance une recherche manuelle ; **Installer la version … et redémarrer** télécharge, vérifie et installe la version disponible lorsqu’aucune lecture n’est active. Ce panneau affiche également l’absence de mise à jour et les erreurs de vérification ou d’installation. Les jetons d’association sont enregistrés dans `credentials.json`, dans le dossier local de données du Bridge. Sous macOS et Linux, ce fichier utilise les permissions `0600`. La version 1.0.1 importe une association existante depuis le gestionnaire d’identifiants du système lorsque ce fichier n’existe pas encore.

## Publication GitHub

Le workflow `.github/workflows/release-bridge.yml` est déclenché par les étiquettes Git `bridge-v*`. Il compile et publie trois paquets dans une GitHub Release publique :

- `aarch64` pour les Mac Apple Silicon ;
- `x64` pour les Mac Intel ;
- `x64` au format NSIS pour Windows.

Le workflow génère également les paquets de mise à jour signés et `latest.json`. La clé privée et son mot de passe proviennent des secrets GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. La clé privée n’est pas présente dans le dépôt.

Les installateurs sont disponibles sur [la dernière publication stable](https://github.com/myconcretelab/sonoriva/releases/latest).

## Interface indépendante du moteur

`npm run build:bridge-ui` compile l’interface React et produit `bridge/ui/console/package.json`. `npm run bridge:build` exécute cette préparation avant de compiler le moteur. Le paquet intégré est inclus dans l’application native.

Le workflow `.github/workflows/release-interface.yml` compile et signe uniquement l’interface après une modification de ses sources sur `main`. Il n’exécute pas Cargo. `npm run release:bridge-ui` produit `dist/interface/sonoriva-interface.json` avec la clé de signature fournie par l’environnement du workflow. Le paquet contient les fichiers de l’interface, sa révision Git, la version du protocole local et la version minimale du Bridge.

Le canal `interface-latest` est une prépublication distincte de la dernière version native stable. Le Bridge vérifie la signature avec la même clé publique que son mécanisme de mise à jour native. Un paquet incompatible, incomplet ou invalide conserve la version installée. Le téléchargement et l’activation sont séparés. L’activation et le retour à l’interface précédente sont bloqués pendant les lectures ; les activités de la régie locale sont signalées au moteur.

## Régie et stockage local

**Ouvrir la régie locale** ouvre l’interface conservée sur l’ordinateur. La préparation depuis le navigateur transfère les données du spectacle et ses fichiers. Les modifications individuelles et les imports utilisent des fichiers privés par utilisateur. Les médias sont écrits et synchronisés sur disque avant le remplacement atomique du journal ; les modifications concurrentes utilisent une révision comparée avant chaque écriture.

La fenêtre locale accède au serveur par un relais limité aux routes de régie. Le jeton d’appareil reste dans le processus natif. La session utilisateur en ligne, le forfait et la révocation de l’appareil sont vérifiés pour la synchronisation. Une indisponibilité du serveur ne supprime pas l’accès aux données locales. Le [guide du mode hors ligne](../docs/guides/mode-hors-ligne.md) décrit les commandes et les limites.

## Exécution en développement

```sh
npm run build:bridge-ui
cd bridge/src-tauri
npx tauri dev
```

Le lien d’association accepte `https://app.sonoriva.fr`. En développement, les origines `http://localhost` et `http://127.0.0.1` sont également acceptées lorsqu’elles sont transmises par le paramètre `server`.

## API locale

`GET /v1/status` expose l’état général du processus, ses capacités, `cachedTracks` et `cachedBytes`. `POST /v1/play` accepte une propriété facultative `outputId` ainsi qu’une préécoute distante HTTPS provenant des sources Openverse prises en charge : Freesound, Jamendo, Wikimedia et ccMixter. `PUT /v1/playbacks/:id/output` déplace une lecture active vers le périphérique fourni. `PUT /v1/master-volume` règle le volume commun à toutes les lectures sans remplacer leur volume individuel. Les routes de lecture, de cache et de synchronisation exigent `Authorization: Bearer <clé-locale>`. Les origines CORS admises sont l’application SonoRiva en production, Vite en développement et la fenêtre Tauri.

Depuis la version 1.0.10, `POST /v1/cache/audio` reçoit un morceau et renvoie son fichier local complet pour la forme d’onde et la préécoute du navigateur. La route exige la clé locale, vérifie l’identifiant et la taille du fichier et ne télécharge rien. Elle répond 404 si le fichier est absent ou incomplet. La capacité `cachedAudio` est annoncée dans `/v1/status`.
