# Sterling Payroll — Six-Phase Delivery Plan

## Phase 1 — Platform foundation and working starter
**Status: implementation committed; browser authorization tests still required.**

Deliverables:
- Independent Sterling Payroll GitHub repository and project configuration
- Black/cream responsive brand shell, platform and client navigation
- Firebase email/password registration, password reset and sign-in
- Trusted pre-existing platform owner; no public auto-claim, and client-default registration
- Client company creation and isolation by Firestore Security Rules
- Invite-by-email client memberships with admin, payroll and viewer roles
- Starter employee directory, time entry and simulated payroll calculations
- Draft → submit → independent approval → finalization workflow
- GitHub CI checks, GitHub Pages workflow and setup guide

Acceptance criteria: GitHub checks pass, owner can create client, invited verified user joins, unauthorized user receives permission denial, payroll can be calculated and approved by distinct accounts. Last four require live verification.

## Phase 2 — Full client & employee operations
**Status: implementation committed; live security and onboarding tests pending.**
- Client account life cycle, contact data, suspended clients and service tiers
- Employee directory improvements, editing and bulk imports
- Advanced departments, jobs, pay policies and employee lifecycle
- Secure staff invitations, membership revocation and role management
- Better forms, custom confirmation dialogs, inline field validation, mobile polish
- Employee/time/payroll list pagination and scoped personnel search
- Explicit owner-granted staff roles and client membership rather than email verification workflow

Acceptance criteria: no manual Firebase IDs in routine operations, owner can manage client lifecycle and staff records entirely from the UI, no cross-tenant data access.

## Phase 3 — Payroll operations suite
**Status: implemented in repository with automated tests; Firebase rules publication and browser acceptance testing pending.**
- Timesheet approvals, immutable correction requests, paid leave, period-based review (holiday calendars not yet implemented)
- Configurable roleplay pay policies and deduction/bonus templates
- Versioned payroll input snapshots and exception review
- Payroll run comparisons, existing separation-of-duty approvals and separate correction drafts
- Downloadable simulated company payroll CSV statements (individual printable paystubs remain Phase 4)

Acceptance criteria: runs are internally consistent, correction approvals protected by Firestore, no real payments. Cross-account browser and Firestore emulator testing still required.

## Phase 4 — Employee & client self-service
**Status: initial employee-portal release implemented and deployed; live Firestore acceptance testing pending.**
**Status: implemented in repository; GitHub deployment and end-to-end Firebase security testing required.**
- Employee-scoped private portal that restricts access to employer-linked HR identities
- Company announcements, employee/employer private messages, fictional text-only acknowledgment requests and in-app attention counts
- Printable simulation-labeled HTML paystubs, self-service preferences and finalized fictional earnings history (50-run initial limit)
- Employer-approved account-to-employee linking by registered-account and named employee dropdowns (manual identity check, not email verification)
- Responsive employee cards, message threads and portable printable statements

Acceptance criteria: employees see only their own finalized pay data; company employer/employee records remain isolated. Automated checks are green; live Firestore emulator/second-account acceptance testing still required.

## Phase 5 — Client plans, billing & support
**Status: implemented for simulated client-service workflows; production Firestore rules publication and live acceptance checks remain.**
- Simulated service plans, annual/monthly agreements, status, seat limits and renewal dates
- Fictional invoices, payments, credits, adjustments, status transitions and CSV statements
- Searchable support cases, client-visible updates, private staff notes, assignments, category/priority and elapsed-hour SLA targets
- Client services summaries, paginated records and append-only action history

Acceptance criteria: all financial amounts clearly flagged simulated; no live payment gateways or card storage.

## Phase 6 — Audit, automation & hardening
**Status: implemented for the static Firebase Spark simulator; nightly CI and Firestore emulator role testing enabled. Trusted-backend features remain outside this architecture.**
- Append-only event feed for integrated personnel, payroll and client-service operations (not cryptographically guaranteed for every write)
- Firebase emulator tests for owner, company, employee, invoice and support authorizations
- Advisory integrity and assurance reports rather than server-certified payroll recomputation
- Scoped JSON export with completion flags, advisory retention preferences and responsive interface improvements
- Nightly GitHub CI, deployment asset checking, user operations runbook and explicit recovery limitations

Acceptance criteria: automated Node tests and emulator authorization tests pass. Live Firebase user testing and owner acceptance still need to be completed; no production backend backup or financial certification is claimed.

## Design principles
- No real money transfers, taxes, bank credentials or government payroll filing.
- Remain a standalone Sterling Group company, independent of Sterling Corporate's separate Firebase environment.
- Client data segregation is non-negotiable.
- No automatic trust for matching employee email or display name across companies.
- Only claim features live after an actual Firebase/Pages test succeeds.

## Owner controls and finalized-period correction
Owner can correct existing simulated payroll periods directly, including finalized runs, and correct pay lines in place. Before/after revisions are stored rather than creating an additional payroll period. Owner-controlled deletion supports selected record types; payroll periods with historical children are voided rather than recursively erased. See [SETUP.md](./SETUP.md) for restrictions and required Firestore rules publication.

## Release 6.0
See [RELEASE_6.md](./RELEASE_6.md) for setup, feature coverage, rules activation, testing and explicit limitations.
