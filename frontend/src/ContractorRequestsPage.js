import { useState, useEffect } from "react";

const B = { orange:"#EA672F", black:"#2A2B29", cream:"#F3EAE5", tone1:"#D2CAC4", tone2:"#A9A09B", black1:"#42453C", black2:"#5E635B", white:"#ffffff", green:"#2E5C10" };
const btnPrimary={padding:"7px 14px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600};
const btnGhost={padding:"6px 12px",background:B.white,color:B.black1,border:"1px solid "+B.tone1,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"};
const inputSt={width:"100%",border:"1px solid "+B.tone1,borderRadius:7,padding:"9px 11px",fontSize:14,fontFamily:"Manrope,sans-serif",background:B.white,color:B.black,boxSizing:"border-box"};
const OPTION_LABEL={siteVisit:"Site Visit",model3d:"3D Model",renders3d:"3D Renders"};
const money=n=>"$"+(Number(n)||0).toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:2});

// Every invoice any contractor has submitted, with live payment status
// from Monday. Mounted only when its tab is opened, so Monday isn't
// queried every time the admin visits this page.
function InvoicesTab({ API, token }) {
  const [invoices,setInvoices]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [search,setSearch]=useState("");

  useEffect(()=>{
    fetch(API+"/api/contractor/invoices/all",{headers:{Authorization:"Bearer "+token()}})
      .then(r=>r.json().then(d=>({ok:r.ok,d})))
      .then(({ok,d})=>{if(!ok)throw new Error(d.error||"Failed to load invoices");setInvoices(d.invoices||[]);setLoading(false);})
      .catch(e=>{setError(e.message);setLoading(false);});
  },[]);

  const q=search.trim().toLowerCase();
  const shown=invoices.filter(i=>!q||(i.contractorName||"").toLowerCase().includes(q)||(i.jobRef||"").toLowerCase().includes(q));
  const totalEx=shown.reduce((s,i)=>s+(Number(i.amount)||0),0);
  const totalInc=shown.reduce((s,i)=>s+(Number(i.amount_gst)||0),0);
  const isPaid=s=>/paid/i.test(s||"")&&!/unpaid|outstanding|part/i.test(s||"");

  if(loading)return <div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading invoices...</div>;
  if(error)return <div style={{textAlign:"center",padding:"3rem",color:"#8B2020",fontSize:13}}>{error}</div>;

  return (
    <>
      <input style={{...inputSt,marginBottom:12}} placeholder="Search by contractor or job..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <div style={{fontSize:13,color:B.black2,marginBottom:14}}>
        <strong style={{color:B.black}}>{shown.length}</strong> invoice{shown.length!==1?"s":""} · {money(totalEx)} excl. GST · {money(totalInc)} incl. GST
      </div>
      {shown.length===0&&<p style={{fontSize:13,color:B.black2}}>{invoices.length===0?"No invoices have been submitted yet.":"No invoices match your search."}</p>}
      {shown.map(i=>{
        const paid=isPaid(i.paymentStatus);
        return (
          <div key={i.id} style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1rem 1.25rem",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:B.black}}>{i.contractorName}</div>
                <div style={{fontSize:12,color:B.black2,marginTop:2}}>{i.jobRef}</div>
              </div>
              <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:paid?"#EAF3DE":"#FEF3E8",color:paid?B.green:B.orange,fontWeight:700,whiteSpace:"nowrap"}}>{(i.paymentStatus||"Outstanding").toUpperCase()}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:12,color:B.black2}}>
                {money(i.amount)} excl. · <strong style={{color:B.black}}>{money(i.amount_gst)}</strong> incl. GST
                <span style={{margin:"0 6px",color:B.tone2}}>|</span>
                {new Date(i.submitted_at).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}
                {i.file_name&&<><span style={{margin:"0 6px",color:B.tone2}}>|</span>{i.file_name}</>}
              </div>
              {i.mondayUrl&&<a href={i.mondayUrl} target="_blank" rel="noreferrer" style={{fontSize:12,color:B.orange,fontWeight:600,textDecoration:"none"}}>Open in Monday →</a>}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function ContractorRequestsPage({ onBack }) {
  const [tab,setTab]=useState("requests");
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
        <span style={{color:B.cream,fontSize:14,fontWeight:600}}>Contractors</span>
        <button onClick={onBack} style={{marginLeft:"auto",background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Back</button>
      </nav>
      <div style={{maxWidth:700,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {[["requests","Fee Requests"+(pending.length>0?" ("+pending.length+")":"")],["invoices","Invoices"]].map(([id,label])=>(
            <div key={id} onClick={()=>setTab(id)} style={{padding:"7px 16px",borderRadius:7,border:"1px solid "+(tab===id?B.orange:B.tone1),background:tab===id?"#FEF3E8":B.white,color:tab===id?B.orange:B.black2,cursor:"pointer",fontSize:13,fontWeight:tab===id?600:400}}>{label}</div>
          ))}
        </div>

        {tab==="invoices"&&<InvoicesTab API={API} token={token}/>}

        {tab==="requests"&&loading&&<div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading...</div>}

        {tab==="requests"&&!loading&&(
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
