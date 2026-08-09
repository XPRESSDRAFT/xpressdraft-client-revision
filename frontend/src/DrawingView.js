// v15b
import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./api";

const B = {
  orange:"#EA672F",black:"#2A2B29",cream:"#F3EAE5",
  tone1:"#D2CAC4",tone2:"#A9A09B",black1:"#42453C",
  black2:"#5E635B",white:"#ffffff",
};

const btnPrimary={padding:"7px 14px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600,display:"inline-flex",alignItems:"center",gap:5};
const btnGhost={padding:"6px 12px",background:B.white,color:B.black1,border:"1px solid "+B.tone1,borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",display:"inline-flex",alignItems:"center",gap:5};

function DrawingView({drawing,user,project,revisionSummary,onRevisionConfirmed}){
  const canvasRef=useRef();
  const markupRef=useRef();
  const wrapRef=useRef();
  const [comments,setComments]=useState([]);
  const allMarkupsRef=useRef({});
  const [allMarkupDims,setAllMarkupDims]=useState({});
  const [tool,setTool]=useState("pen");
  const [color,setColor]=useState("#EA672F");
  const [strokeW,setStrokeW]=useState(2);
  const [newComment,setNewComment]=useState("");
  const [ctype,setCtype]=useState("issue");
  const [pendingPin,setPendingPin]=useState(null);
  const [selectedCid,setSelectedCid]=useState(null);
  const [replyDraft,setReplyDraft]=useState("");
  const [replyIsPrivate,setReplyIsPrivate]=useState(false);
  const [replyTarget,setReplyTarget]=useState(null);
  const [improving,setImproving]=useState(false);
  const [interpreting,setInterpreting]=useState(null);
  const [saving,setSaving]=useState(false);
  const [pdfReady,setPdfReady]=useState(!!window.pdfjsLib);
  const [pdfDoc,setPdfDoc]=useState(null);
  const [page,setPage]=useState(1);
  const [totalPages,setTotalPages]=useState(1);
  const [zoom,setZoom]=useState(1);
  const [exportNum,setExportNum]=useState((project.markup_export_count||0)+1);
  const [showExportDialog,setShowExportDialog]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [canvasSize,setCanvasSize]=useState({w:1,h:1});
  const [showClearConfirm,setShowClearConfirm]=useState(false);
  const [selectedPathId,setSelectedPathId]=useState(null);
  const drawingRef=useRef(false);
  const curPath=useRef([]);
  const startXY=useRef({x:0,y:0});
  const pathsRef=useRef([]);
  const renderTaskRef=useRef(null);
  const isTeam=user.role==="team"||user.role==="admin"||user.role==="contractor";

  useEffect(()=>{
    api.getComments(drawing.id).then(d=>setComments(d.comments));
    api.getMarkups(drawing.id).then(d=>{
      const byPage={};const byPageDims={};
      d.markups.forEach(m=>{
        byPage[m.page||1]=m.paths||[];
        byPageDims[m.page||1]={w:m.canvas_width||0,h:m.canvas_height||0};
      });
      allMarkupsRef.current=byPage;setAllMarkupDims(byPageDims);
      const cp=byPage[1]||[];pathsRef.current=cp;
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
      .then(doc=>{setPdfDoc(doc);setTotalPages(doc.numPages);}).catch(console.error);
  },[pdfReady,drawing.file_url]);

  useEffect(()=>{
    if(!pdfDoc)return;
    if(renderTaskRef.current){
      renderTaskRef.current.cancel();
      renderTaskRef.current=null;
    }
    pdfDoc.getPage(page).then(pg=>{
      const wrap=wrapRef.current;if(!wrap)return;
      const vp0=pg.getViewport({scale:1});
      const scale=((wrap.clientWidth-48)/vp0.width)*zoom;
      const vp=pg.getViewport({scale});
      canvasRef.current.width=vp.width;canvasRef.current.height=vp.height;
      markupRef.current.width=vp.width;markupRef.current.height=vp.height;
      setCanvasSize({w:vp.width,h:vp.height});const task=pg.render({canvasContext:canvasRef.current.getContext("2d"),viewport:vp});
      renderTaskRef.current=task;
      task.promise.then(()=>{
        renderTaskRef.current=null;
        const c=markupRef.current;if(!c)return;
        const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);
        const paths=allMarkupsRef.current[page]||[];
        paths.forEach(p=>drawPath(ctx,p,c.width,c.height));
      }).catch(err=>{
        if(err?.name!=="RenderingCancelledException")console.error(err);
      });
    });
  },[pdfDoc,page,zoom]);

  // pathsRef is managed directly - not via useEffect to avoid stale state restoration

  const loadPage=(p)=>{const paths=allMarkupsRef.current[p]||[];pathsRef.current=paths;redraw();};

  const redraw=useCallback(()=>{const c=markupRef.current;if(!c)return;const ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);pathsRef.current.forEach(p=>{if(p.id===selectedPathId){ctx.save();ctx.shadowColor="#E24B4A";ctx.shadowBlur=8;drawPath(ctx,p,c.width,c.height);ctx.restore();}else{drawPath(ctx,p,c.width,c.height);}});},[selectedPathId]);

  function drawPath(ctx,p,cw,ch){
    cw=cw||ctx.canvas.width;ch=ch||ctx.canvas.height;
    ctx.save();ctx.strokeStyle=p.color;ctx.lineWidth=p.width*cw;ctx.lineCap="round";ctx.lineJoin="round";
    if(p.tool==="hl"){ctx.globalAlpha=0.35;}
    if(p.tool==="textlabel"){
      ctx.fillStyle=p.color;ctx.font="14px Manrope,sans-serif";
      ctx.fillText(p.text,p.pts[0].x*cw,p.pts[0].y*ch);
    } else if(p.tool==="arrow"){
      drawArrow(ctx,p.pts[0].x*cw,p.pts[0].y*ch,p.pts[1].x*cw,p.pts[1].y*ch,p.color,p.width*cw);
    } else if(p.tool==="cloud"){
      drawCloud(ctx,p.pts[0].x*cw,p.pts[0].y*ch,p.pts[1].x*cw,p.pts[1].y*ch,p.color,p.width*cw);
    } else if(p.tool==="rect"){
      ctx.strokeRect(p.pts[0].x*cw,p.pts[0].y*ch,(p.pts[1].x-p.pts[0].x)*cw,(p.pts[1].y-p.pts[0].y)*ch);
    } else {
      ctx.beginPath();p.pts.forEach((pt,i)=>i?ctx.lineTo(pt.x*cw,pt.y*ch):ctx.moveTo(pt.x*cw,pt.y*ch));ctx.stroke();
    }
    ctx.restore();
  }

  function drawArrow(ctx,x1,y1,x2,y2,col,w){
    const ang=Math.atan2(y2-y1,x2-x1),hw=Math.max(w*4,12);
    ctx.strokeStyle=col;ctx.lineWidth=w;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x2,y2);
    ctx.lineTo(x2-hw*Math.cos(ang-0.4),y2-hw*Math.sin(ang-0.4));
    ctx.lineTo(x2-hw*Math.cos(ang+0.4),y2-hw*Math.sin(ang+0.4));
    ctx.closePath();ctx.fill();
  }

  function drawCloud(ctx,x1,y1,x2,y2,col,w){
    const cx=(x1+x2)/2,cy=(y1+y2)/2,rw=Math.abs(x2-x1)/2,rh=Math.abs(y2-y1)/2;
    if(rw<5||rh<5)return;
    ctx.strokeStyle=col;ctx.lineWidth=w||2;ctx.beginPath();
    for(let a=0;a<=Math.PI*2;a+=0.15){
      const bx=cx+rw*Math.cos(a)+6*Math.cos(a*5);
      const by=cy+rh*Math.sin(a)+6*Math.sin(a*5);
      a===0?ctx.moveTo(bx,by):ctx.lineTo(bx,by);
    }
    ctx.closePath();ctx.stroke();
  }

  function hitTest(p,nx,ny){const pad=0.015;if(p.tool==="rect"){return nx>=Math.min(p.pts[0].x,p.pts[1].x)-pad&&nx<=Math.max(p.pts[0].x,p.pts[1].x)+pad&&ny>=Math.min(p.pts[0].y,p.pts[1].y)-pad&&ny<=Math.max(p.pts[0].y,p.pts[1].y)+pad;}if(p.tool==="arrow"||p.tool==="cloud"){return Math.abs(nx-(p.pts[0].x+p.pts[1].x)/2)<0.08&&Math.abs(ny-(p.pts[0].y+p.pts[1].y)/2)<0.08;}if(p.tool==="textlabel"){return Math.abs(nx-p.pts[0].x)<0.08&&Math.abs(ny-p.pts[0].y)<0.04;}return p.pts.some(pt=>Math.abs(nx-pt.x)<pad&&Math.abs(ny-pt.y)<pad);}

  const getXY=e=>{const r=markupRef.current.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const getNorm=e=>{const r=markupRef.current.getBoundingClientRect();const cw=markupRef.current.width||1;const ch=markupRef.current.height||1;return{x:(e.clientX-r.left)/cw,y:(e.clientY-r.top)/ch};};

  const onWheel=useCallback(e=>{
    e.preventDefault();
    setZoom(z=>Math.min(3,Math.max(0.3,+(z+(e.deltaY>0?-0.1:0.1)).toFixed(1))));
  },[]);

  useEffect(()=>{
    const el=wrapRef.current;
    if(!el)return;
    el.addEventListener('wheel',onWheel,{passive:false});
    return()=>el.removeEventListener('wheel',onWheel);
  },[onWheel]);

  const onMouseDown=e=>{
    if(tool==="comment"){
      const r=markupRef.current.getBoundingClientRect();
      setPendingPin({fx:(e.clientX-r.left)/markupRef.current.width,fy:(e.clientY-r.top)/markupRef.current.height});
      return;
    }
    if(tool==="select"){const nx=(e.clientX-markupRef.current.getBoundingClientRect().left)/markupRef.current.width;const ny=(e.clientY-markupRef.current.getBoundingClientRect().top)/markupRef.current.height;const hit=pathsRef.current.slice().reverse().find(p=>hitTest(p,nx,ny));setSelectedPathId(hit?hit.id:null);return;}
    drawingRef.current=true;
    const norm=getNorm(e);
    startXY.current=norm;curPath.current=[norm];
    if(tool==="text"){
      const t=prompt("Enter note:");
      if(t){
        const p={tool:"textlabel",color,width:strokeW/markupRef.current.width,pts:[norm],text:t,id:Date.now()};
        const u=[...pathsRef.current,p];pathsRef.current=u;allMarkupsRef.current={...allMarkupsRef.current,[page]:u};redraw();
      }
      drawingRef.current=false;
    }
  };

  const onMouseMove=e=>{
    if(!drawingRef.current)return;
    const norm=getNorm(e);
    const{x,y}=getXY(e);
    const ctx=markupRef.current.getContext("2d");
    const cw=markupRef.current.width||1;const ch=markupRef.current.height||1;
    if(tool==="pen"||tool==="hl"){
      curPath.current.push(norm);ctx.save();
