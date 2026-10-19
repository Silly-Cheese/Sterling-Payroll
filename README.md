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

## Commission studio (October 2026)
The **Commissions** workspace separates employee plans from the sales register. Administrators can choose 5%, 10%, 15%, 20%, or 25% presets, use custom percentages or fixed payouts, and assign the same plan to several active employees. Plans can be searched and edited; existing approved sale amounts remain unchanged.

In **Sales register**, choose **Import sales CSV** and download the template. Example:

```csv
employeeName,saleDate,saleAmount,description,reference
Jim Joe,2026-10-12,1250.00,Sample fictional sale,ORDER-101
```

The reference column is optional. Imports are limited to 500 rows / 512 KB per file, accept YYYY-MM-DD or MM/DD/YYYY dates, match full employee names uniquely, require active commission plans, and preview valid/invalid records and calculated payouts. Imported sales are **pending**. Re-uploading the same file skips matching previously imported records. Ambiguous employee names are rejected instead of guessed.

The sales register reads complete company sales in Firestore document-ID pages (up to 10,000 records), then supports employee, status, date and text filters plus date/name/sale-value/commission sorting without composite indexes. The UI renders 35 rows at once with a Show More control.

Authorized independent reviewers can approve selected or all matching eligible pending sales in small Firestore transactions. The Sterling owner retains the existing override. Approved/rejected sales cannot be approved again; prior payroll links remain protected by rules. No new Firestore indexes or rules are required for this CSV feature, but existing security rules must be deployed for the existing permissions to be enforceable.

## Simulated percentage deductions (fictional taxes)

Sterling Payroll Services now has a **default simulated tax rate** per company and a **per-employee override** in editable payroll drafts.

- **Default:** Payroll Runs → Simulation settings → Default simulated tax deduction (% of gross pay). Set 0.00–100.00% (up to two decimal places). This updates the company's versioned policy and applies when new payroll lines are generated; previously finalized statements are not rewritten.
- **Employee override:** Open a draft payroll → Generate pay lines → Adjust on an employee → Simulated taxes (% of gross). Pick a 0%, 5%, 10%, 12.5%, 15%, 20% or 25% preset, or type a custom percentage. Save to record the simulated tax rate, calculated tax amount, and any separate fixed dollar deduction.
- **Calculation:** Simulated tax withholding = gross earnings **including approved commission and bonus** × selected rate, rounded to the nearest cent. Other deductions are added separately. Total deductions may not exceed gross fictional earnings.
- **Review:** Payroll register, gross/net summaries, CSV exports, and employee fictional statements display simulated taxes separately. Older payroll lines without tax metadata continue to show 0% tax and retain their historical fixed deductions.

**Important:** These are illustrative simulated deductions only. They are **not** actual payroll taxes, withholding tables, legal tax filings, or remittances. The new Firestore fields require the updated `firestore.rules` to be deployed to project `sterling-payroll-5d200` before the feature works against production Firestore. GitHub Pages deployment does **not** deploy database security rules; use the gated Firestore rules workflow in this repository or publish the approved rules from Firebase Console.

## Commission-only payroll and cached settings-form recovery

When creating a payroll run, choose **Commissions only** to include approved sales in the selected period without salary, hours, overtime, leave or bonuses. **Timecards only** ignores sales, and **Timecards + commissions** includes both. A run created before processing modes were introduced remains **combined**. Names are optional at creation, and authorized users can rename runs later.

To diagnose a commission-only run, open it and choose **Inspect input exceptions**. The inspection now checks active employee eligibility, enabled company commissions, approved sales dated within the pay period, calculated commission amounts and simulated taxes. Pending, rejected and out-of-period sales do not become pay lines.

Some browsers previously cached a payroll-policy form without its simulated-tax percentage input, causing a `Cannot set properties of null (setting 'value')` error. The Phase 3 controller now requests uncached, release-versioned partials and inserts that field defensively when an older form is present. If the site still displays the old form, first wait for the GitHub Pages deployment and perform a hard refresh.

**Important:** All payroll and tax outputs are fictional. Security changes in `firestore.rules` must be deployed separately to Firebase; GitHub Pages only deploys the frontend.
