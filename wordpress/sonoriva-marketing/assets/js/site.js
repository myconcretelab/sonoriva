/* global document, window, IntersectionObserver */

(function () {
  const header = document.querySelector('[data-site-header]');
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-primary-nav]');

  const syncHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 12);
  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive: true });

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav?.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
  });

  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    toggle?.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    document.body.classList.remove('nav-open');
  }));

  const startHeroLogo = () => {
    document.querySelectorAll('[data-hero-logo]').forEach((logo) => {
      const image = logo.querySelector('[data-hero-logo-image]');
      const source = image?.dataset.src;

      if (!image || !source || image.hasAttribute('src')) {
        return;
      }

      const reveal = () => logo.classList.add('is-ready');
      image.addEventListener('load', reveal, { once: true });
      image.src = source;
      image.removeAttribute('data-src');

      if (image.complete && image.naturalWidth > 0) {
        reveal();
      }
    });
  };

  if (document.readyState === 'complete') {
    startHeroLogo();
  } else {
    window.addEventListener('load', startHeroLogo, { once: true });
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });
    document.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
  } else {
    document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('is-visible'));
  }
}());
