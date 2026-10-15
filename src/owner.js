import {collection,doc,getDocs,getDoc,writeBatch,serverTimestamp,limit,query} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {correctedLine,correctedPeriod,reason,canHardDelete,ownerApprovalOverride,REVIEW_STATES} from "./owner-core.js";
const E=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n};
const opt=(id,label)=>{const n=E("option","",label);n.value=id;return n};
const kinds=[["employees","Employees"],["timeEntries","Time entries"],["payrollRuns","Payroll periods"],["timeCorrections","Time corrections"],["leaveRequests","Leave requests"],["announcements","Announcements"],["billingInvoices","Simulated invoices"],["supportTickets","Support tickets"]];
export function mountOwnerControls({db,getState,notify,confirmAction,refreshCompany,requestDeletion}){
 const root=document.getElementById("ownerControlCenter");if(!root)return null;
 const dialog=document.getElementById("sterlingRecordDialog");if(!dialog)throw Error("Record management dialog not deployed");
 const close=()=>{if(dialog.open)dialog.close()};
 document.getElementById("closeRecordDialog").onclick=close;
 root.innerHTML='<div class="panel" id="ownerGeneralPanel"><div class="eyebrow">AUTHORIZED RECORD OPERATIONS</div><h2>Approval decisions</h2><p class="muted">Make an exceptional approval decision on a selected record with a documented reason. Actions are attributed to your owner identity.</p><div class="three-fields"><label>Client<select id="ownerTenant"></select></label><label>Record type<select id="ownerKind"></select></label><label>Record<select id="ownerRecord"></select></label></div><label>Required action reason<textarea id="ownerReason" maxlength="500" minlength="10" placeholder="Explain the override or deletion"></textarea></label><div class="actions"><button id="ownerArchive" class="btn" type="button">Archive / void</button><button id="ownerDelete" class="btn danger" type="button">Delete permanently</button><select id="ownerApprovalStatus" aria-label="Owner approval override"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select><button id="ownerOverrideApproval" class="btn primary" type="button">Override approval / signoff</button><button id="ownerReload" class="btn" type="button">Refresh</button></div><p id="ownerMessage" class="fine-print">Owner overrides bypass the normal second-party requirement. Every decision requires a reason, confirmation and recorded owner identity.</p></div><div class="ops-grid phase3-spaced"><article class="panel" id="ownerPeriodPanel"><h2>Payroll correction</h2><p class="muted">Correct period dates, status and individual simulated pay lines. Every revision preserves the previous and new values.</p><label>Finalized or other period<select id="ownerRun"></select></label><div class="three-fields"><label>Start<input type="date" id="ownerStart"></label><label>End<input type="date" id="ownerEnd"></label><label>Pay date<input type="date" id="ownerPayDate"></label></div><label>Owner override status<select id="ownerRunStatus"><option>draft</option><option>submitted</option><option>approved</option><option>finalized</option><option>rejected</option><option>voided</option></select></label><button id="ownerSavePeriod" class="btn primary" type="button">Correct this same pay period</button><h3>Correct individual pay amounts</h3><label>Employee pay line<select id="ownerLine"></select></label><div class="three-fields"><label>Regular ($)<input id="ownerRegular" type="number" min="0" step=".01"></label><label>Overtime ($)<input id="ownerOvertime" type="number" min="0" step=".01"></label><label>Bonus ($)<input id="ownerBonus" type="number" min="0" step=".01"></label><label>Deduction ($)<input id="ownerDeduction" type="number" min="0" step=".01"></label><label>Regular hours<input id="ownerRegHours" type="number" min="0" step=".01"></label><label>Overtime hours<input id="ownerOtHours" type="number" min="0" step=".01"></label></div><button class="btn primary" id="ownerSaveLine" type="button">Correct finalized pay line in place</button></article><article class="panel" id="ownerAuditPanel"><h2>Recent owner actions</h2><div id="ownerAuditList" class="list"></div></article></div>';
 const $=id=>root.querySelector("#"+id),S=()=>getState();
 const general=$("ownerGeneralPanel");
 general.querySelector(".three-fields")?.classList.add("hidden");
 for(const id of ["ownerArchive","ownerDelete","ownerReload"])$(id)?.classList.add("hidden");
 $("ownerAuditPanel")?.classList.add("hidden");
 const periodPanel=$("ownerPeriodPanel");
 const periodNodes=[...periodPanel.children],heading=periodNodes.find(x=>x.tagName==="H2"),description=periodNodes.find(x=>x.tagName==="P");
 const details=document.createElement("details"),summary=document.createElement("summary");
 summary.textContent="Edit period dates or individual pay lines";
 details.className="owner-detail-disclosure";
 details.append(summary);
 for(const element of periodNodes)if(element!==heading&&element!==description)details.append(element);
 periodPanel.replaceChildren(heading,description,details);

 let records=[],runs=[],lines=[],cursorTenant="";
 const tenant=()=>$("ownerTenant").value;
 function ensureOwner(){if(!S().platformOwner||!S().user)throw Error("Only the trusted Sterling owner can use this console")}
 function displayError(e){notify("Owner operation failed: "+(e.code||e.message||e),true)}
 function textFor(kind,d){
  const v=d.data();
  if(kind==="employees")return (v.displayName||"Employee")+" — "+(v.jobTitle||"");
  if(kind==="payrollRuns")return (v.periodStart||"")+" — "+(v.periodEnd||"")+" ("+v.status+")";
  if(kind==="billingInvoices")return (v.description||"Invoice")+" — "+v.status;
  if(kind==="supportTickets")return (v.subject||"Ticket")+" — "+v.status;
  return (v.title||v.reason||v.workDate||v.date||"Record")+" ("+d.id.slice(0,8)+")";
 }
 function setOptions(select,items,label){const current=select.value;select.replaceChildren(opt("",label),...items);if([...select.options].some(o=>o.value===current))select.value=current}
 function setReviewChoices(kind){
  const statuses=REVIEW_STATES[kind]||[];
  const select=$("ownerApprovalStatus");
  select.replaceChildren(...statuses.map(value=>opt(value,value.replaceAll("_"," "))));
  const available=statuses.length>0;
  select.disabled=!available;
  $("ownerOverrideApproval").disabled=!available;
  const record=records.find(d=>d.id===$("ownerRecord").value);
  if(record&&statuses.includes(record.data().status))select.value=record.data().status;
 }
 async function readKind(){
  ensureOwner();records=[];if(!tenant())return;
  const kind=$("ownerKind").value||"employees";
  const snap=await getDocs(query(collection(db,"tenants",tenant(),kind),limit(200)));
  if(snap.size>=200)$("ownerMessage").textContent="Showing a limited set of 200 records. Open a specific record from its page to jump directly to owner approval.";
  records=snap.docs;
  setOptions($("ownerRecord"),records.map(d=>opt(d.id,textFor(kind,d))),"Choose record");
  setReviewChoices(kind);
  $("ownerPeriodPanel").classList.toggle("hidden",kind!=="payrollRuns");
 }
 async function openReview(kind,id,tenantId=S().tenantId){
  ensureOwner();
  if(!REVIEW_STATES[kind])throw Error("This record does not have an owner approval workflow");
  if(!tenantId)throw Error("Select a company first");
  setOptions($("ownerTenant"),S().tenants.map(t=>opt(t.id,t.name)),"Choose client company");
  $("ownerTenant").value=tenantId;
  if(tenant()!==tenantId)throw Error("You do not have access to this company");
  $("ownerKind").value=kind;
  const target=await getDoc(doc(db,"tenants",tenantId,kind,id));
  if(!target.exists())throw Error("Record no longer exists");
  records=[target];
  setOptions($("ownerRecord"),records.map(d=>opt(d.id,textFor(kind,d))),"Choose record");
  $("ownerRecord").value=id;setReviewChoices(kind);
  $("ownerPeriodPanel").classList.toggle("hidden",kind!=="payrollRuns");
  $("ownerMessage").textContent="Selected: "+textFor(kind,target)+". Choose an outcome and provide a reason.";
  details.open=false;
  if(kind==="payrollRuns")await selectRunForEditing(target);
  if(!dialog.open)dialog.showModal();
  $("ownerApprovalStatus").focus();
 }
 async function selectRunForEditing(run){
  const id=run.id;
  if(!runs.some(x=>x.id===id))runs.push(run);
  setOptions($("ownerRun"),runs.map(x=>opt(x.id,textFor("payrollRuns",x))),"Choose payroll run");
  $("ownerRun").value=id;
  await loadLines();
 }
 async function openPeriod(id,tenantId=S().tenantId){
  await openReview("payrollRuns",id,tenantId);
  details.open=true;
  $("ownerPeriodPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 async function loadRuns(){
  runs=[];lines=[];
  if(!tenant())return;
  const snap=await getDocs(query(collection(db,"tenants",tenant(),"payrollRuns"),limit(200)));
  if(snap.size>=200)$("ownerMessage").textContent="Showing 200 payroll periods. Open a record directly from Payroll Runs for records beyond this page.";
  runs=snap.docs;
  setOptions($("ownerRun"),runs.map(d=>opt(d.id,textFor("payrollRuns",d))),"Choose payroll run");
  await loadLines();
 }
 async function loadLines(){
  lines=[];
  const runId=$("ownerRun").value,run=runs.find(d=>d.id===runId);
  if(!run||!tenant())return;
  const d=run.data();
  $("ownerStart").value=d.periodStart||"";$("ownerEnd").value=d.periodEnd||"";
  $("ownerPayDate").value=d.payDate||"";$("ownerRunStatus").value=d.status||"draft";
  const snap=await getDocs(query(collection(db,"tenants",tenant(),"payrollRuns",runId,"lines"),limit(251)));
  if(snap.size>250)throw Error("More than 250 pay lines. Do not edit without a complete review.");
  lines=snap.docs;setOptions($("ownerLine"),lines.map(x=>opt(x.id,x.data().employeeName||x.id)),"Choose pay line");
  fillLine();
 }
 function fillLine(){
  const line=lines.find(d=>d.id===$("ownerLine").value)?.data();
  if(!line)return;
  for(const [key,value] of [["Regular",line.regularCents],["Overtime",line.overtimeCents],["Bonus",line.bonusCents],["Deduction",line.deductionCents]])$("owner"+key).value=(Number(value||0)/100).toFixed(2);
  $("ownerRegHours").value=line.regularHours||0;$("ownerOtHours").value=line.overtimeHours||0;
 }
 async function loadAudit(){
  const box=$("ownerAuditList");box.replaceChildren();
  if(!tenant())return;
  const snap=await getDocs(query(collection(db,"tenants",tenant(),"ownerAudit"),limit(80)));
  for(const d of snap.docs.sort((a,b)=>String(b.data().at?.seconds||0).localeCompare(String(a.data().at?.seconds||0)))){
   const data=d.data(),row=E("article","list-item"),body=E("div");
   body.append(E("strong","",data.action+" · "+data.entityType),E("small","",data.reason+" · by owner"));
   row.append(body);box.append(row);
  }
  if(snap.empty)box.textContent="No owner changes recorded for this company.";
 }
 async function refresh(){
  if(!S().platformOwner)return;
  const t=S().tenants;
  setOptions($("ownerTenant"),t.map(x=>opt(x.id,x.name)),"Choose client company");
  if(!$("ownerKind").value)$("ownerKind").value="employees";
  const selected=tenant();cursorTenant=selected;
  if(!selected)return;
  await Promise.all([readKind(),loadRuns(),loadAudit()]);
 }
 async function auditBatch(batch,kind,id,actionName,why,before){
  const ref=doc(collection(db,"tenants",tenant(),"ownerAudit"));
  batch.set(ref,{action:actionName,entityType:kind,entityId:id,reason:why,actor:S().user.uid,at:serverTimestamp(),before:before||{}});
 }
 async function revise(runDoc,kind,id,after,why,targetRef){
  const current=runDoc.data(),before=(kind==="period")?current:(lines.find(d=>d.id===id)?.data());
  if(!before)throw Error("Reload the source data before correcting");
  const revision=doc(collection(db,"tenants",tenant(),"payrollRuns",runDoc.id,"revisions"));
  const changed={...after,lastRevisionId:revision.id,lastCorrectedBy:S().user.uid,lastCorrectedAt:serverTimestamp()};
  const batch=writeBatch(db);
  batch.set(revision,{kind,entityId:id,reason:why,actor:S().user.uid,at:serverTimestamp(),before,after:changed});
  batch.update(targetRef,changed);
  await auditBatch(batch,kind,id,"correct",why,before);
  await batch.commit();
  notify("Corrected the existing simulated "+(kind==="period"?"payroll period":"pay line")+"; a prior-version record was preserved.");
  await refresh();await refreshCompany();
 }
 $("ownerTenant").onchange=()=>refresh().catch(displayError);
 $("ownerKind").onchange=()=>readKind().catch(displayError);
 $("ownerRecord").onchange=()=>setReviewChoices($("ownerKind").value);
 $("ownerRun").onchange=()=>loadLines().catch(displayError);
 $("ownerLine").onchange=fillLine;
 $("ownerReload").onclick=()=>refresh().catch(displayError);
 $("ownerSavePeriod").onclick=async()=>{
  try{
   ensureOwner();const why=reason($("ownerReason").value),run=runs.find(d=>d.id===$("ownerRun").value);
   if(!run)throw Error("Select a payroll run");
   const after=correctedPeriod(run.data(),{periodStart:$("ownerStart").value,periodEnd:$("ownerEnd").value,payDate:$("ownerPayDate").value,status:$("ownerRunStatus").value});
   if(!await confirmAction("Owner payroll override","Correct this same period in place? An immutable before/after revision will be created."))return;
   await revise(run,"period",run.id,after,why,run.ref);
  }catch(e){displayError(e)}
 };
 $("ownerSaveLine").onclick=async()=>{
  try{
   ensureOwner();const why=reason($("ownerReason").value),run=runs.find(d=>d.id===$("ownerRun").value),line=lines.find(d=>d.id===$("ownerLine").value);
   if(!run||!line)throw Error("Select a period and a pay line");
   if(run.data().status!=="finalized")throw Error("Finalized pay-line overrides only; use draft editing for other runs");
   const after=correctedLine(line.data(),{regular:$("ownerRegular").value,overtime:$("ownerOvertime").value,bonus:$("ownerBonus").value,deduction:$("ownerDeduction").value,regularHours:$("ownerRegHours").value,overtimeHours:$("ownerOtHours").value});
   if(!await confirmAction("Correct finalized pay","Apply the change directly to this finalized pay line, preserving the old value in an immutable revision?"))return;
   await revise(run,"line",line.id,after,why,line.ref);
  }catch(e){displayError(e)}
 };
 async function deleteSelected(archiveOnly){
  try{
   ensureOwner();let why=archiveOnly?reason($("ownerReason").value):"";const kind=$("ownerKind").value,record=records.find(d=>d.id===$("ownerRecord").value);
   if(!record)throw Error("Select an existing record");
   const previous=record.data(),batch=writeBatch(db);
   if(!archiveOnly&&kind==="employees"){
    const links=await getDocs(query(collection(db,"tenants",tenant(),"employeeLinks"),limit(201)));
    if(links.size>200)throw Error("Too many employee portal links to verify; do not delete this HR employee.");
    if(links.docs.some(d=>d.data().employeeId===record.id))throw Error("Unlink this employee from any portal account before deletion.");
   }
   if(archiveOnly){
    if(kind==="employees")batch.update(record.ref,{status:"inactive",updatedAt:serverTimestamp()});
    else if(kind==="payrollRuns"){
     const after=correctedPeriod(previous,{periodStart:previous.periodStart,periodEnd:previous.periodEnd,payDate:previous.payDate,status:"voided"});
     if(!await confirmAction("Void payroll","Void this period and preserve its existing lines and revision history?"))return;
     await revise(record,"period",record.id,after,why,record.ref);return;
    }else throw Error("Archive is available for employees and payroll periods; choose Delete for leaf records");
   }else{
    const childrenByKind={payrollRuns:["lines","snapshots","revisions"],billingInvoices:["events"],supportTickets:["updates","internalNotes"]};
    if(childrenByKind[kind]){
     let total=0;
     for(const child of childrenByKind[kind]){
      const docs=await getDocs(query(collection(record.ref,child),limit(101)));
      if(docs.size>100)throw Error("More than 100 "+child+" records; use a managed bulk deletion for this period.");
      total+=docs.size;
      if(total>400)throw Error("This record contains too many dependent records for one atomic deletion.");
      for(const item of docs.docs)batch.delete(item.ref);
     }
    }
    if(!canHardDelete(kind,false))throw Error("This record must be archived rather than deleted");
    batch.delete(record.ref);
   }
   const operation=archiveOnly?"archive":"delete";
   if(!archiveOnly){
    if(typeof requestDeletion!=="function")throw Error("Custom deletion confirmation is unavailable");
    const decision=await requestDeletion({title:"Delete "+textFor(kind,record),recordLabel:textFor(kind,record),message:"Delete this fictional record and any supported child records permanently? You cannot undo this operation."});
    if(!decision)return;
    why=reason(decision.reason);
   }else if(!await confirmAction("Archive record","Archive "+textFor(kind,record)+"? You can still review historical records."))return;
   await auditBatch(batch,kind,record.id,operation,why,previous);
   await batch.commit();
   notify("Owner "+operation+" completed.");await refresh();await refreshCompany();
  }catch(e){displayError(e)}
 }
 $("ownerOverrideApproval").onclick=async()=>{
  try{
   ensureOwner();
   const kind=$("ownerKind").value,record=records.find(d=>d.id===$("ownerRecord").value);
   const next=$("ownerApprovalStatus").value,why=reason($("ownerReason").value);
   if(!record)throw Error("Choose an existing record to override");
   if(!REVIEW_STATES[kind]?.includes(next))throw Error("Choose a supported approval or payroll signoff state");
   const before=record.data();
   const after=ownerApprovalOverride(kind,before,next,S().user.uid);
   const label=textFor(kind,record);
   if(!await confirmAction("Owner approval override",
    "Override "+label+" from "+before.status+" to "+next+"? This expressly bypasses any separate approver and records you as the owner responsible."))return;
   if(kind==="payrollRuns"){
    // Payroll signoff changes are tied to immutable before/after revisions in Firestore Rules.
    await revise(record,"period",record.id,after,why,record.ref);
   }else{
    const reviewer=kind==="timeEntries"?"approvedBy":"reviewedBy";
    const batch=writeBatch(db);
    batch.update(record.ref,{status:next,[reviewer]:after[reviewer]});
    await auditBatch(batch,kind,record.id,"override approval",why,before);
    await batch.commit();
    notify("Owner approval override saved and attributed to your account.");
    await refresh();await refreshCompany();
   }
  }catch(e){displayError(e)}
 };
 $("ownerArchive").onclick=()=>deleteSelected(true);
 $("ownerDelete").onclick=()=>deleteSelected(false);
 setOptions($("ownerKind"),kinds.map(([a,b])=>opt(a,b)),"Choose record type");
 $("ownerKind").value="employees";
 setReviewChoices("employees");
 return {refresh,openReview,openPeriod};
}