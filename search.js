/* Player search with name suggestions (owner decision 2026-11-26: one player page).
   Upgrades every <form data-player-search> that holds a text/search input:
   - suggestions as you type (min 2 letters, 250 ms debounce, stale requests cancelled, answers cached per query)
   - picking a suggestion opens /players/<slug>
   - Search/Enter on part of a name opens the best match; no match shows a message under the box
   Without JavaScript the form still submits to /app.html?player=..., which redirects the same way.
   No dependencies. Text from the API is set with textContent, never as HTML. */
(function () {
  var API = 'https://naismith-api-production.up.railway.app/public/search';
  var MIN = 2, WAIT = 250, TIMEOUT = 10000;
  var STATUS = {OUT: 'Out', DOUBTFUL: 'Doubtful', QUESTIONABLE: 'Questionable', PROBABLE: 'Probable',
                DAY_TO_DAY: 'Day-to-day', GTD: 'Game-time decision', SUSPENDED: 'Suspended'};
  var cache = {};  // query key -> results (this page view only)
  var uid = 0;

  // iPhones type a curly apostrophe; the search API only matches the straight one.
  function clean(q) {
    return String(q || '').replace(/[\u2018\u2019\u02bc\u2032`\u00b4]/g, "'").replace(/\s+/g, ' ').trim().slice(0, 40);
  }
  // Same rule as slugify() in server/site_pages.py: accents dropped, anything else -> "-"
  function slug(name) {
    var s = String(name || '');
    try { s = s.normalize('NFKD'); } catch (e) {}
    return s.replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function key(n) {
    var s = clean(n).toLowerCase();
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    return s.replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // every word typed starts a word of the name: "steph curry" fits Stephen Curry
  function fits(name, words) {
    var nw = key(name).split(' ');
    return words.every(function (t) { return nw.some(function (w) { return w.indexOf(t) === 0; }); });
  }
  function pageFor(name) { return '/players/' + slug(name); }
  function statusWord(s) {
    s = String(s || '').toUpperCase();
    if (!s || s === 'ACTIVE' || s === 'RETURNING' || s === 'AVAILABLE') return '';
    if (STATUS[s]) return STATUS[s];
    s = s.replace(/_/g, ' ').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Resolves to a list of {name, team, status}; rejects with 'busy' (rate limit) or 'error'.
  // The API matches a whole first + last name or one part of it, not "steph curry": when two or more
  // words find nobody, ask for the longest word and keep the names every typed word fits.
  function search(q, signal) {
    var k = key(q), words = k.split(' ').filter(Boolean);
    if (cache[k]) return Promise.resolve(cache[k]);
    return fetchSearch(q, signal).then(function (res) {
      if (res.length || words.length < 2) return res;
      var longest = words.slice().sort(function (a, b) { return b.length - a.length; })[0];
      if (longest.length < MIN) return res;
      return fetchSearch(longest, signal).then(function (more) {
        var kept = more.filter(function (p) { return fits(p.name, words); });
        cache[k] = kept;
        return kept;
      });
    });
  }
  function fetchSearch(q, signal) {
    var k = key(q);
    if (cache[k]) return Promise.resolve(cache[k]);
    if (!window.fetch) return Promise.reject('error');
    var ctl = window.AbortController ? new AbortController() : null, timer = null;
    if (ctl) {
      timer = setTimeout(function () { ctl.abort(); }, TIMEOUT);
      if (signal) {
        if (signal.aborted) ctl.abort();
        else signal.addEventListener('abort', function () { ctl.abort(); });
      }
    }
    return fetch(API + '?q=' + encodeURIComponent(clean(q)) + '&limit=8', ctl ? {signal: ctl.signal} : undefined)
      .then(function (r) {
        if (r.status === 429) throw 'busy';
        if (!r.ok) throw 'error';
        return r.json();
      })
      .then(function (d) {
        clearTimeout(timer);
        var out = ((d && d.results) || []).filter(function (p) { return p && p.name; }).map(function (p) {
          return {name: String(p.name), team: String(p.team || ''), status: String(p.status || '')};
        });
        cache[k] = out;
        return out;
      }, function (err) {
        clearTimeout(timer);
        if (signal && signal.aborted) throw 'aborted';
        throw err === 'busy' ? 'busy' : 'error';
      });
  }

  function upgrade(form) {
    if (!form || form._ps) return;
    var input = form.querySelector('input[type="search"], input[type="text"], input:not([type])');
    if (!input) return;
    form._ps = true;
    form.classList.add('ps-form');
    var button = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
    var n = ++uid, listId = 'ps-list-' + n;
    var label = button ? (button.textContent || button.value) : '';

    // the list hangs under the whole form (.ps-form), below the box and the button, never over the button
    var wrap = document.createElement('div');
    wrap.className = 'ps-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var list = document.createElement('ul');
    list.className = 'ps-list';
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Players');
    list.hidden = true;
    wrap.appendChild(list);

    var msg = form.querySelector('[data-ps-msg]') ||
      (form.getAttribute('data-ps-msg') && document.getElementById(form.getAttribute('data-ps-msg')));
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'ps-msg';
      msg.setAttribute('role', 'status');
      msg.setAttribute('aria-live', 'polite');
      form.parentNode.insertBefore(msg, form.nextSibling);
    }

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('autocomplete', 'off');

    var items = [], active = -1, shownFor = null, timer = null, ctl = null, busy = false, seq = 0;

    function say(t) { msg.textContent = t || ''; }
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }
    function setActive(i) {
      var rows = list.children;
      if (active >= 0 && rows[active]) { rows[active].setAttribute('aria-selected', 'false'); rows[active].classList.remove('on'); }
      active = i;
      if (i >= 0 && rows[i]) {
        rows[i].setAttribute('aria-selected', 'true');
        rows[i].classList.add('on');
        input.setAttribute('aria-activedescendant', rows[i].id);
        keepRowInList(rows[i]);
      } else input.removeAttribute('aria-activedescendant');
    }
    // The highlighted row stays visible inside the list (scrolls the list only, never the page)
    function keepRowInList(row) {
      var top = row.offsetTop, bottom = top + row.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
    // The list never runs below the visible screen (short phones, landscape, the on-screen keyboard):
    // if there's little room under the box, bring the box up once, then cap the list to the space left.
    var lifted = false;
    function fit() {
      list.style.maxHeight = '';
      var vv = window.visualViewport;
      var bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      var room = function () { return Math.floor(bottom - list.getBoundingClientRect().top - 8); };
      var want = Math.min(list.scrollHeight, 5 * 44 + 8);   // room for five rows, or the whole list if shorter
      if (room() < want && !lifted) {
        lifted = true;
        var r = form.getBoundingClientRect(), by = Math.min(r.top - 12, want - room());
        if (by > 0) window.scrollBy(0, by);
      }
      var space = room(), cap = parseFloat(getComputedStyle(list).maxHeight) || Infinity;
      if (space < cap) list.style.maxHeight = Math.max(space, 96) + 'px';
    }
    function render(res, q) {
      items = res; shownFor = q;
      while (list.firstChild) list.removeChild(list.firstChild);
      if (!res.length) { close(); return; }
      res.forEach(function (p, i) {
        var li = document.createElement('li');
        li.id = listId + '-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        var row = document.createElement('span');  // one inline line of text inside the 44px row
        li.appendChild(row);
        var name = document.createElement('span');
        name.className = 'ps-name';
        name.textContent = p.name;
        row.appendChild(name);
        var meta = (p.team ? ' \u00b7 ' + p.team : '');
        // /public/search returns the word the player's page shows (server 67f8350, website QA SR-01),
        // so the row and the page can't disagree. Nothing is shown for an available player.
        var st = statusWord(p.status);
        if (meta) {
          var t = document.createElement('span');
          t.className = 'ps-team';
          t.textContent = meta;
          row.appendChild(t);
        }
        if (st) {
          var s = document.createElement('span');
          s.className = 'ps-st';
          s.textContent = ' \u00b7 ' + st;
          row.appendChild(s);
        }
        // keep focus in the box while tapping a row, then open the page on click
        li.addEventListener('mousedown', function (e) { e.preventDefault(); });
        li.addEventListener('click', function () { go(p); });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
      list.scrollTop = 0;
      fit();
    }
    function go(p, replace) {
      close();
      input.value = p.name;
      busy = true;
      try { (replace ? location.replace : location.assign).call(location, pageFor(p.name)); }
      catch (e) { location.href = pageFor(p.name); }
    }
    function reset() {
      busy = false;
      if (button) { button.disabled = false; if (button.tagName === 'INPUT') button.value = label; else button.textContent = label; }
      form.removeAttribute('aria-busy');
    }

    function suggest() {
      var q = clean(input.value);
      clearTimeout(timer);
      if (ctl) { ctl.abort(); ctl = null; }
      if (q.length < MIN) { close(); items = []; shownFor = null; return; }
      if (cache[key(q)]) { render(cache[key(q)], q); return; }
      timer = setTimeout(function () {
        ctl = window.AbortController ? new AbortController() : null;
        var mine = ctl;
        search(q, mine && mine.signal).then(function (res) {
          // a late answer for an older query never replaces a newer one
          if (mine !== ctl || clean(input.value) !== q) return;
          ctl = null;
          if (document.activeElement === input) render(res, q);
        }, function () { if (mine === ctl) ctl = null; });  // suggestions are optional; Search still works
      }, WAIT);
    }

    // Search/Enter: exact suggestion first, else the best match; never a dead end
    function submit(replace) {
      var q = clean(input.value);
      if (busy) return;
      close();
      if (!q) { say("Type a player's name to look him up."); input.focus(); return; }
      if (q.length < MIN) { say('Type at least 2 letters of his name.'); input.focus(); return; }
      var k = key(q), exact = null;
      items.forEach(function (p) { if (!exact && key(p.name) === k) exact = p; });
      if (exact && shownFor !== null) { go(exact, replace); return; }
      clearTimeout(timer);
      if (ctl) { ctl.abort(); ctl = null; }
      say('');
      busy = true;
      var mySeq = ++seq;
      if (button) {
        button.disabled = true;
        if (button.tagName === 'INPUT') button.value = 'Searching\u2026'; else button.textContent = 'Searching\u2026';
      }
      form.setAttribute('aria-busy', 'true');
      search(q).then(function (res) {
        if (mySeq !== seq) return;
        var best = null;
        res.forEach(function (p) { if (!best && key(p.name) === k) best = p; });
        best = best || res[0];
        if (best) { go(best, replace); return; }
        reset();
        say('No player found for "' + q + '". Check the spelling or try a last name.');
      }, function (err) {
        if (mySeq !== seq) return;
        reset();
        say(err === 'busy' ? 'Too many searches. Try again in a minute.'
                           : "Couldn't search right now. Check your connection and try again.");
      });
    }

    input.addEventListener('input', function () {
      if (busy && !input.disabled) { seq++; reset(); }  // typing again cancels a search in progress
      say('');
      suggest();
    });
    input.addEventListener('focus', function () {
      if (items.length && shownFor === clean(input.value) && shownFor.length >= MIN) render(items, shownFor);
    });
    input.addEventListener('keydown', function (e) {
      var open = !list.hidden && items.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) { if (items.length && shownFor === clean(input.value)) render(items, shownFor); else suggest(); return; }
        setActive(active + 1 >= items.length ? 0 : active + 1);
      } else if (e.key === 'ArrowUp') {
        if (!open) return;
        e.preventDefault();
        setActive(active <= 0 ? items.length - 1 : active - 1);
      } else if (e.key === 'Enter') {
        if (open && active >= 0) { e.preventDefault(); go(items[active]); }
        // otherwise the form's submit handler runs
      } else if (e.key === 'Escape') {
        if (open) { e.preventDefault(); e.stopPropagation(); close(); }
      }
    });
    input.addEventListener('blur', function () { lifted = false; });
    // the on-screen keyboard opening or closing changes the room under the box
    if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { if (!list.hidden) fit(); });
    input.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== input) close(); }, 150); });
    document.addEventListener('pointerdown', function (e) { if (!wrap.contains(e.target)) close(); });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(false); });
    // Back button from the player page: the box is usable again, not stuck on "Searching..."
    window.addEventListener('pageshow', function (e) { if (e.persisted) { seq++; reset(); close(); } });

    form._psRun = function (text, replace) { input.value = text; submit(replace); };
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-player-search]'), upgrade);
  }
  window.NaismithSearch = {upgrade: upgrade, search: search, slug: slug, pageFor: pageFor, clean: clean,
    // Open the page for a typed name, as if it was typed in this form and submitted (app.html ?player=)
    run: function (form, text, replace) { upgrade(form); if (form && form._psRun) form._psRun(text, replace); }};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
