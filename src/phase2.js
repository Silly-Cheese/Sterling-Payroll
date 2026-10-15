import {collection,doc,updateDoc,getDocs,query,limit,writeBatch,serverTimestamp,setDoc} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {toCents,money} from "./payroll-core.js";
import {compactForm,buildPortalTabs} from "./workspace-ui.js";
import {CLIENT_PLANS,EMPLOYEE_STATUSES,PAY_FREQUENCIES,ACCESS_ROLES,importEmployees,findPossibleDuplicates} from "./phase2-core.js";
const $=id=>document.getElementById(id);
const el=(tag,text,cls="")=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
const option=(v,t)=>{const o=document.createElement("option");o.value=v;o.textContent=t;return o};
const button=(label,action)=>{
 const b=el("button",label,"btn small");b.type="button";
 b.onclick=async()=>{b.disabled=true;try{await action()}catch(e){console.error(e)}finally{b.disabled=false}};return b;
};
export async function mountPhase2({db,getState,refreshCompany,loadTenantDirectory,notify,confirmAction}){
 const response=await fetch("./phase2.html");if(!response.ok)throw Error("Phase 2 template missing");
 $("phase2Operations").innerHTML=await response.text();
 $("phase2ClientTools").append($("p2ClientTemplate").content.cloneNode(true));
 $("phase2AccessTools").append($("p2AccessTemplate").content.cloneNode(true));
 const S=()=>getState();
 const audit=(batch,tenantId,action,subject,detail)=>{
  batch.set(doc(collection(db,"tenants",tenantId,"auditEvents")),{
   category:"personnel",action,subject:String(subject).slice(0,160),detail:String(detail).slice(0,300),actor:S().user.uid,at:serverTimestamp()
  });
 };
 const canWrite=()=>S().platformWrite||S().platformRole==="payroll_operator"||["client_admin","payroll_specialist"].includes(S().role);
 const canAdmin=()=>S().platformWrite||S().role==="client_admin";
 const employees=()=>S().employees,active=()=>employees().find(e=>e.id===$("p2Person").value);
 let preview=[],possible=[],checked=new Set();
 const notifyError=(prefix,e)=>notify(prefix+": "+(e.code||e.message||e),true);
 const ensure=()=>{if(!S().tenantId||!canWrite())throw Error("No employee editing permission")};
 const controls=()=>{if(!S().tenantId||!canAdmin())throw Error("Administrator permission required")};
 function fillEmployee(){
  const e=active();if(!e)return;
  for(const [id,value] of [["p2Name",e.displayName],["p2Title",e.jobTitle],["p2Department",e.department],
    ["p2PayType",e.payType],["p2Frequency",e.payFrequency],["p2Status",e.status],
    ["p2Hourly",(Number(e.hourlyRateCents||0)/100).toFixed(2)],
    ["p2Salary",(Number(e.annualSalaryCents||0)/100).toFixed(2)]]){
   $(id).value=value||"";
  }
 }
 $("p2Person").addEventListener("change",fillEmployee);
 $("p2EditForm").addEventListener("submit",async event=>{
  event.preventDefault();
  try{
   ensure();const e=active();if(!e)throw Error("Choose an employee");
   const payType=$("p2PayType").value,changes={
    displayName:$("p2Name").value.trim(),jobTitle:$("p2Title").value.trim(),
    department:$("p2Department").value.trim(),payType,
    payFrequency:$("p2Frequency").value,status:$("p2Status").value,
    hourlyRateCents:payType==="hourly"?toCents($("p2Hourly").value):0,
    annualSalaryCents:payType==="salary"?toCents($("p2Salary").value):0,updatedAt:serverTimestamp()};
   if(changes.displayName.length<2||changes.displayName.length>120||!EMPLOYEE_STATUSES.includes(changes.status)||
     !PAY_FREQUENCIES.includes(changes.payFrequency))throw Error("Invalid employee details");
   if(!await confirmAction("Employee changes","Save updates for "+e.displayName+"?"))return;
   const batch=writeBatch(db);
   batch.update(doc(db,"tenants",S().tenantId,"employees",e.id),changes);
   audit(batch,S().tenantId,"employee-update",e.id,e.displayName);
   await batch.commit();
   await refreshCompany();refresh();notify("Employee changes saved.");
  }catch(e){notifyError("Employee changes failed",e)}
 });
 const makeCard=(title,description,extra)=>{
  const row=el("div",undefined,"list-item"),body=el("div");
  body.append(el("strong",title),el("small",description));
  row.append(body);if(extra)row.append(extra);return row;
 };
 function drawStaff(){
  const target=$("p2EmployeeList");target.replaceChildren();
  const search=$("p2Search").value.toLowerCase().trim();
  const shown=employees().filter(e=>[e.displayName,e.jobTitle,e.department].join(" ").toLowerCase().includes(search));
  const visibleIds=new Set(shown.map(e=>e.id));
  for(const id of [...checked])if(!employees().some(e=>e.id===id))checked.delete(id);
  for(const e of shown){
   const check=el("input");check.type="checkbox";check.checked=checked.has(e.id);
   check.addEventListener("change",()=>{if(check.checked)checked.add(e.id);else checked.delete(e.id);$("p2SelectedCount").textContent=checked.size+" selected"});
   const text=el("span");text.append(el("strong",e.displayName),
      el("small",(e.jobTitle||"Employee")+" • "+e.status+" • "+(e.payType==="hourly"?money(e.hourlyRateCents)+"/hr":money(e.annualSalaryCents)+"/yr")));
   const label=el("label",undefined,"employee-check");label.append(check,text);target.append(label);
  }
  if(!shown.length)target.append(el("p","No matching employees.","muted"));
  $("p2SelectedCount").textContent=checked.size+" selected";
  $("p2SelectAll").checked=shown.length>0&&[...visibleIds].every(id=>checked.has(id));
 }
 $("p2Search").addEventListener("input",drawStaff);
 $("p2SelectAll").addEventListener("change",()=>{
  const term=$("p2Search").value.toLowerCase().trim();
  for(const e of employees().filter(e=>[e.displayName,e.jobTitle,e.department].join(" ").toLowerCase().includes(term))){
   if($("p2SelectAll").checked)checked.add(e.id);else checked.delete(e.id);
  }
  drawStaff();
 });
 $("p2BulkApply").addEventListener("click",async()=>{
  try{
   ensure();const ids=[...checked].filter(id=>employees().some(e=>e.id===id));
   if(!ids.length||ids.length>200)throw Error("Select between 1 and 200 employees");
   const status=$("p2BulkStatus").value;if(!EMPLOYEE_STATUSES.includes(status))throw Error("Invalid status");
   if(!await confirmAction("Bulk employment update","Change "+ids.length+" employee records to "+status+"?"))return;
   const batch=writeBatch(db);for(const id of ids)batch.update(doc(db,"tenants",S().tenantId,"employees",id),{status,updatedAt:serverTimestamp()});
   audit(batch,S().tenantId,"employee-bulk-status",status,ids.length+" employees updated");
   await batch.commit();checked.clear();await refreshCompany();refresh();notify("Updated "+ids.length+" employee records.");
  }catch(e){notifyError("Bulk update failed",e)}
 });
 $("p2Preview").addEventListener("click",async()=>{
  try{
   ensure();const file=$("p2Csv").files?.[0];if(!file)throw Error("Choose a CSV file first");
   preview=importEmployees(await file.text());possible=findPossibleDuplicates(preview,employees());
   const list=$("p2PreviewList");list.replaceChildren();
   for(const e of preview.slice(0,15))list.append(makeCard(e.displayName,e.jobTitle+" • "+e.payType));
   if(preview.length>15)list.append(el("p","And "+(preview.length-15)+" more rows.","muted"));
   $("p2ImportStatus").textContent=preview.length+" validated employees. "+(possible.length?"Possible duplicate names/roles on CSV rows "+possible.join(", ")+". Review carefully.":"No identical name/role pairs detected.");
   $("p2Commit").disabled=false;
  }catch(e){preview=[];$("p2Commit").disabled=true;notifyError("Import preview failed",e)}
 });
 $("p2Commit").addEventListener("click",async()=>{
  try{
   ensure();if(!preview.length)throw Error("Preview a file before importing");
   if(!await confirmAction("CSV employee import","Import "+preview.length+" employees? "+(possible.length?"Possible duplicate records detected; no automatic merge will occur.":"")))return;
   const batch=writeBatch(db),tenantId=S().tenantId;
   for(const employee of preview){
    const ref=doc(collection(db,"tenants",tenantId,"employees"));
    batch.set(ref,{...employee,createdBy:S().user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
   }
   audit(batch,tenantId,"employee-csv-import","employees",preview.length+" fictional employee profiles");
   await batch.commit();const count=preview.length;preview=[];possible=[];$("p2Commit").disabled=true;$("p2Csv").value="";
   $("p2PreviewList").replaceChildren();await refreshCompany();refresh();notify(count+" employees imported.");
  }catch(e){notifyError("Employee import failed",e)}
 });
 const selectedTenant=()=>S().tenants.find(t=>t.id===$("p2ClientSelect").value);
 function fillTenant(){
  const t=selectedTenant();if(!t)return;
  for(const [id,value] of [["p2ClientName",t.name],["p2Industry",t.industry],["p2ContactEmail",t.contactEmail],
    ["p2Plan",t.servicePlan||"starter"],["p2ClientStatus",t.status||"active"],["p2ClientNotes",t.notes]]){
   $(id).value=value||"";
  }
 }
 $("p2ClientSelect").addEventListener("change",fillTenant);
 $("p2ClientForm").addEventListener("submit",async event=>{
  event.preventDefault();
  try{
   if(!S().platformWrite)throw Error("Only Sterling administrators can change client contracts");
   const tenant=selectedTenant();if(!tenant)throw Error("Select a client");
   const changes={name:$("p2ClientName").value.trim(),industry:$("p2Industry").value.trim(),
    contactEmail:$("p2ContactEmail").value.trim(),servicePlan:$("p2Plan").value,
    status:$("p2ClientStatus").value,notes:$("p2ClientNotes").value.trim()};
   if(changes.name.length<2||!CLIENT_PLANS.includes(changes.servicePlan))throw Error("Invalid client settings");
   if(!await confirmAction("Client settings","Apply changes to "+tenant.name+"?"))return;
   const batch=writeBatch(db);batch.update(doc(db,"tenants",tenant.id),changes);
   audit(batch,tenant.id,"client-settings",tenant.id,tenant.name+" service profile updated");
   await batch.commit();await loadTenantDirectory();refresh();notify("Client updated.");
  }catch(e){notifyError("Client update failed",e)}
 });
 async function renderMembers(){
  const target=$("p2Members");target.replaceChildren();
  if(!S().tenantId||!canAdmin())return;
  const tenantId=S().tenantId;
  const [snap,links]=await Promise.all([
   getDocs(query(collection(db,"tenants",tenantId,"members"),limit(200))),
   getDocs(query(collection(db,"tenants",tenantId,"employeeLinks"),limit(200)))
  ]);
  if(S().tenantId!==tenantId)return;
  const linked=new Map(links.docs.map(d=>[d.id,d.data().employeeId]));
  for(const d of snap.docs){
   const member=d.data(),edit=document.createElement("div");edit.className="item-actions";
   const roleSelect=document.createElement("select"),statusSelect=document.createElement("select");
   for(const role of ACCESS_ROLES)roleSelect.append(option(role,role.replace(/_/g," ")));
   for(const status of ["active","suspended"])statusSelect.append(option(status,status));
   roleSelect.value=member.role;statusSelect.value=member.status;
   if(d.id!==S().user.uid){
    edit.append(roleSelect,statusSelect,button("Save",async()=>{
     controls();const changes={role:roleSelect.value,status:statusSelect.value};
     if(!await confirmAction("Team access","Update access for "+member.email+"?"))return;
     const batch=writeBatch(db);batch.update(doc(db,"tenants",tenantId,"members",d.id),changes);
     audit(batch,tenantId,"membership-update",d.id,changes.role+" / "+changes.status);
     await batch.commit();notify("Membership updated.");await renderMembers();
    }));
   }
   if(member.role==="employee"&&member.status==="active"){
    const employeeSelect=document.createElement("select");
    employeeSelect.setAttribute("aria-label","Linked employee for "+member.email);
    employeeSelect.append(option("","Choose HR employee"));
    for(const e of S().employees)employeeSelect.append(option(e.id,e.displayName+" — "+(e.jobTitle||"Employee")));
    employeeSelect.value=linked.get(d.id)||"";
    edit.append(employeeSelect,button("Link employee",async()=>{
     controls();const e=S().employees.find(x=>x.id===employeeSelect.value);
     if(!e)throw Error("Choose an employee record first");
     if(!await confirmAction("Link employee identity","Grant "+member.email+" private access to payroll records for "+e.displayName+"? Verify their identity first."))return;
     await setDoc(doc(db,"tenants",tenantId,"employeeLinks",d.id),{
      employeeId:e.id,linkedBy:S().user.uid,linkedAt:serverTimestamp()
     });
     notify("Employee portal access linked.");await renderMembers();
    }));
   }
   target.append(makeCard(member.email||"Team member",d.id===S().user.uid?"Your own membership":member.role,edit));
  }
  if(snap.empty)target.append(el("p","No accepted members yet.","muted"));
  if(snap.size===200||links.size===200)target.append(el("p","Large membership list reached the page limit. Some accounts may not be shown.","muted"));
 }
 function refresh(){
  const s=S(),person=$("p2Person"),previous=person.value;person.replaceChildren(option("","Select employee"));
  for(const e of employees())person.append(option(e.id,e.displayName));
  person.value=employees().some(e=>e.id===previous)?previous:"";
  fillEmployee();drawStaff();
  const tenant=$("p2ClientSelect"),old=tenant.value;tenant.replaceChildren(option("","Select client"));
  for(const t of s.tenants)tenant.append(option(t.id,t.name));
  tenant.value=s.tenants.some(t=>t.id===old)?old:(s.tenantId||"");
  fillTenant();
  const writable=canWrite();
  $("p2EditForm").classList.toggle("hidden",!writable);
  $("p2Csv").disabled=!writable;
  $("p2Preview").disabled=!writable;
  $("p2Commit").disabled=!writable||!preview.length;
  $("p2BulkApply").disabled=!writable;
  $("p2BulkStatus").disabled=!writable;
  $("p2SelectAll").disabled=!writable;
  $("p2ClientForm").classList.toggle("hidden",!s.platformWrite);
  void renderMembers().catch(e=>notifyError("Membership display failed",e));
 }
 const root=$("phase2Operations");
 const editorDialog=compactForm({root,formId:"p2EditForm",label:"Edit employee",summary:"PERSONNEL DIRECTORY"});
 buildPortalTabs(root,[["p2BulkPanel","Bulk changes"],["p2ImportPanel","CSV import"]]);
 function edit(employeeId){
  if(!canWrite())throw Error("Employee editing requires payroll permissions");
  refresh();
  $("p2Person").value=employeeId;fillEmployee();
  editorDialog?.open();
 }
 return {refresh,renderMembers,edit};
}