import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "./api";

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
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:B.black,fontFamily:"Manrope,sans-serif"}}>
      <div style={{background:B.white,borderRadius:12,padding:"2.5rem",width:380}}>
        <XPDLogo size={48}/>
        <div style={{fontWeight:600,fontSize:20,color:B.black,marginTop:12}}><span style={{color:B.orange}}>Xpress</span> Draft</div>
        <div style={{fontSize:13,color:B.black2,marginBottom:28,marginTop:4}}>Plan Review Portal</div>
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
  const [clients,setClients]=useState([]);
  const [newClientId,setNewClientId]=useState("");
  const [activeProject,setActiveProject]=useState(null);
  const fileRefs=useRef({});

  useEffect(()=>{
    api.getProjects().then(d=>{setProjects(d.projects);setLoading(false);});
    if(user.role==="team")api.getUsers().then(d=>setClients(d.users));
  },[]);

  const createProject=async()=>{
    if(!newName.trim())return;
    const d=await api.createProject({name:newName,description:newDesc,stage:newStage,clientId:newClientId||null});
    setProjects([d.project,...projects]);
    setShowNew(false);setNewName("");setNewDesc("");
  };

  const handleUpload=async(projectId,files)=>{
    for(const file of files){
      if(!file.type.includes("pdf"))continue;
      await api.uploadDrawing(projectId,file);
    }
    const d=await api.getProjects();setProjects(d.projects);
  };

  if(activeProject)return <ProjectDetail project={activeProject} user={user} onBack={()=>setActiveProject(null)}/>;

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:B.black,padding:"0 24px",display:"flex",alignItems:"center",height:52}}>
        <XPDLogo size={30}/>
        <span style={{fontWeight:600,fontSize:15,color:B.cream,marginLeft:10}}><span style={{color:B.orange}}>Xpress</span> Draft</span>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:13,color:B.tone2}}>{user.name}</span>
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:user.role==="team"?B.orange:"#639922",color:B.white,fontWeight:600}}>{user.role}</span>
          <button onClick={onLogout} style={{background:"none",border:`1px solid ${B.black2}`,color:B.tone2,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>Sign out</button>
        </div>
      </nav>
      <div style={{maxWidth:860,margin:"0 auto",padding:"2rem 24px"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:24}}>
          <div>
            <h1 style={{fontSize:24,fontWeight:600,color:B.black,margin:0}}>Projects</h1>
            <p style={{fontSize:13,color:B.black2,margin:"4px 0 0"}}>Clear plans that keep your project moving.</p>
          </div>
          {user.role==="team"&&(
            <button onClick={()=>setShowNew(v=>!v)} style={{marginLeft:"auto",padding:"8px 16px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600}}>
              + New project
            </button>
          )}
        </div>

        {showNew&&(
          <div style={{background:B.white,border:`1px solid ${B.tone1}`,borderRadius:10,padding:"1.25rem",marginBottom:20,borderLeft:`3px solid ${B.orange}`}}>
            <p style={{fontWeight:600,color:B.black,margin:"0 0 12px"}}>New project</p>
            <input style={inputSt} placeholder="Project name" value={newName} onChange={e=>setNewName(e.target.value)}/>
            <input style={{...inputSt,marginTop:8}} placeholder="Description (optional)" value={newDesc} onChange={e=>setNewDesc(e.target.value)}/>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              {[["preliminary","Preliminary"],["working_drawings","Working Drawings"]].map(([v,l])=>(
                <div key={v} onClick={()=>setNewStage(v)} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${newStage===v?B.orange:B.tone1}`,background:newStage===v?"#FEF3E8":B.white,color:newStage===v?B.orange:B.black2,cursor:"pointer",fontSize:13,fontWeight:newStage===v?600:400}}>{l}</div>
              ))}
            </div>
            {user.role==="team"&&clients.length>0&&(
              <select style={{...inputSt,marginTop:8}} value={newClientId} onChange={e=>setNewClientId(e.target.value)}>
                <option value="">No client assigned</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
              </select>
            )}
            <div style={{display:"flex",gap:8,marginTop:14}}>
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
            return(
              <div key={p.id} style={{background:B.white,border:`1px solid ${B.tone1}`,borderRadius:10,padding:"1.25rem 1.5rem"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontWeight:600,fontSize:16,color:B.black}}>{p.name}</span>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:B.cream,color:B.black2,border:`1px solid ${B.tone1}`,fontWeight:500}}>
                        {rs?.stageLabel==="PR"?"Preliminary":"Working Drawings"}
                      </span>
                    </div>
                    {p.description&&<p style={{fontSize:13,color:B.black2,margin:"0 0 6px"}}>{p.description}</p>}
                    <div style={{fontSize:12,color:B.black2,display:"flex",gap:16}}>
                      <span>{p.drawings?.length||0} drawing{p.drawings?.length!==1?"s":""}</span>
                      <span>{totalComments} comment{totalComments!==1?"s":""}</span>
                      {rs&&<span style={{color:rs.overAllowance?"#8B2020":rs.used===rs.totalAllowed?B.orange:B.black2,fontWeight:rs.used>0?500:400}}>{rs.displayText} revisions</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0}}>
                    {user.role==="team"&&(
                      <>
                        <button onClick={()=>fileRefs.current[p.id]?.click()} style={btnGhost}>↑ Upload PDF</button>
                        <input ref={el=>fileRefs.current[p.id]=el} type="file" accept=".pdf" multiple style={{display:"none"}}
                          onChange={e=>handleUpload(p.id,Array.from(e.target.files))}/>
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

  return(
    <div style={{minHeight:"100vh",background:B.cream,fontFamily:"Manrope,sans-serif"}}>
      <nav style={{background:B.black,padding:"0 20px",display:"flex",alignItems:"center",height:52,gap:12}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:B.tone2,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif"}}>← Projects</button>
        <span style={{color:B.black2}}>|</span>
        <span style={{fontWeight:600,fontSize:14,color:B.cream}}>{project.name}</span>
        {rs&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:16,background:B.black1,borderRadius:6,padding:"4px 12px"}}>
            <span style={{fontSize:12,color:B.tone1}}>{rs.stageLabel==="PR"?"Preliminary":"Working Drawings"} — Revision:</span>
            <span style={{fontSize:13,fontWeight:600,color:rs.used>=rs.totalAllowed?B.orange:B.cream}}>{rs.used} of {rs.totalAllowed}</span>
            {user.role==="team"&&(
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
          ?<DrawingView drawing={activeDrawing} user={user} project={project} onRevisionConfirmed={rs=>setRevisionSummary(rs)}/>
          :<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:B.black2}}>{loading?"Loading…":"No drawings"}</div>
        }
      </div>
    </div>
  );
}

function DrawingView({drawing,user,project,onRevisionConfirmed}){
  const canvasRef=useRef();
  const markupRef=useRef();
  const wrapRef=useRef();
  const [comments,setComments]=useState([]);
  const [markups,setMarkups]=useState([]);
  const [tool,setTool]=useState("pen");
  const [color,setColor]=useState("#EA672F");
  const [strokeW,setStrokeW]=useState(2);
  const [newComment,setNewComment]=useState("");
  const [ctype,setCtype]=useState("issue");
  const [pendingPin,setPendingPin]=useState(null);
  const [selectedCid,setSelectedCid]=useState(null);
  const [replyDraft,setReplyDraft]=useState("");
  const [replyTarget,setReplyTarget]=useState(null);
  const [improving,setImproving]=useState(false);
  const [interpreting,setInterpreting]=useState(null);
  const [saving,setSaving]=useState(false);
  const [pdfReady,setPdfReady]=useState(!!window.pdfjsLib);
  const [pdfDoc,setPdfDoc]=useState(null);
  const [page,setPage]=useState(1);
  const [totalPages,setTotalPages]=useState(1);
  const drawingRef=useRef(false);
  const curPath=useRef([]);
  const startXY=useRef({x:0,y:0});
  const pathsRef=useRef([]);

  useEffect(()=>{
    api.getComments(drawing.id).then(d=>setComments(d.comments));
    api.getMarkups(drawing.id).then(d=>{if(d.markups.length>0){pathsRef.current=d.markups[0].paths||[];setMarkups(d.markups[0].paths||[]);}});
  },[drawing.id]);

  useEffect(()=>{
    if(pdfReady)return;
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";setPdfReady(true);};
    document.head.appendChild(s);
  },[]);

  useEffect(()=>{
    if(!pdfReady||!drawing.file_url)return;
    window.pdfjsLib.getDocument({url:drawing.file_url}).promise
      .then(doc=>{setPdfDoc(doc);setTotalPages(doc.numPages);})
      .catch(console.error);
  },[pdfReady,drawing.file_url]);

  useEffect(()=>{
    if(!pdfDoc)return;
    pdfDoc.getPage(page).then(pg=>{
      const wrap=wrapRef.current;if(!wrap)return;
      const vp0=pg.getViewport({scale:1});
      const scale=(wrap.clientWidth-48)/vp0.width;
      const vp=pg.getViewport({scale});
      canvasRef.current.width=vp.width;canvasRef.current.height=vp.height;
      markupRef.current.width=vp.width;markupRef.current.height=vp.height;
      pg.render({canvasContext:canvasRef.current.getContext("2d"),viewport:vp}).promise.then(redraw);
    });
  },[pdfDoc,page]);

  useEffect(()=>{pathsRef.current=markups;},[markups]);

  const redraw=useCallback(()=>{
    const c=markupRef.current;if(!c)return;
    const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);
    pathsRef.current.forEach(p=>drawPath(ctx,p));
  },[]);

  function drawPath(ctx,p){
    ctx.save();ctx.strokeStyle=p.color;ctx.lineWidth=p.width;ctx.lineCap="round";ctx.lineJoin="round";
    if(p.tool==="hl")ctx.globalAlpha=0.28;
    if(p.tool==="textlabel"){ctx.fillStyle=p.color;ctx.font="14px Manrope,sans-serif";ctx.fillText(p.text,p.pts[0].x,p.pts[0].y);}
    else if(p.tool==="arrow"){drawArrow(ctx,p.pts[0].x,p.pts[0].y,p.pts[1].x,p.pts[1].y,p.color,p.width);}
    else if(p.tool==="cloud"){drawCloud(ctx,p.pts[0].x,p.pts[0].y,p.pts[1].x,p.pts[1].y,p.color,p.width);}
    else if(p.tool==="rect"){ctx.strokeRect(p.pts[0].x,p.pts[0].y,p.pts[1].x-p.pts[0].x,p.pts[1].y-p.pts[0].y);}
    else{ctx.beginPath();p.pts.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));ctx.stroke();}
    ctx.restore();
  }

  function drawArrow(ctx,x1,y1,x2,y2,col,w){const ang=Math.atan2(y2-y1,x2-x1),hw=Math.max(w*3,10);ctx.strokeStyle=col;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-hw*Math.cos(ang-0.4),y2-hw*Math.sin(ang-0.4));ctx.lineTo(x2-hw*Math.cos(ang+0.4),y2-hw*Math.sin(ang+0.4));ctx.closePath();ctx.fill();}
  function drawCloud(ctx,x1,y1,x2,y2,col,w){const cx=(x1+x2)/2,cy=(y1+y2)/2,rw=Math.abs(x2-x1)/2,rh=Math.abs(y2-y1)/2;if(rw<5||rh<5)return;ctx.strokeStyle=col;ctx.lineWidth=w||2;ctx.beginPath();for(let a=0;a<=Math.PI*2;a+=0.2){const bx=cx+rw*Math.cos(a)+5*Math.cos(a*4);const by=cy+rh*Math.sin(a)+5*Math.sin(a*4);a===0?ctx.moveTo(bx,by):ctx.lineTo(bx,by);}ctx.closePath();ctx.stroke();}

  const getXY=e=>{const r=markupRef.current.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};

  const onMouseDown=e=>{
    if(tool==="comment"){const r=markupRef.current.getBoundingClientRect();setPendingPin({fx:(e.clientX-r.left)/markupRef.current.width,fy:(e.clientY-r.top)/markupRef.current.height});return;}
    if(tool==="select")return;
    drawingRef.current=true;const{x,y}=getXY(e);startXY.current={x,y};curPath.current=[{x,y}];
    if(tool==="text"){const t=prompt("Enter note:");if(t){const p={tool:"textlabel",color,width:strokeW,pts:[{x,y}],text:t,id:Date.now()};const u=[...pathsRef.current,p];setMarkups(u);pathsRef.current=u;redraw();}drawingRef.current=false;}
  };

  const onMouseMove=e=>{
    if(!drawingRef.current)return;const{x,y}=getXY(e);const ctx=markupRef.current.getContext("2d");
    if(tool==="pen"||tool==="hl"){curPath.current.push({x,y});ctx.save();if(tool==="hl")ctx.globalAlpha=0.28;ctx.strokeStyle=color;ctx.lineWidth=tool==="hl"?strokeW*5:strokeW;ctx.lineCap="round";ctx.lineJoin="round";const pts=curPath.current;ctx.beginPath();ctx.moveTo(pts[pts.length-2].x,pts[pts.length-2].y);ctx.lineTo(x,y);ctx.stroke();ctx.restore();}
    else if(tool==="erase"){ctx.clearRect(x-12,y-12,24,24);}
    else{redraw();ctx.save();ctx.strokeStyle=color;ctx.lineWidth=strokeW;ctx.lineCap="round";if(tool==="arrow")drawArrow(ctx,startXY.current.x,startXY.current.y,x,y,color,strokeW);else if(tool==="cloud")drawCloud(ctx,startXY.current.x,startXY.current.y,x,y,color,strokeW);else if(tool==="rect")ctx.strokeRect(startXY.current.x,startXY.current.y,x-startXY.current.x,y-startXY.current.y);ctx.restore();}
  };

  const onMouseUp=e=>{
    if(!drawingRef.current)return;drawingRef.current=false;const{x,y}=getXY(e);let p;
    if(tool==="pen"||tool==="hl")p={tool,color,width:tool==="hl"?strokeW*5:strokeW,pts:[...curPath.current],id:Date.now()};
    else if(tool==="arrow")p={tool:"arrow",color,width:strokeW,pts:[{x:startXY.current.x,y:startXY.current.y},{x,y}],id:Date.now()};
    else if(tool==="cloud")p={tool:"cloud",color,width:strokeW,pts:[{x:startXY.current.x,y:startXY.current.y},{x,y}],id:Date.now()};
    else if(tool==="rect")p={tool:"rect",color,width:strokeW,pts:[{x:startXY.current.x,y:startXY.current.y},{x,y}],id:Date.now()};
    if(p){const u=[...pathsRef.current,p];setMarkups(u);pathsRef.current=u;redraw();}
    curPath.current=[];
  };

  const addComment=async()=>{
    const txt=newComment.trim();if(!txt)return;
    const d=await api.addComment(drawing.id,{text:txt,type:ctype,pinX:pendingPin?.fx,pinY:pendingPin?.fy});
    setComments([...comments,d.comment]);setNewComment("");setPendingPin(null);
    setSelectedCid(d.comment.id);setReplyTarget(d.comment.id);
  };

  const sendReply=async()=>{
    if(!replyDraft.trim()||!replyTarget)return;
    const d=await api.addReply(drawing.id,replyTarget,replyDraft);
    setComments(comments.map(c=>c.id===replyTarget?{...c,replies:[...(c.replies||[]),d.reply]}:c));
    setReplyDraft("");setReplyTarget(null);
  };

  const improveReply=async()=>{
    if(!replyDraft.trim())return;setImproving(true);
    const d=await api.improveReply(drawing.id,replyTarget,replyDraft);
    setReplyDraft(d.improved);setImproving(false);
  };

  const interpret=async(commentId)=>{
    setInterpreting(commentId);
    const c=comments.find(c=>c.id===commentId);
    const d=await api.interpretMarkup(drawing.id,commentId,c?.text);
    setComments(comments.map(c=>c.id===commentId?{...c,status:"interpreted",replies:[...(c.replies||[]),{id:"ai"+Date.now(),text:d.interpretation,author:{name:"Xpress Draft (AI)",role:"team"},is_ai_interpreted:true,created_at:new Date().toISOString()}]}:c));
    setInterpreting(null);
  };

  const confirmRevision=async(commentId)=>{
    try{
      const d=await api.confirmRevision(drawing.id,commentId);
      setComments(comments.map(c=>c.id===commentId?{...c,status:"confirmed"}:c));
      onRevisionConfirmed(d.revisionSummary);
      alert(d.message);
    }catch(e){alert(e.message);}
  };

  const handleSave=async()=>{setSaving(true);await api.saveMarkups(drawing.id,markups,page);setSaving(false);};

  const COLORS=["#EA672F","#E24B4A","#378ADD","#639922","#7F77DD","#2A2B29"];
  const CTYPES={issue:{label:"Issue",bg:"#FCEBEB",color:"#8B2020",dot:"#E24B4A"},info:{label:"Question",bg:"#FEF3E8",color:"#7A3D0A",dot:B.orange},ok:{label:"Approved",bg:"#EAF3DE",color:"#2E5C10",dot:"#639922"},note:{label:"Note",bg:"#F0EEF8",color:"#3D3580",dot:"#7F77DD"}};
  const cursorMap={pen:"crosshair",hl:"crosshair",arrow:"crosshair",cloud:"crosshair",rect:"crosshair",text:"text",comment:"copy",select:"default",erase:"cell"};

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{background:B.white,borderBottom:`1px solid ${B.tone1}`,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flexShrink:0}}>
        {[["select","↖","Select"],["pen","✏","Pen"],["hl","🖊","Highlight"],["arrow","↗","Arrow"],["cloud","☁","Cloud"],["rect","▭","Rect"],["text","T","Text"],["comment","📍","Pin"],["erase","⌫","Erase"]].map(([id,ic,title])=>(
          <button key={id} onClick={()=>setTool(id)} title={title}
            style={{padding:"5px 8px",border:`1px solid ${tool===id?B.orange:B.tone1}`,borderRadius:6,background:tool===id?"#FEF3E8":B.white,color:tool===id?B.orange:B.black1,cursor:"pointer",fontSize:14,fontFamily:"Manrope,sans-serif",fontWeight:tool===id?600:400}}>
            {ic}
          </button>
        ))}
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
        {COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:18,height:18,borderRadius:"50%",background:c,cursor:"pointer",border:color===c?`2.5px solid ${B.black}`:"1.5px solid transparent"}}/>)}
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
        <input type="range" min="1" max="12" value={strokeW} onChange={e=>setStrokeW(+e.target.value)} style={{width:60}}/>
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
        <button onClick={()=>{const u=markups.slice(0,-1);setMarkups(u);pathsRef.current=u;redraw();}} style={btnGhost}>↩</button>
        <button onClick={()=>{if(!window.confirm("Clear all markup?"))return;setMarkups([]);pathsRef.current=[];redraw();}} style={btnGhost}>🗑</button>
        {totalPages>1&&<><button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={btnGhost}>‹</button><span style={{fontSize:12,color:B.black2}}>pg {page}/{totalPages}</span><button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={btnGhost}>›</button></>}
        <button onClick={handleSave} style={{...btnPrimary,marginLeft:"auto"}}>{saving?"Saving…":"💾 Save"}</button>
      </div>

      {tool==="comment"&&<div style={{background:"#FEF3E8",borderBottom:`1px solid ${B.tone1}`,padding:"5px 16px",fontSize:12,color:B.orange,fontFamily:"Manrope,sans-serif"}}>Click on the drawing to place a comment pin.</div>}
      {pendingPin&&<div style={{background:"#FEF3E8",borderBottom:`1px solid ${B.orange}`,padding:"5px 16px",fontSize:12,color:B.black1,fontFamily:"Manrope,sans-serif"}}>📍 Pin placed — write your comment in the sidebar.</div>}

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div ref={wrapRef} style={{flex:1,overflow:"auto",background:"#555",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:24}}>
          <div style={{position:"relative",boxShadow:"0 4px 24px rgba(0,0,0,0.35)"}}>
            <canvas ref={canvasRef} style={{display:"block"}}/>
            <canvas ref={markupRef} style={{position:"absolute",top:0,left:0,cursor:cursorMap[tool]||"crosshair"}}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={()=>{drawingRef.current=false;}}/>
            <div style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}}>
              <div style={{position:"relative",width:"100%",height:"100%",pointerEvents:"none"}}>
                {comments.filter(c=>c.pin_x!=null).map((c,i)=>{
                  const ct=CTYPES[c.type]||CTYPES.note;
                  const w=markupRef.current?.width||1,h=markupRef.current?.height||1;
                  return <div key={c.id} onClick={()=>{setSelectedCid(c.id);setReplyTarget(c.id);}}
                   style={{position:"absolute",left:c.pin_x*w,top:c.pin_y*h,transform:`translate(-50%,-50%) scale(${selectedCid===c.id?1.3:1})`,pointerEvents:"all",
                      width:22,height:22,borderRadius:"50%",background:ct.dot,border:"2px solid white",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",
                      cursor:"pointer",zIndex:10,transition:"transform 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}>{i+1}</div>;
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{width:280,background:B.white,borderLeft:`1px solid ${B.tone1}`,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:B.black2,borderBottom:`1px solid ${B.tone1}`,letterSpacing:"0.05em"}}>
            {comments.length} COMMENT{comments.length!==1?"S":""}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:10}}>
            {comments.length===0&&<div style={{textAlign:"center",padding:"2rem 0",color:B.black2,fontSize:13,lineHeight:1.6}}>No comments yet.<br/>Use the 📍 pin tool to anchor comments.</div>}
            {comments.map((c,i)=>{
              const ct=CTYPES[c.type]||CTYPES.note;
              const isSelected=selectedCid===c.id;
              return(
                <div key={c.id} style={{marginBottom:10}}>
                  <div onClick={()=>{setSelectedCid(c.id);setReplyTarget(c.id);}}
                    style={{background:isSelected?"#FEF3E8":B.cream,border:`1px solid ${isSelected?B.orange:B.tone1}`,borderRadius:8,padding:"10px 11px",cursor:"pointer",borderLeft:`3px solid ${ct.dot}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:ct.dot,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>{i+1}</div>
                      <span style={{fontSize:12,fontWeight:600,color:B.black,flex:1}}>{c.author?.name}</span>
                      <span style={{fontSize:10,color:B.black2}}>{new Date(c.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</span>
                    </div>
                    <p style={{fontSize:12,color:B.black1,lineHeight:1.55,margin:"0 0 6px"}}>{c.text}</p>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:ct.bg,color:ct.color,fontWeight:500}}>{ct.label}</span>
                      {c.status==="confirmed"&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#EAF3DE",color:"#2E5C10",fontWeight:500}}>✅ Confirmed</span>}
                    </div>
                  </div>

                  {(c.replies||[]).map(r=>(
                    <div key={r.id} style={{marginLeft:12,marginTop:5,padding:"8px 10px",background:r.author?.role==="team"?"#FEF3E8":B.white,border:`1px solid ${r.author?.role==="team"?B.orange:B.tone1}`,borderRadius:7,borderLeft:`3px solid ${r.author?.role==="team"?B.orange:B.tone2}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <span style={{fontSize:11,fontWeight:600,color:r.author?.role==="team"?B.orange:B.black}}>{r.author?.name}</span>
                        {r.is_ai_interpreted&&<span style={{fontSize:9,background:B.orange,color:"#fff",borderRadius:4,padding:"1px 5px"}}>AI interpreted</span>}
                        {r.author?.role==="team"&&!r.is_ai_interpreted&&<span style={{fontSize:9,background:B.orange,color:"#fff",borderRadius:4,padding:"1px 5px"}}>XD Team</span>}
                      </div>
                      <p style={{fontSize:12,color:B.black1,margin:0,lineHeight:1.5}}>{r.text}</p>
                    </div>
                  ))}

                  {isSelected&&user.role==="client"&&c.status==="interpreted"&&(
                    <div style={{marginLeft:12,marginTop:8,padding:12,background:"#FEF3E8",border:`1px solid ${B.orange}`,borderRadius:8}}>
                      <p style={{fontSize:12,color:B.black1,margin:"0 0 6px",fontWeight:600}}>⚠️ This will use a revision</p>
                      <p style={{fontSize:11,color:B.black2,margin:"0 0 10px",lineHeight:1.5}}>
                        {project.revisionSummary?.stageLabel==="PR"?"Preliminary":"Working Drawings"} Stage — Revision {(project.revisionSummary?.used||0)+1} of {project.revisionSummary?.totalAllowed||2}<br/>
                        By confirming, you agree these changes will be actioned by the Xpress Draft team.
                      </p>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>setSelectedCid(null)} style={btnGhost}>Cancel</button>
                        <button onClick={()=>confirmRevision(c.id)} style={btnPrimary}>✓ Confirm & Send</button>
                      </div>
                    </div>
                  )}

                  {isSelected&&user.role==="team"&&c.status==="open"&&(
                    <div style={{marginLeft:12,marginTop:6}}>
                      <button onClick={()=>interpret(c.id)} disabled={interpreting===c.id}
                        style={{...btnPrimary,width:"100%",justifyContent:"center",marginBottom:6}}>
                        {interpreting===c.id?"Interpreting…":"🤖 Interpret with AI"}
                      </button>
                    </div>
                  )}

                  {isSelected&&replyTarget===c.id&&c.status!=="confirmed"&&(
                    <div style={{marginLeft:12,marginTop:6}}>
                      <textarea value={replyDraft} onChange={e=>setReplyDraft(e.target.value)} rows={2}
                        placeholder={user.role==="team"?"Type reply — AI can polish it…":"Write a reply…"}
                        style={{width:"100%",border:`1px solid ${B.tone1}`,borderRadius:7,padding:"7px 9px",fontSize:12,fontFamily:"Manrope,sans-serif",resize:"none",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:6,marginTop:5}}>
                        {user.role==="team"&&<button onClick={improveReply} disabled={improving} style={{...btnGhost,fontSize:11,flex:1}}>{improving?"Improving…":"✨ AI Polish"}</button>}
                        <button onClick={sendReply} style={{...btnPrimary,fontSize:11,flex:1}}>Send</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{padding:10,borderTop:`1px solid ${B.tone1}`}}>
            {pendingPin&&<div style={{fontSize:11,color:B.orange,marginBottom:6}}>📍 Pin placed — write comment below</div>}
            <textarea value={newComment} onChange={e=>setNewComment(e.target.value)} rows={2}
              placeholder="Add a comment…"
              style={{width:"100%",border:`1px solid ${B.tone1}`,borderRadius:7,padding:"7px 9px",fontSize:12,fontFamily:"Manrope,sans-serif",resize:"none",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:4,margin:"6px 0 8px"}}>
              {Object.entries(CTYPES).map(([k,v])=>(
                <div key={k} onClick={()=>setCtype(k)}
                  style={{flex:1,fontSize:10,padding:"3px 2px",border:`1px solid ${ctype===k?B.orange:B.tone1}`,borderRadius:5,cursor:"pointer",textAlign:"center",fontWeight:500,background:ctype===k?"#FEF3E8":B.white,color:ctype===k?B.orange:B.black2}}>
                  {v.label}
                </div>
              ))}
            </div>
            <button onClick={addComment} style={{...btnPrimary,width:"100%"}}>+ Add comment</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function XPDLogo({size=40}){
  return(
    <svg width={size} height={size} viewBox="0 0 188.38 188.38" xmlns="http://www.w3.org/2000/svg">
      <path fill="#2A2B29" d="M45.3900894,6.5357449v29.6950724c0,1.9266348,1.1070496,3.6796433,2.8435971,4.5112992l42.9460576,23.9518135c1.9052433.9101066,4.1193342.9101066,6.0245775,0l42.9460534-23.9518135c1.7390252-.8291906,2.8435971-2.5846644,2.8435971-4.5112992V6.5357449c0-4.7987211-5.0077647-7.9582641-9.3383015-5.8891181l-36.4535504,17.4059971c-1.905235.9098576-4.1193258.9098576-6.0245692,0L54.7286713.6442486c-4.3308131-2.0667678-9.338582,1.0903999-9.338582,5.8914963Z"/>
      <path fill="#2A2B29" d="M45.3911859,181.8428359v-29.6949662c0-1.9266306,1.1070496-3.6799028,2.8435971-4.5112866l42.9460576-23.9520981c1.9052433-.9098262,4.1193342-.9098262,6.0245775,0l42.9460534,23.9520981c1.7390168.828906,2.8436054,2.584656,2.8436054,4.5112866v29.6949662c0,4.7987552-5.0077731,7.9583484-9.3385861,5.8890801l-36.4535421-17.4060893c-1.9052433-.9098345-4.1193342-.9098345-6.0245775,0l-36.4535421,17.4060893c-4.3305368,2.0692684-9.3383057-1.0903248-9.3383057-5.8890801h.0046625Z"/>
      <path fill="#2A2B29" d="M181.8432002,45.3878165h-29.6949662c-1.9266306,0-3.6799196,1.1070454-4.5113034,2.8435971l-23.9520898,42.9460576c-.9098262,1.9052433-.9098262,4.1193342,0,6.0245692l23.9520898,42.9460618c.8289228,1.7390252,2.5846727,2.8435971,4.5113034,2.8435971h29.6949662c4.7987552,0,7.9580638-5.0077647,5.8890633-9.3385778l-17.4060893-36.4535421c-.9098345-1.9052433-.9098345-4.1193342,0-6.0243013l17.408567-36.4488796c2.0665228-4.3308131-1.0905927-9.338582-5.8915411-9.338582Z"/>
      <path fill="#EA672F" d="M6.5343158,45.3889131h29.6949363c1.9266348,0,3.6799154,1.1070454,4.5112992,2.8435971l23.9520898,42.9460576c.9098304,1.9052433.9098304,4.1193342,0,6.0245775l-23.9520898,42.9460534c-.8291906,1.7390168-2.5846644,2.8436054-4.5112992,2.8436054H6.5343158c-4.7987044,0-7.9582473-5.0077731-5.8891015-9.3385861l17.4060076-36.4535421c.9098576-1.9052433.9098576-4.119058,0-6.0243013L.6452171,54.7228325c-2.0691459-4.3308131,1.0903971-9.338582,5.8890987-9.338582v.0046625Z"/>
    </svg>
  );
}

const inputSt={width:"100%",border:`1px solid ${B.tone1}`,borderRadius:7,padding:"9px 11px",fontSize:14,fontFamily:"Manrope,sans-serif",background:B.white,color:B.black,boxSizing:"border-box",display:"block"};
const btnPrimary={padding:"7px 14px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600,display:"inline-flex",alignItems:"center",gap:5};
const btnGhost={padding:"6px 12px",background:B.white,color:B.black1,border:`1px solid ${B.tone1}`,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",display:"inline-flex",alignItems:"center",gap:5};
