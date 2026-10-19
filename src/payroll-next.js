import {collection,doc,getDoc,getDocs,query,orderBy,documentId,startAfter,limit,runTransaction,
 setDoc,updateDoc,addDoc,serverTimestamp,writeBatch} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {schedulePeriods,dateOnly,validateProfile,integrityReport,approvalQueue,reconcileRun,reportingRows,toCSV,currentCompensation} from "./payroll-next-core.js?v=sterling-next-20261018";
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
const money=n=>"$"+((Number(n)||0)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??"").replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]));
function download(name,text,type="text/csv;charset=utf-8"){
 const link=document.createElement("a"),url=URL.createObjectURL(new Blob(["\uFEFF",text],{type}));
 link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
}
export async function mountPayrollNext({db,getState,notify,confirmAction,navigate}){
 const root=document.getElementById("payrollNextSuite");if(!root)return null;
 const response=await fetch("./payroll-next.html?v=sterling-next-20261018",{cache:"no-store"});
 if(!response.ok)throw Error("Payroll Operations Center template is not deployed.");
 root.innerHTML=await response.text();
 const $=id=>root.querySelector("#"+id),S=()=>getState();
 const collections=["employees","timeEntries","payrollRuns","commissionSales","compensationChanges","clientPayrollRequests"];
 let data={},coverage={},selectedTenant="",stamp=0,schedule=null,mode="readiness",failed=[],loading=false;
 const own=()=>S().platformOwner;
 const staff=()=>S().platformWrite||["client_admin"].includes(S().role);
 const manager=()=>S().platformWrite||["client_admin","payroll_specialist"].includes(S().role)||S().platformRole==="payroll_operator";
 const mayRequest=()=>!!S().tenantId&&S().role!=="employee"&&S().platformRole!=="payroll_operator";
 const records=k=>data[k]||[];
 const group=(n)=>collection(db,"tenants",selectedTenant,n);
 const stateCheck=(tenant,uid,version)=>{
  if(S().tenantId!==tenant||S().user?.uid!==uid||(version!==undefined&&version!==stamp))
   throw Error("Account or company changed. Reopen the operations center.");
 };
 const status=(message,error=false)=>{$("nextStatus").textContent=message;$("nextStatus").classList.toggle("next-error",error)};
 const card=(target,title,description,tone="",actions=[])=>{
  const box=el("article","next-record "+tone),copy=el("div","next-record-copy");
  copy.append(el("strong","",title),el("small","",description));
  const buttons=el("div","next-record-actions");
  for(const [label,click,primary=false] of actions){const b=el("button","btn small"+(primary?" primary":""),label);
   b.type="button";b.onclick=()=>Promise.resolve(click()).catch(e=>notify(e.message||String(e),true));buttons.append(b);}
  box.append(copy,buttons);target.append(box);
 };
 const show=tab=>{
  mode=tab;
  for(const b of root.querySelectorAll("[data-next-tab]")){
   b.classList.toggle("active",b.dataset.nextTab===tab);
   b.setAttribute("aria-pressed",String(b.dataset.nextTab===tab));
  }
  for(const p of root.querySelectorAll(".next-panel"))p.classList.toggle("hidden",p.id!=="next-"+tab);
  render();
 };
 for(const b of root.querySelectorAll("[data-next-tab]"))b.onclick=()=>show(b.dataset.nextTab);
 async function paginate(tenant,uid,version,name){
  let after=null,all=[];const max=10000,size=200;
  for(let page=0;page<=Math.ceil(max/size);page++){
   stateCheck(tenant,uid,version);
   const clauses=[orderBy(documentId()),limit(size+1)];
   if(after)clauses.push(startAfter(after));
   const snap=await getDocs(query(collection(db,"tenants",tenant,name),...clauses));
   stateCheck(tenant,uid,version);
   const chunk=snap.docs.slice(0,size);
   if(all.length+chunk.length>max)throw Error(name+" exceeds the 10,000-record safety limit.");
   all.push(...chunk.map(d=>({id:d.id,...d.data()})));
   if(snap.docs.length<=size)return all;
   after=chunk.at(-1);if(!after)break;
  }
  throw Error(name+" could not be read completely.");
 }
 async function refresh(){
  const tenant=S().tenantId,uid=S().user?.uid,version=++stamp;
  data={};coverage={};schedule=null;failed=[];selectedTenant=tenant;loading=true;
  if(!tenant||!uid){loading=false;status("Select a company first.");return;}
  status("Loading company sources. Totals will not be treated as complete until every page is loaded.");
  const reads=await Promise.allSettled(collections.map(k=>paginate(tenant,uid,version,k)));
  if(tenant!==S().tenantId||uid!==S().user?.uid||version!==stamp)return;
  reads.forEach((result,i)=>{const key=collections[i];
   if(result.status==="fulfilled"){data[key]=result.value;coverage[key]=true}
   else{data[key]=[];coverage[key]=false;failed.push(key+": "+(result.reason?.code||result.reason?.message||String(result.reason)));}
  });
  try{const snap=await getDoc(doc(db,"tenants",tenant,"paySchedules","current"));if(snap.exists())schedule=snap.data();}
  catch(e){failed.push("paySchedules: "+(e.code||e.message));coverage.paySchedules=false}
  if(tenant!==S().tenantId||uid!==S().user?.uid||version!==stamp)return;
  loading=false;
  $("nextAccess").textContent=own()?"STERLING OWNER":staff()?"ADMINISTRATION":"CLIENT WORKSPACE";
  $("nextSaveSchedule").disabled=!staff();
  $("nextSaveComp").disabled=!staff();
  $("nextApproveEligible").disabled=!staff();
  $("nextRequestForm").classList.toggle("hidden",!mayRequest());
  if(schedule){
   const f=$("nextScheduleForm");
   for(const name of ["cadence","mode","anchorDate","paydayOffsetDays","namePrefix"])
    if(f.elements.namedItem(name))f.elements.namedItem(name).value=schedule[name]??"";
  }
  const employees=records("employees").filter(x=>x.status==="active")
   .sort((a,b)=>String(a.displayName).localeCompare(String(b.displayName)));
  for(const id of ["nextCompEmployee","nextReportEmployee"]){
   const select=$(id),old=select.value;
   select.replaceChildren(...(id==="nextReportEmployee"?[new Option("All employees","")]:[]),
    ...employees.map(e=>new Option(e.displayName,e.id)));
   if([...select.options].some(x=>x.value===old))select.value=old;
  }
  status(failed.length?"Some sources could not be loaded. Reports and readiness totals are provisional; see Diagnostics.":"All six company record sources loaded; reports reflect available stored records.",!!failed.length);
  render();
 }
 function render(){
  if(!selectedTenant)return;
  if(mode==="readiness")renderReadiness();
  if(mode==="schedule")renderSchedule();
  if(mode==="compensation")renderCompensation();
  if(mode==="approvals")renderApprovals();
  if(mode==="reconciliation")renderReconciliation();
  if(mode==="reports")renderReports();
  if(mode==="requests")renderRequests();
  if(mode==="diagnostics")renderDiagnostics();
 }
 const complete=()=>collections.every(k=>coverage[k]===true);
 const employeeName=id=>records("employees").find(e=>e.id===id)?.displayName||"Missing employee";
 function renderReadiness(){
  const report=integrityReport({employees:records("employees"),timeEntries:records("timeEntries"),runs:records("payrollRuns"),
   sales:records("commissionSales"),profiles:records("compensationChanges"),completeness:coverage});
  const grid=$("nextMetrics");grid.replaceChildren();
  for(const [name,n] of [["Employees",report.scanned.employees],["Timecards",report.scanned.timecards],
    ["Payroll runs",report.scanned.runs],["Approved sales",records("commissionSales").filter(x=>x.status==="approved").length],
    ["Exceptions",report.issues.length],["Warnings",report.warnings.length]]){
   const card=el("div","next-metric");card.append(el("span","",name),el("strong","",n));grid.append(card);
  }
  const box=$("nextFindings");box.replaceChildren();
  if(!report.issues.length&&!report.warnings.length)
   card(box,"No structural exceptions found","Validated loaded records. This is not a guarantee of compliance or complete payroll.");
  for(const item of report.issues.slice(0,80))card(box,"Exception · "+item.type,item.detail+" · "+item.record,"next-critical");
  for(const item of report.warnings.slice(0,80))card(box,"Review · "+item.type,item.detail+" · "+item.record,"next-warning");
  if(!complete())card(box,"Incomplete data","Resolve source load errors in Diagnostics before relying on these counts.","next-critical");
 }
 function renderSchedule(){
  const box=$("nextSchedulePreview");
  if(!box.children.length)card(box,"Schedule ready","Preview upcoming periods; saving a schedule does not automatically finalize or pay employees.");
 }
 function scheduleInput(){
  const f=$("nextScheduleForm");
  return {cadence:f.elements.namedItem("cadence").value,mode:f.elements.namedItem("mode").value,
   anchorDate:f.elements.namedItem("anchorDate").value,paydayOffsetDays:Number(f.elements.namedItem("paydayOffsetDays").value),
   namePrefix:f.elements.namedItem("namePrefix").value.trim().slice(0,55)};
 }
 function previewSchedule(){
  const values=scheduleInput(),rows=schedulePeriods(values,5,records("payrollRuns"));
  const target=$("nextSchedulePreview");target.replaceChildren();
  rows.forEach((p,i)=>card(target,p.name+" · "+p.start+" – "+p.end,
   "Payday "+p.payDate+" · "+p.mode+(p.overlappingRuns.length?" · "+p.overlappingRuns.length+" overlapping existing run(s)":""),
   p.overlappingRuns.length?"next-warning":"",
   !p.overlappingRuns.length&&manager()?[["Prepare draft",()=>prepareDraft(p,i),true]]:[]));
 }
 async function prepareDraft(period,i){
  if(!manager()||!complete())throw Error("Complete the company data checks before preparing a scheduled run.");
  const tenant=selectedTenant,uid=S().user.uid;
  const id="scheduled-"+period.start+"-"+period.mode;
  const key=doc(db,"tenants",tenant,"payrollRuns",id);
  const name=(period.name+" · "+period.start).slice(0,80);
  if(!await confirmAction("Prepare simulated pay period","Create "+name+" as a draft? This does not generate pay lines, submit, or finalize payroll."))return;
  stateCheck(tenant,uid);
  await runTransaction(db,async tx=>{
   const old=await tx.get(key);
   if(old.exists())throw Error("This schedule has already prepared a payroll run for that date and mode.");
   tx.set(key,{name,processingMode:period.mode,periodStart:period.start,periodEnd:period.end,
    payDate:period.payDate,status:"draft",createdAt:serverTimestamp(),createdBy:uid,
    submittedBy:"",approvedBy:"",finalizedBy:""});
  });
  notify("Draft created. Review source records and generate simulated pay lines.");
  await refresh();navigate("payroll");
 }
 function renderCompensation(){
  const box=$("nextCompHistory");box.replaceChildren();
  const selected=$("nextCompEmployee").value;
  const rows=records("compensationChanges").filter(x=>!selected||x.employeeId===selected)
   .sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate));
  if(!rows.length)card(box,"No compensation history","Choose an employee and record an effective-dated change to begin.");
  for(const p of rows.slice(0,100)){
   const employee=employeeName(p.employeeId);
   card(box,employee+" · "+p.effectiveDate,
    (p.payType==="hourly"?"Hourly "+money(p.hourlyRateCents):"Annual "+money(p.annualSalaryCents))+
    " · Fictional tax "+(p.taxRateBasisPoints/100)+"% · Other deduction "+money(p.recurringDeductionCents)+
    (p.note?" · "+p.note:""));
  }
  if(rows.length>100)card(box,"More history available","Showing 100 changes. Select a specific employee to narrow the list.");
 }
 function renderApprovals(){
  const items=approvalQueue({timeEntries:records("timeEntries"),sales:records("commissionSales"),
   runs:records("payrollRuns"),uid:S().user?.uid,owner:own(),mode:$("nextApprovalFilter").value});
  const box=$("nextApprovalList");box.replaceChildren();
  if(!items.length)card(box,"No outstanding items","The records currently loaded have no matching pending approvals.");
  for(const item of items.slice(0,100)){
   const where=item.kind==="run"?"Payroll run · "+item.id:employeeName(item.employeeId);
   const actions=item.kind==="run"?[["Open run",()=>navigate("payroll")]]:
    item.eligible&&staff()?[["Approve",()=>approveOne(item),true]]:[];
   card(box,where+" · "+item.date,
    item.kind+(item.kind==="commission"?" · "+money(item.amountCents):"")+
     (item.eligible?" · reviewer eligible":" · independent reviewer required"),"",
    actions);
  }
  if(items.length>100)card(box,"More pending items","Narrow the queue. No approval will be made implicitly.");
 }
 async function approveOne(item,skipConfirmation=false){
  if(!staff()||!item.eligible||!["time","commission"].includes(item.kind))
   throw Error("This action requires an independent authorized reviewer.");
  const tenant=selectedTenant,uid=S().user.uid;
  if(!skipConfirmation&&!await confirmAction("Approve fictional "+item.kind,"Approve this pending record for "+employeeName(item.employeeId)+"?"))return false;
  const ref=doc(db,"tenants",tenant,item.kind==="time"?"timeEntries":"commissionSales",item.id);
  stateCheck(tenant,uid);
  await runTransaction(db,async tx=>{
   const current=await tx.get(ref);
   if(!current.exists()|| (current.data().status||"pending")!=="pending")
    throw Error("This record is no longer pending.");
   if(current.data().createdBy===uid&&!own())throw Error("A separate reviewer must approve this entry.");
   tx.update(ref,{status:"approved",approvedBy:uid});
  });
  return true;
 }
 function renderReconciliation(){
  const select=$("nextReconRun"),prior=select.value;
  select.replaceChildren(...records("payrollRuns").slice().sort((a,b)=>String(b.periodStart).localeCompare(String(a.periodStart)))
   .map(run=>new Option((run.name||run.periodStart+" — "+run.periodEnd)+" · "+run.status,run.id)));
  if([...select.options].some(x=>x.value===prior))select.value=prior;
 }
 function currentReportRows(){
  const type=$("nextReportType").value,
   all=reportingRows({employees:records("employees"),runs:records("payrollRuns"),
    sales:records("commissionSales"),timeEntries:records("timeEntries")})[type]||[];
  const start=$("nextReportStart").value,end=$("nextReportEnd").value,
   name=employeeName($("nextReportEmployee").value);
  return all.filter(row=>{
   if($("nextReportEmployee").value&&type!=="periods"&&row.employee!==name&&row.name!==name)return false;
   const day=row.date||row.start;
   return (!day||((!start||day>=start)&&(!end||day<=end)));
  });
 }
 function renderReports(){
  const rows=currentReportRows(),box=$("nextReportSummary");box.replaceChildren();
  card(box,rows.length+" rows selected",complete()?
   "Ready to export as CSV or print as a fictional company report.":
   "WARNING: One or more source collections are incomplete. Export is disabled until coverage is complete.",complete()?"":"next-critical");
 }
 function renderRequests(){
  const box=$("nextRequestsList");box.replaceChildren();
  const recordsAllowed=records("clientPayrollRequests")
   .filter(x=>staff()||x.createdBy===S().user?.uid)
   .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  if(!recordsAllowed.length)card(box,"No requests","New company requests will appear here.");
  for(const item of recordsAllowed.slice(0,70)){
   const actions=[];
   if(S().platformWrite&&item.status==="submitted")
    actions.push(["Mark in review",()=>requestStatus(item,"in_review")]);
   if(S().platformWrite&&item.status==="in_review")
    actions.push(["Resolve",()=>requestStatus(item,"resolved")]);
   card(box,item.subject+" · "+item.status,item.type+" — "+item.details.slice(0,220)+
    (item.response?" · Sterling response: "+item.response:""),"",actions);
  }
 }
 function renderDiagnostics(){
  const box=$("nextDiagnostics");box.replaceChildren();
  for(const k of collections)card(box,k,coverage[k]?"All pages loaded ("+records(k).length+" records)":
   "FAILED or incomplete. Do not use this source for financial conclusions.",coverage[k]?"":"next-critical");
  for(const e of failed)card(box,"Source error",e,"next-critical");
  if(!failed.length)card(box,"No source load errors","This does not prove production rules and all user roles have been tested.");
 }
 async function runDiagnostics(){
  const box=$("nextDiagnostics");
  for(const path of ["./src/payroll-next.js","./src/payroll-next-core.js","./payroll-next.html","./firestore.rules"]){
   const name=path==="./firestore.rules"?"Firestore deployment status (cannot verify via hosting)":path;
   if(path==="./firestore.rules"){card(box,name,"Firestore security rules must be deployed separately; never expose rules through the frontend.");continue}
   try{const res=await fetch(path+"?diagnostic=sterling-next",{method:"HEAD",cache:"no-store"});
    card(box,name,res.ok?"Asset available · HTTP "+res.status:"Missing or stale asset · HTTP "+res.status,res.ok?"":"next-critical");
   }catch(e){card(box,name,e.message||String(e),"next-critical")}
  }
 }
 async function requestStatus(item,statusValue){
  if(!S().platformWrite)throw Error("Only Sterling administration can resolve a company request.");
  const tenant=selectedTenant,uid=S().user.uid;
  if(!await confirmAction("Update request","Mark "+item.subject+" as "+statusValue.replace("_"," ")+"?"))return;
  stateCheck(tenant,uid);
  await updateDoc(doc(db,"tenants",tenant,"clientPayrollRequests",item.id),
   {status:statusValue,updatedBy:uid,updatedAt:serverTimestamp()});
  notify("Request updated.");await refresh();
 }
 $("nextScheduleForm").onsubmit=async ev=>{
  ev.preventDefault();
  try{
   if(!staff())throw Error("Company administrator rights required.");
   const input=scheduleInput();schedulePeriods(input,1);
   const tenant=selectedTenant,uid=S().user.uid;
   if(!await confirmAction("Save payroll schedule","Save this recurrence for the selected company? Existing payroll runs will not change."))return;
   stateCheck(tenant,uid);
   const batch=writeBatch(db);
   batch.set(doc(db,"tenants",tenant,"paySchedules","current"),{...input,updatedAt:serverTimestamp(),updatedBy:uid});
   batch.set(doc(group("auditEvents")),{category:"schedule",action:"schedule-save",subject:"current",detail:"Updated simulated payroll schedule",
    actor:uid,at:serverTimestamp()});
   await batch.commit();notify("Company pay schedule saved.");await refresh();show("schedule");
  }catch(e){notify(e.message||String(e),true)}
 };
 $("nextPreviewSchedule").onclick=()=>{try{previewSchedule()}catch(e){notify(e.message||String(e),true)}};
 $("nextCompEmployee").onchange=renderCompensation;
 $("nextCompForm").onsubmit=async ev=>{
  ev.preventDefault();
  try{
   if(!staff())throw Error("Company administrator rights required.");
   const f=ev.currentTarget,e=records("employees").find(x=>x.id===f.elements.namedItem("employeeId").value);
   const validated=validateProfile(Object.fromEntries(new FormData(f).entries()),e);
   const tenant=selectedTenant,uid=S().user.uid,id=e.id+"_"+validated.effectiveDate;
   if(!await confirmAction("Record employee compensation","Add a new effective-dated change for "+e.displayName+
    "? This cannot rewrite historical payroll or existing changes."))return;
   stateCheck(tenant,uid);
   const record=doc(db,"tenants",tenant,"compensationChanges",id);
   await runTransaction(db,async tx=>{
    const old=await tx.get(record);if(old.exists())throw Error("A compensation version for that date already exists.");
    tx.set(record,{employeeId:e.id,...validated,createdBy:uid,createdAt:serverTimestamp()});
   });
   notify("Compensation version saved.");await refresh();show("compensation");
  }catch(e){notify(e.message||String(e),true)}
 };
 $("nextApprovalFilter").onchange=renderApprovals;
 $("nextApproveEligible").onclick=async()=>{
  try{
   if(!staff()||!complete())throw Error("All approval sources must load before bulk approval.");
   const eligible=approvalQueue({timeEntries:records("timeEntries"),sales:records("commissionSales"),
    runs:records("payrollRuns"),uid:S().user.uid,owner:own(),mode:$("nextApprovalFilter").value})
    .filter(x=>x.eligible&&(x.kind==="time"||x.kind==="commission"));
   if(!eligible.length)return notify("No eligible pending timecards or commission sales.");
   if(!await confirmAction("Approve pending records","Independently approve "+eligible.length+" eligible pending records for this company? Payroll runs require separate review."))return;
   let approved=0,skipped=0,errors=0;
   for(const item of eligible){
    try{const ok=await approveOne(item,true);if(ok)approved++}catch(e){if(String(e.message).includes("no longer pending"))skipped++;else errors++}
   }
   notify(approved+" approved, "+skipped+" already handled, "+errors+" failed. Review any errors before payroll.",!!errors);
   await refresh();show("approvals");
  }catch(e){notify(e.message||String(e),true)}
 };
 $("nextReconcile").onclick=async()=>{
  const target=$("nextReconciliationResults");target.replaceChildren();
  try{
   if(!complete())throw Error("Cannot reconcile an incomplete source set.");
   const run=records("payrollRuns").find(r=>r.id===$("nextReconRun").value);
   if(!run)throw Error("Choose an existing payroll run.");
   const tenant=selectedTenant,uid=S().user.uid,version=stamp;
   status("Loading complete pay lines for reconciliation…");
   const lines=await (async()=>{
    let after=null,all=[];
    for(let n=0;n<51;n++){
     stateCheck(tenant,uid,version);
     const parts=[orderBy(documentId()),limit(201)];if(after)parts.push(startAfter(after));
     const snap=await getDocs(query(collection(db,"tenants",tenant,"payrollRuns",run.id,"lines"),...parts));
     all.push(...snap.docs.slice(0,200).map(d=>({id:d.id,...d.data()})));
     if(snap.size<=200)return all;
     after=snap.docs[199];
    }
    throw Error("Run has more than 10,000 lines; reconciliation aborted.");
   })();
   const report=reconcileRun(run,lines,records("commissionSales"),records("employees"));
   card(target,run.name||run.id,report.totals.employees+" employees · Gross "+money(report.totals.grossCents)+
    " · Net "+money(report.totals.netCents)+" · Commissions "+money(report.totals.commissionCents)+
    " · Fictional taxes "+money(report.totals.taxCents));
   if(!report.issues.length)card(target,"Totals reconciled","All available pay lines and claimed commissions agree.");
   for(const e of report.issues)card(target,"Exception",e,"next-critical");
   status("Run reconciliation complete.");
  }catch(e){card(target,"Reconciliation unavailable",e.message||String(e),"next-critical");status(e.message||String(e),true)}
 };
 for(const id of ["nextReportType","nextReportEmployee","nextReportStart","nextReportEnd"])$(id).onchange=renderReports;
 $("nextDownloadCSV").onclick=()=>{
  if(!complete())return notify("All source pages must load successfully before exporting.",true);
  const rows=currentReportRows();if(!rows.length)return notify("There are no matching records to export.",true);
  download("Sterling-"+$("nextReportType").value+"-SIMULATED.csv",toCSV(rows));
  notify(rows.length+" fictional records exported.");
 };
 $("nextPrintReport").onclick=()=>{
  if(!complete())return notify("Cannot print a partial report.",true);
  const rows=currentReportRows();if(!rows.length)return notify("No matching records.",true);
  const cols=Object.keys(rows[0]);
  const windowPrint=window.open("","_blank","noopener,noreferrer,width=1000,height=750");
  if(!windowPrint)return notify("Allow a pop-up to open the printable report.",true);
  const html="<!doctype html><html><head><title>Sterling · SIMULATED report</title><style>body{font:13px Arial;padding:35px;color:#151515}h1{font-size:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:9px;vertical-align:top;text-align:left}th{background:#eee}</style></head><body><h1>Sterling Payroll Services</h1><p>SIMULATED RECORDS · NOT FOR REAL FINANCIAL USE</p><p>"+esc($("nextReportType").value)+" · "+rows.length+" entries</p><table><thead><tr>"+cols.map(x=>"<th>"+esc(x)+"</th>").join("")+"</tr></thead><tbody>"+
   rows.map(row=>"<tr>"+cols.map(c=>"<td>"+esc(row[c])+"</td>").join("")+"</tr>").join("")+"</tbody></table><p>Generated from the selected company's records.</p></body></html>";
  windowPrint.document.open();windowPrint.document.write(html);windowPrint.document.close();windowPrint.focus();windowPrint.print();
 };
 $("nextRequestForm").onsubmit=async ev=>{
  ev.preventDefault();
  try{
   if(!mayRequest())throw Error("Client support requests require a company account.");
   const fields=Object.fromEntries(new FormData(ev.currentTarget));
   const subject=String(fields.subject||"").trim(),details=String(fields.details||"").trim();
   if(subject.length<5||subject.length>120||details.length<10||details.length>1500)
    throw Error("Provide a subject (5–120 characters) and details (10–1500 characters).");
   const tenant=selectedTenant,uid=S().user.uid;
   if(!await confirmAction("Submit client request","Send this request to Sterling's support queue?"))return;
   stateCheck(tenant,uid);
   await addDoc(group("clientPayrollRequests"),{type:fields.type,subject,details,status:"submitted",
    createdBy:uid,createdAt:serverTimestamp(),updatedBy:"",response:""});
   ev.currentTarget.reset();notify("Client request submitted.");await refresh();show("requests");
  }catch(e){notify(e.message||String(e),true)}
 };
 $("nextRefresh").onclick=()=>void refresh();
 $("nextRunDiagnostics").onclick=async()=>{renderDiagnostics();await runDiagnostics()};
 $("nextGoTime").onclick=()=>navigate("time");
 $("nextGoPayroll").onclick=()=>navigate("payroll");
 show("readiness");
 return {refresh,clear(){stamp++;selectedTenant="";data={};coverage={};root.querySelectorAll(".next-records").forEach(x=>x.replaceChildren())}};
}
