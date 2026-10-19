import {validateCompensationProfile,profileApplies,validDate} from "./operations-core.js";
export function applyEffectiveCompensation(lines,history,periodEnd){
 if(!validDate(periodEnd))throw Error("Payroll must have a valid period end.");
 if(!Array.isArray(lines)||!Array.isArray(history))throw Error("Invalid compensation input.");
 const selections=new Map();
 for(const item of history){
  const valid=validateCompensationProfile(item);
  if(!profileApplies(valid,periodEnd))continue;
  const old=selections.get(valid.employeeId);
  const time=item.changedAt?.seconds??0,oldTime=old?.changedAt?.seconds??0;
  if(!old||old.effectiveFrom<valid.effectiveFrom||
   (old.effectiveFrom===valid.effectiveFrom&&time>oldTime)){
   selections.set(valid.employeeId,{...valid,changedAt:item.changedAt});
  }
 }
 return lines.map(line=>{
  const selected=selections.get(line.employeeId);
  if(!selected)return line;
  const oldTax=line.taxCents||0;
  const other=selected.recurringDeductionCents;
  if(other<0)throw Error("Invalid recurring deduction for "+line.employeeName);
  // The withholding is recalculated against final gross, after commissions.
  return {...line,taxRateBasisPoints:selected.taxRateBasisPoints,
   otherDeductionCents:other,taxCents:oldTax,deductionCents:other+oldTax,
   netCents:line.grossCents-other-oldTax};
 });
}
