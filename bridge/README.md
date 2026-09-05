# SonoRiva Bridge

SonoRiva Bridge 1.0.6 est le moteur audio natif facultatif de SonoRiva. L’application web reste autonome et utilise Web Audio lorsque le bridge n’est pas sélectionné.

## Composants

- application de bureau Tauri 2 pour macOS 11 ou version ultérieure et Windows x64 ;
- moteur audio CPAL/Rodio avec une sortie ouverte par périphérique utilisé ;
- routage individuel des lectures avec changement de périphérique à la même position ;
- serveur HTTP local sur `127.0.0.1:43821` ;
- canal WebSocket local pour l’état des lectures ;
- cache de fichiers compressés dans le dossier de cache de l’utilisateur ;
- nombre de fichiers et taille totale du cache affichés dans la fenêtre ;
- jeton d’appareil et clé locale dans le fichier privé `credentials.json` ;
- association par URL `sonoriva-bridge://pair` et ticket SonoRiva temporaire.
- mise à jour automatique signée depuis la dernière publication GitHub.

## Compilation

Rust et les outils de développement de la plateforme cible sont requis. La compilation macOS utilise Xcode Command Line Tools. La compilation Windows utilise Microsoft C++ Build Tools et WebView2.

```sh
npm --prefix bridge ci
npm run bridge:check
npm run bridge:test
npm run bridge:build
```

L’application et son paquet sont produits sous `bridge/src-tauri/target/release/bundle/`. macOS produit une image disque avec une signature ad hoc, sans certificat Apple Developer ni notarisation. Son fond bilingue illustre le glisser-déposer dans Applications et le chemin **Réglages Système → Confidentialité et sécurité → Ouvrir quand même**. Windows produit un installateur NSIS x64 non signé.

Le fichier `bridge/package.json` et son lockfile contiennent uniquement l’outillage de compilation du bridge. L’installation npm située à la racine ne contient pas Tauri.

Au démarrage, le Bridge consulte `latest.json` dans la dernière publication GitHub. Une nouvelle version est téléchargée et vérifiée avec la clé publique intégrée. Elle est installée et le Bridge redémarre uniquement si aucune lecture audio n’a commencé pendant le téléchargement. Sinon, l’installation est différée jusqu’à un prochain démarrage. Les jetons d’association sont enregistrés dans `credentials.json`, dans le dossier local de données du Bridge. Sous macOS et Linux, ce fichier utilise les permissions `0600`. La version 1.0.1 importe une association existante depuis le gestionnaire d’identifiants du système lorsque ce fichier n’existe pas encore.

## Publication GitHub

Le workflow `.github/workflows/release-bridge.yml` est déclenché par les étiquettes Git `bridge-v*`. Il compile et publie trois paquets dans une GitHub Release publique :

- `aarch64` pour les Mac Apple Silicon ;
- `x64` pour les Mac Intel ;
- `x64` au format NSIS pour Windows.

Le workflow génère également les paquets de mise à jour signés et `latest.json`. La clé privée et son mot de passe proviennent des secrets GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. La clé privée n’est pas présente dans le dépôt.

Les téléchargements sont disponibles sur `https://github.com/myconcretelab/sonoriva/releases`.

## Exécution en développement

```sh
cd bridge/src-tauri
npx tauri dev
```

Le lien d’association accepte `https://app.sonoriva.fr`. En développement, les origines `http://localhost` et `http://127.0.0.1` sont également acceptées lorsqu’elles sont transmises par le paramètre `server`.

## API locale

`GET /v1/status` expose l’état général du processus, ses capacités, `cachedTracks` et `cachedBytes`. `POST /v1/play` accepte une propriété facultative `outputId` ainsi qu’une préécoute distante HTTPS provenant des sources Openverse prises en charge : Freesound, Jamendo, Wikimedia et ccMixter. `PUT /v1/playbacks/:id/output` déplace une lecture active vers le périphérique fourni. `PUT /v1/master-volume` règle le volume commun à toutes les lectures sans remplacer leur volume individuel. Les routes de lecture, de cache et de synchronisation exigent `Authorization: Bearer <clé-locale>`. Les origines CORS admises sont l’application SonoRiva en production, Vite en développement et la fenêtre Tauri.
