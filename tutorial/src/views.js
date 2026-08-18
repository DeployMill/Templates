// HTML rendering. Everything here is derived from src/content.js and
// src/config.js — to change what the tutorial SAYS, edit those; this file only
// decides how it looks.
//
// No template engine and no client-side framework on purpose: one file of
// readable string building, so an agent (or you) can change the markup without
// learning anything first.

import { html, raw } from "hono/html";
import { config, daysUntilExpiry } from "./config.js";
import { SETUP_LESSONS, ADVANCED_LESSONS } from "./content.js";
import { resolveClients } from "./clients.js";

/** Escape text destined for HTML. Everything in content.js goes through this,
 *  so a lesson can contain <, & or " without breaking the page. */
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** A copy-to-clipboard block. `label` names what's being copied. */
function copyBlock(label, value, variant = "prompt") {
  return `
    <div class="copy ${variant}">
      <div class="copy-head">
        <span class="copy-label">${esc(label)}</span>
        <button class="copy-btn" type="button" data-copy>Copy</button>
      </div>
      <pre class="copy-body"><code>${esc(value)}</code></pre>
    </div>`;
}

/**
 * A whole file shown on the page: collapsed by default (some are hundreds of
 * lines), with a copy button and a link to the raw URL. Collapsed rather than
 * omitted because the point is that you can read the thing before you run it —
 * a skill is a prompt someone else wrote for your agent, and pasting one you
 * haven't looked at is exactly the habit not to teach.
 */
function fileBlock(file, body) {
  if (!body) return "";
  const lines = body.replace(/\n$/, "").split("\n").length;
  return `
    <details class="filebox">
      <summary>
        <span class="filebox-name">${esc(file.name)}</span>
        <span class="filebox-meta">${lines} lines · click to read</span>
      </summary>
      <div class="filebox-body">
        ${file.description ? `<p class="note">${esc(file.description)}</p>` : ""}
        ${copyBlock(`Copy ${file.name}`, body, "command")}
        <p class="hint">
          Or fetch it raw: <a href="${esc(file.path)}">${esc(file.path)}</a> — same bytes,
          so you can point your agent straight at the URL.
        </p>
      </div>
    </details>`;
}

function lessonCard(lesson, index, fileBodies) {
  const body = lesson.body.map((p) => `<p>${esc(p)}</p>`).join("");
  const prompt = lesson.prompt ? copyBlock("Paste this to your agent", lesson.prompt) : "";
  const file = lesson.file ? fileBlock(lesson.file, fileBodies?.[lesson.file.path]) : "";
  const note = lesson.note ? `<p class="note">${esc(lesson.note)}</p>` : "";
  return `
    <li class="lesson reveal" id="lesson-${esc(lesson.id)}" data-lesson="${esc(lesson.id)}">
      <div class="lesson-head">
        <span class="lesson-num" aria-hidden="true"><span>${index + 1}</span></span>
        <h3>${esc(lesson.title)}</h3>
        <label class="lesson-done">
          <input type="checkbox" data-done="${esc(lesson.id)}" />
          <span>Done</span>
        </label>
      </div>
      <div class="lesson-body">${body}${prompt}${file}${note}</div>
    </li>`;
}

/** The connect lesson gets the client picker injected under its body — it's the
 *  one step you do by hand, so it needs more than a copy box. */
function clientPicker() {
  const clients = resolveClients(config.mcpUrl);
  const tabs = clients
    .map(
      (c, i) =>
        `<button class="tab${i === 0 ? " active" : ""}" type="button" data-tab="${esc(c.id)}">${esc(c.label)}</button>`
    )
    .join("");
  const panels = clients
    .map((c, i) => {
      const parts = [];
      if (c.command) parts.push(copyBlock("Run this", c.command, "command"));
      if (c.config) parts.push(copyBlock("Add this to your MCP config", c.config, "command"));
      if (c.after) parts.push(`<p class="note">${esc(c.after)}</p>`);
      return `<div class="panel${i === 0 ? " active" : ""}" data-panel="${esc(c.id)}">${parts.join("")}</div>`;
    })
    .join("");
  return `
    <div class="clients">
      <div class="tabs" role="tablist">${tabs}</div>
      ${panels}
    </div>`;
}

/** The free-window banner. This app costs the workspace nothing until the
 *  window closes — which means it also disappears when the window closes, and
 *  saying so early is the entire reason this banner exists. */
function expiryBanner() {
  const days = daysUntilExpiry();
  if (days === null) return "";
  const tone = days <= 1 ? "danger" : days <= 7 ? "warn" : "info";
  const when =
    days === 0
      ? "Its free window has closed."
      : days === 1
        ? "It's free for 1 more day."
        : `It's free for ${days} more days.`;
  return `
    <div class="banner ${tone}">
      <strong>This app is on the house.</strong>
      ${esc(when)} It doesn't use an app slot or draw on your included compute — and when the
      window closes it's deleted unless you keep it.
      <a href="${esc(config.dashboardUrl)}">Keep it or check the date →</a>
    </div>`;
}

/**
 * Render the whole page. `fileBodies` maps a lesson `file.path` to that file's
 * contents (see src/index.js) so a lesson can show a file in full without this
 * module touching the filesystem.
 */
export function renderPage(fileBodies = {}) {
  const greeting = config.greeting
    ? `<p class="greeting">${esc(config.greeting)}</p>`
    : "";
  const setup = SETUP_LESSONS.map((lesson, i) => {
    const card = lessonCard(lesson, i, fileBodies);
    // Splice the client picker into the connect lesson's body.
    return lesson.id === "connect"
      ? card.replace("</div>\n    </li>", `${clientPicker()}</div>\n    </li>`)
      : card;
  }).join("");
  const advanced = ADVANCED_LESSONS.map((lesson, i) =>
    lessonCard(lesson, i, fileBodies)
  ).join("");

  const total = SETUP_LESSONS.length + ADVANCED_LESSONS.length;

  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DeployMill — your tutorial app</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div class="aurora" aria-hidden="true"><span></span></div>
  <main>
    <header class="hero">
      <p class="eyebrow"><span class="dot" aria-hidden="true"></span>Your workspace${config.orgSlug ? ` · ${esc(config.orgSlug)}` : ""}</p>
      <h1>This app is <span class="grad">your tutorial.</span></h1>
      <p class="lede">
        It's a real, deployed app in your workspace — same repo, same pipeline, same everything as
        anything else you'll ship here. You learn DeployMill by changing it and watching the change
        go live.
      </p>
      ${raw(greeting)}
      <div class="progress" data-progress-meter>
        <div class="progress-top">
          <span class="progress-count"><span data-progress>0</span> of ${total} lessons done</span>
          <span class="progress-pct" data-progress-pct>0%</span>
        </div>
        <div class="progress-track" role="progressbar" aria-label="Lessons completed" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="0">
          <div class="progress-bar" data-progress-bar></div>
        </div>
      </div>
    </header>

    ${raw(expiryBanner())}

    <section>
      <h2>Set up</h2>
      <p class="sub">Four steps. Only the first one is manual.</p>
      <ol class="lessons">${raw(setup)}</ol>
    </section>

    <section>
      <h2>Then actually use it</h2>
      <p class="sub">
        Each of these runs a real platform feature against this app. Break it — that's what it's for.
      </p>
      <ol class="lessons">${raw(advanced)}</ol>
    </section>

    <footer>
      <a href="${esc(config.dashboardUrl)}">Dashboard</a>
      <a href="${esc(config.docsUrl)}">Docs</a>
      <span class="footer-note">
        Editing <code>src/content.js</code> in this repo changes what you're reading.
      </span>
    </footer>
  </main>
  <script src="/app.js"></script>
</body>
</html>`;
}
