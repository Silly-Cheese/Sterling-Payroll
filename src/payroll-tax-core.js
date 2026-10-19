import {assertMoney,toCents} from "./payroll-core.js";

// Percentage is expressed in hundredths of one percent: 12.50% => 1250.
export function taxBasisPoints(value){
 const input=String(value??"").trim();
 if(!/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(input))
  throw Error("Enter a simulated tax percentage from 0% to 100% (up to two decimals).");
 const [whole,decimal=""]=input.split(".");
 const rate=Number(whole)*100+Number(decimal.padEnd(2,"0"));
 if(!Number.isSafeInteger(rate)||rate<0||rate>10000)throw Error("Tax percentage must be 0–100%.");
 return rate;
}
export function calculateTaxCents(grossCents,rateBasisPoints){
 assertMoney(grossCents,"gross earnings");
 if(!Number.isInteger(rateBasisPoints)||rateBasisPoints<0||rateBasisPoints>10000)
  throw Error("Invalid simulated tax rate.");
 return Math.round(grossCents*rateBasisPoints/10000);
}
export function applySimulatedTaxes(lines,defaultRateBasisPoints=0){
 if(!Number.isInteger(defaultRateBasisPoints)||defaultRateBasisPoints<0||defaultRateBasisPoints>10000)
  throw Error("Invalid default simulated tax rate.");
 return lines.map(line=>{
  const gross=assertMoney(line.grossCents,"gross earnings");
  const oldTax=line.taxCents??0;
  assertMoney(oldTax,"existing simulated tax");
  const rate=line.taxRateBasisPoints??defaultRateBasisPoints;
  const other=assertMoney(line.deductionCents,"deduction")-oldTax;
  if(other<0)throw Error("Tax amount exceeds the line's existing deduction.");
  const taxCents=calculateTaxCents(gross,rate);
  const deductionCents=other+taxCents;
  if(deductionCents>gross)throw Error("Combined deductions and simulated taxes exceed gross pay for "+(line.employeeName||"employee")+".");
  return {...line,taxRateBasisPoints:rate,taxCents,otherDeductionCents:other,deductionCents,netCents:gross-deductionCents};
 });
}
export function calculateTaxAdjustment(line,bonusText,otherDeductionText,taxPercentText){
 if(!line?.employeeId)throw Error("Select a valid employee pay line.");
 const bonusCents=toCents(bonusText);
 const otherDeductionCents=toCents(otherDeductionText);
 const taxRateBasisPoints=taxBasisPoints(taxPercentText);
 const grossCents=assertMoney(line.regularCents,"regular pay")+
  assertMoney(line.overtimeCents,"overtime pay")+
  assertMoney(line.commissionCents||0,"commission")+bonusCents;
 if(!Number.isSafeInteger(grossCents)||grossCents>1_000_000_000)throw Error("Gross pay exceeds the fictional payroll limit.");
 const taxCents=calculateTaxCents(grossCents,taxRateBasisPoints);
 const deductionCents=taxCents+otherDeductionCents;
 if(deductionCents>grossCents)throw Error("Combined deductions and simulated taxes cannot exceed gross pay.");
 return {bonusCents,otherDeductionCents,taxRateBasisPoints,taxCents,deductionCents,grossCents,netCents:grossCents-deductionCents};
}
