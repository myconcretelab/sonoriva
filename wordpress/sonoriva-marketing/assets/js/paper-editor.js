/* global document, MutationObserver, requestAnimationFrame, wp */

(() => {
  const watchedDocuments = new WeakSet();
  const watchedFrames = new WeakSet();
  let scheduled = false;

  const updateDocument = (doc) => {
    const wrapper = doc?.querySelector('.editor-styles-wrapper');
    const root = wrapper?.querySelector('.is-root-container');
    if (!root?.querySelector('.sr-hero')) return;

    wrapper.classList.add('sr-paper-home');
    root.classList.add('sr-landing');
    root.querySelectorAll('[data-hero-logo-image]').forEach((image) => {
      if (!image.hasAttribute('src') && image.dataset.src) {
        image.src = image.dataset.src;
      }
    });

    if (!watchedDocuments.has(doc)) {
      watchedDocuments.add(doc);
      new MutationObserver(scheduleUpdate).observe(wrapper, { childList: true, subtree: true });
    }
  };

  const update = () => {
    scheduled = false;
    updateDocument(document);
    document.querySelectorAll('iframe[name="editor-canvas"]').forEach((frame) => {
      if (!watchedFrames.has(frame)) {
        watchedFrames.add(frame);
        frame.addEventListener('load', scheduleUpdate);
      }
      updateDocument(frame.contentDocument);
    });
  };

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }

  new MutationObserver(scheduleUpdate).observe(document.body, { childList: true, subtree: true });
  wp.domReady(scheduleUpdate);
})();
