# Design decisions

Why this repo exists and why it's shaped the way it is. Read this before changing
the manifest format or the directory layout.

## Why a separate repo (not baked into the server)

Starter templates were originally baked into the DeployMill server image
(`src/templates/`, copied to `dist/templates/` at build). That meant every
improvement to a starter required a full server deploy, and there was no path for
an organization to supply their own starters.

Moving them here makes them **data, not code**: they improve on their own cadence,
they're reviewable in isolation, and they establish the exact format an org will
later use to bring their own templates. The server still vendors a copy as an
offline fallback, but this repo is the source of truth.

## Why fetched at runtime (unified path)

The server fetches templates at runtime rather than vendoring them at build. This
is deliberate so that the **same code path** serves both the official templates
(this repo) and, later, an org's own custom templates repo. One loader, one
manifest format, one cache — official is just the default source. A build-time
vendor would have forced two divergent code paths.

To keep this safe, the server keeps a vendored copy of these templates and falls
back to it on any fetch/parse failure. The fallback is seeded identical to this
repo, so "repo unreachable" degrades to "slightly stale," never "broken."

## Why this repo is public and under its own org

The server reads this repo through GitHub's **public** APIs (Git Trees +
`raw.githubusercontent.com`), not through the DeployMill GitHub App installation.
The App is installed under a different owner, and an installation token would
**404** on a repo outside its installation. Keeping this repo public means the
read needs no special grant; an App token is sent only as a best-effort
rate-limit raiser, never as a correctness requirement.

Public also makes this repo a usable public reference for orgs building their own
templates repos.

## Why per-template manifests + a thin root index

Each template directory owns its metadata (`deploymill.json` in the directory),
with the root index just naming the directories. This keeps a template
self-contained: adding one is "drop a directory + its manifest + list it," with
no central registry to edit beyond a one-line index entry. It's also the friendly
shape for a custom repo — an org can copy a single directory between repos and it
carries everything it needs.

## Why `stack` groups web + worker variants

The agent-facing catalog presents one entry per runtime (`node`, `python`,
`static`) with a `workloads` array, not one entry per directory. The `stack`
field is what ties `node/` and `worker-node/` together into a single `node`
catalog entry. A stack must have a `web` variant to appear; `static` is web-only.

## `schemaVersion` must stay additive

The server validates manifests against `schemaVersion: 1`. A server that sees a
higher `schemaVersion` it doesn't understand will reject the manifest and fall
back to its vendored copy — a safe failure (keeps shipping working, if older,
templates). Therefore: prefer **additive, optional** fields within v1; only bump
`schemaVersion` for a genuinely breaking change, knowing older servers will fall
back until they're updated.

## Deferred: bring-your-own templates (Part 2)

The per-org custom templates source — an org pointing DeployMill at their own
repo (public, or private via a connected source account), with the ownership /
access guard that implies — is a separate, later piece of work. This repo's
format is designed to be exactly what that feature consumes, so Part 2 is "add a
second source," not "reshape the format."
