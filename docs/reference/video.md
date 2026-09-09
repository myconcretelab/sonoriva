# Projection vidéo

Les fichiers MP4 et WebM s’importent par **Ajouter un média** ou par glisser-déposer. Ils occupent le même espace de stockage que les sons. La limite habituelle est de 250 Mo par fichier ; les limites du forfait de démonstration s’appliquent à ses imports.

Les vidéos apparaissent dans les catégories existantes avec une miniature et la mention **Vidéo**. Le filtre **Médias** affiche tous les médias, les sons ou les vidéos.

## Fenêtre de projection

**Ouvrir la projection** crée une fenêtre séparée. Cette fenêtre se déplace sur l’écran de destination. Son bouton **Activer la projection en plein écran** demande le plein écran ; un double-clic sur l’image permet de le redemander.

Le navigateur peut bloquer l’ouverture de la fenêtre ou la lecture. SonoRiva affiche alors une erreur. Les vidéos se déclenchent après ouverture de la fenêtre de projection.

Un pad vidéo remplace la vidéo en cours et laisse les sons indépendants continuer. Une seule vidéo peut être projetée à la fois. Les actions Démarrer, Remplacer et Fondu enchaîné sur un pad vidéo déclenchent ce remplacement ; cette version ne superpose pas deux vidéos pour un fondu enchaîné.

La console **Projection vidéo** affiche un aperçu de la sortie, le titre et le temps restant. Elle comporte les commandes pause/reprise, arrêt et fermeture de la projection.

**Noir écran** masque l’image, sans arrêter le temps de lecture ni le son. Un second clic rétablit l’image. **Arrêter la vidéo** interrompt la vidéo et remet la projection au noir. L’arrêt général interrompt également la vidéo. Fermer la fenêtre arrête sa lecture. Une actualisation de la régie ferme la projection.

## Réglages

L’éditeur propose une prévisualisation privée, indépendante de la projection.

- **Entrée / Sortie** : début et fin de la sélection, en secondes. Une sortie vide utilise la fin du fichier.
- **Volume** : volume du son de la vidéo ; 0 % rend la vidéo muette. Le volume maître s’applique également.
- **Fondu d’entrée / sortie** : durée en millisecondes, appliquée à l’image et au son. Le fondu de sortie s’utilise lors d’un arrêt avec fondu.
- **Jouer en boucle** : reprise au point d’entrée lorsque la sélection se termine.
- **À la fin** : écran noir ou conservation de la dernière image lorsque la boucle est désactivée.

Les raccourcis de pads et la télécommande déclenchent les vidéos sur le lecteur principal, où la fenêtre de projection doit être ouverte.

## Hors ligne et limites

Le téléchargement hors ligne d’une catégorie ou d’un spectacle inclut les vidéos. L’indicateur de disponibilité apparaît une fois le téléchargement terminé. La lecture et la navigation utilisent le fichier mis en cache. Le stockage disponible dépend du navigateur et de l’appareil ; une suppression du cache retire ces fichiers.

La compatibilité dépend des codecs du fichier et du navigateur. MP4 H.264/AAC et WebM sont les formats visés. SonoRiva ne convertit pas les fichiers et ne garantit pas une résolution ou une fréquence d’images donnée. Les points de coupe et les boucles vidéo ne sont pas précis à l’image près.

Le son de la vidéo utilise la sortie système du navigateur, même si les sons utilisent SonoRiva Bridge. Les sorties vidéo multiples, le routage du son vidéo vers le Bridge et les playlists vidéo ne sont pas disponibles dans cette version.
