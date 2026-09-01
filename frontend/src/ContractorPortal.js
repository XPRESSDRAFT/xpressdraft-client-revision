import { useState, useEffect } from "react";
import ContractorUpload from "./ContractorUpload";
import ContractorInstructions from "./ContractorInstructions";
import ContractorInvoices from "./ContractorInvoices";
import Chat from "./Chat";

const B = {
  orange:"#EA672F",black:"#2A2B29",cream:"#F3EAE5",
  tone1:"#D2CAC4",tone2:"#A9A09B",black1:"#42453C",
  black2:"#5E635B",white:"#ffffff",
};
const btnPrimary={padding:"7px 14px",background:"#EA672F",color:"#ffffff",border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600,display:"inline-flex",alignItems:"center",gap:5};
const btnGhost={padding:"6px 12px",background:"#ffffff",color:"#42453C",border:"1px solid #D2CAC4",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",display:"inline-flex",alignItems:"center",gap:5};

function XPDLogo({size=40,variant="color"}){
  const white="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_White.png";
  const color="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png";
  return <img src={variant==="white"?white:color} alt="Xpress Draft" style={{height:size,width:"auto",maxHeight:size}}/>;
}

function JobDetail({job,jobDetails,fees,totalFee,detailsLoading,onBack,onLogout,updateFee,acceptJob,declineJob,apiBase,token,onInstructionsViewed}){
  const pd = jobDetails?.proposalDetails;
  const client = jobDetails?.client; // only populated by the backend once job.status === 'accepted'
  const ms = jobDetails?.mondayStatus;
  const [tab,setTab]=useState("overview");
  const [pendingFeeRequests,setPendingFeeRequests]=useState([]);
  // Uses the real current pending state from the server, not just what
  // was optimistically set locally — so a denial (allowing re-request)
  // or approval is always reflected correctly, even without a reload.
  useEffect(()=>{setPendingFeeRequests(jobDetails?.pendingFeeRequestOptions||[]);},[jobDetails]);
  const requestFeeOption=async(optionKey)=>{
    try{
      const r=await fetch(apiBase+"/api/contractor/jobs/"+job.id+"/fee-requests",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({optionKey})});
      if(!r.ok){const d=await r.json().catch(()=>({}));if(r.status===409){setPendingFeeRequests(prev=>[...prev,optionKey]);return;}throw new Error(d.error||"Failed to send request");}
      setPendingFeeRequests(prev=>[...prev,optionKey]);
      alert("Request sent — you'll be notified once it's reviewed.");
    }catch(e){alert("Failed to send request: "+e.message);}
  };
  return (
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:12}}>
        <XPDLogo size={32} variant="white"/>
        <button onClick={onBack} style={{background:"none",border:"none",color:B.tone2,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",marginLeft:"auto"}}>← Back</button>
        <button onClick={onLogout} style={{background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Sign out</button>
      </nav>
      <div style={{maxWidth:700,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{marginBottom:16}}>
          {job.project?.job_number&&<span style={{fontSize:12,padding:"2px 10px",borderRadius:20,background:"#444",color:B.cream,fontWeight:600,marginRight:8}}>{job.project.job_number}</span>}
          <h1 style={{fontSize:22,fontWeight:700,color:B.black,margin:"8px 0 4px"}}>{job.project?.site_address||job.project?.name}</h1>
          <span style={{fontSize:12,padding:"3px 10px",borderRadius:20,background:job.status==="accepted"?"#EAF3DE":job.status==="declined"?"#FCEBEB":"#FEF3E8",color:job.status==="accepted"?"#2E5C10":job.status==="declined"?"#8B2020":B.orange,fontWeight:600}}>{job.status.toUpperCase()}</span>
        </div>
        {ms&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
            <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#F0EEF8",color:"#3D3580",fontWeight:600}}>{ms.jobType}</span>
            <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#FEF3E8",color:B.orange,fontWeight:600}}>{ms.stage}</span>
            <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:B.cream,color:B.black1,fontWeight:600,border:"1px solid "+B.tone1}}>{ms.revision}</span>
            <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"#EBF3FE",color:"#1A4A8A",fontWeight:600}}>{ms.timeline}</span>
          </div>
        )}
        {job.status==="accepted"&&(
          <div style={{display:"flex",gap:8,marginBottom:16,borderBottom:"1px solid "+B.tone1}}>
            {[["overview","Overview"],["instructions","Instructions & Markups"],["payments","Payments"],["messages","Messages"]].map(([id,label])=>(
              <div key={id} onClick={()=>setTab(id)} style={{padding:"8px 4px",borderBottom:"2px solid "+(tab===id?B.orange:"transparent"),color:tab===id?B.orange:B.black2,fontWeight:tab===id?600:400,fontSize:13,cursor:"pointer"}}>{label}</div>
            ))}
          </div>
        )}
        {tab==="instructions"?(
          <ContractorInstructions jobId={job.id} apiBase={apiBase} token={token} onViewed={onInstructionsViewed}/>
        ):tab==="payments"?(
          <ContractorInvoices jobId={job.id} apiBase={apiBase} token={token}/>
        ):tab==="messages"?(
          <Chat fetchUrl={"/api/contractor/jobs/"+job.id+"/messages"} apiBase={apiBase} token={token} currentRole="contractor"/>
        ):detailsLoading ? (
          <div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading...</div>
        ) : (
          <>
            {job.status==="accepted"&&ms&&<div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:14,fontWeight:600,color:B.black}}>Your Acceptance Fee</span><span style={{fontSize:18,fontWeight:700,color:B.orange}}>${jobDetails.dollarFee.toLocaleString()}</span></div>}
            {job.status==="accepted"&&client&&(
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16}}>
                <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 12px"}}>Client Details</h3>
                <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+B.cream}}>
                  <span style={{fontSize:13,color:B.black2}}>Name</span>
                  <span style={{fontSize:13,fontWeight:500,color:B.black}}>{client.name}</span>
                </div>
                {client.email&&(
                  <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+B.cream}}>
                    <span style={{fontSize:13,color:B.black2}}>Email</span>
                    <span style={{fontSize:13,fontWeight:500,color:B.black}}>{client.email}</span>
                  </div>
                )}
                {client.phone&&(
                  <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0"}}>
                    <span style={{fontSize:13,color:B.black2}}>Phone</span>
                    <span style={{fontSize:13,fontWeight:500,color:B.black}}>{client.phone}</span>
                  </div>
                )}
              </div>
            )}
            {pd?.briefing&&(
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16}}>
                <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 8px"}}>Client Briefing</h3>
                <p style={{fontSize:13,color:B.black1,lineHeight:1.7,margin:0,whiteSpace:"pre-wrap"}}>{pd.briefing}</p>
              </div>
            )}
            {pd?.dealValue&&(
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:600,color:B.black}}>Proposal Value</span>
                <span style={{fontSize:18,fontWeight:700,color:B.orange}}>${Number(pd.dealValue).toLocaleString()}</span>
              </div>
            )}
            {pd?.agreementUrl&&(
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:600,color:B.black}}>Signed Agreement</span>
                <a href={pd.agreementUrl} target="_blank" rel="noreferrer" style={{...btnPrimary,fontSize:12,textDecoration:"none"}}>Download →</a>
              </div>
            )}
            {pd?.proposalFiles?.length>0&&(
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16}}>
                <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 10px"}}>Proposal Files</h3>
                {pd.proposalFiles.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<pd.proposalFiles.length-1?"1px solid "+B.cream:"none"}}><span style={{fontSize:13,color:B.black1}}>{f.name}</span><a href={f.url} target="_blank" rel="noreferrer" style={{fontSize:12,color:B.orange}}>Download →</a></div>))}
              </div>
            )}
            {pd?.clientFiles?.length>0&&(
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16}}>
                <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 10px"}}>Files Received</h3>
                {pd.clientFiles.map((f,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<pd.clientFiles.length-1?"1px solid "+B.cream:"none"}}><span style={{fontSize:13,color:B.black1}}>{f.name}</span><a href={f.url} target="_blank" rel="noreferrer" style={{fontSize:12,color:B.orange}}>Download →</a></div>))}
              </div>
            )}
            {job.status==="pending"&&(()=>{
              const dealValue=parseFloat(pd?.dealValue)||0;
              const fmt=(pct)=>"$"+Math.round(dealValue*pct/100).toLocaleString();
              return (
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16}}>
                <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 16px"}}>Consultant Fee</h3>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,padding:"10px 0",borderBottom:"1px solid "+B.cream}}>
                  <span style={{fontSize:13,color:B.black1}}>Base fee</span>
                  <span style={{fontSize:14,fontWeight:600,color:B.black}}>25% ({fmt(25)})</span>
                </div>
                {[["siteVisit","Site Visit",5],["model3d","3D Model",5],["renders3d","3D Renders",5]].map(([key,label,pct])=>(
                  <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,padding:"10px 0",borderBottom:"1px solid "+B.cream}}>
                    <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:13,color:B.black1}}>
                      <input type="checkbox" checked={fees[key]} onChange={e=>updateFee({...fees,[key]:e.target.checked})} style={{width:16,height:16}}/>
                      {label} <span style={{fontSize:11,color:B.black2}}>(+{pct}% / +{fmt(pct)})</span>
                    </label>
                    <span style={{fontSize:13,fontWeight:500,color:fees[key]?B.orange:B.black2}}>{fees[key]?"+"+pct+"% / +"+fmt(pct):"—"}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderTop:"2px solid "+B.tone1,marginTop:4}}>
                  <span style={{fontSize:14,fontWeight:700,color:B.black}}>Total Fee</span>
                  <span style={{fontSize:20,fontWeight:700,color:B.orange}}>{totalFee}% ({fmt(totalFee)})</span>
                </div>
                <div style={{display:"flex",gap:12,marginTop:16}}>
                  <button onClick={declineJob} style={{...btnGhost,flex:1,justifyContent:"center",color:"#8B2020",borderColor:"#F7C1C1"}}>Decline job</button>
                  <button onClick={acceptJob} style={{...btnPrimary,flex:1,justifyContent:"center",background:"#2E5C10",border:"2px solid #639922"}}>Accept job ({totalFee}% / {fmt(totalFee)})</button>
                </div>
              </div>
              );
            })()}
            {job.status==="accepted"&&(
              <div style={{background:"#EAF3DE",border:"1px solid #639922",borderRadius:10,padding:"1.25rem",marginBottom:16,textAlign:"center"}}>
                <p style={{fontSize:14,color:"#2E5C10",fontWeight:600,margin:0}}>Job accepted at {job.total_fee}% fee</p>
                {(job.site_visit||job.model_3d||job.renders_3d)&&(
                  <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:8,flexWrap:"wrap"}}>
                    {job.site_visit&&<span style={{fontSize:11,padding:"2px 10px",borderRadius:20,background:B.white,color:"#2E5C10",border:"1px solid #639922",fontWeight:600}}>Site Visit</span>}
                    {job.model_3d&&<span style={{fontSize:11,padding:"2px 10px",borderRadius:20,background:B.white,color:"#2E5C10",border:"1px solid #639922",fontWeight:600}}>3D Model</span>}
                    {job.renders_3d&&<span style={{fontSize:11,padding:"2px 10px",borderRadius:20,background:B.white,color:"#2E5C10",border:"1px solid #639922",fontWeight:600}}>3D Renders</span>}
                  </div>
                )}
              </div>
            )}
            {job.status==="accepted"&&(!job.site_visit||!job.model_3d||!job.renders_3d)&&(
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16}}>
                <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 10px"}}>Request Additional Options</h3>
                <p style={{fontSize:12,color:B.black2,margin:"0 0 12px"}}>Requires admin approval before it's added to your fee.</p>
                {[["siteVisit","Site Visit",job.site_visit],["model3d","3D Model",job.model_3d],["renders3d","3D Renders",job.renders_3d]].filter(([,,has])=>!has).map(([key,label])=>{
                  const pending=pendingFeeRequests.includes(key);
                  return (
                    <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+B.cream}}>
                      <span style={{fontSize:13,color:B.black1}}>{label}</span>
                      <button onClick={()=>requestFeeOption(key)} disabled={pending} style={{...btnGhost,fontSize:12,opacity:pending?0.6:1,cursor:pending?"default":"pointer"}}>{pending?"Requested — pending":"Request"}</button>
                    </div>
                  );
                })}
              </div>
            )}
            {job.status==="accepted"&&<ContractorUpload jobId={job.id} apiBase={apiBase} token={token} stage={job.project?.stage}/>}
          </>
        )}
      </div>
    </div>
  );
}

function ContractorPortal({user,onLogout}){
  const [jobs,setJobs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selectedJob,setSelectedJob]=useState(null);
  const [jobDetails,setJobDetails]=useState(null);
  const [detailsLoading,setDetailsLoading]=useState(false);
  const [fees,setFees]=useState({siteVisit:false,model3d:false,renders3d:false});
  const [totalFee,setTotalFee]=useState(25);
  const API=process.env.REACT_APP_API_URL||"";
  const token=()=>localStorage.getItem("xpd_token");

  useEffect(()=>{
    fetch(API+"/api/contractor/jobs",{headers:{Authorization:"Bearer "+token()}})
      .then(r=>r.json()).then(d=>{setJobs(d.jobs||[]);setLoading(false);});
  },[]);

  const openJob=async(job)=>{
    setSelectedJob(job);
    setDetailsLoading(true);
    const d=await fetch(API+"/api/contractor/jobs/"+job.id+"/details",{headers:{Authorization:"Bearer "+token()}}).then(r=>r.json());
    setJobDetails(d);
    setFees({siteVisit:job.site_visit||false,model3d:job.model_3d||false,renders3d:job.renders_3d||false});
    setTotalFee(job.total_fee||25);
    setDetailsLoading(false);
  };

  const updateFee=async(newFees)=>{
    setFees(newFees);
    const d=await fetch(API+"/api/contractor/jobs/"+selectedJob.id+"/fee",{
      method:"PUT",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+token()},
      body:JSON.stringify({siteVisit:newFees.siteVisit,model3d:newFees.model3d,renders3d:newFees.renders3d})
    }).then(r=>r.json());
    setTotalFee(d.totalFee);
  };

  const acceptJob=async()=>{
    if(!window.confirm("Accept this job at "+totalFee+"% fee?"))return;
    await fetch(API+"/api/contractor/jobs/"+selectedJob.id+"/accept",{method:"POST",headers:{Authorization:"Bearer "+token()}});
    // Re-fetch details so the newly-unlocked client info shows immediately
    // instead of waiting for the contractor to re-open the job.
    const refreshed=await fetch(API+"/api/contractor/jobs/"+selectedJob.id+"/details",{headers:{Authorization:"Bearer "+token()}}).then(r=>r.json());
    setJobDetails(refreshed);
    setJobs(jobs.map(j=>j.id===selectedJob.id?{...j,status:"accepted",total_fee:totalFee}:j));
    setSelectedJob(prev=>prev?{...prev,status:"accepted",total_fee:totalFee}:prev);
    alert("Job accepted. You will be notified when drawings are assigned.");
  };

  const declineJob=async()=>{
    if(!window.confirm("Decline this job? This cannot be undone."))return;
    await fetch(API+"/api/contractor/jobs/"+selectedJob.id+"/decline",{method:"POST",headers:{Authorization:"Bearer "+token()}});
    setJobs(jobs.filter(j=>j.id!==selectedJob.id));
    setSelectedJob(null);
    alert("Job declined. Xpress Draft has been notified.");
  };

  if(selectedJob){
    return(
      <JobDetail
        job={selectedJob}
        jobDetails={jobDetails}
        fees={fees}
        totalFee={totalFee}
        detailsLoading={detailsLoading}
        onBack={()=>setSelectedJob(null)}
        onLogout={onLogout}
        updateFee={updateFee}
        acceptJob={acceptJob}
        declineJob={declineJob}
        apiBase={API}
        token={token()}
        onInstructionsViewed={()=>setJobs(prev=>prev.map(j=>j.id===selectedJob.id?{...j,hasNewInstructions:false}:j))}
      />
    );
  }

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}>
        <XPDLogo size={32} variant="white"/>
        <span style={{fontSize:13,color:B.tone2,marginLeft:"auto"}}>{user.name}</span>
        <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#378ADD",color:B.white,fontWeight:600}}>contractor</span>
        <button onClick={onLogout} style={{background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Sign out</button>
      </nav>
      <div style={{maxWidth:800,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{marginBottom:24}}>
          <h1 style={{fontSize:24,fontWeight:600,color:B.black,margin:0}}>My Jobs</h1>
          <p style={{fontSize:13,color:B.black2,margin:"4px 0 0"}}>Review and accept project offers from Xpress Draft.</p>
        </div>
        {loading&&<div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading...</div>}
        {!loading&&jobs.length===0&&<div style={{textAlign:"center",padding:"3rem",color:B.black2}}>No jobs assigned yet.</div>}
        <div style={{display:"grid",gap:12}}>
          {jobs.map(j=>(
            <div key={j.id} style={{background:B.white,border:"1px solid "+(j.hasNewInstructions?B.orange:B.tone1),borderRadius:10,padding:"1.25rem 1.5rem",cursor:"pointer",boxShadow:j.hasNewInstructions?"0 0 0 2px #FEF3E8":"none"}} onClick={()=>openJob(j)}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  {j.project?.job_number&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:20,background:"#444",color:B.cream,fontWeight:600,marginRight:8}}>{j.project.job_number}</span>}
                  {j.hasNewInstructions&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:B.orange,color:B.white,fontWeight:700,marginRight:8}}>NEW MARKUP</span>}
                  <span style={{fontWeight:600,fontSize:15,color:B.black}}>{j.project?.site_address||j.project?.name}</span>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                    {j.mondayStatus?.jobType&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#F0EEF8",color:"#3D3580",fontWeight:600}}>{j.mondayStatus.jobType}</span>}
                    {j.mondayStatus?.stage&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#FEF3E8",color:B.orange,fontWeight:600}}>{j.mondayStatus.stage}</span>}
                    {j.mondayStatus?.revision&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:B.cream,color:B.black1,fontWeight:600,border:"1px solid "+B.tone1}}>{j.mondayStatus.revision}</span>}
                    {j.mondayStatus?.timeline&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#EBF3FE",color:"#1A4A8A",fontWeight:600}}>{j.mondayStatus.timeline}</span>}
                    {j.status==="accepted"&&j.site_visit&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:B.white,color:"#2E5C10",border:"1px solid #639922",fontWeight:600}}>Site Visit</span>}
                    {j.status==="accepted"&&j.model_3d&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:B.white,color:"#2E5C10",border:"1px solid #639922",fontWeight:600}}>3D Model</span>}
                    {j.status==="accepted"&&j.renders_3d&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:B.white,color:"#2E5C10",border:"1px solid #639922",fontWeight:600}}>3D Renders</span>}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:j.status==="accepted"?"#EAF3DE":j.status==="declined"?"#FCEBEB":"#FEF3E8",color:j.status==="accepted"?"#2E5C10":j.status==="declined"?"#8B2020":B.orange,fontWeight:600}}>{j.status.toUpperCase()}</span>
                  {j.status==="accepted"&&<span style={{fontSize:12,color:B.black2}}>{j.total_fee}% (${(j.dollarFee||0).toLocaleString()})</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ContractorPortal;
