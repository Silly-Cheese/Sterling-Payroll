# Sterling Payroll 6.0 — Release Guide

**Website:** https://silly-cheese.github.io/Sterling-Payroll/  
**Repository:** https://github.com/Silly-Cheese/Sterling-Payroll  
**Firebase:** sterling-payroll-5d200

**Simulation only.** Never enter real SSNs, bank accounts, taxpayer IDs or private financial records. Sterling Payroll does not transfer real money or file taxes.

## Phase 5 — Client services

The Client Services workspace now contains fictional Starter/Standard/Enterprise service agreements, renewal dates, monthly/annual billing cycles and advisory seat limits. The Billing tab includes invoices, allowed status transitions, due dates, a searchable/paginated register, mock payments and credits in an append-only ledger, and a simulation-labeled CSV statement. These entries do not settle real debts or call a payment processor.

The Support tab includes categories, priorities, SLA-style elapsed-hour targets, active-member assignment, search and pagination, public case updates and separately authorized internal staff notes. Payment reconciliation is browser-calculated and **not a certified server-side accounting system**.

## Phase 6 — Reliability and assurance

The user interface has grouped navigation, role-sensitive quick actions, Ctrl/Cmd+K or / page search, redesigned service pages, responsive layouts and an offline indicator.

The client administrator's **Assurance Center** provides scoped integrity reports, asset health checks, searchable activity events, advisory retention settings and client JSON exports. Exports use an allowlist, exclude Auth secrets and private conversations, and explicitly mark partial datasets when capped.

Activity records are append-only in Firestore, but a privileged browser is **not technically forced to log every possible write**. Automated GitHub Actions checks include Node tests, a Firestore emulator permission suite and asset checks. Nightly CI checks the repository; it does not contact the production database.

Existing owner controls support in-place finalized-payroll corrections with immutable before/after revisions, approval overrides, selected record deletion and voiding of payroll runs containing history.

## Publish Firestore rules — required

1. Check [GitHub Actions](https://github.com/Silly-Cheese/Sterling-Payroll/actions) for successful **Quality Checks** and **Publish Sterling Payroll** runs.
2. Open [Firebase Firestore Rules](https://console.firebase.google.com/project/sterling-payroll-5d200/firestore/rules).
3. Copy the complete current [firestore.rules](./firestore.rules) into the Firebase Rules editor and click **Publish**.
4. Refresh the website and select an authorized client company.

**GitHub Pages publishing does not deploy Firestore security rules.** Do not paste private service-account keys into the browser.

## Roles and permissions

| Capability | Sterling owner/admin | Client admin | Payroll specialist | Viewer | Linked employee |
|---|---|---|---|---|---|
| Fictional invoice and service plan management | Yes | Yes | View | View | No |
| Mock payments and ledger adjustments | Yes | Yes | No | No | No |
| Open support cases | Yes | Yes | Yes | Yes | No |
| Internal case notes / assignments | Yes | Yes | No | No | No |
| Assurance reports, exports, retention settings | Yes | Yes | No | No | No |
| Correct finalized pay directly | Owner only | No | No | No | No |
| View own final pay lines | Per normal access | Per normal access | Per normal access | No | Own linked record only |

No account becomes owner just by signing up. Existing trusted owner authorization is maintained separately.

## Live acceptance checklist

- Create a fictional company, add two accounts with different roles, and ensure a Viewer cannot see another client's data.
- Create and issue a fictional invoice. Record a mock payment and credit, inspect the balance, and export the CSV.
- Open a support case as Viewer. Verify internal notes remain inaccessible while client-visible replies work.
- Test independent fictional payroll approval and in-place owner correction of a finalized line with a preserved revision.
- Run Assurance Center, review partial-coverage flags and download the simulation-only export.
- Check keyboard navigation, mobile layouts and GitHub's **firestore-security** emulator test job.

## Recovery and limits

Rollback application code using a GitHub revert followed by Pages deployment. Inspect security implications before changing deployed Firestore Rules. The browser's JSON export is **not** an automatically restorable, full Firestore database backup.

This is a completed simulated frontend and test-tooling release, **not** a certified financial system. Server-recomputed payroll, exhaustive audit enforcement, offsite automatic backup, actual uptime monitoring and professional accessibility certification require further trusted infrastructure and live testing.
