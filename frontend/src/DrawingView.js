import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./api";

const B = {
  orange:"#EA672F",black:"#2A2B29",cream:"#F3EAE5",
  tone1:"#D2CAC4",tone2:"#A9A09B",black1:"#42453C",
  black2:"#5E635B",white:"#ffffff",
};

const btnPrimary={padding:"7px 14px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600,display:"inline-flex",alignItems:"center",gap:5};
const btnGhost={padding:"6px 12px",background:B.white,color:B.black1,border:`1px solid ${B.tone1}`,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",display:"inline-flex",alignItems:"center",gap:5};

function DrawingView({drawing,user,project,revisionSummary,onRevisionConfirmed}){
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

  const isTeam=user.role==="team"||user.role==="admin";

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
    if(tool==="comment"){
      const r=markupRef.current.getBoundingClientRect();
      const fx=(e.clientX-r.left)/markupRef.current.width;
      const fy=(e.clientY-r.top)/markupRef.current.height;
      setPendingPin({fx,fy});
      return;
    }
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
    setComments(prev=>[...prev,d.comment]);
    setNewComment("");
    setPendingPin(null);
    setSelectedCid(d.comment.id);
    setReplyTarget(d.comment.id);
    setTool("comment");
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
      const rs=revisionSummary;
      const nextRev=(rs?.used||0)+1;
      const total=rs?.totalAllowed||2;
      const stage=rs?.stageLabel==="PR"?"Preliminary":"Working Drawings";
      const confirmed=window.confirm(`⚠️ Confirm Revision\n\n${stage} Stage — This will use Revision ${nextRev} of ${total}.\n\nBy confirming, you acknowledge this revision will be deducted from your allowance and the changes will be actioned by the Xpress Draft team.\n\nProceed?`);
      if(!confirmed)return;
      const d=await api.confirmRevision(drawing.id,commentId);
      setComments(comments.map(c=>c.id===commentId?{...c,status:"confirmed"}:c));
      onRevisionConfirmed(d.revisionSummary);
      alert(`✅ ${d.message}\n\nThe Xpress Draft team has been notified.`);
    }catch(e){alert("❌ "+e.message);}
  };

  const handleSave=async()=>{setSaving(true);await api.saveMarkups(drawing.id,markups,page);setSaving(false);};

  const submitAllChanges=async()=>{
    const openComments=comments.filter(c=>c.status==="open"||c.status==="interpreted");
    if(openComments.length===0){alert("No pending comments to submit.");return;}
    const rs=revisionSummary;
    const nextRev=(rs?.used||0)+1;
    const total=rs?.totalAllowed||2;
    const stage=rs?.stageLabel==="PR"?"Preliminary":"Working Drawings";
    const confirmed=window.confirm(`⚠️ Submit All Changes\n\n${stage} Stage — Revision ${nextRev} of ${total}\n\nYou have ${openComments.length} comment${openComments.length!==1?"s":""} to submit. This will use 1 revision from your allowance.\n\nBy confirming, the Xpress Draft team will review all your markup and comments.\n\nProceed?`);
    if(!confirmed)return;
    let lastSummary=rs;
    for(const c of openComments){
      try{
        const d=await api.confirmRevision(drawing.id,c.id);
        lastSummary=d.revisionSummary;
        setComments(prev=>prev.map(x=>x.id===c.id?{...x,status:"confirmed"}:x));
      }catch(e){break;}
    }
    if(lastSummary)onRevisionConfirmed(lastSummary);
    alert("✅ All changes submitted. The Xpress Draft team will review and respond shortly.");
  };

  const COLORS=["#EA672F","#E24B4A","#378ADD","#639922","#7F77DD","#2A2B29"];
  const CTYPES={issue:{label:"Issue",bg:"#FCEBEB",color:"#8B2020",dot:"#E24B4A"},info:{label:"Question",bg:"#FEF3E8",color:"#7A3D0A",dot:B.orange},ok:{label:"Approved",bg:"#EAF3DE",color:"#2E5C10",dot:"#639922"},note:{label:"Note",bg:"#F0EEF8",color:"#3D3580",dot:"#7F77DD"}};
  const cursorMap={pen:"crosshair",hl:"crosshair",arrow:"crosshair",cloud:"crosshair",rect:"crosshair",text:"text",comment:"copy",select:"default",erase:"cell"};

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{background:B.white,borderBottom:`1px solid ${B.tone1}`,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flexShrink:0}}>
        {[["select","ESC","Select"],["pen","✏","Pen"],["hl","🖊","Highlight"],["arrow","↗","Arrow"],["cloud","☁","Cloud"],["rect","▭","Rect"],["text","T","Text"],["comment","📍","Pin"],["erase","⌫","Erase"]].map(([id,ic,title])=>(
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

      {tool==="comment"&&!pendingPin&&<div style={{background:"#FEF3E8",borderBottom:`1px solid ${B.tone1}`,padding:"5px 16px",fontSize:12,color:B.orange,fontFamily:"Manrope,sans-serif"}}>Click anywhere on the drawing to place a comment pin.</div>}
      {pendingPin&&<div style={{background:"#FEF3E8",borderBottom:`1px solid ${B.orange}`,padding:"5px 16px",fontSize:12,color:B.black1,fontFamily:"Manrope,sans-serif",display:"flex",alignItems:"center",gap:12}}>
        <span>📍 Pin placed — write your comment in the sidebar then click <strong>Done</strong>.</span>
        <button onClick={()=>setPendingPin(null)} style={{marginLeft:"auto",padding:"3px 10px",background:"none",border:`1px solid ${B.orange}`,borderRadius:5,color:B.orange,cursor:"pointer",fontSize:12,fontFamily:"Manrope,sans-serif"}}>✕ Cancel pin</button>
      </div>}

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div ref={wrapRef} style={{flex:1,overflow:"auto",background:"#555",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:24}}>
          <div style={{position:"relative",boxShadow:"0 4px 24px rgba(0,0,0,0.35)"}}>
            <canvas ref={canvasRef} style={{display:"block"}}/>
            <canvas ref={markupRef} style={{position:"absolute",top:0,left:0,cursor:cursorMap[tool]||"crosshair"}}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={()=>{drawingRef.current=false;}}/>
            <div style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}}>
              <div style={{position:"relative",width:"100%",height:"100%",pointerEvents:"none"}}>
                {pendingPin&&<div style={{position:"absolute",left:pendingPin.fx*(markupRef.current?.width||1),top:pendingPin.fy*(markupRef.current?.height||1),transform:"translate(-50%,-50%)",width:26,height:26,borderRadius:"50%",background:B.orange,border:"2px solid white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",zIndex:11,boxShadow:"0 2px 6px rgba(0,0,0,0.4)",pointerEvents:"none"}}>📍</div>}
                {comments.filter(c=>c.pin_x!=null).map((c,i)=>{
                  const ct=CTYPES[c.type]||CTYPES.note;
                  const w=markupRef.current?.width||1,h=markupRef.current?.height||1;
                  return <div key={c.id} onClick={()=>{setSelectedCid(c.id);setReplyTarget(c.id);}}
                    style={{position:"absolute",left:c.pin_x*w,top:c.pin_y*h,transform:`translate(-50%,-50%) scale(${selectedCid===c.id?1.3:1})`,
                      width:22,height:22,borderRadius:"50%",background:ct.dot,border:"2px solid white",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",
                      cursor:"pointer",zIndex:10,transition:"transform 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)",pointerEvents:"all"}}>{i+1}</div>;
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
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:ct.bg,color:ct.color,fontWeight:500}}>{ct.label}</span>
                      {c.status==="confirmed"&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#EAF3DE",color:"#2E5C10",fontWeight:500}}>✅ Confirmed</span>}
                    </div>
                    {c.author?.id===user?.id&&c.status!=="confirmed"&&<div style={{display:"flex",gap:6,marginTop:6}}>
                      <button onClick={e=>{e.stopPropagation();const t=prompt("Edit comment:",c.text);if(t&&t.trim())setComments(comments.map(x=>x.id===c.id?{...x,text:t.trim()}:x));}} style={{fontSize:10,padding:"2px 8px",border:`1px solid ${B.tone1}`,borderRadius:4,background:B.white,cursor:"pointer",color:B.black2,fontFamily:"Manrope,sans-serif"}}>✏ Edit</button>
                      <button onClick={e=>{e.stopPropagation();if(window.confirm("Delete this comment?"))setComments(comments.filter(x=>x.id!==c.id));}} style={{fontSize:10,padding:"2px 8px",border:"1px solid #E24B4A",borderRadius:4,background:B.white,cursor:"pointer",color:"#8B2020",fontFamily:"Manrope,sans-serif"}}>🗑 Delete</button>
                    </div>}
                  </div>

                  {(c.replies||[]).map(r=>(
                    <div key={r.id} style={{marginLeft:12,marginTop:5,padding:"8px 10px",background:r.author?.role==="team"||r.author?.role==="admin"?"#FEF3E8":B.white,border:`1px solid ${r.author?.role==="team"||r.author?.role==="admin"?B.orange:B.tone1}`,borderRadius:7,borderLeft:`3px solid ${r.author?.role==="team"||r.author?.role==="admin"?B.orange:B.tone2}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <span style={{fontSize:11,fontWeight:600,color:r.author?.role==="team"||r.author?.role==="admin"?B.orange:B.black}}>{r.author?.name}</span>
                        {r.is_ai_interpreted&&<span style={{fontSize:9,background:B.orange,color:"#fff",borderRadius:4,padding:"1px 5px"}}>AI interpreted</span>}
                        {(r.author?.role==="team"||r.author?.role==="admin")&&!r.is_ai_interpreted&&<span style={{fontSize:9,background:B.orange,color:"#fff",borderRadius:4,padding:"1px 5px"}}>XD Team</span>}
                      </div>
                      <p style={{fontSize:12,color:B.black1,margin:0,lineHeight:1.5}}>{r.text}</p>
                    </div>
                  ))}

                  {isSelected&&user.role!=="admin"&&user.role!=="team"&&c.status==="interpreted"&&(
                    <div style={{marginLeft:12,marginTop:8,padding:12,background:"#FEF3E8",border:`1px solid ${B.orange}`,borderRadius:8}}>
                      <p style={{fontSize:12,color:B.black1,margin:"0 0 6px",fontWeight:600}}>⚠️ This will use a revision</p>
                      <p style={{fontSize:11,color:B.black2,margin:"0 0 10px",lineHeight:1.5}}>
                        {revisionSummary?.stageLabel==="PR"?"Preliminary":"Working Drawings"} Stage — Revision {(revisionSummary?.used||0)+1} of {revisionSummary?.totalAllowed||2}<br/>
                        By confirming, these changes will be actioned by the Xpress Draft team.
                      </p>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>setSelectedCid(null)} style={btnGhost}>Cancel</button>
                        <button onClick={()=>confirmRevision(c.id)} style={btnPrimary}>✓ Confirm & Send</button>
                      </div>
                    </div>
                  )}

                  {isSelected&&isTeam&&c.status==="open"&&(
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
                        placeholder={isTeam?"Type reply — AI can polish it…":"Write a reply…"}
                        style={{width:"100%",border:`1px solid ${B.tone1}`,borderRadius:7,padding:"7px 9px",fontSize:12,fontFamily:"Manrope,sans-serif",resize:"none",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:6,marginTop:5}}>
                        {isTeam&&<button onClick={improveReply} disabled={improving} style={{...btnGhost,fontSize:11,flex:1}}>{improving?"Improving…":"✨ AI Polish"}</button>}
                        <button onClick={sendReply} style={{...btnPrimary,fontSize:11,flex:1}}>Send</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{padding:10,borderTop:`1px solid ${B.tone1}`}}>
            {pendingPin&&<div style={{fontSize:11,color:B.orange,marginBottom:6}}>📍 Pin placed — write your comment below</div>}
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
            <button onClick={addComment} style={{...btnPrimary,width:"100%",justifyContent:"center",fontSize:14,padding:"10px",marginBottom:8}}>✓ Done</button>
            {comments.filter(c=>c.status!=="confirmed").length>0&&(
              <button onClick={submitAllChanges} style={{...btnPrimary,width:"100%",justifyContent:"center",fontSize:14,padding:"12px",background:B.black}}>
                Submit all changes →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DrawingView;
