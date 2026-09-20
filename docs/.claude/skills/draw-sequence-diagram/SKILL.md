---
name: "draw-sequence-diagram"
description: "Analyze documents or descriptions and generate a structured Mermaid sequence diagram document following the project template."
argument-hint: "File path(s) to analyze OR natural language description of the flow to diagram"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

The input may be one of:
- One or more **file paths** (absolute or relative to repo root) — read and analyze them
- A **natural language description** of the flow to diagram
- A **mix** of both — file paths for context + description to scope the diagram

## Step 1 — Parse Input & Gather Context

**Detect input type:**

- If the input contains a path-like string (starts with `/`, `./`, `../`, or ends with `.md`, `.docx`, `.txt`, `.pdf`):
  - Read each file using the Read tool
  - If a file cannot be read, note it and continue with what is available
- If the input is natural language only:
  - Skip file reading; proceed directly to Step 2

**Always also read these project context files** (regardless of input type):
- `docs/spec/00-overview.md` — actors, scope
- `docs/spec/01-domain-model.md` — entities, enums
- `docs/spec/02-state-machine.md` — booking states and transitions
- `docs/spec/03-payment-engine.md` — payment components and rules
- Any other `docs/spec/` files relevant to the flow being diagrammed

**Scan source code for existing API implementations:**

Check if the backend source exists at `../rcfield-app/apps/api/src/` (relative to workspace root):

- If the path **exists**: scan for routes and controllers relevant to this flow:
  - Search `routes/` for router files matching keywords in the flow (e.g., `booking`, `payment`, `inspection`)
  - Search `controllers/` for handler methods on those routes
  - Extract **actual HTTP method + path** (e.g., `POST /bookings`, `PATCH /bookings/:id/confirm`) and **actual function names**
  - Use these real values in the diagram — override any spec-derived placeholders
  - In the **Key Files** section, link to the actual source files found
  - Add an `> [IMPLEMENTED]` badge next to each endpoint that exists in code

- If the path **does not exist** (no codebase yet):
  - Derive endpoint paths from `docs/spec/05-api-contracts.md` if available, otherwise infer from spec logic
  - Mark each inferred endpoint with `> [REFERENCE ONLY — not yet implemented]` in the diagram notes
  - Add a callout at the top of the document: `> ⚠️ API endpoints shown are derived from spec only. Verify against implementation when codebase is available.`

**Participant vocabulary for this project** (use these consistently):

| Short | Label | Context |
|-------|-------|---------|
| `U` | `Customer` | End user |
| `P` | `Provider` or `Staff` | Cafe operator / staff member |
| `M` | `Frontend<br/>(React / [PageName])` | ReactJS client |
| `B` | `API<br/>(Express + TS / [RouterName])` | TypeScript + Express backend |
| `DB` | `PostgreSQL` | Database via TypeORM |
| `SM` | `StateMachine<br/>(BookingService)` | Booking state machine |
| `PE` | `PaymentEngine<br/>(PaymentService)` | Payment component logic |
| `V` | `VNPay` | Payment gateway |
| `S3` | `S3 Storage` | Photo/file storage |
| `N` | `Notify<br/>(Push/SMS)` | Notification service |
| `A` | `Admin` | Platform admin |

Use only the participants actually involved in the flow. Do not include unused participants.

## Step 2 — Analyze & Extract Flow

From the gathered context, extract:

1. **Flow name** — short, descriptive (e.g., "Booking Lifecycle", "Check-in Inspection")
2. **Actors involved** — which participants appear in this flow
3. **Technical identifiers** — enums, status codes, endpoint paths, event names relevant to this flow
4. **Flow blocks** — natural groupings of steps (e.g., "Create Booking", "Payment Confirmation", "Check-in")
5. **Conditional branches** — alt/else scenarios (happy path + error/edge cases)
6. **Async / timeout steps** — polling loops, timeout rules, auto-confirm behaviors
7. **Parallel calls** — fan-out patterns (use `par` block)
8. **Key files** — which source files (controller, service, entity, page) are involved
9. **Open questions** — anything ambiguous or not specified in the docs

If input documents contain contradictions or gaps, note them as Open Questions.

## Step 3 — Draft the Document

Generate a Markdown document following this exact structure:

---

```markdown
# Sequence Flow: {FLOW_NAME}

{One-sentence description of what this flow covers and which spec docs it is based on.}

> See **Reference** at the bottom for related docs and legend.

---

## 0. Identifiers

| Field | Value | Notes |
|-------|-------|-------|
| Entity | `EnumValue` | Brief note |
| Endpoint | `POST /path` | Which controller handles it |
| Event | `BookingEvent.X` | Which transition it triggers |
| Status codes | `BookingStatus.PENDING → CONFIRMED` | State path covered |

(Include only identifiers directly relevant to this flow.)

---

## 1. {Block Name}

{1–2 sentences describing what this block covers.}

​```mermaid
sequenceDiagram
    autonumber
    participant U as Customer
    participant M as Frontend<br/>(Next.js / PageName)
    participant B as API<br/>(NestJS / ControllerName)
    participant DB as PostgreSQL

    U->>M: action description
    M->>B: POST /endpoint {payload}
    B->>DB: query / persist
    DB-->>B: result
    B-->>M: ResponseDto
    M->>U: UI update

    alt Happy path
        Note over B: business rule applied
        B-->>M: success response
    else Error case
        B-->>M: error { code, message }
        M->>U: error display
    end
​```

{Follow-up notes, table of outcomes, or edge case explanations if needed.}

---

## 2. {Next Block Name}

{Description.}

​```mermaid
sequenceDiagram
    autonumber
    ...
​```

---

(Repeat for each logical block in the flow.)

---

## {N}. Decision Logic Summary

Summary table of server/client states and their resulting actions. Mirrors the state
machine transitions covered in this flow.

| State / Condition | Action / Routing |
|-------------------|-----------------|
| `BookingStatus.PENDING` + payment not confirmed | Show payment pending screen |
| `BookingStatus.CONFIRMED` | Show booking confirmed, await check-in |
| ... | ... |

---

## {N+1}. Key Files

### Backend (`rcfield-app/apps/api`)

| Area | Path | Note |
|------|------|------|
| Controller | `src/{module}/{name}.controller.ts` | Handles which endpoints |
| Service | `src/{module}/{name}.service.ts` | Business logic |
| Entity | `src/{module}/entities/{name}.entity.ts` | DB entity |
| DTOs | `src/{module}/dto/*.dto.ts` | Request/response shapes |

### Frontend (`rcfield-app/apps/web`)

| Area | Path | Note |
|------|------|------|
| Page | `app/[locale]/{route}/page.tsx` | Main screen |
| Component | `components/{name}/` | UI components |
| API hook | `hooks/use-{name}.ts` | React Query hook |

---

## {N+2}. Open Questions

1. **{Topic}**: {What is unclear or needs confirmation.}
2. **{Topic}**: {What is unclear or needs confirmation.}

(If none, write: *No open questions — all behavior is fully specified in the referenced docs.*)

---

## {N+3}. Application Flow Overview

High-level flowchart showing the full flow across all actors. Use `flowchart LR` with
subgraphs per actor lane.

​```mermaid
flowchart LR
    subgraph Customer["Customer (Frontend)"]
        direction TB
        C1["Step 1"]
        C2["Step 2"]
        C1 --> C2
    end

    subgraph Backend["API (NestJS)"]
        direction TB
        B1["Process"]
        B2["Persist"]
        B1 --> B2
    end

    C1 --> B1
    B2 --> C2

    classDef happy  fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef error  fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef wait   fill:#fff4d6,stroke:#b8860b,color:#5c3c00
​```

---

## Reference

### Related docs
- `docs/spec/00-overview.md` — Project overview and actors
- `docs/spec/02-state-machine.md` — Booking state transitions
- `docs/spec/03-payment-engine.md` — Payment rules
- *(list other docs read during analysis)*

### Legend
- **Frontend** = `rcfield-app/apps/web` (Next.js 14 App Router)
- **API** = `rcfield-app/apps/api` (NestJS 10)
- **SM** = `BookingsService.transition(bookingId, event)` — all state changes go here
- **PE** = `PaymentsService` — all payment component operations go here
- `-->>` = response / async return
- `->>` = request / call
- `opt` = optional step (may or may not occur)
- `alt/else` = conditional branch
- `loop` = polling or retry
- `par` = parallel fan-out

---

*Last updated: {TODAY} · Based on: {list of source docs analyzed}*
```

---

## Step 4 — Write the File

Determine the output file path:
- If the flow name is clear: `docs/diagrams/sequence/sequence-flow-{kebab-case-name}.md`
- If a source file was given and flow name is derivable from it: use that name under `docs/diagrams/sequence/`
- Ask the user to confirm the file name if ambiguous

Write the completed document to the determined path.

## Step 5 — Output Summary

After writing the file, report:

1. **File written**: path to the generated file
2. **Blocks generated**: list of sections created (e.g., "1. Create Booking, 2. Payment, 3. Check-in")
3. **Source docs analyzed**: which files were read
4. **Open questions count**: how many items need clarification
5. **Suggested next step**: e.g., "Run `/speckit-specify` to turn this flow into a feature spec" or "Share with team for review"

## Formatting Rules

- `autonumber` MUST appear at the top of every `sequenceDiagram`
- Participant labels use `<br/>` for second line (e.g., `as API<br/>(NestJS / BookingsController)`)
- All endpoint paths must include HTTP method: `POST /bookings`, `GET /bookings/:id`
- Use `Note over X,Y: text` to annotate business rules inline
- Timeout rules from `docs/spec/02-state-machine.md` MUST appear as `Note` or `opt` blocks where relevant
- Payment rules from `docs/spec/03-payment-engine.md` MUST appear as `Note` blocks where relevant
- Error responses use `B-->>M: error { code: "ERROR_CODE", message: "..." }` with the exact error code from `docs/spec/05-api-contracts.md`
- Use `classDef happy/error/wait` in flowcharts for color coding
- Never leave a section empty — if a block has no diagram (e.g., pure backend async), use a `flowchart` instead of `sequenceDiagram`
