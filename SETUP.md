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
