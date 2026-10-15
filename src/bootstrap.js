import {doc,getDoc,writeBatch,serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {reload,getIdToken} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

/** A public first-registrant owner claim is never permitted. Firestore rules require
 * the configured verified owner email and an unclaimed bootstrap document.
 */
export async function mountOwnerBootstrap({auth,db,user,onClaim,notify}){
 const root=document.getElementById("ownerBootstrap");
 if(!root||!user)return;
 root.replaceChildren();root.classList.add("hidden");
 const bootstrap=await getDoc(doc(db,"system","bootstrap"));
 if(bootstrap.exists())return;
 const heading=document.createElement("h2");heading.textContent="Sterling owner setup";
 const message=document.createElement("p");message.className="muted";
 message.textContent="One-time account setup: verify the designated owner email address, then claim the Sterling Payroll platform. Existing client accounts cannot claim ownership.";
 const action=document.createElement("button");action.type="button";action.className="btn primary";action.textContent="Verify and complete owner setup";
 const status=document.createElement("p");status.className="fine-print";status.setAttribute("role","status");
 status.textContent="The designated owner email must be configured in the deployed Firestore rules before this button can succeed.";
 root.append(heading,message,action,status);root.classList.remove("hidden");
 action.addEventListener("click",async()=>{
  action.disabled=true;
  try{
   await reload(user);await getIdToken(user,true);
   if(!user.emailVerified){status.textContent="Your Firebase Authentication email is not verified. Open the verification email before continuing.";return}
   const batch=writeBatch(db);
   batch.set(doc(db,"system","bootstrap"),{ownerUid:user.uid,initialized:true,createdAt:serverTimestamp()});
   batch.set(doc(db,"platformAdmins",user.uid),{active:true,role:"owner",createdAt:serverTimestamp()});
   await batch.commit();
   status.textContent="Owner account initialized.";
   root.classList.add("hidden");
   await onClaim();
  }catch(error){
   status.textContent="Owner bootstrap not authorized ("+(error.code||error.message)+"). Confirm your verified email is the configured owner email and that the newest Firestore rules are published.";
   notify?.("Owner bootstrap failed; no access has been granted.",true);
  }finally{action.disabled=false}
 });
}