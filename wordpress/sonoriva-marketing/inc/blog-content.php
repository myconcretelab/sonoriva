<?php
/**
 * Versioned editorial content for the SonoRiva blog.
 *
 * @package SonoRiva_Marketing
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Return the articles published by the deployment script.
 *
 * @return array<string, array<string, string>>
 */
function sonoriva_marketing_blog_articles(): array
{
    return [
        'soundboard-cloud-theatre-2026' => [
            'title' => 'Pourquoi choisir un soundboard cloud pour le théâtre en 2026 ?',
            'date' => '2026-01-22 10:00:00',
            'excerpt' => 'Comparaison concrète entre régie son cloud et logiciel installé : mobilité, préparation, mode hors ligne, sorties audio et limites à connaître.',
            'category' => 'Régie son',
            'image' => 'app-regie-full.png',
            'image_alt' => 'Interface de régie son SonoRiva avec catégories et morceaux',
            'content' => <<<'HTML'
<!-- wp:paragraph {"className":"blog-lead"} -->
<p class="blog-lead">Un soundboard cloud déplace le projet de régie hors d’un ordinateur unique : les sons, les catégories et les réglages sont conservés sur un service accessible depuis un navigateur. Pour une compagnie de théâtre, ce choix change surtout la préparation, le remplacement du matériel et la circulation du spectacle entre les lieux.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Ce que « cloud » change réellement en régie</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Avec un logiciel installé, le poste de régie contient généralement l’application, le projet et parfois les médias. Une copie sur une autre machine demande alors de transférer la bonne version du projet et tous les fichiers associés. Une régie cloud conserve le spectacle côté serveur. Après connexion, un autre appareil retrouve la structure du spectacle et ses médias sans déplacement manuel de dossier.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Dans SonoRiva, un spectacle regroupe ses sons, ses catégories, ses sous-catégories, ses couleurs, ses playlists et ses réglages. Cette organisation est indépendante de l’ordinateur utilisé. Les préférences purement locales, comme certaines dispositions de l’espace de travail, restent en revanche liées au navigateur et à l’utilisateur.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Les avantages pour une production théâtrale</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><li><strong>Préparer hors de la salle :</strong> le montage des catégories, l’import des médias et le réglage des fondus peuvent commencer sur un ordinateur de bureau, puis le spectacle est rouvert en régie.</li><li><strong>Changer de machine :</strong> si un poste devient indisponible, le projet n’est pas enfermé dans son disque. Une connexion au compte permet de le retrouver sur un autre appareil.</li><li><strong>Partager un spectacle :</strong> les utilisateurs autorisés d’un même compte peuvent accéder au même spectacle. Les modifications portent sur un projet commun, sans recopier les fichiers.</li><li><strong>Limiter les écarts de version :</strong> les catégories et les réglages ne circulent plus sous forme de dossiers nommés « final », « final-2 » ou « dernière-version ».</li><li><strong>Utiliser une interface adaptée à la scène :</strong> la grille de sons, les playlists, le départ rapide et les lectures simultanées restent réunis dans le navigateur.</li></ul>
<!-- /wp:list -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Cloud ne veut pas dire dépendance permanente au réseau</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Une connexion reste nécessaire pour importer des médias, enregistrer des modifications ou ouvrir le projet sur un nouvel appareil. Pour la représentation, SonoRiva peut rendre un spectacle disponible hors ligne. Les fichiers audio et les dernières données consultées sont alors conservés dans le cache du navigateur de l’appareil préparé.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Ce cache est local : préparer le spectacle hors ligne sur l’ordinateur A ne le télécharge pas automatiquement sur l’ordinateur B. Chaque poste destiné à prendre le relais doit donc charger le spectacle et terminer sa propre mise en cache pendant qu’une connexion est disponible.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Navigateur seul ou Bridge pour les sorties audio ?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Pour une diffusion simple, la sortie audio du navigateur peut suffire. Le décodage dépend alors des codecs fournis par le navigateur et le système. Si la régie exige plusieurs sorties physiques, un routage précis ou un cache local géré par l’ordinateur, SonoRiva Bridge complète l’application web sur macOS et Windows.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Le choix ne se résume donc pas à « web contre logiciel ». Il peut être hybride : projet et interface dans le cloud, moteur local lorsque la configuration audio de la salle le demande.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Quand un soundboard cloud est pertinent</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Cette organisation convient particulièrement aux compagnies itinérantes, aux petites équipes qui préparent depuis plusieurs lieux, aux ateliers d’improvisation et aux spectacles amenés à changer régulièrement de technicien. Elle est moins adaptée à une situation où aucun appareil ne peut être connecté avant la représentation et où aucun cache hors ligne n’a été préparé.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Le critère décisif est simple : la régie doit-elle rester attachée à une machine, ou au spectacle lui-même ? Un soundboard cloud place le spectacle au centre, tout en laissant le choix entre lecture web et moteur audio local.</p>
<!-- /wp:paragraph -->
HTML,
        ],
        'regie-son-sans-installer-logiciel' => [
            'title' => 'Comment gérer sa régie son sans installer de logiciel',
            'date' => '2026-03-12 10:00:00',
            'excerpt' => 'Préparer et lancer les sons d’un spectacle depuis un navigateur : fonctionnement, formats, organisation, lecture et cas où un composant local reste utile.',
            'category' => 'Guide pratique',
            'image' => 'app-dashboard.png',
            'image_alt' => 'Tableau de bord SonoRiva ouvert dans un navigateur',
            'content' => <<<'HTML'
<!-- wp:paragraph {"className":"blog-lead"} -->
<p class="blog-lead">Une régie son peut fonctionner directement dans un navigateur moderne. Le navigateur affiche le soundboard, charge les médias et utilise les fonctions audio de l’appareil. Cette approche évite l’installation d’une application pour les configurations simples, tout en conservant une option locale pour les sorties audio avancées.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">1. Créer le spectacle dans le navigateur</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Dans SonoRiva, chaque spectacle possède sa propre bibliothèque. Il est possible d’importer un fichier, plusieurs fichiers à la fois, un dossier avec ses sous-dossiers, des sons issus de Freesound ou un projet SoundShow au format <code>.ssp</code>. Les fichiers audio acceptés comprennent notamment MP3, WAV, OGG, FLAC, M4A et AAC, dans la limite de 250 Mo par fichier.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Le navigateur mesure la durée du média, puis l’envoie vers le stockage du compte. Pour un dossier, SonoRiva peut transformer le premier niveau de sous-dossiers en catégories, en sous-catégories ou en tags. Cette étape permet de reprendre une arborescence déjà utilisée par la compagnie.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">2. Organiser les sons pour la conduite</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Les catégories séparent les ambiances, musiques, ponctuations et effets. Les sous-catégories regroupent plusieurs variantes sans occuper toute la grille. Les tags servent à retrouver un son par fonction, personnage, scène ou intention. Le mode Cartes favorise le déclenchement visuel ; le mode Liste affiche davantage de morceaux dans le même espace.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Une playlist convient à une conduite séquentielle. Chaque rangée peut contenir un ou plusieurs morceaux démarrant ensemble. Un silence ou un fondu enchaîné peut séparer deux rangées. Pour les sons à appeler immédiatement, la zone de départ rapide garde une sélection à portée de main et peut les précharger sans commencer la lecture.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">3. Régler la lecture</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><li>Définir le volume du morceau.</li><li>Ajouter un fondu d’entrée ou de sortie.</li><li>Choisir une boucle lorsque l’ambiance doit se prolonger.</li><li>Définir des points d’entrée et de sortie.</li><li>Attribuer un raccourci clavier.</li><li>Limiter le nombre de lectures simultanées selon le spectacle.</li></ul>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>La colonne des lectures en cours affiche les morceaux actifs et leurs commandes. La multi-lecture permet de superposer une ambiance, une musique et des ponctuations sans interrompre automatiquement la piste précédente.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">4. Préparer le fonctionnement hors ligne</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Depuis les paramètres de la bibliothèque, la commande de disponibilité hors ligne télécharge les fichiers du spectacle dans le cache du navigateur. Une fois la progression terminée, les médias présents dans ce cache sont lus localement. Les imports et les modifications restent des opérations serveur et ne sont pas disponibles pendant une coupure réseau.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Le stockage dépend du navigateur, de son profil et de l’espace disponible sur l’appareil. Supprimer les données du site supprime aussi cette copie locale. Le cache hors ligne facilite la lecture ; il ne remplace pas le stockage du projet sur le serveur.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Quand faut-il tout de même utiliser SonoRiva Bridge ?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le navigateur envoie le son vers la sortie système habituelle. Une régie qui doit adresser plusieurs sorties d’une interface audio nécessite davantage de contrôle. SonoRiva Bridge fournit ce lien local sur macOS et Windows. L’interface de travail reste celle de SonoRiva, mais la lecture et le routage passent par le moteur local.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Sans installation convient donc aux répétitions, ateliers, petites salles et configurations stéréo simples. Bridge répond aux dispositifs où la diffusion doit être répartie entre plusieurs destinations physiques.</p>
<!-- /wp:paragraph -->
HTML,
        ],
        'panne-ordinateur-balance-regie-cloud' => [
            'title' => 'Panne d’ordinateur en pleine balance : reprendre sa régie grâce au cloud',
            'date' => '2026-05-07 10:00:00',
            'excerpt' => 'Un scénario de reprise concret pour rouvrir un spectacle sur un autre ordinateur ou un smartphone, avec les vérifications audio indispensables.',
            'category' => 'Continuité de régie',
            'image' => 'app-track-settings.png',
            'image_alt' => 'Réglages d’un morceau dans la régie SonoRiva',
            'content' => <<<'HTML'
<!-- wp:paragraph {"className":"blog-lead"} -->
<p class="blog-lead">La balance est commencée, les niveaux sont réglés, puis l’ordinateur de régie s’arrête. Si le spectacle est stocké uniquement sur cette machine, la reprise dépend d’une sauvegarde locale complète. Avec une régie cloud, le projet peut être rouvert depuis un autre appareil. Le remplacement du matériel audio demande néanmoins quelques vérifications.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Le scénario : le poste principal ne redémarre plus</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le spectacle contient une ambiance de salle, des musiques, des transitions et plusieurs effets courts. Les fichiers et les réglages ont été enregistrés dans SonoRiva. Un ordinateur de secours est disponible dans le lieu, et un smartphone peut servir d’accès supplémentaire si nécessaire.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>La priorité n’est pas de reconstruire la conduite. Il faut remettre en place trois éléments : l’accès au spectacle, une sortie audio exploitable et un contrôle des morceaux importants.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Étape 1 : rouvrir le spectacle</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Sur l’appareil de remplacement, ouvrez SonoRiva dans un navigateur moderne et connectez-vous. La nouvelle connexion devient la session active du compte. Sélectionnez ensuite le spectacle concerné : ses catégories, pistes, playlists et réglages sont chargés depuis le serveur.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Cette reprise exige une connexion au moment où le nouvel appareil accède au projet. Un cache hors ligne créé sur l’ordinateur en panne n’est pas transféré, car chaque cache appartient à un appareil et à un profil de navigateur précis.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Étape 2 : rétablir la chaîne audio</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le projet cloud ne déplace pas physiquement la carte son ni ses connexions. Sur l’ordinateur de secours, sélectionnez la sortie système ou reconnectez l’interface audio. Si la conduite utilisait plusieurs sorties via SonoRiva Bridge, Bridge doit être installé, ouvert et associé sur la machine de remplacement.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Un smartphone peut ouvrir l’interface et retrouver le spectacle. Sa sortie audio, ses adaptateurs et le comportement de son navigateur diffèrent toutefois de ceux d’un ordinateur. Il constitue une solution de reprise possible pour une diffusion simple, après un essai réel dans la chaîne de la salle ; il ne remplace pas automatiquement un routage multipiste.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Étape 3 : contrôler avant de relancer la balance</h2>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list"><li>Lancer un son court à faible niveau et vérifier la destination physique.</li><li>Contrôler les pistes qui utilisent une boucle, un fondu ou des points de lecture.</li><li>Vérifier les raccourcis indispensables sur le nouveau clavier.</li><li>Ouvrir la playlist et confirmer l’ordre des rangées.</li><li>Si le temps le permet, rendre le spectacle disponible hors ligne sur l’appareil de remplacement.</li></ol>
<!-- /wp:list -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Ce que le cloud récupère — et ce qu’il ne récupère pas</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le cloud permet de retrouver les médias et l’organisation du spectacle. Il évite de chercher une clé USB contenant la bonne version du projet. En revanche, il ne corrige pas une interface audio défaillante, ne reproduit pas les branchements de la salle et ne copie pas les données hors ligne vers un appareil qui n’a jamais été préparé.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>La reprise est donc plus rapide parce que la partie éditoriale de la régie est déjà disponible. Le reste relève de la chaîne de diffusion du lieu : appareil, interface, câbles et système de sonorisation.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Après la reprise</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Une fois la balance terminée, l’appareil de remplacement peut conserver sa copie hors ligne pour la représentation. Les modifications effectuées pendant la reconnexion sont enregistrées sur le spectacle dès qu’elles passent par le serveur. L’équipe repart du même projet, sans fusion manuelle de fichiers.</p>
<!-- /wp:paragraph -->
HTML,
        ],
        'guide-regie-son-improvisation-theatrale' => [
            'title' => 'Le guide de la régie son pour l’improvisation théâtrale',
            'date' => '2026-06-25 10:00:00',
            'excerpt' => 'Structurer une bibliothèque réactive pour l’impro : catégories, tags, départ rapide, boucles, fondus et lectures simultanées.',
            'category' => 'Improvisation',
            'image' => 'app-freesound.png',
            'image_alt' => 'Recherche de sons Freesound intégrée à SonoRiva',
            'content' => <<<'HTML'
<!-- wp:paragraph {"className":"blog-lead"} -->
<p class="blog-lead">En improvisation théâtrale, la régie ne suit pas toujours une conduite écrite. Elle écoute, anticipe et propose. L’enjeu principal n’est donc pas d’accumuler des milliers de sons, mais de retrouver rapidement une matière adaptée et de pouvoir la transformer pendant la scène.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Construire une bibliothèque faite pour réagir</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Une bibliothèque d’improvisation gagne à être organisée par usage plutôt que par spectacle écrit. Des catégories comme <em>lieux</em>, <em>époques</em>, <em>tensions</em>, <em>transitions</em>, <em>ponctuations</em> ou <em>musiques de fin</em> sont directement exploitables pendant le jeu. Les sous-catégories peuvent réunir plusieurs variantes : portes, téléphones, foules, moteurs ou ambiances naturelles.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Les tags ajoutent un second axe de recherche. Un même morceau peut être marqué « inquiétant », « nuit », « lent » et « boucle ». Dans SonoRiva, la recherche par tags accepte plusieurs mots et ne retourne que les morceaux correspondant à tous les termes saisis. Cela permet de croiser une intention et une texture sans parcourir chaque dossier.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Préparer les sons sans figer la scène</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le départ rapide sert de petit plateau de préparation. Pendant qu’une improvisation s’installe, le régisseur peut y déposer plusieurs sons pressentis. Le dépôt déclenche leur préchargement, mais pas leur lecture. Chaque carré reste lançable séparément, et une commande commune peut démarrer l’ensemble.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Cette zone est utile pour préparer une transition, une rupture ou une combinaison d’effets sans modifier l’organisation permanente de la bibliothèque. Elle peut aussi arrêter les lectures en cours avant le nouveau départ lorsque ce comportement est activé.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Superposer plutôt que remplacer</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Une scène peut demander une ambiance continue, une musique et plusieurs effets ponctuels. La multi-lecture permet de faire coexister ces éléments. La colonne de lecture indique ce qui joue et donne accès au volume, à la position, à la pause et à l’arrêt de chaque morceau.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>La limite de lecteurs simultanés se règle pour chaque spectacle, entre une et seize lectures. La fixer volontairement évite d’empiler des sons oubliés dans une longue improvisation.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Régler les comportements récurrents</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list"><li><strong>Ambiances :</strong> activer la boucle et prévoir un fondu de sortie.</li><li><strong>Ponctuations :</strong> conserver un départ immédiat et une durée courte.</li><li><strong>Musiques de transition :</strong> placer un point d’entrée lorsque l’introduction est trop longue.</li><li><strong>Finals :</strong> réunir plusieurs options dans une catégorie visible ou dans le départ rapide.</li><li><strong>Effets fréquemment appelés :</strong> attribuer des raccourcis clavier distincts.</li></ul>
<!-- /wp:list -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Trouver de nouvelles matières sonores</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>La recherche Freesound intégrée permet de filtrer, préécouter puis importer des sons sous licence CC0 ou CC BY. SonoRiva conserve le nom de l’auteur, la licence et l’adresse de la source lors de l’import. Les tags fournis par Freesound sont également enregistrés avec le morceau.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Adapter l’interface au rythme du spectacle</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le mode Cartes privilégie de grandes cibles visuelles. Le mode Liste augmente la densité lorsque la bibliothèque contient beaucoup de sons. Le mode automatique peut passer en liste à partir d’un nombre de morceaux défini. Sur un écran étroit, les blocs se réorganisent verticalement pour laisser accessibles les catégories, le soundboard, les lectures et la playlist.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Une régie d’improvisation efficace repose ainsi sur trois niveaux : une bibliothèque stable, une recherche transversale par tags et une petite sélection temporaire pour la scène en cours. La technologie reste au service de l’écoute, sans imposer une conduite qui n’existe pas encore.</p>
<!-- /wp:paragraph -->
HTML,
        ],
        'compagnie-theatre-tournee-synchroniser-sons-techniciens' => [
            'title' => 'Compagnie de théâtre en tournée : synchroniser les sons entre techniciens',
            'date' => '2026-08-27 10:00:00',
            'excerpt' => 'Organiser un spectacle partagé, transmettre la régie à un autre technicien et préparer chaque poste de tournée sans multiplier les copies.',
            'category' => 'Tournée',
            'image' => 'app-playlist.png',
            'image_alt' => 'Playlist de spectacle dans SonoRiva',
            'content' => <<<'HTML'
<!-- wp:paragraph {"className":"blog-lead"} -->
<p class="blog-lead">En tournée, la difficulté n’est pas seulement de transporter les sons. Il faut savoir quelle version utiliser, transmettre les modifications faites dans le lieu précédent et permettre à un autre technicien de reprendre le spectacle sans reconstruire la conduite.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Pourquoi les copies de dossiers se désynchronisent</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Un dossier envoyé avant le départ devient obsolète dès qu’un niveau, un fondu ou un ordre de playlist change. Si plusieurs techniciens modifient chacun leur copie, il faut ensuite choisir une version ou fusionner les changements à la main. Les médias identiques peuvent aussi être dupliqués inutilement sur plusieurs espaces de stockage.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Un spectacle partagé dans SonoRiva reste un objet unique. Son propriétaire autorise d’autres utilisateurs du compte à y accéder. Les participants retrouvent les mêmes sons, catégories, playlists, couleurs et réglages, sans créer une copie du spectacle ou de ses fichiers.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Transmettre la régie à un autre technicien</h2>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list"><li>Le propriétaire ouvre le partage du spectacle dans les paramètres.</li><li>Il sélectionne l’utilisateur concerné au sein du compte.</li><li>Le technicien retrouve le spectacle avec la mention « Partagé avec vous ».</li><li>Il ouvre la conduite, contrôle les médias et adapte ses préférences locales d’affichage.</li><li>Les modifications apportées au spectacle commun sont visibles par les autres participants lorsqu’ils l’ouvrent à leur tour.</li></ol>
<!-- /wp:list -->

<!-- wp:paragraph -->
<p>Le propriétaire reste le seul à pouvoir renommer le spectacle, modifier ses destinataires ou le supprimer. Le destinataire peut modifier le contenu partagé, mais ses dispositions personnalisées de l’espace de travail restent propres à son navigateur.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Comprendre la limite de session</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>SonoRiva maintient une seule session de connexion active par compte. Une nouvelle connexion remplace la précédente. Le partage sert donc à transmettre et à reprendre le même spectacle, pas à faire travailler plusieurs régies connectées simultanément avec des sessions indépendantes sur un même compte.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Pour une utilisation à distance pendant la lecture, le mode Télécommande répond à un autre besoin : un lecteur principal produit le son et un contrôleur lui envoie les commandes. Il nécessite une connexion temps réel et le même spectacle sélectionné sur les deux instances.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Préparer chaque machine avant le départ</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le partage synchronise le spectacle côté serveur, mais le cache hors ligne reste local. Chaque ordinateur susceptible d’assurer une représentation doit ouvrir le spectacle avec une connexion active puis exécuter la mise à disposition hors ligne. Les fichiers sont téléchargés dans le navigateur de ce poste uniquement.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Si la salle impose plusieurs sorties audio, SonoRiva Bridge doit également être disponible sur la machine concernée. Les correspondances entre sorties logiques et matériel physique doivent être contrôlées dans le lieu, car l’interface audio peut changer d’une date à l’autre.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Créer une version indépendante quand la tournée diverge</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Un utilisateur peut s’approprier un spectacle partagé. SonoRiva crée alors une nouvelle version privée avec les catégories, les sons, les couleurs, les playlists et leurs réglages. Les fichiers médias sont réutilisés sans duplication de stockage, mais les deux spectacles évoluent ensuite indépendamment.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Cette séparation est utile lorsqu’une distribution, une durée ou une mise en scène commence à différer durablement. Pour une simple reprise de régie sur la même production, conserver le spectacle partagé évite les branches inutiles.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Une source commune, des postes préparés localement</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>La synchronisation d’une tournée repose donc sur deux couches. Le serveur conserve la version commune du spectacle ; chaque poste de diffusion prépare localement son cache, ses sorties et ses préférences d’interface. Cette séparation permet de transmettre la conduite sans confondre le contenu artistique et la configuration technique propre à chaque lieu.</p>
<!-- /wp:paragraph -->
HTML,
        ],
    ];
}
