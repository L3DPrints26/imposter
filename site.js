/* Shared by every page: Back, the version banner, the Word/Tag switch on How
   to play, and old links. Loaded with data-root="" on the home page and "../"
   one folder down. */
(function () {
  var me = document.currentScript;
  var root = (me && me.getAttribute('data-root')) || '';

  // Inside the iPhone app every folder link needs its index.html spelled out:
  // the app serves any path without a file extension as the home page.
  var inApp = location.protocol === 'capacitor:';
  function url(p) { return inApp ? p.replace(/\/(#|$)/, '/index.html$1') : p; }

  // Old single-page links (shared, bookmarked, or in an email) still land on
  // the right page: /imposter/#update now lives at /imposter/update/.
  if (root === '' && location.hash) {
    var moved = { howto: 'how-to-play/', tips: 'box/', word: 'how-to-play/#word',
      tag: 'how-to-play/#tag', tagtips: 'how-to-play/#tag', lock: 'box/#lock',
      ref: 'box/#settings', update: 'update/', faq: 'help/#questions', report: 'help/#feedback' };
    var to = moved[location.hash.slice(1)];
    if (to) { location.replace(url(to)); return; }
  }

  // Back goes back a step when the last page was one of ours, and home when
  // it wasn't - opened from a link or a QR code, back would leave the site.
  document.querySelectorAll('[data-back]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var here = location.protocol + '//' + location.host;
      if (document.referrer.indexOf(here) === 0 && history.length > 1) {
        e.preventDefault(); history.back();
      }
    });
  });

  // How to play: Word and Tag share one page, one shown at a time. The address
  // keeps #word or #tag, so a link can open either one.
  var seg = document.querySelector('.seg');
  if (seg) {
    var tabs = seg.querySelectorAll('button[data-panel]');
    var show = function (id, push) {
      tabs.forEach(function (b) {
        var on = b.getAttribute('data-panel') === id;
        b.setAttribute('aria-selected', on);
        document.getElementById(b.getAttribute('data-panel')).hidden = !on;
      });
      if (push && history.replaceState) history.replaceState(null, '', '#' + id);
    };
    tabs.forEach(function (b) {
      b.addEventListener('click', function () { show(b.getAttribute('data-panel'), true); });
    });
    var h = location.hash.slice(1);
    show(h === 'tag' ? 'tag' : 'word', false);
  }

  // A link straight to a question opens it.
  var target = location.hash && document.getElementById(location.hash.slice(1));
  if (target && target.tagName === 'DETAILS') target.open = true;

  // ⚠ The version comes from the manifest the updater installs from - the
  // one place it actually lives. It used to be typed into each page by hand
  // on every release, and it drifted from what the site was serving.
  var vb = document.getElementById('vbar');
  if (vb) {
    fetch(root + 'firmware/manifest.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        var v = m && String(m.version || '').replace(/[^0-9A-Za-z.]/g, '');
        if (!v) return;
        vb.innerHTML = 'Newest firmware: <b>v' + v + '</b> &middot; <a href="' +
          url(root + 'update/') + '">Update your box</a>';
      })
      .catch(function () {});
  }
})();
