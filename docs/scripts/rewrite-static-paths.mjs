/**
 * Prepares a `mint export` output so the site works when served under the
 * `/docs` prefix instead of at the root of a host.
 *
 * Mintlify's export is built to be served at a root (its own `serve.js` does
 * exactly that), and subpath hosting is a Mintlify Cloud feature. Serving the
 * export under `/docs` therefore needs a few things, and each one fixes a
 * different symptom:
 *
 * 1. Rewrite the absolute paths in the HTML attributes.
 *    `href="/introduction"`, `id="/introduction"` (the sidebar items carry the
 *    route as an id), `content="/favicons/..."` and `data-current-path="/"`.
 *    `_next` is left alone on purpose: the service serves those assets at the
 *    root, so they need no prefix.
 *
 * 2. Inject a click shim.
 *    Rewriting the HTML alone is not enough. Mintlify's client router navigates
 *    from its own embedded data rather than from the anchor, so a click on the
 *    already-correct `href="/docs/authentication"` still landed on
 *    `/authentication` - the prefix was dropped and the user got a 404. The shim
 *    forces navigation to the anchor's own href, and also re-adds the prefix to
 *    any href the router re-rendered without it.
 *
 * What is deliberately NOT done: rewriting the paths inside the embedded JSON
 * payload. That data is what the router uses to decide which sidebar section is
 * active; prefixing it breaks the comparison and the sidebar renders empty. The
 * shim handles navigation instead, so the payload is left as Mintlify wrote it.
 *
 * 3. Wire up an offline search.
 *    Mintlify's own search needs the Mintlify backend, which an offline export
 *    does not have - the search bar only shows "Run mint login in the cli to
 *    activate search". The Dockerfile docs stage runs Pagefind over the export;
 *    here the main content is marked with `data-pagefind-body` (a build-time
 *    indexing hint) and the shim opens a Pagefind UI on the search button.
 *
 *    The Pagefind CSS/JS and the overlay are all created at RUNTIME from the one
 *    injected script. Do not add <link>/<style>/<script> tags to <head> here:
 *    extra head elements make React 19 hydration fail (#418), and the failed
 *    re-render rewrites the sidebar hrefs without the /docs prefix, breaking
 *    every menu link.
 *
 * Usage: node rewrite-static-paths.mjs <site-dir>
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (!root) {
  console.error('usage: node rewrite-static-paths.mjs <site-dir>')
  process.exit(1)
}

/** Every file under `dir`, recursively. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

// Any HTML attribute holding an absolute path -> prefix it with /docs.
const HTML_ATTR = /([a-zA-Z-]+)="\/(?!_next\/|docs\/)/g

// The single injected script: navigation shim + offline search, in that order.
// It must be the ONLY injected head element (see the header note on React 19).
const SHIM = `<script>
/* Served under /docs. Mintlify's client router navigates from its own data and
   drops the prefix, so send the click to the anchor's own href instead. Offline
   exports have no Mintlify search backend, so a Pagefind UI takes over the
   search button. */
(function () {
  var PREFIX = '/docs';
  var overlay = null;
  var loading = false;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'pf-overlay';
    overlay.innerHTML = '<div id="pf-panel"><div id="pf-search"></div></div>';
    var style = document.createElement('style');
    style.textContent = '#pf-overlay{position:fixed;inset:0;z-index:2147483000;display:none;padding:12vh 16px 16px;background:rgba(15,26,43,.5)}#pf-overlay.open{display:block}#pf-panel{max-width:640px;margin:0 auto;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 24px 64px rgba(0,0,0,.35)}#pf-panel .pagefind-ui{margin:0;padding:6px;--pagefind-ui-text:#1f2937;--pagefind-ui-primary:#111827;--pagefind-ui-background:#fff;--pagefind-ui-border:#e5e7eb;--pagefind-ui-tag:#eef2f7}html.dark #pf-panel{background:#0f1a2b}html.dark #pf-panel .pagefind-ui{--pagefind-ui-text:#e5e7eb;--pagefind-ui-primary:#f3f4f6;--pagefind-ui-background:#0f1a2b;--pagefind-ui-border:#334155;--pagefind-ui-tag:#1e293b}';
    document.head.appendChild(style);
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = PREFIX + '/pagefind/pagefind-ui.css';
    document.head.appendChild(css);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSearch(); });
    return overlay;
  }

  function closeSearch() {
    if (overlay) overlay.classList.remove('open');
  }

  function openSearch() {
    ensureOverlay();
    function show() {
      if (!overlay.querySelector('.pagefind-ui')) {
        new PagefindUI({ element: '#pf-search', bundlePath: PREFIX + '/pagefind/', baseUrl: PREFIX, showSubResults: true });
      }
      overlay.classList.add('open');
      var i = overlay.querySelector('input');
      if (i) setTimeout(function () { i.focus(); }, 30);
    }
    if (window.PagefindUI) { show(); return; }
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = PREFIX + '/pagefind/pagefind-ui.js';
    s.onload = show;
    document.head.appendChild(s);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSearch();
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopImmediatePropagation(); openSearch(); }
  }, true);

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#search-bar-entry, #search-bar-entry-mobile, [aria-label="Open search"]')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openSearch();
      return;
    }
    var a = t.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) !== '/' || href.indexOf('//') === 0) return;
    if (href.indexOf('/_next/') === 0) return;
    var target = (href === PREFIX || href.indexOf(PREFIX + '/') === 0) ? href : PREFIX + href;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.location.href = target;
  }, true);
})();
</script>`

let pages = 0
let changed = 0
let attrs = 0
let shimmed = 0
let marked = 0

for (const file of walk(root)) {
  if (!file.endsWith('.html')) continue
  pages += 1
  const before = readFileSync(file, 'utf8')

  let after = before.replace(HTML_ATTR, (whole) => {
    attrs += 1
    return whole.replace('="/', '="/docs/')
  })

  // Build-time hint for Pagefind: index the article, not the sidebar/header.
  if (!after.includes('data-pagefind-body')) {
    const markedHtml = after.replace(
      /<main id="content-container"/,
      '<main id="content-container" data-pagefind-body',
    )
    if (markedHtml !== after) {
      after = markedHtml
      marked += 1
    }
  }

  if (after.includes('<head>') && !after.includes("var PREFIX = '/docs'")) {
    after = after.replace('<head>', '<head>' + SHIM)
    shimmed += 1
  }

  if (after !== before) {
    writeFileSync(file, after)
    changed += 1
  }
}

if (pages === 0) {
  console.error(`no .html files found under ${root} - the export looks empty`)
  process.exit(1)
}

console.log(
  `prepared ${pages} pages: ${attrs} paths prefixed, shim in ${shimmed}, Pagefind-marked ${marked} (${changed} files changed)`,
)
