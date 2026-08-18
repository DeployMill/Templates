// THE TUTORIAL CONTENT — this is the file to edit.
//
// Every lesson on the site is a plain object in one of the two arrays below.
// Change a title, rewrite a prompt, add a lesson, delete one you don't care
// about: the page rebuilds itself from this data, so you never touch the
// rendering code to change what the tutorial says.
//
// That's deliberate. The whole point of this app is that you learn DeployMill by
// changing it and watching the change go live — so the thing you'll most want to
// change is in one obvious place.
//
// Field reference:
//   id       — stable, unique. The browser remembers which lessons you've ticked
//              off under this id, so renaming one resets its checkmark.
//   title    — the lesson heading.
//   body     — array of paragraphs (plain text; no HTML, it gets escaped).
//   prompt   — optional. A copy-paste instruction for your agent, shown in a
//              copy box. This is the heart of most lessons.
//   note     — optional. A short aside under the prompt (a caveat, a "what to
//              expect", a plan requirement).

/** Setup — get your agent talking to DeployMill. Do these in order. */
export const SETUP_LESSONS = [
  {
    id: "connect",
    title: "Connect DeployMill to your agent",
    body: [
      "DeployMill is driven by your AI coding agent over MCP — the Model Context Protocol. Point your client at the server URL below and sign in when it opens a browser window.",
      "Pick your client below for the exact command or config. Once it's connected your agent gains tools like start_project, deploy, create_preview and get_logs.",
    ],
    note: "This is the only step you do by hand. Everything after it is something you ask your agent to do.",
  },
  {
    id: "verify",
    title: "Check that it worked",
    body: [
      "Before going further, make sure your agent can actually see DeployMill. Ask it to look up your account — if it answers with your plan and your app quota, you're connected.",
    ],
    prompt: "Using deploymill, show me my account: my plan, how many apps I can run, and how much included compute I have left.",
    note: "If your agent says it has no DeployMill tools, the server isn't connected yet — go back a step.",
  },
  {
    id: "skill",
    title: "Install the DeployMill skill (optional)",
    body: [
      "The MCP tools are enough on their own. The skill just makes your agent proactive: when you mention a new project, a landing page or a prototype, it offers to build and deploy it instead of waiting to be asked.",
      "It's a folder with a SKILL.md in it. Drop it where your agent looks for skills — ~/.claude/skills/ for everything you work on, or .claude/skills/ inside one project.",
    ],
    prompt:
      "Fetch the DeployMill deploy-new-app skill from https://github.com/DeployMill/deploymill/tree/main/skills/deploy-new-app and install it into ~/.claude/skills/, then confirm it's picked up.",
    note: "Skip this if your client doesn't support skills — nothing else in this tutorial depends on it.",
  },
  {
    id: "first-edit",
    title: "Change this page and watch it go live",
    body: [
      "Here's the part that makes this real. This site is a normal app in your workspace, built from a normal Git repo. Your agent can edit it exactly like any other code.",
      "Ask for a change, then come back and refresh. The deploy takes a minute or two.",
    ],
    prompt:
      "The tutorial app in my DeployMill workspace has its lessons in src/content.js. Change the title of the first setup lesson to \"I edited this myself\", push it, deploy it, and tell me when it's live.",
    note: "Refresh this page after the deploy finishes and you'll see your own words at the top. That loop — ask, deploy, refresh — is all of DeployMill.",
  },
];

/** The real work. Each of these exercises one platform feature against this app. */
export const ADVANCED_LESSONS = [
  {
    id: "previews",
    title: "Ship a change safely with a preview",
    body: [
      "A preview is a full, isolated copy of this app running off a branch — its own URL, its own database branch, its own storage. Nothing it does can touch the live version.",
      "This is how you review a change before it's real. Previews expire on their own, so you can't accumulate them by forgetting.",
    ],
    prompt:
      "On my DeployMill tutorial app, create a branch called try-a-new-look, restyle the page on it, spin up a preview of that branch, and give me the preview URL.",
    note: "Open both URLs side by side — the preview changed, the live site didn't. When you're done, ask your agent to delete the preview.",
  },
  {
    id: "logs",
    title: "Read the logs when something breaks",
    body: [
      "Build logs and runtime logs both come back through the same tool, so your agent can diagnose a failure without you copying anything out of a dashboard.",
      "Try it on a real failure rather than a healthy app — a green log teaches you nothing.",
    ],
    prompt:
      "Break my DeployMill tutorial app on purpose — introduce a syntax error in src/index.js and deploy it. Then read the logs, tell me exactly what failed, and fix it.",
    note: "Watch what your agent does with the error. Reading the failure and fixing it is the loop worth trusting.",
  },
  {
    id: "rollback",
    title: "Undo a bad deploy",
    body: [
      "Every deploy keeps the image before it, so going back is a single call — not a git revert plus a rebuild plus a wait.",
      "You can also arm automatic rollback: if a deploy fails its health check, DeployMill puts the previous version back on its own, without anyone watching.",
    ],
    prompt:
      "Show me the deploy history for my DeployMill tutorial app, roll it back to the previous version, and then turn on automatic rollback so a failed health check reverts itself.",
    note: "Automatic rollback lives in .deploymill/project.json as rollback: \"auto\" — your agent applies it with reconcile_project.",
  },
  {
    id: "env",
    title: "Configure it with env vars and secrets",
    body: [
      "Plain configuration goes in env vars. Anything sensitive goes through the secrets flow instead — and that flow is built so the value never passes through your agent at all: you get a one-time link and type it in yourself.",
      "That's the difference between a config value and a credential, enforced rather than suggested.",
    ],
    prompt:
      "Set an env var called TUTORIAL_GREETING on my DeployMill tutorial app, show me how the app would read it, then walk me through storing a fake API key as a real secret.",
    note: "This page reads TUTORIAL_GREETING if you set one — look at the top of the page after the deploy.",
  },
  {
    id: "sleep",
    title: "Understand sleeping and your compute pool",
    body: [
      "Apps sleep when nobody's using them and wake on the next request. That's why an idle app costs you almost nothing — your plan includes a pool of awake compute, and a sleeping app draws none of it.",
      "This tutorial app is on a short idle window, so it sleeps quickly. The first load after a while may take a moment while it wakes.",
    ],
    prompt:
      "For my DeployMill workspace, show me how much of my compute pool I've used, which apps are drawing on it right now, and what my apps' idle windows are set to.",
  },
  {
    id: "database",
    title: "Add a database",
    body: [
      "This tutorial ships without one so it stays fast, but adding managed Postgres is a single ask. DeployMill provisions it, injects DATABASE_URL, and takes backups on a schedule.",
      "Previews get their own isolated copy of the database, which is what makes it safe to test a migration.",
    ],
    prompt:
      "Add a managed Postgres database to my DeployMill tutorial app, then add a page that records how many times each lesson has been marked done and shows the totals.",
    note: "Once it has a database, ask your agent about backups — listing them, verifying one, and restoring from one.",
  },
  {
    id: "domain",
    title: "Put it on your own domain",
    body: [
      "Apps get a working URL immediately. Attaching a domain you own is a separate step: your agent tells you the DNS record to add, then attaches the domain and provisions the certificate.",
      "Custom domains need a paid plan.",
    ],
    prompt:
      "I want to put my DeployMill tutorial app on a domain I own. Walk me through it — tell me the DNS record to add, then attach the domain once it resolves.",
    note: "The DNS record is the one thing nobody can do for you — it's your registrar, your account.",
  },
];
