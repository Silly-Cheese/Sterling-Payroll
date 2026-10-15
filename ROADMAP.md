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
- Employee-scoped private account portal
- Client dashboards, messages, document requests and notifications
- Paystubs, personal profile and fictional earnings history
- Employer-led account claiming with verified identity
- Responsive mobile-first improvements

Acceptance criteria: employees see only their own data; different client employers remain isolated.

## Phase 5 — Client plans, billing & support
- Simulated service plans and client subscription states
- Mock invoices, payments, adjustments and statements
- Case/ticket center for payroll support, client SLA dashboards
- Account-level usage metrics and operational activity queues

Acceptance criteria: all financial amounts clearly flagged simulated; no live payment gateways or card storage.

## Phase 6 — Audit, automation & hardening
- Immutable change/audit trails for sensitive client actions
- Permission rules validation using Firebase emulator
- Server-side verification for any future high-integrity calculations
- Advanced analytics, data retention controls, bulk export/import
- Accessibility audit, load tests, deployment runbooks, backups and releases

Acceptance criteria: repeatable end-to-end scenarios pass in test projects, predictable failure recovery, final owner acceptance.

## Design principles
- No real money transfers, taxes, bank credentials or government payroll filing.
- Remain a standalone Sterling Group company, independent of Sterling Corporate's separate Firebase environment.
- Client data segregation is non-negotiable.
- No automatic trust for matching employee email or display name across companies.
- Only claim features live after an actual Firebase/Pages test succeeds.
