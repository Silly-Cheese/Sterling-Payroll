// All commissions are fictional and store cents as integers.
export const COMMISSION_TYPES=Object.freeze(["percent","fixed"]);
export function percentBasisPoints(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>100||Math.abs(Math.round(n*100)-n*100)>1e-7)throw Error("Percentage must be 0–100 with up to two decimals.");
 return Math.round(n*100);
}
export function commissionAmount(saleCents,plan){
 if(!Number.isSafeInteger(saleCents)||saleCents<1||saleCents>1_000_000_000)throw Error("Sale amount must be between $0.01 and $10,000,000.");
 if(!plan?.active||!COMMISSION_TYPES.includes(plan.type))throw Error("Select an active employee commission plan.");
 let result;
 if(plan.type==="percent"){
  if(!Number.isInteger(plan.rateBasisPoints)||plan.rateBasisPoints<0||plan.rateBasisPoints>10000)throw Error("Invalid commission percentage.");
  result=Math.round(saleCents*plan.rateBasisPoints/10000);
 }else{
  if(!Number.isSafeInteger(plan.fixedCents)||plan.fixedCents<0||plan.fixedCents>1_000_000_000)throw Error("Invalid fixed commission.");
  result=plan.fixedCents;
 }
 if(result<0||result>1_000_000_000)throw Error("Commission exceeds simulation limits.");
 return result;
}
export function addCommissionToLine(line,commissionCents){
 if(!Number.isSafeInteger(commissionCents)||commissionCents<0)throw Error("Invalid commission amount.");
 const existing=line.commissionCents||0;
 const grossCents=line.grossCents-existing+commissionCents;
 const netCents=grossCents-line.deductionCents;
 if(grossCents>1_000_000_000||netCents<0)throw Error("Commission makes the pay line exceed safe limits.");
 return {...line,commissionCents,grossCents,netCents};
}
export function attachApprovedSales(lines,sales,start,end){
 const byId=new Map(lines.map(l=>[l.employeeId,l]));
 const applied=[],invalid=[];
 for(const s of sales){
  if(s.status!=="approved"||s.saleDate<start||s.saleDate>end)continue;
  const line=byId.get(s.employeeId);
  if(!line){invalid.push(s.id);continue;}
  const next=(line.commissionCents||0)+s.commissionCents;
  byId.set(s.employeeId,addCommissionToLine(line,next));
  applied.push(s);
 }
 if(invalid.length)throw Error(invalid.length+" approved sale(s) belong to employees missing from payroll. Fix their eligibility before generating.");
 return {lines:[...byId.values()],applied,commissionCents:applied.reduce((total,s)=>total+s.commissionCents,0)};
}
