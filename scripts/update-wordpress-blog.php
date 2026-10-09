<?php
/**
 * Publish the versioned SonoRiva blog content in WordPress.
 *
 * This script is executed from the WordPress root after the theme is deployed.
 */

require 'wp-load.php';
require_once get_template_directory() . '/inc/blog-content.php';

$blog_page = get_page_by_path('blog', OBJECT, 'page');
if (!$blog_page) {
    $blog_page_id = wp_insert_post([
        'post_title' => 'Blog',
        'post_name' => 'blog',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => '',
    ], true);
    if (is_wp_error($blog_page_id)) {
        fwrite(STDERR, $blog_page_id->get_error_message() . PHP_EOL);
        exit(1);
    }
} else {
    $blog_page_id = $blog_page->ID;
}

if ((int) get_option('page_on_front') > 0) {
    update_option('show_on_front', 'page');
}
update_option('page_for_posts', (int) $blog_page_id);

foreach (sonoriva_marketing_blog_articles() as $slug => $article) {
    $term = term_exists($article['category'], 'category');
    if (!$term) {
        $term = wp_insert_term($article['category'], 'category');
    }
    if (is_wp_error($term)) {
        fwrite(STDERR, $term->get_error_message() . PHP_EOL);
        exit(1);
    }
    $category_id = (int) (is_array($term) ? $term['term_id'] : $term);

    $existing = get_page_by_path($slug, OBJECT, 'post');
    $payload = [
        'post_title' => $article['title'],
        'post_name' => $slug,
        'post_status' => 'publish',
        'post_type' => 'post',
        'post_content' => $article['content'],
        'post_excerpt' => $article['excerpt'],
        'post_date' => $article['date'],
        'post_date_gmt' => get_gmt_from_date($article['date']),
        'post_category' => [$category_id],
        'comment_status' => 'closed',
        'ping_status' => 'closed',
    ];
    if ($existing) {
        $payload['ID'] = $existing->ID;
    }

    $post_id = wp_insert_post($payload, true);
    if (is_wp_error($post_id)) {
        fwrite(STDERR, $post_id->get_error_message() . PHP_EOL);
        exit(1);
    }
    update_post_meta($post_id, '_sonoriva_editorial_source', 'theme-5.4.0');
}

flush_rewrite_rules(false);
