import { useState, useEffect, useRef } from "react";

const B = { orange:"#EA672F", black:"#2A2B29", cream:"#F3EAE5", tone1:"#D2CAC4", tone2:"#A9A09B", black1:"#42453C", black2:"#5E635B", white:"#ffffff", green:"#2E5C10", greenBg:"#EAF3DE" };
const btnPrimary={padding:"8px 16px",background:B.orange,color:B.white,border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontFamily:"Manrope,sans-serif",fontWeight:600};
const inputSt={width:"100%",border:"1px solid "+B.tone1,borderRadius:7,padding:"8px 10px",fontSize:13,fontFamily:"Manrope,sans-serif",boxSizing:"border-box"};

export default function ContractorInvoices({ jobId, apiBase, token }) {
  const [prefill,setPrefill]=useState(null);
  const [amount,setAmount]=useState("");
  const [amountGst,setAmountGst]=useState("");
  const [invoices,setInvoices]=useState([]);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const fileRef=useRef();

  const load=()=>{
    Promise.all([
      fetch(apiBase+"/api/contractor/jobs/"+jobId+"/invoice-prefill",{headers:{Authorization:"Bearer "+token}}).then(r=>r.json()),
      fetch(apiBase+"/api/contractor/jobs/"+jobId+"/invoices",{headers:{Authorization:"Bearer "+token}}).then(r=>r.json()),
    ]).then(([pf,inv])=>{
      setPrefill(pf);setAmount(pf.amount||"");setAmountGst("");
      setInvoices(inv.invoices||[]);setLoading(false);
    }).catch(()=>setLoading(false));
  };
  useEffect(()=>{load();},[jobId]);

  const submitInvoice=async(file)=>{
    if(!file||!amount)return;
    setSubmitting(true);
    const fd=new FormData();fd.append("file",file);fd.append("amount",amount);fd.append("amountGst",amountGst);
    try{
      const r=await fetch(apiBase+"/api/contractor/jobs/"+jobId+"/invoices",{method:"POST",headers:{Authorization:"Bearer "+token},body:fd});
      if(!r.ok)throw new Error((await r.json()).error||"Submission failed");
      load();
      alert("Invoice submitted.");
    }catch(e){alert("Failed to submit invoice: "+e.message);}
    setSubmitting(false);
  };

  if(loading)return <div style={{padding:"1.25rem",color:B.black2,fontSize:13}}>Loading payment details...</div>;

  return (
    <div>
      <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem",marginBottom:16}}>
        <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 12px"}}>Submit Invoice</h3>
        <label style={{fontSize:12,color:B.black2,display:"block",marginBottom:4}}>Amount (excl. GST)</label>
        <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} style={{...inputSt,marginBottom:10}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <label style={{fontSize:12,color:B.black2}}>Amount (incl. GST) — enter what applies to you</label>
          <span onClick={()=>setAmountGst(amount?Math.round(Number(amount)*1.1):"")} style={{fontSize:11,color:B.orange,cursor:"pointer",fontWeight:600}}>Calculate (+10%)</span>
        </div>
        <input type="number" value={amountGst} onChange={e=>setAmountGst(e.target.value)} style={{...inputSt,marginBottom:14}}/>
        <button onClick={()=>fileRef.current?.click()} disabled={submitting} style={{...btnPrimary,width:"100%",opacity:submitting?0.6:1}}>{submitting?"Submitting...":"Upload Invoice"}</button>
        <input ref={fileRef} type="file" accept=".pdf" style={{display:"none"}} onChange={e=>submitInvoice(e.target.files[0])}/>
      </div>

      <div style={{background:B.white,border:"1px solid "+B.tone1,borderRadius:10,padding:"1.25rem"}}>
        <h3 style={{fontSize:14,fontWeight:600,color:B.black,margin:"0 0 12px"}}>Invoice History</h3>
        {invoices.length===0&&<p style={{fontSize:13,color:B.black2,margin:0}}>No invoices submitted yet.</p>}
        {invoices.map(inv=>{
          const isPaid=(inv.paymentStatus||"").toLowerCase().includes("paid");
          return (
            <div key={inv.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid "+B.cream}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:B.black}}>${Number(inv.amount_gst||inv.amount).toLocaleString()}</div>
                <div style={{fontSize:11,color:B.black2}}>{new Date(inv.submitted_at).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})} · {inv.file_name}</div>
              </div>
              <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:isPaid?B.greenBg:"#FEF3E8",color:isPaid?B.green:B.orange,fontWeight:700}}>{inv.paymentStatus}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
