import {
 collection, doc, getDocs, query, orderBy, documentId, limit, startAfter,
 runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {canApproveTimecard, eligibleTimecards, timecardChunks} from "./timecard-bulk-core.js?v=sterling-bulk-fix-20261017";

// Manage a single, company-scoped time approval surface without another page or form.
export function mountBulkTimecardApprovals({db, getState, refreshCompany, refreshApprovals, notify, confirmAction}) {
 const S = () => getState(), queue = document.getElementById("p3TimeQueue");
 if (!queue) throw Error("Time approval queue is missing.");
 const make = (tag, cls, label) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (label !== undefined) e.textContent = label;
  return e;
 };
 const toolbar = make("div", "timecard-bulk-toolbar");
 const buttons = make("div", "timecard-bulk-actions");
 const selectAll = make("button", "btn small", "Select loaded");
 const approveSelected = make("button", "btn primary small", "Approve selected");
 const approveAll = make("button", "btn small", "Approve all company pending");
 for (const button of [selectAll, approveSelected, approveAll]) button.type = "button";
 buttons.append(selectAll, approveSelected, approveAll);
 const message = make("p", "fine-print timecard-bulk-status", "");
 message.setAttribute("role", "status");
 message.setAttribute("aria-live", "polite");
 toolbar.append(buttons, message);
 queue.before(toolbar);
 const quickLink = make("button", "btn small timecard-approval-shortcut", "Review & bulk approve");
 quickLink.type = "button";
 quickLink.onclick = () => {
  toolbar.scrollIntoView({behavior: "smooth", block: "start"});
  selectAll.focus({preventScroll: true});
 };
 const registerPanel = document.getElementById("timeList")?.closest(".panel");
 const filterBar = registerPanel?.querySelector(".list-toolbar");
 if (filterBar) filterBar.append(quickLink);
 else registerPanel?.querySelector("h2")?.after(quickLink);

 let selected = new Set(), loaded = [], currentTenant = "", busy = false, lastOutcome = "";
 const admin = () => Boolean(S().user && S().tenantId && S().role !== "employee" &&
  (S().platformWrite || S().role === "client_admin"));
 const permission = () => ({admin: admin(), owner: Boolean(S().platformOwner)});
 const uid = () => S().user?.uid || "";
 const eligible = rows => eligibleTimecards(rows, uid(), permission());
 function current(companyId, actor) {
  return S().tenantId === companyId && uid() === actor && admin();
 }

 function updateButtons() {
  const allowed = admin(), candidates = eligible(loaded);
  const allSelected = candidates.length > 0 && candidates.every(row => selected.has(row.id));
  toolbar.classList.toggle("hidden", !allowed);
  quickLink.classList.toggle("hidden", !allowed);
  selectAll.disabled = busy || !candidates.length;
  approveSelected.disabled = busy || !candidates.some(row => selected.has(row.id));
  approveAll.disabled = busy;
  selectAll.textContent = allSelected ? "Clear selection" : "Select loaded";
  approveSelected.textContent = "Approve selected (" + candidates.filter(row => selected.has(row.id)).length + ")";
  if (!busy) {
   const blocked = loaded.filter(row => !candidates.some(c => c.id === row.id)).length;
   message.textContent = lastOutcome || (candidates.length + " eligible pending timecards loaded" +
    (blocked ? " · " + blocked + " require an independent approver" : "") +
    ". Use Approve all company pending to include entries on other pages.");
  }
  queue.querySelectorAll("[data-timecard-select]").forEach(input => {
   input.checked = selected.has(input.value);
   input.disabled = busy;
  });
 }

 function sync(pending) {
  const tenantId = S().tenantId;
  if (tenantId !== currentTenant) {
   currentTenant = tenantId;
   selected.clear();
   lastOutcome = "";
  }
  loaded = pending;
  const live = new Set(eligible(pending).map(row => row.id));
  for (const id of selected) if (!live.has(id)) selected.delete(id);
  updateButtons();
 }

 function decorateRow(element, entry, label) {
  if (!canApproveTimecard(entry, uid(), permission())) return element;
  const check = make("input", "timecard-select");
  check.type = "checkbox";
  check.value = entry.id;
  check.dataset.timecardSelect = "true";
  check.setAttribute("aria-label", "Select timecard for " + label + " on " + entry.workDate);
  check.checked = selected.has(entry.id);
  check.onchange = () => {
   if (check.checked) selected.add(entry.id);
   else selected.delete(entry.id);
   updateButtons();
  };
  element.prepend(check);
  return element;
 }

 selectAll.onclick = () => {
  if (busy) return;
  const candidates = eligible(loaded);
  const allSelected = candidates.length && candidates.every(row => selected.has(row.id));
  for (const entry of candidates) {
   if (allSelected) selected.delete(entry.id);
   else selected.add(entry.id);
  }
  updateButtons();
 };

 async function scanCompanyPending(companyId, actor) {
  const pending = [];
  const path = collection(db, "tenants", companyId, "timeEntries");
  let cursor = null;
  do {
   if (!current(companyId, actor)) throw Error("Company or approval permissions changed.");
   const terms = [orderBy(documentId()), limit(200)];
   if (cursor) terms.push(startAfter(cursor));
   const snap = await getDocs(query(path, ...terms));
   for (const record of snap.docs) {
    const row = {id: record.id, ...record.data()};
    if ((row.status || "pending") === "pending") pending.push(row);
   }
   cursor = snap.docs.at(-1) || null;
   message.textContent = "Checking company timecards… " + pending.length + " pending found";
   if (snap.size < 200) break;
  } while (cursor);
  return pending;
 }

 async function approveGroup(entries, companyId, actor) {
  return runTransaction(db, async tx => {
   if (!current(companyId, actor)) throw Error("Company or approval permissions changed.");
   const refs = entries.map(entry => doc(db, "tenants", companyId, "timeEntries", entry.id));
   // Every read precedes every write, so a concurrent review never gets overwritten.
   const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
   const approved = [];
   for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    if (!snap.exists()) continue;
    const entry = {id: snap.id, ...snap.data()};
    if (!canApproveTimecard(entry, actor, permission())) continue;
    tx.update(refs[i], {status: "approved", approvedBy: actor});
    approved.push(entry.id);
   }
   if (approved.length) {
    tx.set(doc(collection(db, "tenants", companyId, "auditEvents")), {
     category: "time", action: "timecard-bulk-approve", subject: "Timecard approvals",
     detail: approved.length + " pending timecards approved in a bulk review" +
      (S().platformOwner ? " (owner authorization)" : ""),
     actor, at: serverTimestamp()
    });
   }
   return approved;
  });
 }

 async function approveRecords(rows, scope) {
  if (busy || !admin() || !S().tenantId || !S().user) return;
  const companyId = S().tenantId, actor = uid();
  const candidates = eligible(rows);
  const blocked = rows.length - candidates.length;
  if (!candidates.length) {
   notify("No eligible pending timecards to approve.", true);
   return;
  }
  const overrides = candidates.filter(row => row.createdBy === actor).length;
  const detail = "Approve " + candidates.length + " pending timecards for this company?" +
   (blocked ? " " + blocked + " timecards will be skipped because they require another approver." : "") +
   (overrides ? " " + overrides + " timecards you submitted will use your Sterling owner override." : "") +
   " Approved or rejected entries are not changed.";
  if (!await confirmAction(scope === "company" ? "Approve company timecards" : "Approve selected timecards",
   detail, {confirmLabel: "Approve " + candidates.length})) return;
  if (!current(companyId, actor)) {
   notify("Company or permission changed. Nothing was approved.", true);
   return;
  }
  busy = true;
  lastOutcome = "";
  updateButtons();
  let completed = 0, skipped = 0, failed = 0, firstError = "";
  try {
   for (const group of timecardChunks(candidates, 8)) {
    if (!current(companyId, actor)) throw Error("Company or permission changed during bulk approval.");
    try {
     const updated = await approveGroup(group, companyId, actor);
     completed += updated.length;
     skipped += group.length - updated.length;
    } catch (error) {
     // A changed/blocked record should not prevent other valid records from being reviewed.
     for (const entry of group) {
      if (!current(companyId, actor)) throw Error("Company or permission changed during bulk approval.");
      try {
       const updated = await approveGroup([entry], companyId, actor);
       completed += updated.length;
       skipped += 1 - updated.length;
      } catch (singleError) {
       failed++;
       if (!firstError) firstError = singleError.message || String(singleError);
      }
     }
    }
    message.textContent = "Approving timecards… " + (completed + skipped + failed) +
     " of " + candidates.length + " reviewed";
   }
   const totalSkipped = blocked + skipped + failed;
   const report = completed + " timecards approved" +
    (totalSkipped ? " · " + totalSkipped + " skipped or failed" : "") + ".";
   notify(report + (firstError ? " First error: " + firstError : ""), failed > 0);
   lastOutcome = report + (firstError ? " " + firstError : "");
   message.textContent = lastOutcome;
  } catch (error) {
   notify(completed + " approved before stopping: " + error.message, true);
   lastOutcome = completed + " approved; stopped: " + error.message;
   message.textContent = lastOutcome;
  } finally {
   busy = false;
   selected.clear();
   if (S().tenantId === companyId) {
    try {
     await refreshCompany();
     await refreshApprovals();
    } catch (error) {
     notify("Timecards were processed, but the list could not refresh: " + error.message, true);
    }
   }
   updateButtons();
  }
 }

 approveSelected.onclick = () => {
  if (busy) return;
  void approveRecords(loaded.filter(entry => selected.has(entry.id)), "selected");
 };
 approveAll.onclick = async () => {
  if (busy || !admin()) return;
  const companyId = S().tenantId, actor = uid();
  busy = true; updateButtons();
  try {
   const pending = await scanCompanyPending(companyId, actor);
   busy = false; updateButtons();
   await approveRecords(pending, "company");
  } catch (error) {
   lastOutcome = "Unable to review all company timecards: " + error.message;
   notify(lastOutcome, true);
  } finally {
   busy = false;
   updateButtons();
  }
 };
 sync([]);
 return {sync, decorateRow};
}
