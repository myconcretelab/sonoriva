# Organisation d’un spectacle

SonoRiva utilise quatre niveaux d’organisation : spectacles, catégories, couleurs et playlists.

## Disposition de l’espace de travail

Le bouton **Disposition de l’interface** de la barre supérieure ouvre l’éditeur des cinq blocs : actions de déclenchement, catégories, soundboard, lectures en cours et playlist.

Trois modèles sont disponibles : **Régie classique**, **Playlist verticale** et **Playlist principale**. Dans chaque modèle, les lectures en cours sont placées dans la colonne gauche sous les actions de déclenchement. Le modèle **Playlist verticale** place la playlist sur toute la hauteur de la grille et utilise la largeur restante pour les catégories et le soundboard. La grille interne utilise toujours douze colonnes. Le bloc Catégories occupe au minimum trois rangées afin d’afficher ses cartes entièrement.

Le bouton **Enregistrer** associe un nom à la disposition actuelle. Les dispositions ainsi créées apparaissent dans le groupe **Mes dispositions** du sélecteur et peuvent être chargées ou supprimées depuis le même éditeur. Enregistrer de nouveau une disposition identique la renomme ; enregistrer sous un nom existant remplace son contenu. Ces configurations sont conservées localement dans le navigateur pour chaque utilisateur.

La colonne gauche est une zone de dépôt permanente. Elle peut contenir les blocs **Actions de déclenchement**, **Lectures en cours** et **Playlist**. Les blocs restés sur la grille s’étendent dans l’espace libéré.

Les modules **Actions de déclenchement** et **Playlist** possèdent une petite commande de réduction dans leur angle supérieur droit. Une fois réduit, le module devient une barre de 34 pixels affichant son icône, son titre et, pour la playlist, son nombre de morceaux. Un clic sur la barre restaure le module. Une playlist réduite se rouvre automatiquement lorsqu’un morceau y est ajouté ou déposé. L’état de chaque module est enregistré avec la disposition locale.

Dans l’éditeur, la poignée portant le nom d’un bloc permet de le déposer sur un autre bloc pour permuter leurs emplacements. Un dépôt sur le fond de la colonne gauche y ajoute un bloc compatible ; un dépôt dans une zone libre de la grille l’y replace. La poignée située dans le coin inférieur droit redimensionne les blocs de la grille. Un déplacement ou un redimensionnement qui chevaucherait un autre bloc est ignoré.

La disposition est enregistrée dans le navigateur pour l’utilisateur connecté. Sur un écran de 900 pixels de large ou moins, les actions restent dans le menu latéral et les autres blocs reprennent automatiquement un ordre vertical : catégories, soundboard, lectures en cours, playlist.

## Spectacles

Un spectacle est un espace indépendant associé au compte. Il contient ses propres médias, réglages et collections.

La section **Paramètres → Spectacles** permet de :

- créer un spectacle ;
- sélectionner le spectacle affiché ;
- modifier l’ordre par glisser-déposer ;
- supprimer un spectacle.

La suppression retire le spectacle, ses catégories, ses pistes, ses playlists et les fichiers audio qui ne sont plus référencés. Cette opération est définitive.

## Catégories

Une catégorie regroupe des pistes. La catégorie sélectionnée filtre la grille ; **Tous les sons** affiche l’ensemble des pistes du spectacle. Les cartes de catégories restent carrées et leur largeur est réglable avec la poignée située à droite de la rangée.

Les catégories possèdent un nom, une couleur et un ordre. Leur ordre est modifiable par glisser-déposer.

Le bouton crayon en haut à gauche d’une catégorie ouvre son réglage **Image de fond**. Dans les réglages d’un son, le champ **Image de fond** permet également d’importer, de remplacer ou de supprimer une image. Les modifications sont appliquées avec **Enregistrer** et conservées dans le spectacle.

Les fichiers JPEG, PNG et WebP de 10 Mo maximum sont acceptés. L’image est redimensionnée à 640 pixels maximum et compressée en JPEG. Elle remplit le fond de la carte ou de la ligne, avec un recadrage centré. Un voile sombre et un fond sombre derrière le titre blanc maintiennent sa lisibilité dans tous les thèmes.

## Affichage du soundboard

La commande **Affichage du soundboard** propose les modes **Cartes**, **Liste** et **Automatique**. Lorsque la vue correspond à une catégorie, la portée **Cette catégorie** enregistre le mode uniquement pour celle-ci. La portée **Toutes** applique le mode affiché à toutes les catégories et supprime les exceptions par catégorie. Le mode automatique utilise la liste lorsque le nombre de morceaux de la vue atteint le seuil configuré, compris entre 5 et 200 morceaux.

Le nombre de colonnes est réglé séparément pour les cartes et pour la liste. La liste accepte de une à huit colonnes sur ordinateur et de une à deux colonnes sur mobile. Chaque ligne de morceau affiche sa couleur, son bouton de lecture principal, les boutons de sorties supplémentaires disponibles, son nom, sa durée et son raccourci clavier. Ces réglages sont conservés localement pour chaque spectacle.

## Sous-catégories

Une sous-catégorie regroupe des morceaux à l’intérieur d’une catégorie parente. Elle occupe une case de la grille, quel que soit son nombre de morceaux. Sa tuile affiche son titre sur la bordure, un macaron du nombre de morceaux juste à gauche et une mosaïque de quatre aperçus.

Un clic n’importe où sur la tuile ouvre ou ferme un tiroir pleine largeur sous sa ligne. L’icône d’édition de la tuile est placée dans son angle supérieur droit et n’ouvre pas le tiroir. Les morceaux du tiroir conservent les commandes de lecture, d’édition, de sélection et de glisser-déposer des autres morceaux. Les commandes **Modifier** et **Supprimer** sont placées à gauche du titre du tiroir. La commande de fermeture du tiroir le referme également.

Le déplacement est disponible directement depuis le pied de la carte, qui affiche la durée et le raccourci. Aucun mode de réorganisation à activer :

- déposer un morceau au centre d’un morceau non groupé crée une sous-catégorie contenant les deux morceaux ;
- déposer un morceau sur une tuile de sous-catégorie ou au centre d’un morceau de son tiroir l’ajoute à ce groupe ;
- déposer un morceau dans un espace libre du tiroir ouvert l’ajoute à ce groupe ;
- déposer sur le bord gauche ou droit d’un morceau l’insère avant ou après à ce même niveau ;
- déposer un morceau du tiroir sur le bord d’un morceau de la grille principale le retire du groupe ;
- glisser la tuile d’une sous-catégorie réordonne le groupe complet ou le déplace avec ses morceaux vers une autre catégorie.

Le bouton **Nouvelle sous-catégorie** du tableau de bord crée un groupe vide. La commande **Modifier** de la tuile et du tiroir change son nom, sa couleur ou sa catégorie parente. Changer la catégorie parente déplace également ses morceaux. Supprimer une sous-catégorie conserve ses morceaux dans sa catégorie parente.

Pendant une recherche, les sous-catégories ne sont pas affichées : chaque morceau correspondant apparaît directement dans les résultats.

Les boutons de lecture, d’édition et de choix de sortie restent actifs. À la souris comme au toucher, le pied de carte sert de poignée de déplacement ; le reste de la carte conserve ses commandes habituelles. Cette poignée permet aussi d’ajouter un son à la Playlist ou au Départ rapide par glisser-déposer à la souris.

## Colonne de lecture

La colonne de lecture accepte huit lecteurs simultanés par défaut. La limite est définie séparément pour chaque spectacle dans **Paramètres → Colonne de lecture**, entre une et seize lectures. Une fois la limite atteinte, les nouveaux départs sont refusés. Abaisser la limite sous le nombre de lecteurs déjà actifs ne les arrête pas ; aucun nouveau lecteur ne démarre avant que le nombre actif repasse sous la limite.

À partir de cinq lecteurs par défaut, les cartes passent automatiquement en mode compact. Leur titre, leur position et leur volume restent à gauche, tandis que les quatre commandes sont disposées à droite sur deux lignes. Le seuil est réglable de une à seize lectures dans la même section des paramètres.

## Couleurs

La palette du spectacle fournit les couleurs disponibles pour les catégories et les pistes. Les couleurs sont ajoutées, supprimées et réordonnées dans les paramètres.

La suppression d’une couleur de la palette ne modifie pas les pistes qui utilisent déjà cette valeur.

## Tags

Chaque morceau peut contenir jusqu’à 30 tags de 40 caractères. Les tags sont ajoutés ou supprimés depuis les réglages du morceau. La touche Entrée ou une virgule valide le texte saisi.

Le switch de la barre de recherche propose deux modes : **Noms**, sélectionné par défaut, recherche dans le titre du morceau et le nom du fichier ; **Tags** recherche uniquement dans les tags. Plusieurs mots saisis en mode **Tags** doivent tous correspondre à au moins un tag du morceau.

Les tags fournis par Freesound sont enregistrés automatiquement avec les morceaux importés depuis ce service.

## Sélection et édition de plusieurs morceaux

Le bouton **Sélection multiple** du tableau de bord active la sélection des morceaux. Dans ce mode :

- un clic ou un toucher sur une carte ajoute ou retire le morceau de la sélection ;
- un glisser à la souris depuis le fond ou une carte non sélectionnée trace un rectangle et sélectionne les cartes qu’il touche ;
- glisser directement une carte sélectionnée déplace le lot vers une catégorie ou une sous-catégorie ; un dépôt sur un morceau non sélectionné crée un groupe, ou ajoute la sélection à son groupe existant ;
- les touches Maj, Ctrl ou Cmd maintenues pendant le tracé ajoutent le rectangle à la sélection existante ;
- **Tout sélectionner** sélectionne les morceaux visibles et **Effacer** vide la sélection.

Le bouton **Modifier** ouvre l’édition de lot. Chaque champ doit être coché pour être appliqué aux morceaux sélectionnés. Les champs disponibles sont la catégorie, la couleur, les tags, le volume, la lecture en boucle et les fondus d’entrée et de sortie.

Pour les tags, l’édition de lot propose trois opérations : ajouter les tags à chaque morceau, retirer les tags indiqués ou remplacer entièrement les tags existants. Une liste vide avec l’opération de remplacement supprime tous les tags.

## Playlists

Une playlist contient une suite ordonnée de rangées. Une rangée contient un ou plusieurs morceaux qui démarrent ensemble. La playlist passe à la rangée suivante lorsque le dernier morceau de la rangée courante est terminé.

Les morceaux sont ajoutés depuis la grille. Un dépôt au centre d’une rangée ajoute le morceau à son groupe. Un dépôt dans la zone fine située entre deux rangées place le morceau seul à cet emplacement. Ce second dépôt permet également de retirer un morceau d’un groupe. Pendant le déplacement d’un morceau de la grille ou de la playlist, seule la zone d’insertion survolée s’agrandit et affiche son libellé. Sans glisser-déposer actif, le survol ne l’affiche pas.

Dans une rangée groupée, la largeur disponible est répartie également entre les morceaux et aucun défilement horizontal n’est utilisé. Le survol ou le focus clavier d’un titre tronqué affiche son texte complet.

La section **Paramètres → Playlists** fixe la limite des rangées entre deux et huit morceaux pour le spectacle. La limite ne peut pas être abaissée sous la taille d’une rangée déjà enregistrée ou ouverte.

Les paramètres d’une playlist comprennent :

- l’ordre séquentiel ou aléatoire des rangées ;
- la répétition de la liste ;
- le démarrage automatique lors du chargement de la playlist ;
- un silence entre deux rangées ;
- un fondu enchaîné entre deux rangées ;
- l’affichage d’un grand bouton **Morceau suivant** sur toute la largeur du panneau.

Pause, arrêt et passage au suivant s’appliquent à tous les lecteurs de la rangée courante. Lors d’un fondu enchaîné, les morceaux encore actifs de la rangée sortante sont arrêtés ensemble tandis que la rangée suivante démarre.

Une playlist enregistrée appartient au spectacle sélectionné.

## Zone de départ rapide

Le bouton **Fusée** du Soundboard affiche ou masque la zone de départ rapide. Elle apparaît à gauche du Soundboard, sous la forme d’une bande de 20 pixels lorsqu’elle est vide. Glissez des sons depuis le Soundboard dans cette bande pour les préparer. Les vidéos ne sont pas acceptées.

Chaque carré lance son son. Le bouton **Play** en haut de la zone lance tous les sons préparés ensemble. La touche **Entrée** déclenche la même commande ; son affectation se modifie dans **Paramètres → Raccourcis clavier → Départ rapide**. Ce raccourci est inactif lorsque la zone est masquée ou vide, pendant la saisie de texte et dans les fenêtres de dialogue.

Le bouton **Options** règle la taille des carrés (mini, moyen ou grand) et leur retrait après lancement. Par défaut, les sons restent dans la zone. Le bouton **Remplacer les lectures en cours**, activé par défaut et allumé lorsqu’il est actif, arrête immédiatement les lectures existantes avant de lancer les sons préparés. Il s’applique aussi au lancement d’un carré individuel. Le bouton **Vider** retire les sons de la zone sans arrêter leur lecture.

La zone se déplace dans le mode de modification de la disposition, comme les autres modules. Les dispositions prédéfinies la replacent à gauche du Soundboard. Les sons préparés, la visibilité et les options sont mémorisés dans le navigateur, par utilisateur et par spectacle.

## Griser les sons déjà joués

Le bouton à deux coches du tableau de bord active ou désactive le grisé des sons déjà joués. Sa flèche ouvre le choix de portée : **Cette catégorie** ou **Toutes les catégories**. Sélectionner la portée, puis activer ou désactiver le marquage. Un réglage appliqué à toutes les catégories remplace les réglages individuels.

Le réglage est conservé dans ce navigateur, pour chaque spectacle. Les sons dont l’historique contient une progression apparaissent en gris avec la mention « joué ». Ils restent cliquables ; pendant une lecture, leur couleur est rétablie. La commande **Réinitialiser les progressions** efface aussi ce marquage, pour la catégorie actuelle ou tout le spectacle.
