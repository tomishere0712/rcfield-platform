# Report 4 Sequence and Figure Audit — 2026-08-13

## Audit baseline

- Report: `Report4_Software Design Document.docx`
- Backend baseline: `rcfield-be` at `bf3a7b9` (2026-08-13)
- Specification baseline: `rcfield-spec` at `c801fa8` (2026-08-13)
- Existing Report 4 sequence figures: Figure 20 through Figure 57, with 29 embedded `rcfield_sequence_*.png` assets.

## Material changes found

| Area | Previous Report 4 representation | Current implementation/specification | Required action |
|---|---|---|---|
| Booking payment | VNPay-only checkout and confirmation | Branch-selectable bank transfer, VietQR, webhook matching, pending reconciliation, and sandbox bank | Add a bank-transfer checkout/reconciliation sequence; retain VNPay as a supported legacy/alternate flow |
| Provider subscription | Manual payment request/admin confirmation | PayOS link creation, webhook verification, idempotent activation, and one-time trial tracking | Add PayOS subscription sequence and update subscription narrative |
| Contest operations | Lifecycle, registration, result, leaderboard | Immutable contest ledger plus finance summary and manual income/expense entries | Add contest finance sequence and include ledger entity in database/class coverage |
| Damage checkout | Aggregate damage/dispute sequence | Itemized `damage_line_items`, in-person confirmation, additional payment, and dispute preservation | Replace/extend the damage checkout figure with the itemized sequence |
| Menu configuration | Menu/package/promotion aggregate flow | Provider-defined categories with ordering, uniqueness, linked-item delete guard | Add custom menu category sequence |
| Database | Earlier grouped database figures | New/refactored `cafe_payment_settings`, `bank_transactions`, `contest_ledger_entries`, `damage_line_items`, `menu_categories`, `provider_trial_used_at`; superseded subscription/customer-vehicle structures dropped | Refresh Figures 15–18 from the current `06-database.md` model before final publication |

## Source evidence reviewed

- Backend controllers/routes/services/entities/migrations for PayOS, bank payment/webhook, contest finance/ledger, damage line items, menu categories, subscription lifecycle, and cafe availability.
- Specs `016` through `019`, plus `docs/spec/03-payment-engine.md`, `04-inspection-flow.md`, `05-api-contracts.md`, and `06-database.md`.
- Existing sequence Markdown, draw.io XML exports, visual draw.io exports, SVG naming/index convention, and Report 4 figure captions/layout.

## Diagram update set

The canonical additions are in `sequence-flow-2026-08-finance-and-operations.md`:

1. Booking Checkout by Bank Transfer and Webhook Reconciliation
2. Provider Subscription Checkout through PayOS
3. Contest Finance Ledger and Summary
4. Itemized Damage Charge, Customer Confirmation, and Additional Payment
5. Provider Custom Menu Category Management
6. Finance and Operations Update class diagram

## Review gate

- [x] Mermaid blocks render without syntax errors.
- [x] SVG files follow the existing `sequence-flow-<file>.md-<n>.svg` naming convention.
- [x] New figures use the existing Report 4 heading/caption/image paragraph pattern.
- [ ] Figure captions and TOC fields are refreshed without changing the document's style definitions, margins, headers, or footer.
- [x] Final DOCX sequence-update draft was repaired by Word, exported to a 62-page QA PDF, and visually inspected page-by-page. Figures 58-63 render without clipping or overlap and retain the existing heading/image/caption pattern.

## Remaining database-document gap

Resolved in `Report4_Software Design Document_Final.docx`:

- Figures 15-18 were regenerated from the 70-table running-schema scope and current backend entities.
- All three database placeholders were replaced with actual diagrams.
- Table descriptions now include the material August 2026 additions, including branch payment settings/reconciliation, itemized damage, contest finance, and custom menu tables.
- The attribute dictionary now includes key fields for `cafe_payment_settings`, `bank_transactions`, `contest_ledger_entries`, `damage_line_items`, and `menu_categories`, plus `trial_used_at`.
- The obsolete `customer_vehicles` table/FK reference was removed from Report 4.
- Word opened the final DOCX without repair, exported a 67-page QA PDF, and every page was visually inspected at 100% Word zoom. No clipping, overlap, missing figure, or broken table was found.

## Final status

**Approved for reviewer handoff.** The source document layout, styles, headers, footers, existing section order, and caption pattern were preserved. The page-count increase is caused only by the added database rows and new Figures 58-63.

## Oversized sequence follow-up (2026-08-13)

- Audited every sequence image embedded in the current Report 4 by its actual Word extent. Only Figure 44 exceeded the usable portrait-page height (`10.89 in`) among sequence diagrams. The similarly tall adjacent figure was a class diagram, so it was deliberately left outside the requested split scope.
- Reconciled the Facebook Messenger flow with `fb-webhook.controller.ts`, `fb-chat.queue.ts`, `fb-chat.worker.ts`, `fb-messenger.service.ts`, `fb-messenger.formatter.ts`, and the FE Facebook channel configuration API. The FE does not participate in webhook runtime processing.
- Removed stale multi-cafe selection/session behavior from the documented runtime flow. Current source maps a Page directly to one connected `CafeChannel`, acknowledges the webhook immediately, enqueues into BullMQ, serializes jobs per PSID, deduplicates by message MID, and then performs gate/quota/NLU/RAG/response delivery.
- Split the former Figure 44 into three page-sized sequence diagrams: webhook intake and queue dispatch; queue worker/PSID ordering/deduplication; AI routing and Messenger response delivery.
- Renumbered downstream captions to Figures 47-68. Word structural audit reports 58 unique figure captions spanning 11-68 with no gaps or duplicates. Word exported the revised document successfully to 115 pages.
