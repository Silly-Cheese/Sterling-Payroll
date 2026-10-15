import {collection,doc,getDocs,getDoc,setDoc,updateDoc,writeBatch,serverTimestamp,query,limit} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {buildPortalTabs} from "./workspace-ui.js";
const ROLES=[["administrator","Administrator"],["payroll_operator","Payroll operator"],["support","Support (read only)"]];
const CLIENT_ROLES=[["client_admin","Client administrator"],["payroll_specialist","Payroll specialist"],["viewer","Viewer"],["employee","Employee portal"]];
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const fill=(select,values)=>select.replaceChildren(...values.map(v=>{const e=make("option",v[1]);e.value=v[0];return e}));
export function mountStaffAccounts({db,getState,notify,confirmAction}){
 const root=document.getElementById("staffAccounts");if(!root)return null;
 root.innerHTML='<div class="ops-grid"><article class="panel" id="staffPermissionsPanel"><div class="eyebrow">STERLING HEADQUARTERS</div><h2>Staff permissions</h2><p class="muted">Accounts begin as clients. Only the owner can assign Sterling-wide staff access.</p><label>Registered account<select id="staffAccount"></select></label><label>Staff permission<select id="staffRole"></select></label><div class="actions"><button class="btn primary" id="staffGrant">Assign staff</button><button class="btn danger" id="staffRevoke">Revoke staff</button></div><h3>Existing staff</h3><div id="staffCurrent" class="list"></div></article><article class="panel" id="staffClientAccessPanel"><div class="eyebrow">CLIENT ACCESS</div><h2>Assign company membership</h2><p class="muted">Choose the registered account and client company. No email verification, invitation link, or UID entry.</p><label>Registered account<select id="clientAccount"></select></label><label>Company<select id="clientCompany"></select></label><label>Company role<select id="clientRole"></select></label><div class="actions"><button class="btn primary" id="clientAssign">Grant company access</button><button class="btn danger" id="clientSuspend">Suspend access</button></div><p class="fine-print">Roles are enforced in Firestore, not merely hidden in the interface.</p></article></div>';
 const $=id=>root.querySelector("#"+id);
 let accounts=[],staff=[];
 fill($("staffRole"),ROLES);fill($("clientRole"),CLIENT_ROLES);
 function owner(){if(!getState().platformOwner)throw Error("Only the existing owner can assign permissions")}
 function selected(id){return accounts.find(x=>x.id===$(id).value)}
 async function refresh(){
  if(!getState().platformOwner)return;
  const [a,b]=await Promise.all([getDocs(query(collection(db,"accounts"),limit(250))),getDocs(query(collection(db,"platformStaff"),limit(250)))]);
  accounts=a.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>String(x.email).localeCompare(String(y.email)));
  staff=b.docs.map(d=>({id:d.id,...d.data()}));
  for(const id of ["staffAccount","clientAccount"]){
   const old=$(id).value;
   fill($(id),[["","Choose account"],...accounts.map(x=>[x.id,(x.displayName?x.displayName+" — ":"")+x.email+" ("+x.id.slice(0,6)+")"])]);
   $(id).value=accounts.some(x=>x.id===old)?old:"";
  }
  const old=$("clientCompany").value;
  fill($("clientCompany"),[["","Choose company"],...getState().tenants.map(t=>[t.id,t.name])]);
  $("clientCompany").value=getState().tenants.some(t=>t.id===old)?old:"";
  const list=$("staffCurrent");list.replaceChildren();
  for(const member of staff){
   const account=accounts.find(a=>a.id===member.id),row=make("article",undefined,"list-item"),copy=make("div");
   copy.append(make("strong",account?.email||"Registered account"),make("small",member.role+" / "+(member.active?"Active":"Suspended")));
   row.append(copy);list.append(row);
  }
  if(!staff.length)list.textContent="No Sterling staff assigned yet.";
 }
 async function run(fn){try{owner();await fn()}catch(error){notify("Permissions change failed: "+(error.code||error.message),true)}}
 $("staffGrant").onclick=()=>run(async()=>{
  const a=selected("staffAccount"),role=$("staffRole").value;
  if(!a||!ROLES.some(v=>v[0]===role))throw Error("Choose an account and permission");
  if(!await confirmAction("Grant Sterling staff","Grant "+role+" access to "+a.email+"?"))return;
  const ref=doc(db,"platformStaff",a.id),old=staff.find(x=>x.id===a.id);
  if(old)await updateDoc(ref,{role,active:true,updatedAt:serverTimestamp()});
  else await setDoc(ref,{role,active:true,grantedBy:getState().user.uid,updatedAt:serverTimestamp()});
  notify("Staff permissions saved.");await refresh();
 });
 $("staffRevoke").onclick=()=>run(async()=>{
  const a=selected("staffAccount");if(!a||!staff.some(x=>x.id===a.id))throw Error("Choose an existing staff member");
  if(!await confirmAction("Remove Sterling staff","Remove staff permissions for "+a.email+"?"))return;
  await updateDoc(doc(db,"platformStaff",a.id),{active:false,updatedAt:serverTimestamp()});
  notify("Staff permissions revoked.");await refresh();
 });
 $("clientAssign").onclick=()=>run(async()=>{
  const a=selected("clientAccount"),t=$("clientCompany").value,role=$("clientRole").value;
  if(!a||!getState().tenants.some(x=>x.id===t)||!CLIENT_ROLES.some(v=>v[0]===role))throw Error("Choose an account, company and role");
  if(!await confirmAction("Assign company access","Grant "+a.email+" "+role+" access to this company?"))return;
  const ref=doc(db,"tenants",t,"members",a.id),existing=await getDoc(ref);
  if(existing.exists())await updateDoc(ref,{role,status:"active"});
  else{
   const batch=writeBatch(db);
   batch.set(ref,{email:a.email,role,status:"active",joinedAt:serverTimestamp()});
   batch.set(doc(db,"userTenants",a.id,"items",t),{tenantId:t,joinedAt:serverTimestamp()});
   await batch.commit();
  }
  notify("Client membership assigned.");
 });
 $("clientSuspend").onclick=()=>run(async()=>{
  const a=selected("clientAccount"),t=$("clientCompany").value;
  if(!a||!t)throw Error("Choose account and company");
  const ref=doc(db,"tenants",t,"members",a.id);
  if(!(await getDoc(ref)).exists())throw Error("No membership found");
  if(!await confirmAction("Suspend client membership","Suspend this company access?"))return;
  await updateDoc(ref,{status:"suspended"});notify("Client access suspended.");
 });
 buildPortalTabs(root,[["staffPermissionsPanel","Sterling staff"],["staffClientAccessPanel","Company access"]]);
 return {refresh};
}