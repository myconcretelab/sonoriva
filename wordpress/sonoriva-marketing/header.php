<?php
/**
 * Site header.
 *
 * @package SonoRiva_Marketing
 */
?><!doctype html>
<html lang="fr-FR">
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link" href="#main">Aller au contenu</a>
<header class="site-header" data-site-header>
    <div class="shell header-inner">
        <a class="brand" href="<?php echo esc_url(home_url('/')); ?>" aria-label="SonoRiva — Accueil">
            <img src="<?php echo esc_url(add_query_arg('ver', wp_get_theme()->get('Version'), get_template_directory_uri() . '/assets/images/sonoriva-mark.svg')); ?>" alt="" width="42" height="42">
            <span class="brand-lockup"><strong>SonoRiva</strong><small>Play sound. Play the scene.</small></span>
        </a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" data-nav-toggle>
            <span></span><span></span><span></span><span class="screen-reader-text">Ouvrir le menu</span>
        </button>
        <nav class="primary-nav" id="primary-nav" aria-label="Navigation principale" data-primary-nav>
            <a href="<?php echo esc_url(home_url('/#fonctionnalites')); ?>">Fonctionnalités</a>
            <a href="<?php echo esc_url(home_url('/alternative-soundshow/')); ?>">Alternative SoundShow</a>
            <a href="<?php echo esc_url(home_url('/blog/')); ?>">Blog</a>
            <a href="<?php echo esc_url(home_url('/#tarifs')); ?>">Offres</a>
            <a href="https://app.sonoriva.fr/docs/">Documentation</a>
            <a href="<?php echo esc_url(home_url('/#faq')); ?>">FAQ</a>
        </nav>
        <div class="header-actions">
            <a class="button button-small button-light" href="https://app.sonoriva.fr/demo">Essayer maintenant <span aria-hidden="true">↗</span></a>
        </div>
    </div>
</header>
