#!/usr/bin/env bash

set -Eeuo pipefail

readonly DEPLOY_BRANCH="main"
readonly WORDPRESS_ACCOUNT="myconcretelab"
readonly WORDPRESS_SSH_HOST="ssh-myconcretelab.alwaysdata.net"
readonly WORDPRESS_ROOT="/home/myconcretelab/www/sonoriva.fr"
readonly WORDPRESS_PLUGIN_ROOT="$WORDPRESS_ROOT/wp-content/plugins/sonoriva-plans"
readonly WORDPRESS_THEME_ROOT="$WORDPRESS_ROOT/wp-content/themes/sonoriva-marketing"
readonly WORDPRESS_SITE_URL="https://sonoriva.fr"
readonly SONORIVA_PLANS_API_URL="https://app.sonoriva.fr/api/public/plans"

fail() {
  printf 'Erreur : %s\n' "$*" >&2
  exit 1
}

for command_name in curl git php rsync ssh; do
  command -v "$command_name" >/dev/null 2>&1 || fail "la commande '$command_name' est requise."
done

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || fail "ce script doit être lancé depuis le dépôt SonoRiva."
cd "$repo_root"

current_branch=$(git branch --show-current)
[[ "$current_branch" == "$DEPLOY_BRANCH" ]] || fail "seule la branche '$DEPLOY_BRANCH' peut être déployée."
[[ -z "$(git status --porcelain)" ]] || fail "le dépôt local contient des modifications non commitées."
git fetch --quiet origin "$DEPLOY_BRANCH"
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "origin/$DEPLOY_BRANCH")" ]] || fail "HEAD n'est pas identique à origin/$DEPLOY_BRANCH."

local_plugin="$repo_root/wordpress/sonoriva-plans"
local_theme="$repo_root/wordpress/sonoriva-marketing"
while IFS= read -r php_file; do php -l "$php_file" >/dev/null; done < <(find "$local_plugin" "$local_theme" -type f -name '*.php' -print)

ssh "$WORDPRESS_ACCOUNT@$WORDPRESS_SSH_HOST" "
  set -Eeuo pipefail
  backup_dir='/home/myconcretelab/backups/sonoriva-wordpress'
  mkdir -p \"\$backup_dir\" '$WORDPRESS_PLUGIN_ROOT' '$WORDPRESS_THEME_ROOT'
  timestamp=\$(date -u +%Y%m%dT%H%M%SZ)
  tar -czf \"\$backup_dir/sonoriva-wordpress-\$timestamp.tar.gz\" -C '$WORDPRESS_ROOT/wp-content' plugins/sonoriva-plans themes/sonoriva-marketing
"

rsync -az --delete "$local_plugin/" "$WORDPRESS_ACCOUNT@$WORDPRESS_SSH_HOST:$WORDPRESS_PLUGIN_ROOT/"
rsync -az --delete "$local_theme/" "$WORDPRESS_ACCOUNT@$WORDPRESS_SSH_HOST:$WORDPRESS_THEME_ROOT/"

ssh "$WORDPRESS_ACCOUNT@$WORDPRESS_SSH_HOST" "
  set -Eeuo pipefail
  find '$WORDPRESS_PLUGIN_ROOT' '$WORDPRESS_THEME_ROOT' -type f -name '*.php' -exec php -l {} \; >/dev/null
  cd '$WORDPRESS_ROOT'
  php -r \"require 'wp-load.php'; require_once ABSPATH . 'wp-admin/includes/plugin.php'; activate_plugin('sonoriva-plans/sonoriva-plans.php'); switch_theme('sonoriva-marketing'); update_option('blog_public', '1'); update_option('WPLANG', 'fr_FR'); update_option('blogname', 'SonoRiva'); update_option('blogdescription', 'Régie son pour le spectacle vivant'); update_option('home', '$WORDPRESS_SITE_URL'); update_option('siteurl', '$WORDPRESS_SITE_URL'); if (null === get_page_by_path('alternative-soundshow', OBJECT, 'page')) { wp_insert_post(array('post_title' => 'Alternative cloud à SoundShow', 'post_name' => 'alternative-soundshow', 'post_status' => 'publish', 'post_type' => 'page', 'post_content' => '')); } \\\$front_page_id = (int) get_option('page_on_front'); \\\$front_page = \\\$front_page_id > 0 ? get_post(\\\$front_page_id) : null; if (\\\$front_page && trim((string) \\\$front_page->post_content) === '') { require_once '$WORDPRESS_THEME_ROOT/inc/home-content.php'; wp_update_post(array('ID' => \\\$front_page_id, 'post_content' => sonoriva_marketing_home_block_content())); } \\\$front_page = \\\$front_page_id > 0 ? get_post(\\\$front_page_id) : null; if (\\\$front_page) { \\\$secure_content = str_replace('http://sonoriva.fr/wp-content/themes/sonoriva-marketing', 'https://sonoriva.fr/wp-content/themes/sonoriva-marketing', (string) \\\$front_page->post_content); if (!function_exists('sonoriva_marketing_migrate_home_content')) { require_once '$WORDPRESS_THEME_ROOT/inc/home-content.php'; } \\\$migrated_content = sonoriva_marketing_migrate_home_content(\\\$secure_content); if (false === strpos(\\\$migrated_content, 'data-hero-logo') || 1 !== substr_count(\\\$migrated_content, 'logo-anime-hero-transparent.svg')) { fwrite(STDERR, 'Le bloc du logo anime n a pas pu etre normalise.' . PHP_EOL); exit(1); } if (\\\$migrated_content !== \\\$front_page->post_content) { wp_update_post(array('ID' => \\\$front_page_id, 'post_content' => \\\$migrated_content)); } } delete_transient('sonoriva_plans_api_response'); flush_rewrite_rules(false);\"
"

ssh "$WORDPRESS_ACCOUNT@$WORDPRESS_SSH_HOST" "
  set -Eeuo pipefail
  cd '$WORDPRESS_ROOT'
  php -r \"require 'wp-load.php'; require_once '$WORDPRESS_THEME_ROOT/inc/page-content.php'; require_once '$WORDPRESS_THEME_ROOT/inc/soundshow-content.php'; \\\$alternative = get_page_by_path('alternative-soundshow', OBJECT, 'page'); if (\\\$alternative && trim((string) \\\$alternative->post_content) === '') { wp_update_post(array('ID' => \\\$alternative->ID, 'post_content' => sonoriva_marketing_soundshow_block_content())); } foreach (get_pages(array('post_status' => 'publish')) as \\\$page) { if (trim((string) \\\$page->post_content) !== '' && !has_blocks(\\\$page->post_content)) { \\\$converted = sonoriva_marketing_classic_content_to_blocks(\\\$page->post_content); if (\\\$converted === \\\$page->post_content) { fwrite(STDERR, 'La page ' . \\\$page->post_name . ' ne peut pas etre convertie en blocs sans perte.' . PHP_EOL); exit(1); } wp_update_post(array('ID' => \\\$page->ID, 'post_content' => \\\$converted)); \\\$page = get_post(\\\$page->ID); } if (trim((string) \\\$page->post_content) !== '' && !has_blocks(\\\$page->post_content)) { fwrite(STDERR, 'La page ' . \\\$page->post_name . ' n est pas editable en blocs.' . PHP_EOL); exit(1); } }\"
"

ssh "$WORDPRESS_ACCOUNT@$WORDPRESS_SSH_HOST" "cd '$WORDPRESS_ROOT' && php" < "$repo_root/scripts/update-wordpress-soundboard.php"

expected_card_count=$(curl --fail --silent --show-error "$SONORIVA_PLANS_API_URL" | php -r '
  $data = json_decode(stream_get_contents(STDIN), true);
  if (!is_array($data) || !isset($data["plans"]) || !is_array($data["plans"])) exit(1);
  echo count($data["plans"]);
')

wordpress_html=''
for attempt in 1 2 3 4 5; do
  wordpress_html=$(curl --fail --silent --show-error "$WORDPRESS_SITE_URL")
  card_count=$(grep -o 'class="pricing-card[^"]*"' <<< "$wordpress_html" | wc -l | tr -d ' ' || true)
  if [[ "$card_count" -eq "$expected_card_count" ]] \
    && grep --fixed-strings --quiet 'SonoRiva Bridge pour macOS et Windows' <<< "$wordpress_html" \
    && grep --fixed-strings --quiet 'Démarrer maintenant' <<< "$wordpress_html" \
    && grep --fixed-strings --quiet 'Choisir ce forfait' <<< "$wordpress_html" \
    && grep --fixed-strings --quiet 'Essayer maintenant' <<< "$wordpress_html" \
    && grep --fixed-strings --quiet 'Votre soundboard pour le théâtre et le spectacle vivant' <<< "$wordpress_html"; then
    break
  fi
  [[ "$attempt" -eq 5 ]] || sleep 2
done

card_count=$(grep -o 'class="pricing-card[^"]*"' <<< "$wordpress_html" | wc -l | tr -d ' ' || true)
[[ "$card_count" -eq "$expected_card_count" ]] || fail "le site WordPress affiche $card_count forfait(s), alors que l’API en publie $expected_card_count."
grep --fixed-strings --quiet 'SonoRiva Bridge pour macOS et Windows' <<< "$wordpress_html" || fail "le site WordPress n’affiche pas l’information SonoRiva Bridge."
grep --fixed-strings --quiet 'Démarrer maintenant' <<< "$wordpress_html" || fail "le forfait gratuit n’affiche pas son nouveau bouton."
grep --fixed-strings --quiet 'Choisir ce forfait' <<< "$wordpress_html" || fail "les forfaits payants n’affichent pas leur nouveau bouton."
grep --fixed-strings --quiet 'Essayer maintenant' <<< "$wordpress_html" || fail "le header WordPress ne renvoie pas vers la démonstration."
grep --fixed-strings --quiet 'Votre soundboard pour le théâtre et le spectacle vivant' <<< "$wordpress_html" || fail "le contenu Gutenberg de la page d'accueil n'est pas publié."
grep --fixed-strings --quiet 'data-hero-logo' <<< "$wordpress_html" || fail "le logo animé est absent du Hero."
grep --fixed-strings --quiet 'logo-anime-hero-transparent.svg' <<< "$wordpress_html" || fail "le fichier du logo animé n'est pas relié au Hero."
grep --fixed-strings --quiet '<html lang="fr-FR">' <<< "$wordpress_html" || fail "la langue du site WordPress n'est pas déclarée en français."
grep --fixed-strings --quiet 'application/ld+json' <<< "$wordpress_html" || fail "les données structurées sont absentes de la page d'accueil."
grep --fixed-strings --quiet 'Alternative SoundShow' <<< "$wordpress_html" || fail "le lien vers la page alternative SoundShow est absent."
if grep --extended-regexp --quiet "<meta name=['\"]robots['\"][^>]*(noindex|nofollow)" <<< "$wordpress_html"; then
  fail "la page d'accueil interdit encore son indexation."
fi

comparison_html=$(curl --fail --silent --show-error "$WORDPRESS_SITE_URL/alternative-soundshow/")
grep --fixed-strings --quiet 'Alternative cloud à SoundShow' <<< "$comparison_html" || fail "la page alternative SoundShow n'est pas publiée."
grep --fixed-strings --quiet 'Import SoundShow' <<< "$comparison_html" || fail "la page alternative SoundShow ne présente pas l'import."
grep --fixed-strings --quiet 'wp-block-group alignfull comparison-hero' <<< "$comparison_html" || fail "la page alternative SoundShow n'est pas rendue depuis ses blocs Gutenberg."

robots_txt=$(curl --fail --silent --show-error "$WORDPRESS_SITE_URL/robots.txt")
grep --fixed-strings --quiet "Sitemap: $WORDPRESS_SITE_URL/wp-sitemap.xml" <<< "$robots_txt" || fail "robots.txt ne référence pas le sitemap WordPress."

sitemap_xml=$(curl --fail --silent --show-error "$WORDPRESS_SITE_URL/wp-sitemap.xml")
grep --fixed-strings --quiet "$WORDPRESS_SITE_URL/wp-sitemap-posts-page-1.xml" <<< "$sitemap_xml" || fail "l'index de sitemap WordPress ne contient pas les pages."

printf 'Site WordPress SonoRiva déployé : %s\n' "$WORDPRESS_SITE_URL"
