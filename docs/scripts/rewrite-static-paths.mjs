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

let pages = 0
let changed = 0
let attrs = 0
let shimmed = 0

for (const file of walk(root)) {
  if (!file.endsWith('.html')) continue
  pages += 1
  const before = readFileSync(file, 'utf8')

  let after = before.replace(HTML_ATTR, (whole) => {
    attrs += 1
    return whole.replace('="/', '="/docs/')
  })

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
  `prepared ${pages} pages: ${attrs} paths prefixed, shim in ${shimmed} (${changed} files changed)`,
)
