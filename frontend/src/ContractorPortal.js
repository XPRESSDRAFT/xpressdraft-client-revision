import { useState, useEffect } from "react";
import ContractorUpload from "./ContractorUpload";

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

function JobDetail({job,jobDetails,fees,totalFee,detailsLoading,onBack,onLogout,updateFee,acceptJob,declineJob,apiBase,token}){
  const pd = jobDetails?.proposalDetails;
  const client = jobDetails?.client; // only populated by the backend once job.status === 'accepted'
  return (
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:12}}>
        <XPDLogo size={32} variant="white"/>
        <button onClick={onBack} style={{background:"none",border:"none",color:B.tone2,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",marginLeft:"auto"}}>← Back</button>
        <button onClick={onLogout} style={{background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Sign out</button>
      </nav>
      <div style={{maxWidth:700,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{marginBottom:24}}>
          {job.project?.job_number&&<span style={{fontSize:12,padding:"2px 10px",borderRadius:20,background:"#444",color:B.cream,fontWeight:600,marginRight:8}}>{job.project.job_number}</span>}
          <h1 style={{fontSize:22,fontWeight:700,color:B.black,margin:"8px 0 4px"}}>{job.project?.site_address||job.project?.name}</h1>
          <span style={{fontSize:12,padding:"3px 10px",borderRadius:20,background:job.status==="accepted"?"#EAF3DE":job.status==="declined"?"#FCEBEB":"#FEF3E8",color:job.status==="accepted"?"#2E5C10":job.status==="declined"?"#8B2020":B.orange,fontWeight:600}}>{job.status.toUpperCase()}</span>
        </div>
        {detailsLoading ? (
          <div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading...</div>
        ) : (
          <>
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
            {job.status==="pending"&&(
              <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16}}>
                <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 16px"}}>Consultant Fee</h3>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,padding:"10px 0",borderBottom:"1px solid "+B.cream}}>
                  <span style={{fontSize:13,color:B.black1}}>Base fee</span>
                  <span style={{fontSize:14,fontWeight:600,color:B.black}}>25%</span>
                </div>
                {[["siteVisit","Site Visit",5],["model3d","3D Model",5],["renders3d","3D Renders",5]].map(([key,label,pct])=>(
                  <div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,padding:"10px 0",borderBottom:"1px solid "+B.cream}}>
                    <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:13,color:B.black1}}>
                      <input type="checkbox" checked={fees[key]} onChange={e=>updateFee({...fees,[key]:e.target.checked})} style={{width:16,height:16}}/>
                      {label} <span style={{fontSize:11,color:B.black2}}>(+{pct}%)</span>
                    </label>
                    <span style={{fontSize:13,fontWeight:500,color:fees[key]?B.orange:B.black2}}>{fees[key]?"+"+pct+"%":"—"}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderTop:"2px solid "+B.tone1,marginTop:4}}>
                  <span style={{fontSize:14,fontWeight:700,color:B.black}}>Total Fee</span>
                  <span style={{fontSize:20,fontWeight:700,color:B.orange}}>{totalFee}%</span>
                </div>
                <div style={{display:"flex",gap:12,marginTop:16}}>
                  <button onClick={declineJob} style={{...btnGhost,flex:1,justifyContent:"center",color:"#8B2020",borderColor:"#F7C1C1"}}>Decline job</button>
                  <button onClick={acceptJob} style={{...btnPrimary,flex:1,justifyContent:"center",background:"#2E5C10",border:"2px solid #639922"}}>Accept job ({totalFee}%)</button>
                </div>
              </div>
            )}
            {job.status==="accepted"&&(
              <div style={{background:"#EAF3DE",border:"1px solid #639922",borderRadius:10,padding:"1.25rem",marginBottom:16,textAlign:"center"}}>
                <p style={{fontSize:14,color:"#2E5C10",fontWeight:600,margin:0}}>Job accepted at {job.total_fee}% fee</p>
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
    setJobs(jobs.map(j=>j.id===selectedJob.id?{...j,status:"accepted"}:j));
    setSelectedJob(prev=>prev?{...prev,status:"accepted"}:prev);
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
            <div key={j.id} style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem 1.5rem",cursor:"pointer"}} onClick={()=>openJob(j)}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  {j.project?.job_number&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:20,background:"#444",color:B.cream,fontWeight:600,marginRight:8}}>{j.project.job_number}</span>}
                  <span style={{fontWeight:600,fontSize:15,color:B.black}}>{j.project?.site_address||j.project?.name}</span>
                  <div style={{fontSize:12,color:B.black2,marginTop:4}}>{j.project?.stage==="preliminary"?"Preliminary":"Working Drawings"}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:j.status==="accepted"?"#EAF3DE":j.status==="declined"?"#FCEBEB":"#FEF3E8",color:j.status==="accepted"?"#2E5C10":j.status==="declined"?"#8B2020":B.orange,fontWeight:600}}>{j.status.toUpperCase()}</span>
                  {j.status==="accepted"&&<span style={{fontSize:12,color:B.black2}}>{j.total_fee}%</span>}
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
