# SpecKit Guide — RCField Spec Repo

SpecKit adds spec-driven development skills to Claude Code. Instead of asking AI to "just code it," you first write a specification, then AI builds from that spec with predictable results.

---

## How It Fits Into This Repo

```
rcfield-spec/
├── docs/spec/          ← Business rules, domain model, API contracts (source of truth)
├── .specify/
│   └── memory/
│       └── constitution.md   ← SpecKit's distilled project principles (AI reads this)
└── docs/speckit-guide.md     ← This file
```

The **constitution** is a living summary that SpecKit maintains. It reads your `docs/spec/` files and distills them into principles that guide AI behavior when planning and implementing features.

**Rule of thumb**: whenever `docs/spec/` changes, re-run `/speckit-constitution`.

---

## One-Time Setup (already done)

SpecKit is initialized. The `.specify/` directory and `.claude/skills/speckit-*` are already committed. Anyone who clones `rcfield-spec` gets the skills automatically — no extra install needed.

> If you're setting up a brand-new machine, install the CLI once:
> ```bash
> uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.8.7
> ```

---

## The Constitution — Keep It in Sync

The constitution at `.specify/memory/constitution.md` is the AI's "briefing document." It must reflect the current state of the project.

### When to re-run `/speckit-constitution`

| Trigger | Action |
|---------|--------|
| You add or update any file in `docs/spec/` | Re-run `/speckit-constitution` |
| Business rules change (payment logic, state machine, etc.) | Re-run `/speckit-constitution` |
| New domain entities are added to the domain model | Re-run `/speckit-constitution` |
| Tech stack decisions change | Re-run `/speckit-constitution` |
| First time setting up for a new AI session | Re-run `/speckit-constitution` |

### How to run it

Open Claude Code in `rcfield-spec/` and type:

```
/speckit-constitution

Read all files in docs/spec/ and update the constitution to reflect
the current business rules, domain model, and tech stack.
```

You can also pass specific context:

```
/speckit-constitution

We just added the dispute resolution flow in docs/spec/06-disputes.md.
Update the constitution to include dispute handling principles.
```

---

## Feature Development Workflow

Use this sequence every time you implement a new feature in `rcfield-app`.

### Step 1 — Describe the feature

```
/speckit-specify

Booking extension flow: a customer can request to extend their active
booking by 30/60/90 minutes. The provider approves or rejects within
10 minutes. If approved, extension_fee is charged from the security
deposit (max 50%). If rejected or timed out, booking continues normally.
```

Focus on **what** the feature does, not how to implement it. SpecKit writes the spec to `.specify/memory/spec.md`.

### Step 2 — Clarify ambiguities (optional but recommended)

```
/speckit-clarify
```

SpecKit asks structured questions about edge cases before planning. Run this when the feature touches payment logic or state transitions — those are the areas most likely to have hidden complexity.

### Step 3 — Create the implementation plan

```
/speckit-plan

Use NestJS for the API, TypeORM for database, follow the existing
module structure in rcfield-app/apps/api/src/bookings/
```

SpecKit produces a technical plan with chosen approach, file structure, and dependencies.

### Step 4 — Generate tasks

```
/speckit-tasks
```

Breaks the plan into ordered, atomic tasks. Each task maps to roughly one commit.

### Step 5 — Check consistency (optional)

```
/speckit-analyze
```

Cross-checks the spec, plan, and tasks for contradictions. Worth running for features that touch payments or the booking state machine.

### Step 6 — Implement

```
/speckit-implement
```

AI executes tasks in order, writing and testing code. You review each step.

---

## Git Skills

SpecKit also provides git workflow commands:

| Command | What it does |
|---------|-------------|
| `/speckit-git-feature` | Create a feature branch following the `feature/TP1-xxx` naming convention |
| `/speckit-git-commit` | Stage and commit with a conventional commit message |
| `/speckit-git-validate` | Validate branch, commit format, and PR readiness |

---

## Quick Reference

```
# Always do this first (or after any docs/spec/ change):
/speckit-constitution

# Then for each new feature:
/speckit-specify   → describe the feature
/speckit-clarify   → (optional) resolve ambiguities
/speckit-plan      → technical approach
/speckit-tasks     → task breakdown
/speckit-analyze   → (optional) consistency check
/speckit-implement → build it
```

---

## Files SpecKit Manages

| File | Description |
|------|-------------|
| `.specify/memory/constitution.md` | Project principles — updated by `/speckit-constitution` |
| `.specify/memory/spec.md` | Current feature spec — updated by `/speckit-specify` |
| `.specify/memory/plan.md` | Implementation plan — updated by `/speckit-plan` |
| `.specify/memory/tasks.md` | Task list — updated by `/speckit-tasks` |
| `.specify/templates/` | Templates SpecKit uses to generate the above |

These files are ephemeral per feature. After shipping, the important artifact is the committed code and the updated `docs/spec/` — not the `.specify/memory/` files.
