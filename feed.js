/* Shared by the homepage and /alerts.html: posted alerts as site cards (read back from the tweet text). */
// Calls to the Naismith API give up after 15 s, so a hung request ends in each page's existing
// "Couldn't load…" message instead of "Loading…" forever (website QA DP-08, L-07).
(function () {
  var f = window.fetch;
  if (!f || !window.AbortController) return;
  window.fetch = function (url, opts) {
    var u = String((url && url.url) || url);
    if ((opts && opts.signal) || u.indexOf('naismith-api-production') < 0) return f.apply(this, arguments);
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 15000);
    return f.call(this, url, Object.assign({}, opts || {}, {signal: c.signal})).finally(function () { clearTimeout(t); });
  };
})();
(function () {
  var X = 'https://x.com/NaismithAIApp/status/';
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }
  function body(text) {
    // Hashtags are for X; on the site they're clutter.
    return esc(text.replace(/(\n\s*)?(#[A-Za-z0-9_]+\s*)+$/, '').trim());
  }
  function ago(iso) {
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }
  // His player page, /players/<slug> (same rule as slugify() in server/site_pages.py and search.js)
  function slug(name) {
    var s = String(name || '');
    try { s = s.normalize('NFKD'); } catch (e) {}
    return s.replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  // A reported timeline in plain words, the same cases as server/site_pages.py _plain_duration (/injuries):
  // 'out indefinitely' -> 'indefinitely', 'day-to-day' -> 'day to day', '6-8 weeks' -> '6 to 8 weeks',
  // 'most or all of season' -> 'most or all of the season'. '' for none.
  var SEASON = ['season-ending', 'season ending', 'rest of season', 'rest of the season', 'remainder of season',
                'remainder of the season', 'for the season', 'the season', 'season'];
  function plainDuration(duration) {
    var d = String(duration == null ? '' : duration).replace(/\s+/g, ' ').trim();
    d = d.replace(/^(?:out|sidelined)\s+(?:for\s+)?/i, '');
    var low = d.toLowerCase().replace(/\.+$/, '');
    if (!d || ['none', 'none reported', 'unknown', 'tbd'].indexOf(low) >= 0) return '';
    if (/^indefinite(?:ly)?$/.test(low)) return 'indefinitely';
    if (/^day[- ]to[- ]day$/.test(low)) return 'day to day';
    if (/^week[- ]to[- ]week$/.test(low)) return 'week to week';
    if (SEASON.indexOf(low) >= 0) return 'for the rest of the season';
    d = d.replace(/\b(most|all|rest|part) of season\b/gi, '$1 of the season');
    return d.replace(/\b(\d+)\s*-\s*(\d+)\b/g, '$1 to $2');
  }
  // His page for a name a feed sent: the feed's own path when it has the field ("url" beside "player",
  // "player_url" beside an alert event's "player_name"; null means the site has no page for that spelling,
  // so the name stays plain text); for JSON from before the field, the slug rule above.
  function pageUrl(o, name, key) {
    key = key || 'url';
    if (o && Object.prototype.hasOwnProperty.call(o, key)) {
      var u = o[key];
      return typeof u === 'string' && /^\/players\/[a-z0-9-]+$/.test(u) ? u : null;
    }
    var s = slug(name);
    return s ? '/players/' + s : null;
  }
  // A player's name as a link to his page (class "pn", site.css), keeping the element's own class;
  // without a page, the same element as plain text.
  function nameLink(name, url, cls) {
    if (url) return '<a class="' + (cls ? cls + ' ' : '') + 'pn" href="' + esc(url) + '">' + esc(name) + '</a>';
    return cls ? '<span class="' + cls + '">' + esc(name) + '</span>' : esc(name);
  }
  function lookupLink(name, url) {
    return '<a class="ac-look" href="' + esc(url || '/players/' + slug(name)) + '">Look up ' + esc(name) + '</a>';
  }
  function card(text, link, when, linkLabel, look) {
    return '<article class="tweet">' +
      '<div class="tweet-head"><div class="logo">N</div><div class="tweet-who"><b>Naismith AI</b><span>@NaismithAIApp</span></div></div>' +
      '<div class="tweet-body">' + body(text) + '</div>' +
      '<div class="tweet-foot"><span>' + esc(when || '') + '</span>' + (look || '') +
      (link ? '<a href="' + link + '" target="_blank" rel="noopener">' + esc(linkLabel || 'View on X') + ' →</a>' : '') +
      '</div></article>';
  }

  // Alerts posted before tweet text was saved: rebuild only the first line,
  // the same way the X poster does, and send readers to X for the pickups.
  var EMOJI = {INJURY_OUT: '🚨', INJURY_DOUBTFUL: '🔴', INJURY_QUESTIONABLE: '⚠️'};
  var LABEL = {INJURY_OUT: 'OUT', INJURY_DOUBTFUL: 'Doubtful', INJURY_QUESTIONABLE: 'Questionable'};
  var DONE = /\b(did not return|won'?t return|will not return|ruled out for the (rest|remainder))\b/i;
  var EXIT = /locker room|\bexited\b|\bleft\b[^.()]{0,60}\bgame\b|\b(helped|carted|stretchered) off\b/i;
  function headline(a) {
    var ev = a.event || {}, t = ev.event_type, d = ev.detail || '';
    if (!LABEL[t]) return null;
    var emoji = EMOJI[t], label = LABEL[t];
    if (DONE.test(d)) { emoji = '🚑'; label = "Won't return"; }
    else if (EXIT.test(d)) { emoji = '🚑'; label = 'Left game'; }
    var s = emoji + ' ' + ev.player_name + (ev.player_team ? ' (' + ev.player_team + ')' : '') + ' — ' + label;
    var dur = plainDuration(ev.duration_estimate);
    if (dur) s += ' (' + dur + ')';
    if (a.avg_fpts >= 10) s += ' | ' + Math.round(a.avg_fpts) + ' FPTS/g';
    return s;
  }


  // ── My players: a watchlist kept on this device (no account) ──
  var KEY = 'naismith.watch';
  function nkey(n) { return String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim(); }
  // When storage is blocked (private mode, some in-app browsers) the list lives in memory for this page view,
  // so the star still works; nothing is shown about it (device QA, Nov 26).
  var mem = null;
  var W = {
    load: function () {
      if (mem) return mem.slice();
      try { var l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
    },
    save: function (l) {
      try { localStorage.setItem(KEY, JSON.stringify(l)); mem = null; return true; }
      catch (e) { mem = l.slice(); return true; }
    },
    key: nkey,
    has: function (n) { var k = nkey(n); return W.load().some(function (x) { return nkey(x) === k; }); },
    names: function () { return W.load(); },
    toggle: function (n) {
      var k = nkey(n), l = W.load(), i = -1;
      l.forEach(function (x, j) { if (nkey(x) === k) i = j; });
      if (i >= 0) l.splice(i, 1); else l.push(n);
      W.save(l);  // falls back to memory when storage is blocked
      document.dispatchEvent(new CustomEvent('watchchange', {detail: {player: n, on: i < 0}}));
      return i < 0;
    },
    star: function (n) {
      var on = W.has(n);
      // one fixed name; aria-pressed carries the state (website QA SA-16)
      return '<button type="button" class="star" data-player="' + esc(n) + '" aria-pressed="' + on + '" aria-label="' +
        esc(n) + ' in my players" title="' + (on ? 'In my players' : 'Add to my players') + '">' +
        (on ? '★' : '☆') + '</button>';
    }
  };
  // One click handler for every star on the page
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.star');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var n = b.getAttribute('data-player'), on = W.toggle(n);
    Array.prototype.forEach.call(document.querySelectorAll('.star'), function (s) {
      if (nkey(s.getAttribute('data-player')) === nkey(n)) {
        s.setAttribute('aria-pressed', String(on)); s.textContent = on ? '★' : '☆';
        s.setAttribute('aria-label', n + ' in my players');  // fixed name; aria-pressed carries the state (SA-16)
        s.title = on ? 'In my players' : 'Add to my players';
      }
    });
  });
  window.NaismithWatch = W;

  // Stars already in the page's HTML (the server-rendered player page): show the saved state.
  // They ship hidden, so a visitor without JavaScript never sees a button that does nothing.
  function syncStars() {
    Array.prototype.forEach.call(document.querySelectorAll('.star[data-player]'), function (s) {
      var on = W.has(s.getAttribute('data-player'));
      s.setAttribute('aria-pressed', String(on)); s.textContent = on ? '★' : '☆';
      s.title = on ? 'In my players' : 'Add to my players';
      s.hidden = false;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-watch-ui][hidden]'), function (el) { el.hidden = false; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncStars); else syncStars();
  window.addEventListener('storage', function (e) { if (e.key === KEY) syncStars(); });  // starred in another tab

  // Read a posted tweet back into its parts: headline, news, pickups, source.
  var HEAD = /^(\S+)\s+(.+?)\s+\(([A-Z]{2,4})\)\s+—\s+(.+?)(?:\s+\|\s+(\d+)\s+FPTS\/g)?$/;
  var PICK = /^(🔥|🎯|👀)\s+(.+?)\s+\(\+([\d.]+) FPTS\/g\)\s+—\s+(.+)$/;
  var KIND = {'🚨': 'out', '🔴': 'gtd', '⚠️': 'gtd', '🚑': 'exit', '✅': 'back'};
  var BACK = /^✅\s+Update:\s+(.+?)(?:\s+\(([A-Z]{2,4})\))?\s+is back\.?$/;
  function parse(text) {
    var lines = text.replace(/(\n\s*)?(#[A-Za-z0-9_]+\s*)+$/, '').trim().split('\n');
    var first = (lines[0] || '').trim(), m = first.match(HEAD), a;
    if (m) {
      // "OUT (6-8 weeks)" -> "OUT (6 to 8 weeks)": the plain timeline words used across the site
      var sw = m[4].replace(/\s*\(([^()]*)\)$/, function (x, d) { var p = plainDuration(d); return p ? ' (' + p + ')' : ''; });
      a = {kind: KIND[m[1]] || 'info', player: m[2], team: m[3], status: sw, fpts: m[5] || null,
           news: [], picks: [], source: null};
    } else if ((m = first.match(BACK))) {  // back-in-game reply: "✅ Update: Name (TEAM) is back."
      a = {kind: 'back', player: m[1], team: m[2] || '', status: 'Back in the game', fpts: null, news: [], picks: [], source: null};
    } else {
      return null;
    }
    lines.slice(1).forEach(function (raw) {
      var l = raw.trim(), p;
      if (!l) return;
      if ((p = l.match(PICK))) a.picks.push({icon: p[1], name: p[2], delta: p[3], tag: p[4]});
      else if (/^📰/.test(l)) a.source = cleanSource(l.replace(/^📰\s*/, ''));
      else a.news.push(l);
    });
    return a;
  }
  // "Underdog NBA (Underdog)" -> "Underdog NBA"; "RotoWire RSS" -> "RotoWire"
  function cleanSource(src) {
    src = String(src || '').trim();
    var m = src.match(/^(.*?)\s*\(([^)]+)\)$/);
    if (m && m[1].toLowerCase().indexOf(m[2].toLowerCase()) >= 0) src = m[1];
    return src.replace(/\s+RSS$/, '');
  }
  function structured(a, link, when, linkLabel, look) {
    return '<article class="acard k-' + a.kind + '">' +
      '<div class="ac-top"><span class="ac-status"><i></i>' + esc(a.status) + '</span><span class="ac-time">' + esc(when) + '</span></div>' +
      '<div class="ac-player">' + W.star(a.player) + nameLink(a.player, a.url, 'ac-name') + '<span class="ac-team">' + esc(a.team) + '</span>' +
        (a.fpts ? '<span class="ac-fp">' + esc(a.fpts) + '<small> FPTS/g</small></span>' : '') + '</div>' +
      (a.news.length ? '<p class="ac-news">' + esc(a.news.join(' ')) + '</p>' : '') +
      (a.picks.length ? '<ul class="ac-picks">' + a.picks.map(function (p) {
        return '<li>' + W.star(p.name) + nameLink(p.name, p.url, 'ac-pn') + '<span class="pill">' + esc(p.icon + ' ' + p.tag) +
          '</span><span class="ac-pd">+' + esc(p.delta) + '</span>' +
          (p.cat ? '<span class="ac-cat">' + esc(p.cat) + '</span>' : '') + '</li>';  // category line, own row (site.css)
      }).join('') + '</ul>' : '') +
      // he's back from this injury (feed injury_over, C-07): no pickups now; the green dot of a back card
      (a.over ? '<p class="ac-over"><i></i>No longer out. No pickups now.</p>' : '') +
      (look
        ? '<div class="ac-foot has-links">' + (a.source ? '<span>' + esc(a.source) + '</span>' : '') + '<span class="ac-links">' + look +
            (link ? '<a href="' + link + '" target="_blank" rel="noopener">' + esc(linkLabel) + ' →</a>' : '') + '</span></div>'
        : '<div class="ac-foot"><span>' + esc(a.source || '') + '</span>' +
            (link ? '<a href="' + link + '" target="_blank" rel="noopener">' + esc(linkLabel) + ' →</a>' : '') + '</div>') +
      '</article>';
  }

  // Category lines (server category_line on each of the feed's recommendations[], built with today's
  // pickups): matched to the pickup lines read back from the tweet text by name, normalised as the
  // watchlist does (nkey). Only a non-empty string shows; null, missing or old cached JSON show nothing.
  var CAT_NOTE = 'Categories: our projected extra stats per game while the injured player is out.';
  function addCats(parts, recs) {
    var by = {};
    (Array.isArray(recs) ? recs : []).forEach(function (r) {
      var c = r && r.category_line;
      if (r && r.player && typeof c === 'string' && c.trim()) by[nkey(r.player)] = c.trim();
    });
    parts.picks.forEach(function (p) { p.cat = by[nkey(p.name)] || ''; });
  }
  // Each name on a card gets its page: the alert's player from event.player_url, each pickup from the
  // url of the recommendation with his name (nkey). A name the feed doesn't list: no link once the feed
  // has the fields; the slug rule for older JSON.
  function addUrls(parts, a) {
    var ev = a.event || {}, recs = a.recommendations || [];
    var fresh = Object.prototype.hasOwnProperty.call(ev, 'player_url');
    function find(name, list, key, nameKey) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && nkey(list[i][nameKey]) === nkey(name)) return pageUrl(list[i], name, key);
      }
      return fresh ? null : pageUrl(null, name);
    }
    parts.url = find(parts.player, [ev], 'player_url', 'player_name');
    parts.picks.forEach(function (p) { p.url = find(p.name, recs, 'url', 'player'); });
  }
  function hasCat(cards) {
    return (cards || []).some(function (h) { return String(h || '').indexOf('<span class="ac-cat">') >= 0; });
  }

  window.NaismithFeed = {
    // The one explainer above a list of cards when at least one shows a category line
    CAT_NOTE: CAT_NOTE, hasCat: hasCat,
    catNote: function () { return '<p class="cat-note">' + esc(CAT_NOTE) + '</p>'; },
    esc: esc, ago: ago, card: card, X: X, parse: parse, cleanSource: cleanSource, slug: slug, plainDuration: plainDuration,
    pageUrl: pageUrl, nameLink: nameLink,
    // The parsed parts behind a card (also for alerts posted before tweet text was saved)
    info: function (a) { return parse(a.tweet_text || headline(a) || ''); },
    // One posted alert as a card; null when there's nothing to show.
    // opts.when: replaces the "4h ago" text (the alerts page adds the day when it isn't sorted by time)
    // opts.lookup: adds a "Look up <player>" link to his player page, /players/<slug> (alerts page)
    alertCard: function (a, opts) {
      opts = opts || {};
      var text = a.tweet_text || headline(a);
      if (!text) return null;
      var link = a.tweet_id ? X + a.tweet_id : null, label = 'Original post';  // its numbers are as posted (C-07)
      var parts = parse(text), when = opts.when || ago(a.timestamp);
      var who = (parts && parts.player) || (a.event || {}).player_name;
      if (parts) addUrls(parts, a);
      var lookUrl = parts ? parts.url : pageUrl(a.event, who, 'player_url');
      var look = opts.lookup && who && lookUrl ? lookupLink(who, lookUrl) : '';  // never a link to a page that 404s
      if (parts && !parts.source) parts.source = cleanSource((a.event || {}).source);  // the tweet had no room for it, or predates saved text
      if (parts && a.injury_over === true && !parts.picks.length) parts.over = true;
      if (parts && parts.picks.length && !parts.over) addCats(parts, a.recommendations);
      return parts ? structured(parts, link, when, label, look) : card(text, link, when, label, look);
    }
  };
})();
