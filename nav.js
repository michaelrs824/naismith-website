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
    // landscape phones (e.g. 750x342): the menu scrolls inside instead of running below the screen
    m.style.maxHeight = ''; m.style.overflowY = '';
    var vv = window.visualViewport, bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    var room = Math.floor(bottom - m.getBoundingClientRect().top - pad);
    if (m.scrollHeight > room) { m.style.maxHeight = Math.max(room, 132) + 'px'; m.style.overflowY = 'auto'; }
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

/* Phone header (under 600px, site.css): the search icon and the Menu button. Without this script the icon is a
   link to the Lookup page and Menu is a plain <details>. Here both become real buttons:
   - search: shows the search row under the logo (form upgraded by search.js) and puts the cursor in the box in the
     same tap (iPhone only opens the keyboard then); Escape or the icon again closes it and focus goes back.
   - Menu: opens the panel with every link, focus on the first; closes on Escape (focus back on Menu), a tap or
     click outside, choosing a link, focus leaving it, or the screen growing to the desktop header.
   Only one of the two is open at a time. */
(function () {
  var hdr = document.querySelector('.site-header');
  if (!hdr) return;
  var MQ = window.matchMedia ? window.matchMedia('(max-width: 599px)') : null;
  var X_ICON = '<svg class="hdr-ico hdr-ico-x" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  // Menu: <details> -> <div class="nav-menu"><button>…</button><nav hidden>…</nav></div>
  var det = hdr.querySelector('details.nav-menu'), menu = null, menuBtn = null, panel = null;
  if (det && det.querySelector('summary') && det.querySelector('.nav-menu-panel')) {
    var sum = det.querySelector('summary'), wasOpen = det.open;
    panel = det.querySelector('.nav-menu-panel');
    menu = document.createElement('div');
    menu.className = 'nav-menu';
    menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = sum.className;
    while (sum.firstChild) menuBtn.appendChild(sum.firstChild);
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-controls', panel.id);
    panel.hidden = true;
    menu.appendChild(menuBtn);
    menu.appendChild(panel);
    det.parentNode.replaceChild(menu, det);
    if (wasOpen) setMenu(true, false);
  }

  // Search: <a href="/app.html#lookup"> -> <button aria-controls="hdr-search">
  var link = hdr.querySelector('a.hdr-search-btn'), box = document.getElementById('hdr-search'), sBtn = null, input = null;
  if (link && box && box.querySelector('input')) {
    sBtn = document.createElement('button');
    sBtn.type = 'button';
    sBtn.className = link.className;
    sBtn.innerHTML = link.innerHTML + X_ICON;   // static markup only
    sBtn.setAttribute('aria-label', 'Search players');
    sBtn.setAttribute('aria-expanded', 'false');
    sBtn.setAttribute('aria-controls', box.id);
    link.parentNode.replaceChild(sBtn, link);
    input = box.querySelector('input');
  }

  function isOpen(el) { return !!el && !el.hidden; }
  function focusNoScroll(el) { try { el.focus({preventScroll: true}); } catch (e) { el.focus(); } }

  // The panel never runs below the visible screen (landscape phones): it scrolls inside instead
  function placeMenu() {
    if (!isOpen(panel)) return;
    panel.style.maxHeight = '';
    var vv = window.visualViewport, bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    var room = Math.floor(bottom - panel.getBoundingClientRect().top - 8);
    if (room < panel.scrollHeight) panel.style.maxHeight = Math.max(room, 132) + 'px';
  }
  function setMenu(open, moveFocus) {
    if (!panel) return;
    if (open === isOpen(panel)) return;
    if (open) setSearch(false, false);
    panel.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      placeMenu();
      panel.scrollTop = 0;
      var first = panel.querySelector('a');
      if (moveFocus !== false && first) focusNoScroll(first);
    } else if (moveFocus) focusNoScroll(menuBtn);
  }
  function setSearch(open, moveFocus) {
    if (!sBtn) return;
    if (open === isOpen(box)) return;
    if (open) setMenu(false, false);
    box.hidden = !open;
    sBtn.setAttribute('aria-expanded', String(open));
    sBtn.setAttribute('aria-label', open ? 'Close search' : 'Search players');
    if (open) input.focus();          // same tap: iPhone Safari opens the keyboard only from the tap itself
    else if (moveFocus) focusNoScroll(sBtn);
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(!isOpen(panel)); });
    panel.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setMenu(false, false);
    });
    menu.addEventListener('focusout', function (e) {
      var to = e.relatedTarget;
      if (to && !menu.contains(to)) setMenu(false, false);
    });
  }
  if (sBtn) sBtn.addEventListener('click', function () { setSearch(!isOpen(box), true); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (isOpen(panel)) { setMenu(false, true); return; }
    // search.js closes its suggestion list first (and stops this event); the next Escape closes the row
    if (isOpen(box) && (box.contains(document.activeElement) || document.activeElement === sBtn)) setSearch(false, true);
  });
  // Safari on iPhone/iPad sends no "click" for a tap on plain text or empty space, so pointerdown too
  function outside(e) {
    if (isOpen(panel) && !(menu.contains(e.target))) setMenu(false, false);
  }
  if (window.PointerEvent) document.addEventListener('pointerdown', outside);
  else document.addEventListener('touchstart', outside, {passive: true});
  document.addEventListener('click', outside);

  function wide() { if (MQ && !MQ.matches) { setMenu(false, false); setSearch(false, false); } }
  if (MQ) { if (MQ.addEventListener) MQ.addEventListener('change', wide); else if (MQ.addListener) MQ.addListener(wide); }
  window.addEventListener('resize', function () { wide(); placeMenu(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', placeMenu);
  // Back button (page restored from cache): header closed again
  window.addEventListener('pageshow', function (e) { if (e.persisted) { setMenu(false, false); setSearch(false, false); } });
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
