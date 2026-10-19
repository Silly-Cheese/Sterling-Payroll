import {collection,doc,getDoc,getDocs,query,where,limit} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {attachApprovedSales} from "./commission-core.js";
import {calculateLine} from "./payroll-core.js";
import {emptyCommissionLine,usesTimecards} from "./payroll-run-modes.js?v=sterling-payroll-modes-20261019";
const MAX_SALES=140;
export async function prepareRunCommissions(db,tenantId,run,lines,employees=[],policy={}){
 let settings;
 try{settings=await getDoc(doc(db,"tenants",tenantId,"commissionSettings","current"))}
 catch(error){
  // A client that has never enabled commissions must still be able to run its
  // original simulated payroll before an administrator publishes new rules.
  if(error?.code==="permission-denied")return {lines,claim:[],release:[],commissionCents:0,
   enabled:false,notice:"Commission security rules are not published yet; no commissions will be included."};
  throw error;
 }
 const enabled=settings.exists()&&settings.data().enabled===true;
 // Commission sales are opt-in. Never require access to the commissions ledger
 // when a company has not enabled that feature.
 if(!enabled)return {lines,claim:[],release:[],commissionCents:0,enabled:false};
 const ref=collection(db,"tenants",tenantId,"commissionSales");
 const [already,available]=await Promise.all([
  getDocs(query(ref,where("paidRunId","==",run.id),limit(MAX_SALES+1))),
  enabled?getDocs(query(ref,where("paidRunId","==",""),limit(MAX_SALES+1))):Promise.resolve(null)
 ]);
 if(already.size>MAX_SALES||available?.size>MAX_SALES)throw Error("Over 140 commission sales available. Split this fictional payroll into smaller periods to keep updates atomic.");
 const claimed=already.docs.map(d=>({id:d.id,...d.data(),ref:d.ref}));
 const waiting=(available?.docs||[]).map(d=>({id:d.id,...d.data(),ref:d.ref}));
 const candidate=enabled?[...claimed,...waiting]:[];
 const eligible=candidate.filter(s=>s.status==="approved"&&s.saleDate>=run.periodStart&&s.saleDate<=run.periodEnd);
 if(eligible.length>MAX_SALES)throw Error("Too many approved commissions in one period; use a smaller pay period.");
 const filled=[...lines],included=new Set(filled.map(x=>x.employeeId));
 for(const sale of eligible){
  if(included.has(sale.employeeId))continue;
  let employee=employees.find(e=>e.id===sale.employeeId);
  if(!employee){
   const record=await getDoc(doc(db,"tenants",tenantId,"employees",sale.employeeId));
   if(!record.exists())throw Error("An approved sale references a removed employee. Review commission history.");
   employee={id:record.id,...record.data()};
  }
  if(employee.status!=="active")throw Error("An approved sale references an inactive employee. Review it before payroll.");
  const line=usesTimecards(run.processingMode)?
   calculateLine({employee,regularHours:0,overtimeHours:0,bonusCents:0,deductionCents:0}):
   emptyCommissionLine(employee,policy);
  if(usesTimecards(run.processingMode)){line.policyVersion=policy.version||1;line.paidLeaveHours=0;}
  filled.push(line);included.add(employee.id);
 }
 const prepared=attachApprovedSales(filled,eligible,run.periodStart,run.periodEnd);
 const retained=new Set(prepared.applied.map(s=>s.id));
 const release=claimed.filter(s=>!retained.has(s.id));
 const claim=waiting.filter(s=>retained.has(s.id));
 return {...prepared,claim,release,enabled};
}
export function commitRunCommissions(batch,runId,commissions){
 for(const sale of commissions.claim)batch.update(sale.ref,{paidRunId:runId});
 for(const sale of commissions.release)batch.update(sale.ref,{paidRunId:""});
}
