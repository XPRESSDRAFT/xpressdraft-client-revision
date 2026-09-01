import { useState, useEffect } from "react";

const B = { orange:"#EA672F", black:"#2A2B29", cream:"#F3EAE5", tone1:"#D2CAC4", tone2:"#A9A09B", black1:"#42453C", black2:"#5E635B", white:"#ffffff", green:"#2E5C10" };
const btnPrimary={padding:"7px 14px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600};
const btnGhost={padding:"6px 12px",background:B.white,color:B.black1,border:"1px solid "+B.tone1,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"};
const OPTION_LABEL={siteVisit:"Site Visit",model3d:"3D Model",renders3d:"3D Renders"};

export default function ContractorRequestsPage({ onBack }) {
  const [requests,setRequests]=useState([]);
  const [loading,setLoading]=useState(true);
  const API=process.env.REACT_APP_API_URL||"";
  const token=()=>localStorage.getItem("xpd_token");

  const load=()=>{
    fetch(API+"/api/fee-requests",{headers:{Authorization:"Bearer "+token()}})
      .then(r=>r.json()).then(d=>{setRequests(d.requests||[]);setLoading(false);}).catch(()=>setLoading(false));
  };
  useEffect(()=>{load();},[]);

  const resolve=async(id,action)=>{
    try{
      const r=await fetch(API+"/api/fee-requests/"+id+"/"+action,{method:"POST",headers:{Authorization:"Bearer "+token()}});
      if(!r.ok)throw new Error((await r.json()).error||"Failed");
      load();
    }catch(e){alert("Failed to "+action+" request: "+e.message);}
  };

  const pending=requests.filter(r=>r.status==="pending");
  const resolved=requests.filter(r=>r.status!=="pending");

  return (
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}>
        <span style={{color:B.cream,fontSize:14,fontWeight:600}}>Contractor Requests</span>
        <button onClick={onBack} style={{marginLeft:"auto",background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Back</button>
      </nav>
      <div style={{maxWidth:700,margin:"0 auto",padding:"2rem 24px"}}>
        {loading&&<div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading...</div>}

        {!loading&&(
          <>
            <h2 style={{fontSize:16,fontWeight:600,color:B.black,margin:"0 0 12px"}}>Pending ({pending.length})</h2>
            {pending.length===0&&<p style={{fontSize:13,color:B.black2,marginBottom:24}}>No pending requests.</p>}
            {pending.map(r=>{
              const jobRef=[r.job?.project?.job_number,r.job?.project?.site_address].filter(Boolean).join(" — ")||r.job?.project?.name;
              return (
                <div key={r.id} style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1rem 1.25rem",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:B.black}}>{OPTION_LABEL[r.option_key]} — {jobRef}</div>
                    <div style={{fontSize:12,color:B.black2}}>{r.contractor?.name} · requested {new Date(r.requested_at).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>resolve(r.id,"deny")} style={{...btnGhost,color:"#8B2020",borderColor:"#F7C1C1"}}>Deny</button>
                    <button onClick={()=>resolve(r.id,"approve")} style={{...btnPrimary,background:B.green}}>Approve</button>
                  </div>
                </div>
              );
            })}

            <h2 style={{fontSize:16,fontWeight:600,color:B.black,margin:"24px 0 12px"}}>History</h2>
            {resolved.length===0&&<p style={{fontSize:13,color:B.black2}}>No resolved requests yet.</p>}
            {resolved.map(r=>{
              const jobRef=[r.job?.project?.job_number,r.job?.project?.site_address].filter(Boolean).join(" — ")||r.job?.project?.name;
              const approved=r.status==="approved";
              return (
                <div key={r.id} style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"0.75rem 1.25rem",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:0.75}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:B.black}}>{OPTION_LABEL[r.option_key]} — {jobRef}</div>
                    <div style={{fontSize:11,color:B.black2}}>{r.contractor?.name}</div>
                  </div>
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:approved?"#EAF3DE":"#FCEBEB",color:approved?B.green:"#8B2020",fontWeight:700}}>{r.status.toUpperCase()}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
