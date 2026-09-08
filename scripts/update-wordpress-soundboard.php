<?php
/** Run with PHP from the WordPress root after deploying the theme SEO update. */
require 'wp-load.php';

$id = (int) get_option('page_on_front');
$page = get_post($id);
if (!$page) {
    throw new RuntimeException('Page d’accueil introuvable.');
}
$title = 'Soundboard en ligne pour théâtre et spectacle | SonoRiva';
$description = 'Soundboard en ligne pour le théâtre et le spectacle vivant. Préparez, organisez et déclenchez vos sons dans le navigateur avec SonoRiva. Version gratuite.';
$heading = 'Votre soundboard pour le théâtre et le spectacle vivant';
$intro = 'SonoRiva est un soundboard en ligne pour préparer, organiser et déclencher vos sons dans le navigateur. Cette régie son accompagne le théâtre, l’improvisation, les écoles et les spectacles en tournée. Les sons préparés en cache restent disponibles lorsque le réseau devient incertain.';
$content = $page->post_content;
$content = str_replace([
    'Votre régie son, où que vous soyez.',
    'Vos sons prêts. Vos départs instantanés.',
], $heading, $content);
$content = str_replace([
    'SonoRiva réunit la préparation, l’organisation et la lecture des sons dans une régie web conçue pour le spectacle vivant. Elle fonctionne dans le navigateur et reste disponible localement lorsque le réseau devient incertain — au théâtre, en improvisation, en école ou en tournée.',
    'SonoRiva réunit la préparation, l’organisation et la lecture d’un spectacle dans une régie qui fonctionne dans le navigateur — et localement quand le réseau devient incertain.',
], $intro, $content);
if (substr_count($content, $heading) !== 1 || substr_count($content, $intro) !== 1) {
    throw new RuntimeException('Le contenu attendu a changé : aucune modification appliquée.');
}
if ($content !== $page->post_content) {
    wp_save_post_revision($id);
    $result = wp_update_post(wp_slash(['ID' => $id, 'post_content' => $content]), true);
    if (is_wp_error($result)) {
        throw new RuntimeException($result->get_error_message());
    }
}
update_post_meta($id, '_seopress_titles_title', $title);
update_post_meta($id, '_seopress_titles_desc', $description);
// WordPress may normalize whitespace before self-closing HTML tags on save.
$normalize = static fn(string $html): string => preg_replace('~\s*/>~', '/>', $html);
if ($normalize(get_post($id)->post_content) !== $normalize($content)
    || get_post_meta($id, '_seopress_titles_title', true) !== $title
    || get_post_meta($id, '_seopress_titles_desc', true) !== $description) {
    throw new RuntimeException('La vérification des données enregistrées a échoué.');
}
echo "Titre, description et introduction soundboard enregistrés.\n";
