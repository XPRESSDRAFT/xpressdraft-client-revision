import { useState, useEffect } from "react";

const B = { orange:"#EA672F", black:"#2A2B29", cream:"#F3EAE5", tone1:"#D2CAC4", tone2:"#A9A09B", black1:"#42453C", black2:"#5E635B", white:"#ffffff" };

export default function ContractorInstructions({ jobId, apiBase, token, onViewed }) {
  const [entries,setEntries]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    fetch(apiBase+"/api/contractor/jobs/"+jobId+"/instructions",{headers:{Authorization:"Bearer "+token}})
      .then(r=>r.json()).then(d=>{setEntries(d.entries||[]);setLoading(false);if(onViewed)onViewed();}).catch(()=>setLoading(false));
  },[jobId]);

  if(loading)return <div style={{padding:"1.25rem",color:B.black2,fontSize:13}}>Loading instructions history...</div>;
  if(!entries||entries.length===0)return <div style={{padding:"1.25rem",color:B.black2,fontSize:13,textAlign:"center"}}>No instructions or markups have been sent for this job yet.</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {entries.map(e=>(
        <div key={e.id} style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1rem 1.25rem",borderLeft:"3px solid "+(e.source==="xpressdraft"?B.orange:"#378ADD")}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:700,color:e.source==="xpressdraft"?B.orange:"#1A4A8A"}}>{e.source==="xpressdraft"?"Xpress Draft":"Client"}</span>
            <span style={{fontSize:11,color:B.black2}}>{new Date(e.created_at).toLocaleString("en-AU",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}{e.revision_label?" · "+e.revision_label:""}</span>
          </div>
          {e.content_type==="text"
            ?<p style={{fontSize:13,color:B.black1,margin:0,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{e.content}</p>
            :<a href={e.file_url} target="_blank" rel="noreferrer" style={{fontSize:13,color:B.orange,fontWeight:600}}>📎 {e.file_name} — Download →</a>
          }
        </div>
      ))}
    </div>
  );
}
