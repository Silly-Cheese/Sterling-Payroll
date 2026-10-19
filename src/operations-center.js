import {collection,doc,getDoc,getDocs,query,orderBy,documentId,startAfter,limit,runTransaction,setDoc,addDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {schedulePeriods,validatePaySchedule,validatePeriodAgainstRuns,validateCompensationProfile,reconcileRun,payrollReadiness,groupedPayrollReport,CSV,validDate,plusDays} from "./operations-core.js?v=sterling-ops30-20261019";
import {toCents,money} from "./payroll-core.js";
const E=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value);return e};
const dateNow=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const isoTime=t=>t?.toDate?.()?.toLocaleString?.()||"";
const READER_LIMIT=5000;
export async function mountOperationsCenter({db,getState,notify,confirmAction,onNavigate,onOpenRun,onOpenTime,refreshCompany}){
 const host=document.getElementById("ops30Root");
 const response=await fetch("./operations-center.html?v=sterling-ops30-20261019",{cache:"no-store"});
 if(!response.ok)throw Error("Missing Operations Center template. Wait for the GitHub Pages deployment.");
 host.innerHTML=await response.text();
 const $=id=>host.querySelector("#"+id),state=()=>getState(),coll=(tenant,name)=>collection(db,"tenants",tenant,name);
 let company="",actor="",epoch=0,loading=false;
 let data={employees:[],time:[],runs:[],sales:[],profiles:[],schedules:[],history:[],changes:[],audit:[]};
 let loadErrors=[],lastHealth=[],active="readiness",inspected=null;
 const canManage=()=>Boolean(state().platformWrite||["client_admin","payroll_specialist"].includes(state().role));
 const canReview=()=>Boolean(state().platformOwner||state().role==="client_admin");
 const guard=(t,u,version)=>{if(t!==state().tenantId||u!==state().user?.uid||company!==t||version!==epoch)throw Error("Company or account changed during this operation.");};
 const account=()=>{if(!state().tenantId||!state().user?.uid)throw Error("Select an authorized company first.");return {t:state().tenantId,u:state().user.uid,v:epoch}};
 const option=(value,text)=>{const o=E("option","",text);o.value=value;return o};
 const list=(root,rows,empty)=>{
  root.replaceChildren();
  if(!rows.length){root.append(E("p","muted",empty));return;}
  for(const row of rows)root.append(row);
 };
 const entry=(heading,detail,actions=[],severity="")=>{
  const card=E("article","ops30-entry "+(severity?"severity-"+severity:""));
  const body=E("div","ops30-entry-copy");
  body.append(E("strong","",heading),E("small","",detail));
  const right=E("div","ops30-entry-actions");right.append(...actions);
  card.append(body,right);return card;
 };
 const btn=(label,fn,kind="")=>{
  const b=E("button","btn small "+kind,label);b.type="button";
  b.onclick=async()=>{if(b.disabled)return;b.disabled=true;
   try{await fn()}catch(e){notify(label+": "+(e?.message||e),true)}
   finally{b.disabled=false}};
  return b;
 };
 const status=(message,bad=false)=>{const x=$("opStatus");x.textContent=message;x.classList.toggle("is-error",bad)};
 async function all(t,u,v,name,{optional=false}={}){
  let records=[],cursor=null;
  for(let page=0;page<25;page++){
   guard(t,u,v);
   const q=[orderBy(documentId()),limit(200)];
   if(cursor)q.push(startAfter(cursor));
   let snap;
   try{snap=await getDocs(query(coll(t,name),...q))}
   catch(e){if(optional&&e?.code==="permission-denied")return {records:[],restricted:true};throw e}
   guard(t,u,v);
   records.push(...snap.docs.map(x=>({id:x.id,...x.data()})));
   if(records.length>READER_LIMIT)throw Error(name+" exceeds the safe 5,000-record Operations Center limit.");
   if(snap.size<200)return {records,restricted:false};
   cursor=snap.docs.at(-1);
  }
  throw Error(name+" has more records than supported by this Operations Center. Use the existing paginated register.");
 }
 function activate(tab){
  active=tab;
  for(const el of host.querySelectorAll("[data-op-tab]"))el.setAttribute("aria-selected",String(el.dataset.opTab===tab));
  for(const el of host.querySelectorAll("[data-op-panel]"))el.classList.toggle("hidden",el.dataset.opPanel!==tab);
  if(tab==="health")healthChecks();
 }
 host.querySelectorAll("[data-op-tab]").forEach(b=>b.onclick=()=>activate(b.dataset.opTab));
 $("opGoRun").onclick=()=>onNavigate("payroll");
 $("opGoTime").onclick=()=>onOpenTime();
 $("opOpenService").onclick=()=>onNavigate("service");
 function renderMetrics(){
  const pendingTime=data.time.filter(x=>(x.status||"pending")==="pending").length;
  const pendingSale=data.sales.filter(x=>x.status==="pending").length;
  const actionable=data.runs.filter(x=>["draft","submitted","approved","rejected"].includes(x.status));
  const metrics=[["Pending timecards",pendingTime],["Sales to review",pendingSale],["Open payroll runs",actionable.length],["Active employees",data.employees.filter(x=>x.status==="active").length]];
  const box=$("opMetrics");box.replaceChildren();
  for(const [label,value] of metrics){const tile=E("article","ops30-metric");tile.append(E("span","",label),E("strong","",value));box.append(tile)}
 }
 const pickRun=()=>{
  const id=$("opRunSelect").value;
  return data.runs.find(x=>x.id===id)||null;
 };
 function runOptions(){
  const el=$("opRunSelect"),prev=el.value;
  el.replaceChildren(option("","Select a payroll run"));
  for(const r of [...data.runs].sort((a,b)=>String(b.periodEnd).localeCompare(String(a.periodEnd))))
   el.append(option(r.id,(r.name||r.periodStart+" – "+r.periodEnd)+" · "+(r.processingMode||"combined")+" · "+r.status));
  if(data.runs.some(r=>r.id===prev))el.value=prev;
 }
 function renderApprovals(){
  const pendingTime=data.time.filter(x=>(x.status||"pending")==="pending");
  const pendingSales=data.sales.filter(x=>x.status==="pending");
  const submitted=data.runs.filter(x=>x.status==="submitted");
  const approved=data.runs.filter(x=>x.status==="approved");
  const actions=[];
  if(pendingTime.length)actions.push(entry(pendingTime.length+" timecards awaiting review","Use the Timekeeping approval queue. Reviewers cannot approve their own submissions.",[btn("Review time",onOpenTime)]));
  if(pendingSales.length)actions.push(entry(pendingSales.length+" commissions awaiting review","Review approved sales and their employee plans before payroll generation.",[btn("Open commission review",()=>onNavigate("commissions"))]));
  for(const r of submitted)actions.push(entry("Submitted: "+(r.name||r.periodStart+" – "+r.periodEnd),r.periodStart+" – "+r.periodEnd+" · Different authorized reviewers must approve the run.",[btn("Open run",()=>onOpenRun(r.id))]));
  for(const r of approved)actions.push(entry("Ready for finalization: "+(r.name||r.periodStart+" – "+r.periodEnd),"A separate authorized finalizer completes this simulated run.",[btn("Open run",()=>onOpenRun(r.id))]));
  list($("opApprovalQueue"),actions,"No pending actions were found in fully loaded company data.");
 }
 function renderSchedules(){
  const entries=data.schedules.map(s=>{
   const next=schedulePeriods(s,1)[0];
   const buttons=canManage()?[btn("Preview",()=>previewSaved(s)),btn(s.active?"Pause schedule":"Resume schedule",()=>toggleSchedule(s))]:[];
   if(canManage()&&s.active)buttons.push(btn("Create next draft",()=>createFromSchedule(s),"primary"));
   return entry(s.name,s.cadence+" · "+s.processingMode+" · Next "+next.periodStart+" – "+next.periodEnd+
    " · Payday "+next.payDate+(s.active?"":" · Paused"),buttons);
  });
  list($("opScheduleList"),entries,"No recurring schedules have been saved.");
 }
 async function toggleSchedule(s){
  if(!canManage())throw Error("Payroll-management permission required.");
  const {t,u,v}=account();guard(t,u,v);
  const ref=doc(db,"tenants",t,"payCycleSchedules",s.id);
  await runTransaction(db,async tx=>{
   const snapshot=await tx.get(ref);
   if(!snapshot.exists())throw Error("Schedule was deleted.");
   tx.update(ref,{active:!snapshot.data().active,updatedBy:u,updatedAt:serverTimestamp()});
  });
  notify("Schedule updated.");await refresh();activate("schedules");
 }
 function previewSaved(s){
  const periods=schedulePeriods(s,3);
  list($("opSchedulePreview"),periods.map(p=>{
   const conflicts=validatePeriodAgainstRuns(p,data.runs);
   return entry(p.periodStart+" – "+p.periodEnd,"Payday "+p.payDate+" · "+p.processingMode+(conflicts.length?" · "+conflicts.length+" overlapping period(s)":""),
    [],conflicts.length?"warning":"");
  }),"");
 }
 function renderProfiles(){
  const map=new Map(data.employees.map(x=>[x.id,x]));
  list($("opCompList"),data.profiles.map(p=>entry(map.get(p.employeeId)?.displayName||p.employeeId,
   "Effective "+p.effectiveFrom+" · Simulated tax "+(p.taxRateBasisPoints/100).toFixed(2)+"% · Other deduction "+money(p.recurringDeductionCents))),"No employee-specific profiles yet. Company policy applies.");
  const changes=[...data.changes].sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)).slice(0,80);
  const history=changes.length?changes.map(h=>entry(
    map.get(h.employeeId)?.displayName||h.employeeId,
    h.effectiveDate+" · "+(h.payType==="hourly"?"Hourly "+money(h.hourlyRateCents):"Annual "+money(h.annualSalaryCents))+
    " · Fictional tax "+(h.taxRateBasisPoints/100).toFixed(2)+"% · Other "+money(h.recurringDeductionCents)+
    (h.note?" · "+h.note:""))):
    [...data.history].sort((a,b)=>(b.changedAt?.seconds||0)-(a.changedAt?.seconds||0)).slice(0,30).map(h=>entry(
    map.get(h.employeeId)?.displayName||h.employeeId,h.effectiveFrom+" · "+(h.taxRateBasisPoints/100).toFixed(2)+"% · Other "+money(h.recurringDeductionCents)));
  list($("opCompHistory"),history,"No compensation history yet.");
  const select=$("opCompEmployee"),old=select.value;
  select.replaceChildren(option("","Choose an employee"));
  for(const e of data.employees.filter(x=>x.status==="active").sort((a,b)=>a.displayName.localeCompare(b.displayName)))select.append(option(e.id,e.displayName));
  if(data.employees.some(x=>x.id===old))select.value=old;
 }
 $("opCompEmployee").onchange=()=>{
  const selected=data.profiles.find(x=>x.employeeId===$("opCompEmployee").value);
  $("opCompDate").value=selected?.effectiveFrom||dateNow();
  $("opCompTax").value=String((selected?.taxRateBasisPoints||0)/100);
  $("opCompOther").value=((selected?.recurringDeductionCents||0)/100).toFixed(2);
  const employee=data.employees.find(x=>x.id===$("opCompEmployee").value);
  const latest=data.changes.filter(x=>x.employeeId===employee?.id)
   .sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0];
  $("opCompRateLabel").firstChild.textContent=employee?.payType==="salary"?"Annual salary ($)":"Hourly rate ($)";
  $("opCompRate").value=employee?
   (((latest?.payType===employee.payType?(employee.payType==="salary"?latest.annualSalaryCents:latest.hourlyRateCents):
     employee.payType==="salary"?employee.annualSalaryCents:employee.hourlyRateCents)||0)/100).toFixed(2):"";
  $("opCompNote").value="";
 };
 async function refresh(){
  if(loading)return;
  if(!state().tenantId||!state().user?.uid){status("Select a client company before opening its operations center.");return}
  const t=state().tenantId,u=state().user.uid,v=++epoch;
  company=t;actor=u;loading=true;
  $("opReload").disabled=true;status("Reading company payroll, timekeeping, commissions, and authorized operations records…");
  loadErrors=[];const next={...data};
  const sources=[["employees",false],["timeEntries",false],["payrollRuns",false],["commissionSales",true],
   ["payCycleSchedules",true],["compensationProfiles",true],["compensationHistory",true],["compensationChanges",true],["auditEvents",true]];
  for(const [source,optional] of sources){
   const property={timeEntries:"time",payrollRuns:"runs",commissionSales:"sales",payCycleSchedules:"schedules",compensationProfiles:"profiles",compensationHistory:"history",compensationChanges:"changes",auditEvents:"audit"}[source]||source;
   try{
    const read=await all(t,u,v,source,{optional});
    next[property]=read.records;
    if(read.restricted)loadErrors.push(source+": restricted for this role");
   }catch(e){
    loadErrors.push(source+": "+(e?.code||e?.message||e));
    next[property]=[];
   }
  }
  if(t!==state().tenantId||u!==state().user?.uid||v!==epoch){loading=false;return}
  data=next;loading=false;$("opReload").disabled=false;
  const hard=loadErrors.filter(x=>!x.includes("restricted for this role"));
  status(hard.length?"Some data sources could not be read; results are incomplete: "+hard.join(" · "):
   "Company records loaded for "+(state().tenants.find(x=>x.id===t)?.name||"selected company")+". Figures are simulated and depend on your permissions.",
   hard.length>0);
  renderMetrics();runOptions();renderApprovals();renderSchedules();renderProfiles();renderReports();healthChecks();
  if(inspected)await inspect(inspected).catch(e=>status("Reconciliation: "+e.message,true));
 }
 $("opReload").onclick=refresh;
 $("opRunSelect").onchange=()=>{inspected=null;$("opIssues").replaceChildren();$("opRunSummary").textContent=""};
 $("opInspect").onclick=()=>inspect(pickRun());
 async function inspect(run){
  if(!run){$("opRunSummary").textContent="Choose a pay period first.";return}
  const {t,u,v}=account();inspected=run;status("Inspecting employee pay lines for "+(run.name||run.periodStart)+"…");
  const linesResult=await allRunLines(t,u,v,run.id);
  const complete=!loadErrors.some(x=>/timeEntries|employees|payrollRuns|commissionSales/.test(x));
  const report=reconcileRun({run,lines:linesResult,time:data.time,sales:data.sales,employees:data.employees,complete});
  const check=payrollReadiness({run,lines:linesResult,time:data.time,sales:data.sales,employees:data.employees,complete});
  const totals=report.totals;
  $("opRunSummary").textContent=(run.name||run.periodStart+" – "+run.periodEnd)+" · "+(run.processingMode||"combined")+
   " · "+linesResult.length+" employees · "+money(totals.grossCents)+" gross · "+money(totals.netCents)+
   " net · "+(check.ready?"No blocking reconciliation findings":"Needs review");
  const findings=report.findings;
  list($("opIssues"),findings.map(f=>entry(f.code.replaceAll("_"," "),f.message,[],f.severity)),
   "No reconciliation exceptions detected in the loaded source records.");
  status("Inspection completed. Read-only; no payroll records were modified.");
 }
 async function allRunLines(t,u,v,id){
  let rows=[],cursor=null;
  for(let page=0;page<15;page++){
   guard(t,u,v);
   const parts=[orderBy(documentId()),limit(150)];
   if(cursor)parts.push(startAfter(cursor));
   const snap=await getDocs(query(collection(db,"tenants",t,"payrollRuns",id,"lines"),...parts));
   rows.push(...snap.docs.map(d=>({id:d.id,...d.data()})));
   if(snap.size<150)return rows;
   cursor=snap.docs.at(-1);
  }
  throw Error("Too many payroll lines in "+id+". Unable to produce a complete report.");
 }
 async function createFromSchedule(s){
  if(!canManage())throw Error("Only authorized payroll staff can create schedules and drafts.");
  const {t,u,v}=account(),period=schedulePeriods(s,1)[0];
  const conflicts=validatePeriodAgainstRuns(period,data.runs);
  if(conflicts.length)throw Error("This period overlaps "+conflicts.length+" existing pay run(s). Resolve the overlap before creating a draft.");
  if(!await confirmAction("Create scheduled payroll","Create a "+period.processingMode+" draft for "+period.periodStart+" – "+period.periodEnd+"? This does not approve or finalize anything."))return;
  guard(t,u,v);
  const id="scheduled-"+s.id+"-"+period.periodStart;
  const target=doc(db,"tenants",t,"payrollRuns",id);
  const scheduleRef=doc(db,"tenants",t,"payCycleSchedules",s.id);
  await runTransaction(db,async tx=>{
   const [snapshot,currentSchedule]=await Promise.all([tx.get(target),tx.get(scheduleRef)]);
   if(snapshot.exists())throw Error("This schedule's pay period was already generated.");
   if(!currentSchedule.exists()||!currentSchedule.data().active)throw Error("Schedule is no longer active.");
   if(currentSchedule.data().nextStart!==s.nextStart)throw Error("Schedule changed. Refresh and create the current period instead.");
   tx.set(target,{name:s.name+" · "+period.periodStart,processingMode:period.processingMode,
    periodStart:period.periodStart,periodEnd:period.periodEnd,payDate:period.payDate,
    status:"draft",createdAt:serverTimestamp(),createdBy:u,submittedBy:"",approvedBy:"",finalizedBy:""});
   tx.update(scheduleRef,{nextStart:plusDays(period.periodEnd,1),updatedBy:u,updatedAt:serverTimestamp()});
  });
  notify("Scheduled draft created. Review its inputs before generating simulated pay lines.");
  await refreshCompany();
  await refresh();
  await onOpenRun(id);
 }
 $("opPreviewSchedule").onclick=()=>{
  try{
   const s=validatePaySchedule({name:$("opScheduleName").value,cadence:$("opCadence").value,
    processingMode:$("opMode").value,nextStart:$("opNextStart").value,payDelay:$("opPayDelay").value});
   previewSaved(s);
  }catch(e){notify(e.message,true)}
 };
 $("opScheduleForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!canManage())throw Error("Payroll-management permission required.");
   const {t,u,v}=account();
   const schedule=validatePaySchedule({name:$("opScheduleName").value,cadence:$("opCadence").value,
    processingMode:$("opMode").value,nextStart:$("opNextStart").value,payDelay:$("opPayDelay").value});
   if(!await confirmAction("Save pay schedule","Save "+schedule.name+" for the selected company? It will not automatically finalize or make payments."))return;
   guard(t,u,v);
   await addDoc(coll(t,"payCycleSchedules"),{...schedule,createdAt:serverTimestamp(),createdBy:u,updatedAt:serverTimestamp()});
   notify("Pay schedule saved.");await refresh();activate("schedules");
  }catch(e){notify("Schedule: "+e.message,true)}
 };
 $("opCompForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!canManage())throw Error("Payroll-management permission required.");
   const {t,u,v}=account();
   const draft=validateCompensationProfile({
    employeeId:$("opCompEmployee").value,effectiveFrom:$("opCompDate").value,
    taxRateBasisPoints:Math.round(Number($("opCompTax").value)*100),
    recurringDeductionCents:toCents($("opCompOther").value)
   });
   if(!data.employees.some(x=>x.id===draft.employeeId&&x.status==="active"))
    throw Error("Employee is not active or no longer exists.");
   if(!await confirmAction("Update simulated compensation",
    "Effective "+draft.effectiveFrom+": "+(draft.taxRateBasisPoints/100)+"% fictional withholding and "+
    money(draft.recurringDeductionCents)+" other recurring deductions. Finalized payroll remains unchanged."))return;
   guard(t,u,v);
   const employee=data.employees.find(x=>x.id===draft.employeeId);
   if(!employee)throw Error("Employee was removed. Refresh and select an active employee.");
   const cents=toCents($("opCompRate").value);
   const note=$("opCompNote").value.trim().slice(0,160);
   const changeId=draft.employeeId+"_"+draft.effectiveFrom;
   const changeRef=doc(db,"tenants",t,"compensationChanges",changeId);
   const ref=doc(db,"tenants",t,"compensationProfiles",draft.employeeId);
   const history=doc(coll(t,"compensationHistory"));
   await runTransaction(db,async tx=>{
    const employeeRef=doc(db,"tenants",t,"employees",draft.employeeId);
    const [currentEmployee,previousChange,previousProfile]=await Promise.all([
     tx.get(employeeRef),tx.get(changeRef),tx.get(ref)
    ]);
    if(!currentEmployee.exists()||currentEmployee.data().status!=="active")throw Error("Employee record changed.");
    if(previousChange.exists())throw Error("An effective-dated compensation version already exists for this employee and date.");
    if(currentEmployee.data().payType!==employee.payType)throw Error("Employee pay type changed. Refresh before saving.");
    tx.set(changeRef,{employeeId:draft.employeeId,effectiveDate:draft.effectiveFrom,payType:employee.payType,
     ...(employee.payType==="salary"?{annualSalaryCents:cents}:{hourlyRateCents:cents}),
     taxRateBasisPoints:draft.taxRateBasisPoints,recurringDeductionCents:draft.recurringDeductionCents,
     note,createdBy:u,createdAt:serverTimestamp()});
    if(!previousProfile.exists()||previousProfile.data().effectiveFrom<=draft.effectiveFrom)
     tx.set(ref,{...draft,updatedAt:serverTimestamp(),updatedBy:u});
    tx.set(history,{...draft,changedAt:serverTimestamp(),changedBy:u});
   });
   notify("Compensation profile saved and history recorded.");await refresh();activate("profiles");
  }catch(e){notify("Compensation: "+e.message,true)}
 };
 function csvDownload(rows,filename){
  const blob=new Blob(["\uFEFF",CSV(rows)],{type:"text/csv;charset=utf-8"});
  const link=document.createElement("a"),url=URL.createObjectURL(blob);
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 }
 function renderReports(){
  const root=$("opReportTable");root.replaceChildren();
  const table=E("table","ops30-table");
  const head=E("thead"),tr=E("tr");
  for(const col of ["Pay period","Mode","Status","Payday"])tr.append(E("th","",col));
  head.append(tr);table.append(head);
  const body=E("tbody");
  for(const run of [...data.runs].sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd)).slice(0,60)){
   const tr=E("tr");
   for(const label of [run.name||run.periodStart+" – "+run.periodEnd,run.processingMode||"combined",run.status,run.payDate])tr.append(E("td","",label));
   body.append(tr);
  }
  table.append(body);root.append(table);
  const entries=[...data.audit].sort((a,b)=>(b.at?.seconds||0)-(a.at?.seconds||0)).slice(0,35).map(a=>entry(
   a.action||"Activity",(isoTime(a.at)||"Date unavailable")+" · "+a.category+" · "+a.detail));
  list($("opAuditList"),entries,"No authorized audit events were returned.");
 }
 $("opExportRuns").onclick=()=>{
  if(loadErrors.some(x=>x.startsWith("payrollRuns:")))return notify("Payroll register is incomplete. Retry loading.",true);
  csvDownload([["Run","Period start","Period end","Payday","Mode","Status"],
   ...data.runs.map(r=>[r.name||"",r.periodStart,r.periodEnd,r.payDate,r.processingMode||"combined",r.status])],
   "Sterling-Payroll-Register.csv");
 };
 $("opExportEmployee").onclick=async()=>{
  const {t,u,v}=account();
  if(loadErrors.some(x=>x.startsWith("payrollRuns:")))return notify("Payroll register is incomplete. Retry loading.",true);
  const runs=data.runs.filter(x=>x.status==="finalized");
  if(runs.length>40)return notify("This export is limited to 40 finalized runs. Narrow the archive before exporting.",true);
  const result=[["Run","Period end","Employee","Regular","Overtime","Bonus","Commission","Tax","Other deductions","Net"]];
  try{
   for(const run of runs){
    const lines=await allRunLines(t,u,v,run.id);
    for(const x of lines)result.push([run.name||run.id,run.periodEnd,x.employeeName,
     ...["regularCents","overtimeCents","bonusCents","commissionCents","taxCents","otherDeductionCents","netCents"]
      .map(key=>((x[key]||0)/100).toFixed(2))]);
   }
   csvDownload(result,"Sterling-Fictional-Employee-Earnings.csv");
   notify(result.length-1+" employee earnings entries exported.");
  }catch(e){notify("Export failed: "+e.message,true)}
 };
 $("opExportYTD").onclick=async()=>{
  try{
   const {t,u,v}=account();
   if(loadErrors.some(x=>/^(payrollRuns|employees):/.test(x)))throw Error("Pay records are incomplete. Retry before exporting.");
   const currentYear=String(new Date().getFullYear());
   const runs=data.runs.filter(x=>x.status==="finalized"&&x.periodEnd?.startsWith(currentYear));
   if(runs.length>40)throw Error("Year-to-date export is limited to 40 finalized runs; use the full ledger export for large archives.");
   const totals=new Map(),department=new Map(data.employees.map(x=>[x.id,x.department||"Unassigned"]));
   for(const run of runs){
    const lines=await allRunLines(t,u,v,run.id);
    for(const l of lines){
     const item=totals.get(l.employeeId)||{name:l.employeeName||"Employee",department:department.get(l.employeeId)||"Unassigned",
      runs:0,gross:0,commission:0,tax:0,other:0,net:0};
     item.runs++;item.gross+=l.grossCents||0;item.commission+=l.commissionCents||0;item.tax+=l.taxCents||0;
     item.other+=l.otherDeductionCents??((l.deductionCents||0)-(l.taxCents||0));item.net+=l.netCents||0;
     totals.set(l.employeeId,item);
    }
   }
   csvDownload([["Year","Employee","Department","Pay periods","Gross","Commission","Simulated taxes","Other deductions","Simulated net"],
    ...[...totals.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(x=>
     [currentYear,x.name,x.department,x.runs,...[x.gross,x.commission,x.tax,x.other,x.net].map(y=>(y/100).toFixed(2))])],
    "Sterling-Fictional-YTD-"+currentYear+".csv");
   notify("Year-to-date report exported for "+totals.size+" employees.");
  }catch(e){notify("Year-to-date report: "+e.message,true)}
 };
 $("opPrintReport").onclick=()=>window.print();
 function healthChecks(){
  const checks=[
   ["Company context",Boolean(state().tenantId),state().tenantId?"Company selected":"No company selected"],
   ["Authenticated session",Boolean(state().user?.uid),state().user?.uid?"User authenticated":"Sign in required"],
   ["Payroll register",!loadErrors.some(x=>x.startsWith("payrollRuns:")),data.runs.length+" pay periods loaded"],
   ["Employee register",!loadErrors.some(x=>x.startsWith("employees:")),data.employees.length+" employees loaded"],
   ["Timecards",!loadErrors.some(x=>x.startsWith("timeEntries:")),data.time.length+" entries loaded"],
   ["Commission source",!loadErrors.some(x=>x.startsWith("commissionSales:")),data.sales.length+" sales available"],
   ["Schedule source",!loadErrors.some(x=>x.startsWith("payCycleSchedules:")),data.schedules.length+" schedules available"],
   ["Firebase rules deployment",null,"Not verifiable from the client. Check Firebase deploy and emulator tests."],
   ["Browser frontend version",true,"Sterling Operations 3.0 · 2026-10-19"]
  ];
  if(data.runs.some(x=>!validDate(x.periodStart)||!validDate(x.periodEnd)))
   checks.push(["Period dates",false,"At least one payroll run contains an invalid date."]);
  else checks.push(["Period dates",true,"Loaded pay periods have valid dates."]);
  lastHealth=checks.map(([name,ok,details])=>({name,ok,details}));
  list($("opHealthList"),lastHealth.map(x=>entry(x.name,x.details,[],x.ok===false?"error":x.ok===null?"warning":"")), "No checks available.");
 }
 $("opHealthCheck").onclick=async()=>{await refresh();activate("health");notify("Read-only diagnostics refreshed.")};
 $("opExportHealth").onclick=()=>csvDownload([["Check","Status","Details"],...lastHealth.map(x=>[x.name,x.ok===null?"UNVERIFIED":x.ok?"PASS":"CHECK",x.details])],"Sterling-Payroll-Diagnostics.csv");
 $("opRequestForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   const {t,u,v}=account();
   if(state().role==="employee"||state().platformRole==="payroll_operator")throw Error("The client service desk is not available to this account.");
   const subject=$("opRequestSubject").value.trim(),details=$("opRequestDetails").value.trim(),category=$("opRequestType").value;
   if(subject.length<3||subject.length>120||details.length<4||details.length>1500)throw Error("Please complete the subject and details.");
   if(!await confirmAction("Open support case","Submit this company-specific request to Sterling support?"))return;
   guard(t,u,v);
   await addDoc(coll(t,"supportTickets"),{subject,details,priority:"normal",category,status:"open",assignedUid:"",
    createdBy:u,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   notify("Support case created. Use Client Services to view responses.");$("opRequestForm").reset();
  }catch(e){notify("Support request: "+e.message,true)}
 };
 $("opNextStart").value=dateNow();$("opCompDate").value=dateNow();
 $("opReload").disabled=false;
 activate("readiness");
 return {refresh,clear(){++epoch;company="";actor="";data={employees:[],time:[],runs:[],sales:[],profiles:[],schedules:[],history:[],changes:[],audit:[]};inspected=null;loadErrors=[];status("Choose a company.");}};
}
