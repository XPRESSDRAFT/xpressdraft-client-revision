import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "./api";
import DrawingView from "./DrawingView";


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
  if(loading)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:B.cream,fontFamily:"Manrope,sans-serif"}}><div style={{color:B.black2}}>Loading…</div></div>);
  return(
    <BrowserRouter>
      <Routes>
        <Route path="/auth/verify" element={<VerifyPage onLogin={setUser}/>}/>
        <Route path="/*" element={user?<ProjectsPage user={user} onLogout={()=>{localStorage.removeItem("xpd_token");setUser(null);}}/>:<LoginPage onLogin={setUser}/>}/>
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
        <div style={{display:"flex",justifyContent:"center",marginBottom:20}}>
          <XPDLogo size={64}/>
        </div>
        <div style={{fontWeight:600,fontSize:20,color:B.black,textAlign:"center",marginBottom:4}}>
        </div>
        <div style={{fontSize:13,color:B.black2,marginBottom:28,textAlign:"center"}}>Plan Review Portal</div>
        {sent?(
          <div style={{padding:16,background:"#EAF3DE",borderRadius:8,color:"#2E5C10",fontSize:14,lineHeight:1.6}}>
            ✅ Check your email for a login link. It expires in 15 minutes.
          </div>
        ):(
          <>
            <label style={{fontSize:13,color:B.black1,display:"block",marginBottom:6,fontWeight:500}}>Email address</label>
            <input style={{width:"100%",border:`1px solid ${B.tone1}`,borderRadius:7,padding:"9px 11px",fontSize:14,fontFamily:"Manrope,sans-serif",boxSizing:"border-box",marginBottom:8}}
              type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="you@xpressdraft.com.au" onKeyDown={e=>e.key==="Enter"&&submit()}/>
            {err&&<p style={{color:"#8B2020",fontSize:13,margin:"0 0 8px"}}>{err}</p>}
            <button style={{width:"100%",padding:"10px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:14,fontFamily:"Manrope,sans-serif",fontWeight:600,marginTop:4}}
              onClick={submit} disabled={loading}>
              {loading?"Sending…":"Send login link →"}
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
        {status==="verifying"?"Verifying your login link…":"Invalid or expired link. Please request a new one."}
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
  const [clients,setClients]=useState([]);
  const [newClientId,setNewClientId]=useState("");
  const [activeProject,setActiveProject]=useState(null);
  const [showAdmin,setShowAdmin]=useState(false);
  const fileRefs=useRef({});

  useEffect(()=>{
    api.getProjects().then(d=>{setProjects(d.projects);setLoading(false);});
    if(user.role==="team"||user.role==="admin")api.getUsers().then(d=>setClients(d.users));
  },[]);

  const createProject=async()=>{
    if(!newName.trim())return;
    const d=await api.createProject({name:newName,description:newDesc,stage:newStage,clientId:newClientId||null,jobNumber:newJobNum,siteAddress:newAddress});
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

  if(showAdmin)return<AdminPage user={user} onBack={()=>setShowAdmin(false)}/>;
  if(activeProject)return<ProjectDetail project={activeProject} user={user} onBack={()=>setActiveProject(null)}/>;

  const isTeam=user.role==="team"||user.role==="admin";

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}>
        <XPDLogo size={32}/>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
          {user.role==="admin"&&<button onClick={()=>setShowAdmin(true)} style={{background:"none",border:`1px solid ${B.black2}`,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Admin</button>}
          <span style={{fontSize:13,color:B.tone2}}>{user.name}</span>
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:user.role==="admin"?"#7F77DD":user.role==="team"?B.orange:"#639922",color:B.white,fontWeight:600}}>{user.role}</span>
          <button onClick={onLogout} style={{background:"none",border:`1px solid ${B.black2}`,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Sign out</button>
        </div>
      </nav>
      <div style={{maxWidth:900,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
          <div>
            <h1 style={{fontSize:24,fontWeight:600,color:B.black,margin:0}}>Projects</h1>
            <p style={{fontSize:13,color:B.black2,margin:"4px 0 0"}}>Clear plans that keep your project moving.</p>
          </div>
          {isTeam&&(
            <button onClick={()=>setShowNew(v=>!v)} style={{marginLeft:"auto",padding:"8px 16px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600}}>
              + New project
            </button>
          )}
        </div>

        {showNew&&(
          <div style={{background:B.white,border:`1px solid ${B.tone1}`,borderRadius:10,padding:"1.25rem",marginBottom:20,borderLeft:`3px solid ${B.orange}`}}>
            <p style={{fontWeight:600,color:B.black,margin:"0 0 12px"}}>New project</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <input style={inputSt} placeholder="Job number (e.g. JAM001)" value={newJobNum} onChange={e=>setNewJobNum(e.target.value)}/>
              <input style={inputSt} placeholder="Client name / Project name" value={newName} onChange={e=>setNewName(e.target.value)}/>
            </div>
            <input style={{...inputSt,marginBottom:8}} placeholder="Site address" value={newAddress} onChange={e=>setNewAddress(e.target.value)}/>
            <input style={{...inputSt,marginBottom:8}} placeholder="Description (optional)" value={newDesc} onChange={e=>setNewDesc(e.target.value)}/>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              {[["preliminary","Preliminary"],["working_drawings","Working Drawings"]].map(([v,l])=>(
                <div key={v} onClick={()=>setNewStage(v)} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${newStage===v?B.orange:B.tone1}`,background:newStage===v?"#FEF3E8":B.white,color:newStage===v?B.orange:B.black2,cursor:"pointer",fontSize:13,fontWeight:newStage===v?600:400}}>{l}</div>
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

        {loading&&<div style={{textAlign:"center",padding:"3rem",color:B.black2}}>Loading projects…</div>}

        <div style={{display:"grid",gap:12}}>
          {projects.map(p=>{
            const rs=p.revisionSummary;
            const totalComments=(p.drawings||[]).reduce((a,d)=>a+(d.comments||[]).length,0);
            const displayName=[p.job_number,p.site_address,p.client?.name].filter(Boolean).join(" · ")||p.name;
            return(
              <div key={p.id} style={{background:B.white,border:`1px solid ${B.tone1}`,borderRadius:10,padding:"1.25rem 1.5rem"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                      {p.job_number&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:20,background:"#444444",color:B.cream,fontWeight:600}}>{p.job_number}</span>}
                      <span style={{fontWeight:600,fontSize:15,color:B.black}}>{p.site_address||p.name}</span>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:B.cream,color:B.black2,border:`1px solid ${B.tone1}`,fontWeight:500}}>
                        {rs?.stageLabel==="PR"?"Preliminary":"Working Drawings"}
                      </span>
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
                    {isTeam&&(
                      <>
                        <button onClick={()=>fileRefs.current[p.id]?.click()} style={btnGhost}>↑ Upload PDF</button>
                        <input ref={el=>fileRefs.current[p.id]=el} type="file" accept=".pdf" multiple style={{display:"none"}}
                          onChange={e=>handleUpload(p.id,Array.from(e.target.files))}/>
                        <button onClick={()=>deleteProject(p.id)} style={{...btnGhost,color:"#8B2020",borderColor:"#F7C1C1"}}>Delete</button>
                      </>
                    )}
                    {(p.drawings?.length||0)>0&&(
                      <button onClick={()=>setActiveProject(p)} style={btnPrimary}>Open →</button>
                    )}
                  </div>
                </div>
                {p.drawings?.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
                    {p.drawings.map(d=>(
                      <span key={d.id} style={{fontSize:12,padding:"3px 10px",background:B.cream,borderRadius:20,color:B.black1,border:`1px solid ${B.tone1}`}}>
                        📄 {d.name}{d.comments?.length>0?` · ${d.comments.length} comment${d.comments.length!==1?"s":""}`:""}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

  useEffect(()=>{
    api.getUsers().then(d=>{setUsers(d.users);setLoading(false);});
  },[]);

  const addUser=async()=>{
    if(!newName.trim()||!newEmail.trim())return;
    try{
      const d=await api.createUser({name:newName,email:newEmail,role:newRole,sendInvite});
      setUsers([...users,d.user]);
      setMsg(sendInvite?`✅ ${newName} added and invite sent.`:`✅ ${newName} added.`);
      setShowAdd(false);setNewName("");setNewEmail("");
    }catch(e){setMsg("❌ "+e.message);}
  };

  const removeUser=async(id,name)=>{
    if(!window.confirm(`Remove ${name}? They will lose access immediately.`))return;
    try{
      await fetch(`${process.env.REACT_APP_API_URL||""}/api/users/${id}`,{method:"DELETE",headers:{Authorization:`Bearer ${localStorage.getItem("xpd_token")}`}});
      setUsers(users.filter(u=>u.id!==id));
      setMsg(`✅ ${name} removed.`);
    }catch(e){setMsg("❌ Failed to remove user");}
  };

  const resendInvite=async(id,name)=>{
    try{
      await api.resendInvite(id);
      setMsg(`✅ Invite resent to ${name}.`);
    }catch(e){setMsg("❌ Failed to resend invite");}
  };

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:"#444444",padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}>
<XPDLogo size={40} variant="white"/>
        <span style={{color:B.black2,marginLeft:8}}>· Admin</span>
        <button onClick={onBack} style={{marginLeft:"auto",background:"none",border:`1px solid ${B.black2}`,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>← Back</button>
      </nav>
      <div style={{maxWidth:800,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
          <h1 style={{fontSize:22,fontWeight:600,color:B.black,margin:0}}>User Management</h1>
          <button onClick={()=>setShowAdd(v=>!v)} style={{...btnPrimary,marginLeft:"auto"}}>+ Add user</button>
        </div>

        {msg&&<div style={{padding:12,background:msg.startsWith("✅")?"#EAF3DE":"#FCEBEB",borderRadius:8,marginBottom:16,fontSize:13,color:msg.startsWith("✅")?"#2E5C10":"#8B2020"}}>{msg}</div>}

        {showAdd&&(
          <div style={{background:B.white,border:`1px solid ${B.tone1}`,borderRadius:10,padding:"1.25rem",marginBottom:20,borderLeft:`3px solid ${B.orange}`}}>
            <p style={{fontWeight:600,color:B.black,margin:"0 0 12px"}}>Add new user</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <input style={inputSt} placeholder="Full name" value={newName} onChange={e=>setNewName(e.target.value)}/>
              <input style={inputSt} placeholder="Email address" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[["client","Client"],["team","Team"],["admin","Admin"]].map(([v,l])=>(
                <div key={v} onClick={()=>setNewRole(v)} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${newRole===v?B.orange:B.tone1}`,background:newRole===v?"#FEF3E8":B.white,color:newRole===v?B.orange:B.black2,cursor:"pointer",fontSize:13,fontWeight:newRole===v?600:400}}>{l}</div>
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

        <div style={{background:B.white,border:`1px solid ${B.tone1}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto auto",gap:0,padding:"10px 16px",background:B.cream,borderBottom:`1px solid ${B.tone1}`,fontSize:11,fontWeight:600,color:B.black2,letterSpacing:"0.05em"}}>
            <span>NAME</span><span>EMAIL</span><span>ROLE</span><span></span><span></span>
          </div>
          {loading&&<div style={{padding:24,textAlign:"center",color:B.black2}}>Loading…</div>}
          {users.map(u=>(
            <div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto auto",gap:0,padding:"12px 16px",borderBottom:`1px solid ${B.cream}`,alignItems:"center"}}>
              <span style={{fontSize:14,fontWeight:500,color:B.black}}>{u.name}</span>
              <span style={{fontSize:13,color:B.black2}}>{u.email}</span>
              <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:u.role==="admin"?"#F0EEF8":u.role==="team"?"#FEF3E8":"#EAF3DE",color:u.role==="admin"?"#3D3580":u.role==="team"?B.orange:"#2E5C10",fontWeight:600,marginRight:8}}>{u.role}</span>
              <button onClick={()=>resendInvite(u.id,u.name)} style={{...btnGhost,fontSize:11,padding:"4px 10px",marginRight:6}}>Resend invite</button>
              <button onClick={()=>removeUser(u.id,u.name)} style={{...btnGhost,fontSize:11,padding:"4px 10px",color:"#8B2020",borderColor:"#F7C1C1"}}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({project,user,onBack}){
  const [drawings,setDrawings]=useState([]);
  const [activeDrawing,setActiveDrawing]=useState(null);
  const [loading,setLoading]=useState(true);
  const [revisionSummary,setRevisionSummary]=useState(project.revisionSummary);

  useEffect(()=>{
    api.getDrawings(project.id).then(d=>{
      setDrawings(d.drawings);
      if(d.drawings.length>0)setActiveDrawing(d.drawings[0]);
      setLoading(false);
    });
  },[]);

  const grantBonus=async()=>{
    await api.grantBonusRevision(project.id);
    const d=await api.getProject(project.id);
    setRevisionSummary(d.project.revisionSummary);
  };

  const rs=revisionSummary;
  const isTeam=user.role==="team"||user.role==="admin";

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:"#444444",padding:"0 20px",display:"flex",alignItems:"center",height:52,gap:12}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:B.tone2,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>← Projects</button>
        <span style={{color:B.black2}}>|</span>
        <span style={{fontWeight:600,fontSize:14,color:B.cream}}>
          {project.job_number&&<span style={{color:B.orange,marginRight:8}}>{project.job_number}</span>}
          {project.site_address||project.name}
        </span>
        {rs&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:16,background:B.black1,borderRadius:6,padding:"4px 12px"}}>
            <span style={{fontSize:12,color:B.tone1}}>{rs.stageLabel==="PR"?"Preliminary":"Working Drawings"} — Revision:</span>
            <span style={{fontSize:13,fontWeight:600,color:rs.used>=rs.totalAllowed?B.orange:B.cream}}>{rs.used} of {rs.totalAllowed}</span>
            {rs.bonusGranted>0&&<span style={{fontSize:10,background:"#7F77DD",color:B.white,borderRadius:4,padding:"1px 6px"}}>+{rs.bonusGranted} bonus</span>}
            {isTeam&&(
              <button onClick={grantBonus} style={{background:"#EA672F22",border:`1px solid ${B.orange}`,color:B.orange,borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:"Manrope,sans-serif",marginLeft:4}}>
                + Bonus
              </button>
            )}
          </div>
        )}
      </nav>
      <div style={{display:"flex",height:"calc(100vh - 52px)",overflow:"hidden"}}>
        <div style={{width:180,background:B.white,borderRight:`1px solid ${B.tone1}`,overflowY:"auto"}}>
          <div style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:B.black2,letterSpacing:"0.06em"}}>DRAWINGS</div>
          {drawings.map(d=>(
            <div key={d.id} onClick={()=>setActiveDrawing(d)}
              style={{padding:"9px 12px",cursor:"pointer",background:activeDrawing?.id===d.id?"#FEF3E8":"transparent",
                borderLeft:activeDrawing?.id===d.id?`3px solid ${B.orange}`:"3px solid transparent",
                borderBottom:`1px solid ${B.cream}`}}>
              <div style={{fontSize:12,fontWeight:activeDrawing?.id===d.id?600:400,color:activeDrawing?.id===d.id?B.orange:B.black}}>{d.name}</div>
              {d.comments?.length>0&&<div style={{fontSize:10,color:B.black2,marginTop:2}}>{d.comments.length} comments</div>}
            </div>
          ))}
        </div>
        {activeDrawing
          ?<DrawingView drawing={activeDrawing} user={user} project={project} revisionSummary={revisionSummary} onRevisionConfirmed={rs=>setRevisionSummary(rs)}/>
          :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:B.black2}}>{loading?"Loading…":"No drawings"}</div>
        }
      </div>
    </div>
  );
}

function XPDLogo({size=40, variant="color"}){
  const white="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_White.png";
  const color="https://xitgnfstcfbaoxqbwxug.supabase.co/storage/v1/object/public/public-assets/XPD%20Logo_RGB_Lockup_Combo.png";
  return <img src={variant==="white"?white:color} alt="Xpress Draft" style={{height:size,width:"auto",maxHeight:size}}/>;
}

const inputSt={width:"100%",border:`1px solid ${B.tone1}`,borderRadius:7,padding:"9px 11px",fontSize:14,fontFamily:"Manrope,sans-serif",background:B.white,color:B.black,boxSizing:"border-box",display:"block"};
const btnPrimary={padding:"7px 14px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600,display:"inline-flex",alignItems:"center",gap:5};
const btnGhost={padding:"6px 12px",background:B.white,color:B.black1,border:`1px solid ${B.tone1}`,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",display:"inline-flex",alignItems:"center",gap:5};
