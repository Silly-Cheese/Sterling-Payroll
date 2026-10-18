# Sterling Payroll
**A Sterling Group Company — Simulated Payroll Management**

Sterling Payroll is a standalone, multi-client roleplay payroll platform. It does not transfer funds, file taxes, make real wage payments, or access bank accounts.

## Six-phase plan

| Phase | Delivery |
|---|---|
| 1 — Foundation | Firebase Authentication, isolated client workspaces, Sterling platform administration, invitations, branded responsive shell, deployment/security basics |
| 2 — Client operations | Client administration, staffing, employee positions, compensation, statuses, directory and access management |
| 3 — Payroll engine | Simulated periods, time entries, gross/net calculations, bonus/deductions, approval separation, finalization |
| 4 — Employee experience | Role-scoped portal, simulated paystubs, pay history, announcements and employee self-service |
| 5 — Billing & service | Client plans, simulated invoices, adjustments, support cases, service-level reporting |
| 6 — Production hardening | Audits, full permissions testing, advanced reporting, export/import, mobile QA, release checks |

Initial foundation includes working versions of client onboarding, employee records and simulated payroll operations so it is useful from the first release; advanced workflows arrive across later phases.

## Quick start
See [SETUP.md](./SETUP.md) for Firebase Authentication, Firestore rules deployment and owner-managed staff permissions. **No one becomes platform owner by registering.** The established owner grant in `platformAdmins/{uid}` is required before the Staff & Accounts page is available. Ordinary sign-ups become client accounts without an email-verification prompt; administrators assign client memberships through registered-account dropdowns.

## Phase 2 features
- Client company management: contact, service tier, industry, notes and suspension.
- Personnel operations: edit records, fictional compensation, lifecycle status and CSV bulk import.
- Company staffing and fictional payroll workflows remain client-operable; **membership grants, identity links and role changes are Sterling-controlled**.
- Paginated employee, timekeeping and payroll lists; full-list checks before payroll generation.

## Phase 3 additions
- Pending time entries, independent approval, immutable correction requests and simulated paid leave.
- Versioned fictional pay policies, exception-aware payroll calculation and draft snapshots.
- Correction payroll runs, run comparisons and downloadable simulation-labeled CSV statements.
- Sterling-wide staff roles granted by the existing owner only, with independent client-company memberships.

## Phase 4 — Employee self-service
- Employer-linked employee accounts; ordinary registration never grants access to payroll data.
- Private finalized fictional earnings history and printable simulation-labeled paystubs.
- Employee preferences, company announcements, private employer/employee messages.
- Text-only fictional forms/acknowledgment requests with in-app pending-item counts.
- Sterling administrators link verified company accounts to employee records using the Staff & Accounts and restricted team-access workflows.

## Phase 4, 5 and 6 simulated release
- **Employee Portal:** explicit employer-linked identity, private simulated paystub history, preferences, announcements, secure company messages and employee response requests.
- **Contextual owner actions:** owner-only signoff and finalized-pay corrections open directly from the relevant record. Permanent deletion uses a typed Sterling dialog, dependent-record review, bounded batches and a protected deletion receipt.
- **Client Services:** clients view simulated agreements/invoices and communicate through their own support cases; Sterling administrators alone set agreements and invoice/ledger states. Only Sterling support handles case assignment/status and internal notes.
- **Assurance Center:** client-admin integrity reports, scoped export, advisory retention, activity review and asset diagnostics.
- **Reliability:** shared `ui-system.css` design layer for all workspaces, compact timekeeping, responsive navigation and dialogs, scoped conversations and Firestore emulator security checks.
- **Deployment protection:** dynamic employee portal loading and Pages asset checks prevent a missing module from preventing the login screen.

## Hosting
Static web frontend, compatible with GitHub Pages; Firebase project: `sterling-payroll-5d200`.

## Security
- Firestore rules isolate tenant data to approved membership or platform administrators.
- Never enter real Social Security numbers, bank account details or tax identifiers.
- Approval workflows are roleplay-grade simulations. Browser calculations are not a certified payroll or tax engine.
- No Firebase Admin SDK credentials in this site or repository.

**Release instructions:** [RELEASE_6.md](./RELEASE_6.md). **GitHub Pages deploys only the frontend. Firestore rules are a separate production deployment.**

### Deploying the stricter governance rules

The repository now includes a manual [Deploy Sterling Firestore Rules](./.github/workflows/deploy-firestore-rules.yml) workflow. An authorized maintainer must configure the GitHub Actions secret `FIREBASE_SERVICE_ACCOUNT` with a restricted service account allowed to update Firestore security rules, then go to **Actions → Deploy Sterling Firestore Rules → Run workflow**, entering `DEPLOY`. The workflow uses `firestore.rules` and project `sterling-payroll-5d200`. Do not place credentials in any client-side JavaScript or repository file.

Before activating client access on the new release, publish those rules and confirm that the scheduled `firestore-security` emulator test passes. Without production rules deployment, the new role-based controls are **only frontend restrictions**, not an enforced backend permission change.

### Access responsibility matrix

| Role | Manage employee/payroll work | View client bills | Set Sterling bills & agreements | Own-case communications | Triage & internal case notes | Grant company access |
|---|---|---|---|---|---|---|
| Sterling owner/administrator | Yes | Yes | Yes | All cases | Yes | Yes |
| Sterling support | Read where permitted | Yes | No | All cases | Yes | No |
| Client company administrator | Yes | Yes | No | Own cases | No | No |
| Client payroll specialist | Yes | Yes | No | Own cases | No | No |
| Client viewer | Read only | Yes | No | Own cases | No | No |
| Employee portal member | Self-service only | No | No | No client helpdesk role | No | No |

Security rules, not hiding interface controls, provide the enforcement for writes and protected support records.

**New interface:** record-first views, on-demand creation forms, simplified personnel tools, five employee-portal tabs and separate staff/client access tabs. No standalone Owner Controls page.
