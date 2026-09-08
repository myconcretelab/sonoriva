<?php
/**
 * SonoRiva Marketing theme setup.
 *
 * @package SonoRiva_Marketing
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once get_template_directory() . '/inc/home-content.php';
require_once get_template_directory() . '/inc/page-content.php';
require_once get_template_directory() . '/inc/soundshow-content.php';

function sonoriva_marketing_setup(): void
{
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('responsive-embeds');
    add_theme_support('align-wide');
    add_theme_support('editor-styles');
    add_editor_style(['style.css', 'assets/css/editor.css', 'assets/css/editorial.css']);
    add_theme_support('html5', ['search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script']);
    register_nav_menus([
        'primary' => __('Navigation principale', 'sonoriva-marketing'),
        'footer' => __('Navigation de pied de page', 'sonoriva-marketing'),
    ]);
}
add_action('after_setup_theme', 'sonoriva_marketing_setup');

function sonoriva_marketing_register_patterns(): void
{
    if (!function_exists('register_block_pattern')) {
        return;
    }

    register_block_pattern_category('sonoriva', [
        'label' => __('SonoRiva', 'sonoriva-marketing'),
    ]);
    register_block_pattern('sonoriva/homepage', [
        'title' => __('Page d’accueil SonoRiva', 'sonoriva-marketing'),
        'description' => __('La présentation complète du produit, composée uniquement de blocs éditables.', 'sonoriva-marketing'),
        'categories' => ['sonoriva'],
        'content' => sonoriva_marketing_home_block_content(),
    ]);
    register_block_pattern('sonoriva/alternative-soundshow', [
        'title' => __('Alternative à SoundShow', 'sonoriva-marketing'),
        'description' => __('La page de comparaison et de migration SoundShow, composée de blocs éditables.', 'sonoriva-marketing'),
        'categories' => ['sonoriva'],
        'content' => sonoriva_marketing_soundshow_block_content(),
    ]);
}
add_action('init', 'sonoriva_marketing_register_patterns');

function sonoriva_marketing_assets(): void
{
    $theme = wp_get_theme();
    $version = $theme->get('Version') ?: '1.0.0';
    wp_enqueue_style('sonoriva-marketing', get_stylesheet_uri(), [], $version);
    wp_enqueue_style('sonoriva-editorial', get_template_directory_uri() . '/assets/css/editorial.css', ['sonoriva-marketing'], $version);
    wp_enqueue_script(
        'sonoriva-marketing',
        get_template_directory_uri() . '/assets/js/site.js',
        [],
        $version,
        true
    );
}
add_action('wp_enqueue_scripts', 'sonoriva_marketing_assets');

function sonoriva_marketing_document_title(string $title): string
{
    if (is_front_page()) {
        return 'Soundboard en ligne pour théâtre et spectacle | SonoRiva';
    }
    if (is_page('alternative-soundshow')) {
        return 'Alternative cloud à SoundShow | SonoRiva';
    }
    return $title;
}
add_filter('pre_get_document_title', 'sonoriva_marketing_document_title');

function sonoriva_marketing_seo_head(): void
{
    if (!is_front_page() && !is_page('alternative-soundshow')) {
        return;
    }

    $is_soundshow_page = is_page('alternative-soundshow');
    $title = $is_soundshow_page
        ? 'Alternative cloud à SoundShow | SonoRiva'
        : 'Soundboard en ligne pour théâtre et spectacle | SonoRiva';
    $description = $is_soundshow_page
        ? 'Importez un projet SoundShow dans SonoRiva et retrouvez une régie son cloud avec Freesound, multi-lecture, catégories, sorties audio et mode hors ligne.'
        : 'Soundboard en ligne pour le théâtre et le spectacle vivant. Préparez, organisez et déclenchez vos sons dans le navigateur avec SonoRiva. Version gratuite.';
    $url = $is_soundshow_page ? home_url('/alternative-soundshow/') : home_url('/');
    $image = get_template_directory_uri() . '/assets/images/app-regie-full.png';

    // SEOPress owns the description when active; retain the theme fallback otherwise.
    if (!defined('SEOPRESS_VERSION')) {
        echo '<meta name="description" content="' . esc_attr($description) . '">' . "\n";
    }
    echo '<meta name="theme-color" content="#384661">' . "\n";
    echo '<meta property="og:locale" content="fr_FR">' . "\n";
    echo '<meta property="og:site_name" content="SonoRiva">' . "\n";
    echo '<meta property="og:title" content="' . esc_attr($title) . '">' . "\n";
    echo '<meta property="og:description" content="' . esc_attr($description) . '">' . "\n";
    echo '<meta property="og:type" content="website">' . "\n";
    echo '<meta property="og:url" content="' . esc_url($url) . '">' . "\n";
    echo '<meta property="og:image" content="' . esc_url($image) . '">' . "\n";
    echo '<meta property="og:image:width" content="1600">' . "\n";
    echo '<meta property="og:image:height" content="1050">' . "\n";
    echo '<meta property="og:image:alt" content="Interface de la régie son cloud SonoRiva">' . "\n";
    echo '<meta name="twitter:card" content="summary_large_image">' . "\n";
    echo '<meta name="twitter:title" content="' . esc_attr($title) . '">' . "\n";
    echo '<meta name="twitter:description" content="' . esc_attr($description) . '">' . "\n";
    echo '<meta name="twitter:image" content="' . esc_url($image) . '">' . "\n";

    $organization_id = home_url('/#organization');
    $application_id = home_url('/#application');
    $graph = [
        [
            '@type' => 'Organization',
            '@id' => $organization_id,
            'name' => 'SonoRiva',
            'url' => home_url('/'),
            'logo' => get_template_directory_uri() . '/assets/images/sonoriva-site-icon.png',
            'email' => 'contact@sebastienj.com',
        ],
        [
            '@type' => 'WebApplication',
            '@id' => $application_id,
            'name' => 'SonoRiva',
            'url' => 'https://app.sonoriva.fr/',
            'description' => 'Régie son cloud pour le théâtre, l’improvisation, la danse et le spectacle vivant.',
            'applicationCategory' => 'MultimediaApplication',
            'operatingSystem' => 'Navigateur web moderne, macOS et Windows avec SonoRiva Bridge',
            'browserRequirements' => 'Navigateur web moderne avec prise en charge de Web Audio',
            'isAccessibleForFree' => true,
            'image' => $image,
            'screenshot' => [
                $image,
                get_template_directory_uri() . '/assets/images/app-freesound.png',
                get_template_directory_uri() . '/assets/images/app-track-settings.png',
            ],
            'featureList' => [
                'Soundboard et multi-lecture audio',
                'Recherche et import Freesound',
                'Sorties audio multiples avec SonoRiva Bridge',
                'Catégories, couleurs, cues et playlists',
                'Import de projets SoundShow',
                'Mode hors ligne et télécommande',
            ],
            'offers' => [
                '@type' => 'Offer',
                'price' => '0',
                'priceCurrency' => 'EUR',
                'availability' => 'https://schema.org/InStock',
                'url' => 'https://app.sonoriva.fr/?register=1',
            ],
            'publisher' => ['@id' => $organization_id],
        ],
        [
            '@type' => 'WebSite',
            '@id' => home_url('/#website'),
            'url' => home_url('/'),
            'name' => 'SonoRiva',
            'description' => 'Régie son cloud pour le spectacle vivant',
            'inLanguage' => 'fr-FR',
            'publisher' => ['@id' => $organization_id],
        ],
        [
            '@type' => 'WebPage',
            '@id' => $url . '#webpage',
            'url' => $url,
            'name' => $title,
            'description' => $description,
            'inLanguage' => 'fr-FR',
            'isPartOf' => ['@id' => home_url('/#website')],
            'about' => ['@id' => $application_id],
            'primaryImageOfPage' => ['@type' => 'ImageObject', 'url' => $image, 'width' => 1600, 'height' => 1050],
        ],
    ];

    if ($is_soundshow_page) {
        $graph[] = [
            '@type' => 'BreadcrumbList',
            '@id' => $url . '#breadcrumb',
            'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Accueil', 'item' => home_url('/')],
                ['@type' => 'ListItem', 'position' => 2, 'name' => 'Alternative cloud à SoundShow', 'item' => $url],
            ],
        ];
    }

    echo '<script type="application/ld+json">' . wp_json_encode([
        '@context' => 'https://schema.org',
        '@graph' => $graph,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\n";
}
add_action('wp_head', 'sonoriva_marketing_seo_head', 1);

function sonoriva_marketing_robots(array $robots): array
{
    if (!is_front_page() && !is_page('alternative-soundshow')) {
        return $robots;
    }

    unset($robots['noindex'], $robots['nofollow']);
    $robots['index'] = true;
    $robots['follow'] = true;
    $robots['max-image-preview'] = 'large';
    return $robots;
}
add_filter('wp_robots', 'sonoriva_marketing_robots', 999);

function sonoriva_marketing_robots_txt(string $output, bool $public): string
{
    if (!$public || str_contains($output, 'wp-sitemap.xml')) {
        return $output;
    }
    return rtrim($output) . "\nSitemap: " . home_url('/wp-sitemap.xml') . "\n";
}
add_filter('robots_txt', 'sonoriva_marketing_robots_txt', 10, 2);
add_filter('wp_sitemaps_enabled', '__return_true');

function sonoriva_marketing_sitemap_status(bool $preempt, WP_Query $query): bool
{
    if (!get_query_var('sitemap')) {
        return $preempt;
    }
    status_header(200);
    return true;
}
add_filter('pre_handle_404', 'sonoriva_marketing_sitemap_status', 10, 2);

function sonoriva_marketing_body_classes(array $classes): array
{
    $classes[] = 'sonoriva-site';
    if (is_page('alternative-soundshow')) {
        $classes[] = 'comparison-page-body';
    }
    return $classes;
}
add_filter('body_class', 'sonoriva_marketing_body_classes');

function sonoriva_marketing_site_icon(): string
{
    return get_template_directory_uri() . '/assets/images/sonoriva-site-icon.png';
}
add_filter('get_site_icon_url', 'sonoriva_marketing_site_icon');

/** Inline text styles in the native rich-text formatting menu. */
function sonoriva_marketing_editor_formats(): void
{
    wp_enqueue_script(
        'sonoriva-editor-formats',
        get_template_directory_uri() . '/assets/js/editor-formats.js',
        ['wp-rich-text', 'wp-block-editor', 'wp-element'],
        wp_get_theme()->get('Version'),
        true
    );
}
add_action('enqueue_block_editor_assets', 'sonoriva_marketing_editor_formats');
