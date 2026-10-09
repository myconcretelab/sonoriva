import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const themeFile = (path: string) => readFileSync(new URL(`../wordpress/sonoriva-marketing/${path}`, import.meta.url), 'utf8');

describe('site de présentation WordPress', () => {
  it('applique le bleu clair du logo à tous les fonds de page hors héros', () => {
    const styles = themeFile('style.css');
    const editorStyles = themeFile('assets/css/editor.css');

    expect(styles).toContain('--page-blue: #DBEDF7');
    expect(styles).toContain('.sr-landing .sr-section:not(.sr-hero)');
    expect(styles).toContain('.comparison-page > :not(.comparison-hero)');
    expect(styles).toContain('.page-main {');
    expect(styles).toContain('.site-footer {');
    expect(styles).toContain('.sr-hero {');
    expect(styles).toContain('background: #384661;');
    expect(styles).toContain(':is(.sr-offline-panel, .sr-layout-diagram, .sr-remote-diagram, .sr-routing)');
    expect(editorStyles).toContain('background: #DBEDF7');
    expect(editorStyles).toContain('.editor-styles-wrapper .sr-hero');
  });

  it('rend les pages éditables sans remplacer un contenu déjà publié', () => {
    const homepage = themeFile('front-page.php');
    const standardPage = themeFile('page.php');
    const comparisonPage = themeFile('page-alternative-soundshow.php');
    const comparisonBlocks = themeFile('inc/soundshow-content.php');
    const functions = themeFile('functions.php');
    const deploy = readFileSync(new URL('../scripts/deploy-wordpress-plans.sh', import.meta.url), 'utf8');

    expect(homepage).toContain("apply_filters('the_content', $content)");
    expect(standardPage).toContain('the_content()');
    expect(comparisonPage).toContain("apply_filters('the_content', $content)");
    expect(comparisonPage).toContain('sonoriva_marketing_soundshow_block_content()');
    expect(comparisonBlocks.match(/<!-- wp:/g)?.length).toBeGreaterThan(30);
    expect(functions).toContain("register_block_pattern('sonoriva/alternative-soundshow'");
    expect(deploy).toContain("post_content) === ''");
    expect(deploy).toContain('sonoriva_marketing_classic_content_to_blocks');
    expect(deploy).toContain('!has_blocks');
    expect(deploy).toContain('wordpress_text=$(php -r');
    expect(themeFile('inc/home-content.php')).toContain('preg_replace_callback');
    expect(themeFile('inc/home-content.php')).toContain("$hero_logo_count === 1");
    expect(readFileSync(new URL('../scripts/update-wordpress-soundboard.php', import.meta.url), 'utf8')).toContain('wp_strip_all_tags');
  });

  it('utilise le nouveau logo et protège le menu mobile du contenu de page', () => {
    const header = themeFile('header.php');
    const mark = themeFile('assets/images/sonoriva-mark.svg');
    const styles = themeFile('style.css');

    expect(header).toContain('assets/images/sonoriva-mark.svg');
    expect(mark).toContain('viewBox="0 0 2048 2048"');
    expect(mark).toContain('<path');
    expect(mark).not.toContain('<text');
    expect(styles).toContain('body.nav-open .site-header');
    expect(styles).toContain('.primary-nav.is-open');
    expect(styles).toContain('background-color: #DBEDF7');
    expect(styles).toContain('.sr-hero-grid > .wp-block-column:last-child { display: none; }');
  });

  it('publie un blog SEO avec cinq articles factuels et datés', () => {
    const archive = themeFile('home.php');
    const single = themeFile('single.php');
    const articles = themeFile('inc/blog-content.php');
    const functions = themeFile('functions.php');
    const publisher = readFileSync(new URL('../scripts/update-wordpress-blog.php', import.meta.url), 'utf8');

    expect(articles.match(/^ {8}'[a-z0-9-]+' => \[$/gm)).toHaveLength(5);
    expect(articles).toContain("'date' => '2026-01-22 10:00:00'");
    expect(articles).toContain("'date' => '2026-08-27 10:00:00'");
    expect(articles).toContain('Ce cache est local');
    expect(articles).toContain('une seule session de connexion active par compte');
    expect(archive).toContain('Tous les articles');
    expect(single).toContain("the_content()");
    expect(functions).toContain("'@type' => $is_blog_post ? 'Article'");
    expect(functions).toContain("'datePublished'");
    expect(publisher).toContain("update_option('page_for_posts'");
    expect(publisher).toContain("'_sonoriva_editorial_source'");
  });
});
