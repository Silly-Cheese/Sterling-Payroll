// Pure workflow selectors; counts are explicitly scoped to loaded records.
export function summarizePayrollWorkspace(state){
 const runs=Array.isArray(state?.runs)?state.runs:[];
 const time=Array.isArray(state?.time)?state.time:[];
 const people=Array.isArray(state?.employees)?state.employees:[];
 const count=status=>runs.filter(run=>run.status===status).length;
 return Object.freeze({
  employees:people.filter(person=>person.status==="active").length,
  pendingTime:time.filter(entry=>(entry.status||"pending")==="pending").length,
  draftRuns:count("draft"),submittedRuns:count("submitted"),
  approvedRuns:count("approved"),rejectedRuns:count("rejected"),
  finalizedRuns:count("finalized"),
  totalRuns:runs.length,
  partialTime:!!state?.moreTime,
  partialRuns:!!state?.moreRuns,
  partialEmployees:!!state?.moreEmployees
 });
}
export function payrollNextSteps(state){
 const s=summarizePayrollWorkspace(state);
 if(!state?.tenantId)return [{id:"choose-company",label:"Select a company",detail:"Choose a business in the top bar to begin.",page:"dashboard",priority:1}];
 if(state?.role==="employee")return [{id:"my-pay",label:"View my statements",detail:"Review published pay and messages.",page:"employeePortal",priority:2}];
 const steps=[];
 if(s.pendingTime)steps.push({id:"time",label:"Review pending timecards",detail:s.pendingTime+" loaded entries awaiting approval"+(s.partialTime?" · more records may exist":""),page:"time",priority:1});
 if(s.submittedRuns)steps.push({id:"approve",label:"Review submitted payroll",detail:s.submittedRuns+" submitted pay periods awaiting authorization",page:"payroll",priority:1});
 if(s.approvedRuns)steps.push({id:"finalize",label:"Finalize approved runs",detail:s.approvedRuns+" approved pay periods ready for finalization",page:"payroll",priority:1});
 if(s.rejectedRuns)steps.push({id:"rejected",label:"Resolve rejected periods",detail:s.rejectedRuns+" rejected drafts need corrections",page:"payroll",priority:2});
 if(s.draftRuns)steps.push({id:"draft",label:"Continue draft payroll",detail:s.draftRuns+" draft periods to calculate or submit",page:"payroll",priority:2});
 if(!steps.length)steps.push({id:"ready",label:"Prepare the next payroll",detail:"No outstanding items in the records currently loaded.",page:"payroll",priority:3});
 if(s.partialTime||s.partialRuns)steps.push({id:"coverage",label:"Some records are not yet loaded",detail:"Use the related register to load more records before relying on totals.",page:s.partialTime?"time":"payroll",priority:2});
 return steps.sort((a,b)=>a.priority-b.priority).slice(0,6);
}
export function payrollRunSteps(run){
 const status=run?.status||"none";
 return [
  {id:"time",label:"Time",complete:status!=="none",current:status==="none"},
  {id:"draft",label:"Draft",complete:["submitted","approved","finalized"].includes(status),current:["draft","rejected"].includes(status)},
  {id:"review",label:"Review",complete:["approved","finalized"].includes(status),current:status==="submitted"},
  {id:"final",label:"Finalize",complete:status==="finalized",current:["approved","finalized"].includes(status)}
 ];
}
