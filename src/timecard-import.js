import {collection,doc,getDoc,getDocs,query,where,limit,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {parseTimecardCsv,matchTimecards,importDocumentId,timecardCsvTemplate,groupTimecards} from "./timecard-import-core.js";

export function mountTimecardImport({db,getState,notify,confirmAction,refreshCompany}){
 const S=()=>getState(),canImport=()=>Boolean(S().platformWrite||S().platformRole==="payroll_operator"||["client_admin","payroll_specialist"].includes(S().role));
 const register=document.getElementById("timeList");if(!register)throw Error("Timekeeping register not found.");
 const launch=document.createElement("button");launch.type="button";launch.className="btn primary timecard-import-launch";launch.textContent="Import timecards";
 const panel=register.closest(".panel"),actions=panel?.querySelector(".timekeeping-register-head");
 if(actions)actions.append(launch);
 else {
  const heading=panel?.querySelector("h2");
  if(heading)heading.after(launch);else register.before(launch);
 }
 const dialog=document.createElement("dialog");dialog.className="workspace-form-dialog timecard-import-dialog";
 dialog.innerHTML=[
 '<header><h2>Import employee timecards</h2><button type="button" id="tiClose" class="workspace-form-close" aria-label="Close import">✕</button></header>',
 '<div class="timecard-import-body"><p class="muted">Import CSV timecards for this fictional client company. Match automatically by employee name and optional department; all imported entries start as <strong>Pending</strong> and must be reviewed.</p>',
 '<div class="timecard-import-fields"><label>Choose CSV<input id="tiFile" type="file" accept=".csv,text/csv"></label>',
 '<button type="button" class="btn" id="tiTemplate">Download CSV template</button></div>',
 '<p class="fine-print">Required: employeeName, workDate, regularHours, overtimeHours. Optional: department and note. No employee IDs needed. Dates: YYYY-MM-DD or MM/DD/YYYY. Maximum 100 rows per import. Existing employee/date entries are skipped.</p>',
 '<div class="actions"><button type="button" class="btn" id="tiPreview">Review CSV</button><button type="button" class="btn primary" id="tiCommit" disabled>Import valid timecards</button></div>',
 '<p role="status" id="tiStatus" class="notice">Choose a CSV file to begin.</p><div id="tiRows" class="timecard-import-preview"></div></div>'
 ].join("");
 document.body.append(dialog);
 const $=id=>dialog.querySelector("#"+id),tenant=()=>S().tenantId;
 let raw=null,reviewed=[],previewTenant="",busy=false,version=0;
 function clear(){++version;raw=null;reviewed=[];previewTenant="";$("tiCommit").disabled=true;$("tiRows").replaceChildren();$("tiStatus").textContent="Choose a CSV file to begin.";$("tiFile").value="";if(dialog.open)dialog.close()}
 function sync(){const allowed=canImport()&&Boolean(tenant())&&S().role!=="employee";launch.classList.toggle("hidden",!allowed);if(!allowed&&dialog.open)clear()}
 const field=(tag,text)=>{const n=document.createElement(tag);n.textContent=String(text??"");return n};
 function display(rows){
  const container=$("tiRows");container.replaceChildren();
  const table=document.createElement("table"),head=document.createElement("thead"),titles=document.createElement("tr"),body=document.createElement("tbody");
  table.className="timecard-preview-table";
  for(const name of ["CSV row","Employee","Date","Regular","Overtime","Result"])titles.append(field("th",name));
  head.append(titles);
  for(const row of rows){
   const tr=document.createElement("tr");
   for(const value of [row.sourceLine,row.employee?.displayName||row.employeeName||row.employeeId,row.workDate||"—",row.regularHours,row.overtimeHours])tr.append(field("td",value));
   const outcome=field("td",row.status==="ready"?"Ready to import":row.error||row.status);
   outcome.className=row.status==="ready"?"timecard-ready":"timecard-rejected";
   tr.append(outcome);body.append(tr);
  }
  table.append(head,body);container.append(table);
  const ready=rows.filter(r=>r.status==="ready").length,skipped=rows.length-ready;
  $("tiStatus").textContent=ready+" ready to import · "+skipped+" skipped or requiring correction. "+(skipped?"Review the reasons before importing.":"All employees and dates matched.");
  $("tiCommit").disabled=!ready;$("tiCommit").textContent="Import "+ready+" pending timecards";
 }
 async function resolveEmployees(items,companyId){
  const people=new Map(S().employees.map(e=>[e.id,e]));
  const names=[...new Set(items.filter(r=>!r.error&&r.employeeName).map(r=>r.employeeName))];
  const ids=[...new Set(items.filter(r=>!r.error&&r.employeeId).map(r=>r.employeeId))];
  for(const name of names){
   // Legacy employee documents have no normalized name field. Check likely casing
   // plus loaded records, then compare case-insensitively in matchTimecards().
   const trimmed=name.trim().replace(/\s+/g," ");
   const titled=trimmed.toLocaleLowerCase("en-US").replace(/\b\p{L}/gu,ch=>ch.toLocaleUpperCase("en-US"));
   const variants=[...new Set([trimmed,titled,trimmed.toLocaleUpperCase("en-US")])];
   for(const searchName of variants){
    const result=await getDocs(query(collection(db,"tenants",companyId,"employees"),where("displayName","==",searchName),limit(50)));
    for(const person of result.docs)people.set(person.id,{id:person.id,...person.data()});
    if(result.size===50)throw Error("More than 49 employees have the same name. Contact the company administrator to use a distinct department.");
   }
  }
  for(const id of ids){
   if(people.has(id)||id.includes("/"))continue;
   const record=await getDoc(doc(db,"tenants",companyId,"employees",id));
   if(record.exists())people.set(record.id,{id:record.id,...record.data()});
  }
  return [...people.values()];
 }
 async function existingTime(rows,companyId){
  const ids=[...new Set(rows.filter(row=>row.status==="ready").map(row=>row.employee.id))],prior=[];
  for(const id of ids){
   const res=await getDocs(query(collection(db,"tenants",companyId,"timeEntries"),where("employeeId","==",id),limit(501)));
   if(res.size===501)throw Error("Too many existing time entries for employee "+id+" to verify all dates without a dedicated indexed search.");
   prior.push(...res.docs.map(d=>({id:d.id,...d.data()})));
  }
  return prior;
 }
 $("tiFile").onchange=()=>{++version;raw=null;reviewed=[];$("tiCommit").disabled=true;$("tiRows").replaceChildren();$("tiStatus").textContent="Select Review CSV to validate the file."};
 $("tiTemplate").onclick=()=>{
  const url=URL.createObjectURL(new Blob([timecardCsvTemplate],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download="sterling_timecards_template.csv";document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 $("tiPreview").onclick=async()=>{
  if(busy)return;
  const file=$("tiFile").files?.[0],companyId=tenant(),token=++version;
  if(!file){$("tiStatus").textContent="Select a CSV file first.";return}
  if(!canImport()||!companyId){$("tiStatus").textContent="Select an authorized client company first.";return}
  if(file.size>160000){$("tiStatus").textContent="The CSV exceeds 160 KB.";return}
  busy=true;$("tiPreview").disabled=true;$("tiCommit").disabled=true;$("tiStatus").textContent="Validating employees, dates and existing timecards…";
  try{
   const source=parseTimecardCsv(await file.text());
   const employees=await resolveEmployees(source,companyId);
   let parsed=matchTimecards(source,employees);
   const existing=await existingTime(parsed,companyId);
   parsed=matchTimecards(source,employees,existing);
   if(token!==version||companyId!==tenant())return;
   raw=source;reviewed=parsed;previewTenant=companyId;display(parsed);
  }catch(error){raw=null;reviewed=[];$("tiStatus").textContent="CSV preview failed: "+error.message;notify("Timecard preview failed: "+error.message,true)}
  finally{busy=false;$("tiPreview").disabled=false}
 };
 $("tiCommit").onclick=async()=>{
  if(busy||!canImport()||!raw||previewTenant!==tenant())return;
  const valid=reviewed.filter(row=>row.status==="ready");if(!valid.length)return;
  if(!await confirmAction("Import timecards","Import "+valid.length+" fictional time entries as Pending? "+
    (reviewed.length-valid.length?reviewed.length-valid.length+" problematic or duplicate CSV rows will be skipped. ":"")+
    "Already-approved entries and finalized payroll will not be changed."))return;
  const companyId=tenant(),actor=S().user.uid;
  busy=true;$("tiCommit").disabled=true;$("tiStatus").textContent="Rechecking and importing timecards…";
  try{
   const previous=await existingTime(valid,companyId),uniqueEmployees=[...new Map(valid.map(r=>[r.employee.id,r.employee])).values()],checked=matchTimecards(valid,uniqueEmployees,previous);
   if(checked.some(r=>r.status!=="ready"))throw Error("Timecards changed since the preview. Review the file again.");
   if(companyId!==tenant()||!canImport()||S().user.uid!==actor)throw Error("Company or permissions changed.");
   // Use small atomic transactions: the Firestore Rules batch limit is 20
   // document-access calls, and one timecard create checks its employee record.
   let committed=0;
   for(const group of groupTimecards(valid)){
    if(companyId!==tenant()||!canImport()||S().user.uid!==actor)
     throw Error("Company or permissions changed after "+committed+" successful imports.");
    await runTransaction(db,async tx=>{
     const refs=group.map(r=>doc(db,"tenants",companyId,"timeEntries",importDocumentId(r.employee.id,r.workDate)));
     const workerIds=[...new Set(group.map(r=>r.employee.id))];
     const workers=workerIds.map(id=>doc(db,"tenants",companyId,"employees",id));
     const [existing,active]=await Promise.all([
      Promise.all(refs.map(ref=>tx.get(ref))),
      Promise.all(workers.map(ref=>tx.get(ref)))
     ]);
     if(existing.some(s=>s.exists()))throw Error("An imported timecard is already present.");
     if(active.some(s=>!s.exists()||s.data().status!=="active"))throw Error("An employee is no longer active.");
     for(let i=0;i<group.length;i++){
      const r=group[i];
      tx.set(refs[i],{employeeId:r.employee.id,workDate:r.workDate,
       regularHours:r.regularHours,overtimeHours:r.overtimeHours,note:r.note,
       createdAt:serverTimestamp(),createdBy:actor,status:"pending",approvedBy:""});
     }
     tx.set(doc(collection(db,"tenants",companyId,"auditEvents")),{
      category:"time",action:"timecard-csv-import",subject:companyId,
      detail:group.length+" fictional timecards imported as pending",
      actor,at:serverTimestamp()
     });
    });
    committed+=group.length;
    $("tiStatus").textContent="Imported "+committed+" of "+valid.length+" timecards…";
   }
   notify(valid.length+" timecards imported as Pending.");
   clear();await refreshCompany();
  }catch(error){$("tiStatus").textContent="Import stopped: "+error.message+" If some batches succeeded, preview again to skip them.";notify("Timecard import stopped: "+error.message,true)}
  finally{busy=false;$("tiCommit").disabled=false}
 };
 $("tiClose").onclick=()=>dialog.close();
 launch.onclick=()=>{sync();if(!dialog.open)dialog.showModal()};
 dialog.addEventListener("close",()=>{if(!busy)clear()});
 sync();
 return {sync,clear};
}
