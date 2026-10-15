# Sterling Payroll — Installation and First Owner

**Firebase project:** sterling-payroll-5d200  
**Repository:** https://github.com/Silly-Cheese/Sterling-Payroll  
**Expected GitHub Pages URL:** https://silly-cheese.github.io/Sterling-Payroll/

This is **roleplay/simulated payroll only**. Never enter real bank details, SSNs, tax identifiers or genuinely sensitive employee data.

## 1. Enable Firebase Authentication

In [Firebase Console](https://console.firebase.google.com/project/sterling-payroll-5d200/authentication/providers), enable Email/Password.

Under Authentication → Settings → Authorized domains, add silly-cheese.github.io if it is not already authorized.

## 2. Deploy Firestore Rules

Open the project's Firestore Database, create it if necessary, and publish the contents of [firestore.rules](./firestore.rules) from the repository using Firestore → Rules → Publish.

GitHub commits **do not automatically publish** Firestore security rules.

## 3. One-time owner bootstrap — no manual UID configuration

The platform now includes **Verify and complete owner setup** for its designated owner.

**Before the very first claim**, replace the placeholder address in the `ownerEmail()` function near the top of [firestore.rules](./firestore.rules) with the exact email of the intended owner account, then publish those rules in Firebase Console → Firestore Database → Rules. This is a one-time allowlist configuration; the email must match the **Firebase Authentication verified email**, not merely a typed email field.

1. Open the Sterling Payroll website and register or sign in with that email.
2. Verify your email address using Firebase Authentication's verification message.
3. Return to the website and select **Verify and complete owner setup**.
4. Corporate setup atomically creates `system/bootstrap` and `platformAdmins/{your signed-in UID}`; it fails if already initialized.
5. Your account receives the Sterling owner role without manually copying any UID into Firestore.

**Why the email allowlist is essential:** Allowing the first arbitrary visitor to claim owner on a public GitHub Pages site would expose every client's HR and fictional payroll data. Until `ownerEmail()` is configured and the updated rules are published, the owner claim is deliberately blocked. Never use a shared address controlled by someone else.

If a platform administrator already exists, the system will keep its existing authorization. The one-time bootstrap is not a backdoor that can reset ownership.

## 4. Publish on GitHub Pages

In the repository go to Settings → Pages → Build and deployment → Source → GitHub Actions. The included Pages workflow can publish the root static site. No Firebase Hosting or paid Firebase backend is required.

## 5. Create companies and invite teammates

1. Platform owner signs in, opens Client Companies and creates a client.
2. Choose the company and open Team Access.
3. Invite a verified email address as Client administrator, Payroll specialist or Read-only viewer.
4. Give the invitee the company link shown. Invitations are stored in Firestore, but **this release does not email them automatically**.
5. The invitee registers or signs in, verifies their email, opens the company link and accepts their invitation.

A company workspace identifier is not an authentication credential. Verified email and a matching invitation are required.

## 6. Run simulated payroll

1. Client → Employees: add a salaried or hourly worker.
2. For hourly staff, record time in Timekeeping.
3. Payroll Runs → Create draft.
4. Open the run → Generate simulated pay lines → Review.
5. Submit for approval; a **different authorized client administrator** must approve.
6. Finalization requires an authorized user different from the approver.

Simulation uses a 1.5× overtime multiplier for illustration and subtracts fictional deductions from fictional gross wages. This is **not legal payroll or tax computation** and cannot send real money.

## Current release limitations

- No real payments, tax filings, direct deposits, real employee banking data, or financial compliance certification.
- No automatic invitation emails or self-service employee sign-in links yet.
- No complete correction and bulk-import workflows; advanced reporting and full data pagination come in later phases.
- Browser-computed payroll amounts are not independently recomputed by a trusted server. Firestore rules enforce role checks and allowed status changes, **not certified financial calculations**.
- Workspaces are separated by Firestore Security Rules. User-visible company names and IDs are not proof of authorization.
- Approval actions are immutable after finalization. Client/team administrative controls will be expanded in later phases.

## Troubleshooting

**Permission denied:** Confirm Firestore rules are published and the signed-in user's role grant exists in the correct tenant or platformAdmins collection.

**No clients visible:** The intended platform owner must be granted manually. Everyone else must accept a verified-email invitation.

**Can't sign in from GitHub Pages:** Add silly-cheese.github.io to Firebase Authentication authorized domains.

**Blank page:** Verify the Pages deploy succeeded and the browser loaded Firebase CDN JavaScript from www.gstatic.com.

## Files

- index.html — client and administration workspaces
- styles.css — Sterling Group black-and-cream UI
- src/app.js — Firebase Authentication + Firestore client
- src/payroll-core.js — simulation calculations
- firestore.rules — tenant isolation and approval restrictions
- tests/payroll.test.mjs — test coverage
- .github/workflows/verify.yml — CI
- .github/workflows/pages.yml — static hosting

## Phase 2 — Clients, personnel and team administration

- **Client Companies** includes client editing (name, industry, contact, service tier, internal notes and active/suspended status).
- **Personnel Operations** includes employee editing, pay frequency changes, CSV import preview, and multi-select employment status updates.
- **Team Access** includes member role changes and staff suspension, subject to tenant authorization rules.
- Employee, timekeeping and payroll lists support bounded **Load more** pagination. For safety, payroll generation is blocked when not all employee/time records have been loaded.
- Client-role updates are not available to the affected member themselves. When a client is suspended, ordinary client members lose access while Sterling platform administrators retain oversight.

**Required Firebase update:** Re-publish the latest `firestore.rules` from the repository. GitHub Pages does not deploy Firestore Security Rules.

**Phase 2 does not create real employment records or pay anyone.** Do not upload real taxpayer identifiers or banking data to this simulator.
