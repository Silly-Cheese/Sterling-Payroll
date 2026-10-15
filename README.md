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
See [SETUP.md](./SETUP.md) for Firebase Authentication, Firestore rules deployment and platform owner assignment. **No one becomes platform owner by registering**: assign the intended owner's Firebase Auth UID to `platformAdmins/{uid}` from the trusted Firebase console, then sign in.

## Hosting
Static web frontend, compatible with GitHub Pages; Firebase project: `sterling-payroll-5d200`.

## Security
- Firestore rules isolate tenant data to approved membership or platform administrators.
- Never enter real Social Security numbers, bank account details or tax identifiers.
- Approval workflows are roleplay-grade simulations. Browser calculations are not a certified payroll or tax engine.
- No Firebase Admin SDK credentials in this site or repository.
