/* The "More" menu closes with Escape, a tap or click outside it, or when focus moves out of it (website QA DP-12,
   device QA Nov 26). Plain <details>; this only closes it and keeps the open menu inside the screen. */
(function () {
  function menus() { return document.querySelectorAll('details.nav-more'); }
  function closeAll(except) {
    Array.prototype.forEach.call(document.querySelectorAll('details.nav-more[open]'), function (d) {
      if (d !== except) d.removeAttribute('open');
    });
  }
  // Keep the open menu on screen: right-aligned under More when there is room, else nudged in from the edge
  function place(d) {
    var m = d.querySelector('.nav-more-menu');
    if (!m || !d.open) return;
    m.style.left = ''; m.style.right = ''; m.style.maxWidth = '';
    var W = document.documentElement.clientWidth, pad = 8;
    m.style.maxWidth = (W - 2 * pad) + 'px';
    var s = d.getBoundingClientRect(), r = m.getBoundingClientRect();
    if (r.left < pad) { m.style.right = 'auto'; m.style.left = (pad - s.left) + 'px'; }
    else if (r.right > W - pad) { m.style.left = 'auto'; m.style.right = (s.right - (W - pad)) + 'px'; }
  }
  Array.prototype.forEach.call(menus(), function (d) {
    d.addEventListener('toggle', function () { place(d); });
    // focus moving out of the menu (Tab, or a tap on another control) closes it
    d.addEventListener('focusout', function (e) {
      var to = e.relatedTarget;
      if (to && !d.contains(to)) d.removeAttribute('open');
    });
  });
  window.addEventListener('resize', function () {
    Array.prototype.forEach.call(document.querySelectorAll('details.nav-more[open]'), place);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var open = document.querySelector('details.nav-more[open]');
      if (open) { closeAll(null); var s = open.querySelector('summary'); if (s) s.focus(); }
    }
  });
  // Safari on iPhone/iPad sends no "click" for a tap on plain text or empty space, so close on pointerdown too.
  // A press on More itself is left to the native toggle (no double toggle); "click" stays for keyboards and older browsers.
  function outside(e) {
    var inside = e.target && e.target.closest && e.target.closest('details.nav-more');
    closeAll(inside);
  }
  if (window.PointerEvent) document.addEventListener('pointerdown', outside);
  else document.addEventListener('touchstart', outside, {passive: true});
  document.addEventListener('click', outside);
})();

// Copy buttons (website QA SA-20): "Copied" for 2 s; if the browser blocks the clipboard, say how to copy by hand
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('button[data-copy]');
  if (!b) return;
  function say(t) { b.textContent = t; clearTimeout(b._t); b._t = setTimeout(function () { b.textContent = 'Copy'; }, 2000); }
  try {
    navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () { say('Copied'); }, function () { say('Press and hold to copy'); });
  } catch (err) { say('Press and hold to copy'); }
});
