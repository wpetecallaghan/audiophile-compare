# Claude Code: skills vs. context files

Why this project keeps AI-facing reference material in `__claude_context__/`
instead of Claude Code's built-in Skill system (`.claude/skills/<name>/SKILL.md`).

---

## What a Claude Code "Skill" actually is

A Skill is auto-discovered from `.claude/skills/<name>/SKILL.md` (or from a
plugin). Its `name` and `description` frontmatter are scanned and surfaced in
an "available skills" list at the start of every session — cheaply, without
loading the skill's full body. The model matches a task to a skill's
description and invokes it by name via a dedicated tool, which is when the
full content actually loads. Users can also invoke a skill directly by typing
`/name`. A skill's directory can bundle extra resources (scripts, templates,
reference files) alongside `SKILL.md`.

None of that infrastructure is in play for this project's `__claude_context__/`
files. There is no `.claude/skills/` directory here. Files like
`entry.md`, `core.md`, and `testing.md` use `name:`/`description:` frontmatter
that *looks* like a skill's, but nothing parses or acts on it — they never
appear in an available-skills list and can't be invoked with `/name`. They are
loaded exactly one way: `CLAUDE.md` (read automatically every session)
contains a routing table, and the model follows it by calling the `Read` tool
on whichever file matches the current task.

---

## `__claude_context__/` + `CLAUDE.md` routing (current approach)

**Benefits**

- No dependency on Claude Code's Skill infrastructure — plain markdown and the
  `Read` tool, portable and simple.
- Fully transparent: the entire loading logic is one human-readable table in
  `CLAUDE.md`, not an opaque description-matching step.
- No structural constraints on file layout — arbitrary filenames, easy to
  split or merge as the project grows. (This repo already did that once —
  see the "Refactor skills file into distinct focussed smaller files" commit.)

**Disadvantages**

- Purely convention-based, with no enforcement. Nothing stops a session from
  skipping the table and never loading `testing.md` before writing a test —
  it depends entirely on the model noticing and choosing to follow it.
- Invisible to the user. A real skill shows up in the available-skills list
  and can be invoked directly; these files only surface if someone reads
  `CLAUDE.md`'s table.
- The frontmatter is decorative, so nothing validates it. That's part of why
  an audit of this directory turned up a missing section number, a couple of
  cross-references pointing at sections that didn't exist, and contradictory
  build-status claims across files — all invisible until someone actually
  read every file end to end.

## `.claude/skills/<name>/SKILL.md` (the alternative)

**Benefits**

- Real discoverability: skills are scanned and listed every session (name +
  description only), with full content lazy-loaded only on invocation —
  better context economy than "hope the model reads the `CLAUDE.md` table."
- User-invokable directly via `/name`, independent of whether the model
  decides to load it on its own.
- Each skill gets its own directory, so it can bundle scripts or reference
  files alongside the instructions — a flat `.md` file can't do that.

**Disadvantages**

- Heavier structure: one directory per skill, and the `description` now has
  to double as a trigger condition. A vague description means the model
  invokes the wrong skill, or none at all — a failure mode this project
  doesn't currently have.
- Writing a good trigger description is a harder problem than writing a
  routing-table row a human can just read and follow.
- Most of this project's `__claude_context__/` content is reference material
  (schema, file layout, established conventions) that should load for nearly
  every task in the repo, not narrowly-triggered procedural knowledge — a
  weaker fit for a system built around per-task invocation.

---

## Why this project uses context files

The content in `__claude_context__/` is fundamentally *reference material* —
the database schema, the file layout, API conventions, established patterns —
not narrowly-scoped procedures competing for relevance against other skills.
`entry.md` already establishes that almost every task should read `core.md`
first and then one further file; there's no meaningful set of competing
skills to disambiguate between. The Skill system's overhead (per-skill
directories, discovery-quality descriptions, `/name` invocation) pays for
itself when a project has many candidate skills and wants direct user
invocation. Neither condition holds here, so the simpler, fully-transparent
`CLAUDE.md`-routed approach is the better fit.

If a genuinely procedural, narrowly-triggered capability shows up later — for
example something you'd want to invoke by typing `/something` — that's the
signal to add a real skill under `.claude/skills/`, alongside (not instead
of) the existing context files.

---

## Would `.claude/skills/` be committed to git?

Yes. This repo's `.gitignore` has no `.claude/` exclusion at all. The one
file currently ignored under `.claude/` — `settings.local.json` — is excluded
via a *personal* global gitignore (`~/.gitignore_global`), not anything
project-level; that's the standard convention for personal/machine-specific
settings. Skill and agent definitions are project artifacts meant to be
shared with the team, exactly like `CLAUDE.md` itself — nothing would stop
`.claude/skills/<name>/SKILL.md` from being tracked and committed normally.
