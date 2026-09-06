# Changelog

Toutes les évolutions notables de SonoRiva sont documentées ici. Le projet suit le versionnage sémantique : correctifs en `patch`, fonctionnalités compatibles en `minor` et changements incompatibles en `major`.

## [1.17.0] - 2026-09-06

### Ajouté

- notifications e-mail et Telegram lors de la souscription d’un forfait gratuit ou payant ;
- configuration super-admin du destinataire e-mail, du jeton de bot Telegram et du `chatID` ;
- déduplication persistante des notifications de souscription.

### Modifié

- passage de l’application à la version `1.17.0`.

## [1.16.0] - 2026-09-01

### Ajouté

- forfait interne protégé pour la démonstration publique, distinct des offres gratuites et payantes ;
- configuration de la durée d’inactivité, du nombre maximal d’imports et de la taille maximale d’un fichier de démonstration ;
- application à la démonstration des droits sur les dispositions, les playlists, la télécommande et le nombre de spectacles ;
- publication des limites de démonstration utilisées sur les écrans d’accès et de compte.

### Modifié

- quota de stockage de la démonstration désormais fourni par son forfait interne ;
- exclusion du forfait de démonstration des attributions aux clients, du catalogue tarifaire et de Stripe ;
- conservation des valeurs existantes après migration : 24 heures, 15 imports, 5 Mo par fichier, 80 Mo de stockage et un spectacle ;
- passage de l’application à la version `1.16.0`.

## [1.15.0] - 2026-09-01

### Ajouté

- droits configurables par forfait pour les dispositions personnalisées, les playlists et la télécommande ;
- nombre maximal de spectacles configurable, avec une valeur vide pour un nombre illimité ;
- publication des droits fonctionnels dans l’API publique des forfaits et dans le résumé du compte.

### Modifié

- blocage côté serveur de la création de spectacles au-delà de la limite du forfait ;
- contrôle côté serveur des écritures de playlists et des commandes de télécommande ;
- conservation des spectacles, playlists et dispositions existants lors du retrait d’un droit ;
- passage de l’application à la version `1.15.0`.

## [1.14.1] - 2026-09-01

### Ajouté

- quinze sons Freesound CC0 dans chacune des huit catégories de démonstration, soit cent vingt morceaux au total ;
- groupes thématiques au sein des catégories : animaux, bruitages usuels, ponctuations dramatiques, jingles, effets, ambiances, transitions et réactions du public ;
- catalogue JSON versionné et script reproductible de collecte, sélection et encodage des préécoutes.

### Modifié

- préécoutes encodées en MP3 stéréo 96 kbit/s et limitées à huit secondes ;
- catalogue de démonstration chargé depuis un manifeste séparé du service de création des sessions ;
- passage de l’application à la version `1.14.1`.

## [1.14.0] - 2026-09-01

### Ajouté

- catalogue de démonstration composé de seize fichiers audio Freesound réels sous licence CC0 ;
- huit catégories contenant chacune deux morceaux : Animaux, Bruitages, Drame, Joyeux, Effets, Ambiances, Transitions et Public ;
- tags, descriptions, identifiants Freesound, pages sources et mentions de licence enregistrés avec les morceaux fournis.

### Modifié

- retrait des trois sons WAV synthétiques et des catégories Lancements, Transitions et Final de la démonstration ;
- extraits longs limités à douze secondes afin de conserver une création de session rapide ;
- passage de l’application à la version `1.14.0`.

## [1.13.0] - 2026-09-01

### Ajouté

- sauvegarde locale des dispositions personnalisées sous un nom choisi par l’utilisateur ;
- chargement et suppression des dispositions enregistrées depuis l’éditeur de l’interface.

### Modifié

- grille de disposition fixée à douze colonnes et retrait du sélecteur 6/8/12 ;
- conversion automatique des anciennes dispositions enregistrées vers la grille à douze colonnes ;
- cartes de catégories maintenues au format carré quelle que soit la hauteur de leur bloc ;
- sélecteur Noms/Tags remplacé par un switch segmenté ;
- commandes de gestion des catégories rapprochées de leur titre et espacement augmenté entre Freesound et le raccourci de recherche ;
- passage de l’application à la version `1.13.0`.

## [1.12.0] - 2026-09-01

### Ajouté

- système générique de modules repliables, utilisé par la Playlist et les Actions de déclenchement ;
- barre réduite de 34 pixels avec icône, titre, compteur éventuel et commande de réouverture ;
- état replié mémorisé dans la disposition locale de l’utilisateur.

### Modifié

- commande de réduction limitée à une icône discrète de 19 pixels dans les modules ouverts ;
- playlist compacte alignée sur le même état replié que les autres dispositions ;
- ouverture automatique d’une playlist réduite lors d’un ajout ou du dépôt d’un morceau ;
- passage de l’application à la version `1.12.0`.

## [1.11.1] - 2026-08-31

### Corrigé

- hauteur minimale du bloc Catégories augmentée de deux à trois rangées pour afficher entièrement les cartes et leurs titres ;
- migration automatique des dispositions enregistrées avec l’ancienne hauteur, avec rééquilibrage du Soundboard et des blocs situés dessous.

### Modifié

- passage de l’application à la version `1.11.1`.

## [1.11.0] - 2026-08-31

### Ajouté

- colonne gauche transformée en zone de dépôt persistante pour les actions de déclenchement, les lectures en cours et la playlist ;
- bloc **Actions de déclenchement** intégré à l’éditeur de disposition et permutable avec les autres blocs compatibles ;
- déplacement conjoint des lectures et de la playlist dans la colonne gauche avec le modèle **Régie compacte**.

### Modifié

- extension automatique des blocs restants lorsque la colonne gauche reçoit des éléments de la grille ;
- disposition mobile conservant les actions dans le menu latéral et les quatre blocs principaux dans le flux vertical ;
- passage de l’application à la version `1.11.0`.

## [1.10.0] - 2026-08-31

### Ajouté

- modèle **Régie compacte** affichant les lectures sur toute la hauteur avec un tiroir Playlist escamotable ;
- ouverture automatique du tiroir lors du dépôt d’un morceau, avec ajout direct à la playlist ;
- hauteur du tiroir réglable à la souris ou au clavier.

### Modifié

- état ouvert et hauteur du tiroir conservés dans la disposition locale de l’utilisateur ;
- affichage mobile maintenu en blocs verticaux sans tiroir ;
- passage de l’application à la version `1.10.0`.

## [1.9.0] - 2026-08-31

### Ajouté

- espace de travail composé de quatre blocs réorganisables : catégories, soundboard, lectures en cours et playlist ;
- modèles **Régie classique**, **Playlist verticale** et **Playlist principale** ;
- grilles de six, huit ou douze colonnes, permutation par glisser-déposer et redimensionnement des blocs ;
- mémorisation locale de la disposition pour chaque utilisateur.

### Modifié

- playlist affichée comme un bloc permanent pouvant occuper toute la hauteur de l’espace de travail ;
- disposition mobile linéaire indépendante de la grille personnalisée ;
- passage de l’application à la version `1.9.0`.

## [1.8.2] - 2026-08-31

### Ajouté

- option persistante par playlist pour afficher un grand bouton **Morceau suivant** sur toute la largeur du panneau.

### Corrigé

- une seule bande **Insérer ici** s’agrandit pendant un glisser-déposer : celle réellement survolée ;
- les bandes d’insertion ne réagissent plus au simple survol lorsqu’aucun morceau n’est déplacé.

### Modifié

- passage de l’application à la version `1.8.2`.

## [1.8.1] - 2026-08-31

### Ajouté

- infobulle affichant le titre complet d’un morceau tronqué dans une rangée de playlist ;
- affichage permanent des zones d’insertion pendant le glisser-déposer d’un morceau externe ou déjà présent dans la playlist.

### Corrigé

- largeur des morceaux d’une rangée répartie également sans défilement horizontal ;
- extraction et déplacement d’un morceau hors d’une rangée groupée rendus directement accessibles.

### Modifié

- retrait des légendes de glisser-déposer au-dessus des rangées ;
- passage de l’application à la version `1.8.1`.

## [1.8.0] - 2026-08-31

### Ajouté

- lecture récursive des dossiers et sous-dossiers déposés sur la fenêtre ;
- choix entre une catégorie par dossier, une sous-catégorie par dossier ou les noms des dossiers comme tags ;
- réutilisation des catégories et sous-catégories existantes portant le même nom dans la même destination ;
- conservation des fichiers placés à la racine dans la catégorie active.

### Modifié

- affichage du chemin relatif pendant la progression d’un import de dossier ;
- passage de l’application à la version `1.8.0`.

## [1.7.1] - 2026-08-31

### Corrigé

- réglettes de position et de volume affinées dans les lecteurs compacts ;
- mesure de la durée réelle des fichiers lors des imports unitaires, multiples et SoundShow ;
- lecture Bridge des morceaux importés sans durée exploitable après réparation de leurs métadonnées.

### Modifié

- passage de l’application à la version `1.7.1`.

## [1.7.0] - 2026-08-31

### Ajouté

- limite de huit lectures simultanées par défaut, réglable de une à seize pour chaque spectacle ;
- présentation compacte des lecteurs avec commandes placées à droite ;
- seuil automatique du mode compact fixé à cinq lecteurs par défaut et réglable de un à seize.

### Corrigé

- déclenchement des morceaux à nouveau disponible pendant la réorganisation des sous-catégories ;
- message de limite conservé lors du démarrage partiel ou refusé d’une rangée de playlist.

### Modifié

- compteur de la colonne de lecture affichant le nombre actif et la limite configurée ;
- passage de l’application à la version `1.7.0`.

## [1.6.1] - 2026-08-31

### Ajouté

- dépôt d’un morceau directement dans les espaces du tiroir ouvert pour l’ajouter à la sous-catégorie ;
- macaron indiquant le nombre de morceaux à gauche du titre de chaque sous-catégorie.

### Modifié

- commandes **Modifier** et **Supprimer** placées à gauche du titre dans l’en-tête du tiroir ;
- passage de l’application à la version `1.6.1`.

## [1.6.0] - 2026-08-31

### Ajouté

- sous-catégories persistantes de morceaux dans chaque catégorie ;
- création par dépôt d’un morceau au centre d’un autre ou depuis un bouton du tableau de bord ;
- tuile compacte avec titre sur la bordure, mosaïque d’aperçu et compteur ;
- tiroir pleine largeur pour afficher et utiliser les morceaux d’une sous-catégorie ;
- modification du nom, de la couleur et de la catégorie parente ;
- déplacement et réorganisation d’un groupe complet depuis sa tuile.

### Modifié

- bandes latérales des morceaux réservées à l’insertion avant ou après pendant la réorganisation ;
- recherche affichant directement les morceaux, même lorsqu’ils appartiennent à une sous-catégorie fermée ;
- suppression d’une sous-catégorie conservant ses morceaux dans la catégorie parente ;
- passage de l’application à la version `1.6.0`.

## [1.5.0] - 2026-08-31

### Ajouté

- rangées de playlist capables de lancer plusieurs morceaux simultanément ;
- regroupement par dépôt au centre d’une rangée et insertion verticale entre deux rangées ;
- limite de deux à huit morceaux par rangée, configurable pour chaque spectacle ;
- affichage du nombre de rangées et indication visuelle des groupes enregistrés.

### Modifié

- lecture, pause, arrêt, passage au suivant, boucle, aléatoire et fondu enchaîné appliqués aux rangées complètes ;
- migration des playlists existantes en conservant un morceau par rangée ;
- passage de l’application à la version `1.5.0`.

## [1.4.0] - 2026-08-31

### Ajouté

- affectation des touches `1` à `9` puis `A` à `Z` aux 35 premiers morceaux visibles ;
- action de déclenchement clavier configurable à côté des actions souris ;
- action configurable de `Maj + Retour arrière` ;
- raccourci de recherche configurable et adapté à macOS ou Windows.

### Modifié

- `Retour arrière` retire par défaut le dernier lecteur immédiatement ;
- `Maj + Retour arrière` retire par défaut le dernier lecteur avec son fondu ;
- activation effective du raccourci de focus de la recherche ;
- passage de l’application à la version `1.4.0`.

## [1.3.0] - 2026-08-31

### Ajouté

- raccourcis configurables pour parcourir les catégories, démarrer les positions 1 à 9 et lancer un fondu enchaîné ;
- commande de chargement en cache de la catégorie actuelle ;
- maintien et bascule du routage des nouveaux départs vers la sortie secondaire ;
- volume maître commun aux lectures Web Audio et Bridge avec réglages clavier normal et rapide ;
- saisie directe et persistance par spectacle des nouvelles combinaisons ;
- SonoRiva Bridge 1.0.4 avec prise en charge du volume maître.

### Modifié

- passage de l’application à la version `1.3.0`.

## [1.2.0] - 2026-08-31

### Ajouté

- mode de sélection multiple des morceaux par clic, toucher ou rectangle tracé à la souris ;
- barre contextuelle de gestion de la sélection visible ;
- édition de lot de la catégorie, de la couleur, des tags, du volume, de la boucle et des fondus ;
- opérations d’ajout, de retrait et de remplacement des tags sur plusieurs morceaux.

### Modifié

- passage de l’application à la version `1.2.0`.

## [1.1.0] - 2026-08-31

### Ajouté

- ajout et suppression de tags dans les réglages des morceaux et lors de leur import ;
- sélection explicite entre la recherche par noms, active par défaut, et la recherche par tags ;
- reprise automatique des tags fournis par Freesound.

### Modifié

- passage de l’application à la version `1.1.0`.

## [1.0.0] - 2026-08-29

### Ajouté

- identité globale **SonoRiva** avec monogramme `SR` et palette aqua ;
- domaines publics `sonoriva.fr` et `app.sonoriva.fr` ;
- paquet autonome SonoRiva Bridge 1.0.0 pour macOS et Windows.

### Modifié

- renommage de l’application, du dépôt, du site WordPress, de la documentation, des e-mails et des métadonnées PWA ;
- remplacement des identifiants techniques, clés locales, caches, cookies, protocole natif, identifiants Tauri et chemins de déploiement ;
- passage de l’application et du Bridge à la version `1.0.0`.

### Supprimé

- mécanismes de migration et alias associés aux identités antérieures.

## [0.24.0] - 2026-08-29

### Ajouté

- module d’accès aux forfaits dans le header lorsque la gestion avancée des sorties audio n’est pas disponible ;
- libellés adaptés à la démonstration, au forfait gratuit, à la période d’essai et aux accès restreints.

### Modifié

- placement du module de sortie audio à gauche du volume du son suivant sur toutes les largeurs d’écran ;
- disponibilité de la gestion avancée des sorties audio à partir de l’activation payante, après la période d’essai ;
- masquage des contrôles de sortie dans les paramètres pour les accès sans forfait payant actif ;
- passage de l’application à la version `0.24.0`.

## [0.23.0] - 2026-08-29

### Ajouté

- réglette fine au-dessus du header avec le nom complet et la couleur de chaque sortie physique ;
- identification explicite de la sortie principale dans la réglette ;
- mise à jour automatique et signée de SonoRiva Bridge 0.5.0 depuis les publications GitHub.

### Modifié

- élargissement du sélecteur de sortie principal et retrait de la légende compacte qui comprimait le header ;
- report de l’installation d’une mise à jour du Bridge lorsqu’une lecture audio est active ;
- passage de l’application à la version `0.23.0` et du bridge à la version `0.5.0`.

## [0.22.0] - 2026-08-29

### Ajouté

- légende des couleurs et des noms des sorties physiques dans la barre de régie ;
- taille totale des fichiers audio du cache dans la fenêtre de SonoRiva Bridge ;
- fond d’installation macOS bilingue avec représentation du glisser-déposer et chemin d’ouverture d’une application non notariée.

### Corrigé

- suppression du petit Play qui répétait la sortie déjà affectée au grand Play ;
- anneau du grand Play coloré selon la sortie principale ;
- alignement inférieur des petits Plays pour éviter le témoin de préchargement.

### Modifié

- passage de l’application à la version `0.22.0` et du bridge à la version `0.4.0`.

## [0.21.0] - 2026-08-29

### Ajouté

- boutons Play colorés par sortie physique sur chaque morceau lorsque plusieurs sorties sont disponibles ;
- indication colorée de la sortie utilisée par chaque lecture active ;
- changement de sortie pendant la lecture avec conservation de la position et des réglages ;
- API locale de routage par lecture dans SonoRiva Bridge 0.3.0.

### Modifié

- exclusion de l’alias « sortie système par défaut » du comptage des sorties physiques ;
- passage de l’application à la version `0.21.0` et du bridge à la version `0.3.0`.

## [0.20.0] - 2026-08-29

### Ajouté

- détection automatique de SonoRiva Bridge depuis la barre de régie ;
- LED d’état pour distinguer Bridge fermé, détecté, prêt et actif ;
- commandes compactes pour associer, ouvrir, activer, désactiver ou actualiser le Bridge ;
- logique de connexion partagée entre la barre de régie et les paramètres.

### Modifié

- passage de l’application à la version `0.20.0`.

## [0.19.1] - 2026-08-29

### Corrigé

- récupération de la clé locale par le navigateur à la fin de l’association avec SonoRiva Bridge ;
- consommation atomique du ticket avant l’effacement de sa clé à usage unique ;
- maintien du refus des tentatives de récupération ultérieures.

## [0.19.0] - 2026-08-29

### Ajouté

- grand sélecteur de sortie audio dans la barre de régie, à côté du volume du son suivant ;
- affichage direct de la sortie Web Audio ou de la sortie principale du Bridge ;
- état d’alerte lorsqu’une sortie enregistrée disparaît ou lorsque le Bridge est indisponible ;
- notification interne des changements de routage audio entre les réglages et la barre de régie.

### Modifié

- passage de l’application à la version `0.19.0`.

## [0.18.0] - 2026-08-29

### Ajouté

- droit SonoRiva Bridge calculé automatiquement à partir du prix et de l’état d’accès du forfait ;
- contrôle du droit Bridge lors de l’association, des requêtes natives et de l’ouverture de la page de téléchargement ;
- indication `bridgeIncluded` dans l’API publique des forfaits ;
- mention de SonoRiva Bridge sur les cartes tarifaires du site WordPress ;
- source et script de déploiement du bloc WordPress des forfaits.

### Modifié

- masquage des commandes d’association et de téléchargement pour les forfaits gratuits ;
- retour au moteur Navigateur et oubli de l’association locale lorsqu’un compte perd le droit Bridge ;
- suppression de l’association locale lors de la déconnexion ;
- passage de l’application à la version `0.18.0`.

## [0.17.0] - 2026-08-29

### Ajouté

- application SonoRiva Bridge pour Windows x64 avec installateur NSIS ;
- stockage sécurisé du jeton d’appareil et de la clé locale dans le Gestionnaire d’identification Windows ;
- transmission des liens d’association à l’instance du bridge déjà ouverte ;
- compilation et tests du bridge sur un runner Windows dédié ;
- icône d’application aux formats macOS et Windows.

### Modifié

- publication simultanée des paquets macOS Apple Silicon, macOS Intel et Windows x64 ;
- adaptation du cache audio au remplacement de fichiers sous Windows ;
- affichage de la plateforme Windows dans la liste des bridges associés ;
- passage de l’application à la version `0.17.0` et du bridge à la version `0.2.0`.

## [0.16.1] - 2026-08-29

### Ajouté

- publication de SonoRiva Bridge dans les Releases GitHub ;
- images disque distinctes pour les Mac Apple Silicon et Intel ;
- lien de téléchargement dans les paramètres audio de SonoRiva.

### Modifié

- application d’une signature macOS ad hoc sans certificat Apple Developer ni notarisation ;
- passage de l’application à la version `0.16.1`.

## [0.16.0] - 2026-08-29

### Ajouté

- application macOS SonoRiva Bridge fondée sur Tauri, CPAL et Rodio ;
- association par lien natif `sonoriva-bridge://` et ticket serveur temporaire à usage unique ;
- jeton d’appareil conservé dans le trousseau macOS et révocable depuis SonoRiva ;
- serveur local sur `127.0.0.1:43821` protégé par une clé propre au navigateur associé ;
- cache natif des fichiers audio compressés avec synchronisation complète d’un spectacle ;
- sorties distinctes pour la régie principale et la préécoute ;
- pilotage natif des lectures, fondus, pauses, volumes, boucles, positions et arrêts.

### Modifié

- ajout du choix entre le moteur Navigateur et SonoRiva Bridge dans les paramètres ;
- maintien de Web Audio comme moteur par défaut et fonctionnement complet sans bridge ;
- ajout d’API serveur dédiées aux appareils associés, manifestes et téléchargements audio ;
- passage de l’application à la version `0.16.0`.

## [0.15.0] - 2026-08-28

### Ajouté

- sélection d’un périphérique de sortie dans **Paramètres → Sortie audio** ;
- application de la sortie aux lectures de la régie, à la préécoute de l’éditeur et à la préécoute Freesound ;
- actualisation de la liste lors de la connexion ou de la déconnexion d’un périphérique ;
- ouverture du sélecteur natif du navigateur lorsqu’il est disponible ;
- mémorisation locale du périphérique choisi.

### Modifié

- retour automatique à la sortie système lorsqu’une préférence enregistrée ne peut plus être appliquée ;
- affichage de la limite du navigateur lorsque la sélection de sortie Web Audio n’est pas disponible ;
- passage de l’application à la version `0.15.0`.

## [0.14.0] - 2026-08-28

### Ajouté

- activation immédiate d’un forfait gratuit sans client, abonnement ni moyen de paiement Stripe ;
- détection explicite des forfaits dont tous les tarifs renseignés valent `0 €` ;
- activation d’un forfait gratuit depuis les paramètres d’un compte sans abonnement Stripe ;
- indication publique du caractère gratuit de chaque forfait.

### Modifié

- adaptation du formulaire d’inscription pour distinguer les offres gratuites et payantes ;
- conservation du parcours Stripe Checkout uniquement pour les forfaits payants ;
- passage de l’application à la version `0.14.0`.

## [0.13.0] - 2026-08-27

### Ajouté

- sélection du forfait et de la périodicité dans le formulaire de création de compte ;
- ouverture immédiate de Stripe Checkout après l’inscription ;
- enregistrement obligatoire du moyen de paiement avant l’ouverture de l’accès d’essai ;
- reprise de la souscription depuis les paramètres après l’annulation d’un Checkout.

### Modifié

- démarrage de l’essai lors de la création de l’abonnement Stripe ;
- première échéance à la fin de la durée d’essai configurée pour le forfait ;
- passage de l’application à la version `0.13.0`.

## [0.12.0] - 2026-08-26

### Ajouté

- intégration de Stripe Billing avec le SDK Node officiel et Checkout hébergé ;
- souscription mensuelle ou annuelle depuis les paramètres de l’application ;
- portail Stripe pour les factures, les moyens de paiement et la résiliation ;
- synchronisation signée et idempotente des événements Checkout, abonnements et factures ;
- catalogue Stripe distinct pour les environnements de test et de production ;
- création de nouveaux tarifs Stripe lors d’un changement de montant ;
- rapprochement périodique et commande manuelle par compte ;
- délai de grâce configurable après un paiement en échec ;
- journal technique des événements Stripe et journal d’audit des changements de droits.

### Sécurité

- sélection des tarifs exclusivement côté serveur ;
- attribution des droits exclusivement après traitement d’un webhook vérifié ;
- refus d’une clé Stripe dont le mode ne correspond pas à `STRIPE_MODE` ;
- conservation des clés et secrets de webhook hors du dépôt.

### Modifié

- passage de l’application à la version `0.12.0`.

## [0.11.0] - 2026-08-26

### Ajouté

- réglage local **Installer automatiquement** dans les paramètres de l’application ;
- installation automatique d’un service worker en attente dès qu’aucun son n’est en lecture ;
- flux de notes de version distinct pour l’administration commerciale ;
- rubrique **Documentation** protégée dans le dashboard `/admin` ;
- API administrative en lecture seule sous `/api/admin/releases`.

### Modifié

- retrait des versions commerciales du flux de nouveautés de la régie ;
- retrait de l’administration commerciale, de ses versions et de ses pages du site documentaire public ;
- masquage de la bannière et de l’ouverture automatique des nouveautés lorsque l’installation automatique est activée ;
- passage de l’application à la version `0.11.0`.

## [0.10.1] - 2026-08-25

### Modifié

- masquage de la bannière de mise à jour dans les espaces de démonstration ;
- masquage de la fenêtre automatique et de la rubrique **Nouveautés** dans les espaces de démonstration ;
- maintien des messages de version pour les comptes personnels ;
- passage de l’application à la version `0.10.1`.

## [0.10.0] - 2026-08-25

### Ajouté

- démonstration immédiate sous `/demo`, sans création de compte ;
- espace et session temporaires isolés pour chaque visiteur ;
- trois sons WAV préchargés dans le spectacle de démonstration ;
- réinitialisation de l’espace depuis le bandeau de démonstration ;
- suppression automatique des espaces après 24 heures d’inactivité.

### Limites

- 15 fichiers importés au maximum, hors sons préchargés ;
- 5 Mo maximum par fichier local ou importé depuis Freesound.

### Modifié

- exclusion des espaces temporaires des statistiques commerciales ;
- destination des boutons d’essai public vers `/demo` ;
- passage de l’application à la version `0.10.0`.

## [0.9.0] - 2026-08-25

### Ajouté

- réglages de visibilité publique, mise en avant et ordre d’affichage pour chaque forfait ;
- API publique en lecture seule sous `/api/public/plans` ;
- cache HTTP de la réponse publique ;
- bloc WordPress dynamique **Forfaits SonoRiva** ;
- cache WordPress de cinq minutes avec repli sur la dernière réponse valide.

### Modifié

- publication initiale du forfait par défaut existant ;
- remplacement de la carte tarifaire statique de la page d’accueil WordPress ;
- passage de l’application à la version `0.9.0`.

## [0.8.0] - 2026-08-25

### Ajouté

- synthèse des forfaits configurés, actifs, attribués et par défaut dans le tableau de bord ;
- nombre de comptes associés à chaque forfait ;
- duplication d’un forfait avec reprise de ses réglages commerciaux ;
- suppression des forfaits inutilisés et non définis par défaut ;
- résumé du prix, du quota et de la durée d’essai lors de l’attribution d’un forfait à un compte ;
- journalisation de la suppression d’un forfait.

### Modifié

- nouvelle présentation du catalogue des forfaits et de leurs états ;
- validation renforcée du forfait par défaut ;
- passage de l’application à la version `0.8.0`.

## [0.7.0] - 2026-08-25

### Ajouté

- demande de réinitialisation du mot de passe depuis la page de connexion ;
- envoi d’un lien temporaire et à usage unique par e-mail ;
- formulaire public de définition du nouveau mot de passe sous `/reset-password` ;
- invalidation des anciennes sessions après la modification du mot de passe ;
- limitation du nombre de demandes et réponse uniforme pour empêcher l’identification des comptes.

### Modifié

- passage de l’application à la version `0.7.0`.

## [0.6.0] - 2026-08-25

### Modifié

- mise en ligne du site WordPress sur `sonoriva.fr` ;
- déplacement de l’application, de l’API, de l’administration et de la documentation sur `app.sonoriva.fr` ;
- redirection de `www.sonoriva.fr` vers le domaine principal ;
- suppression des références publiques à l’ancienne édition Community ;
- passage de l’application à la version `0.6.0`.

## [0.5.0] - 2026-08-25

### Ajouté

- tableau de bord commercial intégré sous `/admin` ;
- gestion des comptes, utilisateurs, rôles de plateforme, forfaits, quotas et essais ;
- modèle d’abonnement indépendant du prestataire de paiement ;
- journal d’audit des modifications administratives ;
- contrôle centralisé des écritures selon l’état d’accès du compte ;
- configuration `SUPER_ADMIN_EMAILS` pour la création des premiers super-administrateurs.

### Modifié

- suppression du mode Community et des paramètres `SAAS_MODE`, `TRIAL_DAYS` et `TRIAL_STORAGE_BYTES` ;
- attribution systématique du forfait commercial par défaut aux nouveaux comptes ;
- passage de l’application à la version `0.5.0`.

## [0.4.0] - 2026-08-25

### Modifié

- nouvelle identité globale **SonoRiva**, accompagnée de la signature « Play sound. Play the scene. » ;
- renommage de l’application, de la PWA, de la documentation, du dépôt, des domaines et des chemins de déploiement ;
- nouveau monogramme `SR` dans l’interface et les icônes.

### Migration

- reprise automatique des préférences navigateur enregistrées sous les anciennes clés `s1-*` ;
- transfert du cache audio hors ligne existant vers le cache SonoRiva ;
- prise en charge transitoire de l’ancien cookie de session afin de conserver les connexions valides.
- compatibilité CORS transitoire pour les PWA et télécommandes ouvertes depuis l’ancienne adresse.

## [0.3.0] - 2026-08-25

### Ajouté

- centre de documentation public intégré au déploiement de SonoRiva ;
- recherche locale, navigation thématique et design aux couleurs de SonoRiva ;
- guides de prise en main, préparation, import, mode hors ligne et télécommande ;
- référence des formats, raccourcis, dépannage et installation Community ;
- accès à la documentation depuis les paramètres, les notes de version et le site WordPress ;
- vérification automatique de la page de documentation associée à chaque publication.

### Modifié

- passage de l’application à la version `0.3.0` ;
- le build de production compile désormais l’application, la documentation et le serveur.

## [0.2.0] - 2026-08-25

### Ajouté

- fenêtre « Nouveautés » affichée une seule fois par utilisateur ;
- notes de version accessibles depuis les paramètres avec un badge non lu ;
- détection d’une nouvelle PWA avec installation choisie par l’utilisateur ;
- blocage de l’actualisation tant qu’une lecture audio est active ;
- numéro de version exposé par `/api/version` et `/api/health` ;
- sauvegarde PostgreSQL avant les migrations de production.

### Modifié

- passage de l’application à la version `0.2.0` ;
- activation d’un nouveau service worker uniquement après confirmation.

## [0.1.0] - 2026-08-24

- première version publique de SonoRiva ;
- régie sonore, projets, catégories, playlists, import et fonctionnement hors ligne.
