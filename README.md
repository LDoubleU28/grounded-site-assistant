# Grounded Site Assistant

A fork-and-go, open-source **"ask this site"** chatbot. Drop your own content
into a folder, deploy to Netlify, and visitors get a floating chat widget that
answers questions grounded in *your* material; it declines anything off-topic.

- **Provider-aware**: works with the Claude (Anthropic) API or the OpenAI API,
  auto-detected from whichever key you configure.
- **Zero npm dependencies**: the serverless function calls the model API with
  raw `fetch`.
- **Grounded answers**: a build step compiles your content into a knowledge
  base that the assistant is instructed to answer from, and only from.
- **Prompt caching** (Claude path): the large, stable system prompt is sent as
  a cacheable block to cut cost and latency.
- **Client-side markdown**: answers render with bold, links, and bullet lists
  via a small, HTML-escaping renderer; no client framework.

## How it works

```
content/*.md, *.yaml          (your knowledge: the things the bot may say)
        │
        ▼  scripts/build_kb.py   (runs at build time)
netlify/functions/lib/knowledge.mjs   (generated; gitignored)
        │
        ▼  imported by
netlify/functions/ask.mjs       (/api/ask — grounds answers in the KB)
        ▲
        │  POST { question }
public/index.html + public/assets/chat.{js,css}   (the floating widget)
```

1. Put your content in `content/` as markdown (`.md`) or YAML (`.yaml`).
2. `scripts/build_kb.py` concatenates every file into one knowledge-base
   string with per-file section headers and writes
   `netlify/functions/lib/knowledge.mjs` exporting `const KB`.
3. `netlify/functions/ask.mjs` embeds that KB in a system prompt and answers
   only from it, in the third person, declining off-topic or sensitive asks
   and never revealing its instructions.
4. The provider is auto-detected: if `OPENAI_API_KEY` is set it calls OpenAI;
   otherwise if `ANTHROPIC_API_KEY` is set it calls Claude; otherwise it
   returns a `not_configured` error.

## Environment variables

Set **one** provider key:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Use the Claude API. |
| `OPENAI_API_KEY` | Use the OpenAI API. If set, takes precedence over Claude. |
| `CHAT_MODEL` | *(optional)* Claude model. Default `claude-sonnet-4-6`. |
| `OPENAI_MODEL` | *(optional)* OpenAI model. Default `gpt-4o-mini`. |

## Local development

```bash
# 1. Build the knowledge base.
# pyyaml is optional: with it, YAML files are rendered to readable indented
# text; without it, build_kb.py falls back to embedding the raw YAML. Markdown
# files need no dependencies either way.
python3 -m pip install pyyaml   # optional
python3 scripts/build_kb.py

# 2. Run with the Netlify CLI (serves public/ + functions at /api/ask)
export ANTHROPIC_API_KEY=sk-ant-...     # or: export OPENAI_API_KEY=sk-...
npx netlify dev
```

Then open the served URL and click the chat bubble.

Run the tests:

```bash
# Python: knowledge-base compiler (pyyaml optional; pytest required to run)
python3 -m pip install pytest pyyaml
python3 -m pytest -q

# Node: XSS test for the markdown renderer (no dependencies, no test runner).
# Exits non-zero if any payload escapes as executable HTML.
node tests/render_markdown.test.mjs
```

The Node test imports `renderMarkdown` from `public/assets/chat.js` and runs it
against `<script>`, `javascript:` links, attribute-breakout, and `<img onerror>`
payloads, asserting the output contains no live tag, no `javascript:` scheme,
and no event-handler attribute. The renderer is what turns model output into the
HTML assigned to the chat bubble, so this is the security-critical path; the
test turns that risk into a check.

## Deploy to Netlify

1. Push this repo to your own Git host and create a new Netlify site from it.
2. In **Site settings → Environment variables**, add `ANTHROPIC_API_KEY` *or*
   `OPENAI_API_KEY` (plus optional `CHAT_MODEL` / `OPENAI_MODEL`).
3. Deploy. `netlify.toml` runs `python3 scripts/build_kb.py` at build time,
   publishes `public/`, and serves the function from `netlify/functions/`.

The knowledge base is generated during the build, so
`netlify/functions/lib/knowledge.mjs` is gitignored; you never commit it.

## Use your own content

1. Delete the sample files in `content/` and add your own `.md` / `.yaml`
   (an about page, projects, an FAQ, a contact YAML; whatever you want the
   assistant to know).
2. Update `public/index.html` (intro copy, page title, widget heading, and the
   suggestion buttons).
3. Rebuild: `python3 scripts/build_kb.py`, then deploy.

The sample content describes **Sam Rivera**, a fictional software engineer, and
fictional projects such as **Acme Docs**. None of it is real; it exists only to
demonstrate the template.

## Security / production notes

Read this before exposing the site publicly.

- **`/api/ask` has no rate limiting or authentication by default.** It proxies a
  paid LLM key (your `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`), so an open,
  unauthenticated endpoint is a cost-and-abuse risk: anyone who finds the URL can
  drive spend against your key. Before going public, add at least one of:
  - **Netlify rate limiting** (Edge Functions rate-limit, or a platform rule) to
    cap requests per IP / per window.
  - An **origin allowlist** beyond the built-in guard (see below), or a shared
    **token / header** the widget sends and the function checks.
  - A spend cap / budget alert on the provider account as a backstop.
- **Same-origin guard (built in).** The function rejects a request whose `Origin`
  header is present and points at a different host (`403 forbidden_origin`), and
  allows same-origin or missing-Origin requests. This blocks casual cross-site
  browser calls but is **not** a substitute for auth: `Origin` is only sent and
  enforced by browsers and is trivially forgeable by a non-browser client.
- **Input limits.** Questions over `MAX_QUESTION_LEN` (1000 chars) are rejected
  with `413 question_too_long` rather than silently truncated.
- **No key leakage to clients.** Upstream failures are logged server-side
  (`console.error`) for debugging; the client only ever receives a generic
  `upstream` error with no provider or key detail. A missing provider key returns
  `503 not_configured` (a config error, not a crash).
- **Output is rendered as HTML.** Model answers pass through the escaping
  markdown renderer in `public/assets/chat.js`; see the Node XSS test above.
  Keep that test green if you modify the renderer.

## License

MIT. See [`LICENSE`](./LICENSE).
