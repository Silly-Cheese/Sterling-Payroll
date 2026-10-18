import {
 collection,doc,getDoc,getDocs,query,orderBy,documentId,startAfter,limit,
 setDoc,addDoc,updateDoc,writeBatch,runTransaction,serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {toCents,money} from "./payroll-core.js";
import {commissionAmount,percentBasisPoints} from "./commission-core.js";
import {readCompletePages} from "./payroll-paging.js?v=sterling-commission-studio-20261018";
import {parseSalesCsv,prepareSalesImport,filterSales,saleSummary} from "./commission-sales-import.js?v=sterling-commission-studio-20261018";

const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e};
const option=(value,text)=>{const e=node("option","",text);e.value=value;return e};
const niceDate=()=>{const date=new Date();return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0")};
const BATCH_SIZE=3, VISIBLE_SIZE=35;

export async function mountCommissions({db,getState,notify,confirmAction,ownerDelete}){
 const root=document.getElementById("commissionsWorkspace");
 const response=await fetch("./commissions.html?v=sterling-commission-studio-20261018");
 if(!root||!response.ok)throw Error("Commission workspace template is missing from the deployment");
 root.innerHTML=await response.text();
 const $=id=>root.querySelector("#"+id),S=()=>getState();
 let tenantId="",enabled=false,plans=new Map(),employees=[],sales=[],sequence=0;
 let view="plans",visible=VISIBLE_SIZE,importRows=null,importCompany="",importBusy=false;
 let planEmployeeIds=new Set(),editingPlan="",loadBusy=false;
 let selectedSalesIds=new Set(),approvalBusy=false;

 const admin=()=>Boolean(S().platformWrite||S().role==="client_admin");
 const staff=()=>Boolean(admin()||S().platformRole==="payroll_operator"||S().role==="payroll_specialist");
 const guard=(company,actor,version)=>{
  if(company!==tenantId||company!==S().tenantId||actor!==S().user?.uid||
   (version!==undefined&&version!==sequence))
   throw Error("Company or user changed. Reopen Commissions and retry.");
 };
 const coll=name=>collection(db,"tenants",tenantId,name);
 const configuration=()=>doc(db,"tenants",tenantId,"commissionSettings","current");
 const planRef=id=>doc(db,"tenants",tenantId,"commissionPlans",id);
 const employee=id=>employees.find(e=>e.id===id);
 const employeeName=id=>employee(id)?.displayName||"Former employee";
 const names=()=>new Map(employees.map(e=>[e.id,e.displayName]));
 function warn(error,context){console.error(context,error);notify(context+": "+(error?.code||error?.message||String(error)),true)}
 function button(text,handler,style=""){
  const b=node("button","btn small "+style,text);b.type="button";
  b.onclick=async()=>{b.disabled=true;try{await handler()}catch(error){warn(error,text+" failed")}finally{b.disabled=false}};
  return b;
 }
 function row(title,detail,status,actions=[]){
  const card=node("article","commission-row"),copy=node("div","commission-row-copy"),right=node("div","commission-row-actions");
  copy.append(node("strong","",title),node("small","",detail));
  if(status)right.append(node("span","status-chip "+(status==="approved"?"success":status==="rejected"?"danger":""),status));
  right.append(...actions);card.append(copy,right);return card;
 }
 function setOptions(select,options){
  const prior=select.value;
  select.replaceChildren(...options.map(x=>option(x[0],x[1])));
  if(options.some(x=>x[0]===prior))select.value=prior;
 }
 async function readAll(collectionName,company,actor,version,onProgress=()=>{}){
  return readCompletePages(async(cursor,count)=>{
   guard(company,actor,version);
   const q=[orderBy(documentId()),limit(count)];
   if(cursor)q.push(startAfter(cursor));
   const snapshot=await getDocs(query(collection(db,"tenants",company,collectionName),...q));
   guard(company,actor,version);
   return {records:snapshot.docs.map(d=>({id:d.id,...d.data()})),nextCursor:snapshot.docs.at(-1)||null};
  },{pageSize:200,maxPages:50,checkAccess:()=>guard(company,actor,version),onProgress});
 }
 function activateView(next){
  view=next;
  for(const [name,id] of [["plans","commissionPlansView"],["sales","commissionSalesView"]])
   $(id).classList.toggle("hidden",name!==view);
  for(const [name,id] of [["plans","commissionPlansTab"],["sales","commissionSalesTab"]]){
   $(id).classList.toggle("active",name===view);
   $(id).setAttribute("aria-pressed",String(name===view));
  }
 }
 $("commissionPlansTab").onclick=()=>activateView("plans");
 $("commissionSalesTab").onclick=()=>activateView("sales");

 function stateUI(){
  $("commissionStatus").replaceChildren(node("span","status-chip "+(enabled?"success":""),enabled?"ACTIVE":"NOT ENABLED"));
  $("commissionContent").classList.toggle("hidden",!enabled);
  $("commissionSettings").classList.toggle("hidden",!admin());
  $("commissionToggle").textContent=enabled?"Disable commissions":"Enable commissions";
  $("commissionPlanNew").hidden=!admin();
  $("commissionSaleNew").hidden=!staff();
  $("commissionSaleImport").hidden=!staff();
  if(enabled)activateView(view);
 }
 function renderMetrics(){
  const stats=saleSummary(sales);
  const active=[...plans.values()].filter(x=>x.active).length;
  const values=[
   ["Active plans",String(active)],
   ["Sales recorded",String(stats.count)],
   ["Pending commissions",money(stats.pendingCents)],
   ["Approved commissions",money(stats.approvedCents)]
  ];
  const el=$("commissionMetrics");el.replaceChildren();
  for(const [label,value] of values){
   const card=node("article","metric");
   card.append(node("div","metric-label",label),node("strong","",value));el.append(card);
  }
 }
 function renderPlans(){
  const target=$("commissionPlans");target.replaceChildren();
  const search=$("commissionPlanSearch").value.trim().toLowerCase(),filter=$("commissionPlanFilter").value;
  const rows=[...plans.entries()].filter(([id,p])=>
   (!search||employeeName(id).toLowerCase().includes(search))&&
   (filter==="all"||(filter==="active"&&p.active)||(filter==="inactive"&&!p.active))
  ).sort((a,b)=>employeeName(a[0]).localeCompare(employeeName(b[0])));
  if(!rows.length){
   target.append(node("p","muted",plans.size?"No matching plans. Clear the search or filter.":"No plans assigned yet. Choose “Assign plans” to get started."));
   return;
  }
  for(const [id,plan] of rows){
   const description=plan.type==="percent"?(plan.rateBasisPoints/100)+"% of each sale":money(plan.fixedCents)+" per sale";
   const actions=admin()?[button("Edit plan",()=>openPlan(id))]:[];
   target.append(row(employeeName(id),description,plan.active?"active":"inactive",actions));
  }
 }
 function refreshEmployeeFilters(){
  const available=employees.filter(e=>e.status==="active").sort((a,b)=>a.displayName.localeCompare(b.displayName));
  setOptions($("commissionEmployeeFilter"),[["","All employees"],...employees.slice().sort((a,b)=>a.displayName.localeCompare(b.displayName)).map(e=>[e.id,e.displayName])]);
  return available;
 }
 function selectedSales(){
  return filterSales(sales,{
   employeeId:$("commissionEmployeeFilter").value,status:$("commissionFilter").value,
   sort:$("commissionSort").value,start:$("commissionDateFrom").value,
   end:$("commissionDateTo").value,search:$("commissionSearch").value
  },id=>employeeName(id));
 }
 function renderSales(){
  const box=$("commissionSales");box.replaceChildren();
  const rows=selectedSales(),stats=saleSummary(rows);
  $("commissionCount").textContent=rows.length+" matching / "+sales.length+" company sales";
  const metrics=$("commissionSalesSummary");metrics.replaceChildren();
  for(const [title,value] of [
   ["Sales value",money(stats.soldCents)],
   ["Pending payout",money(stats.pendingCents)],
   ["Approved payout",money(stats.approvedCents)]
  ]){
   const n=node("div","commission-summary-tile");
   n.append(node("small","",title),node("strong","",value));metrics.append(n);
  }
  if(!rows.length)box.append(node("p","muted","No sales match these filters. Clear the filters or import a CSV."));
  const approvable=row=>row.status==="pending"&&(S().platformOwner||row.createdBy!==S().user?.uid);
  const permitted=admin()&&enabled;
  $("commissionApprovalToolbar").classList.toggle("hidden",!permitted);
  const allowed=rows.filter(approvable);
  const onScreen=allowed.slice(0,visible);
  const selected=allowed.filter(x=>selectedSalesIds.has(x.id));
  $("commissionApproveSelected").disabled=approvalBusy||!selected.length;
  $("commissionApproveSelected").textContent="Approve selected ("+selected.length+")";
  $("commissionApproveFiltered").disabled=approvalBusy||!allowed.length;
  $("commissionSelectVisible").disabled=approvalBusy||!onScreen.length;
  $("commissionSelectVisible").checked=Boolean(onScreen.length&&onScreen.every(x=>selectedSalesIds.has(x.id)));
  $("commissionSelectionStatus").textContent=allowed.length+" eligible pending sales match these filters"+
   (selected.length?" · "+selected.length+" selected":"")+
   (rows.length-allowed.length?" · Other sales cannot be approved by this account":"");
  for(const sale of rows.slice(0,visible)){
   const detail=sale.saleDate+" · Sold "+money(sale.saleAmountCents)+" · Commission "+money(sale.commissionCents)+
    " · "+sale.description+(sale.paidRunId?" · In payroll":"");
   const actions=[];
   if(admin()&&sale.status==="pending"&&(S().platformOwner||sale.createdBy!==S().user.uid))
    actions.push(button("Approve",()=>review(sale,"approved"),"primary"),button("Reject",()=>review(sale,"rejected")));
   if(S().platformOwner&&ownerDelete)actions.push(button("Delete",async()=>{
    await ownerDelete("commissionSales",sale);await refresh();
   },"danger"));
   const card=row(employeeName(sale.employeeId),detail,sale.status,actions);
   if(permitted&&approvable(sale)){
    const check=node("input","commission-sale-checkbox");
    check.type="checkbox";check.checked=selectedSalesIds.has(sale.id);
    check.setAttribute("aria-label","Select "+employeeName(sale.employeeId)+" sale on "+sale.saleDate);
    check.onchange=()=>{
     if(check.checked)selectedSalesIds.add(sale.id);else selectedSalesIds.delete(sale.id);
     renderSales();
    };
    card.prepend(check);
   }
   box.append(card);
  }
  const more=$("commissionMore");more.classList.toggle("hidden",rows.length<=visible);
  more.textContent="Show "+Math.min(VISIBLE_SIZE,rows.length-visible)+" more sales";
 }
 async function refresh(){
  const id=S().tenantId,actor=S().user?.uid;
  if(!id||!staff()){++sequence;tenantId="";root.classList.add("hidden");return;}
  const changed=tenantId!==id;
  tenantId=id;root.classList.remove("hidden");
  if(changed){view="plans";plans.clear();sales=[];employees=[];visible=VISIBLE_SIZE;importRows=null;importCompany="";selectedSalesIds.clear();}
  const version=++sequence;
  const status=$("commissionCount");
  loadBusy=true;status.textContent="Loading company commission records…";
  try{
   const [settings,people,assigned]=await Promise.all([
    getDoc(configuration()),
    readAll("employees",id,actor,version),
    readAll("commissionPlans",id,actor,version)
   ]);
   guard(id,actor,version);
   enabled=settings.exists()&&settings.data().enabled===true;
   employees=people.sort((a,b)=>String(a.displayName||"").localeCompare(String(b.displayName||"")));
   plans=new Map(assigned.map(p=>[p.id,p]));
   stateUI();refreshEmployeeFilters();renderPlans();
   if(enabled){
    sales=await readAll("commissionSales",id,actor,version,({count})=>{
     if(version===sequence)status.textContent="Loading sales… "+count+" records";
    });
    guard(id,actor,version);
    sales.sort((a,b)=>String(b.saleDate).localeCompare(String(a.saleDate)));
   }else sales=[];
   loadBusy=false;selectedSalesIds.clear();renderMetrics();renderSales();
  }catch(error){
   loadBusy=false;
   if(id===tenantId&&version===sequence){
    status.textContent="Failed to load all company sales. Refresh to retry.";
    warn(error,"Commissions could not load");
   }
  }
 }
 $("commissionToggle").onclick=async()=>{
  try{
   if(!admin())throw Error("Client administrator access required.");
   const next=!enabled,company=tenantId,actor=S().user?.uid;
   if(!await confirmAction("Company commissions",next?
    "Enable commission plans and fictional sales for this company?":
    "Disable commission processing for this company? Previously generated payroll amounts remain intact."))return;
   guard(company,actor);
   await setDoc(configuration(),{enabled:next,updatedBy:actor,updatedAt:serverTimestamp()});
   notify(next?"Company commissions enabled.":"Company commissions disabled.");await refresh();
  }catch(error){warn(error,"Commission configuration")}
 };

 function previewPlan(){
  try{
   const fixed=$("commissionType").value==="fixed";
   const plan={type:fixed?"fixed":"percent",active:true,
    rateBasisPoints:fixed?0:percentBasisPoints($("commissionRate").value),
    fixedCents:fixed?toCents($("commissionFixed").value):0};
   const commission=commissionAmount(100000,plan);
   $("commissionPlanPreview").textContent="Example: On a $1,000 fictional sale, this plan would earn "+money(commission)+".";
  }catch(error){$("commissionPlanPreview").textContent="Enter a valid rate or fixed payout to preview this plan."}
 }
 function renderBulkSelection(){
  const list=$("commissionBulkEmployees");list.replaceChildren();
  const term=$("commissionBulkSearch").value.trim().toLowerCase();
  for(const person of employees.filter(e=>e.status==="active"&&e.displayName.toLowerCase().includes(term))){
   const label=node("label","commission-employee-option"),check=node("input");
   check.type="checkbox";check.value=person.id;check.checked=planEmployeeIds.has(person.id);
   check.onchange=()=>{
    if(check.checked)planEmployeeIds.add(person.id);else planEmployeeIds.delete(person.id);
    $("commissionBulkCount").textContent=planEmployeeIds.size+" employees selected";
   };
   label.append(check,node("span","",person.displayName+(plans.has(person.id)?" · existing plan":" · new plan")));
   list.append(label);
  }
  if(!list.children.length)list.append(node("p","fine-print","No active employees match this search."));
  $("commissionBulkCount").textContent=planEmployeeIds.size+" employees selected";
 }
 function togglePlanMode(){
  const bulk=$("commissionBulkPlan").checked&&!editingPlan;
  $("commissionOneEmployee").classList.toggle("hidden",bulk);
  $("commissionEmployee").required=!bulk;
  $("commissionBulkPanel").classList.toggle("hidden",!bulk);
  $("commissionPlanSave").textContent=bulk?"Save plans for selected employees":"Save commission plan";
  if(bulk)renderBulkSelection();
 }
 function openPlan(id=""){
  editingPlan=id;planEmployeeIds.clear();
  $("commissionPlanForm").reset();
  $("commissionPlanTitle").textContent=id?"Edit commission plan":"Assign commission plan";
  $("commissionBulkToggleWrap").classList.toggle("hidden",Boolean(id));
  const available=employees.filter(e=>e.status==="active"||e.id===id);
  $("commissionEmployee").replaceChildren(option("","Choose an employee"),...available.map(e=>option(e.id,e.displayName)));
  $("commissionEmployee").disabled=Boolean(id);$("commissionEmployee").value=id||"";
  $("commissionBulkPlan").checked=false;$("commissionBulkSearch").value="";
  const plan=plans.get(id);
  if(plan){
   $("commissionType").value=plan.type;
   $("commissionRate").value=plan.rateBasisPoints/100;
   $("commissionFixed").value=(plan.fixedCents/100).toFixed(2);
   $("commissionActive").checked=plan.active;
  }else{$("commissionRate").value="10";$("commissionFixed").value="25";$("commissionActive").checked=true;}
  $("commissionType").dispatchEvent(new Event("change"));
  togglePlanMode();previewPlan();
  $("commissionPlanDialog").showModal();
 }
 $("commissionPlanNew").onclick=()=>openPlan();
 $("commissionBulkPlan").onchange=togglePlanMode;
 $("commissionBulkSearch").oninput=renderBulkSelection;
 $("commissionBulkSelectUnassigned").onclick=()=>{
  for(const e of employees)if(e.status==="active"&&!plans.has(e.id))planEmployeeIds.add(e.id);
  renderBulkSelection();
 };
 $("commissionBulkClear").onclick=()=>{planEmployeeIds.clear();renderBulkSelection()};
 $("commissionType").onchange=()=>{
  const fixed=$("commissionType").value==="fixed";
  $("commissionFixedWrap").classList.toggle("hidden",!fixed);
  $("commissionRateWrap").classList.toggle("hidden",fixed);
  $("commissionRate").required=!fixed;$("commissionFixed").required=fixed;
  previewPlan();
 };
 for(const buttonEl of root.querySelectorAll("[data-commission-preset]")){
  buttonEl.onclick=()=>{
   $("commissionType").value="percent";
   $("commissionRate").value=buttonEl.dataset.commissionPreset;
   $("commissionType").dispatchEvent(new Event("change"));
  };
 }
 $("commissionRate").oninput=previewPlan;$("commissionFixed").oninput=previewPlan;
 $("commissionPlanForm").onsubmit=async event=>{
  event.preventDefault();
  const save=$("commissionPlanSave");save.disabled=true;
  try{
   if(!admin()||!enabled)throw Error("Commission plan management is restricted.");
   const bulk=$("commissionBulkPlan").checked&&!editingPlan;
   const ids=bulk?[...planEmployeeIds]:[$("commissionEmployee").value];
   if(!ids.length)throw Error("Select at least one active employee.");
   if(ids.length>150)throw Error("Assign at most 150 employee plans at once.");
   for(const id of ids)if(!employee(id)||(employee(id).status!=="active"&&id!==editingPlan))
    throw Error("Every selected employee must be active.");
   const type=$("commissionType").value;
   const rateBasisPoints=type==="percent"?percentBasisPoints($("commissionRate").value):0;
   const fixedCents=type==="fixed"?toCents($("commissionFixed").value):0;
   const props={type,rateBasisPoints,fixedCents,active:$("commissionActive").checked};
   const company=tenantId,actor=S().user?.uid;
   const changed=ids.filter(id=>{
    const old=plans.get(id);
    return !old||Object.keys(props).some(key=>old[key]!==props[key]);
   });
   if(!changed.length){$("commissionPlanDialog").close();notify("No changes to save.");return;}
   if(bulk&&!await confirmAction("Assign employee commissions",
    "Save this same commission plan for "+changed.length+" employees? Existing plans for those employees will be replaced."))return;
   let completed=0;
   for(let i=0;i<changed.length;i+=BATCH_SIZE){
    guard(company,actor);if(!enabled)throw Error("Commission program is no longer active.");
    const batch=writeBatch(db);
    for(const id of changed.slice(i,i+BATCH_SIZE))batch.set(planRef(id),{
     employeeId:id,...props,updatedBy:actor,updatedAt:serverTimestamp()
    });
    try{await batch.commit();completed+=Math.min(BATCH_SIZE,changed.length-i);}
    catch(error){throw Error(completed+" of "+changed.length+" plans saved before a batch failed: "+(error.code||error.message)+". Retry to finish.");}
   }
   $("commissionPlanDialog").close();
   notify(completed+" employee commission plan"+(completed===1?"":"s")+" saved.");
   await refresh();activateView("plans");
  }catch(error){warn(error,"Commission plan")}finally{save.disabled=false}
 };
 function preview(){
  try{
   const plan=plans.get($("commissionSaleEmployee").value);
   const amount=toCents($("commissionAmount").value),earned=commissionAmount(amount,plan);
   $("commissionPreview").textContent="Fictional sale "+money(amount)+" · Estimated commission "+money(earned)+
    (plan.type==="percent"?" ("+(plan.rateBasisPoints/100)+"%)":" (fixed payout)");
  }catch{$("commissionPreview").textContent="Choose an employee with an active plan and enter the sale amount."}
 }
 $("commissionSaleNew").onclick=()=>{
  $("commissionSaleForm").reset();
  const current=$("commissionEmployeeFilter").value;
  const options=[...plans.entries()].filter(([id,plan])=>plan.active&&employee(id)?.status==="active")
   .map(([id])=>[id,employeeName(id)]).sort((a,b)=>a[1].localeCompare(b[1]));
  $("commissionSaleEmployee").replaceChildren(option("","Choose an employee"),...options.map(x=>option(x[0],x[1])));
  if(options.some(x=>x[0]===current))$("commissionSaleEmployee").value=current;
  $("commissionDate").value=niceDate();preview();$("commissionSaleDialog").showModal();
 };
 $("commissionSaleEmployee").onchange=preview;$("commissionAmount").oninput=preview;
 $("commissionSaleForm").onsubmit=async event=>{
  event.preventDefault();
  const submit=$("commissionSaleForm").querySelector('button[type="submit"]');submit.disabled=true;
  try{
   if(!staff()||!enabled)throw Error("The commission program is disabled or your access is restricted.");
   const company=tenantId,actor=S().user.uid,employeeId=$("commissionSaleEmployee").value,plan=plans.get(employeeId);
   if(!plan?.active||employee(employeeId)?.status!=="active")throw Error("Choose an active employee commission plan.");
   const saleDate=$("commissionDate").value,description=$("commissionDescription").value.trim();
   if(!/^\d{4}-\d\d-\d\d$/.test(saleDate)||description.length<3)throw Error("Provide a valid date and description.");
   const saleAmountCents=toCents($("commissionAmount").value);
   const commissionCents=commissionAmount(saleAmountCents,plan);
   guard(company,actor);
   await addDoc(coll("commissionSales"),{
    employeeId,saleDate,description,saleAmountCents,commissionCents,type:plan.type,
    rateBasisPoints:plan.rateBasisPoints,fixedCents:plan.fixedCents,status:"pending",approvedBy:"",paidRunId:"",
    createdBy:actor,createdAt:serverTimestamp()
   });
   $("commissionSaleDialog").close();notify("Sale recorded for approval.");await refresh();activateView("sales");
  }catch(error){warn(error,"Sale recording")}finally{submit.disabled=false}
 };
 async function review(sale,status){
  if(approvalBusy)throw Error("Bulk approval is already in progress.");
  if(!admin()||!(S().platformOwner||sale.createdBy!==S().user.uid))
   throw Error("Independent approval or Sterling owner override required.");
  if(!await confirmAction("Commission review",
   (status==="approved"?"Approve ":"Reject ")+money(sale.commissionCents)+
   " in fictional commission for "+employeeName(sale.employeeId)+"?"))return;
  const company=tenantId,actor=S().user.uid;guard(company,actor);
  // Firestore rules enforce pending-only, separation of duties, and payroll lock.
  await updateDoc(doc(coll("commissionSales"),sale.id),{status,approvedBy:actor,reviewedAt:serverTimestamp()});
  notify("Sale commission "+status+".");await refresh();activateView("sales");
 }


 // Bulk commission approvals are always scoped to the active company and
 // validated against live Firestore records before changing any status.
 async function approveChunk(rows,company,actor){
  const refs=rows.map(x=>doc(db,"tenants",company,"commissionSales",x.id));
  return runTransaction(db,async transaction=>{
   guard(company,actor);
   const documents=await Promise.all(refs.map(ref=>transaction.get(ref)));
   const updated=[];
   for(let i=0;i<documents.length;i++){
    const snap=documents[i];
    if(!snap.exists())continue;
    const row=snap.data();
    if(row.status!=="pending"||(!S().platformOwner&&row.createdBy===actor))continue;
    transaction.update(refs[i],{status:"approved",approvedBy:actor,reviewedAt:serverTimestamp()});
    updated.push(rows[i].id);
   }
   return updated;
  });
 }
 async function massApprove(rows,label){
  if(approvalBusy||!admin()||!enabled)return;
  const company=tenantId,actor=S().user?.uid;
  const unique=new Map(rows.filter(row=>row.status==="pending"&&
   (S().platformOwner||row.createdBy!==actor)).map(row=>[row.id,row]));
  const eligible=[...unique.values()];
  if(!eligible.length){notify("No eligible pending sales match this selection.",true);return;}
  if(!await confirmAction("Approve commissions",
   "Approve "+eligible.length+" pending sales ("+label+") for "+company+"? "+
   "Your own sales require Sterling owner authorization. Only currently pending records will be changed."))return;
  approvalBusy=true;renderSales();let approved=0,skipped=0,failed=0,firstError="";
  try{
   for(let i=0;i<eligible.length;i+=BATCH_SIZE){
    guard(company,actor);
    const group=eligible.slice(i,i+BATCH_SIZE);
    try{
     const ids=await approveChunk(group,company,actor);
     approved+=ids.length;skipped+=group.length-ids.length;
    }catch(error){
     // A conflicting record cannot block all remaining valid sales.
     for(const item of group){
      guard(company,actor);
      try{
       const ids=await approveChunk([item],company,actor);
       approved+=ids.length;skipped+=1-ids.length;
      }catch(single){
       failed++;if(!firstError)firstError=single.code||single.message||String(single);
      }
     }
    }
    $("commissionSelectionStatus").textContent="Reviewing "+Math.min(i+BATCH_SIZE,eligible.length)+
     " / "+eligible.length+" · "+approved+" approved · "+skipped+" skipped"+(failed?" · "+failed+" failed":"");
   }
   notify(approved+" commission sales approved"+
    (skipped?" · "+skipped+" skipped":"")+(failed?" · "+failed+" failed":"")+".",Boolean(failed));
   if(firstError)notify("First approval error: "+firstError,true);
  }catch(error){
   warn(error,approved+" sales approved before approval stopped");
  }finally{
   approvalBusy=false;selectedSalesIds.clear();
   try{if(company===tenantId)await refresh()}catch(error){warn(error,"Refreshing commission approvals")}
   activateView("sales");
  }
 }
 $("commissionSelectVisible").onchange=()=>{
  const viewRows=selectedSales().slice(0,visible).filter(row=>
   row.status==="pending"&&(S().platformOwner||row.createdBy!==S().user?.uid));
  if($("commissionSelectVisible").checked)for(const row of viewRows)selectedSalesIds.add(row.id);
  else for(const row of viewRows)selectedSalesIds.delete(row.id);
  renderSales();
 };
 $("commissionApproveSelected").onclick=()=>void massApprove(
  sales.filter(row=>selectedSalesIds.has(row.id)),"selected");
 $("commissionApproveFiltered").onclick=()=>void massApprove(
  selectedSales(),"matching current sales filters");

 function clearSalesFilters(){
  $("commissionEmployeeFilter").value="";$("commissionFilter").value="all";
  $("commissionSearch").value="";$("commissionSort").value="date-desc";
  $("commissionDateFrom").value="";$("commissionDateTo").value="";
  visible=VISIBLE_SIZE;renderSales();
 }
 $("commissionPlanSearch").oninput=renderPlans;
 $("commissionPlanFilter").onchange=renderPlans;
 for(const id of ["commissionEmployeeFilter","commissionFilter","commissionSort","commissionDateFrom","commissionDateTo"]){
  $(id).onchange=()=>{visible=VISIBLE_SIZE;renderSales()};
 }
 $("commissionSearch").oninput=()=>{visible=VISIBLE_SIZE;renderSales()};
 $("commissionClearFilters").onclick=clearSalesFilters;
 $("commissionMore").onclick=()=>{visible+=VISIBLE_SIZE;renderSales()};
 $("commissionSalesReload").onclick=()=>void refresh();
 
 function clearPreview(){
  importRows=null;importCompany="";
  $("commissionImportSubmit").disabled=true;
  $("commissionImportPreview").replaceChildren();
  $("commissionImportStatus").textContent="Choose a CSV file to preview records.";
 }
 $("commissionSaleImport").onclick=()=>{
  $("commissionImportFile").value="";
  clearPreview();$("commissionImportDialog").showModal();
 };
 $("commissionDownloadTemplate").onclick=()=>{
  const exampleName=employees.find(e=>e.status==="active")?.displayName||"Employee Name";
  const csv='employeeName,saleDate,saleAmount,description,reference\r\n'+
   '"'+exampleName.replace(/"/g,'""')+'",'+niceDate()+',"250.00","Sample fictional sale","SALE-001"\r\n';
  const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
  const link=document.createElement("a"),url=URL.createObjectURL(blob);
  link.href=url;link.download="Sterling-Commission-Sales-Template.csv";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 };
 $("commissionImportFile").onchange=async()=>{
  clearPreview();
  const file=$("commissionImportFile").files?.[0];
  if(!file)return;
  if(file.size>512_000){$("commissionImportStatus").textContent="File is too large. Upload a CSV under 512 KB.";return;}
  try{
   const content=await file.text();
   const rows=parseSalesCsv(content,{maxRows:500});
   const result=prepareSalesImport(rows,employees,plans);
   if(!enabled||!staff())throw Error("You cannot import to this company.");
   importRows=result;importCompany=tenantId;
   const preview=$("commissionImportPreview");preview.replaceChildren();
   const table=node("table","commission-preview-table");
   const head=node("thead"),tr=node("tr");
   for(const label of ["Row","Employee","Date","Sale","Commission","Result"])tr.append(node("th","",label));
   head.append(tr);table.append(head);
   const body=node("tbody");
   for(const item of result.valid.slice(0,60)){
    const line=node("tr");
    for(const content of [item.line,item.employeeName,item.saleDate,money(item.saleAmountCents),money(item.commissionCents),"Ready — pending approval"])
     line.append(node("td","",content));
    body.append(line);
   }
   for(const item of result.errors.slice(0,35)){
    const line=node("tr","commission-preview-error");
    for(const content of [item.line,item.name,"—","—","—",item.message])line.append(node("td","",content));
    body.append(line);
   }
   table.append(body);preview.append(table);
   if(result.valid.length>60||result.errors.length>35)
    preview.append(node("p","fine-print","Showing the first 60 ready records and 35 errors. The full file will be validated before import."));
   $("commissionImportStatus").textContent=result.valid.length+" valid sales · "+
    result.errors.length+" rejected rows. Valid sales will be saved pending approval; existing imported sales are skipped.";
   $("commissionImportSubmit").disabled=!result.valid.length;
  }catch(error){
   $("commissionImportStatus").textContent=error.message||String(error);
  }
 };
 $("commissionImportSubmit").onclick=async()=>{
  if(importBusy||!importRows?.valid.length||importCompany!==tenantId)return;
  if(!staff()||!enabled){warn(Error("Commission access changed."),"Import");return}
  const company=tenantId,actor=S().user?.uid,ready=importRows.valid,submit=$("commissionImportSubmit");
  if(!await confirmAction("Import commission sales",
   "Import "+ready.length+" validated fictional sales for "+company+" as PENDING? "+
   "Previously imported sales with matching record keys will be skipped. "+
   "Invalid rows will not be imported."))return;
  importBusy=true;submit.disabled=true;$("commissionImportFile").disabled=true;
  let created=0,skipped=0;
  try{
   const used=new Set(),candidates=[];
   for(let i=0;i<ready.length;i+=12){
    guard(company,actor);
    const group=ready.slice(i,i+12),snapshots=await Promise.all(group.map(x=>getDoc(doc(coll("commissionSales"),x.id))));
    guard(company,actor);
    for(let j=0;j<group.length;j++){
     const row=group[j],snapshot=snapshots[j];
     if(used.has(row.id)||snapshot.exists()){skipped++;continue;}
     used.add(row.id);candidates.push(row);
    }
    $("commissionImportStatus").textContent="Checking duplicates… "+Math.min(i+12,ready.length)+"/"+ready.length;
   }
   for(let i=0;i<candidates.length;i+=BATCH_SIZE){
    guard(company,actor);
    const group=candidates.slice(i,i+BATCH_SIZE);
    const batch=writeBatch(db);
    for(const sale of group){
     batch.set(doc(coll("commissionSales"),sale.id),{
      employeeId:sale.employeeId,saleDate:sale.saleDate,description:sale.description,
      saleAmountCents:sale.saleAmountCents,commissionCents:sale.commissionCents,
      type:sale.type,rateBasisPoints:sale.rateBasisPoints,fixedCents:sale.fixedCents,
      status:"pending",approvedBy:"",paidRunId:"",createdBy:actor,createdAt:serverTimestamp()
     });
    }
    try{await batch.commit();created+=group.length;}
    catch(error){
     throw Error("Batch "+(Math.floor(i/BATCH_SIZE)+1)+" failed: "+
      (error?.code||error?.message||error)+". "+created+" earlier records were saved. Re-upload the same CSV to retry safely.");
    }
    $("commissionImportStatus").textContent="Saving pending sales… "+created+" of "+candidates.length+
     (skipped?" · "+skipped+" duplicates skipped":"");
   }
   $("commissionImportStatus").textContent=created+" sales imported as pending · "+skipped+" duplicates skipped · "+
    importRows.errors.length+" invalid rows excluded.";
   notify(created+" new sales imported pending approval"+(skipped?"; "+skipped+" duplicates skipped":"")+".");
   clearPreview();$("commissionImportFile").value="";
   $("commissionImportDialog").close();
   await refresh();activateView("sales");
  }catch(error){
   warn(error,"Sales import");
   $("commissionImportStatus").textContent=created+" sales saved; "+skipped+" duplicates skipped. "+
    (error.message||String(error));
  }finally{importBusy=false;submit.disabled=!importRows?.valid.length;$("commissionImportFile").disabled=false}
 };
 for(const b of root.querySelectorAll("[data-close]"))b.onclick=()=>{
  if(importBusy&&b.dataset.close==="commissionImportDialog")return;
  $(b.dataset.close).close();
 };
 // Prevent a user from dismissing a running import and unintentionally starting another.
 $("commissionImportDialog").addEventListener("cancel",event=>{if(importBusy)event.preventDefault()});
 return {refresh,clear(){
  ++sequence;tenantId="";enabled=false;plans.clear();sales=[];employees=[];importRows=null;importCompany="";
  selectedSalesIds.clear();approvalBusy=false;
  root.classList.add("hidden");
 }};
}
