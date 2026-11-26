/* The "More" menu closes with Escape or a tap outside it (website QA DP-12). Plain <details>, no other JS. */
(function () {
  function closeAll(except) {
    Array.prototype.forEach.call(document.querySelectorAll('details.nav-more[open]'), function (d) {
      if (d !== except) d.removeAttribute('open');
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var open = document.querySelector('details.nav-more[open]');
      if (open) { closeAll(null); var s = open.querySelector('summary'); if (s) s.focus(); }
    }
  });
  document.addEventListener('click', function (e) {
    var inside = e.target.closest && e.target.closest('details.nav-more');
    closeAll(inside);
  });
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
