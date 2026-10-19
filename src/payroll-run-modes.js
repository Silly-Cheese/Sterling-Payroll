// Stored on each run. Legacy runs without a mode keep their previous combined behavior.
export const PAYROLL_RUN_MODES=Object.freeze({
 "timecards-only":"Timecards only",
 "commissions-only":"Commissions only",
 "combined":"Timecards + commissions"
});
export function normalizePayrollRunMode(mode,{legacy=false}={}){
 if((mode===undefined||mode===null||mode==="")&&legacy)return "combined";
 if(!Object.prototype.hasOwnProperty.call(PAYROLL_RUN_MODES,mode))throw Error("Choose a valid payroll processing mode.");
 return mode;
}
export function usesTimecards(mode){return normalizePayrollRunMode(mode,{legacy:true})!=="commissions-only";}
export function usesCommissions(mode){return normalizePayrollRunMode(mode,{legacy:true})!=="timecards-only";}
export function payrollRunModeLabel(mode){return PAYROLL_RUN_MODES[normalizePayrollRunMode(mode,{legacy:true})];}
export function emptyCommissionLine(employee,policy){
 if(!employee||employee.status!=="active"||!employee.id)throw Error("Approved commissions require an active employee.");
 if(!["hourly","salary"].includes(employee.payType))throw Error("Commission employee has an invalid compensation type.");
 if(!Number.isInteger(policy?.defaultTaxRateBasisPoints??0))throw Error("Invalid simulated tax policy.");
 return {
  employeeId:employee.id,employeeName:employee.displayName||"Employee",payType:employee.payType,
  regularHours:0,overtimeHours:0,paidLeaveHours:0,regularCents:0,overtimeCents:0,
  bonusCents:0,commissionCents:0,deductionCents:0,
  otherDeductionCents:0,taxCents:0,taxRateBasisPoints:policy?.defaultTaxRateBasisPoints||0,
  grossCents:0,netCents:0,policyVersion:policy?.version||1
 };
}
