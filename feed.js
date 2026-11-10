/* Shared by the homepage and /alerts.html: render posted alerts the way they read on X. */
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
  function card(text, link, when, linkLabel) {
    return '<article class="tweet">' +
      '<div class="tweet-head"><div class="logo">N</div><div class="tweet-who"><b>Naismith</b><span>@NaismithAIApp</span></div></div>' +
      '<div class="tweet-body">' + body(text) + '</div>' +
      '<div class="tweet-foot"><span>' + esc(when || '') + '</span>' +
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


  window.NaismithFeed = {
    esc: esc, ago: ago, card: card, X: X,
    // One posted alert as a card; null when there's nothing to show.
    alertCard: function (a) {
      var text = a.tweet_text || headline(a);
      if (!text) return null;
      return card(text, a.tweet_id ? X + a.tweet_id : null, ago(a.timestamp), a.tweet_text ? 'View on X' : 'Pickups on X');
    }
  };
})();
