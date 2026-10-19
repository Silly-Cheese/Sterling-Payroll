import {calculateTaxAdjustment} from "./payroll-tax-core.js";
import {money} from "./payroll-core.js";
export function mountPaylineEditor(){
 const dialog=document.createElement("dialog");
 dialog.className="sterling-payline-dialog";
 dialog.setAttribute("aria-labelledby","paylineEditorHeading");
 const host=document.createElement("div");host.className="sterling-payline-shell";
 const eyebrow=document.createElement("p");eyebrow.className="eyebrow";eyebrow.textContent="DRAFT PAYROLL · EMPLOYEE ADJUSTMENT";
 const title=document.createElement("h2");title.id="paylineEditorHeading";title.textContent="Edit fictional earnings";
 const details=document.createElement("p");details.className="muted";
 const form=document.createElement("form");form.className="payline-editor-form";form.noValidate=false;
 const totals=document.createElement("dl");totals.className="payline-editor-summary";
 const inputGroup=document.createElement("div");inputGroup.className="payline-editor-fields";
 const addField=(name,label)=>{
  const wrap=document.createElement("label");wrap.textContent=label;
  const input=document.createElement("input");
  input.type="number";input.min="0";input.max="10000000";input.step="0.01";input.required=true;
  input.name=name;wrap.append(input);inputGroup.append(wrap);return input;
 };
 const bonus=addField("bonus","Simulated bonus ($)"),
  deduction=addField("deduction","Other deduction ($)");
 const tax=addField("tax","Simulated taxes (% of gross)");
 tax.max="100";tax.step="0.01";
 const taxPresets=document.createElement("div");taxPresets.className="payline-tax-presets";
 const heading=document.createElement("small");heading.textContent="Quick tax rates:";
 taxPresets.append(heading);
 for(const rate of ["0","5","10","12.5","15","20","25"]){
  const button=document.createElement("button");button.type="button";button.className="btn small";
  button.textContent=rate+"%";
  button.onclick=()=>{tax.value=rate;render()};
  taxPresets.append(button);
 }
 const preview=document.createElement("div");preview.className="payline-editor-preview";
 preview.setAttribute("aria-live","polite");
 const error=document.createElement("p");error.className="payline-editor-error";
 error.setAttribute("role","alert");error.hidden=true;
 const actions=document.createElement("div");actions.className="payline-editor-actions";
 const cancel=document.createElement("button");cancel.type="button";cancel.className="btn";cancel.textContent="Cancel";
 const save=document.createElement("button");save.type="submit";save.className="btn primary";save.textContent="Save adjustment";
 actions.append(cancel,save);
 form.append(totals,inputGroup,taxPresets,preview,error,actions);
 host.append(eyebrow,title,details,form);dialog.append(host);document.body.append(dialog);
 let line=null,callback=null,busy=false,previousFocus=null;
 function summary(label,value){const item=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=money(value);item.append(dt,dd);return item;}
 function render(){
  if(!line)return;
  totals.replaceChildren(summary("Regular earnings",line.regularCents||0),
   summary("Overtime earnings",line.overtimeCents||0),
   summary("Sales commissions",line.commissionCents||0));
  try{
   const adjusted=calculateTaxAdjustment(line,bonus.value,deduction.value,tax.value);
   preview.textContent="Gross "+money(adjusted.grossCents)+" · Simulated taxes "+money(adjusted.taxCents)+
    " · Other deductions "+money(adjusted.otherDeductionCents)+" · Net "+money(adjusted.netCents);
   preview.classList.remove("invalid");save.disabled=busy;
  }catch(err){preview.textContent=err.message;preview.classList.add("invalid");save.disabled=true;}
 }
 cancel.onclick=()=>{if(!busy)dialog.close()};
 dialog.addEventListener("cancel",event=>{if(busy)event.preventDefault()});
 dialog.addEventListener("click",event=>{if(event.target===dialog&&!busy)dialog.close()});
 dialog.addEventListener("close",()=>{previousFocus?.focus?.();line=null;callback=null});
 bonus.oninput=render;deduction.oninput=render;tax.oninput=render;
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!line||!callback)return;
  let values;try{values=calculateTaxAdjustment(line,bonus.value,deduction.value,tax.value)}
  catch(err){error.hidden=false;error.textContent=err.message;return}
  busy=true;save.disabled=true;cancel.disabled=true;error.hidden=true;
  try{await callback(values);dialog.close()}
  catch(err){error.hidden=false;error.textContent=err.message||String(err)}
  finally{busy=false;cancel.disabled=false;render()}
 };
 return {open({record,onSave}){
  if(dialog.open||busy)throw Error("Finish the open adjustment before editing another pay line.");
  line=record;callback=onSave;previousFocus=document.activeElement;
  title.textContent="Adjust "+(record.employeeName||"employee")+" pay";
  details.textContent="Deduct a chosen percentage of final gross pay as fictional taxes, plus any separate dollar deduction. Wages and approved commissions remain unchanged.";
  bonus.value=((record.bonusCents||0)/100).toFixed(2);
  // Legacy records contain only total deductions, so treat them as fixed until
  // a rate is selected. Newer records preserve both values separately.
  deduction.value=((record.otherDeductionCents??Math.max(0,(record.deductionCents||0)-(record.taxCents||0)))/100).toFixed(2);
  tax.value=((record.taxRateBasisPoints||0)/100).toFixed(2);
  error.hidden=true;render();dialog.showModal();bonus.focus();
 },close(){if(dialog.open&&!busy)dialog.close()}};
}
