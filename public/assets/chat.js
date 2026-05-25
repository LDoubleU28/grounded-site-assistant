// Grounded Site Assistant — floating chat widget. Zero dependencies.
(function () {
  "use strict";

  // --- safe markdown rendering ---
  // Defined before the DOM guard so it is exportable for tests even when there
  // is no widget element on the page (e.g. under a Node test runner).
  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderMarkdown(text) {
    var safe = escapeHtml(text);

    // Group consecutive "- " lines into <ul><li>...</li></ul>.
    var lines = safe.split("\n");
    var out = [];
    var i = 0;
    while (i < lines.length) {
      if (/^\s*-\s+/.test(lines[i])) {
        var items = [];
        while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
          items.push("<li>" + lines[i].replace(/^\s*-\s+/, "") + "</li>");
          i++;
        }
        out.push("<ul>" + items.join("") + "</ul>");
      } else {
        out.push(lines[i]);
        i++;
      }
    }
    var html = out.join("\n");

    // Inline: bold, then links. The href is matched as an http(s) URL only and
    // is already HTML-escaped, so a quote in the URL becomes &quot; and cannot
    // break out of the attribute, and a javascript: scheme cannot match.
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Remaining newlines (outside lists) -> <br>.
    html = html.replace(/\n(?!<\/?ul>|<li>)/g, "<br>");
    return html;
  }

  // Export for a Node test runner (CommonJS). No-op in the browser.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { renderMarkdown: renderMarkdown, escapeHtml: escapeHtml };
  }

  var root =
    typeof document !== "undefined"
      ? document.getElementById("gsa-widget")
      : null;
  if (!root) return;

  var launch = root.querySelector(".gsa-launch");
  var panel = root.querySelector(".gsa-panel");
  var log = root.querySelector(".gsa-log");
  var form = root.querySelector(".gsa-form");
  var input = root.querySelector(".gsa-input");

  // --- open / close (class-based) ---
  function open() {
    root.classList.add("gsa-open");
    setTimeout(function () { input && input.focus(); }, 50);
  }
  function close() {
    root.classList.remove("gsa-open");
  }
  function isOpen() {
    return root.classList.contains("gsa-open");
  }

  launch.addEventListener("click", function () {
    isOpen() ? close() : open();
  });

  // Escape closes.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) close();
  });

  // Click outside closes. Capture phase so suggestion-button handlers (which
  // live inside the panel) run without the document handler closing first.
  document.addEventListener(
    "click",
    function (e) {
      if (!isOpen()) return;
      if (root.contains(e.target)) return;
      close();
    },
    true
  );

  // --- message rendering ---
  function addMessage(role, html) {
    var el = document.createElement("div");
    el.className = "gsa-msg gsa-" + role;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  var pending = false;

  function ask(question) {
    question = (question || "").trim();
    if (!question || pending) return;
    pending = true;

    addMessage("user", escapeHtml(question));
    var thinking = addMessage("bot", '<span class="gsa-dots">…</span>');

    fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: question }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (r) {
        if (r.ok && r.data && r.data.answer) {
          thinking.innerHTML = renderMarkdown(r.data.answer);
        } else {
          thinking.innerHTML =
            "Sorry, something went wrong. Please try again.";
        }
      })
      .catch(function () {
        thinking.innerHTML = "Sorry, something went wrong. Please try again.";
      })
      .finally(function () {
        pending = false;
        log.scrollTop = log.scrollHeight;
      });
  }

  // Expose for suggestion buttons.
  window.gsaAsk = ask;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value;
    input.value = "";
    ask(q);
  });

  // Suggestion buttons.
  root.querySelectorAll(".gsa-suggestion").forEach(function (btn) {
    btn.addEventListener("click", function () {
      ask(btn.textContent);
    });
  });
})();
