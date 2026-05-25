// XSS / injection test for the security-critical markdown renderer.
//
// renderMarkdown turns model-produced text into HTML that is assigned to
// el.innerHTML in the widget. A model (or a prompt-injected one) could emit a
// payload, so the renderer must never produce executable HTML. This test runs
// the real renderMarkdown (imported from public/assets/chat.js) against known
// payloads and asserts the output contains no live HTML tags, no javascript:
// scheme, and no event-handler attribute.
//
// Run with: node tests/render_markdown.test.mjs   (exits non-zero on failure)

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { renderMarkdown } = require(join(here, "..", "public", "assets", "chat.js"));

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}: ${err.message}`);
  }
}

// A rendered string is "safe" if it contains no executable HTML. The browser
// assigns this string to innerHTML, so what matters is whether a *live* tag or
// attribute survives, not whether the literal text "javascript:" appears: a
// fully HTML-escaped payload (e.g. &lt;a href=&quot;javascript:...) is inert
// text, and a "javascript:" that the renderer left as plain text (because it
// did not match the https-only link regex) is likewise never placed in an href.
//
// So the assertions look for executable constructs only:
//   - any dangerous live tag (<script>, <img>, <svg>, <iframe>)
//   - a javascript: scheme inside a live (unescaped) href= attribute
//   - any inline event-handler attribute on a live tag
// Escaped angle brackets (&lt; / &gt;) are removed first so we only inspect
// what the browser would treat as markup.
function assertNoExecutableHtml(out, payload) {
  // Strip escaped entities so &lt;script&gt; etc. are not counted as live tags.
  const live = out.replace(/&lt;/g, "[").replace(/&gt;/g, "]");
  const checks = [
    [/<\s*script/i, "live <script> tag"],
    [/<\s*img/i, "live <img> tag"],
    [/<\s*svg/i, "live <svg> tag"],
    [/<\s*iframe/i, "live <iframe> tag"],
    // javascript: scheme inside a live href attribute (the dangerous case).
    [/<[^>]*href\s*=\s*["']?\s*javascript:/i, "javascript: scheme in a live href"],
    // Any event-handler attribute on a live tag, e.g. onerror=, onmouseover=.
    [/<[^>]+\son\w+\s*=/i, "inline event-handler attribute on a live tag"],
  ];
  for (const [re, label] of checks) {
    if (re.test(live)) {
      throw new Error(
        `output contains ${label}\n      payload: ${payload}\n      output:  ${out}`
      );
    }
  }
}

const payloads = [
  "<script>alert(1)</script>",
  "[click me](javascript:alert(1))",
  '[x](https://x" onmouseover="alert(1))',
  '<img src=x onerror="alert(1)">',
  "<svg/onload=alert(1)>",
  "**bold** then <script>steal()</script>",
  "- item <script>x</script>\n- item two",
  '<a href="javascript:alert(1)">hi</a>',
];

for (const p of payloads) {
  check(`payload escaped: ${JSON.stringify(p).slice(0, 50)}`, () => {
    const out = renderMarkdown(p);
    assertNoExecutableHtml(out, p);
  });
}

// Positive control: a benign http(s) link should still render as an anchor,
// confirming the renderer is not just stripping everything.
check("benign https link still renders as anchor", () => {
  const out = renderMarkdown("[site](https://example.com)");
  if (!/<a href="https:\/\/example\.com"/.test(out)) {
    throw new Error(`expected an anchor, got: ${out}`);
  }
  assertNoExecutableHtml(out, "benign link");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll renderMarkdown XSS tests passed");
