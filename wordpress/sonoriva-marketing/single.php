<?php
/**
 * Blog article.
 *
 * @package SonoRiva_Marketing
 */
get_header();
?>
<main id="main" class="blog-main">
    <?php while (have_posts()) : the_post();
        $image = sonoriva_marketing_blog_image((string) get_post_field('post_name', get_the_ID()));
        ?>
        <article <?php post_class('blog-article'); ?>>
            <header class="shell blog-article-header">
                <nav class="blog-breadcrumb" aria-label="Fil d’Ariane">
                    <a href="<?php echo esc_url(home_url('/')); ?>">Accueil</a><span aria-hidden="true">/</span><a href="<?php echo esc_url(home_url('/blog/')); ?>">Blog</a>
                </nav>
                <div class="blog-meta">
                    <span><?php echo esc_html(get_the_category()[0]->name ?? 'Régie son'); ?></span>
                    <time datetime="<?php echo esc_attr(get_the_date('c')); ?>"><?php echo esc_html(sonoriva_marketing_article_date(get_the_ID())); ?></time>
                </div>
                <h1><?php the_title(); ?></h1>
                <p class="blog-excerpt"><?php echo esc_html(get_the_excerpt()); ?></p>
            </header>
            <figure class="shell blog-cover">
                <img src="<?php echo esc_url($image['url']); ?>" alt="<?php echo esc_attr($image['alt']); ?>" width="1600" height="1050">
            </figure>
            <div class="shell blog-article-layout">
                <aside class="blog-article-aside" aria-label="À propos de l’article">
                    <span>Publié par</span>
                    <strong>SonoRiva</strong>
                    <a href="<?php echo esc_url(home_url('/blog/')); ?>">Voir tous les articles</a>
                </aside>
                <div class="entry-content blog-content"><?php the_content(); ?></div>
            </div>
            <section class="shell blog-cta" aria-labelledby="blog-cta-title">
                <div>
                    <p class="eyebrow">Passer à la régie</p>
                    <h2 id="blog-cta-title">Préparez votre prochain spectacle dans SonoRiva.</h2>
                </div>
                <a class="button button-light" href="https://app.sonoriva.fr/demo">Ouvrir la démonstration <span aria-hidden="true">↗</span></a>
            </section>
        </article>
    <?php endwhile; ?>
</main>
<?php get_footer(); ?>
