<?php
/**
 * Site footer.
 *
 * @package SonoRiva_Marketing
 */
?>
<footer class="site-footer">
    <div class="shell footer-grid">
        <div class="footer-brand">
            <a class="brand" href="<?php echo esc_url(home_url('/')); ?>">
                <img src="<?php echo esc_url(add_query_arg('ver', wp_get_theme()->get('Version'), get_template_directory_uri() . '/assets/images/sonoriva-mark.svg')); ?>" alt="" width="38" height="38">
                <span class="brand-lockup"><strong>SonoRiva</strong><small>Play sound. Play the scene.</small></span>
            </a>
            <p>La régie son web conçue pour celles et ceux qui font vivre la scène.</p>
        </div>
        <div class="footer-links">
            <div><strong>Produit</strong><a href="<?php echo esc_url(home_url('/#fonctionnalites')); ?>">Fonctionnalités</a><a href="<?php echo esc_url(home_url('/alternative-soundshow/')); ?>">Alternative cloud à SoundShow</a><a href="<?php echo esc_url(home_url('/#tarifs')); ?>">Offres</a><a href="https://app.sonoriva.fr">Application</a></div>
            <div><strong>Ressources</strong><a href="<?php echo esc_url(home_url('/blog/')); ?>">Blog</a><a href="https://app.sonoriva.fr/docs/">Documentation</a><a href="mailto:contact@sebastienj.com">Support</a><a href="<?php echo esc_url(home_url('/#faq')); ?>">Questions fréquentes</a></div>
            <div><strong>Légal</strong><a href="<?php echo esc_url(home_url('/confidentialite/')); ?>">Confidentialité</a><a href="<?php echo esc_url(home_url('/mentions-legales/')); ?>">Mentions légales</a></div>
        </div>
    </div>
    <div class="shell footer-bottom">
        <span>© <?php echo esc_html(wp_date('Y')); ?> SonoRiva.</span>
        <span>Fait en France pour le spectacle vivant.</span>
    </div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
