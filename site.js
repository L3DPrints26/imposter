/* Shared by every page: the Menu button, the version banner, and old links.
   Loaded with data-root="" on the home page and "../" one folder down. */
(function () {
  var me = document.currentScript;
  var root = (me && me.getAttribute('data-root')) || '';

  // Old single-page links (shared, bookmarked, or in an email) still land on
  // the right page: /imposter/#update now lives at /imposter/update/.
  if (root === '' && location.hash) {
    var moved = { howto: 'how-to-play/', tips: 'tips/', word: 'word/', tag: 'tag/',
      tagtips: 'how-to-play/#tagtips', lock: 'lock/', ref: 'settings/',
      update: 'update/', faq: 'questions/', report: 'feedback/' };
    var to = moved[location.hash.slice(1)];
    if (to) { location.replace(to); return; }
  }

  // Menu button below 1160 px.
  var bar = document.querySelector('.bar'), btn = bar && bar.querySelector('.menubtn');
  if (btn) {
    var set = function (open) { bar.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); };
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(!bar.classList.contains('open')); });
    bar.querySelectorAll('nav a').forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
    document.addEventListener('click', function (e) { if (!bar.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }

  // ⚠ The version comes from the manifest the updater installs from - the
  // one place it actually lives. The banner used to be typed into the page
  // by hand on every release, and it drifted from what the site was serving.
  var vb = document.getElementById('vbar');
  if (vb) {
    fetch(root + 'firmware/manifest.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        var v = m && String(m.version || '').replace(/[^0-9A-Za-z.]/g, '');
        if (!v) return;
        vb.innerHTML = 'Newest firmware is <b>v' + v + '</b>. On your box: <b>Info</b>, then keep ' +
          'tapping the arrow to <b>Version</b>. Older than that? <a href="' + root +
          'update/">Update it here</a>.';
      })
      .catch(function () {});
  }
})();
