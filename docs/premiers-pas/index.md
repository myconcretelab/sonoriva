# Fonctionnement général

SonoRiva organise les données par compte et par spectacle. La lecture audio est exécutée dans le navigateur utilisé comme lecteur principal.

## Compte

La page de connexion propose deux opérations :

- **Se connecter** avec une adresse e-mail et un mot de passe existants ;
- **Créer un nouveau compte** avec un nom affiché, une adresse e-mail et un mot de passe d’au moins huit caractères.

Une session authentifiée donne accès aux spectacles associés au compte.

Le lien **Mot de passe oublié ?** ouvre le formulaire de demande de réinitialisation. Le message envoyé contient un lien valable pendant 30 minutes et utilisable une seule fois. Après la définition du nouveau mot de passe, toutes les sessions précédentes sont fermées.

## Spectacle

Un spectacle contient :

- des pistes audio ;
- des catégories ;
- une palette de couleurs ;
- des playlists ;
- les actions de la souris et des raccourcis clavier.

La création et la sélection s’effectuent dans **Paramètres → Spectacles**. Le spectacle sélectionné détermine le contenu affiché dans la grille.

## Piste audio

Le bouton **Ajouter un son** ouvre la fenêtre d’import. Une piste possède notamment un titre, une catégorie facultative, une couleur, un volume, un mode boucle, des points d’entrée et de sortie et des durées de fondu.

Après l’import, la carte de la piste apparaît dans la grille. L’action exécutée par un clic dépend du réglage du spectacle.

## Lecture

Une piste en cours de lecture apparaît dans la colonne **En lecture**. Cette colonne affiche la position, le volume et les commandes de pause, de boucle, de fondu sortant et d’arrêt immédiat.

Les commandes globales d’arrêt sont associées aux touches **Échap**, **Retour arrière** et **Espace**. Leur action est configurable dans les paramètres du spectacle.

## Paramètres

Les paramètres regroupent la gestion des spectacles, des couleurs, de la bibliothèque, de la [sortie audio](../reference/sortie-audio.md), du mode hors ligne, de la télécommande, des raccourcis, du compte et du stockage.

**Paramètres → Général → Apparence** propose quatre thèmes : Original, Studio, Clair — Porcelaine et Rétro — Magnétophone. Porcelaine utilise des surfaces claires, des angles courts et des ombres. Magnétophone associe des textures de bois et de métal à des boutons crème. Le choix s’applique immédiatement et reste enregistré dans ce navigateur sur cet appareil.

Dans Magnétophone, le volume du son suivant et celui des sons en lecture se règlent avec des potentiomètres : glisser vers le haut augmente le volume, glisser vers le bas le diminue. Les flèches du clavier ajustent le volume lorsque le potentiomètre a le focus ; les touches Début et Fin correspondent à 0 et 100 %. La position de lecture conserve une barre linéaire. Les commandes de lecture sont disposées à droite du potentiomètre.

Dans le module **Actions de déclenchement** du thème Magnétophone, les touches précédente et suivante parcourent les actions disponibles. La fenêtre centrale affiche l’action sélectionnée, appliquée immédiatement.

Les pages suivantes décrivent la [configuration d’un spectacle](./premier-spectacle.md) et l’[organisation des sons](../guides/organiser-un-spectacle.md).
