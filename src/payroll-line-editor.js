import {calculateDraftAdjustment} from "./payroll-adjustment-core.js";
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
 const bonus=addField("bonus","Simulated bonus ($)"),deduction=addField("deduction","Simulated deduction ($)");
 const preview=document.createElement("div");preview.className="payline-editor-preview";
 preview.setAttribute("aria-live","polite");
 const error=document.createElement("p");error.className="payline-editor-error";
 error.setAttribute("role","alert");error.hidden=true;
 const actions=document.createElement("div");actions.className="payline-editor-actions";
 const cancel=document.createElement("button");cancel.type="button";cancel.className="btn";cancel.textContent="Cancel";
 const save=document.createElement("button");save.type="submit";save.className="btn primary";save.textContent="Save adjustment";
 actions.append(cancel,save);
 form.append(totals,inputGroup,preview,error,actions);
 host.append(eyebrow,title,details,form);dialog.append(host);document.body.append(dialog);
 let line=null,callback=null,busy=false,previousFocus=null;
 function summary(label,value){const item=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=money(value);item.append(dt,dd);return item;}
 function render(){
  if(!line)return;
  totals.replaceChildren(summary("Regular earnings",line.regularCents||0),
   summary("Overtime earnings",line.overtimeCents||0),
   summary("Sales commissions",line.commissionCents||0));
  try{
   const adjusted=calculateDraftAdjustment(line,bonus.value,deduction.value);
   preview.textContent="Gross "+money(adjusted.grossCents)+"  ·  Net "+money(adjusted.netCents);
   preview.classList.remove("invalid");save.disabled=busy;
  }catch(err){preview.textContent=err.message;preview.classList.add("invalid");save.disabled=true;}
 }
 cancel.onclick=()=>{if(!busy)dialog.close()};
 dialog.addEventListener("cancel",event=>{if(busy)event.preventDefault()});
 dialog.addEventListener("click",event=>{if(event.target===dialog&&!busy)dialog.close()});
 dialog.addEventListener("close",()=>{previousFocus?.focus?.();line=null;callback=null});
 bonus.oninput=render;deduction.oninput=render;
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||!line||!callback)return;
  let values;try{values=calculateDraftAdjustment(line,bonus.value,deduction.value)}
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
  details.textContent="Change only the bonus and deduction in this draft. Calculated wages and approved commissions remain unchanged.";
  bonus.value=((record.bonusCents||0)/100).toFixed(2);
  deduction.value=((record.deductionCents||0)/100).toFixed(2);
  error.hidden=true;render();dialog.showModal();bonus.focus();
 },close(){if(dialog.open&&!busy)dialog.close()}};
}
