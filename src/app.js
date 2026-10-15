import {initializeApp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signOut,reload,getIdToken} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,addDoc,setDoc,updateDoc,query,limit,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {calculateLine,summarizeLines,toCents,money,hoursValue,canTransition,validPeriod,cleanEmail} from "./payroll-core.js";

const app=initializeApp({
 apiKey:"AIzaSyBAAAUc0nDiiD7zfURjohVj1UBA-1yQmV0",
 authDomain:"sterling-payroll-5d200.firebaseapp.com",
 projectId:"sterling-payroll-5d200",
 storageBucket:"sterling-payroll-5d200.firebasestorage.app",
 messagingSenderId:"755423368876",
 appId:"1:755423368876:web:da8513d0923f1d14033109"
});
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const state={user:null,platform:false,tenants:[],tenantId:"",role:"",employees:[],time:[],runs:[],selectedRun:null,lines:[],page:"dashboard",register:false};
const titles={
 dashboard:["Executive overview","Everything you need to manage simulated payroll across client businesses."],
 clients:["Client companies","Manage the businesses using Sterling Payroll."],
 employees:["Employee management","Compensation and employment records for the selected company."],
 time:["Timekeeping","Log simulated working hours with a clear audit history."],
 payroll:["Payroll processing","Prepare, review and approve fictional payments securely."],
 access:["Team access","Invite teammates to your client workspace and review roles."]
};
function toast(text,error=false){
 const node=$("toast");node.textContent=String(text);node.className="toast"+(error?" error":"");
 node.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.hidden=true,6000);
}
function fail(error,prefix="Operation failed"){
 console.error(prefix,error);
 toast(prefix+": "+String(error?.code||error?.message||error),true);
}
const mk=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);return el};
function button(label,fn,cls=""){
 const b=mk("button","btn "+cls,label);b.type="button";b.addEventListener("click",async()=>{b.disabled=true;try{await fn()}catch(e){fail(e)}finally{b.disabled=false}});return b;
}
function item(title,description,actions=[],status="",style=""){
 const node=mk("article","list-item"),body=mk("div"),head=mk("strong","",title),info=mk("small","",description);
 body.append(head,info);node.append(body);
 const controls=mk("div","item-actions");
 if(status)controls.append(mk("span","status-chip "+style,status));
 for(const control of actions)controls.append(control);
 node.append(controls);return node;
}
function empty(container,message){container.replaceChildren(mk("p","muted",message))}
function canPayroll(){return state.platform||["client_admin","payroll_specialist"].includes(state.role)}
function canAdmin(){return state.platform||state.role==="client_admin"}
const tenantDoc=()=>doc(db,"tenants",state.tenantId);
const sub=(name)=>collection(db,"tenants",state.tenantId,name);
function go(page){
 if(!titles[page])page="dashboard";
 if(page==="clients"&&!state.platform)page="dashboard";
 if(["employees","time","payroll","access"].includes(page)&&!state.tenantId)page="dashboard";
 if(page==="access"&&!canAdmin())page="dashboard";
 state.page=page;
 for(const node of document.querySelectorAll(".page"))node.classList.toggle("hidden",node.id!=="page-"+page);
 for(const node of document.querySelectorAll("[data-page]"))node.classList.toggle("active",node.dataset.page===page);
 $("pageName").textContent=titles[page][0];$("pageTitle").textContent=titles[page][0];$("pageDescription").textContent=titles[page][1];
 $("pageEyebrow").textContent=page==="clients"?"STERLING PAYROLL / HEADQUARTERS":"STERLING PAYROLL / "+(state.tenantId?state.tenants.find(t=>t.id===state.tenantId)?.name||"CLIENT WORKSPACE":"COMMAND CENTER").toUpperCase();
 document.querySelector(".sidebar")?.classList.remove("open");
 if(page==="dashboard")renderDashboard();
 if(page==="clients")renderClients();
 if(page==="employees")renderEmployees();
 if(page==="time")renderTime();
 if(page==="payroll")renderRuns();
 if(page==="access")void renderAccess();
 window.scrollTo({top:0});
}
for(const nav of document.querySelectorAll("[data-page]"))nav.addEventListener("click",()=>go(nav.dataset.page));
$("mobileMenu").addEventListener("click",()=>document.querySelector(".sidebar").classList.toggle("open"));
$("signOut").addEventListener("click",()=>signOut(auth).catch(e=>fail(e,"Sign out failed")));

$("authToggle").addEventListener("click",()=>{
 state.register=!state.register;$("authTitle").textContent=state.register?"Create your account":"Sign in to continue";
 $("authSubmit").textContent=state.register?"Create account":"Sign in";
 $("authToggle").textContent=state.register?"Already have an account? Sign in":"Create an account";
 $("authPassword").autocomplete=state.register?"new-password":"current-password";
 $("authNotice").textContent=state.register?"Registration creates an account only. Company access requires an administrator invitation.":"Accounts do not automatically receive access to any client's data.";
});
$("authForm").addEventListener("submit",async event=>{
 event.preventDefault();const email=$("authEmail").value.trim(),pass=$("authPassword").value;
 $("authSubmit").disabled=true;
 try{
  if(state.register){
   const credential=await createUserWithEmailAndPassword(auth,email,pass);
   await sendEmailVerification(credential.user);
   toast("Account created. Check your email verification message before accepting invitations.");
  }else await signInWithEmailAndPassword(auth,email,pass);
  $("authPassword").value="";
 }catch(e){fail(e,"Authentication failed")}finally{$("authSubmit").disabled=false}
});
$("resetPassword").addEventListener("click",async()=>{
 const email=$("authEmail").value.trim();
 if(!email){toast("Enter your email address first.",true);return}
 try{await sendPasswordResetEmail(auth,email);toast("If the email is registered, a password reset message will be sent.")}catch(e){fail(e,"Password reset failed")}
});
async function loadTenantDirectory(){
 state.tenants=[];
 if(state.platform){
  const snap=await getDocs(query(collection(db,"tenants"),limit(250)));
  state.tenants=snap.docs.map(d=>({id:d.id,...d.data()}));
 }else{
  const index=await getDocs(query(collection(db,"userTenants",state.user.uid,"items"),limit(100)));
  for(const entry of index.docs){
   try{
    const membership=await getDoc(doc(db,"tenants",entry.id,"members",state.user.uid));
    if(!membership.exists()||membership.data().status!=="active")continue;
    const tenant=await getDoc(doc(db,"tenants",entry.id));
    if(tenant.exists())state.tenants.push({id:tenant.id,...tenant.data()});
   }catch(e){console.warn("Could not load a company index entry",e.code)}
  }
 }
 state.tenants.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 const selector=$("companySelect");selector.replaceChildren(new Option("Select company",""));
 for(const t of state.tenants)selector.append(new Option(t.name,t.id));
 const fromStorage=localStorage.getItem("sterling-payroll-company-"+state.user.uid);
 const matched=state.tenants.find(t=>t.id===state.tenantId)||state.tenants.find(t=>t.id===fromStorage);
 state.tenantId=matched?.id||"";
 selector.value=state.tenantId;
 await chooseTenant(state.tenantId,false);
}
async function chooseTenant(id,writeStorage=true){
 state.tenantId=id;state.role="";state.selectedRun=null;state.lines=[];
 if(state.user&&writeStorage)localStorage.setItem("sterling-payroll-company-"+state.user.uid,id);
 $("companySelect").value=id;
 if(id){
  if(state.platform)state.role="platform_admin";
  else{
   const membership=await getDoc(doc(db,"tenants",id,"members",state.user.uid));
   if(!membership.exists()||membership.data().status!=="active")throw Error("No authorized membership for this company");
   state.role=membership.data().role;
  }
 }
 $("noClient").classList.toggle("hidden",!!id);
 document.querySelectorAll(".client-only").forEach(node=>node.classList.toggle("hidden",!id));
 document.querySelectorAll(".admin-only").forEach(node=>node.classList.toggle("hidden",!id||!canAdmin()));
 document.querySelectorAll(".platform-only").forEach(node=>node.classList.toggle("hidden",!state.platform));
 const editOnly=document.querySelectorAll("#employeeForm,#timeForm,#runForm");
 editOnly.forEach(form=>form.classList.toggle("hidden",!canPayroll()));
 if(!id){state.employees=[];state.time=[];state.runs=[];state.selectedRun=null;go("dashboard");return}
 await refreshCompany();
 if(state.page==="clients"&&state.platform)go("clients");else go(state.page==="dashboard"?"dashboard":state.page);
}
$("companySelect").addEventListener("change",()=>chooseTenant($("companySelect").value).catch(e=>fail(e,"Company selection failed")));
$("joinForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!state.user)return;
 const id=$("joinCode").value.trim();
 if(!/^[a-zA-Z0-9_-]{10,40}$/.test(id)){toast("Enter the exact workspace code provided with your invitation.",true);return}
 await reload(state.user);
 await getIdToken(state.user,true);
 if(!state.user.emailVerified){toast("Verify your account email before accepting invitations.",true);return}
 try{
  const email=cleanEmail(state.user.email),invite=await getDoc(doc(db,"tenants",id,"invites",email));
  if(!invite.exists())throw Error("No invitation exists for this verified email address and company");
  const membershipRef=doc(db,"tenants",id,"members",state.user.uid);
  const existing=await getDoc(membershipRef);
  const batch=writeBatch(db);
  if(!existing.exists())batch.set(membershipRef,{email,role:invite.data().role,status:"active",joinedAt:serverTimestamp()});
  batch.set(doc(db,"userTenants",state.user.uid,"items",id),{tenantId:id,joinedAt:serverTimestamp()});
  await batch.commit();
  toast("Company invitation accepted.");$("joinCode").value="";
  await loadTenantDirectory();
  await chooseTenant(id);
 }catch(e){fail(e,"Invitation acceptance failed")}
});
async function refreshCompany(){
 if(!state.tenantId)return;
 const id=state.tenantId;
 try{
  const [employees,time,runs]=await Promise.all([
   getDocs(query(sub("employees"),limit(250))),
   getDocs(query(sub("timeEntries"),limit(500))),
   getDocs(query(sub("payrollRuns"),limit(100)))
  ]);
  if(state.tenantId!==id)return;
  state.employees=employees.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.displayName.localeCompare(b.displayName));
  state.time=time.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.workDate.localeCompare(a.workDate));
  state.runs=runs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd));
  if(employees.size===250||time.size===500||runs.size===100)toast("Some records may be beyond the current page limit; pagination is scheduled for a later phase.");
 }catch(e){fail(e,"Company data could not load")}
 renderDashboard();renderEmployees();renderTime();renderRuns();
}
function renderDashboard(){
 const el=$("metrics");el.replaceChildren();
 const metrics=[
  ["Client companies",state.platform?state.tenants.length:state.tenants.length,"Managed client workspaces"],
  ["Employees",state.tenantId?state.employees.length:"—","Current company directory"],
  ["Payroll runs",state.tenantId?state.runs.length:"—","Simulated processing periods"],
  ["Awaiting approval",state.tenantId?state.runs.filter(r=>r.status==="submitted").length:"—","Pending client authorization"]
 ];
 for(const [name,value,subtitle] of metrics){
  const box=mk("article","metric");box.append(mk("div","metric-label",name),mk("strong","",value),mk("small","",subtitle));el.append(box);
 }
}
function renderClients(){
 if(!state.platform)return;
 const el=$("clientList");el.replaceChildren();
 if(!state.tenants.length)return empty(el,"No client companies yet.");
 for(const c of state.tenants){
  el.append(item(c.name,"Client workspace • "+c.id,[button("Manage",async()=>{await chooseTenant(c.id);go("employees")},"small")],c.status,c.status==="active"?"success":"danger"));
 }
}
$("clientForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!state.platform)return;
 const name=$("clientName").value.trim();if(name.length<2)return toast("Enter a company name.",true);
 try{
  const ref=await addDoc(collection(db,"tenants"),{name,status:"active",createdBy:state.user.uid,createdAt:serverTimestamp()});
  $("clientForm").reset();await loadTenantDirectory();await chooseTenant(ref.id);go("access");
  toast("Client created. Invite its administrators from Team Access.");
 }catch(e){fail(e,"Client creation failed")}
});
$("empType").addEventListener("change",()=>{
 const salary=$("empType").value==="salary";
 $("salaryWrap").classList.toggle("hidden",!salary);
 $("hourlyWrap").classList.toggle("hidden",salary);
 $("empHourly").required=!salary;$("empSalary").required=salary;
});
$("employeeForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!canPayroll()||!state.tenantId)return;
 const payType=$("empType").value;
 try{
  await addDoc(sub("employees"),{
   displayName:$("empName").value.trim(),department:$("empDept").value.trim(),jobTitle:$("empJob").value.trim(),
   payType,payFrequency:$("empFrequency").value,
   hourlyRateCents:payType==="hourly"?toCents($("empHourly").value):0,
   annualSalaryCents:payType==="salary"?toCents($("empSalary").value):0,
   status:"active",createdBy:state.user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
  $("employeeForm").reset();$("empType").dispatchEvent(new Event("change"));
  await refreshCompany();toast("Employee saved in this client workspace.");
 }catch(e){fail(e,"Employee creation failed")}
});
$("empSearch").addEventListener("input",renderEmployees);
function renderEmployees(){
 const el=$("employeeList");el.replaceChildren();
 const q=$("empSearch").value.trim().toLowerCase();
 const employees=state.employees.filter(e=>[e.displayName,e.jobTitle,e.department].join(" ").toLowerCase().includes(q));
 $("empCount").textContent=state.employees.length+" EMPLOYEES";
 if(!employees.length)return empty(el,"No employee records match this search.");
 for(const e of employees){
  const description=[e.jobTitle,e.department,e.payType==="hourly"?money(e.hourlyRateCents)+"/hr":money(e.annualSalaryCents)+"/year"].filter(Boolean).join(" • ");
  const actions=canPayroll()?[button(e.status==="active"?"Place on leave":"Reactivate",async()=>{
   const status=e.status==="active"?"leave":"active";
   await updateDoc(doc(db,"tenants",state.tenantId,"employees",e.id),{status,updatedAt:serverTimestamp()});
   await refreshCompany();toast("Employee status updated.");
  },"small")]:[];
  el.append(item(e.displayName,description,actions,e.status,e.status==="active"?"success":""));
 }
 const selector=$("timeEmployee");const old=selector.value;selector.replaceChildren(new Option("Select an employee",""));
 for(const e of state.employees.filter(e=>e.status==="active"))selector.append(new Option(e.displayName,e.id));
 selector.value=old&&state.employees.some(e=>e.id===old&&e.status==="active")?old:"";
}
$("timeForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!canPayroll()||!state.tenantId)return;
 const employeeId=$("timeEmployee").value;
 if(!state.employees.some(e=>e.id===employeeId&&e.status==="active"))return toast("Choose an active employee.",true);
 try{
  await addDoc(sub("timeEntries"),{
   employeeId,workDate:$("timeDate").value,
   regularHours:hoursValue($("timeRegular").value),overtimeHours:hoursValue($("timeOvertime").value),
   note:$("timeNote").value.trim(),createdAt:serverTimestamp(),createdBy:state.user.uid
  });
  $("timeRegular").value="8";$("timeOvertime").value="0";$("timeNote").value="";
  await refreshCompany();toast("Simulated time entry recorded.");
 }catch(e){fail(e,"Time entry failed")}
});
function renderTime(){
 const el=$("timeList");el.replaceChildren();
 if(!state.time.length)return empty(el,"No time entries have been recorded.");
 for(const entry of state.time.slice(0,100)){
  const employee=state.employees.find(e=>e.id===entry.employeeId);
  el.append(item(employee?.displayName||"Former employee",entry.workDate+" • "+entry.regularHours+" regular • "+entry.overtimeHours+" overtime"+(entry.note?" • "+entry.note:"")));
 }
}
$("runForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!canPayroll()||!state.tenantId)return;
 const periodStart=$("periodStart").value,periodEnd=$("periodEnd").value,payDate=$("payDate").value;
 if(!validPeriod(periodStart,periodEnd,payDate))return toast("Pay period dates must be valid, and payday must be after the period.",true);
 try{
  const run=await addDoc(sub("payrollRuns"),{periodStart,periodEnd,payDate,status:"draft",
   createdAt:serverTimestamp(),createdBy:state.user.uid,submittedBy:"",approvedBy:"",finalizedBy:""});
  await refreshCompany();await selectRun(run.id);toast("Draft payroll created.");
 }catch(e){fail(e,"Payroll run creation failed")}
});
function renderRuns(){
 const el=$("runList");el.replaceChildren();
 if(!state.runs.length)empty(el,"No payroll runs yet. Create a draft to get started.");
 for(const run of state.runs){
  const css=run.status==="finalized"?"success":run.status==="rejected"?"danger":"";
  el.append(item(run.periodStart+" — "+run.periodEnd,"Pay date "+run.payDate,
   [button("Open",()=>selectRun(run.id),"small")],run.status,css));
 }
 if(!state.selectedRun||!state.runs.some(r=>r.id===state.selectedRun))$("runDetails").classList.add("hidden");
}
async function selectRun(id){
 if(!state.tenantId)return;
 const run=state.runs.find(r=>r.id===id);if(!run)return;
 const tenantId=state.tenantId;
 state.selectedRun=id;
 try{
  const snap=await getDocs(query(collection(db,"tenants",state.tenantId,"payrollRuns",id,"lines"),limit(250)));
  if(state.tenantId!==tenantId||state.selectedRun!==id)return;
  state.lines=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.employeeName.localeCompare(b.employeeName));
  renderRunDetails();
 }catch(e){fail(e,"Unable to open payroll run")}
}
function renderRunDetails(){
 const run=state.runs.find(r=>r.id===state.selectedRun);if(!run)return;
 $("runDetails").classList.remove("hidden");
 $("runHeading").textContent=run.periodStart+" — "+run.periodEnd;
 $("runStatusChip").textContent=run.status.toUpperCase();
 $("runStatusChip").className="status-chip "+(run.status==="finalized"?"success":run.status==="rejected"?"danger":"");
 const totals=summarizeLines(state.lines),box=$("runTotals");box.replaceChildren();
 for(const [title,amount] of [["Employees",totals.employees],["Simulated gross",money(totals.grossCents)],["Simulated net",money(totals.netCents)]]){
  const el=mk("div","metric");el.append(mk("div","metric-label",title),mk("strong","",amount));box.append(el);
 }
 const wrap=$("runLines");wrap.replaceChildren();
 if(!state.lines.length)wrap.append(mk("p","muted","No pay lines yet. Generate a preview while this run is in draft."));
 else{
  const table=mk("table"),head=mk("thead"),hrow=mk("tr");
  for(const label of ["Employee","Regular","Overtime","Bonus","Deductions","Gross","Net","Adjust"] )hrow.append(mk("th","",label));
  head.append(hrow);table.append(head);
  const tbody=mk("tbody");
  for(const line of state.lines){
   const row=mk("tr");
   for(const v of [line.employeeName,money(line.regularCents),money(line.overtimeCents),money(line.bonusCents),
     money(line.deductionCents),money(line.grossCents),money(line.netCents)])row.append(mk("td","",v));
   const cell=mk("td");
   if(run.status==="draft"&&canPayroll()){
    const bonus=mk("input","adjust-input");
    const deduction=mk("input","adjust-input");
    bonus.type=deduction.type="number";
    bonus.min=deduction.min="0";
    bonus.step=deduction.step="0.01";
    bonus.value=(line.bonusCents/100).toFixed(2);
    deduction.value=(line.deductionCents/100).toFixed(2);
    bonus.setAttribute("aria-label","Bonus: "+line.employeeName);
    deduction.setAttribute("aria-label","Deduction: "+line.employeeName);
    cell.append(bonus,deduction,button("Save",async()=>{
     const extra=toCents(bonus.value),less=toCents(deduction.value);
     const gross=line.regularCents+line.overtimeCents+extra;
     if(less>gross)throw Error("Deduction exceeds gross");
     const {id:omit,...payload}=line;
     await setDoc(doc(db,"tenants",state.tenantId,"payrollRuns",run.id,"lines",line.employeeId),
       {...payload,bonusCents:extra,deductionCents:less,grossCents:gross,netCents:gross-less});
     await selectRun(run.id);toast("Draft adjustment saved.");
    },"small"));
   }else cell.textContent="Locked";
   row.append(cell);
   tbody.append(row);
  }
  table.append(tbody);wrap.append(table);
 }
 const controls=$("runActions");controls.replaceChildren();
 if(run.status==="draft"&&canPayroll()){
  controls.append(button(state.lines.length?"Regenerate pay lines":"Generate simulated pay lines",()=>generateLines(run),"primary"));
  if(state.lines.length)controls.append(button("Submit for approval",()=>moveRun(run,"submitted")));
 }
 for(const next of ["approved","rejected","finalized","draft"]){
  if(canTransition(run.status,next,state.user.uid,run,state.role,state.platform)){
   controls.append(button(next==="draft"?"Reopen rejected draft":next.charAt(0).toUpperCase()+next.slice(1)+" run",
      ()=>moveRun(run,next),next==="rejected"?"danger":"primary"));
  }
 }
 controls.append(mk("small","fine-print","Approval and finalization require distinct authorized users. All results are fictional."));
}
async function generateLines(run){
 const employees=state.employees.filter(e=>e.status==="active"),lines=[];
 if(state.employees.length>=250||state.time.length>=500)throw Error("Employee/time listing may be incomplete; payroll generation is paused until pagination is available");
 if(employees.length>250)throw Error("Run exceeds the current 250-employee safeguard");
 for(const e of employees){
  const relevant=state.time.filter(t=>t.employeeId===e.id&&t.workDate>=run.periodStart&&t.workDate<=run.periodEnd);
  const regular=relevant.reduce((n,t)=>n+Number(t.regularHours||0),0);
  const overtime=relevant.reduce((n,t)=>n+Number(t.overtimeHours||0),0);
  if(e.payType==="hourly"&&regular+overtime===0)continue;
  lines.push(calculateLine({employee:e,regularHours:Math.round(regular*100)/100,overtimeHours:Math.round(overtime*100)/100}));
 }
 if(!lines.length)throw Error("No active employees have eligible simulated compensation or hours for this period");
 const counts=summarizeLines(lines);
 if(!confirm("Generate "+counts.employees+" employee pay lines with fictional gross pay "+money(counts.grossCents)+"? Existing draft lines will be replaced."))return;
 const base=collection(db,"tenants",state.tenantId,"payrollRuns",run.id,"lines");
 const batch=writeBatch(db);
 for(const old of state.lines)if(!lines.some(x=>x.employeeId===old.employeeId))batch.delete(doc(base,old.employeeId));
 for(const line of lines)batch.set(doc(base,line.employeeId),line);
 await batch.commit();
 await selectRun(run.id);toast("Simulated pay lines generated. Review before submitting.");
}
async function moveRun(run,next){
 if(!canTransition(run.status,next,state.user.uid,run,state.role,state.platform))throw Error("Your role or approval separation prevents this transition");
 if(next==="submitted"&&!state.lines.length)throw Error("Generate pay lines before submitting");
 const fields={status:next};
 if(next==="submitted")fields.submittedBy=state.user.uid;
 if(next==="approved"||next==="rejected")fields.approvedBy=state.user.uid;
 if(next==="finalized")fields.finalizedBy=state.user.uid;
 if(next==="draft"){fields.submittedBy="";fields.approvedBy="";}
 if(!confirm("Change this fictional payroll run to "+next+"?"))return;
 await updateDoc(doc(db,"tenants",state.tenantId,"payrollRuns",run.id),fields);
 await refreshCompany();await selectRun(run.id);
 toast("Payroll run marked "+next+".");
}
$("inviteForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!canAdmin()||!state.tenantId)return;
 const email=cleanEmail($("inviteEmail").value),role=$("inviteRole").value;
 if(!email||!["client_admin","payroll_specialist","viewer"].includes(role))return;
 try{
  await setDoc(doc(db,"tenants",state.tenantId,"invites",email),
    {email,role,createdAt:serverTimestamp(),createdBy:state.user.uid});
  const link=location.origin+location.pathname+"#join="+encodeURIComponent(state.tenantId);
  $("inviteShare").classList.remove("hidden");
  $("inviteShare").replaceChildren(mk("strong","","Invitation saved"),mk("small","","Send the invitee this company link: "+link));
  $("inviteForm").reset();await renderAccess();toast("Invitation created. Share the company link with the invitee.");
 }catch(e){fail(e,"Invitation creation failed")}
});
async function renderAccess(){
 if(!state.tenantId||!canAdmin())return;
 const team=$("teamList"),invites=$("inviteList");team.replaceChildren();invites.replaceChildren();
 try{
  const [members,invitationDocs]=await Promise.all([
   getDocs(query(sub("members"),limit(100))),
   getDocs(query(sub("invites"),limit(100)))
  ]);
  if(members.empty)empty(team,"No accepted client memberships. Platform administrators can manage this workspace independently.");
  for(const d of members.docs)team.append(item(d.data().email||"Team member",d.data().role||"member",[],d.data().status||"active","success"));
  if(invitationDocs.empty)empty(invites,"No invitations created.");
  for(const d of invitationDocs.docs)invites.append(item(d.data().email||"Invitation",d.data().role||"viewer"));
 }catch(e){fail(e,"Access roster unavailable")}
}
function localDate(date){
 const d=date instanceof Date?date:new Date(date);
 return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
$("timeDate").value=localDate(new Date());
const now=new Date(),before=new Date();before.setDate(now.getDate()-13);
$("periodStart").value=localDate(before);$("periodEnd").value=localDate(now);
const payday=new Date();payday.setDate(now.getDate()+3);$("payDate").value=localDate(payday);
onAuthStateChanged(auth,async user=>{
 state.user=user;state.tenantId="";state.platform=false;state.tenants=[];state.role="";
 $("authScreen").classList.toggle("hidden",!!user);$("shell").classList.toggle("hidden",!user);
 if(!user)return;
 $("signedInName").textContent=user.email||"Payroll Account";
 $("avatar").textContent=(user.email||"SP").slice(0,2).toUpperCase();
 try{
  const grant=await getDoc(doc(db,"platformAdmins",user.uid));
  state.platform=grant.exists()&&grant.data()?.active===true;
  if(location.hash.startsWith("#join="))$("joinCode").value=decodeURIComponent(location.hash.slice(6));
  await loadTenantDirectory();
  go("dashboard");
  if(!state.platform&&!state.tenants.length)toast("Sign in successful. Enter your company code to accept an invitation.");
 }catch(e){fail(e,"Workspace authorization failed");go("dashboard")}
});
