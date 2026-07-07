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
  const [allMarkups,setAllMarkups]=useState({});
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
    api.getMarkups(drawing.id).then(d=>{
      const byPage={};
      d.markups.forEach(m=>{byPage[m.page||1]=m.paths||[];});
      setAllMarkups(byPage);
      const currentPaths=byPage[1]||[];
      pathsRef.current=currentPaths;
      setMarkups(currentPaths);
    });
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

  useEffect(()=>{
    const paths=allMarkups[page]||[];
    pathsRef.current=paths;
    setMarkups(paths);
    redraw();
  },[page,allMarkups]);

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
    const d=await api.addComment(drawing.id,{text:txt,type:ctype,pinX:pendingPin?.fx,pinY:pendingPin?.fy,page});
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

  const handleSave=async()=>{
    setSaving(true);
    await api.saveMarkups(drawing.id,markups,page);
    setAllMarkups(prev=>({...prev,[page]:markups}));
    setSaving(false);
  };

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
        {COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:18,height:18,borderRadius:"50%",background:c,cursor:"pointer",border:color===c?'2.5px solid ${B.black}':"1.5px solid transparent"}}/>)}
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
        <input type="range" min="1" max="12" value={strokeW} onChange={e=>setStrokeW(+e.target.value)} style={{width:60}}/>
        <div
