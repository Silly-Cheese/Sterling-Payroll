import {collection,doc,getDoc,getDocs,addDoc,updateDoc,setDoc,serverTimestamp,query,limit,orderBy,documentId,startAfter} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {toCents,money} from "./payroll-core.js";
import {taxBasisPoints} from "./payroll-tax-core.js?v=sterling-sim-tax-20261018";
import {usesTimecards,payrollRunModeLabel} from "./payroll-run-modes.js?v=sterling-payroll-modes-20261019";
import {readCompletePages} from "./payroll-paging.js?v=sterling-complete-payroll-20261017";
import {mountBulkTimecardApprovals} from "./timecard-bulk.js?v=sterling-timekeeping-20261018";
import {DEFAULT_POLICY,validatePolicy,validReviewTransition,validateCorrection,validateLeave,buildPayrollPreview,csvStatement} from "./phase3-core.js?v=sterling-sim-tax-20261018";
const el=(tag,cls,text)=>{const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=String(text);return a};
const opt=(v,text)=>{const a=el("option","",text);a.value=v;return a};
const display=(container,records,mapper,emptyMessage)=>{container.replaceChildren();if(!records.length)container.append(el("p","muted",emptyMessage));else for(const record of records)container.append(mapper(record))};
const row=(title,subtitle,actions=[])=>{const a=el("div","list-item"),b=el("div"),c=el("div","item-actions");b.append(el("strong","",title),el("small","",subtitle));for(const x of actions)c.append(x);a.append(b,c);return a};
const action=(title,cb)=>{const b=el("button","btn small",title);b.type="button";b.onclick=async()=>{b.disabled=true;try{await cb()}finally{b.disabled=false}};return b};
export async function mountPhase3({db,getState,refreshCompany,notify,confirmAction,ownerDelete,openOwnerReview}){
 const time=document.getElementById("phase3Time"),payroll=document.getElementById("phase3Payroll");
 if(!time||!payroll)throw Error("Phase 3 workspace containers missing");
 const html=await Promise.all(["phase3-time.html","phase3-payroll.html"].map(async name=>{
  const response=await fetch("./"+name+"?v=sterling-sim-tax-20261018");if(!response.ok)throw Error("Missing "+name);return response.text()
 }));
 time.innerHTML=html[0];payroll.innerHTML=html[1];
 const $=id=>document.getElementById(id),S=()=>getState();
 let corrections=[],leaves=[],policy=DEFAULT_POLICY,tenantLoaded="";
 const tcol=name=>collection(db,"tenants",S().tenantId,name);
 const tdoc=(name,id)=>doc(db,"tenants",S().tenantId,name,id);
 const writeAllowed=()=>S().platformWrite||S().platformRole==="payroll_operator"||["client_admin","payroll_specialist"].includes(S().role);
 const adminAllowed=()=>S().platformWrite||S().role==="client_admin";
 const describeError=(msg,e)=>notify(msg+": "+(e.code||e.message||e),true);
 const bulkTime=mountBulkTimecardApprovals({db,getState,refreshCompany,refreshApprovals:()=>refresh(),notify,confirmAction});
 // Payroll uses independent, exhaustive server reads. Directory pages are only a UI
 // convenience and must never determine whether pay lines can be calculated.
 async function loadAll(companyId, collectionName, accessCheck, onProgress=()=>{}){
  return readCompletePages(async(cursor,pageSize)=>{
   accessCheck();
   const parameters=[orderBy(documentId()),limit(pageSize)];
   if(cursor)parameters.push(startAfter(cursor));
   const response=await getDocs(query(collection(db,"tenants",companyId,collectionName),...parameters));
   accessCheck();
   return {records:response.docs.map(d=>({id:d.id,...d.data()})),
    nextCursor:response.docs.at(-1)||null};
  },{pageSize:200,checkAccess:accessCheck,onProgress});
 }
 async function retrieve(){
  const tenant=S().tenantId,actor=S().user?.uid;
  if(!tenant||!actor)return;
  const check=()=>{
   if(S().tenantId!==tenant||S().user?.uid!==actor)throw Error("Company or account changed; retry.");
  };
  const [c,l,p]=await Promise.all([
   loadAll(tenant,"timeCorrections",check),
   loadAll(tenant,"leaveRequests",check),
   getDoc(doc(db,"tenants",tenant,"payrollPolicies","current"))
  ]);
  check();
  corrections=c;
  leaves=l;
  policy=p.exists()?validatePolicy(p.data()):DEFAULT_POLICY;
  tenantLoaded=tenant;
 }
 function options(select,records,emptyTitle,title){
  const old=select.value;select.replaceChildren(opt("",emptyTitle),...records.map(x=>opt(x.id,title(x))));
  select.value=records.some(x=>x.id===old)?old:"";
 }
 function draw(){
  if(!S().tenantId)return;
  options($("p3CorrectionEntry"),S().time,"Choose time entry",x=>(S().employees.find(e=>e.id===x.employeeId)?.displayName||"Employee")+" · "+x.workDate);
  options($("p3LeaveEmployee"),S().employees.filter(x=>x.status==="active"),"Choose employee",x=>x.displayName);
  options($("p3Original"),S().runs.filter(x=>x.status==="finalized"),"Choose finalized payroll",x=>x.periodStart+"–"+x.periodEnd);
  options($("p3CompareTarget"),S().runs,"Choose comparison run",x=>x.periodStart+"–"+x.periodEnd);
  $("p3Multiplier").value=String(policy.overtimeMultiplierHundredths);
  $("p3Bonus").value=(policy.defaultBonusCents/100).toFixed(2);
  $("p3Deduction").value=(policy.defaultDeductionCents/100).toFixed(2);
  $("p3TaxRate").value=((policy.defaultTaxRateBasisPoints||0)/100).toFixed(2);
  $("p3PolicyStatus").textContent="Policy version "+policy.version+" • Approved time required";
  $("p3PolicyForm").classList.toggle("hidden",!adminAllowed());
  $("p3CorrectionForm").classList.toggle("hidden",!writeAllowed());
  $("p3LeaveForm").classList.toggle("hidden",!writeAllowed());
  const pending=S().time.filter(x=>(x.status||"pending")==="pending");
  const visiblePending=pending.slice(0,50);
  display($("p3TimeQueue"),visiblePending,entry=>{
   const worker=S().employees.find(e=>e.id===entry.employeeId);
   const can=adminAllowed()&&(S().platformOwner||entry.createdBy!==S().user.uid);
   const actions=can?[
    action("Approve",()=>reviewTime(entry,"approved")),
    action("Reject",()=>reviewTime(entry,"rejected"))
   ]:[];
   if(S().platformOwner&&openOwnerReview)actions.push(action("Owner override",()=>openOwnerReview("timeEntries",entry.id)));
   return bulkTime.decorateRow(row((worker?.displayName||"Employee")+" · "+entry.workDate,
    entry.regularHours+" regular / "+entry.overtimeHours+" overtime",actions),entry,worker?.displayName||"Employee");
  },"No pending timecards to review.");
  if(pending.length>visiblePending.length)
   $("p3TimeQueue").append(el("p","fine-print","Showing the first 50 pending timecards. Approve all company pending includes entries beyond this list."));
  bulkTime.sync(visiblePending);
  display($("p3Corrections"),corrections.filter(x=>x.status==="pending"),x=>{
   const entry=S().time.find(t=>t.id===x.timeEntryId),can=adminAllowed()&&x.createdBy!==S().user.uid;
   const actions=can?[
    action("Approve",()=>reviewRequest("timeCorrections",x,"approved")),
    action("Reject",()=>reviewRequest("timeCorrections",x,"rejected"))
   ]:[];
   if(S().platformOwner&&openOwnerReview)actions.push(action("Owner override",()=>openOwnerReview("timeCorrections",x.id)));
   if(S().platformOwner&&ownerDelete)actions.push(action("Delete",async()=>{try{await ownerDelete("timeCorrections",x);await refresh()}catch(e){describeError("Correction delete failed",e)}}));
   return row((entry?.workDate||"Time entry")+" · "+x.reason,x.regularHours+" regular / "+x.overtimeHours+" overtime",actions);
  },"No correction requests pending review.");
  display($("p3Leaves"),leaves.filter(x=>x.status==="pending"),x=>{
   const worker=S().employees.find(e=>e.id===x.employeeId),can=adminAllowed()&&x.createdBy!==S().user.uid;
   const actions=can?[
    action("Approve",()=>reviewRequest("leaveRequests",x,"approved")),
    action("Reject",()=>reviewRequest("leaveRequests",x,"rejected"))
   ]:[];
   if(S().platformOwner&&openOwnerReview)actions.push(action("Owner override",()=>openOwnerReview("leaveRequests",x.id)));
   if(S().platformOwner&&ownerDelete)actions.push(action("Delete",async()=>{try{await ownerDelete("leaveRequests",x);await refresh()}catch(e){describeError("Leave delete failed",e)}}));
   return row((worker?.displayName||"Employee")+" · "+x.date,x.hours+" paid leave hours • "+x.reason,actions);
  },"No leave requests pending review.");
 }
 async function refresh(){
  const tenant=S().tenantId;
  if(!tenant){corrections=[];leaves=[];tenantLoaded="";return}
  if(tenant!==tenantLoaded){
   corrections=[];leaves=[];policy=DEFAULT_POLICY;tenantLoaded="";
   for(const id of ["p3TimeQueue","p3Corrections","p3Leaves","p3Comparison"]){
    const target=$(id);if(target)target.replaceChildren();
   }
   $("p3RunReview").textContent="Loading company-specific payroll records…";
  }
  try{await retrieve();if(tenant===S().tenantId)draw()}catch(e){
   corrections=[];leaves=[];tenantLoaded="";
   for(const id of ["p3TimeQueue","p3Corrections","p3Leaves","p3Comparison"]){
    const target=$(id);if(target)target.replaceChildren();
   }
   $("p3RunReview").textContent="Company data could not be loaded. No previous client data is displayed.";
   describeError("Phase 3 data load failed",e);
  }
 }
 async function reviewTime(entry,status){
  try{
   if(!adminAllowed()||(!S().platformOwner&&entry.createdBy===S().user.uid))throw Error("Independent client approval required");
   if(!await confirmAction("Review time entry",status+" time for "+entry.workDate+"?"))return;
   await updateDoc(tdoc("timeEntries",entry.id),{status,approvedBy:S().user.uid});
   await refreshCompany();await refresh();notify("Time entry "+status+".");
  }catch(e){describeError("Time review failed",e)}
 }
 async function reviewRequest(kind,record,next){
  try{
   if(!adminAllowed()||!validReviewTransition(record,S().user.uid,next))throw Error("Independent approval required");
   if(!await confirmAction("Review request","Mark this fictional "+kind+" request "+next+"?"))return;
   await updateDoc(tdoc(kind,record.id),{status:next,reviewedBy:S().user.uid});
   if(kind==="timeCorrections")await refreshCompany();
   await refresh();notify("Request "+next+".");
  }catch(e){describeError("Request review failed",e)}
 }
 $("p3ReloadTime").onclick=()=>refresh();
 $("p3CorrectionEntry").onchange=()=>{
  const entry=S().time.find(x=>x.id===$("p3CorrectionEntry").value);if(!entry)return;
  $("p3Regular").value=entry.regularHours;$("p3Overtime").value=entry.overtimeHours;
 };
 $("p3CorrectionForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!writeAllowed())throw Error("Payroll staff role required");
   const entry=S().time.find(x=>x.id===$("p3CorrectionEntry").value);
   if(!entry||entry.status!=="approved")throw Error("The original time entry must be approved");
   const form=validateCorrection({regularHours:$("p3Regular").value,overtimeHours:$("p3Overtime").value,reason:$("p3CorrectionReason").value});
   if(!await confirmAction("Request correction","Submit time correction for independent approval?"))return;
   await addDoc(tcol("timeCorrections"),{...form,timeEntryId:entry.id,status:"pending",createdBy:S().user.uid,reviewedBy:"",createdAt:serverTimestamp()});
   $("p3CorrectionForm").reset();await refresh();notify("Time correction submitted.");
  }catch(e){describeError("Correction failed",e)}
 };
 $("p3LeaveForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!writeAllowed())throw Error("Payroll staff role required");
   const employee=S().employees.find(x=>x.id===$("p3LeaveEmployee").value);
   if(!employee)throw Error("Choose an employee");
   const form=validateLeave({date:$("p3LeaveDate").value,hours:$("p3LeaveHours").value,reason:$("p3LeaveReason").value});
   if(!await confirmAction("Request paid leave","Submit fictional paid leave for independent approval?"))return;
   await addDoc(tcol("leaveRequests"),{...form,employeeId:employee.id,status:"pending",createdBy:S().user.uid,reviewedBy:"",createdAt:serverTimestamp()});
   $("p3LeaveForm").reset();await refresh();notify("Leave request submitted.");
  }catch(e){describeError("Leave request failed",e)}
 };
 $("p3PolicyForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!adminAllowed())throw Error("Client administrator required");
   const next=validatePolicy({version:policy.version+1,overtimeMultiplierHundredths:Number($("p3Multiplier").value),
    defaultBonusCents:toCents($("p3Bonus").value),defaultDeductionCents:toCents($("p3Deduction").value),defaultTaxRateBasisPoints:taxBasisPoints($("p3TaxRate").value),requireApprovedTime:true});
   if(!await confirmAction("Change pay policy","Apply this fictional payroll policy, including "+$("p3TaxRate").value+"% simulated taxes on gross earnings, to future draft generations? Previously finalized payroll remains unchanged."))return;
   if(tenantLoaded!==S().tenantId)throw Error("Company changed; refresh first");
   if(policy.version===1&&!(await getDoc(tdoc("payrollPolicies","current"))).exists())await setDoc(tdoc("payrollPolicies","current"),next);
   else await updateDoc(tdoc("payrollPolicies","current"),next);
   await refresh();notify("Simulated pay policy updated.");
  }catch(e){describeError("Policy update failed",e)}
 };
 async function buildPreview(run){
  const companyId=S().tenantId,actor=S().user?.uid,selectedRun=S().selectedRun;
  if(!companyId||!actor||!run?.id)throw Error("Choose an authorized company and payroll run.");
  const check=()=>{
   if(S().tenantId!==companyId||S().user?.uid!==actor||S().selectedRun!==selectedRun)
    throw Error("Company, account, or payroll selection changed; retry.");
  };
  const counts={employees:0,timeEntries:0,timeCorrections:0,leaveRequests:0};
  const status=$("p3RunReview");
  const setProgress=()=>{
   if(S().tenantId===companyId)
    status.textContent="Loading "+payrollRunModeLabel(run.processingMode).toLowerCase()+" inputs… "+
     counts.employees+" employees · "+counts.timeEntries+" timecards · "+
     counts.timeCorrections+" corrections · "+counts.leaveRequests+" leave records";
  };
  setProgress();
  try{
   const timeRequired=usesTimecards(run.processingMode);
   const kinds=timeRequired?["employees","timeEntries","timeCorrections","leaveRequests"]:["employees"];
   const [sets,policyDoc]=await Promise.all([
    Promise.all(kinds.map(kind=>loadAll(companyId,kind,check,({count})=>{
     counts[kind]=count;setProgress();
    }))),
    getDoc(doc(db,"tenants",companyId,"payrollPolicies","current"))
   ]);
   check();
   const [employees,entries=[],allCorrections=[],allLeaves=[]]=sets;
   const currentPolicy=policyDoc.exists()?validatePolicy(policyDoc.data()):DEFAULT_POLICY;
   const preview=timeRequired?
    buildPayrollPreview({employees,entries,corrections:allCorrections,
     leaveRequests:allLeaves,policy:currentPolicy,start:run.periodStart,end:run.periodEnd}):
    {lines:[],issues:[],sources:[],totals:null};
   check();
   status.textContent=preview.issues.length?
    preview.issues.length+" unresolved exceptions: "+preview.issues.map(x=>x.kind+" ("+x.detail+")").slice(0,12).join(", "):
    timeRequired?
     preview.lines.length+" timecard payroll lines • "+(preview.totals?money(preview.totals.grossCents):"$0.00")+" before any commissions":
     "Commission-only run: timecards and salary wages are excluded. Approved sales will be loaded for the selected period.";
   return {preview,policy:currentPolicy,employees};
  }catch(error){
   if(S().tenantId===companyId)status.textContent="Could not load complete payroll inputs: "+(error.message||error);
   throw error;
  }
 }
 $("p3Inspect").onclick=async()=>{
  const run=S().runs.find(x=>x.id===S().selectedRun);
  if(!run)return notify("Open a payroll run before inspection.",true);
  try{await buildPreview(run)}catch(e){describeError("Run inspection failed",e)}
 };
 $("p3Export").onclick=async()=>{
  try{
   const run=S().runs.find(x=>x.id===S().selectedRun);
   if(!run||!S().lines.length)throw Error("Open a run containing payroll lines");
   const blob=new Blob([csvStatement({company:S().tenants.find(x=>x.id===S().tenantId)?.name||"Client",run,lines:S().lines})],{type:"text/csv;charset=utf-8"});
   const href=URL.createObjectURL(blob),a=document.createElement("a");a.href=href;a.download="Sterling-Simulated-Pay-"+run.periodEnd+".csv";
   a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
  }catch(e){describeError("Export failed",e)}
 };
 $("p3NewCorrection").onclick=async()=>{
  try{
   if(!writeAllowed())throw Error("Payroll specialist role required");
   const source=S().runs.find(x=>x.id===$("p3Original").value);
   const reason=$("p3CorrectionRunReason").value.trim();
   if(!source||source.status!=="finalized"||reason.length<6||reason.length>200)throw Error("Choose a finalized run and provide a reason (6–200 characters)");
   if(!await confirmAction("Create correction payroll","Create a separate correction draft for "+source.periodEnd+"? Original finalized run will remain unchanged."))return;
   await addDoc(tcol("payrollRuns"),{periodStart:source.periodStart,periodEnd:source.periodEnd,payDate:source.payDate,
    status:"draft",createdAt:serverTimestamp(),createdBy:S().user.uid,submittedBy:"",approvedBy:"",finalizedBy:"",
    correctionOf:source.id,correctionReason:reason});
   await refreshCompany();await refresh();notify("Correction draft created. Open it to regenerate simulated lines.");
  }catch(e){describeError("Correction run creation failed",e)}
 };
 $("p3Compare").onclick=async()=>{
  try{
   const current=S().runs.find(x=>x.id===S().selectedRun),other=S().runs.find(x=>x.id===$("p3CompareTarget").value);
   if(!current||!other)throw Error("Open a run and select a second run");
   const snap=await getDocs(query(collection(db,"tenants",S().tenantId,"payrollRuns",other.id,"lines"),limit(251)));
   if(snap.size>250||S().lines.length>=250)throw Error("Comparison requires complete payroll line data");
   const old=new Map(snap.docs.map(x=>[x.id,x.data().netCents]));
   const ids=new Set([...S().lines.map(x=>x.employeeId),...old.keys()]);
   const changes=[...ids].map(id=>{const a=old.get(id)||0,b=S().lines.find(x=>x.employeeId===id)?.netCents||0;return {id,delta:b-a}});
   const list=$("p3Comparison");list.replaceChildren();
   for(const c of changes.filter(x=>x.delta!==0).slice(0,60)){
    const employee=S().employees.find(e=>e.id===c.id);
    list.append(row(employee?.displayName||"Former employee","Simulated net difference: "+money(Math.abs(c.delta))+" "+(c.delta>0?"higher":"lower")));
   }
   if(!list.children.length)list.textContent="No simulated net differences found.";
  }catch(e){describeError("Comparison failed",e)}
 };
 async function saveSnapshot(run,info){
  const p=info.preview;
  await addDoc(collection(db,"tenants",S().tenantId,"payrollRuns",run.id,"snapshots"),{
   policyVersion:info.policy.version,sourceCount:p.sources.length,employeeCount:p.lines.length,
   grossCents:p.totals.grossCents,netCents:p.totals.netCents,
   generatedAt:serverTimestamp(),generatedBy:S().user.uid
  });
 }
 return {refresh,buildPreview,saveSnapshot};
}