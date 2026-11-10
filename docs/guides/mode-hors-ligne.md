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

Les fichiers importés sur cet appareil sont lus par le navigateur, y compris lorsque le Bridge est sélectionné. Ils utilisent la sortie du navigateur. Les autres sons continuent à utiliser le Bridge. La régie locale de Bridge 1.1.0 utilise directement le moteur natif pour ses imports audio.

Les catégories peuvent être créées, renommées, réordonnées et supprimées hors ligne. Leur dialogue permet de modifier le nom, la couleur et le fond. Les playlists peuvent être créées, modifiées, déplacées et supprimées hors ligne si le forfait les inclut. Leur composition et leurs options restent enregistrées, y compris avec des sons importés sur l’appareil. Supprimer une catégorie supprime ses sous-catégories et conserve les sons et les playlists sans catégorie.

La création et la suppression des spectacles, la gestion des sous-catégories, les alias et les autres opérations non couvertes nécessitent une connexion. Les imports de dossiers qui créent des sous-catégories nécessitent également une connexion.

## Régie locale du Bridge

Bridge 1.1.0 ou ultérieur dispose du bouton **Ouvrir la régie locale**. Cette fenêtre utilise la même interface que le site et les mêmes quatre thèmes. Elle peut être ouverte sans navigateur ni connexion Internet après préparation d’un spectacle.

Dans le navigateur, le voyant réseau propose **Préparer la régie locale** lorsque le Bridge associé est ouvert et sélectionné comme moteur. La commande **Rendre disponible hors ligne** effectue également cette préparation. L’interface, les données du spectacle, ses vidéos et ses fichiers importés sont alors conservés dans le dossier de données du Bridge. Un spectacle contenant des changements propres à la régie locale ne peut pas être remplacé par une copie du navigateur. Une copie interrompue peut reprendre si ses changements correspondent toujours à la source. Chaque nouvel import rejoint la copie native avec son fichier ; les imports déjà présents dans le Bridge sont conservés.

Dans cette fenêtre, les modifications individuelles, les catégories, les playlists et les nouveaux fichiers sont enregistrés sur disque avant confirmation. Les imports audio utilisent les sorties du Bridge. Les vidéos sont lues par la fenêtre de régie à partir des fichiers du Bridge. Les catégories et les playlists sont modifiables hors ligne.

Les données de la régie locale sont indépendantes du stockage du navigateur. **Vider le cache audio** supprime les médias téléchargés, sans effacer les fichiers importés localement ni leurs modifications en attente. La suppression du dossier de données de l’application supprime ces données locales.

Le Bridge conserve son accès local lorsque le serveur est injoignable ou que la session en ligne expire. La synchronisation nécessite un forfait Bridge actif, un appareil associé non révoqué et une session utilisateur active sur le serveur. Une reconnexion depuis le site rétablit cette session. La régie locale ne gère pas la facturation ni l’administration des utilisateurs. Les utilisateurs rattachés à plusieurs comptes ne peuvent pas synchroniser par ce mécanisme.

## Mises à jour de la régie locale

Le Bridge vérifie l’interface au démarrage ; la régie ouverte la vérifie également toutes les heures. Le téléchargement vérifie la signature du paquet, sa compatibilité et la présence de ses fichiers. Une interruption ou une signature refusée conserve l’interface installée.

Une interface téléchargée s’active à la prochaine ouverture sans lecture en cours ou avec **Mettre à jour** dans la régie. Le bouton **Revenir à l’interface précédente** dans la fenêtre du Bridge rétablit la version précédente ; la fenêtre de régie doit ensuite être fermée puis rouverte. Une interface ainsi écartée n’est pas réactivée automatiquement.

Une modification de l’interface compatible avec le moteur installé ne nécessite pas de nouvelle compilation du Bridge. Une modification du moteur ou de ses fonctions natives peut encore nécessiter une mise à jour du Bridge complet. L’installation initiale de ce mécanisme nécessite Bridge 1.1.0.

## Synchronisation

Le volet du voyant réseau affiche les changements conservés sur l’appareil. La synchronisation reprend au retour du réseau et est vérifiée toutes les quinze secondes. Le bouton **Synchroniser** relance également les envois en erreur. Les catégories sont envoyées avant les imports, puis les playlists ; les suppressions de catégories interviennent ensuite. Les imports et créations interrompus sont renvoyés avec le même identifiant pour éviter les doublons.

Si un même réglage a changé sur le serveur, si un élément a été supprimé ailleurs ou si le contenu d’une catégorie à supprimer a changé, les changements locaux sont conservés et le volet propose **Garder mes changements** ou **Utiliser la version en ligne**. Les changements sur des réglages indépendants sont conservés ensemble. Une limite de stockage serveur ou un refus d’accès laisse les fichiers et les changements locaux en attente.

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
