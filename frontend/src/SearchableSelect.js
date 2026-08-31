import { useState, useEffect } from "react";

const B = { orange:"#EA672F", tone1:"#D2CAC4", black:"#2A2B29", white:"#ffffff" };
const inputSt = { width:"100%", border:"1px solid "+B.tone1, borderRadius:7, padding:"9px 11px", fontSize:14, fontFamily:"Manrope,sans-serif", background:B.white, color:B.black, boxSizing:"border-box" };

// A searchable dropdown backed by the browser's native datalist — typing
// filters the list live, no custom JS filtering needed. Since datalist
// only gives back the typed text (not a hidden id), this maps the typed
// label back to the matching option's id on every change.
export default function SearchableSelect({ options, value, onChange, placeholder, emptyLabel }) {
  const listId = "sl-"+Math.random().toString(36).slice(2);
  const selected = options.find(o=>o.id===value);
  const [text,setText] = useState(selected?selected.label:"");

  useEffect(()=>{
    const match = options.find(o=>o.id===value);
    setText(match?match.label:"");
  },[value]);

  const handleChange=(typed)=>{
    setText(typed);
    if(!typed.trim()||typed===emptyLabel){onChange("");return;}
    const match = options.find(o=>o.label.toLowerCase()===typed.toLowerCase());
    if(match)onChange(match.id);
  };

  return (
    <>
      <input list={listId} style={{...inputSt,marginBottom:16}} value={text} placeholder={placeholder||emptyLabel} onChange={e=>handleChange(e.target.value)}/>
      <datalist id={listId}>
        <option value={emptyLabel||""}/>
        {options.map(o=><option key={o.id} value={o.label}/>)}
      </datalist>
    </>
  );
}
