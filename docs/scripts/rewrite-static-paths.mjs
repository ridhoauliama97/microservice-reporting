/**
 * Prepares a `mint export` output so the site works when served under the
 * `/docs` prefix instead of at the root of a host.
 *
 * Mintlify's export is built to be served at a root (its own `serve.js` does
 * exactly that), and subpath hosting is a Mintlify Cloud feature. Serving the
 * export under `/docs` therefore needs two things, and each one fixes a
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
 *    forces navigation to the anchor's own href, which is correct.
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
 *    indexing hint) and a Pagefind UI is injected to take over the search
 *    button, so the box actually searches the offline pages.
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

// Injected first in <head>, so it is registered before the app boots.
const SHIM = `<script>
/* Served under /docs. Mintlify's client router navigates from its own data and
   drops the prefix, so send the click to the anchor's own href instead. */
(function () {
  var PREFIX = '/docs';
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) !== '/' || href.indexOf('//') === 0) return;
    if (href.indexOf('/_next/') === 0) return;
    if (href.indexOf(PREFIX + '/') !== 0 && href !== PREFIX) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.location.href = href;
  }, true);
})();
</script>`

// Injected alongside the shim: a Pagefind UI that replaces Mintlify's search,
// which cannot work in an offline export. `defer` guarantees PagefindUI is
// defined before the inline script's DOMContentLoaded handler runs.
const SEARCH = `<link rel="stylesheet" href="/docs/pagefind/pagefind-ui.css">
<script defer src="/docs/pagefind/pagefind-ui.js"></script>
<style>
  #pf-overlay { position: fixed; inset: 0; z-index: 2147483000; display: none; padding: 12vh 16px 16px; background: rgba(15, 26, 43, .5); }
  #pf-overlay.open { display: block; }
  #pf-panel { max-width: 640px; margin: 0 auto; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 24px 64px rgba(0, 0, 0, .35); }
  @media (prefers-color-scheme: dark) { #pf-panel { background: #0f1a2b; } }
  #pf-panel .pagefind-ui { margin: 0; padding: 6px; }
</style>
<script>
/* Offline export has no Mintlify search backend - open a Pagefind UI instead. */
(function () {
  var PREFIX = '/docs';
  function boot() {
    if (!window.PagefindUI) return;
    var ov = document.createElement('div');
    ov.id = 'pf-overlay';
    ov.innerHTML = '<div id="pf-panel"><div id="pf-search"></div></div>';
    document.body.appendChild(ov);
    new PagefindUI({ element: '#pf-search', bundlePath: PREFIX + '/pagefind/', baseUrl: PREFIX, showSubResults: true });
    function open() {
      if (!ov.isConnected) document.body.appendChild(ov);
      ov.classList.add('open');
      var i = ov.querySelector('input');
      if (i) setTimeout(function () { i.focus(); }, 30);
    }
    function close() { ov.classList.remove('open'); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopImmediatePropagation(); open(); }
    }, true);
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('#search-bar-entry, #search-bar-entry-mobile, [aria-label="Open search"]') : null;
      if (!t) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); open();
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
</script>`

let pages = 0
let changed = 0
let attrs = 0
let shimmed = 0
let searched = 0
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

  if (after.includes('<head>')) {
    let inject = ''
    if (!after.includes("var PREFIX = '/docs'")) inject += SHIM
    if (!after.includes('pagefind-ui.js')) inject += SEARCH
    if (inject) {
      after = after.replace('<head>', '<head>' + inject)
      shimmed += 1
      if (inject.includes('pagefind-ui.js')) searched += 1
    }
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
  `prepared ${pages} pages: ${attrs} paths prefixed, head injected in ${shimmed}, Pagefind-marked ${marked}, search UI in ${searched} (${changed} files changed)`,
)
