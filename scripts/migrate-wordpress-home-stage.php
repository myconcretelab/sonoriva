<?php
/** One-time migration of the published stage into an editable Gutenberg image block. */

require 'wp-load.php';
require_once get_template_directory() . '/inc/home-content.php';

if (get_option('sonoriva_paper_stage_block_migrated')) {
    echo "La scène est déjà enregistrée comme bloc Gutenberg.\n";
    return;
}

$front_page_id = (int) get_option('page_on_front');
$front_page = $front_page_id > 0 ? get_post($front_page_id) : null;
if (!$front_page) {
    fwrite(STDERR, "La page d’accueil WordPress est introuvable.\n");
    exit(1);
}

$content = (string) $front_page->post_content;
$migrated = sonoriva_marketing_migrate_paper_stage_content($content);
if (substr_count($migrated, 'sr-paper-stage') !== 2) {
    fwrite(STDERR, "La scène Gutenberg n’a pas pu être insérée une seule fois.\n");
    exit(1);
}

if ($migrated !== $content) {
    $result = wp_update_post(['ID' => $front_page_id, 'post_content' => $migrated], true);
    if (is_wp_error($result)) {
        fwrite(STDERR, "L’enregistrement de la scène Gutenberg a échoué : " . $result->get_error_message() . "\n");
        exit(1);
    }
}

update_option('sonoriva_paper_stage_block_migrated', '1', false);
echo "La scène est enregistrée comme bloc Gutenberg modifiable.\n";
