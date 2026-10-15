# Sterling Payroll — Phase 3 Setup

**Website:** https://silly-cheese.github.io/Sterling-Payroll/  
**Repository:** https://github.com/Silly-Cheese/Sterling-Payroll  
**Firebase project:** `sterling-payroll-5d200`

Sterling Payroll is a **simulation only**. Do not enter real taxpayer or bank details, SSNs, or actual employee payroll records.

## Required deployment step — Firestore rules

The GitHub Pages workflow publishes web files only. **It does not publish Firebase Firestore Rules.**

1. Open https://console.firebase.google.com/project/sterling-payroll-5d200/firestore/rules
2. Copy the complete rules from [firestore.rules](./firestore.rules).
3. Publish those rules and reload the website.

## Registration and Sterling staff permissions

New users register with Firebase email/password. Normal onboarding **does not require email verification**. All new registrations create a private `accounts/{uid}` record whose type is `client`. This is not permission to see any company's records.

The existing platform owner retains the trusted authorization in `platformAdmins/{uid}`. **Registration cannot claim platform ownership** or change that document; only an owner with an existing valid grant sees **Staff & Accounts**.

From **Staff & Accounts**, select an already registered account (no UID typing), then assign:

- **Administrator** — manages client companies and staff, except granting Sterling-wide staff roles.
- **Payroll operator** — works with simulated payroll across companies.
- **Support** — reads company workspaces but cannot modify pay or employees.

Only the existing owner can grant or revoke Sterling-wide staff status. These grants are stored in `platformStaff/{uid}`. The same page lets the owner grant a registered account a **client company** role: Client administrator, Payroll specialist, or Viewer. Membership records are stored in `tenants/{tenantId}/members/{uid}` and the user's private company index.

**Owner account prerequisite:** If your existing account is registered but does **not** already have a trusted `platformAdmins/{uid}` grant, registering does not turn it into an owner. You must provision this one initial grant through a trusted Firebase administrative action. This is intentionally never an automatic first-user claim.

**Security tradeoff:** Unverified accounts can register and be assigned permissions without emailing a confirmation link. The Sterling owner must independently verify whom they are granting staff access; a registered email alone is not proof that its holder controls that mailbox. Password-reset email functionality remains available.

## Phase 3 simulated payroll

- **Timekeeping:** New entries start pending. Another authorized client administrator must approve or reject each before payroll generation.
- **Corrections:** Original approved entries remain intact. Corrections require a reason and independent approval.
- **Leave:** Fictional paid leave is requested and approved independently, then included in reviewed pay totals.
- **Policy:** Authorized client admins can set the overtime multiplier (1×–3×) and default fictional bonuses and deductions.
- **Payroll:** Generating a draft uses reviewed time, approved corrections and paid leave. Missing approvals and multiple contradictory corrections stop generation.
- **Snapshots:** Each draft generation saves a summary of policy version and simulated totals; there is no privileged server recomputation or certified audit guarantee.
- **Statements:** Export simulated payroll summaries as a CSV explicitly marked fictional.
- **Correction runs:** Create a separate draft referencing a finalized original. Finalized payroll runs are never edited.
- **Comparison:** Compare fictional net values between payroll runs.

Two different authorized accounts remain required for preparing and approving payroll. Roleplay calculations are **not financial-grade**, and the system does not transfer money or file taxes.

## Known limitations

The web app is static and uses browser-side calculations. Firestore rules protect tenant and staff access plus basic transition constraints, but do not independently recalculate gross/net pay. Time entries, corrections and leave are bounded to protect free-tier Firestore resources; large client histories need further pagination. Existing time entries created before Phase 3 may not yet have review statuses and should be reviewed before payroll.

Staff and Phase 3 functions require **real browser and Firebase rules tests** before declaring production-readiness.

## Phase 4 — Private employee portal and employer linking

**Mandatory:** Publish the newest [Firestore rules](./firestore.rules) in the Firebase Console. Publishing GitHub Pages files never publishes security rules.

The employee portal does not trust an email match or a user-typed employee ID. The employer must independently confirm whose account it is linking. No email-verification prompt is required for ordinary Firebase registration.

1. Employee registers/signs in normally with an email/password, creating a client-default account.
2. The existing Sterling owner opens **Staff & Accounts**, selects the registered account and company, chooses **Employee portal**, and assigns it to that company.
3. A company administrator opens the company selector, then **Team Access → Manage membership roles**. The employee account appears by email; choose the actual employee from the **Linked employee** dropdown and select **Link employee**. Employer approval is required before private payroll access opens.
4. Employee refreshes or signs in, chooses the company, and opens **Employee Portal**. Employee-only accounts start there automatically.
5. An employee with no approved HR link sees an access-pending message, not another person's payroll data.

Employee portal features:

- **My profile:** Displays employer-controlled HR name, position, and employment status. Preferred display name and in-app notification preferences are saved separately from payroll records.
- **My simulated pay:** Reads only finalized payroll runs and the single pay line belonging to the employer-linked employee. Printable/downloadable HTML paystub is prominently labeled simulated and can be saved as a PDF using the browser print control.
- **Company announcements:** Company administrators publish messages; linked employees read company announcements.
- **Private messages:** One employer-to-employee thread per linked account, accessible only to the employee and authorized company administrators.
- **Forms and acknowledgments:** An employer assigns text-only requests; employees can submit responses and administrators can complete or reopen requests. The in-app badge counts pending requests when the portal is visited/refreshed.
- **Responsive interface:** Mobile layout for employee cards, conversations, and pay statements.

**Limitations:** This phase does not send email, push notifications, transfer money, create authentic pay documents, upload private files, or automatically verify real-world identity. It does not accept banking/SSN/tax documentation. Employee pay history is currently limited to 50 finalized runs per portal load; announcements, requests and messages have bounded lists, with full pagination planned. Employer approval of identity must happen outside the app before linking.

**Security:** Employee-only accounts cannot query the company's complete employee directory, timesheets, payroll lines, or employee conversations. A member's active status and the employer-approved `employeeLinks/{uid}` mapping are checked by rules. Suspended company membership revokes that portal access.

**Testing:** JavaScript regression checks and static rule assertions run in GitHub Actions, but multi-account live Firestore rule tests are still needed before treating these permissions as independently verified.

## Phase 4 — Employee portal (complete initial release)

The employer uses Employee Portal to explicitly link a registered **employee-role** member to an existing employee record. Linking by display name or unverified email is never automatic.

Linked employees can view only their own finalized fictional pay history; download/print clearly labeled simulated paystubs; configure preferred name and notification preference; read announcements; exchange private company messages; and submit text-only responses to employer information requests. Company administrators can create announcements, link/unlink accounts, message linked employees, create requests and complete responses.

Company employees do **not** get access to the full employee directory or payroll line collection. The account linkage and per-record read permissions must be enforced by the published Firestore rules.

## Owner Control Center — trusted owner only

The trusted owner sees Owner Controls, subject to the existing `platformAdmins/{uid}` authorization. Features include:

- In-place correction of simulated pay-period dates and status, including finalized periods.
- In-place correction of finalized payroll line amounts and hours, recalculating simulated gross/net.
- Immutable before/after revision documents in each affected payroll run and per-client owner activity records.
- Delete selected employee, time, correction, leave, announcement, fictional invoice and support records, with a reason and confirmation.
- Void payroll periods while preserving historical pay lines and revisions. A payroll-period document with child data cannot be deleted through the owner UI.
- Archive employees as inactive. Deletion of an employee linked to a portal account is blocked until they are unlinked.

Deletion of Firebase Authentication user accounts, full recursive deletion of arbitrary Firestore subcollections and deletion from unrelated Firebase projects is **not** supported by this browser-only owner console. Owner powers do not bypass authentication or allow public self-privilege escalation. **Keep the initial platform owner grant private and protected.**

Changes are written with client-side Firestore batches, but there is no trusted backend to independently verify payroll mathematics. These remain fictional and subject to emulator/live permission testing.

## Phase 5 — Client service foundation underway

The Client Services page includes simulated service invoices (draft, issued, settled, void) and client support tickets (open, in progress, resolved, closed). No invoice triggers real payment or banking activity. Client service tiers are managed in Client Companies; advanced billing plans, support assignments and automation remain in Phase 5.

## Critical Firebase setup

**After every update to `firestore.rules`, publish the repository contents manually in** https://console.firebase.google.com/project/sterling-payroll-5d200/firestore/rules

Publishing JavaScript to GitHub Pages does not update Firestore authorization. Owner corrections, employee linking and Phase 5 invoicing will fail with `permission-denied` until the current rules are published.

Owner Controls also allow directly overriding time-entry, paid-leave and correction-request approval statuses, with a required reason and an owner action record. Such changes do not retroactively recompute finalized pay lines; use the finalized-period correction editor to revise fictional pay values in place.


## Owner second-party approval override

The trusted owner can now bypass normal independent reviewer requirements for fictional payroll periods (draft, submitted, approved, rejected and finalized) and for time entries, correction requests and paid leave (pending, approved and rejected). Every override requires a reason, confirmation and a recorded actor. Payroll signoff changes create a before/after revision linked to the same payroll run. These are owner-only exceptions; ordinary client and payroll accounts must continue to follow separation-of-duties rules.

Go to **Owner Controls** → choose company → **Record type** → select the specific record → choose outcome → enter reason → **Override approval / signoff**. Payroll Runs and Phase 3 review queues also include **Owner signoff / Owner override** shortcuts that open the chosen record directly.

Permanent deletion of finalized payroll runs with associated lines, snapshots and revisions is supported by the owner for a bounded set of child documents in a single Firestore batch. Oversized child collections remain restricted to prevent partial or orphaned records. The updated Firestore Rules must be manually published in Firebase Console; publishing GitHub Pages alone does not grant the new owner signoff or deletion permissions.
