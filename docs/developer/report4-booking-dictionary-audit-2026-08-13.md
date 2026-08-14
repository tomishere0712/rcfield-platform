# Report 4 Booking/Payment and Data Dictionary Audit — 2026-08-13

## Result

- Booking/payment was split into six state-connected workflows for portrait readability: draft reuse; availability and PENDING persistence; checkout snapshot/method resolution; payment initiation; shared confirmation/ledger; bank-transfer reconciliation.
- The six diagrams retain the established Actor/Screen/API/Service/Database/Third-party visual convention.
- Security deposit was removed from the new booking/payment figures because the current payment engine does not create it for new bookings.
- BANK_TRANSFER/VietQR and late-payment `NEEDS_REVIEW` handling are included and converge on the same confirmation function as VNPay.
- Attribute Data Dictionary was rebuilt from the live 70-table scope in `06-database.md`; current result is 843 attribute rows, numbered 1–70.
- Removed or never-built tables are absent: `customer_vehicles`, `subscriptions`, `package_usages`, `promotion_usages`, `disputes`, `incidents`, `trust_score_logs`, `cafe_announcements`, `notification_logs`, and other out-of-scope Phase 1 tables.
- Figure captions are unique and sequential from Figure 11 through Figure 66.

## Verification

- Word opened and exported the updated document successfully: 114 pages.
- All rendered pages were visually reviewed; no clipping, overlap, broken table continuation, missing image, or displaced figure was found.
- Structural audit: 70 unique table numbers, 70 unique current table names, 843 attribute rows, 56 unique figure captions.
