import {collection,doc,getDoc,getDocs,query,where,limit} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {attachApprovedSales} from "./commission-core.js";
const MAX_SALES=140;
export async function prepareRunCommissions(db,tenantId,run,lines){
 const settings=await getDoc(doc(db,"tenants",tenantId,"commissionSettings","current"));
 const enabled=settings.exists()&&settings.data().enabled===true;
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
 const prepared=attachApprovedSales(lines,eligible,run.periodStart,run.periodEnd);
 const retained=new Set(prepared.applied.map(s=>s.id));
 const release=claimed.filter(s=>!retained.has(s.id));
 const claim=waiting.filter(s=>retained.has(s.id));
 return {...prepared,claim,release,enabled};
}
export function commitRunCommissions(batch,runId,commissions){
 for(const sale of commissions.claim)batch.update(sale.ref,{paidRunId:runId});
 for(const sale of commissions.release)batch.update(sale.ref,{paidRunId:""});
}
