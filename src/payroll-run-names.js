// Pay-period names are labels, not identifiers or financial inputs.
export const MAX_PAYROLL_RUN_NAME=80;
export function normalizePayrollRunName(value,{optional=false}={}){
 const name=String(value??"").trim().replace(/\s+/g," ");
 if(!name){
  if(optional)return "";
  throw Error("Enter a payroll run name.");
 }
 if(name.length>MAX_PAYROLL_RUN_NAME)
  throw Error("Payroll run names cannot exceed "+MAX_PAYROLL_RUN_NAME+" characters.");
 if(/[\u0000-\u001f\u007f]/.test(name))throw Error("Remove control characters from the payroll run name.");
 return name;
}
export function payrollRunLabel(run){
 const existing=String(run?.name??"").trim();
 return existing||[run?.periodStart,run?.periodEnd].filter(Boolean).join(" — ")||"Untitled pay period";
}
export function payrollRunSubtitle(run){
 const dates=[run?.periodStart,run?.periodEnd].filter(Boolean).join(" — ");
 return run?.name?dates:"";
}
