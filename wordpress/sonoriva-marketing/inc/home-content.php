<?php
/**
 * Default editable Gutenberg content for the SonoRiva home page.
 *
 * @package SonoRiva_Marketing
 */

if (!defined('ABSPATH')) {
    exit;
}

function sonoriva_marketing_home_hero_logo_block(): string
{
    $theme_uri = esc_url(set_url_scheme(get_template_directory_uri(), 'https'));

    return <<<HTML
<!-- wp:html -->
<figure class="sr-hero-logo" data-hero-logo><img data-hero-logo-image data-src="{$theme_uri}/assets/images/logo-anime-hero-transparent.svg" alt="Logo SonoRiva animé" width="1555" height="2048"></figure>
<!-- /wp:html -->
HTML;
}

function sonoriva_marketing_migrate_home_content(string $content): string
{
    $cleaned = preg_replace(
        '~\.sr-hero-logo img\{visibility:visible\}<img[^>]*logo-anime-hero-transparent\.svg[^>]*>~',
        '',
        $content,
        1
    );
    if (is_string($cleaned)) {
        $content = $cleaned;
    }

    if (str_contains($content, 'data-hero-logo')) {
        return $content;
    }

    $hero_logo = sonoriva_marketing_home_hero_logo_block();
    $pattern = '~<!-- wp:image \{[^\n]*"className":"sr-ui-shot sr-ui-shot-hero"[^\n]*\} -->\s*<figure class="wp-block-image size-full sr-ui-shot sr-ui-shot-hero">.*?</figure>\s*<!-- /wp:image -->~s';
    $migrated = preg_replace($pattern, $hero_logo, $content, 1);

    return is_string($migrated) ? $migrated : $content;
}

function sonoriva_marketing_home_block_content(): string
{
    $theme_uri = esc_url(set_url_scheme(get_template_directory_uri(), 'https'));
    $hero_logo = sonoriva_marketing_home_hero_logo_block();

    return <<<HTML
<!-- wp:group {"align":"full","className":"sr-section sr-hero","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-hero"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-hero-grid"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-hero-grid"><!-- wp:column {"verticalAlignment":"center","width":"43%"} -->
<div class="wp-block-column is-vertically-aligned-center" style="flex-basis:43%"><!-- wp:paragraph {"className":"sr-kicker"} -->
<p class="sr-kicker">Régie son pour le spectacle vivant</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">Votre soundboard pour le théâtre et le spectacle vivant</h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"className":"sr-lead"} -->
<p class="sr-lead">SonoRiva est un soundboard en ligne pour préparer, organiser et déclencher vos sons dans le navigateur. Cette régie son accompagne le théâtre, l’improvisation, les écoles et les spectacles en tournée. Les sons préparés en cache restent disponibles lorsque le réseau devient incertain.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button {"className":"is-style-fill"} -->
<div class="wp-block-button is-style-fill"><a class="wp-block-button__link wp-element-button" href="https://app.sonoriva.fr/demo">Essayer la régie</a></div>
<!-- /wp:button -->

<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#fonctionnalites">Voir comment elle fonctionne</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

<!-- wp:paragraph {"className":"sr-note"} -->
<p class="sr-note">macOS et Windows avec SonoRiva Bridge · Démo sans installation</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->

<!-- wp:column {"verticalAlignment":"center","width":"57%"} -->
<div class="wp-block-column is-vertically-aligned-center" style="flex-basis:57%">{$hero_logo}</div>
<!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-summary","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-summary"><!-- wp:columns {"align":"wide"} -->
<div class="wp-block-columns alignwide"><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>Lire</strong><br>plusieurs sons en même temps</p><!-- /wp:paragraph --></div><!-- /wp:column -->
<!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>Préparer</strong><br>les fichiers pour une lecture locale</p><!-- /wp:paragraph --></div><!-- /wp:column -->
<!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>Organiser</strong><br>des centaines de sons sans les perdre</p><!-- /wp:paragraph --></div><!-- /wp:column -->
<!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>Router</strong><br>chaque lecture vers la bonne sortie</p><!-- /wp:paragraph --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"anchor":"fonctionnalites","align":"full","className":"sr-section sr-feature sr-feature-dark","layout":{"type":"constrained"}} -->
<div id="fonctionnalites" class="wp-block-group alignfull sr-section sr-feature sr-feature-dark"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split"><!-- wp:column {"verticalAlignment":"center","width":"42%"} -->
<div class="wp-block-column is-vertically-aligned-center" style="flex-basis:42%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">01 · Déclenchement</p><!-- /wp:paragraph -->
<!-- wp:heading --><h2 class="wp-block-heading">Une régie pensée pour la scène</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>Déclenchez instantanément plusieurs sons, remplacez une lecture, lancez un fondu ou arrêtez tout. Les actions de la souris et les raccourcis clavier se configurent selon votre conduite.</p><!-- /wp:paragraph -->
<!-- wp:list {"className":"sr-checks"} --><ul class="sr-checks"><li>Lectures simultanées et boucles</li><li>Fondus d’entrée, de sortie et enchaînés</li><li>Arrêt général, immédiat ou progressif</li><li>Actions clavier, clic gauche et clic droit configurables</li></ul><!-- /wp:list --></div>
<!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"58%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:58%"><!-- wp:image {"sizeSlug":"full","linkDestination":"none","className":"sr-ui-shot"} --><figure class="wp-block-image size-full sr-ui-shot"><img src="{$theme_uri}/assets/images/app-playlist.png" alt="Soundboard SonoRiva avec deux lectures simultanées et les actions de déclenchement configurées" width="1600" height="1050"/><figcaption class="wp-element-caption">Deux sons en lecture simultanée, visibles dans le module Lectures</figcaption></figure><!-- /wp:image --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-feature","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-feature"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split sr-split-reverse"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split sr-split-reverse"><!-- wp:column {"verticalAlignment":"center","width":"52%"} -->
<div class="wp-block-column is-vertically-aligned-center sr-offline-panel" style="flex-basis:52%"><!-- wp:group {"className":"sr-status-card","layout":{"type":"constrained"}} --><div class="wp-block-group sr-status-card"><!-- wp:paragraph {"className":"sr-status"} --><p class="sr-status">● Spectacle disponible hors ligne</p><!-- /wp:paragraph --><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Les sons sont déjà sur l’appareil.</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Le cloud prépare et organise le spectacle. Au moment du départ, le navigateur ou SonoRiva Bridge lit le fichier depuis son cache local.</p><!-- /wp:paragraph --></div><!-- /wp:group -->
<!-- wp:columns {"className":"sr-mini-steps"} --><div class="wp-block-columns sr-mini-steps"><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>1</strong><br>Préparer le cache</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>2</strong><br>Vérifier la disponibilité</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>3</strong><br>Lire localement</p><!-- /wp:paragraph --></div><!-- /wp:column --></div><!-- /wp:columns --></div>
<!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"48%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:48%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">02 · Lecture locale</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Le spectacle reste disponible quand le réseau devient incertain</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Une catégorie ou un spectacle peut être préparé dans le cache du navigateur. SonoRiva Bridge ajoute un cache audio natif pour macOS et Windows.</p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"sr-callout"} --><p class="sr-callout"><strong>Chaque départ ne dépend pas d’un téléchargement au moment critique.</strong></p><!-- /wp:paragraph --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-feature sr-feature-tint","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-feature sr-feature-tint"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split"><!-- wp:column {"verticalAlignment":"center","width":"40%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:40%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">03 · Playlists</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Des playlists plus puissantes qu’une simple liste</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Regroupez plusieurs morceaux sur une même rangée pour les déclencher ensemble. Passez ensuite à la rangée suivante automatiquement ou manuellement.</p><!-- /wp:paragraph --><!-- wp:list {"className":"sr-checks"} --><ul class="sr-checks"><li>Plusieurs sons par rangée</li><li>Enchaînement automatique ou manuel</li><li>Silence, fondu enchaîné, boucle et ordre aléatoire</li></ul><!-- /wp:list --></div><!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"60%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:60%"><!-- wp:video {"autoplay":true,"loop":true,"muted":true,"className":"sr-ui-shot sr-demo-video"} --><figure class="wp-block-video sr-ui-shot sr-demo-video"><video autoplay controls loop muted playsinline src="{$theme_uri}/assets/images/app-playlist-demo.mp4"></video><figcaption class="wp-element-caption">Une rangée lance deux sons simultanément, puis passe à la suite</figcaption></figure><!-- /wp:video --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-feature","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-feature"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split sr-split-reverse"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split sr-split-reverse"><!-- wp:column {"verticalAlignment":"center","width":"58%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:58%"><!-- wp:image {"sizeSlug":"full","linkDestination":"none","className":"sr-ui-shot"} --><figure class="wp-block-image size-full sr-ui-shot"><img src="{$theme_uri}/assets/images/app-regie-full.png" alt="Catégories colorées, filtres, sons et playlist dans l’interface SonoRiva" width="1600" height="1050"/><figcaption class="wp-element-caption">Catégories colorées, recherche cumulable et modification par lot</figcaption></figure><!-- /wp:image --></div><!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"42%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:42%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">04 · Organisation</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Retrouvez le bon son immédiatement, même au milieu de centaines de fichiers</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Classez chaque spectacle avec des catégories colorées, des sous-catégories et des tags. La recherche instantanée et la modification par lot restent accessibles depuis le soundboard.</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>L’import récursif de dossiers peut reprendre l’arborescence existante sous forme de catégories, sous-catégories ou tags.</p><!-- /wp:paragraph --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-feature sr-feature-dark","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-feature sr-feature-dark"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split"><!-- wp:column {"verticalAlignment":"center","width":"45%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:45%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">05 · Dispositions</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">La régie s’adapte à votre façon de travailler</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Déplacez, redimensionnez ou repliez les modules Catégories, Soundboard, Lectures, Playlist et Actions. Enregistrez plusieurs dispositions et passez de l’une à l’autre selon le spectacle.</p><!-- /wp:paragraph --></div><!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"55%"} --><div class="wp-block-column is-vertically-aligned-center sr-layout-diagram" style="flex-basis:55%"><!-- wp:group {"className":"sr-layout-board","layout":{"type":"constrained"}} --><div class="wp-block-group sr-layout-board"><!-- wp:columns --><div class="wp-block-columns"><!-- wp:column {"width":"34%"} --><div class="wp-block-column" style="flex-basis:34%"><!-- wp:paragraph --><p>Actions</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>Catégories</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column {"width":"66%"} --><div class="wp-block-column" style="flex-basis:66%"><!-- wp:paragraph --><p>Soundboard</p><!-- /wp:paragraph --><!-- wp:columns --><div class="wp-block-columns"><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p>Lectures</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p>Playlist</p><!-- /wp:paragraph --></div><!-- /wp:column --></div><!-- /wp:columns --></div><!-- /wp:column --></div><!-- /wp:columns --></div><!-- /wp:group --><!-- wp:paragraph {"className":"sr-layout-label"} --><p class="sr-layout-label">Modules déplaçables · redimensionnables · repliables</p><!-- /wp:paragraph --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-feature sr-bridge","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-feature sr-bridge"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split sr-split-reverse"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split sr-split-reverse"><!-- wp:column {"verticalAlignment":"center","width":"52%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:52%"><!-- wp:group {"className":"sr-routing","layout":{"type":"constrained"}} --><div class="wp-block-group sr-routing"><!-- wp:paragraph {"className":"sr-routing-title"} --><p class="sr-routing-title">Sorties audio</p><!-- /wp:paragraph --><!-- wp:columns --><div class="wp-block-columns"><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>Façade</strong><br>Sortie principale</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>Retours</strong><br>Scène</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:paragraph --><p><strong>Casque</strong><br>Préécoute</p><!-- /wp:paragraph --></div><!-- /wp:column --></div><!-- /wp:columns --><!-- wp:paragraph {"className":"sr-routing-track"} --><p class="sr-routing-track"><strong>Ambiance coulisses</strong><span> → Retours</span></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"sr-routing-track"} --><p class="sr-routing-track"><strong>Annonce public</strong><span> → Façade</span></p><!-- /wp:paragraph --></div><!-- /wp:group --></div><!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"48%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:48%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">06 · SonoRiva Bridge</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Envoyez chaque son vers la bonne sortie</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Façade, retours, coulisses ou préécoute : SonoRiva Bridge sépare les sorties principales et secondaires sur macOS et Windows.</p><!-- /wp:paragraph --><!-- wp:list {"className":"sr-checks"} --><ul class="sr-checks"><li>Lancer un son directement sur une sortie</li><li>Déplacer une lecture active sans repartir du début</li><li>Préécouter indépendamment de la façade</li><li>Conserver les fichiers dans un cache audio natif</li></ul><!-- /wp:list --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-feature sr-feature-tint","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-feature sr-feature-tint"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split"><!-- wp:column {"verticalAlignment":"center","width":"46%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:46%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">07 · Télécommande</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Déclenchez depuis un téléphone, jouez depuis la régie</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Un second appareil connecté au même spectacle envoie les commandes de lecture et d’arrêt en temps réel. L’audio continue d’être joué par la régie principale.</p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"sr-callout"} --><p class="sr-callout">Pour les répétitions, les petites compagnies et les conduites depuis la scène.</p><!-- /wp:paragraph --></div><!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"54%"} --><div class="wp-block-column is-vertically-aligned-center sr-remote-diagram" style="flex-basis:54%"><!-- wp:columns {"verticalAlignment":"center"} --><div class="wp-block-columns are-vertically-aligned-center"><!-- wp:column {"verticalAlignment":"center"} --><div class="wp-block-column is-vertically-aligned-center"><!-- wp:group {"className":"sr-device sr-device-phone","layout":{"type":"constrained"}} --><div class="wp-block-group sr-device sr-device-phone"><!-- wp:paragraph --><p>Télécommande</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>▶ Ambiance scène</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>■ Arrêter</p><!-- /wp:paragraph --></div><!-- /wp:group --></div><!-- /wp:column --><!-- wp:column {"verticalAlignment":"center","width":"16%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:16%"><!-- wp:paragraph {"align":"center","className":"sr-link"} --><p class="has-text-align-center sr-link">→</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column {"verticalAlignment":"center"} --><div class="wp-block-column is-vertically-aligned-center"><!-- wp:group {"className":"sr-device","layout":{"type":"constrained"}} --><div class="wp-block-group sr-device"><!-- wp:paragraph --><p>Régie principale</p><!-- /wp:paragraph --><!-- wp:paragraph --><p><strong>Audio joué ici</strong></p><!-- /wp:paragraph --><!-- wp:paragraph {"className":"sr-status"} --><p class="sr-status">● Connectée</p><!-- /wp:paragraph --></div><!-- /wp:group --></div><!-- /wp:column --></div><!-- /wp:columns --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-feature","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-feature"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split sr-split-reverse"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split sr-split-reverse"><!-- wp:column {"verticalAlignment":"center","width":"58%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:58%"><!-- wp:image {"sizeSlug":"full","linkDestination":"none","className":"sr-ui-shot"} --><figure class="wp-block-image size-full sr-ui-shot"><img src="{$theme_uri}/assets/images/app-track-settings.png" alt="Éditeur de forme d’onde SonoRiva avec points de début et de fin, volume, fondus et boucle" width="1600" height="1050"/><figcaption class="wp-element-caption">La préparation du son reste dans la régie</figcaption></figure><!-- /wp:image --></div><!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"42%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:42%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">08 · Préparation audio</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Préparez le cue sans ouvrir un autre logiciel</h2><!-- /wp:heading --><!-- wp:paragraph --><p>L’éditeur de forme d’onde permet de zoomer, de préécouter une sélection et de définir précisément les points de début et de fin.</p><!-- /wp:paragraph --><!-- wp:list {"className":"sr-checks"} --><ul class="sr-checks"><li>Points d’entrée et de sortie</li><li>Volume et préécoute</li><li>Boucle, fondu d’entrée et fondu de sortie</li></ul><!-- /wp:list --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-feature sr-feature-dark","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-feature sr-feature-dark"><!-- wp:columns {"verticalAlignment":"center","align":"wide","className":"sr-split"} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center sr-split"><!-- wp:column {"verticalAlignment":"center","width":"43%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:43%"><!-- wp:paragraph {"className":"sr-index"} --><p class="sr-index">09 · Import et recherche</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Reprenez l’existant, puis enrichissez-le</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Importez un projet SoundShow avec ses catégories, couleurs, boucles et points de lecture. La recherche Freesound intégrée permet ensuite de préécouter, filtrer et importer de nouveaux sons en conservant leur licence.</p><!-- /wp:paragraph --><!-- wp:columns {"className":"sr-two-facts"} --><div class="wp-block-columns sr-two-facts"><!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">SoundShow</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Import du projet et des médias compatibles</p><!-- /wp:paragraph --></div><!-- /wp:column --><!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Freesound</h3><!-- /wp:heading --><!-- wp:paragraph --><p>Recherche, préécoute, filtres et attribution</p><!-- /wp:paragraph --></div><!-- /wp:column --></div><!-- /wp:columns --></div><!-- /wp:column -->
<!-- wp:column {"verticalAlignment":"center","width":"57%"} --><div class="wp-block-column is-vertically-aligned-center" style="flex-basis:57%"><!-- wp:image {"sizeSlug":"full","linkDestination":"none","className":"sr-ui-shot"} --><figure class="wp-block-image size-full sr-ui-shot"><img src="{$theme_uri}/assets/images/app-freesound.png" alt="Recherche Freesound dans SonoRiva avec filtres, préécoute et ajout au spectacle" width="1600" height="1050"/><figcaption class="wp-element-caption">Recherche et préécoute depuis l’interface SonoRiva</figcaption></figure><!-- /wp:image --></div><!-- /wp:column --></div>
<!-- /wp:columns --></div>
<!-- /wp:group -->

<!-- wp:group {"anchor":"tarifs","align":"full","className":"sr-section sr-pricing","layout":{"type":"constrained"}} -->
<div id="tarifs" class="wp-block-group alignfull sr-section sr-pricing"><!-- wp:group {"align":"wide","className":"sr-section-head","layout":{"type":"constrained"}} --><div class="wp-block-group alignwide sr-section-head"><!-- wp:paragraph {"className":"sr-kicker"} --><p class="sr-kicker">Offres</p><!-- /wp:paragraph --><!-- wp:heading --><h2 class="wp-block-heading">Commencez dans le navigateur. Ajoutez Bridge quand vous avez besoin de plusieurs sorties.</h2><!-- /wp:heading --></div><!-- /wp:group --><!-- wp:sonoriva/plans /--></div>
<!-- /wp:group -->

<!-- wp:group {"align":"full","className":"sr-section sr-final","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull sr-section sr-final"><!-- wp:group {"align":"wide","layout":{"type":"constrained"}} --><div class="wp-block-group alignwide"><!-- wp:heading --><h2 class="wp-block-heading">Ouvrez la régie et essayez les gestes.</h2><!-- /wp:heading --><!-- wp:paragraph --><p>La démonstration utilise la véritable application SonoRiva, avec des sons prêts à déclencher.</p><!-- /wp:paragraph --><!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="https://app.sonoriva.fr/demo">Ouvrir la démo</a></div><!-- /wp:button --><!-- wp:button {"className":"is-style-outline"} --><div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="https://app.sonoriva.fr/docs/">Lire la documentation</a></div><!-- /wp:button --></div><!-- /wp:buttons --></div><!-- /wp:group --></div>
<!-- /wp:group -->
HTML;
}
