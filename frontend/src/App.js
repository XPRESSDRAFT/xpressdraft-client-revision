import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "./api";

const B = {
  orange: "#EA672F", black: "#2A2B29", cream: "#F3EAE5",
  tone1: "#D2CAC4", tone2: "#A9A09B", black1: "#42453C",
  black2: "#5E635B", white: "#ffffff",
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("xpd_token");
    if (token) {
      api.getMe().then(d => { setUser(d.user); setLoading(false); })
        .catch(() => { localStorage.removeItem("xpd_token"); setLoading(false); });
    } else setLoading(false);
  }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:B.cream, fontFamily:"Manrope,sans-serif" }}>
      <div style={{ color:B.black2 }}>Loading…</div>
    </div>
  );

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/verify" element={<VerifyPage onLogin={setUser} />} />
        <Route path="/*" element={user ? <ProjectsPage user={user} onLogout={() => { localStorage.removeItem("xpd_token"); setUser(null); }} /> : <LoginPage onLogin={setUser} />} />
      </Routes>
    </BrowserRouter>
  );
}

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await api.sendMagicLink(email);
      setSent(true);
    } catch(e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:B.black, fontFamily:"Manrope,sans-serif" }}>
      <div style={{ background:B.white, borderRadius:12, padding:"2.5rem", width:380 }}>
        <XPDLogo size={48} />
        <div style={{ fontWeight:600, fontSize:20, color:B.black, marginTop:12 }}>
          <span style={{ color:B.orange }}>Xpress</span> Draft
        </div>
        <div style={{ fontSize:13, color:B.black2, marginBottom:28, marginTop:4 }}>Plan Review Portal</div>
        {sent ? (
          <div style={{ padding:16, background:"#EAF3DE", borderRadius:8, color:"#2E5C10", fontSize:14, lineHeight:1.6 }}>
            ✅ Check your email for a login link. It expires in 15 minutes.
          </div>
        ) : (
          <>
            <label style={{ fontSize:13, color:B.black1, display:"block", marginBottom:6, fontWeight:500 }}>Email address</label>
            <input style={{ width:"100%", border:`1px solid ${B.tone1}`, borderRadius:7, padding:"9px 11px", fontSize:14, fontFamily:"Manrope,sans-serif", boxSizing:"border-box", marginBottom:8 }}
              type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="you@xpressdraft.com.au"
              onKeyDown={e=>e.key==="Enter"&&submit()} />
            {err && <p style={{ color:"#8B2020", fontSize:13, margin:"0 0 8px" }}>{err}</p>}
            <button style={{ width:"100%", padding:"10px", background:B.orange, color:B.white, border:"none", borderRadius:7, cursor:"pointer", fontSize:14, fontFamily:"Manrope,sans-serif", fontWeight:600, marginTop:4 }}
              onClick={submit} disabled={loading}>
              {loading ? "Sending…" : "Send login link →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function VerifyPage({ onLogin }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setStatus("error"); return; }
    api.verifyMagicLink(token).then(d => {
      localStorage.setItem("xpd_token", d.token);
      onLogin(d.user);
      navigate("/");
    }).catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ minHeight:"100vh", display:"flex",
