import { useState, useEffect, useRef } from "react";

const B = { orange:"#EA672F", black:"#2A2B29", cream:"#F3EAE5", tone1:"#D2CAC4", tone2:"#A9A09B", black1:"#42453C", black2:"#5E635B", white:"#ffffff", green:"#2E5C10", greenBg:"#EAF3DE" };

function ActionRow({ label, hint, done, doneLabel, busy, onTrigger, triggerLabel, isLink, linkHref }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderBottom:"1px solid "+B.cream, gap:12 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{label}</div>
        {hint && <div style={{ fontSize:11, color:B.black2, marginTop:2 }}>{hint}</div>}
        {isLink && linkHref && <a href={linkHref} target="_blank" rel="noreferrer" style={{ fontSize:12, color:B.orange }}>Open backup storage drive →</a>}
      </div>
      {done ? (
        <span style={{ fontSize:12, padding:"6px 14px", borderRadius:20, background:B.greenBg, color:B.green, fontWeight:700, display:"inline-flex", alignItems:"center", gap:6 }}>✓ {doneLabel}</span>
      ) : (
        <button onClick={onTrigger} disabled={busy} style={{ padding:"7px 16px", background:busy?B.tone1:B.orange, color:B.white, border:"none", borderRadius:7, cursor:busy?"default":"pointer", fontSize:13, fontFamily:"Manrope,sans-serif", fontWeight:600 }}>
          {busy?"Uploading...":triggerLabel}
        </button>
      )}
    </div>
  );
}

export default function ContractorUpload({ jobId, apiBase, token, stage }) {
  const [status,setStatus]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busyAction,setBusyAction]=useState(null);
  const workingInputRef=useRef(null);
  const deliveryInputRef=useRef(null);

  const load=()=>{
    fetch(apiBase+"/api/contractor-files/"+jobId+"/status",{headers:{Authorization:"Bearer "+token}})
      .then(r=>r.json()).then(d=>{setStatus(d);setLoading(false);}).catch(()=>setLoading(false));
  };
  useEffect(()=>{load();},[jobId]);

  const uploadWorking=async(file)=>{
    if(!file)return;
    setBusyAction("working");
    const fd=new FormData();fd.append("file",file);
    try{
      const r=await fetch(apiBase+"/api/contractor-files/"+jobId+"/working",{method:"POST",headers:{Authorization:"Bearer "+token},body:fd});
      if(!r.ok)throw new Error((await r.json()).error||"Upload failed");
      load();
    }catch(e){alert("Failed to upload working file: "+e.message);}
    setBusyAction(null);
  };

  const uploadDelivery=async(files)=>{
    if(!files||files.length===0)return;
    setBusyAction("delivery");
    const fd=new FormData();Array.from(files).forEach(f=>fd.append("files",f));
    try{
      const r=await fetch(apiBase+"/api/contractor-files/"+jobId+"/delivery",{method:"POST",headers:{Authorization:"Bearer "+token},body:fd});
      if(!r.ok)throw new Error((await r.json()).error||"Upload failed");
      load();
    }catch(e){alert("Failed to upload delivery file(s): "+e.message);}
    setBusyAction(null);
  };

  const confirmStorage=async()=>{
    if(!window.confirm("Confirm all files for this revision have been uploaded to the backup storage drive?"))return;
    setBusyAction("storage");
    try{
      const r=await fetch(apiBase+"/api/contractor-files/"+jobId+"/storage-confirm",{method:"POST",headers:{Authorization:"Bearer "+token}});
      if(!r.ok)throw new Error((await r.json()).error||"Failed");
      load();
    }catch(e){alert("Failed to confirm storage: "+e.message);}
    setBusyAction(null);
  };

  if(loading)return <div style={{padding:"1.25rem",color:B.black2,fontSize:13}}>Loading upload status...</div>;
  if(!status)return null;

  const allDone = status.workingFileDone && status.deliveryFileDone && status.storageConfirmed;

  return (
    <div style={{ background:B.white, border:"1px solid "+B.tone1, borderRadius:10, padding:"1.25rem", marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <h3 style={{ fontSize:14, fontWeight:600, color:B.black, margin:0 }}>Revision {status.revisionLetter} — Required Uploads</h3>
        {allDone && <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:B.greenBg, color:B.green, fontWeight:700 }}>ALL COMPLETE — SENT FOR REVIEW</span>}
      </div>
      <p style={{ fontSize:12, color:B.black2, margin:"0 0 8px" }}>All three actions below must be completed before this revision moves into review.</p>

      <ActionRow label="Working file" hint="PLN / Revit file for this revision" done={status.workingFileDone} doneLabel={status.workingFileName||"Uploaded"} busy={busyAction==="working"} triggerLabel="Upload file" onTrigger={()=>workingInputRef.current?.click()} />
      <input ref={workingInputRef} type="file" style={{display:"none"}} onChange={e=>uploadWorking(e.target.files[0])} />

      <ActionRow label="Delivery file(s)" hint={stage==="working_drawings"?"Requires a PDF and a DWG for client delivery":"Requires a PDF for client delivery"} done={status.deliveryFileDone} doneLabel={status.deliveryFileNames?.length?status.deliveryFileNames.join(", "):"Uploaded"} busy={busyAction==="delivery"} triggerLabel="Upload file(s)" onTrigger={()=>deliveryInputRef.current?.click()} />
      <input ref={deliveryInputRef} type="file" multiple style={{display:"none"}} onChange={e=>uploadDelivery(e.target.files)} />

      <ActionRow label="Backup storage" hint="Upload all working files to the drive, then confirm here" done={status.storageConfirmed} doneLabel="Confirmed" busy={busyAction==="storage"} triggerLabel="Mark as done" onTrigger={confirmStorage} isLink={!status.storageConfirmed} linkHref={status.storageLink} />
    </div>
  );
}
