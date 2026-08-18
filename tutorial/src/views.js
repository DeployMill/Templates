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

function lessonCard(lesson, index) {
  const body = lesson.body.map((p) => `<p>${esc(p)}</p>`).join("");
  const prompt = lesson.prompt ? copyBlock("Paste this to your agent", lesson.prompt) : "";
  const note = lesson.note ? `<p class="note">${esc(lesson.note)}</p>` : "";
  return `
    <li class="lesson" id="lesson-${esc(lesson.id)}" data-lesson="${esc(lesson.id)}">
      <div class="lesson-head">
        <span class="lesson-num" aria-hidden="true">${index + 1}</span>
        <h3>${esc(lesson.title)}</h3>
        <label class="lesson-done">
          <input type="checkbox" data-done="${esc(lesson.id)}" />
          <span>Done</span>
        </label>
      </div>
      <div class="lesson-body">${body}${prompt}${note}</div>
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

export function renderPage() {
  const greeting = config.greeting
    ? `<p class="greeting">${esc(config.greeting)}</p>`
    : "";
  const setup = SETUP_LESSONS.map((lesson, i) => {
    const card = lessonCard(lesson, i);
    // Splice the client picker into the connect lesson's body.
    return lesson.id === "connect"
      ? card.replace("</div>\n    </li>", `${clientPicker()}</div>\n    </li>`)
      : card;
  }).join("");
  const advanced = ADVANCED_LESSONS.map(lessonCard).join("");

  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DeployMill — your tutorial app</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main>
    <header class="hero">
      <p class="eyebrow">Your workspace${config.orgSlug ? ` · ${esc(config.orgSlug)}` : ""}</p>
      <h1>This app is your tutorial.</h1>
      <p class="lede">
        It's a real, deployed app in your workspace — same repo, same pipeline, same everything as
        anything else you'll ship here. You learn DeployMill by changing it and watching the change
        go live.
      </p>
      ${raw(greeting)}
      <div class="progress"><span data-progress>0</span> of ${SETUP_LESSONS.length + ADVANCED_LESSONS.length} done</div>
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
