import {collection,doc,getDoc,getDocs,query,orderBy,documentId,startAfter,limit,setDoc,addDoc,updateDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {toCents,money} from "./payroll-core.js";
import {commissionAmount,percentBasisPoints} from "./commission-core.js";
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e};
const option=(value,text)=>{const e=node("option","",text);e.value=value;return e};
export async function mountCommissions({db,getState,notify,confirmAction,ownerDelete}){
 const root=document.getElementById("commissionsWorkspace");
 const response=await fetch("./commissions.html?v=1");
 if(!root||!response.ok)throw Error("Commission workspace template is missing");
 root.innerHTML=await response.text();
 const $=id=>root.querySelector("#"+id),S=()=>getState();
 let tenantId="",enabled=false,plans=new Map(),sales=[],cursor=null,more=false,sequence=0;
 const admin=()=>Boolean(S().platformWrite||S().role==="client_admin");
 const staff=()=>Boolean(admin()||S().platformRole==="payroll_operator"||S().role==="payroll_specialist");
 const coll=name=>collection(db,"tenants",tenantId,name);
 const configuration=()=>doc(db,"tenants",tenantId,"commissionSettings","current");
 const planRef=id=>doc(db,"tenants",tenantId,"commissionPlans",id);
 const employee=id=>S().employees.find(e=>e.id===id);
 const employeeName=id=>employee(id)?.displayName||"Employee "+id.slice(0,7);
 function warn(error,context){console.error(context,error);notify(context+": "+(error.message||error.code||error),true)}
 function button(text,fn,style=""){
  const b=node("button","btn small "+style,text);b.type="button";
  b.onclick=async()=>{b.disabled=true;try{await fn()}catch(error){warn(error,text+" failed")}finally{b.disabled=false}};
  return b;
 }
 function row(title,detail,status,actions=[]){
  const box=node("article","commission-row"),left=node("div","commission-row-copy"),right=node("div","commission-row-actions");
  left.append(node("strong","",title),node("small","",detail));
  if(status)right.append(node("span","status-chip "+(status==="approved"?"success":status==="rejected"?"danger":""),status));
  right.append(...actions);box.append(left,right);return box;
 }
 function stateUI(){
  $("commissionStatus").replaceChildren(node("span","status-chip "+(enabled?"success":""),enabled?"ACTIVE":"NOT ENABLED"));
  $("commissionContent").classList.toggle("hidden",!enabled);
  $("commissionSettings").classList.toggle("hidden",!admin());
  $("commissionToggle").textContent=enabled?"Disable commissions":"Enable commissions";
  $("commissionPlanNew").hidden=!admin();
  $("commissionSaleNew").hidden=!staff();
 }
 function renderPlans(){
  const box=$("commissionPlans");box.replaceChildren();
  if(!plans.size){box.append(node("p","muted","No commission plans. Assign a percentage or fixed amount to an employee."));return}
  for(const [id,plan] of plans){
   const description=plan.type==="percent"?(plan.rateBasisPoints/100)+"% per sale":money(plan.fixedCents)+" per sale";
   const actions=admin()?[button("Edit",()=>openPlan(id))]:[];
   box.append(row(employeeName(id),description,plan.active?"active":"inactive",actions));
  }
 }
 function renderSales(){
  const box=$("commissionSales");box.replaceChildren();
  const status=$("commissionFilter").value,q=$("commissionSearch").value.trim().toLowerCase();
  const filtered=sales.filter(s=>(status==="all"||s.status===status)&&
   [employeeName(s.employeeId),s.description,s.saleDate].join(" ").toLowerCase().includes(q));
  $("commissionCount").textContent=filtered.length+" shown / "+sales.length+" loaded"+(more?"+":"");
  $("commissionMore").classList.toggle("hidden",!more);
  if(!filtered.length){box.append(node("p","muted","No matching sales. Record one or adjust the filter."));return}
  for(const sale of filtered){
   const detail=sale.saleDate+" · Sale "+money(sale.saleAmountCents)+" · Earned "+money(sale.commissionCents)+
    " · "+sale.description+(sale.paidRunId?" · Linked to payroll":"");
   const actions=[];
   if(admin()&&sale.status==="pending")
    actions.push(button("Approve",()=>review(sale,"approved"),"primary"),button("Reject",()=>review(sale,"rejected")));
   if(S().platformOwner&&ownerDelete)actions.push(button("Delete",async()=>{await ownerDelete("commissionSales",sale);await refresh()},"danger"));
   box.append(row(employeeName(sale.employeeId),detail,sale.status,actions));
  }
 }
 async function readSales(reset=true){
  const company=tenantId,version=++sequence,args=[orderBy(documentId())];
  if(!reset&&cursor)args.push(startAfter(cursor));
  args.push(limit(100));
  const result=await getDocs(query(coll("commissionSales"),...args));
  if(company!==tenantId||version!==sequence)return;
  if(reset)sales=[];
  const ids=new Set(sales.map(s=>s.id));
  for(const d of result.docs)if(!ids.has(d.id)){sales.push({id:d.id,...d.data()});ids.add(d.id)}
  sales.sort((a,b)=>String(b.saleDate).localeCompare(String(a.saleDate)));
  cursor=result.docs.at(-1)||null;more=result.size===100;renderSales();
 }
 async function refresh(){
  const id=S().tenantId;
  if(!id||!staff()){++sequence;tenantId="";root.classList.add("hidden");return}
  root.classList.remove("hidden");tenantId=id;
  const version=++sequence;
  const [settings,records]=await Promise.all([getDoc(configuration()),getDocs(query(coll("commissionPlans"),orderBy(documentId()),limit(251)))]);
  if(tenantId!==id||version!==sequence)return;
  if(records.size>250)throw Error("More than 250 plans. Additional paging will be required.");
  enabled=settings.exists()&&settings.data().enabled===true;
  plans=new Map(records.docs.map(d=>[d.id,d.data()]));
  stateUI();renderPlans();
  if(enabled)await readSales(true);else{sales=[];$("commissionSales").replaceChildren()}
 }
 $("commissionToggle").onclick=async()=>{
  try{
   if(!admin())throw Error("Client administrator access required.");
   const next=!enabled;
   if(!await confirmAction("Company commissions",next?
    "Enable commission plans and fictional sales for this company?":
    "Disable commission processing for this company? Previously generated payroll amounts remain intact."))return;
   await setDoc(configuration(),{enabled:next,updatedBy:S().user.uid,updatedAt:serverTimestamp()});
   notify(next?"Company commissions enabled.":"Company commissions disabled.");await refresh();
  }catch(error){warn(error,"Commission configuration")}
 };
 function openPlan(id=""){
  $("commissionPlanForm").reset();
  $("commissionEmployee").replaceChildren(option("","Choose an employee"),
   ...S().employees.filter(e=>e.status==="active").map(e=>option(e.id,e.displayName)));
  const plan=plans.get(id);
  $("commissionEmployee").value=id;
  if(plan){
   $("commissionType").value=plan.type;
   $("commissionRate").value=plan.rateBasisPoints/100;
   $("commissionFixed").value=(plan.fixedCents/100).toFixed(2);
   $("commissionActive").checked=plan.active;
  }
  $("commissionEmployee").disabled=!!id;
  $("commissionType").dispatchEvent(new Event("change"));
  $("commissionPlanDialog").showModal();
 }
 $("commissionPlanNew").onclick=()=>openPlan();
 $("commissionType").onchange=()=>{
  const fixed=$("commissionType").value==="fixed";
  $("commissionFixedWrap").classList.toggle("hidden",!fixed);
  $("commissionRateWrap").classList.toggle("hidden",fixed);
  $("commissionRate").required=!fixed;$("commissionFixed").required=fixed;
 };
 $("commissionPlanForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!admin()||!enabled)throw Error("Company administrator access required.");
   const employeeId=$("commissionEmployee").value,person=employee(employeeId);
   if(!person||person.status!=="active")throw Error("Choose an active employee.");
   const type=$("commissionType").value,rateBasisPoints=type==="percent"?percentBasisPoints($("commissionRate").value):0;
   const fixedCents=type==="fixed"?toCents($("commissionFixed").value):0;
   await setDoc(planRef(employeeId),{employeeId,type,rateBasisPoints,fixedCents,active:$("commissionActive").checked,
    updatedBy:S().user.uid,updatedAt:serverTimestamp()});
   $("commissionPlanDialog").close();notify("Commission plan saved.");await refresh();
  }catch(error){warn(error,"Commission plan")}
 };
 function preview(){
  try{
   const p=plans.get($("commissionSaleEmployee").value);
   const amount=toCents($("commissionAmount").value),earned=commissionAmount(amount,p);
   $("commissionPreview").textContent="Fictional sale "+money(amount)+" · Commission "+money(earned)+
    (p.type==="percent"?" ("+(p.rateBasisPoints/100)+"%)":" (fixed per sale)");
  }catch{$("commissionPreview").textContent="Choose an employee plan and enter the amount they sold."}
 }
 $("commissionSaleNew").onclick=()=>{
  $("commissionSaleForm").reset();
  $("commissionSaleEmployee").replaceChildren(option("","Choose an employee"),
   ...[...plans.entries()].filter(([id,p])=>p.active&&employee(id)?.status==="active").map(([id])=>option(id,employeeName(id))));
  const date=new Date();
  $("commissionDate").value=date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
  preview();$("commissionSaleDialog").showModal();
 };
 $("commissionSaleEmployee").onchange=preview;$("commissionAmount").oninput=preview;
 $("commissionSaleForm").onsubmit=async event=>{
  event.preventDefault();
  try{
   if(!staff()||!enabled)throw Error("The commission program is disabled or your access is restricted.");
   const employeeId=$("commissionSaleEmployee").value,plan=plans.get(employeeId);
   if(!plan?.active||!employee(employeeId))throw Error("Choose an employee with an active commission plan.");
   const saleDate=$("commissionDate").value,description=$("commissionDescription").value.trim();
   if(!/^\d{4}-\d\d-\d\d$/.test(saleDate)||description.length<3)throw Error("Provide a sale date and short description.");
   const saleAmountCents=toCents($("commissionAmount").value),commissionCents=commissionAmount(saleAmountCents,plan);
   await addDoc(coll("commissionSales"),{employeeId,saleDate,description,saleAmountCents,commissionCents,type:plan.type,
    rateBasisPoints:plan.rateBasisPoints,fixedCents:plan.fixedCents,status:"pending",approvedBy:"",paidRunId:"",
    createdBy:S().user.uid,createdAt:serverTimestamp()});
   $("commissionSaleDialog").close();notify("Sale recorded. An administrator must approve the commission.");await readSales(true);
  }catch(error){warn(error,"Sale recording")}
 };
 async function review(sale,status){
  if(!admin())throw Error("Client administrator required to approve sales.");
  if(!await confirmAction("Commission approval",(status==="approved"?"Approve ":"Reject ")+
   money(sale.commissionCents)+" in fictional commission for "+employeeName(sale.employeeId)+"?"))return;
  await updateDoc(doc(coll("commissionSales"),sale.id),{status,approvedBy:S().user.uid,reviewedAt:serverTimestamp()});
  notify("Sale commission "+status+".");await readSales(true);
 }
 $("commissionMore").onclick=()=>readSales(false).catch(e=>warn(e,"Loading sales"));
 $("commissionSearch").oninput=renderSales;$("commissionFilter").onchange=renderSales;
 for(const b of root.querySelectorAll("[data-close]"))b.onclick=()=>$(b.dataset.close).close();
 return {refresh,clear(){++sequence;tenantId="";enabled=false;plans.clear();sales=[];root.classList.add("hidden")}};
}
