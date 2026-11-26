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
  // Same address as the homepage search: /app.html?player=Name#lookup
  function lookupLink(name) {
    return '<a class="ac-look" href="/app.html?player=' + esc(encodeURIComponent(name)) + '#lookup">Look up ' + esc(name) + '</a>';
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
    if (ev.duration_estimate) s += ' (' + ev.duration_estimate + ')';
    if (a.avg_fpts >= 10) s += ' | ' + Math.round(a.avg_fpts) + ' FPTS/g';
    return s;
  }


  // ── My players: a watchlist kept on this device (no account) ──
  var KEY = 'naismith.watch';
  function nkey(n) { return String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim(); }
  var W = {
    load: function () { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } },
    save: function (l) { try { localStorage.setItem(KEY, JSON.stringify(l)); return true; } catch (e) { return false; } },
    key: nkey,
    has: function (n) { var k = nkey(n); return W.load().some(function (x) { return nkey(x) === k; }); },
    names: function () { return W.load(); },
    toggle: function (n) {
      var k = nkey(n), l = W.load(), i = -1;
      l.forEach(function (x, j) { if (nkey(x) === k) i = j; });
      if (i >= 0) l.splice(i, 1); else l.push(n);
      if (!W.save(l)) return i >= 0;  // storage blocked: the star keeps its old state (website QA L-20)
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

  // Read a posted tweet back into its parts: headline, news, pickups, source.
  var HEAD = /^(\S+)\s+(.+?)\s+\(([A-Z]{2,4})\)\s+—\s+(.+?)(?:\s+\|\s+(\d+)\s+FPTS\/g)?$/;
  var PICK = /^(🔥|🎯|👀)\s+(.+?)\s+\(\+([\d.]+) FPTS\/g\)\s+—\s+(.+)$/;
  var KIND = {'🚨': 'out', '🔴': 'gtd', '⚠️': 'gtd', '🚑': 'exit', '✅': 'back'};
  var BACK = /^✅\s+Update:\s+(.+?)(?:\s+\(([A-Z]{2,4})\))?\s+is back\.?$/;
  function parse(text) {
    var lines = text.replace(/(\n\s*)?(#[A-Za-z0-9_]+\s*)+$/, '').trim().split('\n');
    var first = (lines[0] || '').trim(), m = first.match(HEAD), a;
    if (m) {
      a = {kind: KIND[m[1]] || 'info', player: m[2], team: m[3], status: m[4], fpts: m[5] || null,
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
      '<div class="ac-player">' + W.star(a.player) + '<span class="ac-name">' + esc(a.player) + '</span><span class="ac-team">' + esc(a.team) + '</span>' +
        (a.fpts ? '<span class="ac-fp">' + esc(a.fpts) + '<small> FPTS/g</small></span>' : '') + '</div>' +
      (a.news.length ? '<p class="ac-news">' + esc(a.news.join(' ')) + '</p>' : '') +
      (a.picks.length ? '<ul class="ac-picks">' + a.picks.map(function (p) {
        return '<li>' + W.star(p.name) + '<span class="ac-pn">' + esc(p.name) + '</span><span class="pill">' + esc(p.icon + ' ' + p.tag) +
          '</span><span class="ac-pd">+' + esc(p.delta) + '</span></li>';
      }).join('') + '</ul>' : '') +
      (look
        ? '<div class="ac-foot has-links">' + (a.source ? '<span>' + esc(a.source) + '</span>' : '') + '<span class="ac-links">' + look +
            (link ? '<a href="' + link + '" target="_blank" rel="noopener">' + esc(linkLabel) + ' →</a>' : '') + '</span></div>'
        : '<div class="ac-foot"><span>' + esc(a.source || '') + '</span>' +
            (link ? '<a href="' + link + '" target="_blank" rel="noopener">' + esc(linkLabel) + ' →</a>' : '') + '</div>') +
      '</article>';
  }

  window.NaismithFeed = {
    esc: esc, ago: ago, card: card, X: X, parse: parse, cleanSource: cleanSource,
    // The parsed parts behind a card (also for alerts posted before tweet text was saved)
    info: function (a) { return parse(a.tweet_text || headline(a) || ''); },
    // One posted alert as a card; null when there's nothing to show.
    // opts.when: replaces the "4h ago" text (the alerts page adds the day when it isn't sorted by time)
    // opts.lookup: adds a "Look up <player>" link to his page in Lookup (alerts page)
    alertCard: function (a, opts) {
      opts = opts || {};
      var text = a.tweet_text || headline(a);
      if (!text) return null;
      var link = a.tweet_id ? X + a.tweet_id : null, label = a.tweet_text ? 'View on X' : 'Pickups on X';
      var parts = parse(text), when = opts.when || ago(a.timestamp);
      var who = (parts && parts.player) || (a.event || {}).player_name;
      var look = opts.lookup && who ? lookupLink(who) : '';
      if (parts && !parts.source) parts.source = cleanSource((a.event || {}).source);  // the tweet had no room for it, or predates saved text
      return parts ? structured(parts, link, when, label, look) : card(text, link, when, label, look);
    }
  };
})();
