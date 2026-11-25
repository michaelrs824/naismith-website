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
