// v2
import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "./api";
import DrawingView from "./DrawingView";
import ContractorPortal from "./ContractorPortal";

const B = {
  orange:"#EA672F",black:"#2A2B29",cream:"#F3EAE5",
  tone1:"#D2CAC4",tone2:"#A9A09B",black1:"#42453C",
  black2:"#5E635B",white:"#ffffff",
};

export default function App() {
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const token=localStorage.getItem("xpd_token");
    if(token){api.getMe().then(d=>{setUser(d.user);setLoading(false);}).catch(()=>{localStorage.removeItem("xpd_token");setLoading(false);});}
    else setLoading(false);
  },[]);
  if(loading)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:B.cream,fontFamily:"Manrope,sans-serif"}}><div style={{color:B.black2}}>Loading...</div></div>);
  return(
    <BrowserRouter>
      <Routes>
        <Route path="/auth/verify" element={<VerifyPage onLogin={setUser}/>}/>
        <Route path="/*" element={user?user.role==="contractor"?<ContractorPortal user={user} onLogout={()=>{localStorage.removeItem("xpd_token");setUser(null);}}/>:<ProjectsPage user={user} onLogout={()=>{localStorage.removeItem("xpd_token");setUser(null);}}/>:<LoginPage onLogin={setUser}/>}/>
      </Routes>
    </BrowserRouter>
  );
}

function LoginPage({onLogin}){
  const [email,setEmail]=useState("");
  const [sent,setSent]=useState(false);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const submit=async()=>{
    if(!email.trim())return;
    setLoading(true);
    try{await api.sendMagicLink(email);setSent(true);}
    catch(e){setErr(e.message);}
    setLoading(false);
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#444444",fontFamily:"Manrope,sans-serif"}}>
      <div style={{background:B.white,borderRadius:12,padding:"2.5rem",width:380}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><XPDLogo size={64}/></div>
        <div style={{fontSize:13,color:B.black2,marginBottom:28,textAlign:"center"}}>Plan Review Portal</div>
        {sent?(
          <div style={{padding:16,background:"#EAF3DE",borderRadius:8,color:"#2E5C10",fontSize:14,lineHeight:1.6}}>
            Check your email for a login link. It expires in 48 hours.
          </div>
        ):(
          <>
            <label style={{fontSize:13,color:B.black1,display:"block",marginBottom:6,fontWeight:500}}>Email address</label>
            <input style={{width:"100%",border:"1px solid "+B.tone1,borderRadius:7,padding:"9px 11px",fontSize:14,fontFamily:"Manrope,sans-serif",boxSizing:"border-box",marginBottom:8}}
              type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="you@xpressdraft.com.au" onKeyDown={e=>e.key==="Enter"&&submit()}/>
            {err&&<p style={{color:"#8B2020",fontSize:13,margin:"0 0 8px"}}>{err}</p>}
            <button style={{width:"100%",padding:"10px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:14,fontFamily:"Manrope,sans-serif",fontWeight:600,marginTop:4}}
              onClick={submit} disabled={loading}>
              {loading?"Sending...":"Send login link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function VerifyPage({onLogin}){
  const [searchParams]=useSearchParams();
  const navigate=useNavigate();
  const [status,setStatus]=useState("verifying");
  useEffect(()=>{
    const token=searchParams.get("token");
    if(!token){setStatus("error");return;}
    api.verifyMagicLink(token).then(d=>{
      localStorage.setItem("xpd_token",d.token);
      onLogin(d.user);navigate("/");
    }).catch(()=>setStatus("error"));
  },[]);
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <div style={{textAlign:"center",color:B.black2}}>
        {status==="verifying"?"Verifying your login link...":"Invalid or expired link. Please request a new one."}
      </div>
    </div>
  );
}

function ProjectsPage({user,onLogout}){
  const [projects,setProjects]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showNew,setShowNew]=useState(false);
  const [newName,setNewName]=useState("");
  const [newDesc,setNewDesc]=useState("");
  const [newStage,setNewStage]=useState("preliminary");
  const [newJobNum,setNewJobNum]=useState("");
  const [newAddress,setNewAddress]=useState("");
  const [newClientId,setNewClientId]=useState("");
  const [newContractorId,setNewContractorId]=useState("");
  const [newAssignedTo,setNewAssignedTo]=useState("");
  const [clients,setClientsAll]=useState([]);
  const [contractors,setContractors]=useState([]);
  const [teamMembers,setTeamMembers]=useState([]);
  const [activeProject,setActiveProject]=useState(null);
  const [showAdmin,setShowAdmin]=useState(false);
  const [showHealth,setShowHealth]=useState(false);
  const [editingProject,setEditingProject]=useState(null);
  const [editName,setEditName]=useState("");
  const [editJobNum,setEditJobNum]=useState("");
  const [editAddress,setEditAddress]=useState("");
  const [editStage,setEditStage]=useState("");
  const [editClientId,setEditClientId]=useState("");
  const [editContractorId,setEditContractorId]=useState("");
  const [editAssignedTo,setEditAssignedTo]=useState("");
  const [projectStatuses,setProjectStatuses]=useState({});
  const fileRefs=useRef({});

  useEffect(()=>{
    api.getProjects().then(d=>{setProjects(d.projects);setLoading(false);if(user.role==="client"){const tk=localStorage.getItem("xpd_token");d.projects.forEach(p=>{if(p.monday_item_id){fetch((process.env.REACT_APP_API_URL||"")+"/api/proposals/project-status/"+p.id,{headers:{Authorization:"Bearer "+tk}}).then(r=>r.json()).then(s=>setProjectStatuses(prev=>({...prev,[p.id]:s}))).catch(()=>{});}});}});
    if(user.role==="team"||user.role==="admin"||user.role==="contractor"){api.getUsers().then(d=>{setClientsAll(d.users.filter(u=>u.role==="client"));setContractors(d.users.filter(u=>u.role==="contractor"));setTeamMembers(d.users.filter(u=>u.role==="team"));});}
  },[]);

  const createProject=async()=>{
    if(!newName.trim())return;
    const d=await api.createProject({name:newName,description:newDesc,stage:newStage,clientId:newClientId||null,jobNumber:newJobNum,siteAddress:newAddress,contractorId:newContractorId||null,assignedTo:newAssignedTo||null});
    setProjects([d.project,...projects]);
    setShowNew(false);setNewName("");setNewDesc("");setNewJobNum("");setNewAddress("");
  };

  const handleUpload=async(projectId,files)=>{
    for(const file of files){
      if(!file.type.includes("pdf"))continue;
      await api.uploadDrawing(projectId,file);
    }
    const d=await api.getProjects();setProjects(d.projects);
  };

  const deleteProject=async(id)=>{
    if(!window.confirm("Delete this project?"))return;
    await api.deleteProject(id);
    setProjects(projects.filter(p=>p.id!==id));
  };

  const deleteDrawing=async(projectId,drawingId,e)=>{
    e.stopPropagation();
    if(!window.confirm("Delete this drawing?"))return;
    await api.deleteDrawing(projectId,drawingId);
    const d=await api.getProjects();setProjects(d.projects);
  };

  const editProjectName=async(p)=>{
    const current=p.site_address||p.name;
    const newVal=prompt("Edit project name / site address:",current);
    if(!newVal||!newVal.trim()||newVal===current)return;
    await api.updateProject(p.id,{siteAddress:newVal.trim()});
    setProjects(projects.map(x=>x.id===p.id?{...x,site_address:newVal.trim()}:x));
  };

  const unlockProject=async(p)=>{
    if(!window.confirm("Manually unlock "+(p.job_number||p.name)+"? This will give the client access without payment."))return;
    await api.updateProject(p.id,{locked:false,stripePaymentLink:null});
    const d=await api.getProjects();setProjects(d.projects);
  };

  const openEdit=(p)=>{
    setEditingProject(p);
    setEditName(p.site_address||p.name||"");
    setEditJobNum(p.job_number||"");
    setEditAddress(p.site_address||"");
    setEditStage(p.stage||"preliminary");
    setEditClientId(p.client_id||"");
    setEditContractorId(p.contractor_id||"");
    setEditAssignedTo(p.assigned_to||"");
  };

  const saveEdit=async()=>{
    if(!editingProject)return;
    await api.updateProject(editingProject.id,{
      name:editName,siteAddress:editAddress,jobNumber:editJobNum,
      stage:editStage,clientId:editClientId||null,
      contractorId:editContractorId||null,assignedTo:editAssignedTo||null
    });
    const d=await api.getProjects();setProjects(d.projects);
    setEditingProject(null);
  };

  if(showHealth)return<SystemHealthPage onBack={()=>setShowHealth(false)}/>;
  if(showAdmin)return<AdminPage user={user} onBack={()=>setShowAdmin(false)}/>;
  if(activeProject)return<ProjectDetail project={activeProject} user={user} onBack={()=>setActiveProject(null)}/>;

  const isTeam=user.role==="team"||user.role==="admin";

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      {editingProject&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:B.white,borderRadius:12,padding:28,width:480,fontFamily:"Manrope,sans-serif",maxHeight:"90vh",overflowY:"auto"}}>
            <h3 style={{margin:"0 0 16px",color:B.black,fontSize:16}}>Edit Project</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <input style={inputSt} placeholder="Job number" value={editJobNum} onChange={e=>setEditJobNum(e.target.value)}/>
              <input style={inputSt} placeholder="Project name" value={editName} onChange={e=>setEditName(e.target.value)}/>
            </div>
            <input style={{...inputSt,marginBottom:8}} placeholder="Site address" value={editAddress} onChange={e=>setEditAddress(e.target.value)}/>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              {[["preliminary","Preliminary"],["working_drawings","Working Drawings"]].map(([v,l])=>(
                <div key={v} onClick={()=>setEditStage(v)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+(editStage===v?B.orange:B.tone1),background:editStage===v?"#FEF3E8":B.white,color:editStage===v?B.orange:B.black2,cursor:"pointer",fontSize:13,fontWeight:editStage===v?600:400}}>{l}</div>
              ))}
            </div>
            {clients.length>0&&(
              <select style={{...inputSt,marginBottom:8}} value={editClientId} onChange={e=>setEditClientId(e.target.value)}>
                <option value="">No client assigned</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
              </select>
            )}
            {teamMembers.length>0&&(
              <select style={{...inputSt,marginBottom:8}} value={editAssignedTo} onChange={e=>setEditAssignedTo(e.target.value)}>
                <option value="">No team member assigned</option>
                {teamMembers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {contractors.length>0&&(
              <select style={{...inputSt,marginBottom:16}} value={editContractorId} onChange={e=>setEditContractorId(e.target.value)}>
                <option value="">No contractor assigned</option>
                {contractors.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setEditingProject(null)} style={btnGhost}>Cancel</button>
              <button onClick={saveEdit} style={btnPrimary}>Save changes</button>
            </div>
          </div>
        </div>
      )}
      <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}>
        <XPDLogo size={32} variant="white"/>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
          {user.role==="admin"&&<button onClick={()=>setShowAdmin(true)} style={{background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Admin</button>}
          {user.role==="admin"&&<button onClick={()=>setShowHealth(true)} style={{background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>System</button>}
          <span style={{fontSize:13,color:B.tone2}}>{user.name}</span>
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:user.role==="admin"?"#7F77DD":user.role==="team"?B.orange:user.role==="contractor"?"#378ADD":"#639922",color:B.white,fontWeight:600}}>{user.role}</span>
          <button onClick={onLogout} style={{background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Sign out</button>
        </div>
      </nav>
      <div style={{maxWidth:900,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
          <div>
            <h1 style={{fontSize:24,fontWeight:600,color:B.black,margin:0}}>Projects</h1>
            <p style={{fontSize:13,color:B.black2,margin:"4px 0 0"}}>Clear plans that keep your project moving.</p>
          </div>
          {isTeam&&<button onClick={()=>setShowNew(v=>!v)} style={{marginLeft:"auto",padding:"8px 16px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600}}>+ New project</button>}
        </div>
        {showNew&&(
          <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:20,borderLeft:"3px solid "+B.orange}}>
            <p style={{fontWeight:600,color:B.black,margin:"0 0 12px"}}>New project</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <input style={inputSt} placeholder="Job number (e.g. JAM001)" value={newJobNum} onChange={e=>setNewJobNum(e.target.value)}/>
              <input style={inputSt} placeholder="Client name / Project name" value={newName} onChange={e=>setNewName(e.target.value)}/>
            </div>
            <input style={{...inputSt,marginBottom:8}} placeholder="Site address" value={newAddress} onChange={e=>setNewAddress(e.target.value)}/>
            <input style={{...inputSt,marginBottom:8}} placeholder="Description (optional)" value={newDesc} onChange={e=>setNewDesc(e.target.value)}/>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              {[["preliminary","Preliminary"],["working_drawings","Working Drawings"]].map(([v,l])=>(
                <div key={v} onClick={()=>setNewStage(v)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+(newStage===v?B.orange:B.tone1),background:newStage===v?"#FEF3E8":B.white,color:newStage===v?B.orange:B.black2,cursor:"pointer",fontSize:13,fontWeight:newStage===v?600:400}}>{l}</div>
              ))}
            </div>
            {clients.length>0&&(
              <select style={{...inputSt,marginBottom:10}} value={newClientId} onChange={e=>setNewClientId(e.target.value)}>
                <option value="">No client assigned</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
              </select>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={createProject} style={btnPrimary}>Create project</button>
              <button onClick={()=>setShowNew(false)} style={btnGhost}>Cancel</button>
            </div>
          </div>
        )}
        {loading&&<div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading projects...</div>}
        {user.role==="client"?(
          <div style={{display:"grid",gap:16}}>
            {projects.map(p=>{
              const ps=projectStatuses[p.id];
              const timelineSteps=["STARTED","PROJECT OVERVIEW","3D MODEL","DESIGN","25%","50%","75%","FINAL REVISION"];
              const currentStep=ps?.timeline?timelineSteps.indexOf(ps.timeline):0;
              const step=currentStep>=0?currentStep:0;
              return(
                <div key={p.id} style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:12,padding:"1.5rem",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,gap:12}}>
                    <div>
                      {p.job_number&&<span style={{fontSize:12,padding:"2px 10px",borderRadius:20,background:"#444",color:B.cream,fontWeight:600,marginRight:8}}>{p.job_number}</span>}
                      <h3 style={{fontSize:16,fontWeight:700,color:B.black,margin:"8px 0 2px"}}>{p.site_address||p.name}</h3>
                      <span style={{fontSize:12,color:B.black2}}>{p.revisionSummary?.stageLabel==="PR"?"Preliminary":"Working Drawings"}</span>
                    </div>
                    <div style={{display:"flex",gap:8,flexShrink:0}}>
                      {ps?.stage&&<span style={{fontSize:12,padding:"4px 12px",borderRadius:20,background:"#FEF3E8",color:B.orange,fontWeight:600}}>{ps.stage}</span>}
                      {ps?.timeline&&<span style={{fontSize:12,padding:"4px 12px",borderRadius:20,background:"#EBF3FE",color:"#1A4A8A",fontWeight:600}}>{ps.timeline}</span>}
                    </div>
                  </div>
                  <div style={{marginBottom:16}}>
                    <div style={{display:"flex",alignItems:"center"}}>
                      {timelineSteps.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",flex:1,minWidth:0}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}><div style={{width:10,height:10,borderRadius:"50%",background:i<step?"#639922":i===step?B.orange:B.tone1,border:i===step?"2px solid "+B.orange:"none"}}/><div style={{fontSize:7,color:i<=step?B.black:B.black2,marginTop:3,textAlign:"center",maxWidth:40,lineHeight:1.2}}>{s}</div></div>{i<timelineSteps.length-1&&<div style={{height:2,flex:1,background:i<step?"#639922":B.tone1,marginBottom:14,minWidth:6}}/>}</div>))}
                    </div>
                  </div>
                  {ps?.designerName&&<div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:B.cream,borderRadius:8,marginBottom:12,border:"1px solid "+B.tone1}}><div style={{width:36,height:36,borderRadius:"50%",background:B.orange,display:"flex",alignItems:"center",justifyContent:"center",color:B.white,fontWeight:700,fontSize:14,flexShrink:0}}>{ps.designerName.charAt(0)}</div><div><div style={{fontSize:11,color:B.black2,fontWeight:600,letterSpacing:"0.05em"}}>ASSIGNED DESIGNER</div><div style={{fontSize:13,fontWeight:600,color:B.black}}>Xpress Draft</div>{ps.designerPhone&&<div style={{fontSize:12,color:B.black2}}>{ps.designerPhone}</div>}</div></div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
                    {p.locked&&p.stripe_payment_link
                      ?<a href={p.stripe_payment_link} target="_blank" rel="noreferrer" style={{...btnPrimary,background:"#8B2020",textDecoration:"none",fontSize:13}}>Pay to access plans →</a>
                      :(p.drawings?.length||0)>0&&<button onClick={()=>setActiveProject({...p,skipDashboard:true})} style={{...btnPrimary,fontSize:13}}>Review my drawings →</button>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        ):(
          <div style={{display:"grid",gap:12}}>
            {projects.map(p=>{
              const rs=p.revisionSummary;
              const totalComments=(p.drawings||[]).reduce((a,d)=>a+(d.comments||[]).length,0);
              return(
                <div key={p.id} style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem 1.5rem"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                        {p.job_number&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:20,background:"#444444",color:B.cream,fontWeight:600}}>{p.job_number}</span>}
                        <span style={{fontWeight:600,fontSize:15,color:B.black}}>{p.site_address||p.name}</span>
                        {isTeam&&<button onClick={()=>openEdit(p)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:B.black2,padding:"0 4px"}}>✏</button>}
                        <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:B.cream,color:B.black2,border:"1px solid "+B.tone1,fontWeight:500}}>{rs?.stageLabel==="PR"?"Preliminary":"Working Drawings"}</span>
                      </div>
                      {p.client&&<p style={{fontSize:13,color:B.black2,margin:"0 0 4px"}}>Client: {p.client.name}</p>}
                      {p.description&&<p style={{fontSize:13,color:B.black2,margin:"0 0 6px"}}>{p.description}</p>}
                      <div style={{fontSize:12,color:B.black2,display:"flex",gap:16,flexWrap:"wrap"}}>
                        <span>{p.drawings?.length||0} drawing{p.drawings?.length!==1?"s":""}</span>
                        <span>{totalComments} comment{totalComments!==1?"s":""}</span>
                        {rs&&<span style={{color:rs.overAllowance?"#8B2020":rs.used===rs.totalAllowed?B.orange:B.black2,fontWeight:rs.used>0?500:400}}>{rs.displayText} revisions</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {isTeam&&(<><button onClick={()=>fileRefs.current[p.id]?.click()} style={btnGhost}>Upload PDF</button><input ref={el=>fileRefs.current[p.id]=el} type="file" accept=".pdf" multiple style={{display:"none"}} onChange={e=>handleUpload(p.id,Array.from(e.target.files))}/>{p.locked&&user.role==="admin"&&<button onClick={()=>unlockProject(p)} style={{...btnGhost,color:"#639922",borderColor:"#639922"}}>Unlock</button>}<button onClick={()=>deleteProject(p.id)} style={{...btnGhost,color:"#8B2020",borderColor:"#F7C1C1"}}>Delete</button></>)}
                      {(p.drawings?.length||0)>0&&(p.locked&&user.role==='client'?<a href={p.stripe_payment_link||'#'} target="_blank" rel="noreferrer" style={{...btnPrimary,background:"#8B2020",textDecoration:"none"}}>{p.stripe_payment_link?"Pay to access plans":"Payment pending"}</a>:<button onClick={()=>setActiveProject(p)} style={btnPrimary}>Open</button>)}
                    </div>
                  </div>
                  {p.drawings?.length>0&&(<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>{p.drawings.map(d=>(<span key={d.id} style={{fontSize:12,padding:"3px 10px",background:B.cream,borderRadius:20,color:B.black1,border:"1px solid "+B.tone1,display:"inline-flex",alignItems:"center",gap:6}}>{d.name}{d.comments?.length>0?" · "+d.comments.length+" comment"+(d.comments.length!==1?"s":""):""}{isTeam&&<button onClick={e=>deleteDrawing(p.id,d.id,e)} style={{background:"none",border:"none",cursor:"pointer",color:"#8B2020",fontSize:11,padding:"0",lineHeight:1}}>✕</button>}</span>))}</div>)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminPage({user,onBack}){
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [newName,setNewName]=useState("");
  const [newEmail,setNewEmail]=useState("");
  const [newRole,setNewRole]=useState("client");
  const [sendInvite,setSendInvite]=useState(true);
  const [msg,setMsg]=useState("");
  const [editingUser,setEditingUser]=useState(null);
  const [editUserName,setEditUserName]=useState("");
  const [editUserEmail,setEditUserEmail]=useState("");
  const [editUserRole,setEditUserRole]=useState("");
  const [editUserPhone,setEditUserPhone]=useState("");

  useEffect(()=>{api.getUsers().then(d=>{setUsers(d.users);setLoading(false);});},[]);

  const addUser=async()=>{
    if(!newName.trim()||!newEmail.trim())return;
    try{
      const d=await api.createUser({name:newName,email:newEmail,role:newRole,sendInvite});
      setUsers([...users,d.user]);
      setMsg(sendInvite?"Added and invite sent.":"User added.");
      setShowAdd(false);setNewName("");setNewEmail("");
    }catch(e){setMsg("Error: "+e.message);}
  };

  const removeUser=async(id,name)=>{
    if(!window.confirm("Remove "+name+"?"))return;
    try{
      await fetch((process.env.REACT_APP_API_URL||"")+"/api/users/"+id,{method:"DELETE",headers:{Authorization:"Bearer "+localStorage.getItem("xpd_token")}});
      setUsers(users.filter(u=>u.id!==id));setMsg(name+" removed.");
    }catch(e){setMsg("Failed to remove user");}
  };

  const resendInvite=async(id,name)=>{
    try{await api.resendInvite(id);setMsg("Invite resent to "+name+".");}
    catch(e){setMsg("Failed to resend invite");}
  };

  const openEditUser=(u)=>{
    setEditingUser(u);
    setEditUserName(u.name||"");
    setEditUserEmail(u.email||"");
    setEditUserRole(u.role||"client");
    setEditUserPhone(u.phone||"");
  };

  const saveEditUser=async()=>{
    if(!editingUser)return;
    try{
      await fetch((process.env.REACT_APP_API_URL||"")+"/api/users/"+editingUser.id,{
        method:"PUT",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+localStorage.getItem("xpd_token")},
        body:JSON.stringify({name:editUserName,email:editUserEmail,role:editUserRole,phone:editUserPhone})
      });
      setUsers(users.map(u=>u.id===editingUser.id?{...u,name:editUserName,email:editUserEmail,role:editUserRole,phone:editUserPhone}:u));
      setEditingUser(null);
      setMsg("User updated successfully.");
    }catch(e){setMsg("Failed to update user");}
  };

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      {editingUser&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:B.white,borderRadius:12,padding:28,width:440,fontFamily:"Manrope,sans-serif"}}><h3 style={{margin:"0 0 16px",color:B.black,fontSize:16}}>Edit User</h3><input style={{...inputSt,marginBottom:8}} placeholder="Full name" value={editUserName} onChange={e=>setEditUserName(e.target.value)}/><input style={{...inputSt,marginBottom:8}} placeholder="Email address" value={editUserEmail} onChange={e=>setEditUserEmail(e.target.value)}/><input style={{...inputSt,marginBottom:8}} placeholder="Phone number" value={editUserPhone} onChange={e=>setEditUserPhone(e.target.value)}/><div style={{display:"flex",gap:8,marginBottom:16}}>{[["client","Client"],["team","Team"],["contractor","Contractor"],["admin","Admin"]].map(([v,l])=>(<div key={v} onClick={()=>setEditUserRole(v)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+(editUserRole===v?B.orange:B.tone1),background:editUserRole===v?"#FEF3E8":B.white,color:editUserRole===v?B.orange:B.black2,cursor:"pointer",fontSize:13,fontWeight:editUserRole===v?600:400}}>{l}</div>))}</div><div style={{display:"flex",gap:8}}><button onClick={()=>setEditingUser(null)} style={btnGhost}>Cancel</button><button onClick={saveEditUser} style={btnPrimary}>Save changes</button></div></div></div>)}
      <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}>
        <XPDLogo size={40} variant="white"/>
        <span style={{color:B.black2,marginLeft:8}}>Admin</span>
        <button onClick={onBack} style={{marginLeft:"auto",background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Back</button>
      </nav>
      <div style={{maxWidth:800,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
          <h1 style={{fontSize:22,fontWeight:600,color:B.black,margin:0}}>User Management</h1>
          <button onClick={()=>setShowAdd(v=>!v)} style={{...btnPrimary,marginLeft:"auto"}}>+ Add user</button>
        </div>
        {msg&&<div style={{padding:12,background:msg.startsWith("Error")||msg.startsWith("Failed")?"#FCEBEB":"#EAF3DE",borderRadius:8,marginBottom:16,fontSize:13,color:msg.startsWith("Error")||msg.startsWith("Failed")?"#8B2020":"#2E5C10"}}>{msg}</div>}
        {showAdd&&(
          <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:20,borderLeft:"3px solid "+B.orange}}>
            <p style={{fontWeight:600,color:B.black,margin:"0 0 12px"}}>Add new user</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <input style={inputSt} placeholder="Full name" value={newName} onChange={e=>setNewName(e.target.value)}/>
              <input style={inputSt} placeholder="Email address" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[["client","Client"],["team","Team"],["contractor","Contractor"],["admin","Admin"]].map(([v,l])=>(
                <div key={v} onClick={()=>setNewRole(v)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+(newRole===v?B.orange:B.tone1),background:newRole===v?"#FEF3E8":B.white,color:newRole===v?B.orange:B.black2,cursor:"pointer",fontSize:13,fontWeight:newRole===v?600:400}}>{l}</div>
              ))}
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:B.black1,marginBottom:12,cursor:"pointer"}}>
              <input type="checkbox" checked={sendInvite} onChange={e=>setSendInvite(e.target.checked)}/>
              Send invite email immediately
            </label>
            <div style={{display:"flex",gap:8}}>
              <button onClick={addUser} style={btnPrimary}>Add user</button>
              <button onClick={()=>setShowAdd(false)} style={btnGhost}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto auto auto",padding:"10px 16px",background:B.cream,borderBottom:"1px solid "+B.tone1,fontSize:11,fontWeight:600,color:B.black2,letterSpacing:"0.05em"}}>
            <span>NAME</span><span>EMAIL</span><span>ROLE</span><span></span><span></span><span></span>
          </div>
          {loading&&<div style={{padding:24,textAlign:"center",color:B.black2}}>Loading...</div>}
          {users.map(u=>(
            <div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto auto auto",padding:"12px 16px",borderBottom:"1px solid "+B.cream,alignItems:"center"}}>
              <span style={{fontSize:14,fontWeight:500,color:B.black}}>{u.name}</span>
              <span style={{fontSize:13,color:B.black2}}>{u.email}</span>
              <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:u.role==="admin"?"#F0EEF8":u.role==="team"?"#FEF3E8":u.role==="contractor"?"#EBF3FE":"#EAF3DE",color:u.role==="admin"?"#3D3580":u.role==="team"?B.orange:u.role==="contractor"?"#1A4A8A":"#2E5C10",fontWeight:600,marginRight:8}}>{u.role}</span>
              <button onClick={()=>openEditUser(u)} style={{...btnGhost,fontSize:11,padding:"4px 10px",marginRight:6}}>Edit</button>
              <button onClick={()=>resendInvite(u.id,u.name)} style={{...btnGhost,fontSize:11,padding:"4px 10px",marginRight:6}}>Resend invite</button>
              <button onClick={()=>removeUser(u.id,u.name)} style={{...btnGhost,fontSize:11,padding:"4px 10px",color:"#8B2020",borderColor:"#F7C1C1"}}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SystemHealthPage({onBack}){
  const [health,setHealth]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    fetch((process.env.REACT_APP_API_URL||"")+"/api/health/system",{
      headers:{Authorization:"Bearer "+localStorage.getItem("xpd_token")}
    }).then(r=>r.json()).then(d=>{setHealth(d);setLoading(false);}).catch(()=>setLoading(false));
  },[]);
  const Card=({title,status,items,link,linkLabel})=>(<div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:12}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><h3 style={{margin:0,fontSize:15,fontWeight:600,color:B.black}}>{title}</h3><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:8,height:8,borderRadius:"50%",background:status==="ok"?"#639922":status==="warn"?"#fdab3d":"#E24B4A"}}/><span style={{fontSize:12,color:B.black2}}>{status==="ok"?"Healthy":status==="warn"?"Check soon":"Action needed"}</span></div></div>{items.map((item,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<items.length-1?"1px solid "+B.cream:"none"}}><span style={{fontSize:13,color:B.black2}}>{item.label}</span><span style={{fontSize:13,fontWeight:500,color:item.warn?"#E24B4A":B.black}}>{item.value}</span></div>))}{link&&<a href={link} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:12,fontSize:12,color:B.orange,textDecoration:"none"}}>{linkLabel||"Open dashboard"} →</a>}</div>);
  const supabaseItems=health?[{label:"Storage used",value:health.supabase?.storageUsed||"—"},{label:"Storage limit",value:"1 GB (free tier)"},{label:"Database rows",value:health.supabase?.rows||"—"},{label:"MAU limit",value:"50,000 (free tier)"}]:[{label:"Loading...",value:""}];
  const resendItems=health?[{label:"Emails sent this month",value:health.resend?.sent||"—"},{label:"Monthly limit",value:"3,000 (free tier)"},{label:"Domain",value:"xpressdraft.com.au — Verified"}]:[{label:"Loading...",value:""}];
  const renderItems=[{label:"Backend",value:"xpressdraft-api (Free)"},{label:"Frontend",value:"xpressdraft-frontend (Free)"},{label:"Cold start delay",value:"~30 seconds after inactivity"},{label:"Recommendation",value:"Upgrade to Starter ($7/mo) to remove cold starts",warn:true}];
  const anthropicItems=[{label:"Model",value:"claude-sonnet-4-6"},{label:"Billing",value:"Pay per use"},{label:"Recommendation",value:"Set a monthly spend limit in Anthropic console"}];
  const mondayItems=[{label:"Board ID",value:"18388615760"},{label:"Webhook",value:"Active — DELIVERY STATUS"},{label:"Recommendation",value:"Verify API access is included in your Monday plan"}];
  return(<div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}><nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}><XPDLogo size={40} variant="white"/><span style={{color:B.black2,marginLeft:8,fontSize:13}}>System Health</span><button onClick={onBack} style={{marginLeft:"auto",background:"none",border:"1px solid "+B.black2,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Back</button></nav><div style={{maxWidth:700,margin:"0 auto",padding:"2rem 24px"}}><div style={{marginBottom:24}}><h1 style={{fontSize:22,fontWeight:600,color:B.black,margin:"0 0 4px"}}>System Health</h1><p style={{fontSize:13,color:B.black2,margin:0}}>Monitor service limits and plan usage across all suppliers.</p></div>{loading?<div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading...</div>:<><Card title="Supabase — Database & Storage" status={health?.supabase?.warn?"warn":"ok"} items={supabaseItems} link="https://supabase.com/dashboard/project/xitgnfstcfbaoxqbwxug" linkLabel="Open Supabase"/><Card title="Resend — Email" status={health?.resend?.warn?"warn":"ok"} items={resendItems} link="https://resend.com/overview" linkLabel="Open Resend"/><Card title="Render — Hosting" status="warn" items={renderItems} link="https://dashboard.render.com" linkLabel="Open Render"/><Card title="Anthropic — AI" status="ok" items={anthropicItems} link="https://console.anthropic.com" linkLabel="Open Anthropic"/><Card title="Monday.com — Job Management" status="ok" items={mondayItems} link="https://xpressdraft.monday.com" linkLabel="Open Monday"/></>}</div></div>);
}

function ProjectDetail({project,user,onBack}){
  const [drawings,setDrawings]=useState([]);
  const [activeDrawing,setActiveDrawing]=useState(null);
  const [loading,setLoading]=useState(true);
  const [revisionSummary,setRevisionSummary]=useState(project.revisionSummary);
  const [projectStatus,setProjectStatus]=useState(null);
  const [statusLoading,setStatusLoading]=useState(true);
  const [showDashboard,setShowDashboard]=useState(!project.skipDashboard);

  useEffect(()=>{
    api.getDrawings(project.id).then(d=>{
      setDrawings(d.drawings);
      if(d.drawings.length>0)setActiveDrawing(d.drawings[0]);
      setLoading(false);
    });
    fetch((process.env.REACT_APP_API_URL||"")+"/api/proposals/project-status/"+project.id,{
      headers:{Authorization:"Bearer "+localStorage.getItem("xpd_token")}
    }).then(r=>r.json()).then(d=>{setProjectStatus(d);setStatusLoading(false);}).catch(()=>setStatusLoading(false));
  },[]);

  const grantBonus=async()=>{
    await api.grantBonusRevision(project.id);
    const d=await api.getProject(project.id);
    setRevisionSummary(d.project.revisionSummary);
  };

  const rs=revisionSummary;
  const isTeam=user.role==="team"||user.role==="admin";

  if(user.role==="client"&&showDashboard){
    const timelineSteps=["STARTED","PROJECT OVERVIEW","3D MODEL","DESIGN","25%","50%","75%","FINAL REVISION"];
    const currentStep=projectStatus?.timeline?timelineSteps.indexOf(projectStatus.timeline):0;
    const step=currentStep>=0?currentStep:0;
    return(
      <div style={{minHeight:"100vh",background:B.white,fontFamily:"Manrope,sans-serif"}}>
        <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:B.tone2,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>← Back to projects</button>
        </nav>
        <div style={{maxWidth:"100%",padding:"2rem 32px"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:40,gap:24}}>
            <div>
              <XPDLogo size={48} variant="color"/>
              <div style={{marginTop:16}}>
                {project.job_number&&<span style={{fontSize:12,padding:"2px 10px",borderRadius:20,background:B.orange,color:B.white,fontWeight:600}}>{project.job_number}</span>}
                <h1 style={{fontSize:22,fontWeight:700,color:B.black,margin:"8px 0 4px"}}>{project.site_address||project.name}</h1>
                <p style={{fontSize:13,color:B.black2,margin:0}}>Client Portal</p>
              </div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:32}}>{[{label:"Stage",value:statusLoading?"…":projectStatus?.stage||"Setup",bg:"#FEF3E8",color:B.orange,border:"1px solid "+B.tone1},{label:"Revision",value:statusLoading?"…":projectStatus?.revision||"—",bg:B.cream,color:B.black1,border:"1px solid "+B.tone1},{label:"Timeline",value:statusLoading?"…":projectStatus?.timeline||"STARTED",bg:"#EBF3FE",color:"#1A4A8A",border:"1px solid #C5DCF5"}].map((s,i)=>(<div key={i} style={{background:s.bg,border:s.border,borderRadius:12,padding:"20px 16px",textAlign:"center"}}><div style={{fontSize:11,color:B.black2,fontWeight:600,letterSpacing:"0.08em",marginBottom:8}}>{s.label.toUpperCase()}</div><div style={{fontSize:16,fontWeight:700,color:s.color}}>{s.value}</div></div>))}</div>
          {(()=>{const step2=currentStep>=0?currentStep:0;return(<div style={{background:B.cream,borderRadius:12,padding:"20px 24px",marginBottom:32,border:"1px solid "+B.tone1}}><div style={{fontSize:11,color:B.black2,fontWeight:600,letterSpacing:"0.08em",marginBottom:16}}>PROJECT PROGRESS</div><div style={{display:"flex",alignItems:"center",overflowX:"auto"}}>{timelineSteps.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",flex:1,minWidth:0}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1}}><div style={{width:12,height:12,borderRadius:"50%",background:i<step2?"#639922":i===step2?B.orange:B.tone1,border:i===step2?"2px solid "+B.orange:"none"}}/><div style={{fontSize:8,color:i<=step2?B.black:B.black2,marginTop:4,textAlign:"center",maxWidth:48,lineHeight:1.2}}>{s}</div></div>{i<timelineSteps.length-1&&<div style={{height:2,flex:1,background:i<step2?"#639922":B.tone1,marginBottom:16,minWidth:8}}/>}</div>))}</div></div>);})()}
          {!statusLoading&&!projectStatus?.stage&&(<div style={{background:B.cream,borderRadius:12,padding:"24px",marginBottom:32,border:"1px solid "+B.tone1,textAlign:"center"}}><p style={{color:B.black2,fontSize:14,lineHeight:1.8,margin:0}}>Your project is in the setup stage — our team is reviewing your brief, getting familiar with the site and preparing everything before we begin drafting.<br/><br/>You'll be notified as soon as your drawings are ready for review.</p></div>)}
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>{drawings.length>0&&!project.locked&&<button onClick={()=>setShowDashboard(false)} style={{...btnPrimary,fontSize:15,padding:"14px 32px"}}>Review my drawings →</button>}{project.locked&&project.stripe_payment_link&&<a href={project.stripe_payment_link} target="_blank" rel="noreferrer" style={{...btnPrimary,fontSize:15,padding:"14px 32px",background:"#8B2020",textDecoration:"none"}}>Pay to access plans →</a>}{drawings.length>0&&!project.locked&&<button onClick={async()=>{if(!window.confirm("Approve drawings?\n\nThis will send a confirmation to Xpress Draft to proceed to the final set."))return;try{await fetch((process.env.REACT_APP_API_URL||"")+"/api/monday/approve",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+localStorage.getItem("xpd_token")},body:JSON.stringify({projectId:project.id})});alert("Your approval has been sent.");}catch(e){alert("Error: "+e.message);}}} style={{...btnPrimary,fontSize:15,padding:"14px 32px",background:"#2E5C10",border:"2px solid #639922"}}>Approve drawings ✓</button>}</div>
        </div>
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:"#444444",padding:"0 20px",display:"flex",alignItems:"center",height:52,gap:12}}>
        <button onClick={()=>user.role==="client"?setShowDashboard(true):onBack()} style={{background:"none",border:"none",color:B.tone2,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>{user.role==="client"?"← Dashboard":"Projects"}</button>
        <span style={{color:B.black2}}>|</span>
        <span style={{fontWeight:600,fontSize:14,color:B.cream}}>
          {project.job_number&&<span style={{color:B.orange,marginRight:8}}>{project.job_number}</span>}
          {project.site_address||project.name}
        </span>
        {rs&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:16,background:B.black1,borderRadius:6,padding:"4px 12px"}}>
            <span style={{fontSize:12,color:B.tone1}}>{rs.stageLabel==="PR"?"Preliminary":"Working Drawings"} - Revision:</span>
            <span style={{fontSize:13,fontWeight:600,color:rs.used>=rs.totalAllowed?B.orange:B.cream}}>{rs.used} of {rs.totalAllowed}</span>
            {rs.bonusGranted>0&&<span style={{fontSize:10,background:"#7F77DD",color:B.white,borderRadius:4,padding:"1px 6px"}}>+{rs.bonusGranted} bonus</span>}
            {isTeam&&<button onClick={grantBonus} style={{background:"#EA672F22",border:"1px solid "+B.orange,color:B.orange,borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"Manrope,sans-serif",marginLeft:4}}>+ Bonus</button>}
          </div>
        )}
      </nav>
      <div style={{display:"flex",height:"calc(100vh - 52px)",overflow:"hidden"}}>
        <div style={{width:180,background:B.white,borderRight:"1px solid "+B.tone1,overflowY:"auto"}}>
          <div style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:B.black2,letterSpacing:"0.06em"}}>DRAWINGS</div>
          {drawings.map(d=>(
            <div key={d.id} onClick={()=>setActiveDrawing(d)}
              style={{padding:"9px 12px",cursor:"pointer",background:activeDrawing?.id===d.id?"#FEF3E8":"transparent",
                borderLeft:activeDrawing?.id===d.id?"3px solid "+B.orange:"3px solid transparent",
                borderBottom:"1px solid "+B.cream}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:12,fontWeight:activeDrawing?.id===d.id?600:400,color:activeDrawing?.id===d.id?B.orange:B.black,flex:1}}>{d.name}</div>
                {isTeam&&<button onClick={e=>{e.stopPropagation();if(!window.confirm("Delete this drawing?"))return;api.deleteDrawing(project.id,d.id).then(()=>setDrawings(drawings.filter(x=>x.id!==d.id)));}} style={{background:"none",border:"none",cursor:"pointer",color:"#8B2020",fontSize:11,padding:"2px 4px"}}>✕</button>}
              </div>
              {d.comments?.length>0&&<div style={{fontSize:10,color:B.black2,marginTop:2}}>{d.comments.length} comments</div>}
            </div>
          ))}
        </div>
        {activeDrawing && project.locked && user.role === 'client'
          ?<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:B.cream,gap:16,padding:40}}>
            <div style={{fontSize:32}}>🔒</div>
            <h2 style={{color:B.black,margin:0,fontSize:20}}>Payment required</h2>
            <p style={{color:B.black2,fontSize:14,textAlign:"center",maxWidth:400,lineHeight:1.6}}>Your drawings are ready but require payment before access. Please check your email for the payment link.</p>
            <a href="mailto:info@xpressdraft.com.au" style={{color:B.orange,fontSize:13}}>Contact us at info@xpressdraft.com.au</a>
          </div>
          :activeDrawing
            ?<DrawingView drawing={activeDrawing} user={user} project={project} revisionSummary={revisionSummary} onRevisionConfirmed={rs=>setRevisionSummary(rs)}/>
            :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:B.black2}}>{loading?"Loading...":"No drawings"}</div>
        }
      </div>
    </div>
  );
}

function XPDLogo({size=40,variant="color"}){
  const white="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_White.png";
  const color="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png";
  return <img src={variant==="white"?white:color} alt="Xpress Draft" style={{height:size,width:"auto",maxHeight:size}}/>;
}

const inputSt={width:"100%",border:"1px solid "+B.tone1,borderRadius:7,padding:"9px 11px",fontSize:14,fontFamily:"Manrope,sans-serif",background:B.white,color:B.black,boxSizing:"border-box",display:"block"};
const btnPrimary={padding:"7px 14px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600,display:"inline-flex",alignItems:"center",gap:5};
const btnGhost={padding:"6px 12px",background:B.white,color:B.black1,border:"1px solid "+B.tone1,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",display:"inline-flex",alignItems:"center",gap:5};
