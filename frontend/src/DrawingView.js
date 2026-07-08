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
  const [markups,setMarkups]=useState([]);
  const [allMarkups,setAllMarkups]=useState({});
  const [allMarkupDims,setAllMarkupDims]=useState({});
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
  const [zoom,setZoom]=useState(1);
  const [exportNum,setExportNum]=useState((project.markup_export_count||0)+1);
  const [showExportDialog,setShowExportDialog]=useState(false);
  const [exporting,setExporting]=useState(false);
  const drawingRef=useRef(false);
  const curPath=useRef([]);
  const startXY=useRef({x:0,y:0});
  const pathsRef=useRef([]);

  const isTeam=user.role==="team"||user.role==="admin";

  useEffect(()=>{
    api.getComments(drawing.id).then(d=>setComments(d.comments));
    api.getMarkups(drawing.id).then(d=>{
      const byPage={};
      const byPageDims={};
      d.markups.forEach(m=>{
        byPage[m.page||1]=m.paths||[];
        byPageDims[m.page||1]={w:m.canvas_width||0,h:m.canvas_height||0};
      });
      setAllMarkups(byPage);
      setAllMarkupDims(byPageDims);
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
      const scale=((wrap.clientWidth-48)/vp0.width)*zoom;
      const vp=pg.getViewport({scale});
      canvasRef.current.width=vp.width;canvasRef.current.height=vp.height;
      markupRef.current.width=vp.width;markupRef.current.height=vp.height;
      pg.render({canvasContext:canvasRef.current.getContext("2d"),viewport:vp}).promise.then(redraw);
    });
  },[pdfDoc,page,zoom]);

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
pathsRef.current.forEach(p=>drawPath(ctx,p,zoom));
  },[]);

  function drawPath(ctx,p,scale){
    scale=scale||1;
    ctx.save();ctx.strokeStyle=p.color;ctx.lineWidth=p.width*scale;ctx.lineCap="round";ctx.lineJoin="round";
    if(p.tool==="hl"){ctx.globalAlpha=0.35;}
    if(p.tool==="textlabel"){
      ctx.fillStyle=p.color;ctx.font=(14*scale)+"px Manrope,sans-serif";
      ctx.fillText(p.text,p.pts[0].x*scale,p.pts[0].y*scale);
    } else if(p.tool==="arrow"){
      drawArrow(ctx,p.pts[0].x*scale,p.pts[0].y*scale,p.pts[1].x*scale,p.pts[1].y*scale,p.color,p.width*scale);
    } else if(p.tool==="cloud"){
      drawCloud(ctx,p.pts[0].x*scale,p.pts[0].y*scale,p.pts[1].x*scale,p.pts[1].y*scale,p.color,p.width*scale);
    } else if(p.tool==="rect"){
      ctx.strokeRect(p.pts[0].x*scale,p.pts[0].y*scale,(p.pts[1].x-p.pts[0].x)*scale,(p.pts[1].y-p.pts[0].y)*scale);
    } else {
      ctx.beginPath();p.pts.forEach((pt,i)=>i?ctx.lineTo(pt.x*scale,pt.y*scale):ctx.moveTo(pt.x*scale,pt.y*scale));ctx.stroke();
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
    ctx.strokeStyle=col;ctx.lineWidth=w||2;
    ctx.beginPath();
    for(let a=0;a<=Math.PI*2;a+=0.15){
      const bx=cx+rw*Math.cos(a)+6*Math.cos(a*5);
      const by=cy+rh*Math.sin(a)+6*Math.sin(a*5);
      a===0?ctx.moveTo(bx,by):ctx.lineTo(bx,by);
    }
    ctx.closePath();ctx.stroke();
  }

  const getXY=e=>{const r=markupRef.current.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};

  const onWheel=e=>{
    e.preventDefault();
    const delta=e.deltaY>0?-0.1:0.1;
    setZoom(z=>Math.min(3,Math.max(0.3,z+delta)));
  };

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
    if(tool==="pen"||tool==="hl"){
      curPath.current.push({x,y});ctx.save();
      if(tool==="hl"){ctx.globalAlpha=0.35;}
      ctx.strokeStyle=color;ctx.lineWidth=tool==="hl"?strokeW*6:strokeW;ctx.lineCap="round";ctx.lineJoin="round";
      const pts=curPath.current;ctx.beginPath();ctx.moveTo(pts[pts.length-2].x,pts[pts.length-2].y);ctx.lineTo(x,y);ctx.stroke();ctx.restore();
    } else if(tool==="erase"){ctx.clearRect(x-12,y-12,24,24);}
    else{
      redraw();ctx.save();ctx.strokeStyle=color;ctx.lineWidth=strokeW;ctx.lineCap="round";
      if(tool==="arrow")drawArrow(ctx,startXY.current.x,startXY.current.y,x,y,color,strokeW);
      else if(tool==="cloud")drawCloud(ctx,startXY.current.x,startXY.current.y,x,y,color,strokeW);
      else if(tool==="rect")ctx.strokeRect(startXY.current.x,startXY.current.y,x-startXY.current.x,y-startXY.current.y);
      ctx.restore();
    }
  };

  const onMouseUp=e=>{
    if(!drawingRef.current)return;drawingRef.current=false;const{x,y}=getXY(e);let p;
    if(tool==="pen"||tool==="hl")p={tool,color,width:tool==="hl"?strokeW*6:strokeW,pts:[...curPath.current],id:Date.now()};
    else if(tool==="arrow")p={tool:"arrow",color,width:strokeW,pts:[{x:startXY.current.x,y:startXY.current.y},{x,y}],id:Date.now()};
    else if(tool==="cloud")p={tool:"cloud",color,width:strokeW,pts:[{x:startXY.current.x,y:startXY.current.y},{x,y}],id:Date.now()};
    else if(tool==="rect")p={tool:"rect",color,width:strokeW,pts:[{x:startXY.current.x,y:startXY.current.y},{x,y}],id:Date.now()};
pathsRef.current.forEach(p=>drawPath(ctx,p,zoom));
    curPath.current=[];
  };

  const addComment=async()=>{
    const txt=newComment.trim();if(!txt)return;
    const d=await api.addComment(drawing.id,{text:txt,type:ctype,pinX:pendingPin?.fx,pinY:pendingPin?.fy,page});
    setComments(prev=>[...prev,d.comment]);
    setNewComment("");setPendingPin(null);setSelectedCid(d.comment.id);setReplyTarget(d.comment.id);setTool("comment");
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
      const confirmed=window.confirm("Confirm Revision\n\n"+stage+" Stage - This will use Revision "+nextRev+" of "+total+".\n\nProceed?");
      if(!confirmed)return;
      const d=await api.confirmRevision(drawing.id,commentId);
      setComments(comments.map(c=>c.id===commentId?{...c,status:"confirmed"}:c));
      onRevisionConfirmed(d.revisionSummary);
      alert("Revision confirmed. The Xpress Draft team has been notified.");
    }catch(e){alert("Error: "+e.message);}
  };

const handleSave=async()=>{
    setSaving(true);
    const cw=Math.round((markupRef.current?.width||0)/zoom);
    const ch=Math.round((markupRef.current?.height||0)/zoom);
    const normalizedMarkups=markups.map(p=>({
      ...p,
      pts:p.pts.map(pt=>({x:pt.x/zoom,y:pt.y/zoom})),
      width:p.width/zoom
    }));
    await api.saveMarkups(drawing.id,normalizedMarkups,page,cw,ch);
    setAllMarkups(prev=>({...prev,[page]:markups}));
    setAllMarkupDims(prev=>({...prev,[page]:{w:cw,h:ch}}));
    setSaving(false);
  };

  const handleExportPDF=async()=>{setShowExportDialog(true);};

  const doExport=async()=>{
    if(!pdfDoc){alert("No drawing loaded.");return;}
    setExporting(true);setShowExportDialog(false);
    if(!window.jspdf){
      const script=document.createElement("script");
      script.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      document.head.appendChild(script);
      await new Promise(r=>{script.onload=r;});
    }
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:"landscape",unit:"pt"});
    let firstPage=true;
    const allPins=comments.filter(c=>c.pin_x!=null).sort((a,b)=>(a.page||1)-(b.page||1));
    for(let p=1;p<=totalPages;p++){
      const pg=await pdfDoc.getPage(p);
      const vp0=pg.getViewport({scale:1});
      const scale=2;
      const vp=pg.getViewport({scale});
      const c=document.createElement("canvas");
      c.width=vp.width;c.height=vp.height;
      const ctx=c.getContext("2d");
      await pg.render({canvasContext:ctx,viewport:vp}).promise;
      const pagePaths=allMarkups[p]||[];
      const dims=allMarkupDims[p]||{w:0,h:0};
      const scaleX=dims.w>0?vp.width/dims.w:scale;
      const scaleY=dims.h>0?vp.height/dims.h:scale;
      pagePaths.forEach(path=>{
        ctx.save();
        ctx.strokeStyle=path.color;
        ctx.lineWidth=path.width*(scaleX+scaleY)/2;
        ctx.lineCap="round";ctx.lineJoin="round";
        if(path.tool==="hl"){ctx.globalAlpha=0.35;}
        if(path.tool==="textlabel"){
          ctx.fillStyle=path.color;
          ctx.font=(14*(scaleX+scaleY)/2)+"px sans-serif";
          ctx.fillText(path.text,path.pts[0].x*scaleX,path.pts[0].y*scaleY);
        } else if(path.tool==="arrow"){
          const x1=path.pts[0].x*scaleX,y1=path.pts[0].y*scaleY;
          const x2=path.pts[1].x*scaleX,y2=path.pts[1].y*scaleY;
          const ang=Math.atan2(y2-y1,x2-x1),hw=Math.max(path.width*(scaleX+scaleY)/2*4,16);
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
          ctx.fillStyle=path.color;ctx.beginPath();ctx.moveTo(x2,y2);
          ctx.lineTo(x2-hw*Math.cos(ang-0.4),y2-hw*Math.sin(ang-0.4));
          ctx.lineTo(x2-hw*Math.cos(ang+0.4),y2-hw*Math.sin(ang+0.4));
          ctx.closePath();ctx.fill();
        } else if(path.tool==="cloud"){
          const cx=(path.pts[0].x+path.pts[1].x)/2*scaleX;
          const cy=(path.pts[0].y+path.pts[1].y)/2*scaleY;
          const rw=Math.abs(path.pts[1].x-path.pts[0].x)/2*scaleX;
          const rh=Math.abs(path.pts[1].y-path.pts[0].y)/2*scaleY;
          if(rw>5&&rh>5){
            ctx.beginPath();
            for(let a=0;a<=Math.PI*2;a+=0.15){
              const bx=cx+rw*Math.cos(a)+8*Math.cos(a*5);
              const by=cy+rh*Math.sin(a)+8*Math.sin(a*5);
              a===0?ctx.moveTo(bx,by):ctx.lineTo(bx,by);
            }
            ctx.closePath();ctx.stroke();
          }
        } else if(path.tool==="rect"){
          ctx.strokeRect(
            path.pts[0].x*scaleX,path.pts[0].y*scaleY,
            (path.pts[1].x-path.pts[0].x)*scaleX,(path.pts[1].y-path.pts[0].y)*scaleY
          );
        } else {
          ctx.beginPath();
          path.pts.forEach((pt,i)=>i?ctx.lineTo(pt.x*scaleX,pt.y*scaleY):ctx.moveTo(pt.x*scaleX,pt.y*scaleY));
          ctx.stroke();
        }
        ctx.restore();
      });
      const pageComments=allPins.filter(cc=>(cc.page||1)===p);
      pageComments.forEach(cc=>{
        const globalIdx=allPins.indexOf(cc);
        const x=cc.pin_x*vp.width;const y=cc.pin_y*vp.height;
        ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fillStyle="#E24B4A";ctx.fill();
        ctx.fillStyle="#fff";ctx.font="bold 18px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(globalIdx+1,x,y);
      });
      const imgData=c.toDataURL("image/jpeg",0.9);
      const pw=pdf.internal.pageSize.getWidth();
      const ph=pdf.internal.pageSize.getHeight();
      const ratio=Math.min(pw/vp.width,ph/vp.height);
      if(!firstPage)pdf.addPage();
      pdf.addImage(imgData,"JPEG",0,0,vp.width*ratio,vp.height*ratio);
      firstPage=false;
      const pageCommentList=allPins.filter(cc=>(cc.page||1)===p);
      if(pageCommentList.length>0){
        pdf.addPage();const cpw=pdf.internal.pageSize.getWidth();
        pdf.setFontSize(14);pdf.setTextColor(42,43,41);pdf.text("Comments — Page "+p,40,30);
        pdf.setDrawColor(210,202,196);pdf.line(40,36,cpw-40,36);
        let cy=50;
        pageCommentList.forEach((cc)=>{
          if(cy>500){pdf.addPage();cy=30;}
          const globalIdx=allPins.indexOf(cc);
          pdf.setFontSize(11);pdf.setTextColor(226,75,74);
          const typeLabel=(cc.type||"note").charAt(0).toUpperCase()+(cc.type||"note").slice(1);
          pdf.text("Pin "+(globalIdx+1)+" — "+typeLabel,40,cy);
          pdf.setTextColor(42,43,41);pdf.setFontSize(10);
          const lines=pdf.splitTextToSize(cc.text,cpw-80);
          pdf.text(lines,40,cy+13);cy+=13+(lines.length*12)+10;
          if(cc.replies&&cc.replies.length>0){
            cc.replies.forEach(r=>{
              if(cy>500){pdf.addPage();cy=30;}
              pdf.setTextColor(234,103,47);pdf.setFontSize(9);
              pdf.text((r.author?.name||"Team")+(r.is_ai_interpreted?" (AI)":"")+":",52,cy);
              pdf.setTextColor(66,69,60);const rlines=pdf.splitTextToSize(r.text,cpw-100);
              pdf.text(rlines,52,cy+10);cy+=10+(rlines.length*11)+6;
            });
          }
          pdf.setDrawColor(242,234,229);pdf.line(40,cy,cpw-40,cy);cy+=8;
        });
      }
    }
    pdf.addPage();const pw=pdf.internal.pageSize.getWidth();
    pdf.setFontSize(20);pdf.setTextColor(42,43,41);pdf.text("Markup Summary",40,40);
    pdf.setFontSize(12);pdf.setTextColor(94,99,91);
    const proj=[project.job_number,project.site_address].filter(Boolean).join(" - ")||project.name;
    pdf.text(proj,40,58);pdf.text("Exported: "+new Date().toLocaleDateString("en-AU")+" | Markup "+exportNum,40,72);
    pdf.setDrawColor(210,202,196);pdf.line(40,80,pw-40,80);
    let y=96;
    allPins.forEach((cc,i)=>{
      if(y>480){pdf.addPage();y=40;}
      pdf.setFontSize(11);pdf.setTextColor(226,75,74);
      const typeLabel=(cc.type||"note").charAt(0).toUpperCase()+(cc.type||"note").slice(1);
      pdf.text("Pin "+(i+1)+" - "+typeLabel+" (Page "+(cc.page||1)+")",40,y);
      pdf.setTextColor(42,43,41);pdf.setFontSize(10);
      const lines=pdf.splitTextToSize(cc.text,pw-80);
      pdf.text(lines,40,y+14);y+=14+(lines.length*13)+10;
      pdf.setDrawColor(242,234,229);pdf.line(40,y,pw-40,y);y+=8;
    });
    const jobNum=(project.job_number||"").replace(/\s+/g,"-");
    const addr=(project.site_address||project.name||"drawing").replace(/\s+/g,"-").replace(/[^a-zA-Z0-9-]/g,"");
    const filename=jobNum+(addr?"-"+addr:"")+"-Markup-"+exportNum+".pdf";
    pdf.save(filename);
    await api.incrementMarkupExport(project.id,exportNum);
    setExportNum(exportNum+1);
    setExporting(false);
  };

  const submitAllChanges=async()=>{
    const openComments=comments.filter(c=>c.status==="open"||c.status==="interpreted");
    if(openComments.length===0){alert("No pending comments to submit.");return;}
    const rs=revisionSummary;
    const nextRev=(rs?.used||0)+1;
    const total=rs?.totalAllowed||2;
    const stage=rs?.stageLabel==="PR"?"Preliminary":"Working Drawings";
    const confirmed=window.confirm("Submit All Changes\n\n"+stage+" Stage - Revision "+nextRev+" of "+total+"\n\nYou have "+openComments.length+" comment"+(openComments.length!==1?"s":"")+" to submit.\n\nProceed?");
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
    alert("All changes submitted. The Xpress Draft team will review and respond shortly.");
  };

  const COLORS=["#EA672F","#E24B4A","#378ADD","#639922","#7F77DD","#2A2B29","#CC0000","#006600"];
  const CTYPES={issue:{label:"Issue",bg:"#FCEBEB",color:"#8B2020",dot:"#E24B4A"},info:{label:"Question",bg:"#FEF3E8",color:"#7A3D0A",dot:B.orange},ok:{label:"Approved",bg:"#EAF3DE",color:"#2E5C10",dot:"#639922"},note:{label:"Note",bg:"#F0EEF8",color:"#3D3580",dot:"#7F77DD"}};
  const cursorMap={pen:"crosshair",hl:"crosshair",arrow:"crosshair",cloud:"crosshair",rect:"crosshair",text:"text",comment:"copy",select:"default",erase:"cell"};

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {showExportDialog&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:B.white,borderRadius:12,padding:28,width:360,fontFamily:"Manrope,sans-serif"}}>
            <h3 style={{margin:"0 0 16px",color:B.black,fontSize:16}}>Export Markup PDF</h3>
            <label style={{fontSize:13,color:B.black1,display:"block",marginBottom:6,fontWeight:500}}>Markup number</label>
            <input type="number" value={exportNum} onChange={e=>setExportNum(+e.target.value)}
              style={{width:"100%",border:"1px solid "+B.tone1,borderRadius:7,padding:"9px 11px",fontSize:14,fontFamily:"Manrope,sans-serif",boxSizing:"border-box",marginBottom:8}}/>
            <p style={{fontSize:12,color:B.black2,margin:"0 0 20px"}}>
              File will be saved as:<br/>
              <strong>{(project.job_number||"").replace(/\s+/g,"-")+"-"+(project.site_address||project.name||"drawing").replace(/\s+/g,"-").replace(/[^a-zA-Z0-9-]/g,"")+"-Markup-"+exportNum+".pdf"}</strong>
            </p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowExportDialog(false)} style={btnGhost}>Cancel</button>
              <button onClick={doExport} style={btnPrimary}>Export PDF</button>
            </div>
          </div>
        </div>
      )}

      <div style={{background:B.white,borderBottom:"1px solid "+B.tone1,padding:"6px 12px",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",flexShrink:0}}>
        {[["select","ESC","Select"],["pen","✏","Pen"],["hl","🖊","Highlight"],["arrow","↗","Arrow"],["cloud","☁","Cloud"],["rect","▭","Rect"],["text","T","Text"],["comment","📍","Pin"],["erase","⌫","Erase"]].map(([id,ic,title])=>(
          <button key={id} onClick={()=>setTool(id)} title={title}
            style={{padding:"5px 8px",border:"1px solid "+(tool===id?B.orange:B.tone1),borderRadius:6,background:tool===id?"#FEF3E8":B.white,color:tool===id?B.orange:B.black1,cursor:"pointer",fontSize:14,fontFamily:"Manrope,sans-serif",fontWeight:tool===id?600:400}}>
            {ic}
          </button>
        ))}
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
        {COLORS.map(c=><div key={c} onClick={()=>setColor(c)} style={{width:18,height:18,borderRadius:"50%",background:c,cursor:"pointer",border:color===c?"2.5px solid "+B.black:"1.5px solid transparent"}}/>)}
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
        <input type="range" min="1" max="12" value={strokeW} onChange={e=>setStrokeW(+e.target.value)} style={{width:60}}/>
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
        <button onClick={()=>{const u=markups.slice(0,-1);setMarkups(u);pathsRef.current=u;redraw();}} style={btnGhost}>↩</button>
        <button onClick={()=>{if(!window.confirm("Clear all markup?"))return;setMarkups([]);pathsRef.current=[];redraw();}} style={btnGhost}>🗑</button>
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
<button onClick={()=>setZoom(z=>Math.Max(0.3,z-0.1))} style={btnGhost}>-</button>
<span style={{fontSize:11,color:B.black2,minWidth:36,textAlign:"center"}}>{Math.round(zoom*100)}%</span>
<button onClick={()=>setZoom(z=>Math.min(3,z+0.1))} style={btnGhost}>+</button>
        <button onClick={()=>setZoom(1)} style={{...btnGhost,fontSize:11}}>Fit</button>
        <div style={{width:1,height:22,background:B.tone1,margin:"0 2px"}}/>
        {totalPages>1&&<><button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={btnGhost}>&#8249;</button><span style={{fontSize:12,color:B.black2}}>pg {page}/{totalPages}</span><button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={btnGhost}>&#8250;</button></>}
        <button onClick={handleSave} style={{...btnPrimary}}>{saving?"Saving...":"Save"}</button>
        <button onClick={handleExportPDF} style={{...btnGhost,marginLeft:"auto"}}>{exporting?"Exporting...":"Export PDF"}</button>
      </div>

      {tool==="comment"&&!pendingPin&&<div style={{background:"#FEF3E8",borderBottom:"1px solid "+B.tone1,padding:"5px 16px",fontSize:12,color:B.orange,fontFamily:"Manrope,sans-serif"}}>Click anywhere on the drawing to place a comment pin.</div>}
      {pendingPin&&<div style={{background:"#FEF3E8",borderBottom:"1px solid "+B.orange,padding:"5px 16px",fontSize:12,color:B.black1,fontFamily:"Manrope,sans-serif",display:"flex",alignItems:"center",gap:12}}>
        <span>Pin placed - write your comment in the sidebar then click Done.</span>
        <button onClick={()=>setPendingPin(null)} style={{marginLeft:"auto",padding:"3px 10px",background:"none",border:"1px solid "+B.orange,borderRadius:5,color:B.orange,cursor:"pointer",fontSize:12,fontFamily:"Manrope,sans-serif"}}>Cancel pin</button>
      </div>}

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div ref={wrapRef} style={{flex:1,overflow:"auto",background:"#555",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:24}} onWheel={onWheel}>
          <div style={{position:"relative",boxShadow:"0 4px 24px rgba(0,0,0,0.35)"}}>
            <canvas ref={canvasRef} style={{display:"block"}}/>
            <canvas ref={markupRef} style={{position:"absolute",top:0,left:0,cursor:cursorMap[tool]||"crosshair"}}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={()=>{drawingRef.current=false;}}/>
            <div style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}}>
              <div style={{position:"relative",width:"100%",height:"100%",pointerEvents:"none"}}>
                {pendingPin&&<div style={{position:"absolute",left:pendingPin.fx*(markupRef.current?.width||1),top:pendingPin.fy*(markupRef.current?.height||1),transform:"translate(-50%,-50%)",width:26,height:26,borderRadius:"50%",background:B.orange,border:"2px solid white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",zIndex:11,boxShadow:"0 2px 6px rgba(0,0,0,0.4)",pointerEvents:"none"}}>+</div>}
                {comments.filter(c=>c.pin_x!=null&&(c.page||1)===page).map((c)=>{
                  const ct=CTYPES[c.type]||CTYPES.note;
                  const w=markupRef.current?.width||1,h=markupRef.current?.height||1;
                  const globalIdx=comments.filter(cc=>cc.pin_x!=null).indexOf(c);
                  return <div key={c.id} onClick={()=>{setSelectedCid(c.id);setReplyTarget(c.id);}}
                    style={{position:"absolute",left:c.pin_x*w,top:c.pin_y*h,transform:"translate(-50%,-50%) scale("+(selectedCid===c.id?1.3:1)+")",
                      width:22,height:22,borderRadius:"50%",background:ct.dot,border:"2px solid white",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",
                      cursor:"pointer",zIndex:10,transition:"transform 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)",pointerEvents:"all"}}>{globalIdx+1}</div>;
                })}
              </div>
            </div>
          </div>
        </div>

        <div style={{width:280,background:B.white,borderLeft:"1px solid "+B.tone1,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:B.black2,borderBottom:"1px solid "+B.tone1,letterSpacing:"0.05em"}}>
            {comments.filter(c=>(c.page||1)===page).length} COMMENT{comments.filter(c=>(c.page||1)===page).length!==1?"S":""}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:10}}>
            {comments.filter(c=>(c.page||1)===page).length===0&&<div style={{textAlign:"center",padding:"2rem 0",color:B.black2,fontSize:13,lineHeight:1.6}}>No comments yet.<br/>Use the pin tool to anchor comments.</div>}
            {comments.filter(c=>(c.page||1)===page).map((c)=>{
              const ct=CTYPES[c.type]||CTYPES.note;
              const isSelected=selectedCid===c.id;
              const globalIdx=comments.filter(cc=>cc.pin_x!=null).indexOf(c);
              return(
                <div key={c.id} style={{marginBottom:10}}>
                  <div onClick={()=>{setSelectedCid(c.id);setReplyTarget(c.id);}}
                    style={{background:isSelected?"#FEF3E8":B.cream,border:"1px solid "+(isSelected?B.orange:B.tone1),borderRadius:8,padding:"10px 11px",cursor:"pointer",borderLeft:"3px solid "+ct.dot}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:ct.dot,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>{c.pin_x!=null?globalIdx+1:""}</div>
                      <span style={{fontSize:12,fontWeight:600,color:B.black,flex:1}}>{c.author?.name}</span>
                      <span style={{fontSize:10,color:B.black2}}>{new Date(c.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</span>
                    </div>
                    <p style={{fontSize:12,color:B.black1,lineHeight:1.55,margin:"0 0 6px"}}>{c.text}</p>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:ct.bg,color:ct.color,fontWeight:500}}>{ct.label}</span>
                      {c.status==="confirmed"&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#EAF3DE",color:"#2E5C10",fontWeight:500}}>Confirmed</span>}
                    </div>
                    {c.author?.id===user?.id&&c.status!=="confirmed"&&<div style={{display:"flex",gap:6,marginTop:6}}>
                      <button onClick={e=>{e.stopPropagation();const t=prompt("Edit comment:",c.text);if(t&&t.trim())setComments(comments.map(x=>x.id===c.id?{...x,text:t.trim()}:x));}} style={{fontSize:10,padding:"2px 8px",border:"1px solid "+B.tone1,borderRadius:4,background:B.white,cursor:"pointer",color:B.black2,fontFamily:"Manrope,sans-serif"}}>Edit</button>
                      <button onClick={e=>{e.stopPropagation();if(window.confirm("Delete this comment?"))setComments(comments.filter(x=>x.id!==c.id));}} style={{fontSize:10,padding:"2px 8px",border:"1px solid #E24B4A",borderRadius:4,background:B.white,cursor:"pointer",color:"#8B2020",fontFamily:"Manrope,sans-serif"}}>Delete</button>
                    </div>}
                  </div>

                  {(c.replies||[]).map(r=>(
                    <div key={r.id} style={{marginLeft:12,marginTop:5,padding:"8px 10px",background:r.author?.role==="team"||r.author?.role==="admin"?"#FEF3E8":B.white,border:"1px solid "+(r.author?.role==="team"||r.author?.role==="admin"?B.orange:B.tone1),borderRadius:7,borderLeft:"3px solid "+(r.author?.role==="team"||r.author?.role==="admin"?B.orange:B.tone2)}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <span style={{fontSize:11,fontWeight:600,color:r.author?.role==="team"||r.author?.role==="admin"?B.orange:B.black}}>{r.author?.name}</span>
                        {r.is_ai_interpreted&&<span style={{fontSize:9,background:B.orange,color:"#fff",borderRadius:4,padding:"1px 5px"}}>AI interpreted</span>}
                        {(r.author?.role==="team"||r.author?.role==="admin")&&!r.is_ai_interpreted&&<span style={{fontSize:9,background:B.orange,color:"#fff",borderRadius:4,padding:"1px 5px"}}>XD Team</span>}
                      </div>
                      <p style={{fontSize:12,color:B.black1,margin:0,lineHeight:1.5}}>{r.text}</p>
                    </div>
                  ))}

                  {isSelected&&user.role!=="admin"&&user.role!=="team"&&c.status==="interpreted"&&(
                    <div style={{marginLeft:12,marginTop:8,padding:12,background:"#FEF3E8",border:"1px solid "+B.orange,borderRadius:8}}>
                      <p style={{fontSize:12,color:B.black1,margin:"0 0 6px",fontWeight:600}}>This will use a revision</p>
                      <p style={{fontSize:11,color:B.black2,margin:"0 0 10px",lineHeight:1.5}}>
                        {revisionSummary?.stageLabel==="PR"?"Preliminary":"Working Drawings"} Stage - Revision {(revisionSummary?.used||0)+1} of {revisionSummary?.totalAllowed||2}
                      </p>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>setSelectedCid(null)} style={btnGhost}>Cancel</button>
                        <button onClick={()=>confirmRevision(c.id)} style={btnPrimary}>Confirm and Send</button>
                      </div>
                    </div>
                  )}

                  {isSelected&&isTeam&&c.status==="open"&&(
                    <div style={{marginLeft:12,marginTop:6}}>
                      <button onClick={()=>interpret(c.id)} disabled={interpreting===c.id}
                        style={{...btnPrimary,width:"100%",justifyContent:"center",marginBottom:6}}>
                        {interpreting===c.id?"Interpreting...":"Interpret with AI"}
                      </button>
                    </div>
                  )}

                  {isSelected&&replyTarget===c.id&&c.status!=="confirmed"&&(
                    <div style={{marginLeft:12,marginTop:6}}>
                      <textarea value={replyDraft} onChange={e=>setReplyDraft(e.target.value)} rows={2}
                        placeholder={isTeam?"Type reply - AI can polish it...":"Write a reply..."}
                        style={{width:"100%",border:"1px solid "+B.tone1,borderRadius:7,padding:"7px 9px",fontSize:12,fontFamily:"Manrope,sans-serif",resize:"none",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:6,marginTop:5}}>
                        {isTeam&&<button onClick={improveReply} disabled={improving} style={{...btnGhost,fontSize:11,flex:1}}>{improving?"Improving...":"AI Polish"}</button>}
                        <button onClick={sendReply} style={{...btnPrimary,fontSize:11,flex:1}}>Send</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{padding:10,borderTop:"1px solid "+B.tone1}}>
            {pendingPin&&<div style={{fontSize:11,color:B.orange,marginBottom:6}}>Pin placed - write your comment below</div>}
            <textarea value={newComment} onChange={e=>setNewComment(e.target.value)} rows={2}
              placeholder="Add a comment..."
              style={{width:"100%",border:"1px solid "+B.tone1,borderRadius:7,padding:"7px 9px",fontSize:12,fontFamily:"Manrope,sans-serif",resize:"none",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:4,margin:"6px 0 8px"}}>
              {Object.entries(CTYPES).map(([k,v])=>(
                <div key={k} onClick={()=>setCtype(k)}
                  style={{flex:1,fontSize:10,padding:"3px 2px",border:"1px solid "+(ctype===k?B.orange:B.tone1),borderRadius:5,cursor:"pointer",textAlign:"center",fontWeight:500,background:ctype===k?"#FEF3E8":B.white,color:ctype===k?B.orange:B.black2}}>
                  {v.label}
                </div>
              ))}
            </div>
            <button onClick={addComment} style={{...btnPrimary,width:"100%",justifyContent:"center",fontSize:14,padding:"10px",marginBottom:8}}>Done</button>
            {comments.filter(c=>(c.page||1)===page&&c.status!=="confirmed").length>0&&(
              <button onClick={submitAllChanges} style={{...btnPrimary,width:"100%",justifyContent:"center",fontSize:14,padding:"12px",background:B.black}}>
                Submit all changes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default DrawingView;
