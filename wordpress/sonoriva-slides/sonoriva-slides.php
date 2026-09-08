<?php
/**
 * Plugin Name: Diaporama SonoRiva
 * Description: Diaporamas élégants avec images, légendes et textes superposés dans l’éditeur de blocs.
 * Version: 1.1.0
 * Author: SonoRiva
 * Requires at least: 6.3
 */
if (!defined('ABSPATH')) { exit; }
add_action('init', function () {
    $url = plugin_dir_url(__FILE__);
    wp_register_script('sonoriva-slides-editor', $url . 'editor.js', array('wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-data'), '1.1.0', true);
    wp_register_script('sonoriva-slides-view', $url . 'view.js', array(), '1.1.0', true);
    wp_register_style('sonoriva-slides-style', $url . 'style.css', array(), '1.1.0');
    wp_register_style('sonoriva-slides-editor-style', $url . 'editor.css', array('sonoriva-slides-style'), '1.1.0');
    register_block_type(__DIR__ . '/slider', array('render_callback' => function ($attributes, $content) {
        $effect = isset($attributes['transition']) ? $attributes['transition'] : 'fade';
        if (!in_array($effect, array('fade', 'slide', 'vertical', 'zoom', 'none'), true)) { $effect = 'fade'; }
        $duration = isset($attributes['duration']) ? (int) $attributes['duration'] : 450;
        $html = new WP_HTML_Tag_Processor($content);
        if ($html->next_tag(array('class_name' => 'sr-slides'))) {
            $html->set_attribute('data-sr-transition', $effect);
            $html->set_attribute('data-sr-duration', (string) max(100, min(1500, $duration)));
        }
        return $html->get_updated_html();
    }));
    register_block_type(__DIR__ . '/slide');
});
