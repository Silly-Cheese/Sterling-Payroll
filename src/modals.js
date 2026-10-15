// Consistent, accessible Sterling action dialogs. No native confirm/prompt/alert.
export function createSterlingModals(){
 const host=document.createElement("dialog");
 host.id="sterlingActionDialog";
 host.className="sterling-action-dialog";
 host.setAttribute("aria-labelledby","sterlingActionTitle");
 host.innerHTML='<div class="sa-shell"><div class="sa-brand"><span class="sa-monogram">S</span><span>STERLING <small>PAYROLL SERVICES</small></span></div><div class="sa-icon" id="saIcon" aria-hidden="true">◇</div><p class="sa-eyebrow" id="saEyebrow">REVIEW REQUIRED</p><h2 id="sterlingActionTitle"></h2><p id="saDescription"></p><div id="saFields"></div><p id="saNotice" class="sa-notice" role="alert"></p><div class="sa-actions"><button id="saCancel" class="btn" type="button">Cancel</button><button id="saAccept" class="btn primary" type="button">Confirm</button></div><p class="sa-footer">SIMULATED DATA · AUTHORIZED WORKSPACE ACTION</p></div>';
 document.body.append(host);
 const el=id=>host.querySelector("#"+id);
 let resolvePending=null,previousFocus=null;
 function finish(value){
  if(!host.open)return;
  host.close();
  const resolve=resolvePending;resolvePending=null;
  previousFocus?.focus?.();resolve?.(value);
 }
 host.addEventListener("cancel",e=>{e.preventDefault();finish(null)});
 host.addEventListener("click",e=>{if(e.target===host)finish(null)});
 el("saCancel").onclick=()=>finish(null);
 function prepare({title,message,tone="normal",confirmLabel="Confirm",eyebrow="REVIEW REQUIRED",fields=[]}){
  if(host.open)throw Error("Finish the current action before opening another confirmation");
  previousFocus=document.activeElement;
  host.dataset.tone=tone;
  el("sterlingActionTitle").textContent=title;
  el("saDescription").textContent=message;
  el("saEyebrow").textContent=eyebrow;
  el("saIcon").textContent=tone==="danger"?"!":tone==="success"?"✓":"◇";
  el("saAccept").textContent=confirmLabel;
  el("saNotice").textContent="";
  const container=el("saFields");container.replaceChildren();
  const controls=new Map();
  for(const f of fields){
   const label=document.createElement("label");label.className="sa-field";
   const title=document.createElement("span");title.textContent=f.label;label.append(title);
   const input=document.createElement(f.multiline?"textarea":"input");
   input.id="sa-"+f.id;
   if(!f.multiline)input.type="text";
   input.autocomplete="off";
   input.spellcheck=false;
   input.placeholder=f.placeholder||"";
   if(f.minLength)input.minLength=f.minLength;
   if(f.maxLength)input.maxLength=f.maxLength;
   if(f.multiline)input.rows=3;
   label.append(input);container.append(label);controls.set(f.id,input);
  }
  host.showModal();
  (controls.values().next().value||el("saCancel")).focus();
  return controls;
 }
 async function confirm({title="Confirm action",message="",tone="normal",confirmLabel="Confirm"}={}){
  prepare({title,message,tone,confirmLabel});
  return await new Promise(resolve=>{
   resolvePending=resolve;
   el("saAccept").onclick=()=>finish(true);
  }).then(value=>value===true);
 }
 async function deleteRecord({title="Delete record",message,recordLabel}={}){
  const name=String(recordLabel||"the selected record");
  const controls=prepare({
   title,message:message||"Permanently remove "+name+" and any supported dependent records? This cannot be undone.",
   tone:"danger",eyebrow:"PERMANENT DELETION",confirmLabel:"Delete permanently",
   fields:[
    {id:"reason",label:"Reason for deletion",placeholder:"Explain why this record must be removed",multiline:true,minLength:10,maxLength:500},
    {id:"phrase",label:"Type DELETE PERMANENTLY to confirm",placeholder:"DELETE PERMANENTLY",maxLength:80}
   ]
  });
  return await new Promise(resolve=>{
   resolvePending=resolve;
   el("saAccept").onclick=()=>{
    const reason=controls.get("reason").value.trim(),phrase=controls.get("phrase").value.trim();
    if(reason.length<10||reason.length>500){el("saNotice").textContent="Enter a reason between 10 and 500 characters.";controls.get("reason").focus();return}
    if(phrase!=="DELETE PERMANENTLY"){el("saNotice").textContent="Type DELETE PERMANENTLY exactly to authorize permanent removal.";controls.get("phrase").focus();return}
    finish({reason,phrase});
   };
  });
 }
 return {confirm,deleteRecord};
}
