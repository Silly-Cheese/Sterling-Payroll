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

## 3. Grant the first Sterling platform administrator

There is no public first-registrant owner claim. This prevents an arbitrary visitor from seizing a public payroll platform.

1. Register through Sterling Payroll (or create your account through Firebase Authentication).
2. Find the intended owner's Firebase Authentication UID under Authentication → Users.
3. In Firestore → Data, create collection **platformAdmins**.
4. Create a document whose document ID exactly equals the intended owner's Authentication UID.
5. Set **active** to boolean **true**, and **role** to string **owner**.
6. Sign out and back in. The Client Companies section will now be available.

Never add private Admin SDK keys, passwords or service account JSON to GitHub Pages.

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
