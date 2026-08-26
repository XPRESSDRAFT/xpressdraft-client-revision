import { useState, useEffect, useRef } from "react";

const B = { orange:"#EA672F", black:"#2A2B29", cream:"#F3EAE5", tone1:"#D2CAC4", tone2:"#A9A09B", black1:"#42453C", black2:"#5E635B", white:"#ffffff" };
const ROLE_COLOR = { client: "#378ADD", contractor: B.orange, admin: "#7F77DD" };
const ROLE_LABEL = { client: "Client", contractor: "Xpress Draft", admin: "Xpress Draft (Admin)" };

export default function Chat({ fetchUrl, apiBase, token, currentRole }) {
  const [messages,setMessages]=useState([]);
  const [loading,setLoading]=useState(true);
  const [draft,setDraft]=useState("");
  const [sending,setSending]=useState(false);
  const [error,setError]=useState(null);
  const bottomRef=useRef();

  const load=()=>{
    fetch(apiBase+fetchUrl,{headers:{Authorization:"Bearer "+token}})
      .then(r=>r.json().then(d=>({ok:r.ok,d})))
      .then(({ok,d})=>{if(!ok){setError(d.error||"Unable to load chat");setLoading(false);return;}setMessages(d.messages||[]);setLoading(false);})
      .catch(()=>{setError("Unable to load chat");setLoading(false);});
  };
  useEffect(()=>{load();},[fetchUrl]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  const send=async()=>{
    const text=draft.trim();
    if(!text)return;
    setSending(true);
    try{
      const r=await fetch(apiBase+fetchUrl,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({message:text})});
      if(!r.ok)throw new Error((await r.json()).error||"Failed to send");
      setDraft("");load();
    }catch(e){alert("Failed to send message: "+e.message);}
    setSending(false);
  };

  if(loading)return <div style={{padding:"1.25rem",color:B.black2,fontSize:13}}>Loading chat...</div>;
  if(error)return <div style={{padding:"1.25rem",color:"#8B2020",fontSize:13,textAlign:"center"}}>{error}</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",height:400}}>
      <div style={{flex:1,overflowY:"auto",padding:"0 4px",display:"flex",flexDirection:"column",gap:8}}>
        {messages.length===0&&<div style={{textAlign:"center",color:B.black2,fontSize:13,padding:"2rem 0"}}>No messages yet. Say hello!</div>}
        {messages.map(m=>{
          const mine=m.sender_role===currentRole;
          return (
            <div key={m.id} style={{alignSelf:mine?"flex-end":"flex-start",maxWidth:"78%"}}>
              {!mine&&<div style={{fontSize:10,fontWeight:700,color:ROLE_COLOR[m.sender_role]||B.black2,marginBottom:2}}>{ROLE_LABEL[m.sender_role]||m.sender_role}</div>}
              <div style={{background:mine?B.orange:B.cream,color:mine?B.white:B.black1,padding:"8px 12px",borderRadius:10,fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{m.message}</div>
              <div style={{fontSize:10,color:B.tone2,marginTop:2,textAlign:mine?"right":"left"}}>{new Date(m.created_at).toLocaleString("en-AU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      <div style={{display:"flex",gap:8,marginTop:10,borderTop:"1px solid "+B.tone1,paddingTop:10}}>
        <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={2} placeholder="Type a message..."
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          style={{flex:1,border:"1px solid "+B.tone1,borderRadius:7,padding:"7px 9px",fontSize:13,fontFamily:"Manrope,sans-serif",resize:"none",boxSizing:"border-box"}}/>
        <button onClick={send} disabled={sending||!draft.trim()} style={{padding:"0 18px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600,opacity:sending||!draft.trim()?0.6:1}}>{sending?"...":"Send"}</button>
      </div>
    </div>
  );
}
