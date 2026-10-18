import {toCents,assertMoney} from "./payroll-core.js";
export function calculateDraftAdjustment(line,bonusText,deductionText){
 if(!line?.employeeId)throw Error("Select a valid employee pay line.");
 const bonus=toCents(bonusText),deduction=toCents(deductionText);
 const regular=assertMoney(line.regularCents,"regular pay");
 const overtime=assertMoney(line.overtimeCents,"overtime pay");
 const commission=assertMoney(line.commissionCents||0,"commission");
 const gross=regular+overtime+commission+bonus;
 if(!Number.isSafeInteger(gross)||gross>1_000_000_000)throw Error("Gross pay exceeds the fictional payroll limit.");
 if(deduction>gross)throw Error("Deductions cannot exceed gross pay.");
 return {bonusCents:bonus,deductionCents:deduction,grossCents:gross,netCents:gross-deduction};
}
