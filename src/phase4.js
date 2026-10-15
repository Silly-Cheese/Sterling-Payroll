import {collection,doc,getDoc,getDocs,addDoc,setDoc,query,where,orderBy,limit,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {paystubHtml,validatePreferences,recentFinalized} from "./phase4-core.js";
import {money} from "./payroll-core.js";
const E=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n};
const option=(value,text)=>{const o=E("option","",text);o.value=value;return o};
const card=(title,detail)=>{const node=E("article","list-item"),body=E("div");body.append(E("strong","",title),E("small","",detail));node.append(body);return node};
export async function mountPhase4({db,getState,notify,confirmAction}){
 const response=await fetch("./phase4.html");
 if(!response.ok)throw Error("Phase 4 employee portal template unavailable");
 const root=document.getElementById("employeePortal");
 root.innerHTML=await response.text();
 const $=id=>root.querySelector("#"+id),S=()=>getState();
 let generation=0,ownLink=null,ownEmployee=null,threadUid="",tenant="",runs=[];
 const company=()=>S().tenants.find(t=>t.id===S().tenantId)?.name||"Client company";
 const admin=()=>S().platformWrite||S().role==="client_admin";
 const isEmployee=()=>S().role==="employee";
 const linked=()=>Boolean(ownLink&&ownEmployee);
 const path=(...parts)=>doc(db,"tenants",S().tenantId,...parts);
 const coll=(...parts)=>collection(db,"tenants",S().tenantId,...parts);
 const failed=(label,error)=>{console.error(label,error);notify(label+": "+(error.code||error.message||error),true)};
 function show(container,message){container.replaceChildren(E("p","muted",message))}
 async function fetchThread(uid,version){
  const box=$("p4Messages");
  if(!uid){show(box,"Select a linked employee conversation.");return}
  const snap=await getDocs(query(coll("employeeConversations",uid,"messages"),orderBy("sentAt","desc"),limit(80)));
  if(version!==generation)return;
  box.replaceChildren();
  for(const d of snap.docs.map(x=>x.data()).reverse()){
   const msg=E("div","p4-bubble "+(d.authorUid===S().user.uid?"mine":""));
   msg.append(E("small","",d.authorRole==="employer"?"Company administration":"Employee"),E("p","",d.body));
   box.append(msg);
  }
  if(snap.empty)show(box,"No messages in this conversation yet.");
  box.scrollTop=box.scrollHeight;
 }
 async function fetchAnnouncements(version){
  const snap=await getDocs(query(coll("announcements"),orderBy("createdAt","desc"),limit(30)));
  if(version!==generation)return;
  const box=$("p4Announcements");box.replaceChildren();
  for(const d of snap.docs){
   const message=d.data(),row=card(message.title,message.body);
   row.classList.add("p4-announcement");
   box.append(row);
  }
  if(snap.empty)show(box,"No company announcements yet.");
 }
 async function fetchHistory(version){
  if(!linked())return;
  const snap=await getDocs(query(coll("payrollRuns"),where("status","==","finalized"),limit(50)));
  if(version!==generation)return;
  const complete=recentFinalized(snap.docs.map(d=>({id:d.id,...d.data()})));
  const myId=ownLink.employeeId,paid=[];
  for(const run of complete){
   if(version!==generation)return;
   const line=await getDoc(path("payrollRuns",run.id,"lines",myId));
   if(line.exists())paid.push({run,line:line.data()});
  }
  if(version!==generation)return;
  runs=paid;
  const box=$("p4PayHistory");box.replaceChildren();
  for(const {run,line} of paid){
   const node=card(run.periodStart+" — "+run.periodEnd,"Simulated net "+money(line.netCents)+" • Fictional payday "+run.payDate);
   const control=E("div","item-actions"),download=E("button","btn small","Print paystub");
   download.type="button";
   download.addEventListener("click",()=>{
    try{
     const html=paystubHtml(company(),run,line);
     const blob=new Blob([html],{type:"text/html;charset=utf-8"}),url=URL.createObjectURL(blob);
     const a=document.createElement("a");a.href=url;a.download="Sterling-SIMULATED-Paystub-"+run.periodEnd+".html";
     document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
    }catch(error){failed("Paystub creation failed",error)}
   });
   control.append(download);node.append(control);box.append(node);
  }
  if(!paid.length)show(box,"No finalized simulated pay statements for your linked record yet.");
  const metricBox=$("p4Metrics");metricBox.replaceChildren();
  const recent=paid[0]?.line.netCents,aggregate=paid.reduce((sum,p)=>sum+p.line.netCents,0);
  for(const [label,value] of [["Finalized statements",paid.length],["Latest fictional net",recent===undefined?"—":money(recent)],["History fictional net",money(aggregate)]]){
   const panel=E("div","metric");panel.append(E("div","metric-label",label),E("strong","",value));metricBox.append(panel);
  }
  if(snap.size===50)box.append(E("p","fine-print","Only the first 50 finalized runs were checked; additional history pagination is planned."));
 }
 async function fetchRequests(uid,version){
  const box=$("p4Requests");box.replaceChildren();
  $("p4RequestCreate").classList.toggle("hidden",!admin()||!uid);
  if(!uid){show(box,admin()?"Choose a linked employee above to manage requests.":"Your employer can assign fictional acknowledgment requests after linking.");$("p4RequestBadge").textContent="NO REQUESTS";return}
  const snap=await getDocs(query(coll("employeeRequests",uid,"items"),orderBy("createdAt","desc"),limit(60)));
  if(version!==generation)return;
  const requests=snap.docs.map(d=>({id:d.id,...d.data()}));
  const pending=requests.filter(x=>x.status==="pending").length;
  $("p4RequestBadge").textContent=pending+" NEEDS ATTENTION";
  if(!admin()&&pending>0&&$("p4Notify").checked)$("p4Notice").textContent="You have "+pending+" open self-service request"+(pending===1?"":"s")+". Review the items below. No sensitive uploads are required.";
  for(const item of requests){
   const container=E("div","list-item"),info=E("div");
   info.append(E("strong","",item.title),E("small","",item.instructions+" • "+item.status+(item.dueDate?" • Due "+item.dueDate:"")));
   if(item.response)info.append(E("small","", "Response: "+item.response));
   container.append(info);
   const controls=E("div","item-actions");
   if(!admin()&&item.status==="pending"){
    const input=E("textarea");input.maxLength=500;input.rows=2;input.placeholder="Optional acknowledgment or note";
    input.setAttribute("aria-label","Response for "+item.title);
    const btn=E("button","btn small","Submit response");btn.type="button";
    btn.onclick=async()=>{
     btn.disabled=true;
     try{
      await updateDoc(path("employeeRequests",uid,"items",item.id),{status:"submitted",response:input.value.trim(),updatedAt:serverTimestamp()});
      notify("Request response submitted.");await fetchRequests(uid,generation);
     }catch(error){failed("Request response failed",error)}finally{btn.disabled=false}
    };
    controls.append(input,btn);
   }
   if(admin()&&item.status==="submitted"){
    for(const [label,next] of [["Complete","completed"],["Reopen","pending"]]){
     const btn=E("button","btn small",label);btn.type="button";
     btn.onclick=async()=>{
      btn.disabled=true;
      try{
       await updateDoc(path("employeeRequests",uid,"items",item.id),{status:next,updatedAt:serverTimestamp()});
       notify("Request marked "+next+".");await fetchRequests(uid,generation);
      }catch(error){failed("Request review failed",error)}finally{btn.disabled=false}
     };
     controls.append(btn);
    }
   }
   if(controls.children.length)container.append(controls);
   box.append(container);
  }
  if(snap.empty)show(box,"No requests have been assigned yet.");
  if(snap.size===60)box.append(E("p","fine-print","The first 60 requests are shown; full pagination is planned."));
 }
 async function refresh(){
  const version=++generation,workspace=S().tenantId;
  ownEmployee=null;ownLink=null;threadUid="";runs=[];tenant=workspace;
  $("p4Metrics").replaceChildren();
  for(const key of ["p4PayHistory","p4Announcements","p4Messages","p4Requests"])$(key).replaceChildren();
  $("p4ProfileForm").classList.add("hidden");
  $("p4MessageForm").classList.add("hidden");
  $("p4RequestCreate").classList.add("hidden");
  $("p4RequestBadge").textContent="NO PENDING ITEMS";
  $("p4AnnouncementForm").classList.toggle("hidden",!admin());
  $("p4ThreadSelectorWrap").classList.toggle("hidden",!admin());
  $("p4AccessChip").textContent="LINK REQUIRED";
  $("p4Notice").textContent="Checking current company access…";
  if(!workspace)return;
  try{
   const adminNow=admin(),userUid=S().user.uid;
   if(isEmployee()||adminNow){
    const link=await getDoc(path("employeeLinks",userUid));
    if(version!==generation)return;
    if(link.exists()){
     ownLink=link.data();const employee=await getDoc(path("employees",ownLink.employeeId));
     if(version!==generation)return;
     if(employee.exists())ownEmployee={id:employee.id,...employee.data()};
    }
   }
   if(version!==generation)return;
   if(linked()){
    $("p4AccessChip").textContent="EMPLOYEE LINKED";
    $("p4Notice").textContent="Your employee identity is linked by your employer. Only your own finalized simulated payroll statements are available here.";
    $("p4EmployeeSummary").textContent=ownEmployee.displayName+" • "+(ownEmployee.jobTitle||"Employee")+" • "+company()+" • "+(ownEmployee.status||"Unknown status");
    $("p4ProfileForm").classList.remove("hidden");
    const prefs=await getDoc(path("employeePreferences",S().user.uid));
    if(version!==generation)return;
    $("p4PreferredName").value=prefs.exists()?prefs.data().preferredName||"":"";
    $("p4Notify").checked=prefs.exists()?prefs.data().notifications!==false:true;
    await fetchHistory(version);
   }else{
    $("p4EmployeeSummary").textContent=adminNow?"Company communication administration":"Ask your employer to link your registered account to your HR employee record.";
    $("p4Notice").textContent=adminNow?"You can publish announcements and reply to employees. Personal pay history requires your own linked employee account.":"Your company account exists, but an authorized administrator must link it to your employee record before private pay history becomes available.";
    show($("p4PayHistory"),"Pay history is available after employer-approved linking.");
   }
   if(adminNow||linked())await fetchAnnouncements(version);
   else show($("p4Announcements"),"Announcements appear after your employee identity is linked.");
   if(adminNow){
    const [links,members]=await Promise.all([
     getDocs(query(coll("employeeLinks"),limit(150))),getDocs(query(coll("members"),limit(200)))
    ]);
    if(version!==generation)return;
    const names=new Map(members.docs.map(d=>[d.id,d.data().email||"Employee account"]));
    $("p4ThreadSelector").replaceChildren(option("","Choose employee conversation"),
      ...links.docs.map(d=>option(d.id,names.get(d.id)||"Employee account")).sort((a,b)=>a.text.localeCompare(b.text)));
    threadUid=$("p4ThreadSelector").value||"";
   }else if(linked())threadUid=S().user.uid;
   $("p4MessageForm").classList.toggle("hidden",!threadUid);
   if(threadUid)await fetchThread(threadUid,version);else show($("p4Messages"),adminNow?"Choose a linked employee above.":"Messaging becomes available after employer linking.");
   await fetchRequests(threadUid,version);
  }catch(error){
   if(version!==generation)return;
   ownLink=null;ownEmployee=null;threadUid="";
   $("p4MessageForm").classList.add("hidden");
   $("p4RequestCreate").classList.add("hidden");
   $("p4ProfileForm").classList.add("hidden");
   $("p4AccessChip").textContent="UNAVAILABLE";
   $("p4Notice").textContent="Private portal data could not be loaded. Previous company information has been cleared.";
   failed("Employee portal unavailable",error);
  }
 }
 $("p4ThreadSelector").addEventListener("change",async()=>{
  const version=++generation;threadUid=$("p4ThreadSelector").value;
  $("p4MessageForm").classList.toggle("hidden",!threadUid);
  try{await Promise.all([fetchThread(threadUid,version),fetchRequests(threadUid,version)])}catch(error){failed("Conversation/request load failed",error)}
 });
 $("p4ProfileForm").addEventListener("submit",async event=>{
  event.preventDefault();
  try{
   if(!linked())throw Error("Employee link required");
   const data=validatePreferences({preferredName:$("p4PreferredName").value,notifications:$("p4Notify").checked});
   await setDoc(path("employeePreferences",S().user.uid),{...data,updatedAt:serverTimestamp()});
   notify("Employee preferences saved. Payroll identity remains employer controlled.");
  }catch(error){failed("Preferences update failed",error)}
 });
 $("p4AnnouncementForm").addEventListener("submit",async event=>{
  event.preventDefault();
  try{
   if(!admin())throw Error("Client administrator required");
   const title=$("p4AnnouncementTitle").value.trim(),body=$("p4AnnouncementBody").value.trim();
   if(!title||title.length>100||!body||body.length>1800)throw Error("Enter a title and message");
   if(!await confirmAction("Publish company announcement","Publish this message to all linked employees at "+company()+"?"))return;
   await addDoc(coll("announcements"),{title,body,createdAt:serverTimestamp(),createdBy:S().user.uid});
   $("p4AnnouncementForm").reset();notify("Announcement published.");await fetchAnnouncements(generation);
  }catch(error){failed("Announcement failed",error)}
 });
 $("p4RequestCreate").addEventListener("submit",async event=>{
  event.preventDefault();
  try{
   if(!admin()||!threadUid)throw Error("Choose an approved employee account");
   const title=$("p4RequestTitle").value.trim(),instructions=$("p4RequestInstructions").value.trim(),dueDate=$("p4RequestDue").value||"";
   if(!title||title.length>100||!instructions||instructions.length>800)throw Error("Enter a valid title and instructions");
   if(dueDate&&!/^\d{4}-\d\d-\d\d$/.test(dueDate))throw Error("Invalid due date");
   if(!await confirmAction("Assign fictional request","Assign this acknowledgment request to the selected employee account?"))return;
   await addDoc(coll("employeeRequests",threadUid,"items"),{
    title,instructions,dueDate,status:"pending",createdBy:S().user.uid,createdAt:serverTimestamp(),response:"",updatedAt:serverTimestamp()
   });
   $("p4RequestCreate").reset();notify("Employee request assigned.");await fetchRequests(threadUid,generation);
  }catch(error){failed("Request assignment failed",error)}
 });
 $("p4MessageForm").addEventListener("submit",async event=>{
  event.preventDefault();
  try{
   const uid=threadUid,content=$("p4MessageBody").value.trim();
   if(!uid||!content||content.length>1800)throw Error("Select a linked employee and enter a message");
   const side=admin()?"employer":"employee";
   await addDoc(coll("employeeConversations",uid,"messages"),{body:content,authorUid:S().user.uid,authorRole:side,sentAt:serverTimestamp()});
   $("p4MessageForm").reset();await fetchThread(uid,generation);notify("Private message sent.");
  }catch(error){failed("Message could not be sent",error)}
 });
 return {refresh};
}