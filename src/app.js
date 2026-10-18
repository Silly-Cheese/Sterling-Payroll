import {initializeApp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,addDoc,setDoc,updateDoc,query,limit,writeBatch,serverTimestamp,orderBy,documentId,startAfter,startAt,endAt} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {calculateLine,summarizeLines,toCents,money,hoursValue,canTransition,validPeriod,cleanEmail} from "./payroll-core.js";
import {mountStaffAccounts} from "./staff.js";
import {mountPhase3} from "./phase3.js?v=sterling-timekeeping-20261018";
// Phase 4 loads lazily, so a pending Pages deployment cannot break the sign-in screen.
import {buildPayrollPreview,DEFAULT_POLICY} from "./phase3-core.js";
import {mountPhase2} from "./phase2.js?v=sterling-governance-20261018";
import {createOwnerRecordActions} from "./record-actions.js";
import {createSterlingModals} from "./modals.js";
import {compactForm} from "./workspace-ui.js";
import {mountTimecardImport} from "./timecard-import.js?v=sterling-timekeeping-20261018";
import {readCompletePages} from "./payroll-paging.js?v=sterling-timekeeping-20261018";
import {filterTimecards,sumTimecardHours,payPeriodForSelection,formatHours,applyApprovedTimeCorrections} from "./timekeeping-core.js?v=sterling-timekeeping-20261018";
import {prepareRunCommissions} from "./commission-payroll.js?v=sterling-payroll-security-20261017";
import {planPayrollDraftWrites} from "./payroll-write-plan.js?v=sterling-payroll-security-20261017";

const app=initializeApp({
 apiKey:"AIzaSyBAAAUc0nDiiD7zfURjohVj1UBA-1yQmV0",
 authDomain:"sterling-payroll-5d200.firebaseapp.com",
 projectId:"sterling-payroll-5d200",
 storageBucket:"sterling-payroll-5d200.firebasestorage.app",
 messagingSenderId:"755423368876",
 appId:"1:755423368876:web:da8513d0923f1d14033109"
});
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const state={user:null,platform:false,platformOwner:false,platformWrite:false,platformRole:"client",tenants:[],tenantId:"",role:"",employees:[],time:[],runs:[],selectedRun:null,lines:[],page:"dashboard",register:false,moreEmployees:false,moreTime:false,moreRuns:false,employeeCursor:null,timeCursor:null,runCursor:null,clientCursor:null,moreClients:false};
let timekeepingView="register",timekeepingComplete=false,timekeepingCompleteTenant="",timekeepingEpoch=0;
let timekeepingLoading=null,timekeepingLoadError="",timekeepingVisibleRows=40,timekeepingCorrections=[];
const TIME_PAGE_SIZE=200,TIME_VISIBLE_INCREMENT=40;
const titles={
 service:["Client Services","Subscription terms, fictional invoicing, service history and support."],
 commissions:["Commissions","Optional employee commission plans, fictional sales and approval queue."],
 assurance:["Assurance Center","Integrity checks, activity review, exports and system health."],
 employeePortal:["Employee Portal","Private fictional pay statements, profile preferences and company communications."],
 staff:["Staff & Accounts","Assign Sterling staff privileges and company memberships."],
 dashboard:["Executive overview","Everything you need to manage simulated payroll across client businesses."],
 clients:["Client companies","Manage the businesses using Sterling Payroll."],
 employees:["Employee management","Compensation and employment records for the selected company."],
 operations:["Personnel operations","Edit employee records, manage bulk changes, and import fictional staff data."],
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

let remoteSearchTimer=null,remoteSearchId=0;
function scheduleDirectorySearch(type){
 clearTimeout(remoteSearchTimer);
 const requestId=++remoteSearchId,searchId=type==="clients"?"clientSearch":"empSearch";
 const input=$(searchId),hint=$(type==="clients"?"clientSearchHint":"empSearchHint");
 const value=input?.value.trim()||"";
 if(hint)hint.textContent=value.length<2?"Loaded records are searchable. Enter at least 2 letters to search additional name prefixes.":"Looking up company-wide name prefixes…";
 if(value.length<2)return;
 if(type==="clients"&&!state.platform)return;
 if(type==="employees"&&(!state.tenantId||state.role==="employee"))return;
 const tenantAtStart=state.tenantId;
 remoteSearchTimer=setTimeout(async()=>{
  try{
   const field=type==="clients"?"name":"displayName";
   const source=type==="clients"?collection(db,"tenants"):collection(db,"tenants",tenantAtStart,"employees");
   const variants=[...new Set([value,value.charAt(0).toUpperCase()+value.slice(1)])].slice(0,2);
   const results=await Promise.all(variants.map(prefix=>getDocs(query(source,orderBy(field),startAt(prefix),endAt(prefix+"\uf8ff"),limit(40)))));
   if(requestId!==remoteSearchId||state.tenantId!==tenantAtStart||input.value.trim()!==value)return;
   const rows=results.flatMap(result=>result.docs.map(d=>({id:d.id,...d.data()})));
   const target=type==="clients"?state.tenants:state.employees,seen=new Set(target.map(x=>x.id));
   let added=0;
   for(const row of rows)if(!seen.has(row.id)){target.push(row);seen.add(row.id);added++}
   target.sort((a,b)=>String(a[field]||"").localeCompare(String(b[field]||"")));
   if(type==="clients"){
    const selector=$("companySelect"),old=selector.value;
    selector.replaceChildren(new Option("Select company",""));
    for(const t of state.tenants)selector.append(new Option(t.name,t.id));
    selector.value=old;renderClients();
   }else renderEmployees();
   if(hint)hint.textContent="Searched additional name prefixes across the database; "+added+" matching records added. Search by department uses loaded pages.";
  }catch(error){
   if(requestId!==remoteSearchId)return;
   console.warn("Name-prefix search unavailable",error);
   if(hint)hint.textContent="Additional name lookup unavailable; the loaded records remain searchable.";
  }
 },340);
}

function canPayroll(){return state.platformWrite||state.platformRole==="payroll_operator"||["client_admin","payroll_specialist"].includes(state.role)}
function canAdmin(){return state.platformWrite||state.role==="client_admin"}
const tenantDoc=()=>doc(db,"tenants",state.tenantId);
const sub=(name)=>collection(db,"tenants",state.tenantId,name);
function auditClient(batch,category,action,subject,detail){
 batch.set(doc(sub("auditEvents")),{category,action,subject:String(subject).slice(0,160),detail:String(detail).slice(0,300),actor:state.user.uid,at:serverTimestamp()});
}
function go(page){
 if(!titles[page])page="dashboard";
 if(page==="clients"&&!state.platform)page="dashboard";
 if(page==="staff"&&!state.platformOwner)page="dashboard";
 if(page==="service"&&(!state.tenantId||state.role==="employee"))page="dashboard";
 if(page==="commissions"&&(!state.tenantId||!canPayroll()))page="dashboard";
 if(page==="assurance"&&(!state.tenantId||!canAdmin()))page="dashboard";
 if(page==="employeePortal"&&!state.tenantId)page="dashboard";
 if(state.role==="employee"&&["employees","operations","time","payroll","access","service","assurance","clients","commissions"].includes(page))page=state.tenantId?"employeePortal":"dashboard";
 if(["employees","operations","time","payroll","access","commissions"].includes(page)&&!state.tenantId)page="dashboard";
 if(page==="access"&&!canAdmin())page="dashboard";
 state.page=page;
 for(const node of document.querySelectorAll(".page"))node.classList.toggle("hidden",node.id!=="page-"+page);
 for(const node of document.querySelectorAll("[data-page]"))node.classList.toggle("active",node.dataset.page===page);
 $("pageName").textContent=titles[page][0];$("pageTitle").textContent=titles[page][0];$("pageDescription").textContent=titles[page][1];
 $("pageEyebrow").textContent=page==="clients"?"STERLING PAYROLL / HEADQUARTERS":"STERLING PAYROLL / "+(state.tenantId?state.tenants.find(t=>t.id===state.tenantId)?.name||"CLIENT WORKSPACE":"COMMAND CENTER").toUpperCase();
 document.querySelector(".sidebar")?.classList.remove("open");
 syncTimekeepingView(page);
 document.getElementById("phase3Payroll")?.classList.toggle("hidden",page!=="payroll"||!state.tenantId);
 if(page==="staff")void staffUI?.refresh();
 if(page==="service")void phase5?.refresh();
 if(page==="commissions")void commissionsUI?.refresh().catch(e=>fail(e,"Commissions could not load"));
 if(page==="assurance")void phase6?.refresh();
 if(page==="employeePortal")void phase4?.refresh();
 if(page==="dashboard")renderDashboard();
 if(page==="clients")renderClients();
 if(page==="employees")renderEmployees();
 if(page==="operations")phase2?.refresh();
 if(page==="time"){
  renderTime();
  void loadCompleteTimekeeping().then(()=>phase3?.refresh()).catch(error=>fail(error,"Complete timekeeping data could not load"));
 }
 if(page==="payroll"){renderRuns();void phase3?.refresh();}
 if(page==="access")void renderAccess();
 window.scrollTo({top:0});
}
for(const nav of document.querySelectorAll("[data-page]"))nav.addEventListener("click",()=>go(nav.dataset.page));
$("mobileMenu").addEventListener("click",()=>document.querySelector(".sidebar").classList.toggle("open"));
document.body.dataset.density=localStorage.getItem("sterling-payroll-density")==="comfortable"?"comfortable":"compact";
function updateDensityLabel(){$("densityToggle").textContent=document.body.dataset.density==="compact"?"Comfortable view":"Compact view"}
updateDensityLabel();
$("densityToggle").onclick=()=>{
 document.body.dataset.density=document.body.dataset.density==="compact"?"comfortable":"compact";
 localStorage.setItem("sterling-payroll-density",document.body.dataset.density);
 updateDensityLabel();
};
const quickDialog=$("quickNav"),quickInput=$("quickNavSearch"),quickResults=$("quickNavResults");
function renderQuickNav(){
 const search=quickInput.value.toLowerCase().trim();quickResults.replaceChildren();
 const pages=Object.entries(titles).filter(([page,[title]])=>{
  const node=document.querySelector('#nav [data-page="'+page+'"]');
  return node&&!node.classList.contains("hidden")&&(title.toLowerCase().includes(search)||page.toLowerCase().includes(search));
 });
 for(const [page,[title,description]] of pages){
  const entry=mk("button","quick-nav-entry");entry.type="button";
  entry.append(mk("strong","",title),mk("small","",description));
  entry.onclick=()=>{quickDialog.close();go(page)};quickResults.append(entry);
 }
 if(!pages.length)quickResults.append(mk("p","muted","No permitted pages match your search."));
}
function openQuickNav(){quickInput.value="";renderQuickNav();quickDialog.showModal();quickInput.focus()}
$("openQuickNav").onclick=openQuickNav;quickInput.oninput=renderQuickNav;
document.addEventListener("keydown",event=>{
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();if(!quickDialog.open)openQuickNav()}
 if(event.key==="/"&&!quickDialog.open&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)){
  event.preventDefault();openQuickNav()
 }
});
window.addEventListener("offline",()=>{$("connectionNotice").classList.remove("hidden")});
window.addEventListener("online",()=>{$("connectionNotice").classList.add("hidden")});

$("signOut").addEventListener("click",()=>signOut(auth).catch(e=>fail(e,"Sign out failed")));

$("authToggle").addEventListener("click",()=>{
 state.register=!state.register;$("authTitle").textContent=state.register?"Create your account":"Sign in to continue";
 $("authSubmit").textContent=state.register?"Create account":"Sign in";
 $("authToggle").textContent=state.register?"Already have an account? Sign in":"Create an account";
 $("authPassword").autocomplete=state.register?"new-password":"current-password";
 $("authNotice").textContent=state.register?"Registration creates a client account. Sterling assigns company and staff permissions.":"Accounts do not automatically receive access to any client's data.";
});
$("authForm").addEventListener("submit",async event=>{
 event.preventDefault();const email=$("authEmail").value.trim(),pass=$("authPassword").value;
 $("authSubmit").disabled=true;
 try{
  if(state.register){
   await createUserWithEmailAndPassword(auth,email,pass);
   toast("Account created. Your account starts as a client until Sterling assigns access.");
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
  const snap=await getDocs(query(collection(db,"tenants"),orderBy(documentId()),limit(100)));
  state.tenants=snap.docs.map(d=>({id:d.id,...d.data()}));
  state.clientCursor=snap.docs.at(-1)||null;state.moreClients=snap.size===100;
  $("loadMoreClients").classList.toggle("hidden",!state.moreClients);
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
 invalidateTimekeeping();timekeepingView="register";
 phase4?.clear();
 state.tenantId=id;state.role="";state.selectedRun=null;state.lines=[];
 clearTimeout(remoteSearchTimer);remoteSearchId++;
 // Never carry sensitive personnel data from a previous tenant into another workspace.
 state.employees=[];state.time=[];state.runs=[];
 state.employeeCursor=null;state.timeCursor=null;state.runCursor=null;
 state.moreEmployees=false;state.moreTime=false;state.moreRuns=false;
 if(state.user&&writeStorage)localStorage.setItem("sterling-payroll-company-"+state.user.uid,id);
 $("companySelect").value=id;
 if(id){
  if(state.platform)state.role=state.platformWrite?"platform_admin":state.platformRole;
  else{
   const membership=await getDoc(doc(db,"tenants",id,"members",state.user.uid));
   if(!membership.exists()||membership.data().status!=="active")throw Error("No authorized membership for this company");
   state.role=membership.data().role;
  }
 }
 $("noClient").classList.toggle("hidden",!!id);
 document.querySelectorAll(".client-only").forEach(node=>node.classList.toggle("hidden",!id));
 const employeeOnly=state.role==="employee";
 for(const nav of document.querySelectorAll("#nav [data-page]")){
  if(["employees","operations","time","payroll","access","service","assurance","commissions"].includes(nav.dataset.page)&&employeeOnly)nav.classList.add("hidden");
 }
 const commissionNav=document.querySelector('#nav [data-page="commissions"]');
 if(commissionNav)commissionNav.classList.toggle("hidden",!id||!canPayroll());
 const portalNav=document.querySelector("#nav [data-page=employeePortal]");
 if(portalNav)portalNav.classList.toggle("hidden",!id||!(employeeOnly||canAdmin()));
 document.querySelectorAll(".admin-only").forEach(node=>node.classList.toggle("hidden",!id||!canAdmin()));
 document.querySelectorAll(".platform-only").forEach(node=>node.classList.toggle("hidden",!state.platform));
 document.querySelectorAll(".owner-only").forEach(node=>node.classList.toggle("hidden",!state.platformOwner));
 $("clientForm").classList.toggle("hidden",!state.platformWrite);
 $("sidebarRole").textContent=state.platformOwner?"Sterling owner":state.platformRole!=="client"?state.platformRole.replaceAll("_"," "):state.role==="employee"?"Employee portal":state.role?state.role.replaceAll("_"," "):"Client account";
 const editOnly=document.querySelectorAll("#employeeForm,#timeForm,#runForm");
 editOnly.forEach(form=>form.classList.toggle("hidden",!canPayroll()));
 timecardUI.sync();
 if(!id){state.employees=[];state.time=[];state.runs=[];state.selectedRun=null;go("dashboard");return}
 if(employeeOnly){await phase4?.refresh();go("employeePortal");return}
 await refreshCompany();
 if(commissionsUI&&state.page==="commissions")await commissionsUI.refresh();
 if(state.page==="clients"&&state.platform)go("clients");else go(state.page==="dashboard"?"dashboard":state.page);
}
$("companySelect").addEventListener("change",()=>chooseTenant($("companySelect").value).catch(e=>fail(e,"Company selection failed")));
async function refreshCompany(){
 if(!state.tenantId||state.role==="employee")return;
 const id=state.tenantId;
 try{
  const [employees,time,runs]=await Promise.all([
   getDocs(query(sub("employees"),orderBy(documentId()),limit(100))),
   getDocs(query(sub("timeEntries"),orderBy(documentId()),limit(200))),
   getDocs(query(sub("payrollRuns"),orderBy(documentId()),limit(100)))
  ]);
  if(state.tenantId!==id)return;
  state.employees=employees.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.displayName.localeCompare(b.displayName));
  state.time=time.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.workDate.localeCompare(a.workDate));
  state.runs=runs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd));
  state.employeeCursor=employees.docs.at(-1)||null;state.timeCursor=time.docs.at(-1)||null;state.runCursor=runs.docs.at(-1)||null;
  state.moreEmployees=employees.size===100;state.moreTime=time.size===200;state.moreRuns=runs.size===100;
  invalidateTimekeeping();
  $("loadMoreEmployees").classList.toggle("hidden",!state.moreEmployees);
  $("loadMoreTime").classList.toggle("hidden",!state.moreTime);
  $("loadMoreRuns").classList.toggle("hidden",!state.moreRuns);
 }catch(e){
  if(state.tenantId!==id)return;
  state.employees=[];state.time=[];state.runs=[];state.lines=[];state.selectedRun=null;
  state.moreEmployees=false;state.moreTime=false;state.moreRuns=false;
  fail(e,"Company data could not load");
 }
 renderDashboard();renderEmployees();renderTime();renderRuns();phase2?.refresh();
 if(state.page==="time"){
  try{await loadCompleteTimekeeping();await phase3?.refresh()}
  catch(error){fail(error,"Timekeeping could not refresh")}
 }
}
function renderDashboard(){
 const el=$("metrics");el.replaceChildren();
 $("overviewRole").textContent=state.platformOwner?"STERLING OWNER":state.role?state.role.replaceAll("_"," ").toUpperCase():"CLIENT ACCOUNT";
 $("overviewGreeting").textContent=state.tenantId?(state.tenants.find(t=>t.id===state.tenantId)?.name||"Your company")+" at a glance.":"Your Sterling command center.";
 $("overviewSubline").textContent=state.tenantId?"Manage fictional pay periods, client services and employee operations from this workspace.":"Select an authorized client company to start. Account creation alone does not grant company access.";
 const quick=$("quickActions");quick.replaceChildren();
 const links=state.tenantId?(state.role==="employee"?[["employeePortal","My pay & messages"]]:[
  ["payroll","Prepare payroll"],["time","Review time"],["employees","Employee directory"],["service","Client billing"],...(canPayroll()?[["commissions","Commissions"]]:[]),...(canAdmin()?[["assurance","Run health check"]]:[])]):
  [...(state.platform?[["clients","Manage client companies"]]:[]),...(state.platformOwner?[["staff","Manage staff permissions"]]:[])];
 for(const [page,label] of links)quick.append(button(label,()=>go(page),"quick-action"));
 if(!links.length)quick.append(mk("p","muted","Ask a Sterling administrator to assign an authorized company workspace."));
 const metrics=[
  ["Client companies",state.tenants.length+(state.moreClients?"+":""),"Loaded client workspaces"],
  ["Employees",state.tenantId?String(state.employees.length)+(state.moreEmployees?"+":""):"—","Current company · loaded records"],
  ["Payroll runs",state.tenantId?String(state.runs.length)+(state.moreRuns?"+":""):"—","Current company · loaded periods"],
  ["Awaiting approval",state.tenantId?state.runs.filter(r=>r.status==="submitted").length:"—","Pending client authorization"]
 ];
 const attention=$("attentionQueue");attention.replaceChildren();
 const pendingTime=state.time.filter(t=>(t.status||"pending")==="pending").length;
 const pendingRuns=state.runs.filter(r=>r.status==="submitted").length;
 const flagged=[
  ["Pending time approvals",pendingTime,"time"],
  ["Payroll awaiting approval",pendingRuns,"payroll"],
  ["Active fictional employees",state.employees.filter(e=>e.status==="active").length,"employees"]
 ];
 if(!state.tenantId)attention.append(mk("p","muted","Select a company to display its operational queue."));
 else for(const [label,num,page] of flagged)attention.append(item(label,num+" currently loaded",[
  button("Review",()=>go(page),"small")]));
 const recent=$("recentPayroll");recent.replaceChildren();
 if(!state.runs.length)recent.append(mk("p","muted","No payroll runs loaded for this company."));
 else for(const run of state.runs.slice(0,5))recent.append(item(run.periodStart+" — "+run.periodEnd,
  run.status+" · "+run.payDate,[button("Open",()=>{go("payroll");return selectRun(run.id)},"small")]));
 for(const [name,value,subtitle] of metrics){
  const box=mk("article","metric");box.append(mk("div","metric-label",name),mk("strong","",value),mk("small","",subtitle));el.append(box);
 }
}
function renderClients(){
 if(!state.platform)return;
 const el=$("clientList");el.replaceChildren();
 const q=$("clientSearch").value.toLowerCase().trim();
 const clients=state.tenants.filter(c=>[c.name,c.industry,c.contactEmail,c.status].join(" ").toLowerCase().includes(q));
 $("clientCount").textContent=clients.length+" displayed · "+state.tenants.length+" loaded"+(state.moreClients?"+":"");
 if(!clients.length)return empty(el,"No clients match this search.");
 const frag=document.createDocumentFragment();
 for(const c of clients.slice(0,250)){
  const actions=[button("Open",async()=>{await chooseTenant(c.id);go("employees")},"small")];
  if(state.platformWrite)actions.push(button(c.status==="active"?"Suspend":"Reactivate",async()=>{
   const status=c.status==="active"?"suspended":"active";
   if(!await confirmAction("Client company status","Set "+c.name+" to "+status+"?"))return;
   const batch=writeBatch(db);
   batch.update(doc(db,"tenants",c.id),{status});
   batch.set(doc(db,"tenants",c.id,"auditEvents"),{category:"client",action:"company-status",subject:c.id,detail:c.status+" → "+status,actor:state.user.uid,at:serverTimestamp()});
   await batch.commit();await loadTenantDirectory();renderClients();toast("Client status updated.");
  },"small"));
  if(state.platformOwner)actions.push(button("Delete company",()=>ownerActions.remove("tenants",{id:c.id,name:c.name}),"small danger"));
  frag.append(item(c.name,[c.industry,c.contactEmail,c.servicePlan].filter(Boolean).join(" • ")||"Client company",actions,c.status,c.status==="active"?"success":"danger"));
 }
 el.append(frag);
 if(clients.length>250)el.append(mk("p","fine-print","Showing 250 matches. Narrow your search to inspect another record."));
}
$("clientSearch").addEventListener("input",()=>{renderClients();scheduleDirectorySearch("clients")});
$("loadMoreClients").addEventListener("click",async()=>{
 if(!state.platform||!state.clientCursor)return;
 $("loadMoreClients").disabled=true;
 try{
  const snap=await getDocs(query(collection(db,"tenants"),orderBy(documentId()),startAfter(state.clientCursor),limit(100)));
  const seen=new Set(state.tenants.map(t=>t.id));
  state.tenants.push(...snap.docs.filter(d=>!seen.has(d.id)).map(d=>({id:d.id,...d.data()})));
  state.tenants.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
  state.clientCursor=snap.docs.at(-1)||null;state.moreClients=snap.size===100;
  $("loadMoreClients").classList.toggle("hidden",!state.moreClients);
  const selector=$("companySelect");selector.replaceChildren(new Option("Select company",""));
  for(const t of state.tenants)selector.append(new Option(t.name,t.id));
  selector.value=state.tenantId;
  renderDashboard();renderClients();phase2?.refresh();
 }catch(error){fail(error,"Unable to load additional clients")}finally{$("loadMoreClients").disabled=false}
});
$("clientForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!state.platform)return;
 const name=$("clientName").value.trim();if(name.length<2)return toast("Enter a company name.",true);
 try{
  const ref=await addDoc(collection(db,"tenants"),{name,status:"active",createdBy:state.user.uid,createdAt:serverTimestamp(),contactEmail:"",industry:"",servicePlan:"starter",notes:""});
  $("clientForm").reset();event.target.dispatchEvent(new Event("sterling:complete"));await loadTenantDirectory();await chooseTenant(ref.id);go("access");
  toast("Client company created. Assign its administrators through Staff & Accounts.");
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
  const record=doc(sub("employees"));
  const batch=writeBatch(db);
  batch.set(record,{
   displayName:$("empName").value.trim(),department:$("empDept").value.trim(),jobTitle:$("empJob").value.trim(),
   payType,payFrequency:$("empFrequency").value,
   hourlyRateCents:payType==="hourly"?toCents($("empHourly").value):0,
   annualSalaryCents:payType==="salary"?toCents($("empSalary").value):0,
   status:"active",createdBy:state.user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
  auditClient(batch,"personnel","employee-create",record.id,$("empName").value.trim());await batch.commit();
  $("employeeForm").reset();event.target.dispatchEvent(new Event("sterling:complete"));$("empType").dispatchEvent(new Event("change"));
  await refreshCompany();toast("Employee saved in this client workspace.");
 }catch(e){fail(e,"Employee creation failed")}
});
$("empSearch").addEventListener("input",()=>{renderEmployees();scheduleDirectorySearch("employees")});
$("empStatus").addEventListener("change",renderEmployees);
function renderEmployees(){
 const el=$("employeeList");el.replaceChildren();
 const q=$("empSearch").value.trim().toLowerCase();
 const status=$("empStatus").value;
 const employees=state.employees.filter(e=>(status==="all"||e.status===status)&&[e.displayName,e.jobTitle,e.department].join(" ").toLowerCase().includes(q));
 $("empCount").textContent=employees.length+" shown / "+state.employees.length+" loaded"+(state.moreEmployees?"+":"");
 if(!employees.length)empty(el,"No employee records match this search.");
 for(const e of employees.slice(0,250)){
  const description=[e.jobTitle,e.department,e.payType==="hourly"?money(e.hourlyRateCents)+"/hr":money(e.annualSalaryCents)+"/year"].filter(Boolean).join(" • ");
  const actions=canPayroll()?[button("Edit",async()=>{go("operations");const editor=await initializePhase2();editor.edit(e.id)},"small"),button(e.status==="active"?"On leave":"Reactivate",async()=>{
   const status=e.status==="active"?"leave":"active";
   const update=writeBatch(db);update.update(doc(db,"tenants",state.tenantId,"employees",e.id),{status,updatedAt:serverTimestamp()});
   auditClient(update,"personnel","employee-status",e.id,e.status+" → "+status);await update.commit();
   await refreshCompany();toast("Employee status updated.");
  },"small")]:[];
  if(state.platformOwner)actions.push(button("Delete",()=>ownerActions.remove("employees",e),"small danger"));
  el.append(item(e.displayName,description,actions,e.status,e.status==="active"?"success":""));
 }
 if(employees.length>250)el.append(mk("p","fine-print","First 250 matching employees shown. Refine your search or load more records."));
 const selector=$("timeEmployee");const old=selector.value;selector.replaceChildren(new Option("Select an employee",""));
 for(const e of state.employees.filter(e=>e.status==="active"))selector.append(new Option(e.displayName,e.id));
 selector.value=old&&state.employees.some(e=>e.id===old&&e.status==="active")?old:"";
}
for(const [buttonId,kind,count,sort] of [
 ["loadMoreEmployees","employees",100,"displayName"],
 ["loadMoreTime","timeEntries",200,"workDate"],
 ["loadMoreRuns","payrollRuns",100,"periodEnd"]
]){
 $(buttonId).addEventListener("click",async()=>{
  if(!state.tenantId)return;
  const tenantId=state.tenantId;
  const cursorField=kind==="employees"?"employeeCursor":kind==="timeEntries"?"timeCursor":"runCursor";
  const moreField=kind==="employees"?"moreEmployees":kind==="timeEntries"?"moreTime":"moreRuns";
  const arrayField=kind==="employees"?"employees":kind==="timeEntries"?"time":"runs";
  const cursor=state[cursorField];if(!cursor)return;
  $(buttonId).disabled=true;
  try{
   const snapshot=await getDocs(query(sub(kind),orderBy(documentId()),startAfter(cursor),limit(count)));
   if(state.tenantId!==tenantId)return;
   const found=snapshot.docs.map(d=>({id:d.id,...d.data()}));
   const seen=new Set(state[arrayField].map(d=>d.id));
   state[arrayField].push(...found.filter(d=>!seen.has(d.id)));
   state[arrayField].sort((a,b)=>kind==="employees"?String(a[sort]||"").localeCompare(String(b[sort]||"")):String(b[sort]||"").localeCompare(String(a[sort]||"")));
   state[cursorField]=snapshot.docs.at(-1)||null;state[moreField]=snapshot.size===count;
   $(buttonId).classList.toggle("hidden",!state[moreField]);
   renderDashboard();renderEmployees();renderTime();renderRuns();phase2?.refresh();
   if(kind==="timeEntries")await phase3?.refresh();
  }catch(error){fail(error,"Unable to load additional records")}
  finally{$(buttonId).disabled=false}
 });
}
$("timeForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!canPayroll()||!state.tenantId)return;
 const employeeId=$("timeEmployee").value;
 if(!state.employees.some(e=>e.id===employeeId&&e.status==="active"))return toast("Choose an active employee.",true);
 try{
  const entry=doc(sub("timeEntries"));const batch=writeBatch(db);batch.set(entry,{
   employeeId,workDate:$("timeDate").value,
   regularHours:hoursValue($("timeRegular").value),overtimeHours:hoursValue($("timeOvertime").value),
   note:$("timeNote").value.trim(),createdAt:serverTimestamp(),createdBy:state.user.uid,status:"pending",approvedBy:""
  });
  auditClient(batch,"time","time-entry-create",entry.id,$("timeDate").value);await batch.commit();
  $("timeRegular").value="8";$("timeOvertime").value="0";$("timeNote").value="";event.target.dispatchEvent(new Event("sterling:complete"));
  await refreshCompany();await phase3?.refresh();toast("Simulated time entry recorded.");
 }catch(e){fail(e,"Time entry failed")}
});
function invalidateTimekeeping(){
 timekeepingEpoch++;
 timekeepingComplete=false;
 timekeepingCompleteTenant="";
 timekeepingLoadError="";
 timekeepingLoading=null;
 timekeepingCorrections=[];
 timekeepingVisibleRows=TIME_VISIBLE_INCREMENT;
}
function syncTimekeepingView(page=state.page){
 const register=page==="time"&&timekeepingView==="register";
 $("timeRegisterView")?.classList.toggle("hidden",!register);
 $("phase3Time")?.classList.toggle("hidden",page!=="time"||!state.tenantId||register);
 for(const [id,active] of [["timeViewRegister",register],["timeViewApprovals",page==="time"&&!register]]){
  const btn=$(id);if(!btn)continue;
  btn.classList.toggle("active",active);
  btn.setAttribute("aria-pressed",String(active));
 }
}
function selectTimekeepingView(view){
 if(!["register","approvals"].includes(view))return;
 timekeepingView=view;
 syncTimekeepingView();
 if(view==="approvals")void phase3?.refresh();
}
$("timeViewRegister").onclick=()=>selectTimekeepingView("register");
$("timeViewApprovals").onclick=()=>selectTimekeepingView("approvals");

async function loadCompleteTimekeeping(){
 const company=state.tenantId,actor=state.user?.uid;
 if(!company||!actor||state.role==="employee")return;
 if(timekeepingComplete&&timekeepingCompleteTenant===company)return;
 if(timekeepingLoading)return timekeepingLoading;
 const epoch=++timekeepingEpoch;
 timekeepingLoadError="";
 timekeepingComplete=false;
 renderTime();
 const guard=()=>{
  if(epoch!==timekeepingEpoch||state.tenantId!==company||state.user?.uid!==actor)
   throw Error("Workspace changed while loading timekeeping. Reopen the company.");
 };
 async function collect(name,progress){
  return readCompletePages(async(cursor,pageSize)=>{
   guard();
   const opts=[orderBy(documentId()),limit(pageSize)];
   if(cursor)opts.push(startAfter(cursor));
   const snapshot=await getDocs(query(collection(db,"tenants",company,name),...opts));
   guard();
   return {records:snapshot.docs.map(d=>({id:d.id,...d.data()})),nextCursor:snapshot.docs.at(-1)||null};
  },{pageSize:TIME_PAGE_SIZE,checkAccess:guard,
   onProgress:({count})=>{
    if(epoch===timekeepingEpoch){
     $("timeDataState").textContent="Loading "+progress+" · "+count;
    }
   }});
 }
 const promise=(async()=>{
  const [employees,entries,runs,corrections]=await Promise.all([
   collect("employees","employees"),
   collect("timeEntries","timecards"),
   collect("payrollRuns","periods"),
   collect("timeCorrections","corrections")
  ]);
  guard();
  state.employees=employees.sort((a,b)=>String(a.displayName||"").localeCompare(String(b.displayName||"")));
  state.time=entries.sort((a,b)=>String(b.workDate).localeCompare(String(a.workDate)));
  timekeepingCorrections=corrections;
  state.runs=runs.sort((a,b)=>String(b.periodEnd).localeCompare(String(a.periodEnd)));
  state.moreEmployees=false;state.moreTime=false;state.moreRuns=false;
  $("loadMoreEmployees").classList.add("hidden");
  $("loadMoreTime").classList.add("hidden");
  $("loadMoreRuns").classList.add("hidden");
  timekeepingComplete=true;timekeepingCompleteTenant=company;timekeepingLoadError="";
  renderEmployees();renderTime();renderRuns();renderDashboard();phase2?.refresh();
 })();
 timekeepingLoading=promise;
 try{await promise}
 catch(error){
  if(epoch===timekeepingEpoch){
   timekeepingLoadError=error?.message||String(error);
   timekeepingComplete=false;
   renderTime();
  }
  throw error;
 }finally{if(timekeepingLoading===promise)timekeepingLoading=null}
}

function updateTimeFilters(){
 const employee=$("timeEmployeeFilter"),selectedEmployee=employee.value;
 employee.replaceChildren(new Option("All employees",""));
 for(const person of state.employees){
  employee.append(new Option(person.displayName||"Employee",person.id));
 }
 employee.value=state.employees.some(e=>e.id===selectedEmployee)?selectedEmployee:"";
 const period=$("timePeriodFilter"),previous=period.value;
 period.replaceChildren(new Option("All dates","all"));
 const runs=[...state.runs].sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd));
 for(const run of runs){
  period.append(new Option(run.periodStart+" – "+run.periodEnd+
   (run.status==="finalized"?" · Finalized":""),run.id));
 }
 period.append(new Option("Custom date range","custom"));
 period.value=previous==="all"||previous==="custom"||runs.some(r=>r.id===previous)?
  previous:(runs[0]?.id||"all");
 $("timeCustomPeriod").classList.toggle("hidden",period.value!=="custom");
}

function renderTime(){
 const list=$("timeList");list.replaceChildren();
 updateTimeFilters();
 const stateLabel=$("timeDataState"),count=$("timeCount"),more=$("timeShowMoreRows");
 more.classList.add("hidden");
 $("timeSummary").classList.add("hidden");
 if(!timekeepingComplete||timekeepingCompleteTenant!==state.tenantId){
  stateLabel.textContent=timekeepingLoadError?"Load failed":"Loading all records…";
  count.textContent=timekeepingLoadError?"Could not verify complete timecard data. Use Refresh to retry.":"Loading all company timecards before showing totals…";
  return;
 }
 stateLabel.textContent="Complete records";
 const names=new Map(state.employees.map(e=>[e.id,e.displayName]));
 const employeeId=$("timeEmployeeFilter").value,periodValue=$("timePeriodFilter").value;
 const period=payPeriodForSelection(state.runs,periodValue);
 const custom=periodValue==="custom";
 const start=custom?$("timeCustomStart").value:period?.start||"";
 const end=custom?$("timeCustomEnd").value:period?.end||"";
 if(custom&&(!start||!end||end<start)){
  count.textContent="Choose a valid start and end date for this custom pay period.";
  return;
 }
 let effective;
 try{effective=applyApprovedTimeCorrections(state.time,timekeepingCorrections)}
 catch(error){
  count.textContent=error?.message||"Timecard corrections conflict. Review corrections before using this period total.";
  stateLabel.textContent="Review corrections";
  return;
 }
 const periodEntries=filterTimecards(effective,{employeeId,start,end},names);
 const rows=filterTimecards(periodEntries,{
  day:$("timeDayFilter").value,status:$("timeStatus").value,
  search:$("timeSearch").value,sort:$("timeSort").value
 },names);
 count.textContent=rows.length+" matching timecards · "+state.time.length+" company records";
 if(employeeId){
  const person=names.get(employeeId)||"Employee";
  const totals=sumTimecardHours(periodEntries);
  const summary=$("timeSummary");
  summary.replaceChildren();
  const heading=mk("div","timekeeping-summary-heading");
  heading.append(mk("strong","",person),mk("small","",period?.label||start+" – "+end));
  summary.append(heading);
  const metrics=mk("div","timekeeping-summary-metrics");
  for(const [title,value] of [
   ["Total recorded",formatHours(totals.total)+" h"],
   ["Regular",formatHours(totals.regular)+" h"],
   ["Overtime",formatHours(totals.overtime)+" h"],
   ["Approved",formatHours(totals.approved)+" h"],
   ["Pending",formatHours(totals.pending)+" h"]
  ]){
   const card=mk("div","timekeeping-summary-metric");
   card.append(mk("small","",title),mk("strong","",value));
   metrics.append(card);
  }
  summary.append(metrics);
  summary.append(mk("p","fine-print",
   "Recorded totals include approved and pending entries, not rejected entries ("+
   totals.rejectedCount+" rejected). Approved corrections are included; paid leave is not counted as worked time. Pending hours are not payroll-ready. Day, search and status filters do not change these totals."));
  summary.classList.remove("hidden");
 }
 if(!rows.length)return empty(list,"No timecards match the selected filters.");
 const fragment=document.createDocumentFragment();
 let lastGroup="";
 for(const entry of rows.slice(0,timekeepingVisibleRows)){
  const employeeName=names.get(entry.employeeId)||"Former employee";
  const groupByEmployee=$("timeSort").value.startsWith("employee");
  const groupValue=groupByEmployee?employeeName:entry.workDate;
  if(groupValue!==lastGroup){
   fragment.append(mk("div","timekeeping-group-label",groupValue));
   lastGroup=groupValue;
  }
  const total=Number(entry.regularHours||0)+Number(entry.overtimeHours||0);
  const actions=state.platformOwner?[button("Delete",()=>ownerActions.remove("timeEntries",entry),"small danger")]:[];
  const label=entry.workDate+" · "+formatHours(total)+" hours ("+
   formatHours(entry.regularHours)+" regular, "+formatHours(entry.overtimeHours)+" OT)"+
   (entry.corrected?" · Corrected":"")+(entry.note?" · "+entry.note:"");
  fragment.append(item(employeeName,label,actions,entry.status||"pending",entry.status==="approved"?"success":""));
 }
 list.append(fragment);
 if(rows.length>timekeepingVisibleRows){
  more.textContent="Show "+Math.min(TIME_VISIBLE_INCREMENT,rows.length-timekeepingVisibleRows)+" more timecards";
  more.classList.remove("hidden");
 }
}

for(const id of ["timeEmployeeFilter","timePeriodFilter","timeSort","timeStatus",
 "timeDayFilter","timeCustomStart","timeCustomEnd"]){
 $(id).addEventListener("change",()=>{timekeepingVisibleRows=TIME_VISIBLE_INCREMENT;renderTime()});
}
$("timeSearch").addEventListener("input",()=>{timekeepingVisibleRows=TIME_VISIBLE_INCREMENT;renderTime()});
$("timeClearFilters").onclick=()=>{
 $("timeSearch").value="";$("timeDayFilter").value="";$("timeStatus").value="all";
 $("timeSort").value="date-desc";$("timeEmployeeFilter").value="";
 $("timePeriodFilter").value=state.runs[0]?.id||"all";
 $("timeCustomStart").value="";$("timeCustomEnd").value="";
 timekeepingVisibleRows=TIME_VISIBLE_INCREMENT;renderTime();
};
$("timeShowMoreRows").onclick=()=>{
 timekeepingVisibleRows+=TIME_VISIBLE_INCREMENT;renderTime();
};
$("timeRefresh").onclick=async()=>{
 invalidateTimekeeping();
 try{await loadCompleteTimekeeping();await phase3?.refresh()}
 catch(error){fail(error,"Timecards could not refresh")}
};
$("runForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!canPayroll()||!state.tenantId)return;
 const periodStart=$("periodStart").value,periodEnd=$("periodEnd").value,payDate=$("payDate").value;
 if(!validPeriod(periodStart,periodEnd,payDate))return toast("Pay period dates must be valid, and payday must be after the period.",true);
 try{
  const run=doc(sub("payrollRuns"));const batch=writeBatch(db);
  batch.set(run,{periodStart,periodEnd,payDate,status:"draft",createdAt:serverTimestamp(),createdBy:state.user.uid,submittedBy:"",approvedBy:"",finalizedBy:""});
  auditClient(batch,"payroll","payroll-create",run.id,periodStart+" → "+periodEnd);await batch.commit();
  await refreshCompany();await selectRun(run.id);event.target.dispatchEvent(new Event("sterling:complete"));toast("Draft payroll created.");
 }catch(e){fail(e,"Payroll run creation failed")}
});
function renderRuns(){
 const el=$("runList");el.replaceChildren();
 const q=$("runSearch").value.toLowerCase().trim(),status=$("runStatus").value;
 const filtered=state.runs.filter(r=>(status==="all"||r.status===status)&&[r.periodStart,r.periodEnd,r.payDate,r.status].join(" ").toLowerCase().includes(q));
 $("runCount").textContent=filtered.length+" matching / "+state.runs.length+" loaded"+(state.moreRuns?"+":"");
 if(!filtered.length)empty(el,"No payroll periods match these filters.");
 const frag=document.createDocumentFragment();
 for(const run of filtered.slice(0,250)){
  const css=run.status==="finalized"?"success":run.status==="rejected"?"danger":"";
  const actions=[button("Open",()=>selectRun(run.id),"small")];
  if(state.platformOwner){
   actions.push(button("Owner signoff",()=>openOwnerReview("payrollRuns",run.id),"small"));
   if(!["draft","rejected"].includes(run.status))actions.push(button("Correct / void",()=>openPayrollEditor(run.id),"small"));
   actions.push(button("Delete permanently",()=>ownerActions.remove("payrollRuns",run),"small danger"));
  }
  frag.append(item(run.periodStart+" — "+run.periodEnd,"Simulated payday: "+run.payDate,actions,run.status,css));
 }
 el.append(frag);
 if(filtered.length>250)el.append(mk("p","fine-print","Displaying the first 250 matches. Refine the filter."));
 if(!state.selectedRun||!state.runs.some(r=>r.id===state.selectedRun))$("runDetails").classList.add("hidden");
}
$("runSearch").addEventListener("input",renderRuns);
$("runStatus").addEventListener("change",renderRuns);
async function openOwnerReview(kind,id){
 if(!state.platformOwner||!ownerUI)throw Error("Owner record management is not available yet");
 await ownerUI.openReview(kind,id,state.tenantId);
}
async function openPayrollEditor(id){
 if(!state.platformOwner||!ownerUI)throw Error("Owner record management is not available yet");
 await ownerUI.openPeriod(id,state.tenantId);
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
 for(const [title,amount] of [["Employees",totals.employees],["Simulated gross",money(totals.grossCents)],["Commission earnings",money(state.lines.reduce((n,l)=>n+(l.commissionCents||0),0))],["Simulated net",money(totals.netCents)]]){
  const el=mk("div","metric");el.append(mk("div","metric-label",title),mk("strong","",amount));box.append(el);
 }
 const wrap=$("runLines");wrap.replaceChildren();
 if(!state.lines.length)wrap.append(mk("p","muted","No pay lines yet. Generate a preview while this run is in draft."));
 else{
  const table=mk("table"),head=mk("thead"),hrow=mk("tr");
  for(const label of ["Employee","Regular","Overtime","Bonus","Commission","Deductions","Gross","Net","Adjust"] )hrow.append(mk("th","",label));
  head.append(hrow);table.append(head);
  const tbody=mk("tbody");
  for(const line of state.lines){
   const row=mk("tr");
   for(const v of [line.employeeName,money(line.regularCents),money(line.overtimeCents),money(line.bonusCents),money(line.commissionCents||0),
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
     const gross=line.regularCents+line.overtimeCents+extra+(line.commissionCents||0);
     if(less>gross)throw Error("Deduction exceeds gross");
     const {id:omit,...payload}=line;
     await setDoc(doc(db,"tenants",state.tenantId,"payrollRuns",run.id,"lines",line.employeeId),
       {...payload,bonusCents:extra,deductionCents:less,grossCents:gross,netCents:gross-less});
     await selectRun(run.id);toast("Draft adjustment saved.");
    },"small"));
    if(state.platformOwner)cell.append(button("Delete line",async()=>{
     if(!await confirmAction("Delete draft pay line","Remove the fictional pay line for "+line.employeeName+" from this draft?"))return;
     const currentTenant=state.tenantId;
     const batch=writeBatch(db);
     batch.delete(doc(db,"tenants",currentTenant,"payrollRuns",run.id,"lines",line.employeeId));
     auditClient(batch,"payroll","draft-line-delete",line.employeeId,run.periodStart+" — "+run.periodEnd);
     await batch.commit();
     if(state.tenantId===currentTenant)await selectRun(run.id);
     toast("Draft pay line deleted; finalized pay history was not modified.");
    },"small danger"));
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
 if(!canPayroll()||!phase3)throw Error("Payroll permissions or Phase 3 module unavailable");
 const tenantId=state.tenantId,actor=state.user?.uid;
 const {preview,policy,employees}=await phase3.buildPreview(run);
 if(preview.issues.length)throw Error("Resolve "+preview.issues.length+" time and payroll exceptions before generating");
 let commission;
 try{
  commission=await prepareRunCommissions(db,tenantId,run,preview.lines,employees);
 }catch(error){
  throw Error("Commission preparation failed ("+(error?.code||error?.message||error)+"). Check the company commission permissions; payroll lines were not changed.");
 }
 const lines=commission.lines;
 preview.lines=lines;
 preview.totals=summarizeLines(lines);
 if(!lines.length)throw Error("No approved simulated earnings for this period");
 if(lines.length>250)throw Error("Draft exceeds 250-employee safety limit");
 if(!await confirmAction("Generate payroll preview","Generate "+lines.length+" reviewed pay lines with "+money(preview.totals.grossCents)+" fictional gross pay (including "+money(commission.commissionCents)+" commissions)? Existing draft lines will be replaced."))return;
 if(commission.notice)toast(commission.notice,true);
 const stillAuthorized=()=>tenantId===state.tenantId&&run.id===state.selectedRun&&
  state.user?.uid===actor&&canPayroll();
 if(!stillAuthorized())throw Error("Company, account or payroll selection changed during preparation. Reopen the run and retry.");
 const runSnapshot=await getDoc(doc(db,"tenants",tenantId,"payrollRuns",run.id));
 if(!runSnapshot.exists()||runSnapshot.data().status!=="draft"||
  runSnapshot.data().periodStart!==run.periodStart||runSnapshot.data().periodEnd!==run.periodEnd)
  throw Error("The payroll draft changed while it was being prepared. Reopen the run and retry.");
 const base=collection(db,"tenants",tenantId,"payrollRuns",run.id,"lines");
 const oldSnapshot=await getDocs(query(base,limit(251)));
 if(oldSnapshot.size>250)throw Error("Existing lines exceed safe batch limit");
 const groups=planPayrollDraftWrites({
  lines,existingIds:oldSnapshot.docs.map(d=>d.id),
  claims:commission.claim,releases:commission.release
 });
 const writeCount=groups.reduce((n,group)=>n+group.length,0);
 if(writeCount>440)throw Error("This period needs more than 440 draft changes. Split the period before calculating.");
 const sales=new Map([...commission.claim,...commission.release].map(s=>[s.id,s]));
 const statusNode=$("p3RunReview");
 let saved=0;
 // Firestore evaluates a shared 20 document-access budget for every atomic
 // write batch. Each new pay line checks its own employee document. Never
 // submit an entire 22+ employee company in a single batch.
 for(let i=0;i<groups.length;i++){
  if(!stillAuthorized())throw Error(saved+" changes saved, but the company, account or selected run changed. Reopen this draft before continuing.");
  const batch=writeBatch(db);
  for(const entry of groups[i]){
   if(entry.type==="line")batch.set(doc(base,entry.employeeId),entry.line);
   else if(entry.type==="delete")batch.delete(doc(base,entry.employeeId));
   else{
    const sale=sales.get(entry.saleId);
    if(!sale?.ref)throw Error("An expected commission sale is unavailable; no further changes have been made.");
    batch.update(sale.ref,{paidRunId:entry.type==="claim"?run.id:""});
   }
  }
  try{await batch.commit()}
  catch(error){
   const reason=error?.code||error?.message||error;
   statusNode.textContent="Generation stopped after "+saved+" of "+writeCount+" draft changes. The run remains a draft; retry generation to reconcile it.";
   throw Error("Saving payroll records (batch "+(i+1)+"/"+groups.length+") failed: "+reason+". "+
    (saved?"Earlier batches were saved; retry generation to finish this draft.":"No pay lines were saved by this attempt."));
  }
  saved+=groups[i].length;
  if(stillAuthorized())statusNode.textContent="Saving verified payroll lines… "+saved+" / "+writeCount+" changes";
 }
 try{
  if(!stillAuthorized())throw Error("Company or account changed after saving.");
  const audit=writeBatch(db);
  auditClient(audit,"payroll","payroll-generate",run.id,lines.length+" reviewed fictional lines");
  await audit.commit();
  await phase3.saveSnapshot(run,{preview,policy});
 }catch(error){
  statusNode.textContent="Pay lines were saved, but the generation record could not be completed. Retry the draft generation.";
  throw Error("Payroll lines saved, but audit/snapshot could not complete ("+(error?.code||error?.message||error)+"). Retry generation before submitting.");
 }
 await selectRun(run.id);
 toast("Reviewed fictional payroll lines generated with a versioned snapshot.");
}
async function moveRun(run,next){
 if(!canTransition(run.status,next,state.user.uid,run,state.role,state.platform))throw Error("Your role or approval separation prevents this transition");
 if(next==="submitted"&&!state.lines.length)throw Error("Generate pay lines before submitting");
 const fields={status:next};
 if(next==="submitted")fields.submittedBy=state.user.uid;
 if(next==="approved"||next==="rejected")fields.approvedBy=state.user.uid;
 if(next==="finalized")fields.finalizedBy=state.user.uid;
 if(next==="draft"){fields.submittedBy="";fields.approvedBy="";}
 if(!await confirmAction("Confirm payroll status","Change this fictional payroll run to "+next+"?"))return;
 const auditBatch=writeBatch(db);
 auditBatch.update(doc(db,"tenants",state.tenantId,"payrollRuns",run.id),fields);
 auditClient(auditBatch,"payroll","payroll-status",run.id,run.status+" → "+next);
 await auditBatch.commit();
 await refreshCompany();await selectRun(run.id);
 toast("Payroll run marked "+next+".");
}
$("inviteForm").addEventListener("submit",async event=>{
 event.preventDefault();if(!state.platformWrite||!state.tenantId)return;
 const email=cleanEmail($("inviteEmail").value),role=$("inviteRole").value;
 if(!email||!["client_admin","payroll_specialist","viewer"].includes(role))return;
 try{
  const invitation=doc(db,"tenants",state.tenantId,"invites",email);
  const existing=await getDoc(invitation);
  if(existing.exists())await updateDoc(invitation,{role});
  else await setDoc(invitation,{email,role,createdAt:serverTimestamp(),createdBy:state.user.uid});
  const link=location.origin+location.pathname+"#join="+encodeURIComponent(state.tenantId);
  $("inviteShare").classList.remove("hidden");
  $("inviteShare").replaceChildren(mk("strong","","Invitation saved"),mk("small","","Send the invitee this company link: "+link));
  $("inviteForm").reset();await renderAccess();toast("Invitation created. Share the company link with the invitee.");
 }catch(e){fail(e,"Invitation creation failed")}
});
async function renderAccess(){
 if(!state.tenantId||!canAdmin())return;
 const team=$("teamList"),invites=$("inviteList");team.replaceChildren();invites.replaceChildren();
 $("inviteForm").classList.add("hidden");
 $("inviteShare").classList.toggle("hidden",!state.tenantId);
 $("inviteShare").replaceChildren(mk("strong","","Sterling-managed access"),
  mk("small","",state.platformWrite?
   "Grant or suspend company membership from Staff & Accounts. Client roles do not grant access.":
   "Your team list is read-only. Open a Client Services support case to request new accounts, role changes, or employee identity linking."));
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
const sterlingModals=createSterlingModals();
const creationDialogs=[
 ["clientForm","Add a client","CLIENT DIRECTORY"],
 ["employeeForm","Add employee","EMPLOYEE DIRECTORY"],
 ["timeForm","Record time","TIMEKEEPING REGISTER"],
 ["runForm","Create payroll","PAYROLL REGISTER"]
].map(([formId,label,summary])=>compactForm({formId,label,summary}));
const timecardUI=mountTimecardImport({db,getState:()=>state,notify:toast,confirmAction,
 refreshCompany:async()=>{await refreshCompany();await phase3?.refresh();}});

async function confirmAction(title,message,options={}){
 return sterlingModals.confirm({title,message,...options});
}
let phase2=null,phase2Pending=null,phase3=null,phase4=null,phase5=null,phase6=null,commissionsUI=null,ownerUI=null,staffUI=null;
const ownerActions=createOwnerRecordActions({db,getState:()=>state,notify:toast,confirmAction,requestDeletion:sterlingModals.deleteRecord,
 onChanged:async kind=>{
  if(kind==="tenants"){
   state.tenantId="";state.role="";state.employees=[];state.time=[];state.runs=[];
   await loadTenantDirectory();go("clients");return;
  }
  if(kind==="members"||kind==="employeeLinks")await loadTenantDirectory();
  if(["commissionSales","commissionPlans"].includes(kind))await commissionsUI?.refresh();
  if(["billingInvoices","supportTickets"].includes(kind))await phase5?.refresh?.();
  else await refreshCompany();
 }
});
async function initializePhase2(){
 if(phase2)return phase2;
 if(!phase2Pending){
  phase2Pending=mountPhase2({
   db,getState:()=>state,refreshCompany,loadTenantDirectory,
   notify:toast,confirmAction
  }).then(x=>(phase2=x,x)).catch(error=>{phase2Pending=null;throw error});
 }
 return phase2Pending;
}
onAuthStateChanged(auth,async user=>{
 phase4?.clear();commissionsUI?.clear();timecardUI?.clear();
 state.user=user;state.tenantId="";state.platform=false;state.tenants=[];state.role="";state.platformOwner=false;state.platformWrite=false;state.platformRole="client";
 $("authScreen").classList.toggle("hidden",!!user);$("shell").classList.toggle("hidden",!user);
 if(!user)return;
 $("signedInName").textContent=user.email||"Payroll Account";
 $("avatar").textContent=(user.email||"SP").slice(0,2).toUpperCase();
 try{
  const grant=await getDoc(doc(db,"platformAdmins",user.uid));
  state.platformOwner=grant.exists()&&grant.data()?.active===true;
  const staffGrant=await getDoc(doc(db,"platformStaff",user.uid));
  state.platformRole=state.platformOwner?"owner":staffGrant.exists()&&staffGrant.data()?.active===true?staffGrant.data().role:"client";
  state.platformWrite=state.platformOwner||state.platformRole==="administrator";
  state.platform=state.platformWrite||["payroll_operator","support"].includes(state.platformRole);
  const accountRef=doc(db,"accounts",user.uid);
  if(!(await getDoc(accountRef)).exists())await setDoc(accountRef,{email:user.email||"",displayName:user.displayName||"",accountType:"client",createdAt:serverTimestamp()});
  await loadTenantDirectory();
  await initializePhase2();
  if(!staffUI)staffUI=mountStaffAccounts({db,getState:()=>state,notify:toast,confirmAction});
  if(!phase3)phase3=await mountPhase3({db,getState:()=>state,refreshCompany,notify:toast,confirmAction,ownerDelete:(kind,record)=>ownerActions.remove(kind,record),openOwnerReview});
  if(!phase4){
   try{const {mountPhase4}=await import("./phase4.js?v=sterling-commissions-20261015");phase4=await mountPhase4({db,getState:()=>state,notify:toast,confirmAction,ownerDelete:(kind,record)=>ownerActions.remove(kind,record)})}
   catch(error){console.error("Employee portal module unavailable",error);toast("Employee portal assets are still deploying. Please refresh after GitHub Pages finishes.",true)}
  }
  if(!phase5){
   try{const {mountPhase5}=await import("./phase5.js?v=sterling-governance-20261018");phase5=await mountPhase5({db,getState:()=>state,notify:toast,confirmAction,ownerDelete:(kind,record)=>ownerActions.remove(kind,record)})}
   catch(error){console.error("Client services module unavailable",error);toast("Client services are not yet available; check the deployment.",true)}
  }
  if(!commissionsUI){
   try{
    const {mountCommissions}=await import("./commissions.js?v=sterling-commissions-v1");
    commissionsUI=await mountCommissions({db,getState:()=>state,notify:toast,confirmAction,
     ownerDelete:(kind,record)=>ownerActions.remove(kind,record)});
   }catch(error){console.error("Commission module unavailable",error);toast("Commission tools are not available; check GitHub Pages deployment.",true)}
  }
  if(!phase6){
   try{const {mountPhase6}=await import("./phase6.js?v=phase6-final");phase6=await mountPhase6({db,getState:()=>state,notify:toast,confirmAction})}
   catch(error){console.error("Assurance module unavailable",error);toast("Assurance tools are not yet deployed.",true)}
  }
  if(state.platformOwner&&!ownerUI){
   try{const {mountOwnerControls}=await import("./owner.js?v=sterling-commissions-20261015");ownerUI=mountOwnerControls({db,getState:()=>state,notify:toast,confirmAction,requestDeletion:sterlingModals.deleteRecord,refreshCompany})}
   catch(error){console.error("Owner control module unavailable",error);toast("Record management tools are not yet deployed.",true)}
  }
  if(state.platformOwner)await staffUI?.refresh();
  if(state.tenantId&&state.role!=="employee"){await phase3?.refresh();await phase5?.refresh();if(state.page==="commissions")await commissionsUI?.refresh()}
  go(state.role==="employee"?"employeePortal":"dashboard");
  if(!state.platform&&!state.tenants.length)toast("Client account ready. Sterling can assign you access to a company.");
 }catch(e){fail(e,"Workspace authorization failed");go("dashboard")}
});
