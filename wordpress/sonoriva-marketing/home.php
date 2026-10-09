<?php
/**
 * Blog archive.
 *
 * @package SonoRiva_Marketing
 */
get_header();
?>
<main id="main" class="blog-main">
    <header class="blog-archive-header">
        <div class="shell blog-heading">
            <p class="eyebrow">Ressources</p>
            <h1>Régie son,<br>côté scène.</h1>
            <p>Des guides et des cas concrets pour préparer, transmettre et exploiter le son d’un spectacle vivant.</p>
        </div>
    </header>
    <section class="shell blog-archive" aria-labelledby="articles-title">
        <div class="blog-section-heading">
            <h2 id="articles-title">Tous les articles</h2>
            <span><?php echo esc_html((string) $wp_query->found_posts); ?> ressources</span>
        </div>
        <?php if (have_posts()) : ?>
            <div class="blog-grid">
                <?php while (have_posts()) : the_post();
                    $image = sonoriva_marketing_blog_image((string) get_post_field('post_name', get_the_ID()));
                    ?>
                    <article <?php post_class('blog-card'); ?>>
                        <a class="blog-card-image" href="<?php the_permalink(); ?>" tabindex="-1" aria-hidden="true">
                            <img src="<?php echo esc_url($image['url']); ?>" alt="" loading="lazy" width="1600" height="1050">
                        </a>
                        <div class="blog-card-body">
                            <div class="blog-meta">
                                <span><?php echo esc_html(get_the_category()[0]->name ?? 'Régie son'); ?></span>
                                <time datetime="<?php echo esc_attr(get_the_date('c')); ?>"><?php echo esc_html(get_the_date('j F Y')); ?></time>
                            </div>
                            <h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
                            <p><?php echo esc_html(get_the_excerpt()); ?></p>
                            <a class="blog-read-link" href="<?php the_permalink(); ?>">Lire l’article <span aria-hidden="true">↗</span></a>
                        </div>
                    </article>
                <?php endwhile; ?>
            </div>
            <?php the_posts_pagination([
                'mid_size' => 1,
                'prev_text' => 'Articles précédents',
                'next_text' => 'Articles suivants',
            ]); ?>
        <?php else : ?>
            <p>Aucun article n’est publié.</p>
        <?php endif; ?>
    </section>
</main>
<?php get_footer(); ?>
