# Mode hors ligne

Le mode hors ligne conserve l’interface, les spectacles consultés et les médias téléchargés sur l’appareil. Les réglages individuels des sons et les imports de fichiers locaux peuvent être enregistrés sans connexion pour les comptes permanents.

## Mise en cache

1. Ouvrir le spectacle concerné avec une connexion réseau active.
2. Ouvrir **Paramètres → Bibliothèque**.
3. Exécuter **Rendre disponible hors ligne**.
4. Attendre la fin de la progression.

La préparation vérifie les fichiers de l’interface, puis télécharge les médias absents. En mode navigateur, les médias sont conservés dans son cache. Avec le Bridge, les sons déjà synchronisés utilisent son cache et les vidéos utilisent celui du navigateur. Les fichiers importés localement utilisent le stockage du navigateur.

Le volet du voyant réseau affiche séparément la disponibilité de l’application et le nombre de médias présents. L’ouverture sans connexion utilise la dernière version installée de l’interface, le dernier utilisateur connecté et les spectacles déjà consultés. Une première ouverture sur un nouvel appareil ou un nouveau profil nécessite une connexion.

## Lecture

Lorsqu’un média est présent dans le cache, SonoRiva utilise cette copie locale pour la lecture. Une requête réseau reste nécessaire pour un média absent du cache.

La liste des spectacles et les dernières données consultées sont également conservées localement. Un compte de démonstration temporaire ne dispose pas du démarrage hors connexion.

## Réglages et imports locaux

L’éditeur individuel conserve localement le titre, la catégorie, le volume, la boucle, les fondus, les points d’entrée et de sortie, la couleur, les tags, l’image de fond et le comportement de fin des vidéos. L’import d’un fichier depuis l’appareil copie son contenu dans le stockage local. Ces données restent présentes après fermeture de l’application.

Les fichiers importés sur cet appareil sont lus par le navigateur, y compris lorsque le Bridge est sélectionné. Ils utilisent la sortie du navigateur. Les autres sons continuent à utiliser le Bridge. Cette version ne fournit pas encore de régie autonome dans le Bridge.

La création et la suppression des spectacles, des catégories et des playlists, les alias et les autres opérations non couvertes par l’éditeur individuel nécessitent encore une connexion. Les imports de dossiers qui créent des catégories ou sous-catégories nécessitent également une connexion.

## Synchronisation

Le volet du voyant réseau affiche les changements conservés sur l’appareil. La synchronisation reprend au retour du réseau et est vérifiée toutes les quinze secondes. Le bouton **Synchroniser** relance également les envois en erreur. Les imports interrompus sont renvoyés avec le même identifiant pour éviter de créer plusieurs exemplaires du son.

Si un même réglage a changé sur le serveur, les changements locaux sont conservés et le volet propose **Garder mes changements** ou **Utiliser la version en ligne**. Les changements sur des réglages indépendants sont conservés ensemble. Une limite de stockage serveur ou un refus d’accès laisse les fichiers et les changements locaux en attente.

La suppression d’un son ou d’un spectacle ayant des changements locaux en attente est bloquée jusqu’à leur synchronisation. Les données locales sont séparées par utilisateur.

## Périmètre du stockage

Le cache appartient :

- au navigateur utilisé ;
- au profil du navigateur ;
- à l’appareil ;
- au domaine de SonoRiva.

La mise en cache d’un spectacle sur un appareil ne le rend pas disponible sur les autres appareils. Une fenêtre privée utilise un stockage séparé qui peut être supprimé à sa fermeture.

## Suppression du cache

Les médias téléchargés disparaissent lorsque leur cache est supprimé. Les imports et les changements locaux utilisent une base distincte ; supprimer toutes les données du site les efface également. Le navigateur peut libérer des données selon sa politique de stockage. La préparation demande un stockage persistant lorsque cette fonction est disponible ; son attribution dépend du navigateur.

Le cache hors ligne est distinct du stockage serveur et ne constitue pas une copie de sauvegarde des projets.

## Forme d’onde et préécoute

L’éditeur cherche le son dans le cache du navigateur, puis dans le cache du Bridge associé (version 1.0.10 ou ultérieure). Si aucun fichier local n’est accessible, il le télécharge depuis le serveur. La forme d’onde et la préécoute Web Audio utilisent le même fichier ; elles fonctionnent sans Internet quand celui-ci est disponible localement. Le Bridge doit être ouvert pour accéder à son cache. Les anciennes versions du Bridge nécessitent un fichier déjà présent dans le cache du navigateur ou une connexion au serveur.
