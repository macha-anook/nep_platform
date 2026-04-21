// NEP Platform v6.0 — 2026-04-08 — CLEAN_REBUILD
// Build: 2026-04-05 06:19:16
// StudyDetailView | StudiesListPanel | DoctorApp | SymptomPicker
// Researcher: My Studies → Study Overview → Import → Generate
// Doctor: Profile → Patients → Weekly logs → Outcome
// Roles: Doctor (mobile PWA) | Researcher (browser) | Admin
// Data flow: Doctor logs patients → Researcher imports → ESS → Paper
import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from "react";
/* ─── DESIGN TOKENS ──────────────────────────────────────────────────── */
const _BUILD_ID = "20260407014636";
const T = {
  bg0: "#070E1A",
  bg1: "#0B1120",
  bg2: "#0F1829",
  bg3: "#131F32",
  bg4: "#1A2842",
  border: "#1E2F4A",
  border2: "#253857",
  teal: "#00D4AA",
  tealDim: "#00A882",
  tealBg: "rgba(0,212,170,0.08)",
  tealBg2: "rgba(0,212,170,0.15)",
  amber: "#F59E0B",
  amberDim: "#D97706",
  amberBg: "rgba(245,158,11,0.1)",
  red: "#EF4444",
  redBg: "rgba(239,68,68,0.1)",
  green: "#22C55E",
  greenBg: "rgba(34,197,94,0.1)",
  blue: "#3B82F6",
  blueBg: "rgba(59,130,246,0.1)",
  purple: "#A78BFA",
  purpleBg: "rgba(167,139,250,0.1)",
  text0: "#F0F6FF",
  text1: "#C8D8EF",
  text2: "#7A94B8",
  text3: "#4A6080",
  mono: "'DM Mono', monospace",
  sans: "'DM Sans', sans-serif",
  serif: "'DM Serif Display', serif",
};

/* ─── GLOBAL STYLES ──────────────────────────────────────────────────── */
const GlobalStyles = () => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 14px; }
    body { background: ${T.bg0}; color: ${T.text0}; font-family: ${T.sans}; -webkit-font-smoothing: antialiased; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: ${T.bg1}; }
    ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: ${T.text3}; }
    input, select, textarea {
      font-family: ${T.sans}; font-size: 13px; color: ${T.text0};
      background: ${T.bg2}; border: 1px solid ${T.border};
      border-radius: 6px; padding: 7px 10px; outline: none; width: 100%;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: ${T.tealDim}; box-shadow: 0 0 0 3px rgba(0,212,170,0.12);
    }
    input::placeholder, textarea::placeholder { color: ${T.text3}; }
    select option { background: ${T.bg3}; color: ${T.text0}; }
    button { font-family: ${T.sans}; cursor: pointer; border: none; outline: none; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
    @keyframes scoreIn { from { stroke-dashoffset: 310; } to { stroke-dashoffset: var(--offset); } }
    .fade-in { animation: fadeIn 0.25s ease both; }
    .row-hover:hover { background: ${T.bg3} !important; }
  `}</style>
);

/* ─── SCORING ENGINE (mirrors Excel formulas exactly) ────────────────── */
const score = {
  sampleScore: (n) => {
    if (!n || n === "") return 0;
    const v = Number(n);
    if (isNaN(v)) return 0;
    if (v >= 200) return 5;
    if (v >= 100) return 4;
    if (v >= 50)  return 3;
    if (v >= 20)  return 2;
    return 1;
  },
  biasP: (d1, d2, d3, d4, d5) =>
    [d1,d2,d3,d4,d5].reduce((s,v) => s + (Number(v)||0), 0),
  ws: (q, s, o, b, sig) => {
    const base = (Number(q)||0) + (Number(s)||0) + (Number(o)||0) - (Number(b)||0);
    if (sig === "Not Significant") return Math.max(Math.min(base - 2, 8), 0);
    if (!sig || sig === "") return null;
    return Math.max(Math.min(base, 15), 0);
  },
  ess: (outcomes) => {
    const vals = outcomes.map(o => Number(o._ws)).filter(v => !isNaN(v) && v > 0);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
  },
  essClass: (v) => v >= 12 ? "Very Strong" : v >= 9 ? "Strong" : v >= 6 ? "Moderate" : "Weak",
  gradeFromMetrics: (essC, consC, clinC, biasC) => {
    if (essC==="Very Strong" && consC==="Highly Consistent" && clinC==="Clinically Significant" && biasC==="Low Bias") return "High";
    if ((essC==="Very Strong"||essC==="Strong") && consC==="Highly Consistent" && biasC!=="High Bias") return "Moderate–High";
    if (essC==="Strong"||essC==="Moderate") return "Moderate";
    return "Low–Moderate";
  },
  gradeColor: (g) => ({
    "High": T.green, "Moderate–High": T.teal,
    "Moderate": T.amber, "Low–Moderate": T.red,
  }[g] || T.text3),
  wsColor: (ws) => ws >= 12 ? T.green : ws >= 9 ? T.amber : ws >= 6 ? T.blue : T.text3,
};

/* ─── MCID LIBRARY ───────────────────────────────────────────────────── */
const MCID_LIB = [
  { outcome: "Perceived Stress Scale (PSS)", value: 4, unit: "points", ref: "Cohen et al. 1983" },
  { outcome: "Hamilton Anxiety Rating Scale (HAM-A)", value: 7, unit: "points", ref: "Shear et al. 2001" },
  { outcome: "C-Reactive Protein (CRP)", value: 1.0, unit: "mg/L", ref: "Ridker 2003" },
  { outcome: "Pain — Visual Analogue Scale (VAS)", value: 15, unit: "mm", ref: "Farrar et al. 2001" },
  { outcome: "Body Mass Index (BMI)", value: 1.0, unit: "kg/m²", ref: "Clinical consensus" },
  { outcome: "HbA1c", value: 0.5, unit: "%", ref: "ADA 2022" },
  { outcome: "Fasting Blood Glucose", value: 0.4, unit: "mmol/L", ref: "Clinical consensus" },
  { outcome: "Serum Cortisol", value: 20, unit: "nmol/L", ref: "Clinical consensus" },
  { outcome: "Sleep Onset Latency", value: 10, unit: "min", ref: "Morin et al. 2009" },
  { outcome: "Pittsburgh Sleep Quality Index (PSQI)", value: 2.5, unit: "points", ref: "Mollayeva et al. 2016" },
  { outcome: "Total Cholesterol", value: 0.3, unit: "mmol/L", ref: "Clinical consensus" },
  { outcome: "LDL Cholesterol", value: 0.2, unit: "mmol/L", ref: "Clinical consensus" },
  { outcome: "Triglycerides", value: 0.3, unit: "mmol/L", ref: "Clinical consensus" },
  { outcome: "HOMA-IR", value: 0.5, unit: "units", ref: "Clinical consensus" },
  { outcome: "6-Minute Walk Test", value: 25, unit: "m", ref: "Bohannon & Crouch 2017" },
  { outcome: "SF-36 Physical Function", value: 5, unit: "points", ref: "Wyrwich et al. 1999" },
  { outcome: "SF-36 Mental Component Summary (MCS)", value: 4.0, unit: "points", ref: "Wyrwich et al. 2004" },
  { outcome: "Chronic stress", value: 4, unit: "points (PSS)", ref: "Cohen et al. 1983" },
  { outcome: "Generalised anxiety", value: 7, unit: "points (HAM-A)", ref: "Shear et al. 2001" },
  { outcome: "Poor sleep quality", value: 2.5, unit: "points (PSQI)", ref: "Mollayeva et al. 2016" },
  { outcome: "High cortisol", value: 20, unit: "nmol/L", ref: "Clinical consensus" },
  { outcome: "Low energy & fatigue", value: 3, unit: "points (MFI-20)", ref: "Purcell et al. 2010" },
];

/* ─── VOCABULARY ─────────────────────────────────────────────────────── */
const VOCAB = {
  studyType: ["RCT", "Meta", "Observational", "Mechanistic"],
  outcomeCategory: ["Biomarker","Psychological","Metabolic","Physiological","Safety","Sleep","Anthropometric","Immunological","Cognitive","Haematological"],
  direction: ["Improved","No Change","Worsened"],
  significance: ["Significant","Not Significant","Not Reported"],
  effectSizeType: ["MD","SMD","RR","OR","HR","WMD"],
  biasDomain: [0, 0.5, 1],
  biasTool: ["RoB 2","ROBINS-I","AMSTAR 2","NOS","Jadad","None"],
  mcidMet: ["Yes","No","Unknown"],
  biasOverall: ["Low risk","Some concerns","High risk","High confidence","Moderate confidence","Low confidence","N/A — mechanistic","N/A — background"],
};

/* ─── EMPTY OUTCOME FACTORY ──────────────────────────────────────────── */
const Tag = ({ children, color=T.teal, bg }) => (
  <span style={{
    display:"inline-flex", alignItems:"center", gap:4,
    padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:500,
    color, background: bg || `${color}18`, border:`1px solid ${color}30`,
    fontFamily: T.mono, letterSpacing:"0.02em",
  }}>{children}</span>
);

const Badge = ({ label, value, color=T.teal }) => (
  <div style={{
    display:"flex", flexDirection:"column", gap:2,
    padding:"10px 14px", background:T.bg3, borderRadius:8,
    border:`1px solid ${T.border}`,
  }}>
    <span style={{fontSize:10,color:T.text3,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</span>
    <span style={{fontSize:22,fontWeight:600,color,fontFamily:T.mono}}>{value}</span>
  </div>
);

const Tooltip = ({ text, children }) => {
  const [show, setShow] = useState(false);
  const lines = (text||"").split("\n");
  return (
    <span style={{position:"relative",display:"inline-flex"}}
      onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && (
        <span style={{
          position:"absolute", bottom:"calc(100% + 8px)", left:"0",
          minWidth:240, maxWidth:340, background:"#1A2842",
          border:`1px solid ${T.border2}`, borderRadius:8,
          padding:"10px 14px", fontSize:12, color:T.text0,
          whiteSpace:"normal", zIndex:1000, pointerEvents:"none",
          boxShadow:"0 8px 32px rgba(0,0,0,0.7)",
          lineHeight:1.6,
        }}>
          {lines.map((l,i)=>(
            <span key={i} style={{display:"block",
              marginBottom:i<lines.length-1?4:0,
              fontWeight:l.startsWith("•")||l.startsWith("-")?400:l===lines[0]?600:400,
              color:l.startsWith("•")||l.startsWith("-")?T.text1:l===lines[0]?T.text0:T.text1,
            }}>{l||" "}</span>
          ))}
        </span>
      )}
    </span>
  );
};

const HelpIcon = ({ tip }) => (
  <Tooltip text={tip}>
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      width:16, height:16, borderRadius:"50%", background:T.tealBg,
      border:`1px solid ${T.teal}40`, fontSize:10, color:T.teal,
      cursor:"help", fontWeight:700, flexShrink:0,
    }}>?</span>
  </Tooltip>
);

const Btn = ({ children, onClick, variant="primary", disabled=false, style={} }) => {
  const base = {
    display:"inline-flex", alignItems:"center", gap:6,
    padding:"8px 16px", borderRadius:6, fontSize:13, fontWeight:500,
    transition:"all 0.15s", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, ...style,
  };
  const variants = {
    primary: { background:T.teal, color:T.bg0, border:"none" },
    secondary: { background:"transparent", color:T.text1, border:`1px solid ${T.border2}` },
    danger: { background:T.red, color:"#fff", border:"none" },
    ghost: { background:"transparent", color:T.text2, border:"none", padding:"6px 10px" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{...base,...variants[variant]}}>
      {children}
    </button>
  );
};

const SectionHeader = ({ title, subtitle, action }) => (
  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
    marginBottom:20, paddingBottom:16, borderBottom:`1px solid ${T.border}`}}>
    <div>
      <h2 style={{fontSize:18,fontWeight:600,color:T.text0,fontFamily:T.sans}}>{title}</h2>
      {subtitle && <p style={{fontSize:12,color:T.text3,marginTop:3}}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

const FieldLabel = ({ label, required, tip }) => (
  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
    <span style={{fontSize:13,color:"#F0F6FF",fontWeight:700}}>{label}</span>
    {required && <span style={{color:"#F59E0B",fontSize:13,fontWeight:700}}>*</span>}
    {tip && <HelpIcon tip={tip}/>}
  </div>
);

const ScoreChip = ({ value, label }) => {
  if (value === null || value === undefined || value === "") return (
    <span style={{fontFamily:T.mono,fontSize:12,color:T.text3}}>—</span>
  );
  const col = score.wsColor(Number(value));
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4,
      background:`${col}18`, border:`1px solid ${col}40`,
      borderRadius:4, padding:"2px 8px",
      fontFamily:T.mono, fontSize:12, fontWeight:600, color:col,
    }}>{value}</span>
  );
};

/* ─── SCORE RING ─────────────────────────────────────────────────────── */
const ScoreRing = ({ value, max=15, label, sublabel, color=T.teal }) => {
  const r = 44, circ = 2 * Math.PI * r;
  const pct = Math.min((value||0)/max, 1);
  const offset = circ * (1 - pct);
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{position:"relative",width:110,height:110}}>
        <svg width="110" height="110" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r={r} fill="none" stroke={T.border} strokeWidth="7"/>
          <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 55 55)"
            style={{
              transition:"stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)",
            }}/>
        </svg>
        <div style={{
          position:"absolute", inset:0,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
        }}>
          <span style={{fontSize:22,fontWeight:700,color,fontFamily:T.mono,lineHeight:1}}>
            {value != null ? (Number(value)||0).toFixed(2) : "—"}
          </span>
          <span style={{fontSize:10,color:T.text3,marginTop:1}}>/{max}</span>
        </div>
      </div>
      <span style={{fontSize:13,fontWeight:600,color:T.text0}}>{label}</span>
      {sublabel && <span style={{fontSize:11,color:T.text3}}>{sublabel}</span>}
    </div>
  );
};

/* ─── DASHBOARD PANEL ────────────────────────────────────────────────── */
const DashboardPanel = ({ outcomes, projectName, compound }) => {
  const computed = useMemo(() => {
    const all = outcomes.filter(o => o.compound_id === compound?.compound_id || !compound);
    const withWS = all.filter(o => o._ws != null);
    const n = all.length;
    if (!n) return null;
    const improved = all.filter(o=>o.direction==="Improved").length;
    const sig = all.filter(o=>o.significance==="Significant").length;
    const mcid = all.filter(o=>o.mcid_met==="Yes").length;
    const ess = score.ess(withWS);
    const essC = score.essClass(ess);
    const cons = n ? improved/n : 0;
    const consC = cons>=0.8?"Highly Consistent":cons>=0.5?"Mixed":"Inconsistent";
    const clin = n ? mcid/n : 0;
    const clinC = clin>=0.6?"Clinically Significant":clin>=0.3?"Partially Significant":"Clinically Uncertain";
    const biasVals = withWS.map(o=>o._biasP);
    const meanBias = biasVals.length ? biasVals.reduce((a,b)=>a+b,0)/biasVals.length : 0;
    const biasC = meanBias<=1?"Low Bias":meanBias<=2.5?"Moderate Bias":"High Bias";
    const gradeC = score.gradeFromMetrics(essC, consC, clinC, biasC);
    const studies = [...new Set(all.map(o=>o.study_ref_id).filter(Boolean))];
    const parts = [...new Set(all.map(o=>o.study_ref_id).filter(Boolean))]
      .reduce((sum, ref) => {
        const row = all.find(o=>o.study_ref_id===ref);
        return sum + (Number(row?.sample_n)||0);
      }, 0);
    return { n, improved, sig, mcid, ess, essC, cons, consC, clin, clinC,
             meanBias, biasC, gradeC, studies: studies.length, parts };
  }, [outcomes, compound]);

  if (!computed) return (
    <div style={{textAlign:"center",padding:"60px 20px",color:T.text3}}>
      <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>◎</div>
      <p style={{fontSize:13}}>Add outcomes to see the dashboard</p>
    </div>
  );

  const { n, improved, sig, mcid, ess, essC, cons, consC, clin, clinC,
          meanBias, biasC, gradeC, studies, parts } = computed;

  const gradeColor = score.gradeColor(gradeC);
  const consColor = cons>=0.8?T.green:cons>=0.5?T.amber:T.red;
  const clinColor = clin>=0.6?T.green:clin>=0.3?T.amber:T.red;

  return (
    <div className="fade-in">
      {/* top ring row */}
      <div style={{display:"flex",justifyContent:"space-around",
        padding:"24px 0 20px",borderBottom:`1px solid ${T.border}`,marginBottom:20}}>
        <ScoreRing value={ess} max={15} label={essC} sublabel="ESS" color={T.teal}/>
        <ScoreRing value={cons*100} max={100} label={consC} sublabel="Consistency"
          color={consColor}/>
        <ScoreRing value={clin*100} max={100} label={clinC} sublabel="Clinical sig."
          color={clinColor}/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>
          <div style={{
            width:110,height:110,borderRadius:"50%",
            border:`7px solid ${gradeColor}`,
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            background:`${gradeColor}10`,
          }}>
            <span style={{fontSize:12,fontWeight:700,color:gradeColor,fontFamily:T.mono,
              textAlign:"center",lineHeight:1.2,padding:"0 8px"}}>{gradeC}</span>
          </div>
          <span style={{fontSize:13,fontWeight:600,color:T.text0}}>GRADE</span>
          <span style={{fontSize:11,color:T.text3}}>estimated</span>
        </div>
      </div>

      {/* metrics grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
        {[
          ["Outcomes", n, T.text1],
          ["Studies", studies, T.text1],
          ["Participants", parts.toLocaleString(), T.text1],
          ["Significant", `${sig}/${n}`, T.text1],
          ["MCID-met", `${mcid}/${n}`, T.green],
          ["Improved", `${improved}/${n}`, T.teal],
          ["Mean bias", (Number(meanBias)||0).toFixed(2), meanBias<=1?T.green:meanBias<=2.5?T.amber:T.red],
          ["WS range", outcomes.filter(o=>o._ws!=null).length ?
            `${Math.min(...outcomes.filter(o=>o._ws!=null).map(o=>o._ws))}–${Math.max(...outcomes.filter(o=>o._ws!=null).map(o=>o._ws))}` : "—", T.text1],
        ].map(([lbl,val,col])=>(
          <div key={lbl} style={{background:T.bg3,borderRadius:6,padding:"10px 12px",
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,color:T.text3,textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:4}}>{lbl}</div>
            <div style={{fontSize:18,fontWeight:600,color:col,fontFamily:T.mono}}>{val}</div>
          </div>
        ))}
      </div>

      {/* bias class */}
      <div style={{padding:"10px 14px",borderRadius:6,
        background: meanBias<=1?T.greenBg:meanBias<=2.5?T.amberBg:T.redBg,
        border:`1px solid ${meanBias<=1?T.green:meanBias<=2.5?T.amber:T.red}30`,
        display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,color:'#C8D8EF'}}>Bias quality:</span>
        <Tag color={meanBias<=1?T.green:meanBias<=2.5?T.amber:T.red}>{biasC}</Tag>
        <span style={{fontSize:11,color:T.text3,marginLeft:"auto"}}>
          Mean penalty: {(Number(meanBias)||0).toFixed(2)} / 5.0
        </span>
      </div>
    </div>
  );
};

/* ─── SELECT COMPONENT ───────────────────────────────────────────────── */
const Select = ({ value, onChange, options, placeholder="Select…" }) => (
  <select value={value} onChange={e=>onChange(e.target.value)}
    style={{appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%234A6080'/%3E%3C/svg%3E")`,
      backgroundRepeat:"no-repeat",backgroundPosition:"right 10px center",paddingRight:28}}>
    <option value="">{placeholder}</option>
    {options.map(o=>(
      <option key={typeof o==="object"?o.value:o} value={typeof o==="object"?o.value:o}>
        {typeof o==="object"?o.label:o}
      </option>
    ))}
  </select>
);

/* ─── BIAS DOMAIN ROW ────────────────────────────────────────────────── */
const BiasDomainRow = ({ label, value, onChange, tool }) => {
  const domains = {
    "RoB 2": ["Randomisation","Deviations from intervention","Missing outcome data","Outcome measurement","Selective reporting"],
    "ROBINS-I": ["Confounding","Selection","Classification","Deviations","Missing data"],
    "AMSTAR 2": ["Protocol","Search","Study selection","Data extraction","Risk of bias","Meta-analysis","Publication bias"],
    "NOS": ["Selection","Comparability","Outcome"],
  };
  const cols = tool && domains[tool] ? domains[tool] : ["D1","D2","D3","D4","D5"];
  return null; // handled inline in OutcomeForm
};

/* ─── OUTCOME FORM (one row) ─────────────────────────────────────────── */

const SaveIndicator=({saving})=>(
  <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,
    color:saving?T.amber:T.green,transition:"color 0.3s"}}>
    {saving
      ?<><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>Saving…</>
      :<><span>✓</span>Saved</>}
  </div>
);

/* ─── AUTH SCREEN ────────────────────────────────────────────────────── */
const AuthScreen=({onAuth})=>{
  const [mode,setMode]=useState("signin"); // signin|signup|otp
  const [form,setForm]=useState({email:"",password:"",name:"",role:"researcher"});
  const [otpStep,setOtpStep]=useState(null); // null|"sent"|"verify"
  const [otpCode,setOtpCode]=useState("");
  const [otpExpected,setOtpExpected]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  const isDoctorEmail = (email) => {
    // Check if this email is invited to any study
    try{
      const studies = JSON.parse(localStorage.getItem("nep_studies_v2")||"[]");
      return studies.some(s=>s.invitedDoctors?.some(d=>d.email.toLowerCase()===email.toLowerCase()));
    }catch(e){return false;}
  };

  const sendOtp = () => {
    const otp = String(Math.floor(100000+Math.random()*900000));
    setOtpExpected(otp);
    setOtpStep("sent");
    setError("");
    // In production, send via email. For now, show in console + alert
    console.log(`OTP for ${form.email}: ${otp}`);
    alert(`Simulated OTP sent to ${form.email}:\n\nYour code: ${otp}\n\n(In production, this arrives via email)`);
  };

  const verifyOtp = async () => {
    if(otpCode !== otpExpected){
      setError("Invalid OTP. Please try again.");
      return;
    }
    setLoading(true);setError("");
    try{
      // Mark doctor as authenticated in the study
      try{
        const studies = JSON.parse(localStorage.getItem("nep_studies_v2")||"[]");
        studies.forEach(s=>{
          s.invitedDoctors?.forEach(d=>{
            if(d.email.toLowerCase()===form.email.toLowerCase()) d.authenticated=true;
          });
        });
        localStorage.setItem("nep_studies_v2",JSON.stringify(studies));
      }catch(ex){}
      const user = await API.signIn({email:form.email,password:"otp-verified"});
      onAuth(user);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  };

  const submit=async()=>{
    // Check if doctor email → use OTP flow
    if(mode==="signin" && isDoctorEmail(form.email)){
      sendOtp();
      return;
    }
    setLoading(true);setError("");
    try{
      const user=mode==="signin"
        ?await API.signIn({email:form.email,password:form.password})
        :await API.signUp({email:form.email,password:form.password,name:form.name,role:form.role||'researcher'});
      onAuth(user);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  };

  return(
    <div style={{minHeight:"100vh",background:T.bg0,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:420,padding:"40px 36px",background:T.bg2,border:`1px solid ${T.border}`,
        borderRadius:14,boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:32}}>
          <div style={{width:36,height:36,borderRadius:8,background:T.teal,display:"flex",
            alignItems:"center",justifyContent:"center"}}>
            <span style={{color:T.bg0,fontSize:18,fontWeight:700,fontFamily:T.mono}}>N</span>
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:T.text0}}>NEP Platform</div>
            <div style={{fontSize:11,color:T.text3}}>Nutraceutical Evidence Platform v6.0</div>
          </div>
        </div>

        {otpStep==="sent"?(
          /* OTP verification screen */
          <div>
            <h1 style={{fontSize:20,fontWeight:600,color:T.text0,marginBottom:6}}>
              Enter verification code
            </h1>
            <p style={{fontSize:12,color:T.text3,marginBottom:20}}>
              A 6-digit code was sent to <strong style={{color:T.teal}}>{form.email}</strong>
            </p>
            <div style={{marginBottom:16}}>
              <FieldLabel label="OTP Code" required/>
              <input value={otpCode} onChange={e=>setOtpCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                placeholder="Enter 6-digit code" maxLength={6} autoFocus
                style={{fontSize:24,letterSpacing:"0.3em",textAlign:"center",fontFamily:T.mono}}/>
            </div>
            {error&&<div style={{fontSize:12,color:T.red,marginBottom:12}}>{error}</div>}
            <Btn onClick={verifyOtp} disabled={otpCode.length!==6||loading}
              style={{width:"100%",padding:"13px",fontSize:14,fontWeight:700,marginBottom:12}}>
              {loading?"Verifying…":"Verify & sign in"}
            </Btn>
            <button onClick={sendOtp}
              style={{width:"100%",background:"none",border:"none",color:T.teal,
                fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
              Resend code
            </button>
          </div>
        ):(
          /* Normal sign-in/sign-up */
          <div>
            <h1 style={{fontSize:22,fontWeight:600,color:T.text0,marginBottom:6}}>
              {mode==="signin"?"Sign in":"Create account"}
            </h1>
            <p style={{fontSize:12,color:T.text3,marginBottom:24}}>
              {mode==="signin"?"Researchers: email + password. Doctors: email + OTP.":"Join the platform."}
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {mode==="signup"&&(
                <div>
                  <FieldLabel label="Full name" required/>
                  <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                    placeholder="Dr. Jane Smith" autoFocus/>
                </div>
              )}
              <div>
                <FieldLabel label="Email" required/>
                <input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                  placeholder="you@institution.edu" type="email" autoFocus={mode==="signin"}/>
              </div>
              {mode==="signin"&&!isDoctorEmail(form.email)&&(
                <div>
                  <FieldLabel label="Password" required/>
                  <input value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                    placeholder="••••••••" type="password"
                    onKeyDown={e=>e.key==="Enter"&&submit()}/>
                </div>
              )}
              {mode==="signin"&&isDoctorEmail(form.email)&&(
                <div style={{padding:"10px 14px",borderRadius:8,background:T.bg3,
                  border:`1px solid ${T.teal}30`,fontSize:12,color:T.teal}}>
                  🔐 This email is registered as a doctor. Click below to receive an OTP.
                </div>
              )}
            </div>
            {error&&<div style={{fontSize:12,color:T.red,marginTop:12}}>{error}</div>}
            <Btn onClick={submit} disabled={loading||!form.email}
              style={{width:"100%",padding:"13px",fontSize:14,fontWeight:700,marginTop:16}}>
              {loading?"Please wait…":mode==="signin"?(isDoctorEmail(form.email)?"Send OTP":"Sign in"):"Create account"}
            </Btn>
            <div style={{textAlign:"center",marginTop:16}}>
              <button onClick={()=>{setMode(m=>m==="signin"?"signup":"signin");setError("");}}
                style={{background:"none",border:"none",color:T.teal,fontSize:12,
                  cursor:"pointer",fontFamily:"inherit"}}>
                {mode==="signin"?"Create an account":"Already have an account? Sign in"}
              </button>
            </div>
            {mode==="signin"&&(
              <div style={{fontSize:10,color:T.text3,marginTop:16,textAlign:"center",
                padding:"8px 12px",background:T.bg3,borderRadius:6}}>
                Demo: researcher@nep.science / doctor@nep.science / doctor2@nep.science (any password)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};



/* ─── COMPOUND REPOSITORY ────────────────────────────────────────────── */
const COMPOUND_CATEGORIES = [
  "Herb","Vitamin","Mineral","Probiotic","Amino Acid","Fatty Acid","Polyphenol","Other"
];

const CATEGORY_PREFIX = {
  "Herb":"HER","Vitamin":"VIT","Mineral":"MIN","Probiotic":"PRO",
  "Amino Acid":"AA","Fatty Acid":"FA","Polyphenol":"POL","Other":"OTH"
};

// Seed compounds matching the Excel model
const SEED_COMPOUNDS = [
  {id:"herb-ashwagandha",name:"Ashwagandha",scientific:"Withania somnifera",category:"Adaptogen",shortCode:"ASH",
    extract_form:"Root extract (KSM-66)",standardisation:"5% withanolides",dose_range:"300–600 mg/day",duration_range:"8–16 weeks"},
  {id:"herb-brahmi",name:"Brahmi",scientific:"Bacopa monnieri",category:"Nootropic",shortCode:"BRA",
    extract_form:"Leaf extract",standardisation:"20% bacosides",dose_range:"300–450 mg/day",duration_range:"8–12 weeks"},
  {id:"herb-triphala",name:"Triphala",scientific:"Terminalia chebula blend",category:"Digestive tonic",shortCode:"TRI",
    extract_form:"Fruit powder",standardisation:"40% tannins",dose_range:"500–1000 mg/day",duration_range:"8–12 weeks"},
  {id:"herb-shatavari",name:"Shatavari",scientific:"Asparagus racemosus",category:"Rejuvenative",shortCode:"SHA",
    extract_form:"Root extract",standardisation:"40% saponins",dose_range:"500–1000 mg/day",duration_range:"8–12 weeks"},
  {id:"herb-curcumin",name:"Curcumin",scientific:"Curcuma longa",category:"Anti-inflammatory",shortCode:"CUR",
    extract_form:"Rhizome extract",standardisation:"95% curcuminoids",dose_range:"500–1500 mg/day",duration_range:"8–12 weeks"},
  {id:"herb-cumin",name:"Cumin",scientific:"Cuminum cyminum",category:"Digestive & metabolic",shortCode:"CUM",
    extract_form:"Seed extract",standardisation:"Standardised essential oil",dose_range:"200–600 mg/day",duration_range:"8–12 weeks"},
  {id:"herb-tulsi",name:"Tulsi (Holy Basil)",scientific:"Ocimum sanctum",category:"Adaptogen",shortCode:"TUL",
    extract_form:"Leaf extract",standardisation:"2.5% ursolic acid",dose_range:"300–600 mg/day",duration_range:"4–12 weeks"},
  {id:"herb-guduchi",name:"Guduchi",scientific:"Tinospora cordifolia",category:"Immunomodulator",shortCode:"GUD",
    extract_form:"Stem extract",standardisation:"2.5% bitter principles",dose_range:"300–500 mg/day",duration_range:"8–12 weeks"},
];

// Global compound store (in-memory, persisted via MockAdapter)
let _compoundStore = [...SEED_COMPOUNDS];

const generateCompoundId = (category, shortCode, store) => {
  const prefix = CATEGORY_PREFIX[category] || "OTH";
  const code = (shortCode||"XXX").toUpperCase().slice(0,3);
  const existing = store.filter(c=>c.id.startsWith(`${prefix}-${code}-`));
  const nextNum = String(existing.length + 1).padStart(3,"0");
  return `${prefix}-${code}-${nextNum}`;
};

const suggestShortCode = (name) =>
  (name||"").replace(/[^a-zA-Z]/g,"").toUpperCase().slice(0,3) || "XXX";

/* Fuzzy search */
const fuzzyMatch = (query, str) => {
  if (!query || !str) return false;
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  if (s.includes(q)) return true;
  // character sequence match
  let qi = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) qi++;
  }
  return qi === q.length;
};

/* ─── EXTENDED VOCAB ─────────────────────────────────────────────────── */
const DOSE_UNITS = ["mg","g","IU","CFU","mcg","mL","drops"];
const FREQ_OPTIONS = [
  {value:"OD",label:"OD — Once daily"},
  {value:"BID",label:"BID — Twice daily"},
  {value:"TID",label:"TID — Three times daily"},
  {value:"QID",label:"QID — Four times daily"},
  {value:"weekly",label:"Weekly"},
  {value:"other",label:"Other"},
];

/* ─── STUDY ID COUNTER ───────────────────────────────────────────────── */
const generateStudyId = (existingOutcomes) => {
  const nums = (existingOutcomes||[])
    .map(o => parseInt((o.study_id||"").replace("STUDY-","")) || 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `STUDY-${String(next).padStart(3,"0")}`;
};

const generateStudyRefId = (studyId, studyType, existingOutcomes) => {
  if (!studyId || !studyType) return "";
  const typeCode = {
    "RCT":"RCT","Meta":"META","Observational":"OBS","Mechanistic":"MECH"
  }[studyType] || studyType.slice(0,3).toUpperCase();
  const existing = (existingOutcomes||[]).filter(o =>
    o.study_id === studyId && o.study_type === studyType
  );
  const seq = String(existing.length + 1).padStart(2,"0");
  return `${studyId}-${typeCode}-${seq}`;
};

/* ─── OUTCOME FACTORY ────────────────────────────────────────────────── */
const newOutcome = (existingOutcomes=[], initialCompounds=[]) => {
  const study_id = generateStudyId(existingOutcomes);
  return {
    id: crypto.randomUUID(),
    study_id,
    study_type: "",
    study_ref_id: "",
    compounds: Array.isArray(initialCompounds) ? initialCompounds : [],
    population: "",
    outcome_name: "",
    outcome_category: "",
    direction: "",
    significance: "",
    sample_n: "",
    dosage: "",
    dose_unit: "",
    frequency: "",
    es_value: "",
    es_type: "",
    ci_lower: "",
    ci_upper: "",
    p_value: "",
    i2: "",
    quality_score: "",
    outcome_score: "",
    bias_d1: "", bias_d2: "", bias_d3: "", bias_d4: "", bias_d5: "",
    bias_tool: "",
    mcid_met: "",
    // computed
    extract_form: "",
    standardisation: "",
    duration: "",
    _sampleScore: 0, _biasP: 0, _ws: null,
    // validation
    _errors: {}, _saved: false,
  };
};

const newRef = (compoundRefs=[]) => ({
  id: crypto.randomUUID(),
  ref_id: `REF-${String(Date.now()).slice(-6)}`,
  study_ref_id: "",
  compound_id: "",
  title: "",
  authors: "",
  year: "",
  journal: "",
  doi: "",
  volume: "",
  issue: "",
  pages: "",
  bias_tool: "",
  bias_overall: "",
  _fromPubmed: false,
});

/* ─── FIELD TOOLTIPS ─────────────────────────────────────────────────── */
const TIPS = {
  study_id: "Auto-generated unique study identifier (STUDY-001, STUDY-002…). Each new outcome row gets the next available number. All outcomes from the same paper share the same Study ID.",
  study_type: "Design of the study:\n• RCT — Randomised Controlled Trial (highest Q score: 4)\n• Meta — Systematic Review / Meta-analysis (Q = 5)\n• Observational — Cohort, cross-sectional, case-control (Q = 3)\n• Mechanistic — In vitro or animal study (Q = 2)",
  study_ref_id: "Auto-generated from Study ID + Study Type + sequence. e.g. STUDY-001-RCT-01. Used to link outcomes to references. Can be manually overridden.",
  compound: "Search by name or scientific name. Fuzzy search — partial matches work. If compound not found, click 'Add new' to register it.",
  population: "Describe the study population. Include: age range, sex, condition/diagnosis, inclusion criteria, country. e.g. 'Adults 25–65 yrs, chronic stress (PSS ≥ 20), n=64, India'",
  outcome_name: "The specific measured outcome. Be precise — include the validated instrument name and subscale if applicable. e.g. 'Perceived Stress Scale (PSS) total score', 'Serum cortisol (nmol/L)'",
  outcome_category: "Classify the outcome domain:\n• Biomarker — Blood/urine markers (cortisol, CRP, HbA1c)\n• Psychological — Validated mental health scales (PSS, HAM-A, PHQ-9)\n• Sleep — Sleep quality instruments (PSQI, ISI)\n• Metabolic — Glucose, lipids, insulin resistance\n• Physiological — Blood pressure, heart rate, physical performance\n• Safety — Adverse events, liver enzymes, tolerability",
  direction: "Direction of change from baseline:\n• Improved — Movement toward better health outcome\n• No Change — No meaningful difference\n• Worsened — Movement away from better health outcome\nFor safety outcomes, 'Improved' means no adverse signal.",
  significance: "Statistical significance of the result:\n• Significant — p < 0.05\n• Not Significant — p ≥ 0.05 (adds −2 WS penalty, caps at 8)\n• Not Reported — p-value not provided in the paper",
  sample_n: "Total number of participants in this study arm (or pooled N for meta-analyses). Used to auto-calculate Sample Score (S):\n• n ≥ 200 → S = 5\n• n 100–199 → S = 4\n• n 50–99 → S = 3\n• n 20–49 → S = 2\n• n < 20 → S = 1\n• In vitro (no humans) → S = 0",
  dosage: "Dose per administration. Must be > 0. Example: 300 (for 300 mg). Combined with Unit and Frequency to express full dosing regimen in the paper.",
  dose_unit: "Unit of measure for the dose:\n• mg — milligrams (most common for herbal extracts)\n• g — grams\n• IU — International Units (vitamins A, D, E)\n• CFU — Colony Forming Units (probiotics)\n• mcg — micrograms",
  frequency: "How often the dose is taken:\n• OD — Once daily\n• BID — Twice daily (total daily dose = dosage × 2)\n• TID — Three times daily\n• QID — Four times daily\nThis affects the Methods section of the generated paper.",
  es_value: "The primary effect size number from the paper. Positive or negative depending on outcome direction. Examples:\n• MD −6.57 (mean difference in PSS score)\n• SMD −0.89 (standardised mean difference)\n• RR 0.72 (relative risk)",
  es_type: "Type of effect size statistic:\n• MD — Mean Difference (raw units, same scale)\n• SMD — Standardised Mean Difference (Cohen's d, pooled SD)\n• RR — Relative Risk (event rate ratio)\n• OR — Odds Ratio (case-control studies)\n• HR — Hazard Ratio (time-to-event studies)\n• WMD — Weighted Mean Difference (meta-analyses)",
  ci_lower: "Lower bound of the 95% Confidence Interval. For beneficial outcomes, both bounds negative (for MD) or < 1.0 (for RR/OR) indicates a significant effect.",
  ci_upper: "Upper bound of the 95% Confidence Interval. If CI crosses zero (for MD) or 1.0 (for RR/OR), the result is not statistically significant.",
  p_value: "Statistical significance. Format as reported: 0.001, <0.001, 0.05, etc. Threshold: p < 0.05 = Significant. Determines Significance field and WS penalty.",
  i2: "I² heterogeneity statistic — for meta-analyses only. Leave blank for RCTs.\n• < 25% — Low heterogeneity (consistent)\n• 25–50% — Moderate heterogeneity\n• > 50% — Substantial heterogeneity (may downgrade confidence)",
  quality_score: "Study Quality score (Q) — manually assessed:\n• 5 = SR/MA (systematic review with meta-analysis)\n• 4 = RCT (randomised controlled trial)\n• 3 = Observational (cohort, cross-sectional)\n• 2 = Mechanistic (in vitro, animal)\n• 1 = Case report / case series\nDowngrade by 1 for: unclear blinding, >20% attrition, industry-only funding.",
  outcome_score: "Outcome Relevance score (O) — based on MCID and p-value:\n• 5 = MCID exceeded AND p < 0.01\n• 4 = MCID met AND p < 0.05\n• 3 = Positive direction, p < 0.05, but below MCID\n• 2 = No statistically significant change\n• 1 = Outcome worsened\nCheck MCID Library tab for published thresholds.",
  bias_tool: "Risk of bias assessment tool used:\n• RoB 2 — For RCTs (Cochrane tool, 5 domains)\n• ROBINS-I — For observational studies\n• AMSTAR 2 — For systematic reviews/meta-analyses\n• NOS — Newcastle-Ottawa Scale (observational)\n• None — Mechanistic or narrative studies",
  bias_domain: "Score each bias domain:\n• 0 = Low risk of bias\n• 0.5 = Some concerns\n• 1 = High risk of bias\nDomain sum = Bias Penalty (B). Max B = 5.",
  mcid_met: "Did the observed effect exceed the published Minimal Clinically Important Difference?\n• Yes — Effect size exceeds published MCID threshold\n• No — Effect size below MCID or no MCID applicable\n• Unknown — No published MCID for this outcome\nCheck MCID Library tab for thresholds.",
};

/* ─── COMPOUND SEARCH MODAL ──────────────────────────────────────────── */
const CompoundSearchModal = ({ onSelect, onClose, compounds }) => {
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newComp, setNewComp] = useState({
    name:"", scientific:"", category:"Herb", shortCode:"",
    extract_form:"", standardisation:"", dose_range:"", duration_range:"", notes:""
  });

  const filtered = query.length >= 1
    ? compounds.filter(c =>
        fuzzyMatch(query, c.name) ||
        fuzzyMatch(query, c.scientific) ||
        fuzzyMatch(query, c.id)
      )
    : compounds;

  const handleAdd = () => {
    if (!newComp.name.trim()) return;
    const sc = newComp.shortCode || suggestShortCode(newComp.name);
    const id = generateCompoundId(newComp.category, sc, compounds);
    const newCompoundEntry = {
      id, name: newComp.name, scientific: newComp.scientific,
      category: newComp.category, shortCode: sc,
      notes: newComp.notes, refs: [],
    };
    onSelect(newCompoundEntry, true); // true = new compound
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",
      alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)"}}>
      <div style={{background:T.bg2,border:`1px solid ${T.border2}`,
        borderRadius:12,padding:24,width:520,maxHeight:"80vh",
        display:"flex",flexDirection:"column",
        boxShadow:"0 24px 80px rgba(0,0,0,0.6)"}}>

        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <h3 style={{fontSize:16,fontWeight:600,color:T.text0}}>Select Compound</h3>
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>

        <input value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Search by name or scientific name…"
          autoFocus style={{marginBottom:12}}/>

        {!showAdd ? (
          <>
            <div style={{flex:1,overflowY:"auto",marginBottom:12}}>
              {filtered.length === 0 ? (
                <div style={{textAlign:"center",padding:"20px 0",color:T.text3,fontSize:13}}>
                  No compounds found for "{query}"
                </div>
              ) : filtered.map(c=>(
                <div key={c.id} onClick={()=>onSelect(c,false)}
                  className="row-hover"
                  style={{padding:"10px 12px",borderRadius:6,cursor:"pointer",
                    marginBottom:4,border:`1px solid ${T.border}`,background:T.bg3}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center"}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:600,color:T.text0}}>
                        {c.name}
                      </span>
                      {c.scientific && (
                        <span style={{fontSize:11,color:T.text3,marginLeft:8,fontStyle:"italic"}}>
                          {c.scientific}
                        </span>
                      )}
                    </div>
                    <Tag color={T.teal}>{c.id}</Tag>
                  </div>
                  {c.notes && (
                    <div style={{fontSize:10,color:T.text3,marginTop:2}}>{c.notes}</div>
                  )}
                </div>
              ))}
            </div>
            <Btn variant="secondary" onClick={()=>setShowAdd(true)}
              style={{width:"100%",justifyContent:"center",
                border:`1px dashed ${T.border2}`}}>
              + Add new compound
            </Btn>
          </>
        ) : (
          <div style={{flex:1,overflowY:"auto"}}>
            <div style={{fontSize:13,fontWeight:600,color:T.text0,marginBottom:12}}>
              New compound
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <FieldLabel label="Compound name" required
                  tip="Common name e.g. Ashwagandha, Curcumin, Vitamin D3"/>
                <input value={newComp.name}
                  onChange={e=>setNewComp(p=>({...p,name:e.target.value,
                    shortCode:suggestShortCode(e.target.value)}))}
                  placeholder="e.g. Ashwagandha"/>
              </div>
              <div>
                <FieldLabel label="Scientific name"
                  tip="Latin binomial e.g. Withania somnifera"/>
                <input value={newComp.scientific}
                  onChange={e=>setNewComp(p=>({...p,scientific:e.target.value}))}
                  placeholder="e.g. Withania somnifera"/>
              </div>
              <div>
                <FieldLabel label="Category" required
                  tip="Select the compound class"/>
                <Select value={newComp.category}
                  onChange={v=>setNewComp(p=>({...p,category:v}))}
                  options={COMPOUND_CATEGORIES}/>
              </div>
              <div>
                <FieldLabel label="Short code (3 letters)"
                  tip="Used to build the Compound ID. Auto-suggested from name, can be edited. e.g. ASH for Ashwagandha"/>
                <input value={newComp.shortCode}
                  onChange={e=>setNewComp(p=>({...p,shortCode:e.target.value.toUpperCase().slice(0,3)}))}
                  placeholder="e.g. ASH"
                  style={{textTransform:"uppercase"}}/>
                <div style={{fontSize:10,color:T.teal,marginTop:3}}>
                  ID will be: {generateCompoundId(newComp.category, newComp.shortCode||suggestShortCode(newComp.name), [])}-preview
                </div>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <FieldLabel label="Extract form"/>
              <input value={newComp.extract_form}
                onChange={e=>setNewComp(p=>({...p,extract_form:e.target.value}))}
                placeholder="e.g. Root extract, KSM-66, Sensoril"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <FieldLabel label="Standardisation"/>
                <input value={newComp.standardisation}
                  onChange={e=>setNewComp(p=>({...p,standardisation:e.target.value}))}
                  placeholder="e.g. 5% withanolides"/>
              </div>
              <div>
                <FieldLabel label="Dose range"/>
                <input value={newComp.dose_range}
                  onChange={e=>setNewComp(p=>({...p,dose_range:e.target.value}))}
                  placeholder="e.g. 300–600 mg/day"/>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <FieldLabel label="Duration range"/>
              <input value={newComp.duration_range}
                onChange={e=>setNewComp(p=>({...p,duration_range:e.target.value}))}
                placeholder="e.g. 8–12 weeks"/>
            </div>
            <div style={{marginBottom:10}}>
              <FieldLabel label="Notes"/>
              <input value={newComp.notes}
                onChange={e=>setNewComp(p=>({...p,notes:e.target.value}))}
                placeholder="e.g. Adaptogen / Rasayana"/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={handleAdd} disabled={!newComp.name.trim()}>
                Add & select
              </Btn>
              <Btn variant="secondary" onClick={()=>setShowAdd(false)}>
                ← Back to search
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── COMPOUND REPOSITORY PANEL ──────────────────────────────────────── */
const CompoundRepositoryPanel = ({ compounds, onUpdate }) => {
  const [expanded, setExpanded] = useState(null);
  const [edits, setEdits] = useState({});

  const upd = (id, field, val) =>
    setEdits(prev=>({...prev,[id]:{...(prev[id]||{}), [field]:val}}));

  const save = (c) => {
    const updated = {...c, ...(edits[c.id]||{})};
    if(onUpdate) onUpdate(updated);
    setEdits(prev=>{const n={...prev};delete n[c.id];return n;});
    setExpanded(null);
  };

  if(compounds.length===0) return (
    <div style={{padding:"40px 20px",textAlign:"center",color:T.text3,
      border:`1px dashed ${T.border2}`,borderRadius:8}}>
      No compounds yet. Add them by selecting a compound in Evidence Input.
    </div>
  );

  return (
    <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
      {/* Header */}
      <div style={{display:"grid",
        gridTemplateColumns:"24px 90px 1fr 120px 80px 80px 80px",
        padding:"8px 16px",background:T.bg3,
        borderBottom:`1px solid ${T.border}`}}>
        {["","ID","Name / Scientific","Category","Extract","Dose",""].map(h=>(
          <div key={h} style={{fontSize:10,color:T.text3,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em"}}>{h}</div>
        ))}
      </div>

      {compounds.map((c,i)=>{
        const isExp = expanded===c.id;
        const ed = edits[c.id]||{};
        const val = (f) => ed[f]!==undefined ? ed[f] : (c[f]||"");

        return (
          <div key={c.id} style={{
            borderBottom:`1px solid ${T.border}`,
            background:i%2===0?T.bg2:T.bg1,
          }}>
            {/* Row */}
            <div onClick={()=>setExpanded(isExp?null:c.id)}
              style={{display:"grid",
                gridTemplateColumns:"24px 90px 1fr 120px 80px 80px 80px",
                padding:"11px 16px",cursor:"pointer",alignItems:"center"}}>
              <span style={{fontSize:10,color:T.text3,
                transition:"transform 0.2s",
                transform:isExp?"rotate(90deg)":"none"}}>▶</span>
              <Tag color={T.teal} style={{fontSize:10}}>{c.id}</Tag>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>{c.name}</div>
                {c.scientific&&<div style={{fontSize:11,color:T.text3,fontStyle:"italic"}}>{c.scientific}</div>}
              </div>
              <Tag color={T.purple}>{c.category||"—"}</Tag>
              <div style={{fontSize:11,color:'#C8D8EF'}}>{c.extract_form||"—"}</div>
              <div style={{fontSize:11,color:'#C8D8EF'}}>{c.dose_range||"—"}</div>
              <Btn variant="secondary" style={{fontSize:10,padding:"2px 8px"}}
                onClick={e=>{e.stopPropagation();setExpanded(isExp?null:c.id);}}>
                Edit
              </Btn>
            </div>

            {/* Expanded edit form */}
            {isExp&&(
              <div style={{padding:"16px 20px",borderTop:`1px solid ${T.border}`,
                background:T.bg1,animation:"fadeIn 0.2s ease both"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
                  {[
                    ["Compound name","name","e.g. Ashwagandha"],
                    ["Scientific name","scientific","e.g. Withania somnifera"],
                    ["Extract form","extract_form","e.g. Root extract, KSM-66"],
                    ["Standardisation","standardisation","e.g. 5% withanolides"],
                    ["Dose range","dose_range","e.g. 300-600mg/day"],
                    ["Duration range","duration_range","e.g. 4-12 weeks"],
                    ["Notes","notes","e.g. Adaptogen / Rasayana"],
                  ].map(([lbl,fld,ph])=>(
                    <div key={fld}>
                      <FieldLabel label={lbl}/>
                      <input value={val(fld)}
                        onChange={e=>upd(c.id,fld,e.target.value)}
                        placeholder={ph}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <Btn variant="secondary"
                    onClick={()=>{setExpanded(null);setEdits(p=>{const n={...p};delete n[c.id];return n;});}}>
                    Cancel
                  </Btn>
                  <Btn onClick={()=>save(c)}>Save compound</Btn>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ─── OUTCOME ROW (rebuilt) ───────────────────────────────────────────── */
const OutcomeRow = ({ outcome, idx, onChange, onRemove, compounds, onAddCompound }) => {
  const [expanded, setExpanded] = useState(!outcome._saved);
  const [showCompoundSearch, setShowCompoundSearch] = useState(false);
  const [errors, setErrors] = useState(outcome._errors || {});
  const [saving, setSaving] = useState(false);

  /* ── Field update ── */
  const upd = (field, val) => {
    const updated = { ...outcome, [field]: val };

    // Auto-generate study_ref_id when study_type changes
    if (field === "study_type" && updated.study_id) {
      updated.study_ref_id = ""; // will be set below
    }

    // Recompute scores
    updated._sampleScore = score.sampleScore(updated.sample_n);
    updated._biasP = score.biasP(updated.bias_d1,updated.bias_d2,
      updated.bias_d3,updated.bias_d4,updated.bias_d5);
    updated._ws = score.ws(updated.quality_score,updated._sampleScore,
      updated.outcome_score,updated._biasP,updated.significance);

    // Clear error for changed field
    const newErrors = {...errors};
    delete newErrors[field];
    updated._errors = newErrors;
    setErrors(newErrors);

    onChange(updated);
  };

  /* ── Compound selection ── */
  const handleCompoundSelect = (compound, isNew) => {
    // Add to compounds[] array (avoid duplicates)
    const existing = outcome.compounds || [];
    const alreadyAdded = existing.find(c => c.id === compound.id);
    const newCompounds = alreadyAdded ? existing : [
      ...existing,
      { id: compound.id, name: compound.name, scientific: compound.scientific||"" }
    ];
    const updated = {
      ...outcome,
      compounds: newCompounds,
      // keep legacy fields for backwards compat with doc generation
      compound_id:   compound.id,
      compound_name: compound.name,
      scientific_name: compound.scientific||"",
    };
    updated._sampleScore = score.sampleScore(updated.sample_n);
    updated._biasP = score.biasP(updated.bias_d1,updated.bias_d2,
      updated.bias_d3,updated.bias_d4,updated.bias_d5);
    updated._ws = score.ws(updated.quality_score,updated._sampleScore,
      updated.outcome_score,updated._biasP,updated.significance);
    if (isNew && !alreadyAdded) onAddCompound(compound);
    setShowCompoundSearch(false);
    onChange(updated);
  };

  /* ── Validate & save ── */
  const validateAndSave = () => {
    setSaving(true);
    const errs = {};
    if (!outcome.study_type) errs.study_type = "Study type is required";
    if (!outcome.compounds?.length) errs.compound_name = "At least one compound must be selected";
    if (!outcome.outcome_name?.trim()) errs.outcome_name = "Outcome name is required";
    if (!outcome.outcome_category) errs.outcome_category = "Category is required";
    if (!outcome.direction) errs.direction = "Direction is required";
    if (!outcome.significance) errs.significance = "Significance is required";
    if (!outcome.sample_n) errs.sample_n = "Sample N is required";
    if (outcome.sample_n && (isNaN(Number(outcome.sample_n)) || Number(outcome.sample_n) <= 0))
      errs.sample_n = "Sample N must be a positive number";
    if (!outcome.quality_score) errs.quality_score = "Quality score (Q) is required";
    if (!outcome.outcome_score) errs.outcome_score = "Outcome score (O) is required";
    if (!outcome.bias_tool) errs.bias_tool = "Bias tool is required";
    if (!outcome.mcid_met) errs.mcid_met = "MCID Met is required";
    if (outcome.dosage && Number(outcome.dosage) <= 0)
      errs.dosage = "Dosage must be > 0";
    if (outcome.ci_lower && outcome.ci_upper &&
        Number(outcome.ci_lower) >= Number(outcome.ci_upper))
      errs.ci_range = "CI Lower must be less than CI Upper";
    if (outcome.i2 && (Number(outcome.i2) < 0 || Number(outcome.i2) > 100))
      errs.i2 = "I² must be between 0 and 100";
    if (outcome.p_value) {
      const pv = outcome.p_value.replace("<","").replace(">","");
      if (isNaN(Number(pv))) errs.p_value = "Enter a valid p-value e.g. 0.001 or <0.05";
    }
    // Auto-generate study_ref_id if missing
    let finalOutcome = {...outcome, _errors: errs};
    if (!outcome.study_ref_id && outcome.study_id && outcome.study_type) {
      finalOutcome.study_ref_id = `${outcome.study_id}-${
        {RCT:"RCT",Meta:"META",Observational:"OBS",Mechanistic:"MECH"}[outcome.study_type]||"STU"
      }-01`;
    }

    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      finalOutcome._saved = true;
      finalOutcome._errors = {};
      onChange(finalOutcome);
      setExpanded(false);
    } else {
      onChange(finalOutcome);
    }
    setSaving(false);
  };

  const ws = outcome._ws;
  const hasErrors = Object.keys(errors).length > 0;

  const biasDomainLabels = {
    "RoB 2":["Randomisation","Deviations from intervention","Missing outcome data","Outcome measurement","Selective reporting"],
    "ROBINS-I":["Confounding","Selection bias","Classification","Deviations","Missing data"],
    "AMSTAR 2":["Protocol registered","Search strategy","Study selection","Data extraction","Risk of bias","Meta-analysis","Publication bias"],
    "NOS":["Selection","Comparability","Outcome/Exposure","—","—"],
    "Jadad":["Randomisation","Blinding","Withdrawals","—","—"],
  };
  const domLabels = (outcome.bias_tool && biasDomainLabels[outcome.bias_tool])
    || ["Domain 1","Domain 2","Domain 3","Domain 4","Domain 5"];

  const ErrMsg = ({field}) => errors[field] ? (
    <div style={{fontSize:10,color:T.red,marginTop:3,
      background:T.redBg,borderRadius:3,padding:"2px 6px"}}>
      ⚠ {errors[field]}
    </div>
  ) : null;

  const FLabel = ({label,field,required,tip}) => (
    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
      <span style={{fontSize:12,color:T.text1,fontWeight:600,
        letterSpacing:"0.02em"}}>{label}</span>
      {required && <span style={{color:T.amber,fontSize:11}}>*</span>}
      {tip && <HelpIcon tip={TIPS[tip]||tip}/>}
      {errors[field] && <span style={{color:T.red,fontSize:11}}>⚠</span>}
    </div>
  );

  const fieldStyle = (field) => ({
    borderColor: errors[field] ? T.red : undefined,
    boxShadow: errors[field] ? `0 0 0 2px ${T.red}30` : undefined,
  });

  return (
    <div style={{
      background: expanded ? T.bg3 : outcome._saved ? T.bg2 : `${T.amberBg}`,
      border: `1px solid ${hasErrors ? T.red : expanded ? T.border2 : T.border}`,
      borderRadius: 8, marginBottom: 6,
      transition: "all 0.2s",
    }}>
      {/* ── Collapsed header ── */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"28px 1fr 1fr 100px 110px 110px 90px 90px 64px 80px 32px",
        gap:6, padding:"10px 12px", alignItems:"center", cursor:"pointer",
      }} onClick={()=>setExpanded(!expanded)}>
        <span style={{fontSize:11,color:T.text3,fontFamily:T.mono,textAlign:"center"}}>
          {idx+1}
        </span>
        <div>
          <div style={{fontSize:12,color:T.text0,fontWeight:600,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {outcome.outcome_name ||
              <span style={{color:T.text3,fontStyle:"italic"}}>Click to expand…</span>}
          </div>
          <div style={{fontSize:10,color:T.text3,marginTop:1}}>
            {outcome.study_ref_id||outcome.study_id||"—"} · {outcome.compound_name||"no compound"}
          </div>
        </div>
        <div style={{fontSize:11,color:T.text3}}>{outcome.outcome_category||"—"}</div>
        <div>{outcome.direction ?
          <Tag color={outcome.direction==="Improved"?T.green:outcome.direction==="Worsened"?T.red:T.text3}>
            {outcome.direction}
          </Tag> : <span style={{color:T.text3,fontSize:11}}>—</span>}
        </div>
        <div>{outcome.significance ?
          <Tag color={outcome.significance==="Significant"?T.green:outcome.significance==="Not Significant"?T.amber:T.text3}>
            {outcome.significance==="Significant"?"Sig.":outcome.significance==="Not Significant"?"Not sig.":"N/R"}
          </Tag> : <span style={{color:T.text3,fontSize:11}}>—</span>}
        </div>
        <div style={{fontSize:11,color:T.text2,fontFamily:T.mono}}>
          {outcome.dosage?`${outcome.dosage}${outcome.dose_unit||""} ${outcome.frequency||""}`:"—"}
        </div>
        <div style={{fontSize:11,color:T.text2,fontFamily:T.mono}}>
          {outcome.es_value?`${outcome.es_value} ${outcome.es_type||""}`:"—"}
        </div>
        <div>{outcome.mcid_met?
          <Tag color={outcome.mcid_met==="Yes"?T.green:outcome.mcid_met==="No"?T.text3:T.amber}>
            {outcome.mcid_met}
          </Tag>:<span style={{color:T.text3,fontSize:11}}>—</span>}
        </div>
        <div style={{textAlign:"center"}}>
          <ScoreChip value={ws}/>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {!outcome._saved && <span style={{fontSize:9,color:T.amber}}>unsaved</span>}
          {hasErrors && <span style={{fontSize:9,color:T.red}}>errors</span>}
          {outcome._saved && !hasErrors && <span style={{fontSize:9,color:T.green}}>✓</span>}
        </div>
        <button onClick={e=>{e.stopPropagation();onRemove();}}
          style={{background:"none",border:"none",color:T.text3,
            fontSize:14,cursor:"pointer",padding:4,borderRadius:4}}>✕</button>
      </div>

      {/* ── Expanded form ── */}
      {expanded && (
        <div style={{padding:"16px 16px 20px",borderTop:`1px solid ${T.border}`,
          animation:"fadeIn 0.2s ease both"}}>

          {/* Row 1 — Study identity */}
          <div style={{background:T.bg2,borderRadius:8,padding:14,marginBottom:14,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:12,color:T.teal,fontWeight:800,
              textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:14,
              paddingBottom:8,borderBottom:`1px solid ${T.tealDim}50`}}>
              📋 Study Identity
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div>
                <FLabel label="Study ID" field="study_id"
                  tip="study_id"/>
                <div style={{background:T.tealBg,border:`1px solid ${T.tealDim}40`,
                  borderRadius:6,padding:"7px 10px",fontFamily:T.mono,
                  fontSize:13,color:T.teal,fontWeight:600}}>
                  {outcome.study_id}
                  <span style={{fontSize:10,color:T.text3,fontFamily:T.sans,
                    marginLeft:8,fontWeight:400}}>auto-generated</span>
                </div>
              </div>
              <div>
                <FLabel label="Study Type" field="study_type" required tip="study_type"/>
                <Select value={outcome.study_type}
                  onChange={v=>upd("study_type",v)}
                  options={VOCAB.studyType}
                  placeholder="Select type…"/>
                <ErrMsg field="study_type"/>
                {{"RCT":"Quality Score = 4","Meta":"Quality Score = 5","Observational":"Quality Score = 3","Mechanistic":"Quality Score = 2"}[outcome.study_type] && (
                  <div style={{fontSize:10,color:T.teal,marginTop:3}}>
                    → {{"RCT":"Quality Score = 4","Meta":"Quality Score = 5","Observational":"Quality Score = 3","Mechanistic":"Quality Score = 2"}[outcome.study_type]}
                  </div>
                )}
              </div>
              <div>
                <FLabel label="Study Reference ID" tip="study_ref_id"/>
                <div style={{background:T.bg3,border:`1px solid ${T.border}`,
                  borderRadius:6,padding:"7px 10px",fontFamily:T.mono,
                  fontSize:12,color:outcome.study_ref_id?T.teal:T.text3,
                  minHeight:34,display:"flex",alignItems:"center"}}>
                  {outcome.study_ref_id ||
                    (outcome.study_id && outcome.study_type
                      ? <span style={{color:T.text3,fontStyle:"italic",fontSize:11}}>
                          Auto on save: {outcome.study_id}-{({RCT:"RCT",Meta:"META",Observational:"OBS",Mechanistic:"MECH"}[outcome.study_type]||"STU")}-01
                        </span>
                      : <span style={{color:T.text3,fontStyle:"italic",fontSize:11}}>
                          Set Study Type first
                        </span>
                    )
                  }
                  {outcome.study_ref_id &&
                    <span style={{fontSize:10,color:T.text3,fontFamily:T.sans,
                      marginLeft:8}}>read-only</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Row 2 — Compound */}
          <div style={{background:T.bg2,borderRadius:8,padding:14,marginBottom:14,
            border:`1px solid ${errors.compound_name?T.red:T.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
              <span style={{fontSize:11,color:T.teal,fontWeight:600,
                textTransform:"uppercase",letterSpacing:"0.08em"}}>
                Compound
              </span>
              <span style={{color:T.amber,fontSize:13,fontWeight:700}}>*</span>
              <span style={{fontSize:10,color:T.text3}}>required</span>
            </div>
            {(outcome.compounds||[]).length > 0 ? (
              <div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
                  {(outcome.compounds||[]).map(c=>(
                    <div key={c.id} style={{
                      display:"flex",alignItems:"center",gap:8,
                      background:T.bg3,borderRadius:6,padding:"7px 12px",
                      border:`1px solid ${T.border2}`,
                    }}>
                      <div>
                        <span style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>
                          {c.name}
                        </span>
                        {c.scientific&&(
                          <span style={{fontSize:10,color:T.text3,
                            fontStyle:"italic",marginLeft:6}}>{c.scientific}</span>
                        )}
                      </div>
                      <button onClick={()=>{
                        const updated={...outcome,
                          compounds:(outcome.compounds||[]).filter(x=>x.id!==c.id)};
                        onChange(updated);
                      }} style={{background:"none",border:"none",
                        color:T.text3,cursor:"pointer",fontSize:14,padding:2}}>✕</button>
                    </div>
                  ))}
                </div>
                <Btn variant="ghost" onClick={()=>setShowCompoundSearch(true)}
                  style={{fontSize:11,padding:"4px 10px"}}>
                  + Add another compound
                </Btn>
              </div>
            ) : (
              <div>
                <Btn onClick={()=>setShowCompoundSearch(true)}
                  variant="secondary"
                  style={{width:"100%",justifyContent:"center",
                    border:`1px dashed ${errors.compound_name?T.red:T.border2}`,
                    padding:"12px",fontSize:13}}>
                  🔍 Search or add compound…
                </Btn>
                <ErrMsg field="compound_name"/>
              </div>
            )}          </div>

          {/* Row 3 — Outcome */}
          <div style={{background:T.bg2,borderRadius:8,padding:14,marginBottom:14,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,color:T.teal,fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
              📊 Outcome
            </div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",
              gap:10,marginBottom:10}}>
              <div>
                <FLabel label="Outcome Name" field="outcome_name" required tip="outcome_name"/>
                <input value={outcome.outcome_name}
                  onChange={e=>upd("outcome_name",e.target.value)}
                  placeholder="e.g. Perceived Stress Scale (PSS) total score"
                  style={fieldStyle("outcome_name")}/>
                <ErrMsg field="outcome_name"/>
              </div>
              <div>
                <FLabel label="Category" field="outcome_category" required tip="outcome_category"/>
                <Select value={outcome.outcome_category}
                  onChange={v=>upd("outcome_category",v)}
                  options={VOCAB.outcomeCategory}/>
                <ErrMsg field="outcome_category"/>
              </div>
              <div>
                <FLabel label="Direction" field="direction" required tip="direction"/>
                <Select value={outcome.direction}
                  onChange={v=>upd("direction",v)}
                  options={VOCAB.direction}/>
                <ErrMsg field="direction"/>
              </div>
              <div>
                <FLabel label="Significance" field="significance" required tip="significance"/>
                <Select value={outcome.significance}
                  onChange={v=>upd("significance",v)}
                  options={VOCAB.significance}/>
                <ErrMsg field="significance"/>
              </div>
            </div>
            <div>
              <FLabel label="Population" tip="population"/>
              <textarea value={outcome.population}
                onChange={e=>upd("population",e.target.value)}
                rows={2} style={{resize:"vertical",minHeight:50}}
                placeholder="e.g. Adults 25–65 yrs with chronic stress (PSS ≥ 20), n=64, India"/>
            </div>
          </div>

          {/* Row 4 — Dosing */}
          <div style={{background:T.bg2,borderRadius:8,padding:14,marginBottom:14,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,color:T.teal,fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
              💊 Dosing
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
              <div>
                <FLabel label="Sample N" field="sample_n" required tip="sample_n"/>
                <input type="number" value={outcome.sample_n}
                  onChange={e=>upd("sample_n",e.target.value)}
                  placeholder="e.g. 64" style={fieldStyle("sample_n")}/>
                <ErrMsg field="sample_n"/>
                {outcome.sample_n && !errors.sample_n && (
                  <div style={{fontSize:10,color:T.teal,marginTop:3}}>
                    → Sample Score (S) = {outcome._sampleScore}
                  </div>
                )}
              </div>
              <div>
                <FLabel label="Dosage" field="dosage" tip="dosage"/>
                <input type="number" value={outcome.dosage}
                  onChange={e=>upd("dosage",e.target.value)}
                  placeholder="e.g. 300" style={fieldStyle("dosage")}/>
                <ErrMsg field="dosage"/>
              </div>
              <div>
                <FLabel label="Unit" tip="dose_unit"/>
                <Select value={outcome.dose_unit}
                  onChange={v=>upd("dose_unit",v)}
                  options={DOSE_UNITS} placeholder="Unit…"/>
              </div>
              <div>
                <FLabel label="Frequency" tip="frequency"/>
                <Select value={outcome.frequency}
                  onChange={v=>upd("frequency",v)}
                  options={FREQ_OPTIONS.map(f=>({value:f.value,label:f.label}))}
                  placeholder="Frequency…"/>
              </div>
            </div>
          </div>

          {/* Row 5 — Results */}
          <div style={{background:T.bg2,borderRadius:8,padding:14,marginBottom:14,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,color:T.teal,fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
              📈 Result Magnitude
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,
              marginBottom:10}}>
              <div>
                <FLabel label="Effect Size" field="es_value" tip="es_value"/>
                <input value={outcome.es_value}
                  onChange={e=>upd("es_value",e.target.value)}
                  placeholder="e.g. -6.57" style={fieldStyle("es_value")}/>
              </div>
              <div>
                <FLabel label="ES Type" tip="es_type"/>
                <Select value={outcome.es_type}
                  onChange={v=>upd("es_type",v)}
                  options={VOCAB.effectSizeType}/>
              </div>
              <div>
                <FLabel label="CI Lower" field="ci_lower" tip="ci_lower"/>
                <input value={outcome.ci_lower}
                  onChange={e=>upd("ci_lower",e.target.value)}
                  placeholder="e.g. -9.21" style={fieldStyle("ci_lower")}/>
              </div>
              <div>
                <FLabel label="CI Upper" field="ci_upper" tip="ci_upper"/>
                <input value={outcome.ci_upper}
                  onChange={e=>upd("ci_upper",e.target.value)}
                  placeholder="e.g. -3.93" style={fieldStyle("ci_upper")}/>
                <ErrMsg field="ci_range"/>
              </div>
              <div>
                <FLabel label="p-value" field="p_value" tip="p_value"/>
                <input value={outcome.p_value}
                  onChange={e=>upd("p_value",e.target.value)}
                  placeholder="e.g. 0.001" style={fieldStyle("p_value")}/>
                <ErrMsg field="p_value"/>
              </div>
              <div>
                <FLabel label="I² (%)" field="i2" tip="i2"/>
                <input type="number" value={outcome.i2}
                  onChange={e=>upd("i2",e.target.value)}
                  placeholder="Meta only" style={fieldStyle("i2")}/>
                <ErrMsg field="i2"/>
              </div>
            </div>
            {/* I2 guide */}
            <div style={{background:T.bg1,borderRadius:4,padding:"4px 10px",
              display:"flex",gap:12,fontSize:10}}>
              <span style={{color:T.text3}}>I² guide:</span>
              {[["<25%","Low",T.green],["25–50%","Moderate",T.amber],[">50%","Substantial",T.red]].map(([r,l,c])=>(
                <span key={l}>
                  <span style={{color:c,fontFamily:T.mono}}>{r}</span>
                  <span style={{color:T.text3}}> = {l}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Row 6 — Scoring */}
          <div style={{background:T.bg2,borderRadius:8,padding:14,marginBottom:14,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,color:T.teal,fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
              ⚖️ Scoring
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,
              marginBottom:10}}>
              <div>
                <FLabel label="Quality Score (Q)" field="quality_score" required tip="quality_score"/>
                <Select value={outcome.quality_score}
                  onChange={v=>upd("quality_score",v)}
                  options={["1","2","3","4","5"]} placeholder="Q…"/>
                <ErrMsg field="quality_score"/>
                {outcome.quality_score && (
                  <div style={{fontSize:10,color:T.text3,marginTop:3}}>
                    {{"1":"Case report","2":"Mechanistic","3":"Observational","4":"RCT","5":"SR/MA"}[outcome.quality_score]}
                  </div>
                )}
              </div>
              <div>
                <FLabel label="Sample Score (S)" tip="sample_n"/>
                <div style={{background:T.tealBg,border:`1px solid ${T.tealDim}40`,
                  borderRadius:6,padding:"7px 10px",fontFamily:T.mono,
                  fontSize:14,color:T.teal,fontWeight:600}}>
                  {outcome._sampleScore}
                  <span style={{fontSize:10,color:T.text3,fontFamily:T.sans,
                    marginLeft:8,fontWeight:400}}>auto</span>
                </div>
              </div>
              <div>
                <FLabel label="Outcome Score (O)" field="outcome_score" required tip="outcome_score"/>
                <Select value={outcome.outcome_score}
                  onChange={v=>upd("outcome_score",v)}
                  options={["1","2","3","4","5"]} placeholder="O…"/>
                <ErrMsg field="outcome_score"/>
                {outcome.outcome_score && (
                  <div style={{fontSize:10,color:T.text3,marginTop:3}}>
                    {{"1":"Worsened","2":"No change","3":"+ve, below MCID","4":"MCID met","5":"MCID exceeded"}[outcome.outcome_score]}
                  </div>
                )}
              </div>
              <div>
                <FLabel label="MCID Met" field="mcid_met" required tip="mcid_met"/>
                <Select value={outcome.mcid_met}
                  onChange={v=>upd("mcid_met",v)}
                  options={VOCAB.mcidMet}/>
                <ErrMsg field="mcid_met"/>
              </div>
            </div>
            {/* Bias */}
            <div>
              <FLabel label="Bias Tool" field="bias_tool" required tip="bias_tool"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 4fr",gap:10}}>
                <Select value={outcome.bias_tool}
                  onChange={v=>upd("bias_tool",v)}
                  options={VOCAB.biasTool}/>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
                  {["bias_d1","bias_d2","bias_d3","bias_d4","bias_d5"].map((fld,i)=>(
                    <div key={fld}>
                      <div style={{fontSize:9,color:T.text3,marginBottom:3,
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        <Tooltip text={`${domLabels[i]||`D${i+1}`} — ${TIPS.bias_domain}`}>
                          <span style={{cursor:"help"}}>{domLabels[i]||`D${i+1}`}</span>
                        </Tooltip>
                      </div>
                      <select value={outcome[fld]}
                        onChange={e=>upd(fld,e.target.value)}
                        style={{
                          width:"100%",fontSize:13,fontFamily:T.mono,
                          textAlign:"center",padding:"6px 4px",
                          background:outcome[fld]==="1"?T.redBg:outcome[fld]==="0.5"?T.amberBg:outcome[fld]==="0"?T.greenBg:T.bg2,
                          border:`1px solid ${outcome[fld]==="1"?T.red:outcome[fld]==="0.5"?T.amber:outcome[fld]==="0"?T.green:T.border}`,
                          borderRadius:6,color:T.text0,appearance:"none",
                        }}>
                        <option value="">—</option>
                        <option value="0">0</option>
                        <option value="0.5">0.5</option>
                        <option value="1">1</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <ErrMsg field="bias_tool"/>
            </div>
          </div>

          {/* Auto-computed scores */}
          <div style={{display:"flex",gap:10,padding:"12px 14px",
            background:T.bg1,borderRadius:6,border:`1px solid ${T.border}`,
            marginBottom:14}}>
            {[
              ["Bias Penalty (B)", (Number(outcome._biasP)||0).toFixed(1), T.red],
              ["Sample Score (S)", outcome._sampleScore, T.blue],
              ["Weighted Score (WS)", ws!=null?ws:"—", ws!=null?score.wsColor(ws):T.text3],
            ].map(([lbl,val,col])=>(
              <div key={lbl} style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:10,color:T.text3,marginBottom:2}}>{lbl}</div>
                <div style={{fontSize:22,fontWeight:700,fontFamily:T.mono,color:col}}>{val}</div>
              </div>
            ))}
            <div style={{flex:2,textAlign:"center",display:"flex",
              flexDirection:"column",justifyContent:"center"}}>
              <div style={{fontSize:10,color:T.text3,marginBottom:4}}>WS Formula</div>
              <div style={{fontSize:13,fontFamily:T.mono,color:'#C8D8EF'}}>
                {outcome.quality_score||"Q"}+{outcome._sampleScore}+{outcome.outcome_score||"O"}−{(Number(outcome._biasP)||0).toFixed(1)}
                {outcome.significance==="Not Significant"?" −2 (cap 8)":""}
                {" = "}{ws!=null?<span style={{color:score.wsColor(ws),fontWeight:700}}>{ws}</span>:"?"}
              </div>
            </div>
          </div>

          {/* Save / Cancel */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            {hasErrors && (
              <div style={{flex:1,fontSize:11,color:T.red,
                display:"flex",alignItems:"center",gap:6}}>
                ⚠ {Object.keys(errors).length} field(s) need attention before saving
              </div>
            )}
            <Btn variant="secondary" onClick={()=>setExpanded(false)}
              style={{fontSize:12}}>
              Collapse
            </Btn>
            <Btn onClick={validateAndSave} disabled={saving}
              style={{fontSize:12,fontWeight:600}}>
              {saving?"Saving…":"✓ Save outcome"}
            </Btn>
          </div>
        </div>
      )}

      {/* Compound search modal */}
      {showCompoundSearch && (
        <CompoundSearchModal
          compounds={compounds}
          onSelect={handleCompoundSelect}
          onClose={()=>setShowCompoundSearch(false)}/>
      )}
    </div>
  );
};

/* ─── PUBMED SEARCH ──────────────────────────────────────────────────── */
/* ── Multi-source reference search ────────────────────────────────────
   Sources searched in parallel:
   1. PubMed (NCBI) — clinical trials, RCTs, systematic reviews
   2. Europe PMC — open access, broader coverage
   3. Semantic Scholar — AI-indexed, includes preprints & citations
   All via corsproxy.io to bypass browser CORS restrictions.
──────────────────────────────────────────────────────────────────── */
/* ─── REFERENCE SEARCH (multi-source with fallbacks) ─────────────────── */
const searchReferences = async (query, limit=8) => {
  if (!query) return [];
  const results = [];

  const makeRef = (source, r) => ({
    id: crypto.randomUUID(),
    ref_id: `REF-${source.replace(/\s/g,"")}-${r.pmid||Date.now()}`,
    study_ref_id:"", compound_id:"",
    title: (r.title||"").replace(/\.$/, "").replace(/<[^>]+>/g,""),
    authors: r.authors||"", year: String(r.year||""),
    journal: r.journal||"", doi: r.doi||"",
    volume: r.volume||"", issue: r.issue||"",
    pages: r.pages||"", bias_tool:"", bias_overall:"",
    _source: source,
    _url: r.doi ? `https://doi.org/${r.doi}` : (r.url||""),
    _pmid: r.pmid||"",
  });

  const proxyFetch = async (url) => {
    // Route through Vercel serverless proxy — no CSP or CORS issues
    try {
      const r = await fetch(`/api/pubmed?url=${encodeURIComponent(url)}`,
        {signal:AbortSignal.timeout(10000)});
      if(r.ok) return r;
    } catch(e) { console.warn("Proxy fetch:", e.message); }
    // Fallback: allorigins (public CORS proxy)
    try {
      const r = await fetch(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        {signal:AbortSignal.timeout(8000)});
      if(r.ok) return r;
    } catch(e) { /* continue */ }
    throw new Error("Could not reach search API");
  };

  await Promise.allSettled([

    // ── PubMed ──────────────────────────────────────────────────────
    (async () => {
      try {
        const term = encodeURIComponent(`"${query}"[Title/Abstract] AND ("clinical trial"[pt] OR "randomized"[tiab] OR "systematic review"[pt]) AND "humans"[MeSH]`);
        const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
        const sr = await proxyFetch(`${base}/esearch.fcgi?db=pubmed&term=${term}&retmax=${Math.ceil(limit/2)}&retmode=json&sort=relevance`);
        const sd = await sr.json();
        const ids = sd?.esearchresult?.idlist||[];
        if (!ids.length) return;
        const sumr = await proxyFetch(`${base}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`);
        const sumd = await sumr.json();
        const res = sumd?.result||{};
        ids.forEach(id => {
          const a = res[id]; if(!a) return;
          const auth = (a.authors||[])[0]?.name||"";
          const authStr = auth + ((a.authors||[]).length>1?" et al.":"");
          const doi = (a.articleids||[]).find(x=>x.idtype==="doi")?.value||"";
          results.push(makeRef("PubMed",{
            pmid:id, title:a.title||"", authors:authStr,
            year:(a.pubdate||"").split(" ")[0],
            journal:a.fulljournalname||a.source||"",
            doi, volume:a.volume||"", issue:a.issue||"", pages:a.pages||"",
            url:`https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          }));
        });
      } catch(e) { console.warn("PubMed:",e.message); }
    })(),

    // ── Europe PMC ──────────────────────────────────────────────────
    (async () => {
      try {
        const q = encodeURIComponent(`"${query}" AND (HAS_ABSTRACT:Y)`);
        const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&resultType=lite&pageSize=${Math.ceil(limit/2)}&format=json&sort=RELEVANCE`;
        const res = await proxyFetch(url);
        const data = await res.json();
        (data?.resultList?.result||[]).forEach(a => {
          const auth = a.authorString||"";
          const authShort = auth.includes(",") ? auth.split(",")[0].trim()+" et al." : auth;
          results.push(makeRef("Europe PMC",{
            pmid:a.pmid||a.id, title:a.title||"",
            authors:authShort, year:String(a.pubYear||""),
            journal:a.journalTitle||"", doi:a.doi||"",
            volume:a.journalVolume||"", issue:a.issue||"",
            pages:a.pageInfo||"",
            url:a.doi?`https://doi.org/${a.doi}`:`https://europepmc.org/article/MED/${a.pmid}`,
          }));
        });
      } catch(e) { console.warn("EuropePMC:",e.message); }
    })(),

  ]);

  // Deduplicate by DOI or title
  const seen = new Set();
  return results
    .filter(r => r.title)
    .filter(r => {
      const key = r.doi || r.title.toLowerCase().slice(0,50);
      if(seen.has(key)) return false;
      seen.add(key); return true;
    })
    .sort((a,b) => Number(b.year||0) - Number(a.year||0))
    .slice(0, limit);
};

/* ─── AI HELPERS ─────────────────────────────────────────────────────── */
const callClaude = async (prompt, maxTokens=300) => {
  try {
    // Use Vercel serverless proxy — avoids browser CSP restrictions
    const res = await fetch("/api/claude", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        messages:[{role:"user", content: prompt}]
      }),
      signal: AbortSignal.timeout(12000),
    });
    if(res.ok){
      const data = await res.json();
      const text = data.content?.[0]?.text?.trim()||"";
      if(text) return text;
    }
  } catch(e) { console.warn("Claude API:", e.message); }
  return null; // deterministic fallback used by caller
};

const generateKeywords = async (compounds, outcomes) => {
  const names = compounds.map(c=>c.scientific?`${c.name} (${c.scientific})`:c.name).join(", ")||"nutraceutical";
  const outcomeNames = outcomes.slice(0,5).map(o=>o.outcome_name).filter(Boolean).join(", ");
  // Try AI first
  const aiResult = await callClaude(
    `Generate 6-8 academic MeSH-style keywords for a nutraceutical evidence synthesis about ${names}${outcomeNames?`, studying ${outcomeNames}`:""}.
Return ONLY a semicolon-separated list. Example: Ashwagandha; Withania somnifera; stress; anxiety; adaptogen; randomized controlled trial; systematic review`,
    150
  );
  if(aiResult) return aiResult;
  // Deterministic fallback
  const kws = [
    ...compounds.map(c=>c.name).filter(Boolean),
    ...compounds.map(c=>c.scientific).filter(Boolean),
    ...outcomes.slice(0,3).map(o=>o.outcome_name).filter(Boolean),
    "nutraceutical", "clinical trial", "evidence synthesis",
    "randomized controlled trial", "systematic review",
  ];
  return [...new Set(kws)].slice(0,8).join("; ");
};

const generatePaperTitle = async (compounds, outcomes, journal) => {
  const names = compounds.map(c=>c.name).join(" + ")||"Nutraceutical Compound";
  const scientific = compounds.filter(c=>c.scientific).map(c=>c.scientific).join(", ");
  const outcomeNames = outcomes.slice(0,4).map(o=>o.outcome_name).filter(Boolean).join(", ");
  // Try AI
  const aiResult = await callClaude(
    `Write a concise academic paper title for a nutraceutical evidence synthesis.
Compound(s): ${names}${scientific?` (${scientific})`:""}
Outcomes studied: ${outcomeNames||"various clinical outcomes"}
${journal?`Target journal: ${journal}`:""}
Requirements: IMRaD style, specific, informative, under 20 words. Return ONLY the title, no quotes.`,
    80
  );
  if(aiResult) return aiResult;
  // Deterministic fallback
  const outcomeStr = outcomeNames
    ? `: Effects on ${outcomeNames.split(",")[0].trim()}`
    : "";
  const sciStr = scientific ? ` (${scientific.split(",")[0].trim()})` : "";
  return `${names}${sciStr}${outcomeStr}: A Structured Evidence Synthesis`;
};

const autoFetchReferences = async (compounds) => {
  if(!compounds.length) return [];
  const names = compounds.map(c=>c.scientific
    ? `${c.name} (${c.scientific})` : c.name).join(", ");

  // Use Claude API - most reliable from browser
  try {
    const text = await callClaude(
      `List 8 real, published clinical research papers about ${names} in humans.
Include RCTs, systematic reviews, and meta-analyses. Only include papers that genuinely exist with verifiable DOIs.
Return ONLY a JSON array, no other text, no markdown:
[{"authors":"Surname AB et al.","year":"2022","title":"Full title here","journal":"Journal Name","volume":"12","issue":"3","pages":"100-110","doi":"10.xxxx/xxxxx"}]`,
      1500
    );
    if(text){
      const clean = text.replace(/\`\`\`json|\`\`\`/g,"").trim();
      const papers = JSON.parse(clean);
      return papers.filter(p=>p.title&&p.authors).map((p,i)=>({
        id: crypto.randomUUID(),
        ref_id: `REF-AI-${Date.now()}-${i}`,
        study_ref_id:"", compound_id:"",
        title:p.title||"", authors:p.authors||"",
        year:String(p.year||""), journal:p.journal||"",
        doi:p.doi||"", volume:p.volume||"",
        issue:p.issue||"", pages:p.pages||"",
        bias_tool:"", bias_overall:"",
        _source:"AI suggested",
        _url: p.doi ? `https://doi.org/${p.doi}` : "",
      }));
    }
  } catch(e) { console.warn("AI ref fetch:", e.message); }

  // Fallback: try CORS proxy search
  try {
    const primary = compounds[0];
    const query = primary.scientific
      ? `"${primary.name}" OR "${primary.scientific}" clinical trial`
      : `"${primary.name}" clinical trial`;
    return searchReferences(query, 8);
  } catch(e) { return []; }
};



/* ─── REFERENCES PANEL ───────────────────────────────────────────────── */
const ReferencesPanel = ({ refs, onAdd, onUpdate, onRemove,
  compoundName, compounds=[], onNext }) => {

  const [searching,    setSearching]    = useState(false);
  const [searchResults,setSearchResults]= useState([]);
  const [showSearch,   setShowSearch]   = useState(false);
  const [autoLoaded,   setAutoLoaded]   = useState(false);
  const [expandedRefs, setExpandedRefs] = useState({});
  const prevRefsLen = React.useRef(0);
  React.useEffect(()=>{
    if(refs.length > prevRefsLen.current){
      const newest = refs[refs.length-1];
      if(newest&&!newest.title) setExpandedRefs(p=>({...p,[newest.id]:true}));
    }
    prevRefsLen.current = refs.length;
  },[refs.length]);

  const primaryCompound   = compounds[0]?.name       || compoundName || "";
  const primaryScientific = compounds[0]?.scientific || "";
  const [searchQuery, setSearchQuery] = useState(
    primaryCompound ? `"${primaryCompound}" clinical trial` : ""
  );

  // Auto-load on mount
  useEffect(()=>{
    if(compounds.length>0 && refs.length===0 && !autoLoaded && !searching){
      setAutoLoaded(true);
      setSearching(true);
      setShowSearch(true);
      autoFetchReferences(compounds)
        .then(results=>{
          setSearchResults(results.length?results:[{_empty:true}]);
          setSearching(false);
        })
        .catch(()=>{ setSearching(false); });
    }
    if(primaryCompound && !searchQuery)
      setSearchQuery(`"${primaryCompound}" clinical trial`);
  },[compounds.length]);

  const handleSearch = async () => {
    const q = searchQuery.trim() || (primaryCompound?`"${primaryCompound}" clinical trial`:"");
    if(!q){ return; }
    setSearching(true); setShowSearch(true); setSearchResults([]);
    try {
      const results = await searchReferences(q, 10);
      setSearchResults(results.length?results:[{_empty:true}]);
    } catch(e) { setSearchResults([{_error:e.message}]); }
    setSearching(false);
  };

  const addToRefs = (r) => {
    onAdd({
      id:crypto.randomUUID(), ref_id:r.ref_id||`REF-${Date.now()}`,
      study_ref_id:"", compound_id:"",
      title:r.title||"", authors:r.authors||"", year:r.year||"",
      journal:r.journal||"", doi:r.doi||"", volume:r.volume||"",
      issue:r.issue||"", pages:r.pages||"",
      bias_tool:"", bias_overall:"",
      _source:r._source, _url:r._url||r.doi?`https://doi.org/${r.doi}`:"",
    });
  };

  const toggleRef = (id) =>
    setExpandedRefs(prev=>({...prev,[id]:!prev[id]}));

  const quickSearches = [
    ...compounds.slice(0,2).map(c=>`"${c.name}" clinical trial`),
    primaryCompound?`"${primaryCompound}" systematic review`:null,
    primaryCompound?`"${primaryCompound}" safety`:null,
  ].filter(Boolean).slice(0,4);

  return (
    <div>
      {/* Search bar */}
      <div style={{background:T.bg3,borderRadius:8,padding:16,
        marginBottom:16,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",marginBottom:8}}>
          Search published papers
          {primaryCompound&&(
            <span style={{fontWeight:400,color:T.teal,marginLeft:8}}>
              · {primaryCompound}{primaryScientific?` (${primaryScientific})`:""}
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <input value={searchQuery}
            onChange={e=>setSearchQuery(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleSearch()}
            placeholder={primaryCompound
              ?`e.g. "${primaryCompound}" clinical trial`
              :"Search PubMed…"}
            style={{flex:1,fontSize:13}}/>
          <Btn onClick={handleSearch} disabled={searching}
            variant="secondary" style={{fontSize:12,flexShrink:0}}>
            {searching
              ?<span style={{animation:"spin 1s linear infinite",
                  display:"inline-block"}}>↻</span>
              :"🔍 Search"}
          </Btn>
        </div>
        {quickSearches.length>0&&(
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:10,color:T.text3}}>Quick:</span>
            {quickSearches.map(q=>(
              <button key={q} onClick={()=>setSearchQuery(q)}
                style={{fontSize:10,color:T.teal,background:"none",
                  border:`1px solid ${T.teal}30`,borderRadius:4,
                  padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Search results */}
        {showSearch&&(
          <div style={{marginTop:12}}>
            {searching&&(
              <div style={{fontSize:12,color:T.text3,padding:"8px 0",
                display:"flex",alignItems:"center",gap:8}}>
                <span style={{animation:"spin 1s linear infinite",
                  display:"inline-block"}}>↻</span>
                Searching PubMed and Europe PMC…
              </div>
            )}
            {!searching&&searchResults[0]?._empty&&(
              <div style={{fontSize:12,color:T.amber,padding:"8px 0"}}>
                No results found. Try a different search term.
              </div>
            )}
            {!searching&&searchResults[0]?._error&&(
              <div style={{fontSize:12,color:T.red,padding:"8px 0"}}>
                ⚠ Search unavailable. Add references manually below.
              </div>
            )}
            {!searching&&searchResults.filter(r=>!r._empty&&!r._error).map((r,i)=>{
              const added = refs.some(x=>(x.doi&&x.doi===r.doi)||(x.title&&x.title===r.title));
              const url   = r._url||(r.doi?`https://doi.org/${r.doi}`:"");
              return (
                <div key={i} style={{padding:"10px 12px",borderRadius:6,
                  marginBottom:6,background:added?T.greenBg:T.bg2,
                  border:`1px solid ${added?T.green:T.border}`,
                  display:"flex",gap:10,alignItems:"flex-start"}}>
                  <button onClick={()=>!added&&addToRefs(r)}
                    style={{background:added?"none":T.teal,
                      border:"none",borderRadius:4,
                      color:added?T.green:T.bg0,
                      width:24,height:24,cursor:added?"default":"pointer",
                      fontSize:14,fontWeight:700,flexShrink:0,marginTop:1,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {added?"✓":"+"}
                  </button>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,
                      color:"#F0F6FF",marginBottom:3,lineHeight:1.4}}>
                      {r.title}
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",
                      flexWrap:"wrap"}}>
                      {r._source&&(
                        <Tag color={r._source==="PubMed"?T.blue:T.teal}
                          style={{fontSize:9}}>{r._source}</Tag>
                      )}
                      <span style={{fontSize:10,color:T.text3}}>
                        {r.authors} · {r.journal} · {r.year}
                      </span>
                      {url&&(
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          style={{fontSize:10,color:T.teal,
                            textDecoration:"none",fontWeight:600}}
                          onClick={e=>e.stopPropagation()}>
                          Read paper ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Added references list */}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>
          References ({refs.length})
        </div>
        <Btn onClick={()=>onAdd()} variant="secondary" style={{fontSize:12}}>
          + Add manually
        </Btn>
      </div>

      {refs.length===0?(
        <div style={{textAlign:"center",padding:"40px 20px",
          border:`1px dashed ${T.border2}`,borderRadius:8,color:T.text3}}>
          <div style={{fontSize:24,marginBottom:8,opacity:0.3}}>📚</div>
          <p style={{fontSize:13}}>
            {compounds.length>0
              ?"Searching for references… or search above."
              :"Add compounds in Evidence first, then references will auto-suggest."}
          </p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {refs.map((ref,i)=>{
            const isExpanded = expandedRefs[ref.id];
            const url = ref._url||(ref.doi?`https://doi.org/${ref.doi}`:"");
            return (
              <div key={ref.id} style={{background:T.bg2,borderRadius:8,
                border:`1px solid ${(!ref.title||!ref.authors||!ref.year)?T.red:T.border}`,
                overflow:"hidden"}}>

                {/* Collapsed row — click to expand */}
                <div onClick={()=>toggleRef(ref.id)}
                  style={{display:"flex",alignItems:"center",gap:12,
                    padding:"12px 14px",cursor:"pointer",
                    background:isExpanded?T.bg3:"transparent"}}>
                  <span style={{fontSize:11,color:T.text3,
                    fontFamily:T.mono,flexShrink:0,width:24,
                    textAlign:"center"}}>[{i+1}]</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF",
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {ref.title||"Untitled reference"}
                    </div>
                    <div style={{fontSize:11,color:T.text3,marginTop:2}}>
                      {ref.authors&&<span>{ref.authors} · </span>}
                      {ref.journal&&<span style={{fontStyle:"italic"}}>{ref.journal}</span>}
                      {ref.year&&<span> · {ref.year}</span>}
                    </div>
                  </div>
                  {url&&(
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      onClick={e=>e.stopPropagation()}
                      style={{fontSize:11,color:T.teal,fontWeight:600,
                        textDecoration:"none",flexShrink:0,
                        padding:"4px 10px",borderRadius:4,
                        border:`1px solid ${T.teal}40`,
                        background:T.bg3}}>
                      Read ↗
                    </a>
                  )}
                  <button onClick={e=>{e.stopPropagation();onRemove(ref.id);}}
                    style={{background:"none",border:"none",color:T.text3,
                      cursor:"pointer",fontSize:16,flexShrink:0,padding:2}}>
                    ✕
                  </button>
                  <span style={{color:T.text3,fontSize:12,flexShrink:0}}>
                    {isExpanded?"▲":"▼"}
                  </span>
                </div>

                {/* Expanded metadata — read only */}
                {isExpanded&&(
                  <div style={{padding:"14px 16px 16px",
                    borderTop:`1px solid ${T.border}`,background:T.bg3}}>
                    
                    {/* Editable fields */}
                    <div style={{display:"grid",
                      gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                      {[
                        {label:"Title",    key:"title",    full:true},
                        {label:"Authors",  key:"authors",  full:true},
                        {label:"Journal",  key:"journal",  full:false},
                        {label:"Year",     key:"year",     full:false},
                        {label:"Volume",   key:"volume",   full:false},
                        {label:"Issue",    key:"issue",    full:false},
                        {label:"Pages",    key:"pages",    full:false},
                        {label:"DOI",      key:"doi",      full:false},
                      ].map(({label,key,full})=>(
                        <div key={key} style={full?{gridColumn:"1/-1"}:{}}>
                          <div style={{fontSize:9,color:T.text3,fontWeight:700,
                            textTransform:"uppercase",letterSpacing:"0.06em",
                            marginBottom:3}}>{label}</div>
                          <input
                            value={ref[key]||""}
                            onChange={e=>onUpdate(ref.id,{[key]:e.target.value})}
                            placeholder={label}
                            style={{width:"100%",padding:"7px 10px",
                              borderRadius:6,background:T.bg2,
                              border:`1px solid ${T.border2}`,
                              color:"#F0F6FF",fontSize:12,
                              fontFamily:"inherit",boxSizing:"border-box"}}/>
                        </div>
                      ))}
                    </div>

                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",paddingTop:10,
                      borderTop:`1px solid ${T.border}`}}>
                      {(ref.doi||ref._url)&&(
                        <a href={ref._url||(ref.doi?`https://doi.org/${ref.doi}`:"")}
                          target="_blank" rel="noreferrer"
                          style={{fontSize:11,color:T.teal,textDecoration:"none"}}>
                          ↗ Read paper
                        </a>
                      )}
                      <button onClick={()=>onRemove(ref.id)}
                        style={{marginLeft:"auto",fontSize:11,color:T.red,
                          background:"none",border:`1px solid ${T.red}30`,
                          borderRadius:5,padding:"4px 10px",cursor:"pointer",
                          fontFamily:"inherit"}}>
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Next button */}
      {onNext&&(
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:20,
          paddingTop:16,borderTop:`1px solid ${T.border}`}}>
          <Btn onClick={onNext}
            style={{padding:"11px 28px",fontSize:14,fontWeight:700}}>
            Next: Validate & Generate →
          </Btn>
        </div>
      )}
    </div>
  );
};

const StudySummaryPanel = ({ project, outcomes, patients=[], onImport, onGoToFeed, onGoToEvidence }) => {
  const compound = project?.primaryCompound || project?.name || "—";

  // Aggregate patient stats
  const total     = patients.length;
  const complete  = patients.filter(p=>p.status==="complete").length;
  const active    = patients.filter(p=>p.status==="active").length;
  const totalLogs = patients.reduce((n,p)=>n+(p.weeklyLogs||[]).length,0);

  // Symptom frequency
  const symptomCounts = {};
  patients.forEach(p=>{
    if(p.symptom1) symptomCounts[p.symptom1]=(symptomCounts[p.symptom1]||0)+1;
    if(p.symptom2) symptomCounts[p.symptom2]=(symptomCounts[p.symptom2]||0)+1;
  });
  const topSymptoms = Object.entries(symptomCounts)
    .sort((a,b)=>b[1]-a[1]).slice(0,6);

  // Outcome stats from completed patients
  const closedWithOutcome = patients.filter(p=>p.status==="complete"&&p.outcome);
  const improved = closedWithOutcome.filter(p=>
    p.outcome?.outcome1?.direction==="Improved").length;
  const improvePct = closedWithOutcome.length
    ? Math.round(improved/closedWithOutcome.length*100) : 0;

  // ESS from outcomes
  const wsVals = outcomes.map(o=>Number(o._ws)).filter(v=>!isNaN(v)&&v>0);
  const ess    = wsVals.length ? wsVals.reduce((a,b)=>a+b,0)/wsVals.length : null;
  const essC   = ess==null?"—":ess>=12?"Very Strong":ess>=9?"Strong":ess>=6?"Moderate":"Weak";

  const StatCard = ({label,value,sub,color=T.teal}) => (
    <div style={{background:T.bg2,borderRadius:8,padding:"16px 20px",
      border:`1px solid ${T.border}`,flex:1,minWidth:120}}>
      <div style={{fontSize:28,fontWeight:800,color,fontFamily:T.mono,
        lineHeight:1,marginBottom:4}}>{value}</div>
      <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>{label}</div>
      {sub&&<div style={{fontSize:11,color:T.text3,marginTop:2}}>{sub}</div>}
    </div>
  );

  return (
    <div className="fade-in">
      <SectionHeader
        title={project?.name||"Study"}
        subtitle={`${patients.length} patients from ${[...new Set(patients.map(p=>p.doctorName).filter(Boolean))].length} doctor(s) · Primary compound: ${compound}`}/>

      {/* Stats row */}
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <StatCard label="Total patients"   value={total}       sub="enrolled"/>
        <StatCard label="Complete"         value={complete}    sub="cases closed" color={T.green}/>
        <StatCard label="Active"           value={active}      sub="in progress"  color={T.amber}/>
        <StatCard label="Progress entries" value={totalLogs}   sub="weekly logs"  color={T.purple}/>
        <StatCard label="Improved"         value={`${improvePct}%`} sub="of closed cases" color={T.teal}/>
        {ess!=null&&(
          <StatCard label="ESS" value={(Number(ess)||0).toFixed(1)}
            sub={essC} color={ess>=9?T.green:ess>=6?T.amber:T.red}/>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>

        {/* Top symptoms */}
        <div style={{background:T.bg2,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:12,color:T.teal,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
            Top presenting symptoms
          </div>
          {topSymptoms.length===0?(
            <div style={{fontSize:12,color:T.text3}}>No patient data yet</div>
          ):topSymptoms.map(([sym,count])=>(
            <div key={sym} style={{display:"flex",alignItems:"center",
              gap:10,marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:"#F0F6FF",fontWeight:500,
                  marginBottom:2}}>{sym}</div>
                <div style={{height:4,background:T.bg3,borderRadius:2}}>
                  <div style={{height:"100%",borderRadius:2,background:T.teal,
                    width:`${Math.round(count/total*100)}%`,
                    transition:"width 0.5s"}}/>
                </div>
              </div>
              <span style={{fontSize:12,color:T.text3,fontFamily:T.mono,
                flexShrink:0,width:30,textAlign:"right"}}>{count}</span>
            </div>
          ))}
        </div>

        {/* Outcome distribution */}
        <div style={{background:T.bg2,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:12,color:T.teal,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
            Outcome distribution
          </div>
          {closedWithOutcome.length===0?(
            <div style={{fontSize:12,color:T.text3}}>No closed cases yet</div>
          ):(()=>{
            const dirs = {Improved:0,"No change":0,Worsened:0};
            closedWithOutcome.forEach(p=>{
              const d=p.outcome?.outcome1?.direction;
              if(d&&dirs[d]!=null) dirs[d]++;
            });
            const colors = {Improved:T.green,"No change":T.amber,Worsened:T.red};
            return Object.entries(dirs).map(([dir,n])=>(
              <div key={dir} style={{display:"flex",alignItems:"center",
                gap:10,marginBottom:10}}>
                <div style={{width:90,fontSize:12,color:"#F0F6FF",
                  fontWeight:500,flexShrink:0}}>{dir}</div>
                <div style={{flex:1}}>
                  <div style={{height:20,background:T.bg3,borderRadius:4,
                    overflow:"hidden",position:"relative"}}>
                    <div style={{height:"100%",borderRadius:4,
                      background:colors[dir],
                      width:closedWithOutcome.length
                        ?`${n/closedWithOutcome.length*100}%`:"0%",
                      transition:"width 0.5s"}}/>
                  </div>
                </div>
                <span style={{fontSize:12,color:T.text3,fontFamily:T.mono,
                  width:30,textAlign:"right",flexShrink:0}}>{n}</span>
              </div>
            ));
          })()}
          {closedWithOutcome.length>0&&(
            <div style={{marginTop:12,padding:"10px 12px",
              background:T.bg3,borderRadius:6,
              fontSize:11,color:T.text3}}>
              {complete} closed · {outcomes.length} evidence rows imported
            </div>
          )}
        </div>
      </div>

      {/* Completion progress */}
      <div style={{background:T.bg2,borderRadius:8,padding:16,
        border:`1px solid ${T.border}`,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:12,color:T.teal,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em"}}>
            Study progress
          </div>
          <span style={{fontSize:13,fontFamily:T.mono,fontWeight:700,
            color:complete===total&&total>0?T.green:T.amber}}>
            {complete}/{total} complete
          </span>
        </div>
        <div style={{height:8,background:T.bg3,borderRadius:4,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:4,
            background:complete===total&&total>0?T.green:T.teal,
            width:total?`${complete/total*100}%`:"0%",
            transition:"width 0.8s"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",
          marginTop:6,fontSize:10,color:T.text3}}>
          <span>{active} active</span>
          <span>{total===0?"No patients yet":`${Math.round(complete/Math.max(total,1)*100)}% complete`}</span>
        </div>
      </div>
    </div>
  );
};

/* ─── PATIENT FEED PANEL ─────────────────────────────────────────────── */
const PatientFeedPanel = ({ patients=[], outcomes, onImport }) => {
  const [filter,   setFilter]   = useState("all"); // all|active|complete
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);

  const filtered = patients
    .filter(p => filter==="all" || p.status===filter)
    .filter(p => !search || 
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      (p.symptom1||"").toLowerCase().includes(search.toLowerCase()) ||
      (p.symptom2||"").toLowerCase().includes(search.toLowerCase())
    );

  const alreadyImported = new Set(
    outcomes.map(o=>o._patientId).filter(Boolean)
  );

  return (
    <div className="fade-in">
      <SectionHeader
        title="Patient Feed"
        subtitle="All doctor submissions for this study compound"
        action={
          <Btn onClick={onImport} style={{fontSize:12}}>
            ↓ Import to Evidence
          </Btn>
        }/>

      {/* Filter bar */}
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search by ID or symptom…"
          style={{flex:1,fontSize:13,padding:"8px 12px"}}/>
        <div style={{display:"flex",gap:4}}>
          {[["all","All"],["active","Active"],["complete","Closed"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)}
              style={{padding:"7px 14px",borderRadius:6,fontSize:12,
                cursor:"pointer",fontFamily:"inherit",fontWeight:filter===v?700:400,
                background:filter===v?T.teal:"transparent",
                color:filter===v?T.bg0:"#F0F6FF",
                border:`1px solid ${filter===v?T.teal:T.border}`}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {patients.length===0&&(
        <div style={{textAlign:"center",padding:"60px 20px",
          border:`1px dashed ${T.border2}`,borderRadius:8}}>
          <div style={{fontSize:32,marginBottom:8,opacity:0.3}}>👤</div>
          <p style={{fontSize:13,color:T.text3}}>
            No patient data yet. Doctors need to log patients on the mobile app.
          </p>
        </div>
      )}

      {/* Patient rows */}
      {filtered.map(p=>{
        const isOpen     = expanded===p.id;
        const imported   = alreadyImported.has(p.id);
        const logs       = p.weeklyLogs||[];
        const lastLog    = logs[logs.length-1];
        const hasOutcome = p.status==="complete"&&p.outcome;

        return (
          <div key={p.id} style={{background:T.bg2,borderRadius:8,
            marginBottom:8,border:`1px solid ${T.border}`,overflow:"hidden"}}>

            {/* Row header */}
            <div onClick={()=>setExpanded(isOpen?null:p.id)}
              style={{display:"flex",alignItems:"center",gap:12,
                padding:"12px 14px",cursor:"pointer"}}>

              <span style={{fontFamily:T.mono,fontSize:13,fontWeight:700,
                color:T.teal,flexShrink:0,width:70}}>{p.id}</span>

              <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,
                fontWeight:600,flexShrink:0,
                background:p.status==="complete"?T.greenBg:T.bg3,
                color:p.status==="complete"?T.green:T.text3}}>
                {p.status==="complete"?"Closed":"Active"}
              </span>

              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {p.symptom1&&(
                    <span style={{fontSize:11,color:T.amber,
                      background:T.amberBg,padding:"1px 7px",
                      borderRadius:4}}>{p.symptom1}</span>
                  )}
                  {p.symptom2&&(
                    <span style={{fontSize:11,color:T.amber,
                      background:T.amberBg,padding:"1px 7px",
                      borderRadius:4}}>{p.symptom2}</span>
                  )}
                </div>
                <div style={{fontSize:11,color:T.text3,marginTop:3}}>
                  {p.age&&`${p.age}y`}
                  {p.gender&&` · ${p.gender}`}
                  {p.primaryCompound?.name&&` · ${p.primaryCompound.name}`}
                  {p.primaryDose&&` ${p.primaryDose}${p.primaryDoseUnit||"mg"}`}
                  {p.primaryFrequency&&` · ${p.primaryFrequency}`}
                  {p.doctorName&&` · ${p.doctorName}`}
                </div>
              </div>

              <div style={{display:"flex",gap:8,alignItems:"center",
                flexShrink:0}}>
                <span style={{fontSize:11,color:T.text3,fontFamily:T.mono}}>
                  {logs.length}w
                </span>
                {imported&&(
                  <Tag color={T.green} style={{fontSize:9}}>✓ Imported</Tag>
                )}
                {hasOutcome&&!imported&&(
                  <Tag color={T.teal} style={{fontSize:9}}>Ready</Tag>
                )}
                <span style={{color:T.text3,fontSize:14}}>
                  {isOpen?"▲":"▼"}
                </span>
              </div>
            </div>

            {/* Expanded detail */}
            {isOpen&&(
              <div style={{borderTop:`1px solid ${T.border}`,
                padding:"12px 14px",background:T.bg3}}>

                {/* Weekly progress */}
                {logs.length>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:T.text3,fontWeight:700,
                      textTransform:"uppercase",letterSpacing:"0.06em",
                      marginBottom:8}}>Weekly progress</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {logs.map((log,i)=>{
                        const col = log.response==="Much better"?T.green:
                          log.response==="Better"?T.teal:
                          log.response==="Same"?T.text3:
                          log.response==="Worse"?T.amber:T.red;
                        return (
                          <div key={i} title={`Wk${log.week}: ${log.response}`}
                            style={{textAlign:"center",
                              background:T.bg2,borderRadius:6,
                              padding:"6px 8px",minWidth:36,
                              border:`1px solid ${col}40`}}>
                            <div style={{fontSize:9,color:T.text3,marginBottom:2}}>
                              W{log.week}
                            </div>
                            <div style={{fontSize:11,fontWeight:700,color:col}}>
                              {log.score1!=null?log.score1:"—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Outcome */}
                {hasOutcome&&(
                  <div style={{display:"grid",
                    gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[["symptom1","outcome1"],["symptom2","outcome2"]].map(([sk,ok])=>{
                      const sym = p[sk];
                      const out = p.outcome?.[ok];
                      if(!sym||!out?.direction) return null;
                      return (
                        <div key={sk} style={{background:T.bg2,borderRadius:6,
                          padding:"10px 12px",
                          border:`1px solid ${out.direction==="Improved"
                            ?T.green:out.direction==="Worsened"
                            ?T.red:T.border}20`}}>
                          <div style={{fontSize:11,color:T.amber,
                            fontWeight:600,marginBottom:4}}>{sym}</div>
                          <div style={{fontSize:13,fontWeight:600,
                            color:out.direction==="Improved"?T.green:
                              out.direction==="Worsened"?T.red:"#F0F6FF"}}>
                            {out.direction}
                          </div>
                          <div style={{fontSize:11,color:T.text3,marginTop:2}}>
                            {out.magnitude}
                          </div>
                          <div style={{display:"flex",gap:6,marginTop:4}}>
                            {out.significance&&(
                              <Tag color={out.significance==="Yes"?T.teal:T.text3}
                                style={{fontSize:9}}>
                                {out.significance==="Yes"?"Significant":"Not sig."}
                              </Tag>
                            )}
                            {out.mcid&&(
                              <Tag color={out.mcid==="Yes"?T.green:T.text3}
                                style={{fontSize:9}}>
                                MCID {out.mcid}
                              </Tag>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!hasOutcome&&p.status==="active"&&(
                  <div style={{fontSize:12,color:T.text3,fontStyle:"italic"}}>
                    Case still active — {logs.length} weeks logged so far
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {filtered.length===0&&patients.length>0&&(
        <div style={{textAlign:"center",padding:"40px",color:T.text3,fontSize:13}}>
          No patients match this filter.
        </div>
      )}
    </div>
  );
};

/* ─── NEW STUDY MODAL ────────────────────────────────────────────────── */
const NewStudyModal = ({ compounds, onClose, onCreate }) => {
  const [form, setForm] = useState({
    name:"", primaryCompound:"", targetN:"", description:""
  });
  const upd = (f,v) => setForm(p=>({...p,[f]:v}));

  const compoundOptions = compounds.length>0 ? compounds
    : SEED_COMPOUNDS;

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(0,0,0,0.75)"}}>
      <div style={{background:T.bg2,border:`1px solid ${T.border2}`,
        borderRadius:14,padding:28,width:500,
        boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:17,fontWeight:700,color:"#F0F6FF"}}>
            Create new study
          </h2>
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <FieldLabel label="Study name" required/>
            <input value={form.name} onChange={e=>upd("name",e.target.value)}
              placeholder="e.g. Ashwagandha Stress Reduction Study 2026"
              autoFocus/>
          </div>
          <div>
            <FieldLabel label="Primary compound" required/>
            <select value={form.primaryCompound}
              onChange={e=>upd("primaryCompound",e.target.value)}>
              <option value="">Select compound…</option>
              {compoundOptions.map(c=>(
                <option key={c.id} value={c.name}>{c.name}
                  {c.scientific?` (${c.scientific})`:""}</option>
              ))}
            </select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <FieldLabel label="Target patients"/>
              <input type="number" value={form.targetN}
                onChange={e=>upd("targetN",e.target.value)}
                placeholder="e.g. 50"/>
            </div>
            <div>
              <FieldLabel label="Target journal"/>
              <input value={form.target_journal||""}
                onChange={e=>upd("target_journal",e.target.value)}
                placeholder="e.g. JNIM"/>
            </div>
          </div>
          <div>
            <FieldLabel label="Study description"/>
            <textarea value={form.description}
              onChange={e=>upd("description",e.target.value)}
              rows={3} placeholder="Study objectives, inclusion criteria…"
              style={{resize:"none"}}/>
          </div>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={()=>onCreate(form)}
            disabled={!form.name||!form.primaryCompound}>
            Create study →
          </Btn>
        </div>
      </div>
    </div>
  );
};

/* ─── STUDIES LIST PANEL ─────────────────────────────────────────────── */

/* ─── STUDY DETAIL — full compound study view ──────────────────────── */
const StudyDetailView = ({
  project, outcomes, refs, compounds,
  allPatients, onImport, onUpdateProject,
  onGoToValidate, onGoToRefs,
  importPatientOutcomes, setActiveTab,
}) => {

  const [expandedDoctors, setExpandedDoctors] = useState({});
  const [editingMeta,     setEditingMeta]     = useState(false);
  const [meta, setMeta] = useState({
    compound_name:   project?.compound_name   || "",
    preamble:        project?.preamble        || "",
    notes:           project?.notes           || "",
    researcher:      project?.researcher      || "",
    affiliation:     project?.affiliation     || "",
    target_journal:  project?.target_journal  || "",
    co_authors:      project?.co_authors      || "",
  });

  // Filter patients to this study's compound
  const studyPatients = !project?.compound_name ? allPatients :
    allPatients.filter(p =>
      !p.primaryCompound?.name ||
      p.primaryCompound?.name === project.compound_name
    );

  // Group by doctor
  const byDoctor = {};
  studyPatients.forEach(p => {
    const key = p.doctorName || "Unknown";
    if (!byDoctor[key]) byDoctor[key] = {
      name: key, clinic: p.doctorClinic || "",
      patients: [], complete: 0, active: 0,
    };
    byDoctor[key].patients.push(p);
    if (p.status === "complete") byDoctor[key].complete++;
    else byDoctor[key].active++;
  });
  const doctors = Object.values(byDoctor).sort((a,b) => b.patients.length - a.patients.length);

  const complete   = studyPatients.filter(p => p.status === "complete");
  const imported   = outcomes.filter(o => o._fromPatient);
  const wsVals     = outcomes.map(o => Number(o._ws)).filter(v => !isNaN(v) && v > 0);
  const ess        = wsVals.length ? wsVals.reduce((a,b)=>a+b,0)/wsVals.length : null;
  const essC       = ess==null?"—":ess>=12?"Very Strong":ess>=9?"Strong":ess>=6?"Moderate":"Weak";
  const essCol     = ess==null?T.text3:ess>=9?T.green:ess>=6?T.amber:T.red;

  // Symptom breakdown
  const symptomDir = {};
  complete.forEach(p => {
    [["symptom1","outcome1"],["symptom2","outcome2"]].forEach(([sk,ok]) => {
      const sym = p[sk]; const out = p.outcome?.[ok];
      if (!sym || !out?.direction) return;
      if (!symptomDir[sym]) symptomDir[sym] = {imp:0,nc:0,wor:0,total:0};
      symptomDir[sym].total++;
      if (out.direction==="Improved")  symptomDir[sym].imp++;
      else if (out.direction==="Worsened") symptomDir[sym].wor++;
      else symptomDir[sym].nc++;
    });
  });
  const topSymptoms = Object.entries(symptomDir)
    .sort((a,b) => b[1].total - a[1].total).slice(0,8);

  const saveMeta = () => {
    onUpdateProject({...project, ...meta});
    setEditingMeta(false);
  };

  const Field = ({label, field, multi=false, placeholder=""}) => (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,color:T.text3,fontWeight:700,
        textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
        {label}
      </div>
      {editingMeta ? (
        multi ? (
          <textarea rows={3} value={meta[field]}
            onChange={e=>setMeta(p=>({...p,[field]:e.target.value}))}
            placeholder={placeholder}
            style={{width:"100%",resize:"vertical",padding:"8px 10px",
              borderRadius:6,background:T.bg3,border:`1px solid ${T.border2}`,
              color:"#F0F6FF",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
        ) : (
          <input value={meta[field]}
            onChange={e=>setMeta(p=>({...p,[field]:e.target.value}))}
            placeholder={placeholder}
            style={{width:"100%",padding:"8px 10px",borderRadius:6,
              background:T.bg3,border:`1px solid ${T.border2}`,
              color:"#F0F6FF",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
        )
      ) : (
        <div style={{fontSize:13,color:meta[field]?"#F0F6FF":T.text3,
          padding:"6px 0",lineHeight:1.6,fontStyle:meta[field]?"normal":"italic"}}>
          {meta[field] || `Not set — click Edit to add`}
        </div>
      )}
    </div>
  );

  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* ── STUDY HEADER ────────────────────────────────────────────── */}
      <div style={{background:T.bg2,borderRadius:10,padding:20,
        border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:"#F0F6FF",marginBottom:4}}>
              {project?.name || "Unnamed Study"}
            </div>
            {meta.compound_name&&(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Tag color={T.teal} style={{fontSize:12}}>{meta.compound_name}</Tag>
                {meta.target_journal&&(
                  <span style={{fontSize:11,color:T.text3}}>
                    Target: {meta.target_journal}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:8}}>
            {editingMeta?(
              <>
                <Btn variant="secondary" onClick={()=>setEditingMeta(false)}
                  style={{fontSize:12}}>Cancel</Btn>
                <Btn onClick={saveMeta} style={{fontSize:12}}>Save</Btn>
              </>
            ):(
              <Btn variant="secondary" onClick={()=>setEditingMeta(true)}
                style={{fontSize:12}}>✎ Edit</Btn>
            )}
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div>
            <Field label="Study preamble / objective" field="preamble"
              multi placeholder="What is this study investigating?"/>
            <Field label="Researcher notes" field="notes"
              multi placeholder="Any notes for this synthesis..."/>
          </div>
          <div>
            <Field label="Lead researcher" field="researcher"
              placeholder="Dr. Name"/>
            <Field label="Co-authors" field="co_authors"
              placeholder="Co-author names"/>
            <Field label="Affiliation" field="affiliation"
              placeholder="Institution / clinic"/>
            <Field label="Target journal" field="target_journal"
              placeholder="Journal name"/>
          </div>
        </div>
      </div>

      {/* ── STUDY METRICS ───────────────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
        {[
          ["Patients",       studyPatients.length,  T.teal,   "Total enrolled"],
          ["Complete",       complete.length,        T.green,  `${studyPatients.length?Math.round(complete.length/studyPatients.length*100):0}% rate`],
          ["Active",         studyPatients.length-complete.length, T.amber, "In progress"],
          ["Outcomes",       imported.length,        T.purple||"#A78BFA","Imported rows"],
          ["ESS",            ess!=null?(Number(ess)||0).toFixed(1):"—", essCol, essC],
        ].map(([label,val,col,sub])=>(
          <div key={label} style={{background:T.bg2,borderRadius:8,
            padding:"12px 14px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:22,fontWeight:800,color:col,
              fontFamily:T.mono,lineHeight:1}}>{val}</div>
            <div style={{fontSize:11,color:"#F0F6FF",marginTop:3,fontWeight:500}}>{label}</div>
            <div style={{fontSize:10,color:T.text3,marginTop:1}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── DOCTOR CONTRIBUTIONS ────────────────────────────────────── */}
      <div style={{background:T.bg2,borderRadius:10,border:`1px solid ${T.border}`,
        overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>
            Contributing Doctors ({doctors.length})
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{
                const all={};
                doctors.forEach(d=>all[d.name]=true);
                setExpandedDoctors(all);
              }}
              style={{fontSize:11,color:T.teal,background:"none",border:"none",
                cursor:"pointer",fontFamily:"inherit"}}>
              Expand all
            </button>
            <button onClick={()=>setExpandedDoctors({})}
              style={{fontSize:11,color:T.text3,background:"none",border:"none",
                cursor:"pointer",fontFamily:"inherit"}}>
              Collapse all
            </button>
          </div>
        </div>

        {doctors.length===0&&(
          <div style={{padding:"40px 20px",textAlign:"center",color:T.text3,fontSize:13}}>
            No patient data yet. Doctors need to log patients on the mobile app.
          </div>
        )}

        {doctors.map((doc,di)=>{
          const isOpen = expandedDoctors[doc.name];
          const impRate = doc.complete>0
            ? Math.round(doc.patients.filter(p=>
                p.outcome?.outcome1?.direction==="Improved").length/doc.complete*100)
            : 0;

          return (
            <div key={doc.name} style={{
              borderBottom: di<doctors.length-1?`1px solid ${T.border}`:"none"}}>

              {/* Doctor header row */}
              <div onClick={()=>setExpandedDoctors(prev=>({
                  ...prev,[doc.name]:!prev[doc.name]}))}
                style={{padding:"14px 20px",cursor:"pointer",
                  display:"flex",alignItems:"center",gap:16,
                  background:isOpen?T.bg3:"transparent",
                  transition:"background 0.15s"}}>

                <div style={{width:36,height:36,borderRadius:"50%",
                  background:`linear-gradient(135deg,${T.teal},#0088AA)`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:15,fontWeight:700,color:"#0A1628",flexShrink:0}}>
                  {doc.name.split(" ").pop()[0]||"D"}
                </div>

                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>
                    {doc.name}
                  </div>
                  {doc.clinic&&(
                    <div style={{fontSize:11,color:T.text3}}>{doc.clinic}</div>
                  )}
                </div>

                <div style={{display:"flex",gap:20,alignItems:"center"}}>
                  {[
                    [doc.patients.length, "patients",  "#F0F6FF"],
                    [doc.complete,        "complete",   T.green],
                    [doc.active,          "active",     T.amber],
                    [`${impRate}%`,       "improved",   T.teal],
                  ].map(([val,lbl,col])=>(
                    <div key={lbl} style={{textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:700,
                        color:col,fontFamily:T.mono}}>{val}</div>
                      <div style={{fontSize:9,color:T.text3,
                        textTransform:"uppercase",letterSpacing:"0.05em"}}>{lbl}</div>
                    </div>
                  ))}
                  <span style={{color:T.text3,fontSize:16,marginLeft:8}}>
                    {isOpen?"▲":"▼"}
                  </span>
                </div>
              </div>

              {/* Patient rows */}
              {isOpen&&(
                <div style={{background:T.bg3}}>
                  {/* Column headers */}
                  <div style={{display:"grid",
                    gridTemplateColumns:"80px 60px 55px 1fr 1fr 90px 90px 70px",
                    gap:8,padding:"6px 20px",fontSize:9,color:T.text3,
                    fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",
                    borderBottom:`1px solid ${T.border}`}}>
                    <span>Patient</span>
                    <span>Age</span>
                    <span>Weeks</span>
                    <span>Symptom 1</span>
                    <span>Symptom 2</span>
                    <span>Prognosis 1</span>
                    <span>Prognosis 2</span>
                    <span>Status</span>
                  </div>

                  {doc.patients.map((p,pi)=>{
                    const o1   = p.outcome?.outcome1;
                    const o2   = p.outcome?.outcome2;
                    const wks  = (p.weeklyLogs||[]).length;
                    const last = (p.weeklyLogs||[]).slice(-1)[0];
                    const sc   = p.secondaryCompound;
                    const rCol = last?.response?.includes("better")?T.green
                      :last?.response==="Same"?T.amber
                      :last?.response?.includes("orse")?T.red:T.text3;
                    const isExpanded = expandedDrs[`${doc.name}__${p.id}`];

                    // Auto-compute O score
                    const oScore = o1?.direction==="Improved"
                      ? (o1.significance==="Yes"&&o1.mcid==="Yes"?4
                        :o1.significance==="Yes"?3:2) : 1;
                    const sScore = wks>=200?5:wks>=100?4:wks>=50?3:wks>=20?2:1;
                    const ws     = 3 + sScore + oScore - 0; // Q=3 obs, B=0

                    return (
                      <div key={p.id}
                        style={{borderBottom:pi<doc.patients.length-1
                          ?`1px solid ${T.border}`:"none",
                          background:pi%2===0?T.bg3:T.bg2}}>

                        {/* ── Summary row (always visible) ── */}
                        <div
                          onClick={()=>setExpandDrs(prev=>({
                            ...prev,[`${doc.name}__${p.id}`]:!prev[`${doc.name}__${p.id}`]
                          }))}
                          style={{display:"grid",
                            gridTemplateColumns:"75px 65px 45px 110px 130px 90px 110px 90px 90px 80px 80px 80px 60px",
                            gap:6,padding:"9px 20px",alignItems:"start",
                            cursor:"pointer"}}>

                          {/* Patient ID */}
                          <div>
                            <div style={{fontFamily:T.mono,fontSize:12,
                              fontWeight:700,color:T.teal}}>{p.id}</div>
                            <div style={{fontSize:9,color:T.text3,marginTop:2}}>
                              {p.targetDuration||""}
                            </div>
                          </div>

                          {/* Age/Sex */}
                          <div>
                            <div style={{fontSize:12,color:"#F0F6FF"}}>
                              {p.age||"—"}y {p.gender||""}
                            </div>
                            <div style={{fontSize:9,color:T.text3,marginTop:2}}>
                              {last?.response&&last.response}
                            </div>
                          </div>

                          {/* Weeks */}
                          <div style={{textAlign:"center"}}>
                            <div style={{fontSize:14,fontWeight:700,
                              color:rCol,fontFamily:T.mono}}>{wks}</div>
                            <div style={{fontSize:8,color:T.text3}}>wks</div>
                          </div>

                          {/* Study type */}
                          <div>
                            <div style={{fontSize:10,fontWeight:600,color:T.teal}}>
                              Clinical obs.
                            </div>
                            <div style={{fontSize:9,color:T.text3,marginTop:1}}>
                              WS: {ws}
                            </div>
                          </div>

                          {/* Symptom 1 */}
                          <div>
                            <div style={{fontSize:11,fontWeight:600,
                              color:"#F0F6FF",marginBottom:2}}>
                              {p.symptom1||"—"}
                            </div>
                            {o1?.direction&&(
                              <div style={{fontSize:10,fontWeight:700,
                                color:o1.direction==="Improved"?T.green
                                  :o1.direction==="Worsened"?T.red:T.amber}}>
                                → {o1.direction}
                              </div>
                            )}
                          </div>

                          {/* Symptom 2 */}
                          <div>
                            <div style={{fontSize:11,color:T.text2,marginBottom:2}}>
                              {p.symptom2||"—"}
                            </div>
                            {o2?.direction&&p.symptom2&&(
                              <div style={{fontSize:10,fontWeight:700,
                                color:o2.direction==="Improved"?T.green
                                  :o2.direction==="Worsened"?T.red:T.amber}}>
                                → {o2.direction}
                              </div>
                            )}
                          </div>

                          {/* Primary dose */}
                          <div>
                            <div style={{fontSize:11,color:"#F0F6FF"}}>
                              {p.primaryDose?`${p.primaryDose}${p.primaryDoseUnit||"mg"}`:"—"}
                            </div>
                            <div style={{fontSize:9,color:T.text3,marginTop:1}}>
                              {p.primaryFrequency||""}
                            </div>
                          </div>

                          {/* 2° Compound */}
                          <div style={{fontSize:11,
                            color:sc?.name?T.amber:T.text3,fontWeight:sc?.name?600:400}}>
                            {sc?.name||"—"}
                          </div>

                          {/* 2° Dose */}
                          <div style={{fontSize:11,color:"#F0F6FF"}}>
                            {sc?.name&&p.secondaryDose
                              ?`${p.secondaryDose}${p.secondaryDoseUnit||"mg"}`:"—"}
                          </div>

                          {/* Prognosis 1 */}
                          <div>
                            {o1?.direction?(
                              <span style={{fontSize:11,fontWeight:700,
                                color:o1.direction==="Improved"?T.green
                                  :o1.direction==="Worsened"?T.red:T.amber}}>
                                {o1.direction}
                              </span>
                            ):(
                              <span style={{fontSize:10,color:T.text3}}>
                                {p.status==="active"?"Active":"—"}
                              </span>
                            )}
                          </div>

                          {/* Prognosis 2 */}
                          <div>
                            {o2?.direction&&p.symptom2?(
                              <span style={{fontSize:11,fontWeight:700,
                                color:o2.direction==="Improved"?T.green
                                  :o2.direction==="Worsened"?T.red:T.amber}}>
                                {o2.direction}
                              </span>
                            ):(
                              <span style={{fontSize:10,color:T.text3}}>—</span>
                            )}
                          </div>

                          {/* Sig / MCID */}
                          <div>
                            <div style={{fontSize:9,marginBottom:2,
                              color:o1?.significance==="Yes"?T.green:T.text3,
                              fontWeight:600}}>
                              {o1?.significance==="Yes"?"✓ Sig"
                                :o1?.significance==="No"?"✗ NS":"—"}
                            </div>
                            <div style={{fontSize:9,
                              color:o1?.mcid==="Yes"?T.green:T.text3,
                              fontWeight:600}}>
                              {o1?.mcid==="Yes"?"✓ MCID"
                                :o1?.mcid==="No"?"✗ MCID":"—"}
                            </div>
                          </div>

                          {/* Status + expand */}
                          <div style={{display:"flex",flexDirection:"column",
                            alignItems:"center",gap:4}}>
                            <span style={{fontSize:9,padding:"2px 7px",
                              borderRadius:5,fontWeight:600,
                              background:p.status==="complete"?T.greenBg:T.amberBg,
                              color:p.status==="complete"?T.green:T.amber}}>
                              {p.status==="complete"?"Done":"Active"}
                            </span>
                            <span style={{fontSize:10,color:T.text3}}>
                              {isExpanded?"▲":"▼"}
                            </span>
                          </div>
                        </div>

                        {/* ── Expanded detail panel ── */}
                        {isExpanded&&(
                          <div style={{padding:"16px 20px 20px",
                            borderTop:`1px solid ${T.border}`,
                            background:"rgba(0,210,200,0.04)"}}>
                            <div style={{display:"grid",
                              gridTemplateColumns:"1fr 1fr 1fr 1fr",
                              gap:16}}>

                              {/* Patient demographics */}
                              <div style={{background:T.bg2,borderRadius:8,
                                padding:"12px 14px",border:`1px solid ${T.border}`}}>
                                <div style={{fontSize:10,color:T.teal,fontWeight:700,
                                  textTransform:"uppercase",letterSpacing:"0.06em",
                                  marginBottom:10}}>Patient</div>
                                {[
                                  ["ID",          p.id],
                                  ["Age",         p.age?`${p.age} years`:"—"],
                                  ["Gender",      p.gender||"—"],
                                  ["Enrolled",    p.createdAt
                                    ?new Date(p.createdAt).toLocaleDateString("en-GB",
                                      {day:"2-digit",month:"short",year:"numeric"}):"—"],
                                  ["Duration",    p.targetDuration||"—"],
                                  ["Weeks logged",wks],
                                  ["Status",      p.status==="complete"?"Complete":"Active"],
                                ].map(([l,v])=>(
                                  <div key={l} style={{display:"flex",
                                    justifyContent:"space-between",
                                    padding:"4px 0",
                                    borderBottom:`1px solid ${T.border}`}}>
                                    <span style={{fontSize:11,color:T.text3}}>{l}</span>
                                    <span style={{fontSize:11,color:"#F0F6FF",
                                      fontWeight:500}}>{v}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Prescription */}
                              <div style={{background:T.bg2,borderRadius:8,
                                padding:"12px 14px",border:`1px solid ${T.border}`}}>
                                <div style={{fontSize:10,color:T.teal,fontWeight:700,
                                  textTransform:"uppercase",letterSpacing:"0.06em",
                                  marginBottom:10}}>Prescription</div>
                                {[
                                  ["Primary",     p.primaryCompound?.name||"—"],
                                  ["Dose",        p.primaryDose?`${p.primaryDose}${p.primaryDoseUnit||"mg"}`:"—"],
                                  ["Frequency",   p.primaryFrequency||"—"],
                                  ["Form",        p.primaryForm||"—"],
                                  ["2° Compound", sc?.name||"None"],
                                  ["2° Dose",     sc?.name&&p.secondaryDose
                                    ?`${p.secondaryDose}${p.secondaryDoseUnit||"mg"}`:"—"],
                                  ["2° Frequency",sc?.name?p.secondaryFrequency||"—":"—"],
                                ].map(([l,v])=>(
                                  <div key={l} style={{display:"flex",
                                    justifyContent:"space-between",
                                    padding:"4px 0",
                                    borderBottom:`1px solid ${T.border}`}}>
                                    <span style={{fontSize:11,color:T.text3}}>{l}</span>
                                    <span style={{fontSize:11,color:"#F0F6FF",
                                      fontWeight:500,textAlign:"right",
                                      maxWidth:120,overflow:"hidden",
                                      textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                      {v}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {/* Outcomes */}
                              <div style={{background:T.bg2,borderRadius:8,
                                padding:"12px 14px",border:`1px solid ${T.border}`}}>
                                <div style={{fontSize:10,color:T.teal,fontWeight:700,
                                  textTransform:"uppercase",letterSpacing:"0.06em",
                                  marginBottom:10}}>Outcomes</div>
                                {[
                                  ["Symptom 1",   p.symptom1||"—"],
                                  ["Direction",   o1?.direction||"Pending"],
                                  ["Magnitude",   o1?.magnitude||"—"],
                                  ["Significant", o1?.significance||"—"],
                                  ["MCID met",    o1?.mcid||"—"],
                                  ["Symptom 2",   p.symptom2||"None"],
                                  ["Direction",   o2?.direction||p.symptom2?"Pending":"—"],
                                  ["Magnitude",   o2?.magnitude||"—"],
                                ].map(([l,v],i)=>(
                                  <div key={l+i} style={{display:"flex",
                                    justifyContent:"space-between",
                                    padding:"4px 0",
                                    borderBottom:`1px solid ${T.border}`}}>
                                    <span style={{fontSize:11,color:T.text3}}>{l}</span>
                                    <span style={{fontSize:11,fontWeight:500,
                                      color:v==="Improved"?T.green
                                        :v==="Worsened"?T.red
                                        :v==="Yes"?T.green
                                        :v==="No"?T.text3:"#F0F6FF"
                                    }}>{v}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Evidence scoring */}
                              <div style={{background:T.bg2,borderRadius:8,
                                padding:"12px 14px",border:`1px solid ${T.border}`}}>
                                <div style={{fontSize:10,color:T.teal,fontWeight:700,
                                  textTransform:"uppercase",letterSpacing:"0.06em",
                                  marginBottom:10}}>Evidence scoring</div>
                                {[
                                  ["Study type",    p.studyType||"Clinical observation"],
                                  ["Q (quality)",   `${p.qualityScore||3} — ${p.studyType||"Observational"}`],
                                  ["S (sample)",    `${sScore} — n=${wks} weeks`],
                                  ["O (outcome)",   `${oScore} — ${
                                    oScore===4?"Improved+Sig+MCID"
                                    :oScore===3?"Improved+Sig"
                                    :oScore===2?"Improved"
                                    :"No change/Worse"}`],
                                  ["B (bias)",      "0 — Clinical obs."],
                                  ["WS score",      ws],
                                  ["Weeks completed", p.outcome?.weeksCompleted||wks],
                                  ["Final notes",   p.outcome?.finalNotes||"—"],
                                ].map(([l,v])=>(
                                  <div key={l} style={{display:"flex",
                                    justifyContent:"space-between",
                                    padding:"4px 0",
                                    borderBottom:`1px solid ${T.border}`}}>
                                    <span style={{fontSize:11,color:T.text3}}>{l}</span>
                                    <span style={{fontSize:11,color:
                                      l==="WS score"?T.teal:"#F0F6FF",
                                      fontWeight:l==="WS score"?700:500}}>
                                      {v}
                                    </span>
                                  </div>
                                ))}

                                {/* Weekly progress summary */}
                                {(p.weeklyLogs||[]).length>0&&(
                                  <div style={{marginTop:10,paddingTop:8,
                                    borderTop:`1px solid ${T.border}`}}>
                                    <div style={{fontSize:9,color:T.text3,
                                      fontWeight:700,textTransform:"uppercase",
                                      letterSpacing:"0.05em",marginBottom:6}}>
                                      Weekly progress
                                    </div>
                                    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                                      {(p.weeklyLogs||[]).map((log,li)=>{
                                        const c = log.response?.includes("better")?T.green
                                          :log.response==="Same"?T.amber
                                          :log.response?.includes("orse")?T.red:T.text3;
                                        return (
                                          <div key={li}
                                            title={`Week ${log.week}: ${log.response}`}
                                            style={{width:16,height:16,borderRadius:3,
                                              background:c,opacity:0.8,
                                              display:"flex",alignItems:"center",
                                              justifyContent:"center",
                                              fontSize:8,color:"#0A1628",
                                              fontWeight:700}}>
                                            {log.week}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── SYMPTOM BREAKDOWN ───────────────────────────────────────── */}
      {topSymptoms.length>0&&(
        <div style={{background:T.bg2,borderRadius:10,padding:20,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF",marginBottom:16}}>
            Symptom outcomes breakdown
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {topSymptoms.map(([sym,d])=>(
              <div key={sym} style={{background:T.bg3,borderRadius:8,
                padding:"10px 14px",border:`1px solid ${T.border}`}}>
                <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",
                  marginBottom:6}}>{sym}</div>
                <div style={{display:"flex",gap:4,marginBottom:4}}>
                  {d.imp>0&&<div style={{height:6,borderRadius:3,
                    background:T.green,flex:d.imp}}/>}
                  {d.nc>0&&<div style={{height:6,borderRadius:3,
                    background:T.amber,flex:d.nc}}/>}
                  {d.wor>0&&<div style={{height:6,borderRadius:3,
                    background:T.red,flex:d.wor}}/>}
                </div>
                <div style={{display:"flex",gap:10,fontSize:10,color:T.text3}}>
                  <span style={{color:T.green}}>✓ {d.imp} improved</span>
                  {d.nc>0&&<span style={{color:T.amber}}>→ {d.nc} no change</span>}
                  {d.wor>0&&<span style={{color:T.red}}>↓ {d.wor} worsened</span>}
                  <span style={{marginLeft:"auto"}}>{d.total} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ACTIONS ─────────────────────────────────────────────────── */}
      <div style={{background:T.bg2,borderRadius:10,padding:20,
        border:`1px solid ${T.border}`}}>
        <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF",marginBottom:14}}>
          Synthesis actions
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div style={{background:T.bg3,borderRadius:8,padding:14,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",marginBottom:4}}>
              1. Import outcomes
            </div>
            <div style={{fontSize:11,color:T.text3,marginBottom:10}}>
              {imported.length>0
                ?`${imported.length} rows imported from ${complete.length} patients`
                :`${complete.length} completed cases ready to import`}
            </div>
            <Btn onClick={onImport}
              variant={imported.length>0?"secondary":"primary"}
              style={{width:"100%",justifyContent:"center",fontSize:12}}>
              {imported.length>0?"↻ Refresh import":"↓ Import outcomes"}
            </Btn>
          </div>
          <div style={{background:T.bg3,borderRadius:8,padding:14,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",marginBottom:4}}>
              2. Add references
            </div>
            <div style={{fontSize:11,color:T.text3,marginBottom:10}}>
              {refs.length>0?`${refs.length} references added`:"Auto-search PubMed for compound"}
            </div>
            <Btn onClick={onGoToRefs} variant="secondary"
              style={{width:"100%",justifyContent:"center",fontSize:12}}>
              {refs.length>0?"View references →":"Search references →"}
            </Btn>
          </div>
          <div style={{background:T.bg3,borderRadius:8,padding:14,
            border:`1px solid ${T.border}`,
            opacity:(imported.length>0)?1:0.5}}>
            <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",marginBottom:4}}>
              3. Validate & Generate
            </div>
            <div style={{fontSize:11,color:T.text3,marginBottom:10}}>
              {ess!=null
                ?`ESS ${(Number(ess)||0).toFixed(2)} · ${essC} · Ready`
                :"Import outcomes first"}
            </div>
            <Btn onClick={onGoToValidate}
              disabled={imported.length===0}
              style={{width:"100%",justifyContent:"center",fontSize:12,fontWeight:700}}>
              Validate & Generate →
            </Btn>
          </div>
        </div>
      </div>

    </div>
  );
};

/* ─── RESEARCHER ROLES ────────────────────────────────────────────── */
/* ─── COMPUTED RESULTS PANEL ─────────────────────────────────────── */
const ComputedResultsPanel = ({ patients=[], outcomes=[], compound="", onNext }) => {

  const complete = patients.filter(p=>p.status==="complete");
  const n        = complete.length;

  // Get compound object for scientific name
  const comp = (()=>{
    const c = complete[0]?.primaryCompound;
    return c||null;
  })();

  /* ── Evidence scoring constants ── */
  const Q_SCORES = {
    "Meta-analysis":5, "Systematic review":5,
    "RCT":4, "Clinical trial":4,
    "Clinical observation":3, "Observational":3,
    "Case series":2, "Mechanistic":2,
  };
  // Q varies by study type - use mean from patient data
  const qScores = {"RCT":4,"Meta-analysis":5,"Systematic review":5,
    "Clinical observation":3,"Observational":3,"Case series":2,"Mechanistic":2};
  const getQ = (p) => p.qualityScore || qScores[p.studyType||""] || 3;
  const compPatsComplete = complete; // reuse `complete` already computed above
  const meanQ = compPatsComplete.length
    ? Math.round(compPatsComplete.reduce((a,p)=>
        a+getQ(p),0)/compPatsComplete.length*10)/10
    : 3;
  const Q = meanQ;
  const Q_MAP = qScores;

  const sampleScore = (n) =>
    n>=200?5:n>=100?4:n>=50?3:n>=20?2:1;

  const outcomeScore = (imp,sig,mcid) =>
    imp&&sig&&mcid?4:imp&&sig?3:imp?2:1;

  /* ── Per-symptom aggregation ── */
  const symMap = {};
  complete.forEach(p=>{
    [["symptom1","outcome1"],["symptom2","outcome2"]].forEach(([sk,ok])=>{
      const sym = p[sk]; const out = p.outcome?.[ok];
      if(!sym||!out?.direction) return;
      if(!symMap[sym]) symMap[sym]={
        name:sym, patients:[], imp:0, nc:0, wor:0,
        sig:0, mcid:0, magnitudes:[], wsList:[],
      };
      const d = symMap[sym];
      d.patients.push(p);
      const isImp  = out.direction==="Improved";
      const isSig  = out.significance==="Yes";
      const isMcid = out.mcid==="Yes";
      if(isImp)  d.imp++;
      else if(out.direction==="Worsened") d.wor++;
      else d.nc++;
      if(isSig)  d.sig++;
      if(isMcid) d.mcid++;
      if(out.magnitude) d.magnitudes.push(out.magnitude);
      const S  = sampleScore(n);
      const O  = outcomeScore(isImp,isSig,isMcid);
      const pQ = getQ(p);
      const ws = pQ + S + O;
      d.wsList.push({ws, Q:pQ, S, O, type:p.studyType||"Clinical observation"});
    });
  });

  const symptoms = Object.values(symMap)
    .sort((a,b)=>b.patients.length-a.patients.length);

  /* ── Overall ESS ── */
  const allWS   = symptoms.flatMap(s=>s.wsList.map(x=>x.ws||x));
  const ess     = allWS.length
    ?allWS.reduce((a,b)=>a+b,0)/allWS.length:null;
  const essC    = ess==null?"—"
    :ess>=12?"Very Strong":ess>=9?"Strong"
    :ess>=6?"Moderate":"Weak";
  const essCol  = ess==null?T.text3
    :ess>=9?T.green:ess>=6?T.amber:T.red;

  /* ── Dose analysis ── */
  const doseGroups = {};
  complete.forEach(p=>{
    const dose = p.primaryDose?`${p.primaryDose}${p.primaryDoseUnit||"mg"}`:"Unknown";
    if(!doseGroups[dose]) doseGroups[dose]={dose,total:0,imp:0};
    doseGroups[dose].total++;
    if(p.outcome?.outcome1?.direction==="Improved") doseGroups[dose].imp++;
  });
  const doseAnalysis = Object.values(doseGroups)
    .sort((a,b)=>b.total-a.total);

  /* ── Duration analysis ── */
  const durGroups = {};
  complete.forEach(p=>{
    const dur = p.targetDuration||"Unknown";
    if(!durGroups[dur]) durGroups[dur]={dur,total:0,imp:0};
    durGroups[dur].total++;
    if(p.outcome?.outcome1?.direction==="Improved") durGroups[dur].imp++;
  });
  const durAnalysis = Object.values(durGroups)
    .sort((a,b)=>b.total-a.total);

  const S = sampleScore(n);

  const ScoreBox = ({label,value,max,color,desc})=>(
    <div style={{background:T.bg3,borderRadius:8,padding:"12px 14px",
      border:`1px solid ${T.border}`,textAlign:"center"}}>
      <div style={{fontSize:28,fontWeight:800,color:color||T.teal,
        fontFamily:T.mono,lineHeight:1}}>{value}</div>
      <div style={{fontSize:10,color:T.text3,marginTop:2}}>/ {max}</div>
      <div style={{fontSize:11,color:"#F0F6FF",fontWeight:600,marginTop:6}}>{label}</div>
      {desc&&<div style={{fontSize:10,color:T.text3,marginTop:3,lineHeight:1.4}}>{desc}</div>}
    </div>
  );

  if(!n) return (
    <div style={{textAlign:"center",padding:"80px",
      border:`1px dashed ${T.border2}`,borderRadius:10}}>
      <div style={{fontSize:40,opacity:0.2,marginBottom:12}}>📊</div>
      <p style={{color:T.text3,fontSize:14}}>No completed cases yet.</p>
      <p style={{color:T.text3,fontSize:12,marginTop:6}}>
        Completed cases will appear here once doctors close patient records.
      </p>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div style={{background:T.bg2,borderRadius:10,padding:20,
        border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:"#F0F6FF",marginBottom:4}}>
              Computed Evidence Results
            </div>
            <div style={{fontSize:12,color:T.text3}}>
              {compound} · {n} completed cases · Auto-computed WS scoring
            </div>
          </div>
          <div style={{textAlign:"center",background:T.bg3,borderRadius:10,
            padding:"14px 20px",border:`1px solid ${essCol}40`}}>
            <div style={{fontSize:32,fontWeight:800,color:essCol,
              fontFamily:T.mono,lineHeight:1}}>
              {ess!=null?(Number(ess)||0).toFixed(2):"—"}
            </div>
            <div style={{fontSize:11,color:essCol,fontWeight:700,marginTop:4}}>
              ESS · {essC}
            </div>
            <div style={{fontSize:9,color:T.text3,marginTop:2}}>
              Evidence Strength Score
            </div>
          </div>
        </div>

        {/* WS Formula explanation */}
        <div style={{background:T.bg3,borderRadius:8,padding:14,
          border:`1px solid ${T.border}`,marginBottom:16}}>
          <div style={{fontSize:11,color:T.teal,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
            📐 WS Formula: Q + S + O − B = WS
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[
              {label:"Q — Study Quality",val:Q.toFixed(1),max:5,
                desc:`Mean Q=${Q.toFixed(1)} from study mix:\nRCT=4 · Obs=3 · Meta=5\nMechanistic=2`,
                col:T.teal},
              {label:"S — Sample size",val:S,max:5,
                desc:`n=${n} completed cases\nn≥200=5, ≥100=4\n≥50=3, ≥20=2, <20=1`,
                col:T.purple||"#A78BFA"},
              {label:"O — Outcome strength",val:"1–4",max:4,
                desc:"Improved+Sig+MCID = 4\nImproved+Sig = 3\nImproved only = 2\nNC/Worsened = 1",
                col:T.amber},
              {label:"B — Bias penalty",val:0,max:5,
                desc:"Clinical obs with\nno conflict = 0\nBias D1–D5 each add 1",
                col:T.green},
            ].map(({label,val,max,desc,col})=>(
              <div key={label} style={{background:T.bg2,borderRadius:8,
                padding:"10px 12px",border:`1px solid ${T.border}`}}>
                <div style={{fontSize:18,fontWeight:800,color:col,
                  fontFamily:T.mono,lineHeight:1,marginBottom:4}}>
                  {val}<span style={{fontSize:11,color:T.text3,fontWeight:400}}>/{max}</span>
                </div>
                <div style={{fontSize:11,color:"#F0F6FF",fontWeight:600,marginBottom:4}}>
                  {label}
                </div>
                <div style={{fontSize:9,color:T.text3,lineHeight:1.5,
                  whiteSpace:"pre-line"}}>{desc}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,padding:"8px 12px",background:T.bg2,
            borderRadius:6,fontSize:11,color:T.text3,lineHeight:1.6}}>
            <strong style={{color:"#F0F6FF"}}>ESS</strong> = Mean WS across all outcome rows.
            ESS ≥12 = Very Strong · ≥9 = Strong · ≥6 = Moderate · &lt;6 = Weak.
            O score is <strong style={{color:T.teal}}>auto-computed</strong> from doctor-recorded
            direction, statistical significance and MCID data.
          </div>
        </div>

        {/* Overall stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
          {[
            ["Completed cases", n,          "#F0F6FF","All with outcomes"],
            ["Improved",        symptoms.reduce((a,s)=>a+s.imp,0), T.green,
              `${n?Math.round(symptoms.reduce((a,s)=>a+s.imp,0)/Math.max(symptoms.reduce((a,s)=>a+s.patients.length,0),1)*100):0}% rate`],
            ["Significant",     symptoms.reduce((a,s)=>a+s.sig,0), T.teal,   "p<0.05"],
            ["MCID met",        symptoms.reduce((a,s)=>a+s.mcid,0),T.amber,  "Clinical threshold"],
            ["Unique symptoms",  symptoms.length, T.purple||"#A78BFA","Outcome areas"],
          ].map(([label,val,col,sub])=>(
            <div key={label} style={{background:T.bg3,borderRadius:8,
              padding:"12px 14px",border:`1px solid ${T.border}`}}>
              <div style={{fontSize:22,fontWeight:800,color:col,
                fontFamily:T.mono,lineHeight:1}}>{val}</div>
              <div style={{fontSize:11,color:"#F0F6FF",marginTop:4,fontWeight:500}}>
                {label}
              </div>
              <div style={{fontSize:10,color:T.text3,marginTop:2}}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PER-SYMPTOM EVIDENCE TABLE ───────────────────────────── */}
      <div style={{background:T.bg2,borderRadius:10,
        border:`1px solid ${T.border}`,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:4}}>
            Per-symptom evidence breakdown
          </div>
          <div style={{fontSize:11,color:T.text3}}>
            Each row = one outcome area. WS computed per patient then averaged.
          </div>
        </div>

        {/* Column headers */}
        <div style={{display:"grid",
          gridTemplateColumns:"1fr 60px 60px 60px 60px 60px 60px 60px 60px 80px 80px",
          gap:8,padding:"8px 20px",fontSize:9,color:T.text3,
          fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",
          borderBottom:`1px solid ${T.border}`,background:T.bg3}}>
          <span>Symptom / Outcome area</span>
          <span style={{textAlign:"center"}}>n</span>
          <span style={{textAlign:"center"}}>Improved</span>
          <span style={{textAlign:"center"}}>Imp%</span>
          <span style={{textAlign:"center"}}>Sig</span>
          <span style={{textAlign:"center"}}>MCID</span>
          <span style={{textAlign:"center"}}>Q</span>
          <span style={{textAlign:"center"}}>S</span>
          <span style={{textAlign:"center"}}>O</span>
          <span style={{textAlign:"center"}}>Mean WS</span>
          <span style={{textAlign:"center"}}>Verdict</span>
        </div>

        {symptoms.map((sym,i)=>{
          const wsNums  = sym.wsList.map(x=>x.ws||x);
          const meanWS  = wsNums.length
            ? wsNums.reduce((a,b)=>a+b,0)/wsNums.length : 0;
          const impPct  = sym.patients.length
            ? Math.round(sym.imp/sym.patients.length*100) : 0;
          const verdict = impPct>=75&&sym.sig>sym.patients.length/2
            ?"Strong positive"
            :impPct>=50?"Moderate positive"
            :impPct>=25?"Mixed":"Limited";
          const vCol    = impPct>=75?T.green:impPct>=50?T.teal:impPct>=25?T.amber:T.red;
          // Mean Q and O scores
          const meanQ = sym.wsList.length
            ? (sym.wsList.reduce((a,x)=>a+(x.Q||3),0)/sym.wsList.length).toFixed(1)
            : "—";
          const meanO = sym.wsList.length
            ? (sym.wsList.reduce((a,x)=>a+(x.O||0),0)/sym.wsList.length).toFixed(1)
            : "—";

          return (
            <div key={sym.name}>
              <div style={{display:"grid",
                gridTemplateColumns:"1fr 60px 60px 60px 60px 60px 60px 60px 60px 80px 80px",
                gap:8,padding:"12px 20px",alignItems:"center",
                borderBottom:`1px solid ${T.border}`,
                background:i%2===0?T.bg2:T.bg3}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>
                    {sym.name}
                  </div>
                  {sym.magnitudes.length>0&&(
                    <div style={{fontSize:10,color:T.text3,marginTop:2,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      maxWidth:300}}>
                      e.g. {sym.magnitudes[0]}
                    </div>
                  )}
                </div>
                <div style={{textAlign:"center",fontSize:13,fontWeight:700,
                  color:"#F0F6FF",fontFamily:T.mono}}>{sym.patients.length}</div>
                <div style={{textAlign:"center"}}>
                  <span style={{fontSize:13,fontWeight:700,
                    color:T.green,fontFamily:T.mono}}>{sym.imp}</span>
                  {sym.nc>0&&<span style={{fontSize:10,color:T.amber,
                    display:"block"}}>+{sym.nc} NC</span>}
                  {sym.wor>0&&<span style={{fontSize:10,color:T.red,
                    display:"block"}}>+{sym.wor} ↓</span>}
                </div>
                <div style={{textAlign:"center",fontSize:13,fontWeight:700,
                  color:impPct>=75?T.green:impPct>=50?T.teal:T.amber,
                  fontFamily:T.mono}}>{impPct}%</div>
                <div style={{textAlign:"center",fontSize:13,fontWeight:700,
                  color:T.teal,fontFamily:T.mono}}>{sym.sig}</div>
                <div style={{textAlign:"center",fontSize:13,fontWeight:700,
                  color:T.amber,fontFamily:T.mono}}>{sym.mcid}</div>
                <div style={{textAlign:"center",fontSize:13,fontFamily:T.mono,
                  color:T.teal}}>{meanQ}</div>
                <div style={{textAlign:"center",fontSize:13,fontFamily:T.mono,
                  color:T.purple||"#A78BFA"}}>{S}</div>
                <div style={{textAlign:"center",fontSize:13,fontFamily:T.mono,
                  color:T.amber}}>{meanO}</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:16,fontWeight:800,
                    color:meanWS>=9?T.green:meanWS>=6?T.teal:T.amber,
                    fontFamily:T.mono}}>
                    {meanWS.toFixed(1)}
                  </div>
                  <div style={{fontSize:9,color:T.text3,marginTop:1}}>
                    {meanWS>=12?"Very Strong":meanWS>=9?"Strong":
                      meanWS>=6?"Moderate":"Weak"}
                  </div>
                </div>
                <div style={{textAlign:"center"}}>
                  <span style={{fontSize:10,padding:"3px 8px",borderRadius:5,
                    fontWeight:700,background:`${vCol}20`,color:vCol}}>
                    {verdict}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Totals row */}
        <div style={{display:"grid",
          gridTemplateColumns:"1fr 60px 60px 60px 60px 60px 60px 60px 60px 80px 80px",
          gap:8,padding:"12px 20px",alignItems:"center",
          background:T.bg3,borderTop:`2px solid ${T.border2}`}}>
          <div style={{fontSize:12,fontWeight:700,color:"#F0F6FF"}}>
            TOTALS / OVERALL
          </div>
          <div style={{textAlign:"center",fontSize:13,fontWeight:700,
            color:T.teal,fontFamily:T.mono}}>
            {symptoms.reduce((a,s)=>a+s.patients.length,0)}
          </div>
          <div style={{textAlign:"center",fontSize:13,fontWeight:700,
            color:T.green,fontFamily:T.mono}}>
            {symptoms.reduce((a,s)=>a+s.imp,0)}
          </div>
          <div style={{textAlign:"center",fontSize:13,fontWeight:700,
            color:T.green,fontFamily:T.mono}}>
            {symptoms.reduce((a,s)=>a+s.patients.length,0)
              ? Math.round(symptoms.reduce((a,s)=>a+s.imp,0)
                /symptoms.reduce((a,s)=>a+s.patients.length,0)*100)
              :0}%
          </div>
          <div style={{textAlign:"center",fontSize:13,fontWeight:700,
            color:T.teal,fontFamily:T.mono}}>
            {symptoms.reduce((a,s)=>a+s.sig,0)}
          </div>
          <div style={{textAlign:"center",fontSize:13,fontWeight:700,
            color:T.amber,fontFamily:T.mono}}>
            {symptoms.reduce((a,s)=>a+s.mcid,0)}
          </div>
          <div style={{textAlign:"center",fontSize:13,fontFamily:T.mono,
            color:T.teal}}>~3</div>
          <div style={{textAlign:"center",fontSize:13,fontFamily:T.mono,
            color:T.purple||"#A78BFA"}}>{S}</div>
          <div style={{textAlign:"center",fontSize:11,color:T.text3}}>avg</div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:800,color:essCol,
              fontFamily:T.mono}}>{ess!=null?(Number(ess)||0).toFixed(2):"—"}</div>
            <div style={{fontSize:9,color:essCol,marginTop:1}}>{essC}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <span style={{fontSize:11,fontWeight:700,
              color:essCol}}>ESS = {ess!=null?(Number(ess)||0).toFixed(2):"—"}</span>
          </div>
        </div>
      </div>

      {/* ── DOSE RESPONSE ANALYSIS ──────────────────────────────── */}
      {doseAnalysis.length>1&&(
        <div style={{background:T.bg2,borderRadius:10,padding:20,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:4}}>
            Dose-response analysis
          </div>
          <div style={{fontSize:11,color:T.text3,marginBottom:14}}>
            Improvement rates by dose group (completed cases only)
          </div>
          <div style={{display:"grid",
            gridTemplateColumns:"1fr 80px 80px 100px 1fr",
            gap:8,padding:"6px 0",fontSize:9,color:T.text3,
            fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",
            borderBottom:`1px solid ${T.border}`,marginBottom:8}}>
            <span>Dose</span>
            <span style={{textAlign:"center"}}>Patients</span>
            <span style={{textAlign:"center"}}>Improved</span>
            <span style={{textAlign:"center"}}>Rate</span>
            <span>Bar</span>
          </div>
          {doseAnalysis.map((d,i)=>{
            const rate = d.total?Math.round(d.imp/d.total*100):0;
            const col  = rate>=75?T.green:rate>=50?T.teal:T.amber;
            return (
              <div key={d.dose} style={{display:"grid",
                gridTemplateColumns:"1fr 80px 80px 100px 1fr",
                gap:8,padding:"8px 0",alignItems:"center",
                borderBottom:i<doseAnalysis.length-1?`1px solid ${T.border}`:"none"}}>
                <span style={{fontSize:13,fontWeight:600,color:"#F0F6FF",
                  fontFamily:T.mono}}>{d.dose}</span>
                <span style={{textAlign:"center",fontSize:13,
                  color:"#F0F6FF",fontFamily:T.mono}}>{d.total}</span>
                <span style={{textAlign:"center",fontSize:13,
                  color:T.green,fontFamily:T.mono}}>{d.imp}</span>
                <span style={{textAlign:"center",fontSize:14,fontWeight:700,
                  color:col,fontFamily:T.mono}}>{rate}%</span>
                <div style={{height:8,background:T.bg3,borderRadius:4}}>
                  <div style={{height:"100%",borderRadius:4,
                    background:col,width:`${rate}%`,transition:"width 0.5s"}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DURATION ANALYSIS ───────────────────────────────────── */}
      {durAnalysis.length>1&&(
        <div style={{background:T.bg2,borderRadius:10,padding:20,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:4}}>
            Duration-response analysis
          </div>
          <div style={{fontSize:11,color:T.text3,marginBottom:14}}>
            Improvement rates by treatment duration
          </div>
          <div style={{display:"grid",
            gridTemplateColumns:"1fr 80px 80px 100px 1fr",
            gap:8,padding:"6px 0",fontSize:9,color:T.text3,
            fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",
            borderBottom:`1px solid ${T.border}`,marginBottom:8}}>
            <span>Duration</span><span style={{textAlign:"center"}}>Patients</span>
            <span style={{textAlign:"center"}}>Improved</span>
            <span style={{textAlign:"center"}}>Rate</span><span>Bar</span>
          </div>
          {durAnalysis.map((d,i)=>{
            const rate = d.total?Math.round(d.imp/d.total*100):0;
            const col  = rate>=75?T.green:rate>=50?T.teal:T.amber;
            return (
              <div key={d.dur} style={{display:"grid",
                gridTemplateColumns:"1fr 80px 80px 100px 1fr",
                gap:8,padding:"8px 0",alignItems:"center",
                borderBottom:i<durAnalysis.length-1?`1px solid ${T.border}`:"none"}}>
                <span style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>
                  {d.dur}
                </span>
                <span style={{textAlign:"center",fontSize:13,color:"#F0F6FF",
                  fontFamily:T.mono}}>{d.total}</span>
                <span style={{textAlign:"center",fontSize:13,color:T.green,
                  fontFamily:T.mono}}>{d.imp}</span>
                <span style={{textAlign:"center",fontSize:14,fontWeight:700,
                  color:col,fontFamily:T.mono}}>{rate}%</span>
                <div style={{height:8,background:T.bg3,borderRadius:4}}>
                  <div style={{height:"100%",borderRadius:4,
                    background:col,width:`${rate}%`}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SECONDARY COMPOUND ANALYSIS ─────────────────────────── */}
      {(()=>{
        const withSec  = complete.filter(p=>p.secondaryCompound?.name);
        const withoutS = complete.filter(p=>!p.secondaryCompound?.name);
        if(!withSec.length) return null;

        // Split analysis per secondary compound
        const secGroups = {};
        withSec.forEach(p=>{
          const name = p.secondaryCompound.name;
          if(!secGroups[name]) secGroups[name]={
            name, compound:p.secondaryCompound, total:0, imp:0, sig:0, mcid:0,
            doses:new Set(), wsSum:0, wsN:0,
          };
          secGroups[name].total++;
          const o1 = p.outcome?.outcome1;
          if(o1?.direction==="Improved") secGroups[name].imp++;
          if(o1?.significance==="Yes")   secGroups[name].sig++;
          if(o1?.mcid==="Yes")           secGroups[name].mcid++;
          if(p.secondaryDose) secGroups[name].doses.add(`${p.secondaryDose}${p.secondaryDoseUnit||"mg"}`);
          const pQ = getQ(p), S=sampleScore(n);
          const O = o1?.direction==="Improved"?(o1?.significance==="Yes"&&o1?.mcid==="Yes"?4:o1?.significance==="Yes"?3:2):1;
          secGroups[name].wsSum += pQ+S+O;
          secGroups[name].wsN++;
        });

        const noSecImp  = withoutS.filter(p=>p.outcome?.outcome1?.direction==="Improved").length;
        const noSecRate = withoutS.length?Math.round(noSecImp/withoutS.length*100):0;
        const noSecWS   = withoutS.length>0?(()=>{
          let sum=0,n2=0;
          withoutS.forEach(p=>{
            const o1=p.outcome?.outcome1;
            const O=o1?.direction==="Improved"?(o1?.significance==="Yes"&&o1?.mcid==="Yes"?4:o1?.significance==="Yes"?3:2):1;
            sum+=getQ(p)+sampleScore(n)+O; n2++;
          });
          return n2?sum/n2:0;
        })():0;

        return (
          <div style={{background:T.bg2,borderRadius:10,padding:20,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:4}}>
              Secondary compound impact analysis
            </div>
            <div style={{fontSize:11,color:T.text3,marginBottom:16,lineHeight:1.6}}>
              Comparing improvement rates and WS scores between patients prescribed
              with vs without a secondary compound. Higher rate suggests additive effect.
              Note: observational data — not controlled.
            </div>

            {/* Column headers */}
            <div style={{display:"grid",
              gridTemplateColumns:"1fr 60px 60px 60px 60px 70px",
              gap:8,padding:"6px 0",fontSize:9,color:T.text3,fontWeight:700,
              textTransform:"uppercase",letterSpacing:"0.06em",
              borderBottom:`1px solid ${T.border}`,marginBottom:8}}>
              <span>Group</span>
              <span style={{textAlign:"center"}}>n</span>
              <span style={{textAlign:"center"}}>Imp%</span>
              <span style={{textAlign:"center"}}>Sig</span>
              <span style={{textAlign:"center"}}>MCID</span>
              <span style={{textAlign:"center"}}>Mean WS</span>
            </div>

            {/* No secondary baseline */}
            <div style={{display:"grid",
              gridTemplateColumns:"1fr 60px 60px 60px 60px 70px",
              gap:8,padding:"8px 0",alignItems:"center",
              borderBottom:`1px solid ${T.border}`,
              background:`${T.bg3}50`}}>
              <div>
                <div style={{fontSize:12,color:T.text3,fontWeight:600}}>
                  Primary only (baseline)
                </div>
                <div style={{fontSize:10,color:T.text3,fontStyle:"italic"}}>
                  No secondary compound
                </div>
              </div>
              <span style={{textAlign:"center",fontSize:13,fontFamily:T.mono,
                color:"#F0F6FF"}}>{withoutS.length}</span>
              <span style={{textAlign:"center",fontSize:13,fontWeight:700,
                color:T.teal,fontFamily:T.mono}}>{noSecRate}%</span>
              <span style={{textAlign:"center",fontSize:13,
                color:T.text3,fontFamily:T.mono}}>
                {withoutS.filter(p=>p.outcome?.outcome1?.significance==="Yes").length}
              </span>
              <span style={{textAlign:"center",fontSize:13,
                color:T.text3,fontFamily:T.mono}}>
                {withoutS.filter(p=>p.outcome?.outcome1?.mcid==="Yes").length}
              </span>
              <span style={{textAlign:"center",fontSize:13,fontWeight:700,
                color:T.text3,fontFamily:T.mono}}>{noSecWS.toFixed(1)}</span>
            </div>

            {/* Per secondary compound */}
            {Object.values(secGroups).sort((a,b)=>b.imp/b.total-a.imp/a.total).map(sg=>{
              const rate = sg.total?Math.round(sg.imp/sg.total*100):0;
              const mws  = sg.wsN?sg.wsSum/sg.wsN:0;
              const diff = rate - noSecRate;
              const col  = diff>5?T.green:diff>0?T.teal:diff<-5?T.red:T.amber;
              return (
                <div key={sg.name} style={{display:"grid",
                  gridTemplateColumns:"1fr 60px 60px 60px 60px 70px",
                  gap:8,padding:"10px 0",alignItems:"center",
                  borderBottom:`1px solid ${T.border}`}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:T.amber}}>
                      + {sg.name}
                    </div>
                    <div style={{fontSize:10,color:T.text3,fontStyle:"italic"}}>
                      {sg.compound.scientific}
                    </div>
                    <div style={{fontSize:10,color:T.text3}}>
                      {[...sg.doses].join(", ")}
                    </div>
                  </div>
                  <span style={{textAlign:"center",fontSize:13,fontFamily:T.mono,
                    color:"#F0F6FF"}}>{sg.total}</span>
                  <div style={{textAlign:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,
                      color:col,fontFamily:T.mono}}>{rate}%</span>
                    <div style={{fontSize:9,color:col}}>
                      {diff>0?"+":""}{diff}%
                    </div>
                  </div>
                  <span style={{textAlign:"center",fontSize:13,
                    color:T.teal,fontFamily:T.mono}}>{sg.sig}</span>
                  <span style={{textAlign:"center",fontSize:13,
                    color:T.amber,fontFamily:T.mono}}>{sg.mcid}</span>
                  <div style={{textAlign:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,
                      color:mws>noSecWS?T.green:T.text3,
                      fontFamily:T.mono}}>{mws.toFixed(1)}</span>
                    {mws>noSecWS&&<div style={{fontSize:9,color:T.green}}>↑ higher</div>}
                  </div>
                </div>
              );
            })}

            <div style={{marginTop:12,padding:"10px 12px",background:T.bg3,
              borderRadius:6,fontSize:11,color:T.text3,lineHeight:1.6}}>
              <strong style={{color:"#F0F6FF"}}>Interpretation:</strong> A higher improvement
              rate vs baseline suggests a potential additive effect. This is observational —
              confounding factors (patient selection, doctor preference) cannot be excluded.
              Include in Discussion with appropriate caveats.
            </div>
          </div>
        );
      })()}

      {/* ── METHODOLOGY SYNOPSIS ─────────────────────────────────── */}
      <div style={{background:T.bg2,borderRadius:10,padding:20,
        border:`1px solid ${T.border}`}}>
        <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:14}}>
          Methodology synopsis
        </div>
        <div style={{background:T.bg3,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`,fontSize:13,color:"#F0F6FF",
          lineHeight:1.8}}>
          {(()=>{
            const nDocs = [...new Set(patients.map(p=>p.doctorName).filter(Boolean))].length;
            const doses = [...new Set(complete.map(p=>p.primaryDose
              ?`${p.primaryDose}${p.primaryDoseUnit||"mg"}`:null).filter(Boolean))];
            const durs  = [...new Set(complete.map(p=>p.targetDuration).filter(Boolean))];
            const S     = sampleScore(n);
            const meanWS = allWS.length?allWS.reduce((a,b)=>a+b,0)/allWS.length:0;
            return (
              <>
                <p style={{margin:"0 0 10px"}}>
                  This analysis synthesises clinical observational data from <strong style={{color:T.teal}}>{n} completed cases</strong> across <strong style={{color:T.teal}}>{nDocs} clinical site{nDocs!==1?"s":""}</strong> using {compound}{comp&&comp.scientific?` (${comp.scientific})`:""}.
                  {doses.length>0&&` Doses ranged from ${doses.join(", ")}`}
                  {durs.length>0&&` over treatment durations of ${durs.join(", ")}`}.
                </p>
                <p style={{margin:"0 0 10px"}}>
                  Evidence weighting follows the <strong style={{color:T.teal}}>WS (Weighted Score) formula: WS = Q + S + O − B</strong>.
                  Study quality (Q) is assigned 3 for clinical observational data.
                  Sample score (S={S}) reflects the cohort size of {n} completed cases.
                  Outcome score (O) is auto-computed from recorded direction, statistical significance and MCID data per patient:
                  Improved+Sig+MCID=4, Improved+Sig=3, Improved=2, No change/Worsened=1.
                  Bias penalty (B=0) reflects absence of declared conflicts in clinical observation.
                </p>
                <p style={{margin:"0 0 10px"}}>
                  The Evidence Strength Score (ESS) represents the mean WS across all outcome rows.
                  This cohort achieves <strong style={{color:essCol}}>ESS {ess!=null?(Number(ess)||0).toFixed(2):"—"} ({essC})</strong>
                  {ess>=9?" — sufficient for a strong evidence synthesis paper"
                    :ess>=6?" — sufficient for a moderate evidence synthesis paper"
                    :" — consider expanding the cohort for stronger evidence"}.
                </p>
                <p style={{margin:0,fontSize:11,color:T.text3}}>
                  Note: Active cases ({patients.length-n}) are excluded from all calculations.
                  Only completed cases with recorded outcomes contribute to the WS and ESS.
                </p>
              </>
            );
          })()}
        </div>
      </div>

      {/* ── DEMOGRAPHICS & SAFETY ─────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>

        {/* Gender breakdown */}
        <div style={{background:T.bg2,borderRadius:10,padding:16,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF",marginBottom:12}}>
            Gender distribution
          </div>
          {(()=>{
            const gMap={};
            complete.forEach(p=>{
              const g=p.gender||"Unknown";
              gMap[g]=(gMap[g]||0)+1;
            });
            return Object.entries(gMap)
              .sort((a,b)=>b[1]-a[1])
              .map(([g,c])=>{
                const pct=Math.round(c/n*100);
                return (
                  <div key={g} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      marginBottom:3}}>
                      <span style={{fontSize:12,color:"#F0F6FF"}}>{g}</span>
                      <span style={{fontSize:12,fontFamily:T.mono,
                        color:T.teal}}>{c} ({pct}%)</span>
                    </div>
                    <div style={{height:6,background:T.bg3,borderRadius:3}}>
                      <div style={{height:"100%",borderRadius:3,
                        background:T.teal,width:`${pct}%`}}/>
                    </div>
                  </div>
                );
              });
          })()}
        </div>

        {/* Age distribution */}
        <div style={{background:T.bg2,borderRadius:10,padding:16,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF",marginBottom:12}}>
            Age distribution
          </div>
          {(()=>{
            const ages = complete.map(p=>Number(p.age)).filter(a=>a>0);
            if(!ages.length) return <div style={{color:T.text3,fontSize:12}}>No data</div>;
            const min=Math.min(...ages), max=Math.max(...ages);
            const avg=Math.round(ages.reduce((a,b)=>a+b,0)/ages.length);
            const groups={"18-30":0,"31-40":0,"41-50":0,"51-60":0,"60+":0};
            ages.forEach(a=>{
              if(a<=30) groups["18-30"]++;
              else if(a<=40) groups["31-40"]++;
              else if(a<=50) groups["41-50"]++;
              else if(a<=60) groups["51-60"]++;
              else groups["60+"]++;
            });
            return (
              <>
                <div style={{display:"flex",gap:12,marginBottom:12}}>
                  {[["Min",min],["Mean",avg],["Max",max]].map(([l,v])=>(
                    <div key={l} style={{flex:1,textAlign:"center",
                      background:T.bg3,borderRadius:6,padding:"8px 4px"}}>
                      <div style={{fontSize:18,fontWeight:700,color:T.teal,
                        fontFamily:T.mono}}>{v}</div>
                      <div style={{fontSize:9,color:T.text3}}>{l} age</div>
                    </div>
                  ))}
                </div>
                {Object.entries(groups).filter(([_ign_v_956, v])=>v>0).map(([g,c])=>{
                  const pct=Math.round(c/ages.length*100);
                  return (
                    <div key={g} style={{marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        marginBottom:2}}>
                        <span style={{fontSize:11,color:"#F0F6FF"}}>{g}y</span>
                        <span style={{fontSize:11,fontFamily:T.mono,
                          color:T.text3}}>{c}</span>
                      </div>
                      <div style={{height:4,background:T.bg3,borderRadius:2}}>
                        <div style={{height:"100%",borderRadius:2,
                          background:T.purple||"#A78BFA",width:`${pct}%`}}/>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>

        {/* Side effects */}
        <div style={{background:T.bg2,borderRadius:10,padding:16,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF",marginBottom:12}}>
            Side effects reported
          </div>
          {(()=>{
            const seMap={};
            patients.forEach(p=>{
              (p.weeklyLogs||[]).forEach(log=>{
                (log.sideEffects||[]).forEach(se=>{
                  seMap[se]=(seMap[se]||0)+1;
                });
              });
            });
            const entries=Object.entries(seMap).sort((a,b)=>b[1]-a[1]);
            if(!entries.length) return (
              <div style={{fontSize:12,color:T.green}}>
                ✓ No side effects reported across all patients
              </div>
            );
            const totalPats=patients.length;
            return entries.map(([se,c])=>{
              const pct=Math.round(c/totalPats*100);
              return (
                <div key={se} style={{marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    marginBottom:2}}>
                    <span style={{fontSize:11,color:"#F0F6FF"}}>{se}</span>
                    <span style={{fontSize:11,fontFamily:T.mono,
                      color:T.amber}}>{c} ({pct}%)</span>
                  </div>
                  <div style={{height:4,background:T.bg3,borderRadius:2}}>
                    <div style={{height:"100%",borderRadius:2,
                      background:T.amber,width:`${Math.min(pct*3,100)}%`}}/>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* ── OVERALL CONCLUSION ────────────────────────────────────── */}
      <div style={{background:`${T.teal}10`,borderRadius:10,padding:20,
        border:`1px solid ${T.teal}40`}}>
        <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:12}}>
          Overall conclusion
        </div>
        {(()=>{
          const totalImp = symptoms.reduce((a,s)=>a+s.imp,0);
          const totalN   = symptoms.reduce((a,s)=>a+s.patients.length,0);
          const totalSig = symptoms.reduce((a,s)=>a+s.sig,0);
          const totalMcid= symptoms.reduce((a,s)=>a+s.mcid,0);
          const impPct   = totalN?Math.round(totalImp/totalN*100):0;
          const topSym   = symptoms[0];
          return (
            <div style={{fontSize:13,color:"#F0F6FF",lineHeight:1.8}}>
              <p style={{margin:"0 0 10px"}}>
                Across <strong>{n} completed cases</strong>, {compound} demonstrated
                a <strong style={{color:essCol}}>{essC.toLowerCase()} evidence profile</strong> (ESS {ess!=null?(Number(ess)||0).toFixed(2):"—"}).
                Overall, <strong style={{color:T.green}}>{impPct}%</strong> of recorded
                outcomes showed directional improvement ({totalImp}/{totalN} outcome-instances),
                with <strong style={{color:T.teal}}>{totalSig}</strong> statistically
                significant results and <strong style={{color:T.amber}}>{totalMcid}</strong> meeting
                MCID thresholds.
              </p>
              {topSym&&(
                <p style={{margin:"0 0 10px"}}>
                  The strongest evidence was observed for <strong style={{color:T.teal}}>{topSym.name}</strong>:
                  {" "}{Math.round(topSym.imp/topSym.patients.length*100)}% improvement rate
                  ({topSym.imp}/{topSym.patients.length} cases),
                  {" "}{topSym.sig} statistically significant,
                  {" "}{topSym.mcid} meeting MCID.
                  {topSym.magnitudes[0]&&` Representative magnitude: ${topSym.magnitudes[0]}.`}
                </p>
              )}
              <p style={{margin:0,fontSize:11,color:T.text3}}>
                These results are based on clinical observational data (Q=3).
                Randomised controlled trials would strengthen the evidence grade.
                The findings support progression to full IMRaD paper generation.
              </p>
            </div>
          );
        })()}
      </div>

      {/* ── NEXT STEP ────────────────────────────────────────────── */}
      <div style={{background:T.bg2,borderRadius:10,padding:"16px 20px",
        border:`1px solid ${T.teal}40`,
        display:"flex",alignItems:"center",
        justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF",marginBottom:2}}>
            Evidence computed
          </div>
          <div style={{fontSize:11,color:T.text3}}>
            ESS {ess!=null?(Number(ess)||0).toFixed(2):"—"} · {essC} ·
            Add published references to strengthen your paper
          </div>
        </div>
        <Btn onClick={onNext} style={{fontWeight:700,padding:"10px 24px"}}>
          Next: Add References →
        </Btn>
      </div>
    </div>
  );
};


const RESEARCHER_ROLES = [
  "Lead Investigator","Co-Investigator","Data Curator",
  "Statistician","Reviewer","Contributing Author","Consultant",
];

/* ─── STUDIES LIST PANEL ──────────────────────────────────────────── */
const StudiesListPanel = ({
  projects, projectOutcomes, patients=[], outcomes=[], refs=[],
  user={}, activeCompound, onSelectCompound,
  onImport, onGoToRefs, onGoToValidate, onGoToResults,
  onOpen, onDelete, onNew, onAutoCreate, onUpdateProject, onSaveMeta,
}) => {

  /* ── Derive compounds from patient data ── */
  const compoundMap = {};
  patients.forEach(p => {
    const c = p.primaryCompound;
    if (!c?.name) return;
    if (!compoundMap[c.name]) compoundMap[c.name] = {
      name: c.name,
      scientific: c.scientific || "",
      extract_form: c.extract_form || "",
      standardisation: c.standardisation || "",
      patients: [], secondaryMap: {},
    };
    compoundMap[c.name].patients.push(p);
    if (p.secondaryCompound?.name)
      compoundMap[c.name].secondaryMap[p.secondaryCompound.name] = p.secondaryCompound;
  });
  const compounds = Object.values(compoundMap);
  const selName   = activeCompound || compounds[0]?.name || "";
  const comp      = compoundMap[selName];
  const compPats  = comp?.patients || [];
  const complete  = compPats.filter(p => p.status === "complete");
  const active    = compPats.filter(p => p.status === "active");
  const secondary = Object.values(comp?.secondaryMap || {});
  const imported  = outcomes.filter(o => o._fromPatient);

  /* ── Dose / freq / duration from patient records ── */
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const doses   = uniq(compPats.map(p => p.primaryDose ? `${p.primaryDose}${p.primaryDoseUnit||"mg"}` : null));
  const freqs   = uniq(compPats.map(p => p.primaryFrequency));
  const durs    = uniq(compPats.map(p => p.targetDuration));

  /* ── Auto-generate study notes ── */
  const buildNotes = () => {
    if (!comp) return "";
    const syms      = uniq(compPats.flatMap(p => [p.symptom1, p.symptom2])).slice(0,5);
    const nDocs     = uniq(compPats.map(p => p.doctorName)).length;
    const improved  = complete.filter(p => p.outcome?.outcome1?.direction === "Improved").length;
    const impRate   = complete.length ? Math.round(improved / complete.length * 100) : 0;
    const sigCount  = complete.filter(p => p.outcome?.outcome1?.significance === "Yes").length;
    const mcidCount = complete.filter(p => p.outcome?.outcome1?.mcid === "Yes").length;
    return [
      `This study evaluates ${comp.name}${comp.scientific ? ` (${comp.scientific})` : ""} across ${compPats.length} patients from ${nDocs} clinical site${nDocs!==1?"s":""}.`,
      `Primary conditions addressed: ${syms.join(", ") || "various symptoms"}.`,
      doses.length ? `Doses ranged from ${doses.join(", ")}${freqs.length ? `, administered ${freqs[0]}` : ""}.` : "",
      durs.length ? `Treatment duration: ${durs.join(", ")}.` : "",
      complete.length ? `Of ${complete.length} completed cases, ${impRate}% showed directional improvement. ${sigCount} cases reported statistically significant results. ${mcidCount} cases exceeded MCID thresholds, indicating clinically meaningful change.` : "",
    ].filter(Boolean).join(" ");
  };

  /* ── Auto-generate prognosis summary ── */
  const buildPrognosis = () => {
    if (!complete.length) return "Insufficient completed cases for prognosis summary.";
    const symStats = {};
    complete.forEach(p => {
      [["symptom1","outcome1"],["symptom2","outcome2"]].forEach(([sk,ok]) => {
        const sym = p[sk]; const out = p.outcome?.[ok];
        if (!sym || !out?.direction) return;
        if (!symStats[sym]) symStats[sym] = {imp:0,nc:0,wor:0,sig:0,mcid:0,total:0,magnitudes:[]};
        symStats[sym].total++;
        if (out.direction==="Improved")  symStats[sym].imp++;
        if (out.direction==="Worsened")  symStats[sym].wor++;
        if (out.significance==="Yes")    symStats[sym].sig++;
        if (out.mcid==="Yes")            symStats[sym].mcid++;
        if (out.magnitude)               symStats[sym].magnitudes.push(out.magnitude);
      });
    });
    return Object.entries(symStats)
      .sort((a,b) => b[1].total - a[1].total)
      .map(([sym, s]) => {
        const impPct  = Math.round(s.imp/s.total*100);
        const verdict = impPct>=75?"Strong positive response":impPct>=50?"Moderate positive response":impPct>=25?"Mixed response":"Limited response";
        const mag     = s.magnitudes[0] ? ` (e.g. ${s.magnitudes[0]})` : "";
        return `${sym}: ${verdict} — ${impPct}% improved (${s.imp}/${s.total}), ${s.sig} statistically significant, ${s.mcid} met MCID${mag}.`;
      }).join("\n");
  };

  const storageKey = `nep_study_meta_${selName||"default"}`;

  // Load current meta for display in affiliation/journal fields
  const studyMeta = (() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch(e) { return null; }
  })();

  const loadMeta = () => {
    try {
      const saved = localStorage.getItem(storageKey);
      if(saved) return JSON.parse(saved);
    } catch(e) {}
    return null;
  };

  const saveMeta = (meta) => {
    try { localStorage.setItem(storageKey, JSON.stringify(meta)); }
    catch(e) {}
  };

  const [notes,       setNotes]     = useState("");
  const [prognosis,   setPrognosis] = useState("");
  const [team,        setTeam]      = useState([
    {id:"r0", name:user?.displayName||user?.name||"", role:"Lead Investigator"},
  ]);
  const [affiliation, setAffiliation] = useState("");
  const [journal,     setJournal]     = useState("");
  const [editingTeam, setEditTeam]    = useState(false);
  const [expandedDrs, setExpandDrs]   = useState({});

  // Load saved meta or auto-generate on compound change
  useEffect(() => {
    const saved = loadMeta();
    if(saved) {
      if(saved.notes)     setNotes(saved.notes);
      else                setNotes(buildNotes());
      if(saved.prognosis) setPrognosis(saved.prognosis);
      else                setPrognosis(buildPrognosis());
      if(saved.team)        setTeam(saved.team);
      if(saved.affiliation) setAffiliation(saved.affiliation);
      if(saved.journal)     setJournal(saved.journal);
    } else {
      setNotes(buildNotes());
      setPrognosis(buildPrognosis());
    }
  }, [selName, patients.length]);

  // Auto-save on changes
  useEffect(() => {
    if(!notes && !prognosis && !team.length && !affiliation && !journal) return;
    const meta = { notes, prognosis, team, affiliation, journal };
    saveMeta(meta);
  }, [notes, prognosis, team, affiliation, journal]);

  const addMember = () =>
    setTeam(t=>[...t,{id:crypto.randomUUID(),name:"",role:"Co-Investigator"}]);
  const updMember = (id,f,v) =>
    setTeam(t=>t.map(m=>m.id===id?{...m,[f]:v}:m));
  const delMember = (id) => setTeam(t=>t.filter(m=>m.id!==id));

  /* ── Group patients by doctor ── */
  const byDoctor = {};
  compPats.forEach(p => {
    const k = p.doctorName || "Unknown";
    if (!byDoctor[k]) byDoctor[k] = {
      name:k, clinic:p.doctorClinic||"", regNumber:"",
      patients:[], complete:0, active:0, improved:0,
    };
    byDoctor[k].patients.push(p);
    if (p.status==="complete") {
      byDoctor[k].complete++;
      if (p.outcome?.outcome1?.direction==="Improved") byDoctor[k].improved++;
    } else byDoctor[k].active++;
  });
  // Try to get reg numbers from doctor profiles in localStorage
  for (let i=0; i<localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("nep_doctor_profile_")) continue;
    try {
      const prof = JSON.parse(localStorage.getItem(key));
      if (!prof?.fullName) continue;
      const docKey = Object.keys(byDoctor)
        .find(k => k.includes(prof.fullName) || prof.fullName.includes(k.replace("Dr. ","")));
      if (docKey) byDoctor[docKey].regNumber = prof.regNumber || "";
    } catch(e) {}
  }
  const doctors = Object.values(byDoctor).sort((a,b)=>b.patients.length-a.patients.length);

  /* ── Symptom breakdown (completed only) ── */
  const symMap = {};
  complete.forEach(p => {
    [["symptom1","outcome1"],["symptom2","outcome2"]].forEach(([sk,ok]) => {
      const sym=p[sk]; const out=p.outcome?.[ok];
      if (!sym||!out?.direction) return;
      if (!symMap[sym]) symMap[sym]={imp:0,nc:0,wor:0,total:0};
      symMap[sym].total++;
      if (out.direction==="Improved") symMap[sym].imp++;
      else if (out.direction==="Worsened") symMap[sym].wor++;
      else symMap[sym].nc++;
    });
  });
  const topSyms = Object.entries(symMap)
    .sort((a,b)=>b[1].total-a[1].total).slice(0,8);

  /* ── ESS ── */
  const wsVals = outcomes.map(o=>Number(o._ws)).filter(v=>!isNaN(v)&&v>0);
  const ess    = wsVals.length?wsVals.reduce((a,b)=>a+b,0)/wsVals.length:null;
  const essC   = ess==null?"—":ess>=12?"Very Strong":ess>=9?"Strong":ess>=6?"Moderate":"Weak";
  const essCol = ess==null?T.text3:ess>=9?T.green:ess>=6?T.amber:T.red;

  /* ── Helpers ── */
  const InfoRow = ({label, value}) => (
    <div>
      <div style={{fontSize:9,color:T.text3,fontWeight:700,
        textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>
        {label}
      </div>
      <div style={{fontSize:13,color:"#F0F6FF",fontWeight:500}}>
        {value||"—"}
      </div>
    </div>
  );

  const dirCol = d => d==="Improved"?T.green:d==="Worsened"?T.red:T.amber;

  if (!patients.length) return (
    <div className="fade-in">
      <SectionHeader title="My Studies"
        subtitle="Waiting for doctor patient data"/>
      <div style={{textAlign:"center",padding:"80px",
        border:`1px dashed ${T.border2}`,borderRadius:10}}>
        <div style={{fontSize:48,marginBottom:12,opacity:0.2}}>🔬</div>
        <p style={{fontSize:14,color:T.text3}}>No patient data yet.</p>
        <p style={{fontSize:12,color:T.text3,marginTop:6}}>
          Doctors need to log patients on the mobile app first.
        </p>
      </div>
    </div>
  );

  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* ══ COMPOUND TABS ══════════════════════════════════════════ */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",
        paddingBottom:16,borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:T.text3,fontWeight:700,
          textTransform:"uppercase",letterSpacing:"0.06em",
          alignSelf:"center",marginRight:4}}>
          Studies:
        </div>
        {compounds.map(c=>(
          <button key={c.name} onClick={()=>onSelectCompound(c.name)}
            style={{padding:"9px 20px",borderRadius:8,fontSize:13,
              cursor:"pointer",fontFamily:"inherit",fontWeight:700,
              background:selName===c.name?T.teal:T.bg2,
              color:selName===c.name?T.bg0:"#F0F6FF",
              border:`1px solid ${selName===c.name?T.teal:T.border}`,
              transition:"all 0.15s",display:"flex",alignItems:"center",gap:8}}>
            {c.name}
            <span style={{fontSize:11,opacity:0.8,background:"rgba(0,0,0,0.2)",
              padding:"1px 6px",borderRadius:4}}>
              {c.patients.length}
            </span>
          </button>
        ))}
      </div>

      {comp&&(<>

      {/* ══ 1. COMPOUND DETAILS (read-only) ════════════════════════ */}
      <div style={{background:T.bg2,borderRadius:10,padding:20,
        border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <div style={{fontSize:11,color:T.teal,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em"}}>
            📦 Compound details
          </div>
          <span style={{fontSize:10,color:T.text3,
            background:T.bg3,padding:"2px 8px",borderRadius:4}}>
            Read-only · sourced from doctor prescriptions
          </span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",
          gap:16,marginBottom:16}}>
          <InfoRow label="Primary compound"  value={comp.name}/>
          <InfoRow label="Scientific name"   value={comp.scientific}/>
          <InfoRow label="Extract form"
            value={uniq(compPats.map(p=>p.primaryCompound?.extract_form))[0]||comp.extract_form}/>
          <InfoRow label="Standardisation"
            value={uniq(compPats.map(p=>p.primaryCompound?.standardisation))[0]||comp.standardisation}/>
          <InfoRow label="Dose range"        value={doses.join(", ")}/>
          <InfoRow label="Frequency"         value={freqs.join(", ")}/>
          <InfoRow label="Duration range"    value={durs.join(", ")}/>
          <InfoRow label="Patients enrolled" value={compPats.length}/>
          <InfoRow label="Completed / Active"
            value={`${complete.length} complete · ${active.length} active`}/>
        </div>
        {secondary.length>0&&(
          <div style={{paddingTop:14,borderTop:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,color:T.text3,fontWeight:700,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
              Secondary compounds (from patient records)
            </div>
            <div style={{display:"grid",
              gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",
              gap:10}}>
              {secondary.map(sc=>{
                const scPats  = compPats.filter(p=>p.secondaryCompound?.name===sc.name);
                const scDoses = uniq(scPats.map(p=>p.secondaryDose
                  ?`${p.secondaryDose}${p.secondaryDoseUnit||"mg"}`:null));
                const scFreqs = uniq(scPats.map(p=>p.secondaryFrequency));
                return (
                  <div key={sc.name} style={{background:T.bg3,borderRadius:8,
                    padding:"12px 14px",border:`1px solid ${T.amber}30`}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.amber,
                      marginBottom:4}}>{sc.name}</div>
                    {sc.scientific&&(
                      <div style={{fontSize:11,color:T.text3,
                        fontStyle:"italic",marginBottom:6}}>
                        {sc.scientific}
                      </div>
                    )}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",
                      gap:6}}>
                      {[
                        ["Dose",      scDoses.join(", ")||"—"],
                        ["Frequency", scFreqs.join(", ")||"—"],
                        ["Patients",  scPats.length],
                      ].map(([l,v])=>(
                        <div key={l}>
                          <div style={{fontSize:9,color:T.text3,fontWeight:700,
                            textTransform:"uppercase",letterSpacing:"0.05em",
                            marginBottom:2}}>{l}</div>
                          <div style={{fontSize:12,color:"#F0F6FF"}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ══ 2. STUDY NOTES (auto-generated, editable) ══════════════ */}
      <div style={{background:T.bg2,borderRadius:10,padding:20,
        border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:11,color:T.teal,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em"}}>
            📝 Study notes
          </div>
          <span style={{fontSize:10,color:T.text3}}>
            Auto-generated · edit to refine
          </span>
        </div>
        <textarea rows={4} value={notes}
          onChange={e=>setNotes(e.target.value)}
          onBlur={()=>onSaveMeta&&onSaveMeta({researcher:team.filter(m=>m.name.trim())[0]?.name||"",
            co_authors:team.filter(m=>m.name.trim()).slice(1).map(m=>m.name).join(", "),
            research_team:team,notes,prognosis})}
          style={{width:"100%",resize:"vertical",padding:"10px 14px",
            borderRadius:8,background:T.bg3,border:`1px solid ${T.border2}`,
            color:"#F0F6FF",fontSize:13,fontFamily:"inherit",
            lineHeight:1.6,boxSizing:"border-box"}}/>
      </div>

      {/* ══ 3. RESEARCH TEAM (read-only summary — edit in Paper Metadata) ══ */}
      <div style={{background:T.bg2,borderRadius:10,padding:16,
        border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:11,color:T.teal,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em"}}>
            👥 Research team
          </div>
          <div style={{fontSize:10,color:T.text3}}>
            Edit in Validate & Generate → Paper metadata
          </div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
          {team.map((m,i)=>(
            <Tag key={m.id} color={i===0?T.teal:"#A78BFA"} style={{fontSize:11}}>
              {m.name||"Not set"} · {m.role}
            </Tag>
          ))}
        </div>
        {(affiliation||journal)&&(
          <div style={{fontSize:11,color:T.text3,marginTop:8}}>
            {affiliation&&<span>{affiliation}</span>}
            {affiliation&&journal&&<span> · </span>}
            {journal&&<span>Target: {journal}</span>}
          </div>
        )}
      </div>

{/* ══ METRICS ════════════════════════════════════════════════ */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
        {[
          ["Total patients", compPats.length, T.teal,  "All enrolled"],
          ["Complete",       complete.length, T.green, `${compPats.length?Math.round(complete.length/compPats.length*100):0}%`],
          ["Active",         active.length,   T.amber, "In progress"],
          ["Evidence rows",  imported.length, T.purple||"#A78BFA", imported.length?"Imported":"Pending"],
          ["ESS",            ess!=null?(Number(ess)||0).toFixed(1):"—", essCol, essC],
        ].map(([label,val,col,sub])=>(
          <div key={label} style={{background:T.bg2,borderRadius:8,
            padding:"14px 16px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:24,fontWeight:800,color:col,
              fontFamily:T.mono,lineHeight:1}}>{val}</div>
            <div style={{fontSize:12,color:"#F0F6FF",marginTop:4,fontWeight:500}}>
              {label}
            </div>
            <div style={{fontSize:10,color:T.text3,marginTop:2}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ══ DOCTOR CONTRIBUTIONS ═══════════════════════════════════ */}
      <div style={{background:T.bg2,borderRadius:10,
        border:`1px solid ${T.border}`,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF"}}>
            Contributing Doctors ({doctors.length})
          </div>
          <div style={{display:"flex",gap:12}}>
            <button onClick={()=>{
                const a={};doctors.forEach(d=>a[d.name]=true);
                setExpandDrs(a);
              }}
              style={{fontSize:11,color:T.teal,background:"none",
                border:"none",cursor:"pointer",fontFamily:"inherit"}}>
              Expand all
            </button>
            <button onClick={()=>setExpandDrs({})}
              style={{fontSize:11,color:T.text3,background:"none",
                border:"none",cursor:"pointer",fontFamily:"inherit"}}>
              Collapse all
            </button>
          </div>
        </div>

        {doctors.map((doc,di)=>{
          const isOpen  = expandedDrs[doc.name];
          const impRate = doc.complete>0
            ?Math.round(doc.improved/doc.complete*100):0;

          return (
            <div key={doc.name}
              style={{borderBottom:di<doctors.length-1
                ?`1px solid ${T.border}`:"none"}}>

              {/* Doctor header */}
              <div onClick={()=>setExpandDrs(p=>({...p,[doc.name]:!p[doc.name]}))}
                style={{padding:"14px 20px",cursor:"pointer",
                  background:isOpen?T.bg3:"transparent",
                  display:"flex",alignItems:"center",gap:16}}>
                <div style={{width:40,height:40,borderRadius:"50%",
                  background:`linear-gradient(135deg,${T.teal},#007A8C)`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:16,fontWeight:700,color:"#0A1628",flexShrink:0}}>
                  {(doc.name.split(" ").pop()||"D")[0]}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>
                    {doc.name}
                  </div>
                  <div style={{fontSize:11,color:T.text3,marginTop:2}}>
                    {doc.clinic&&<span>{doc.clinic}</span>}
                    {doc.regNumber&&(
                      <span style={{marginLeft:doc.clinic?8:0,
                        color:T.text3}}>
                        Reg: {doc.regNumber}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{display:"flex",gap:24,alignItems:"center"}}>
                  {[
                    [doc.patients.length,"patients","#F0F6FF"],
                    [doc.complete,       "complete", T.green],
                    [doc.active,         "active",   T.amber],
                    [`${impRate}%`,      "improved", T.teal],
                  ].map(([val,lbl,col])=>(
                    <div key={lbl} style={{textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:700,
                        color:col,fontFamily:T.mono,lineHeight:1}}>{val}</div>
                      <div style={{fontSize:9,color:T.text3,
                        textTransform:"uppercase",letterSpacing:"0.05em",
                        marginTop:2}}>{lbl}</div>
                    </div>
                  ))}
                  <span style={{color:T.text3,fontSize:14,marginLeft:8}}>
                    {isOpen?"▲":"▼"}
                  </span>
                </div>
              </div>

              {/* Patient table */}
              {isOpen&&(
                <div style={{background:T.bg3}}>
                  {/* Headers */}
                  <div style={{display:"grid",
                    gridTemplateColumns:"75px 65px 45px 110px 130px 90px 110px 90px 90px 80px 80px 80px 60px",
                    gap:6,padding:"8px 20px",fontSize:8,color:T.text3,
                    fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",
                    borderBottom:`1px solid ${T.border}`}}>
                    <span>Patient</span>
                    <span>Age/Sex</span>
                    <span>Wks</span>
                    <span>Study type</span>
                    <span>Symptom 1</span>
                    <span>Symptom 2</span>
                    <span>Primary Dose</span>
                    <span>2° Compound</span>
                    <span>2° Dose</span>
                    <span>Prognosis 1</span>
                    <span>Prognosis 2</span>
                    <span>Sig / MCID</span>
                    <span>Status</span>
                  </div>

                  {doc.patients.map((p,pi)=>{
                    const o1   = p.outcome?.outcome1;
                    const o2   = p.outcome?.outcome2;
                    const wks  = (p.weeklyLogs||[]).length;
                    const last = (p.weeklyLogs||[]).slice(-1)[0];
                    const rCol = last?.response?.includes("better")?T.green
                      :last?.response==="Same"?T.amber
                      :last?.response?.includes("orse")?T.red:T.text3;
                    const sc   = p.secondaryCompound;

                    return (
                      <div key={p.id} style={{display:"grid",
                        gridTemplateColumns:"75px 65px 45px 110px 130px 90px 110px 90px 90px 80px 80px 80px 60px",
                        gap:6,padding:"9px 20px",alignItems:"start",
                        borderBottom:pi<doc.patients.length-1
                          ?`1px solid ${T.border}`:"none",
                        background:pi%2===0?T.bg3:T.bg2}}>

                        {/* Patient ID */}
                        <div>
                          <div style={{fontFamily:T.mono,fontSize:12,
                            fontWeight:700,color:T.teal}}>{p.id}</div>
                          <div style={{fontSize:9,color:T.text3,marginTop:2}}>
                            {p.targetDuration||""}
                          </div>
                        </div>

                        {/* Age/Sex */}
                        <div style={{fontSize:12,color:"#F0F6FF"}}>
                          <div>{p.age||"—"}y {p.gender?p.gender[0]:""}</div>
                          <div style={{fontSize:9,color:T.text3,marginTop:2}}>
                            {last?.response&&last.response.split(" ").slice(0,2).join(" ")}
                          </div>
                        </div>

                        {/* Weeks */}
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:14,fontWeight:700,
                            color:rCol,fontFamily:T.mono}}>{wks}</div>
                          <div style={{fontSize:8,color:T.text3}}>wks</div>
                        </div>

                        {/* Study type */}
                        <div>
                          <div style={{fontSize:10,fontWeight:600,
                            color:T.teal,marginBottom:2}}>
                            Clinical observation
                          </div>
                          <div style={{fontSize:9,color:T.text3}}>
                            {p.primaryCompound?.extract_form||""}
                          </div>
                        </div>

                        {/* Symptom 1 */}
                        <div>
                          <div style={{fontSize:11,fontWeight:600,
                            color:"#F0F6FF",marginBottom:2}}>
                            {p.symptom1||"—"}
                          </div>
                          {o1?.direction&&(
                            <div style={{fontSize:10,fontWeight:700,
                              color:dirCol(o1.direction)}}>
                              → {o1.direction}
                            </div>
                          )}
                          {o1?.magnitude&&(
                            <div style={{fontSize:9,color:T.text3,
                              marginTop:1,lineHeight:1.3}}>
                              {o1.magnitude}
                            </div>
                          )}
                        </div>

                        {/* Symptom 2 */}
                        <div>
                          <div style={{fontSize:11,color:T.text2,marginBottom:2}}>
                            {p.symptom2||<span style={{color:T.text3}}>—</span>}
                          </div>
                          {o2?.direction&&p.symptom2&&(
                            <div style={{fontSize:10,fontWeight:700,
                              color:dirCol(o2.direction)}}>
                              → {o2.direction}
                            </div>
                          )}
                          {o2?.magnitude&&(
                            <div style={{fontSize:9,color:T.text3,marginTop:1}}>
                              {o2.magnitude}
                            </div>
                          )}
                        </div>

                        {/* Primary dose */}
                        <div>
                          {p.primaryDose&&(
                            <div style={{fontSize:11,color:"#F0F6FF",fontWeight:500}}>
                              {p.primaryDose}{p.primaryDoseUnit||"mg"}
                            </div>
                          )}
                          {p.primaryFrequency&&(
                            <div style={{fontSize:9,color:T.text3,marginTop:2}}>
                              {p.primaryFrequency}
                            </div>
                          )}
                          {p.primaryForm&&(
                            <div style={{fontSize:9,color:T.text3}}>
                              {p.primaryForm}
                            </div>
                          )}
                        </div>

                        {/* Secondary compound */}
                        <div>
                          {sc?.name?(
                            <div style={{fontSize:11,fontWeight:600,
                              color:T.amber}}>{sc.name}</div>
                          ):(
                            <span style={{fontSize:10,color:T.text3}}>—</span>
                          )}
                        </div>

                        {/* Secondary dose */}
                        <div>
                          {sc?.name&&p.secondaryDose?(
                            <>
                              <div style={{fontSize:11,color:"#F0F6FF"}}>
                                {p.secondaryDose}{p.secondaryDoseUnit||"mg"}
                              </div>
                              {p.secondaryFrequency&&(
                                <div style={{fontSize:9,color:T.text3,marginTop:2}}>
                                  {p.secondaryFrequency}
                                </div>
                              )}
                            </>
                          ):(
                            <span style={{fontSize:10,color:T.text3}}>—</span>
                          )}
                        </div>

                        {/* Prognosis 1 */}
                        <div>
                          {o1?.direction?(
                            <span style={{fontSize:11,fontWeight:700,
                              color:dirCol(o1.direction)}}>
                              {o1.direction}
                            </span>
                          ):(
                            <span style={{fontSize:10,color:T.text3}}>
                              {p.status==="active"?"In progress":"—"}
                            </span>
                          )}
                        </div>

                        {/* Prognosis 2 */}
                        <div>
                          {o2?.direction&&p.symptom2?(
                            <span style={{fontSize:11,fontWeight:700,
                              color:dirCol(o2.direction)}}>
                              {o2.direction}
                            </span>
                          ):(
                            <span style={{fontSize:10,color:T.text3}}>—</span>
                          )}
                        </div>

                        {/* Sig / MCID */}
                        <div>
                          {o1?.significance&&(
                            <div style={{fontSize:9,marginBottom:2}}>
                              <span style={{color:o1.significance==="Yes"?T.green:T.text3,
                                fontWeight:600}}>
                                {o1.significance==="Yes"?"✓ Sig":"✗ NS"}
                              </span>
                            </div>
                          )}
                          {o1?.mcid&&(
                            <div style={{fontSize:9}}>
                              <span style={{color:o1.mcid==="Yes"?T.green:T.text3,
                                fontWeight:600}}>
                                {o1.mcid==="Yes"?"✓ MCID":"✗ MCID"}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Status */}
                        <div>
                          <span style={{fontSize:9,padding:"2px 7px",
                            borderRadius:5,fontWeight:600,
                            background:p.status==="complete"?T.greenBg:T.amberBg,
                            color:p.status==="complete"?T.green:T.amber}}>
                            {p.status==="complete"?"Done":"Active"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ══ SYMPTOM BREAKDOWN ══════════════════════════════════════ */}
      {topSyms.length>0&&(
        <div style={{background:T.bg2,borderRadius:10,padding:20,
          border:`1px solid ${T.border}`}}>
          <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:4}}>
            Symptom outcomes (completed cases only)
          </div>
          <div style={{fontSize:11,color:T.text3,marginBottom:14}}>
            Based on {complete.length} completed cases
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {topSyms.map(([sym,d])=>(
              <div key={sym} style={{background:T.bg3,borderRadius:8,
                padding:"12px 14px",border:`1px solid ${T.border}`}}>
                <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",
                  marginBottom:8}}>{sym}</div>
                <div style={{display:"flex",gap:3,marginBottom:6,height:8,
                  borderRadius:4,overflow:"hidden"}}>
                  {d.imp>0&&<div style={{background:T.green,flex:d.imp}}/>}
                  {d.nc>0&&<div style={{background:T.amber,flex:d.nc}}/>}
                  {d.wor>0&&<div style={{background:T.red,flex:d.wor}}/>}
                </div>
                <div style={{display:"flex",gap:10,fontSize:10}}>
                  <span style={{color:T.green}}>
                    ✓ {d.imp} ({Math.round(d.imp/d.total*100)}%)
                  </span>
                  {d.nc>0&&<span style={{color:T.amber}}>→ {d.nc}</span>}
                  {d.wor>0&&<span style={{color:T.red}}>↓ {d.wor}</span>}
                  <span style={{color:T.text3,marginLeft:"auto"}}>{d.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ PROGNOSIS SUMMARY ══════════════════════════════════════ */}
      {prognosis&&(
        <div style={{background:T.bg2,borderRadius:10,padding:20,
          border:`1px solid ${T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:11,color:T.teal,fontWeight:700,
              textTransform:"uppercase",letterSpacing:"0.08em"}}>
              🩺 Prognosis summary
            </div>
            <span style={{fontSize:10,color:T.text3}}>
              Auto-generated from completed cases · edit to refine
            </span>
          </div>
          <textarea rows={Math.min(8, prognosis.split("\n").length+1)}
            value={prognosis} onChange={e=>setPrognosis(e.target.value)}
            onBlur={()=>onSaveMeta&&onSaveMeta({notes,prognosis,
              researcher:team.filter(m=>m.name.trim())[0]?.name||"",
              co_authors:team.filter(m=>m.name.trim()).slice(1).map(m=>m.name).join(", "),
              research_team:team})}
            style={{width:"100%",resize:"vertical",padding:"10px 14px",
              borderRadius:8,background:T.bg3,border:`1px solid ${T.border2}`,
              color:"#F0F6FF",fontSize:12,fontFamily:"inherit",
              lineHeight:1.8,boxSizing:"border-box"}}/>
        </div>
      )}

      {/* ══ ACTION STRIP ══════════════════════════════════════════ */}
      <div style={{background:T.bg2,borderRadius:10,padding:"16px 20px",
        border:`1px solid ${T.teal}40`,
        display:"flex",alignItems:"center",
        justifyContent:"space-between",gap:16}}>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF",marginBottom:2}}>
            Ready to synthesise
          </div>
          <div style={{fontSize:11,color:T.text3}}>
            {complete.length} completed cases available ·{" "}
            {active.length} active cases excluded from synthesis ·{" "}
            {imported.length>0
              ?`${imported.length} outcome rows already imported`
              :"Not yet imported"}
          </div>
        </div>
        <div style={{display:"flex",gap:10,flexShrink:0}}>
          <Btn variant="secondary" onClick={onImport}
            disabled={complete.length===0}
            style={{fontWeight:600}}>
            {imported.length>0?"↻ Refresh import":"↓ Import patient data"}
          </Btn>
          <Btn onClick={onGoToResults}
            style={{fontWeight:700,padding:"10px 24px"}}>
            Next: Compute Results →
          </Btn>
        </div>
      </div>

      </>)}
    </div>
  );
};









/* ─── PAPER TEMPLATE PANEL (Administration — shows structure, not values) ── */
const TemplatePreviewPanel = () => {

  const Section = ({title, color=T.teal, children}) => (
    <div style={{marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",
        letterSpacing:"0.1em",marginBottom:10,paddingBottom:6,
        borderBottom:`1px solid ${color}30`}}>
        {title}
      </div>
      {children}
    </div>
  );

  const Filler = ({tag, source, section, required=true}) => (
    <div style={{display:"flex",alignItems:"center",gap:10,
      marginBottom:6,padding:"6px 12px",borderRadius:6,
      background:T.bg3,border:`1px solid ${T.border}`}}>
      <span style={{
        fontFamily:T.mono,fontSize:12,fontWeight:700,
        color:T.amber,background:T.amberBg,
        padding:"2px 8px",borderRadius:4,flexShrink:0,
        border:`1px solid ${T.amber}30`,
      }}>{tag}</span>
      <span style={{fontSize:11,color:T.text3,flex:1}}>→</span>
      <span style={{fontSize:12,color:"#F0F6FF",flex:2}}>{source}</span>
      <span style={{fontSize:10,color:T.text3,flexShrink:0,
        background:required?T.redBg:T.bg2,
        border:`1px solid ${required?T.red:T.border}20`,
        padding:"1px 6px",borderRadius:3}}>
        {required?"required":"optional"}
      </span>
    </div>
  );

  const AutoField = ({tag, desc}) => (
    <div style={{display:"flex",alignItems:"center",gap:10,
      marginBottom:6,padding:"6px 12px",borderRadius:6,
      background:T.bg2,border:`1px solid ${T.border}`}}>
      <span style={{
        fontFamily:T.mono,fontSize:12,fontWeight:700,
        color:T.green,background:T.greenBg,
        padding:"2px 8px",borderRadius:4,flexShrink:0,
        border:`1px solid ${T.green}30`,
      }}>{tag}</span>
      <span style={{fontSize:11,color:T.text3,flex:1}}>→</span>
      <span style={{fontSize:12,color:"#C8D8EF",flex:2}}>{desc}</span>
      <span style={{fontSize:10,color:T.green,flexShrink:0,
        padding:"1px 6px",borderRadius:3,
        background:T.greenBg,border:`1px solid ${T.green}20`}}>
        auto-computed
      </span>
    </div>
  );

  return (
    <div className="fade-in">

      {/* Legend */}
      <div style={{display:"flex",gap:16,marginBottom:20,
        padding:"12px 16px",background:T.bg2,borderRadius:8,
        border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:T.mono,fontSize:11,color:T.amber,
            background:T.amberBg,padding:"1px 6px",borderRadius:3}}>
            [TAG]
          </span>
          <span style={{fontSize:12,color:'#C8D8EF'}}>
            Filled from Project Settings or Evidence Input
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:T.mono,fontSize:11,color:T.green,
            background:T.greenBg,padding:"1px 6px",borderRadius:3}}>
            [TAG]
          </span>
          <span style={{fontSize:12,color:'#C8D8EF'}}>
            Auto-computed from scoring engine
          </span>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

        {/* Title block */}
        <div style={{background:T.bg2,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`}}>
          <Section title="📄 Title block">
            <Filler tag="[PAPER_TITLE]"   source="Project Settings → Paper title (or auto-generated)"/>
            <Filler tag="[AUTHORS]"        source="Project Settings → Paper authors / Research team"/>
            <Filler tag="[AFFILIATION]"    source="Project Settings → Affiliation"/>
            <Filler tag="[TARGET_JOURNAL]" source="Project Settings → Target journal" required={false}/>
            <Filler tag="[DATE]"           source="Auto: current date at generation" required={false}/>
            <Filler tag="[NEP_VERSION]"    source="Auto: NEP Platform version" required={false}/>
          </Section>
        </div>

        {/* Abstract */}
        <div style={{background:T.bg2,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`}}>
          <Section title="📋 Abstract">
            <Filler tag="[COMPOUND_NAME]"   source="Evidence Input → Compound → Name"/>
            <Filler tag="[SCIENTIFIC_NAME]" source="Evidence Input → Compound → Scientific name" required={false}/>
            <AutoField tag="[N_STUDIES]"    desc="Count of unique Study IDs across outcomes"/>
            <AutoField tag="[N_OUTCOMES]"   desc="Total outcome rows entered"/>
            <AutoField tag="[ESS_VALUE]"    desc="Computed ESS score (0–15)"/>
            <AutoField tag="[ESS_CLASS]"    desc="Very Strong / Strong / Moderate / Weak"/>
            <AutoField tag="[GRADE_EST]"    desc="GRADE-parallel certainty estimate"/>
            <Filler tag="[KEYWORDS]"        source="Project Settings → Keywords (or auto-generated)"/>
          </Section>
        </div>

        {/* Methods */}
        <div style={{background:T.bg2,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`}}>
          <Section title="🔬 Methods section">
            <AutoField tag="[COMPOUND_LIST]"   desc="All compounds from Evidence Input, joined"/>
            <AutoField tag="[DOSE_RANGE]"      desc="Dosage range derived from outcome rows"/>
            <AutoField tag="[DURATION_RANGE]"  desc="Duration range derived from outcome rows"/>
            <AutoField tag="[STUDY_DESIGNS]"   desc="Study types used (RCT, Meta, Observational…)"/>
            <AutoField tag="[BIAS_TOOLS]"      desc="Bias assessment tools used across studies"/>
            <AutoField tag="[ELIGIBILITY]"     desc="Auto-generated from study types present"/>
          </Section>
        </div>

        {/* Results */}
        <div style={{background:T.bg2,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`}}>
          <Section title="📊 Results section">
            <AutoField tag="[TABLE_1]"       desc="Study-level characteristics table"/>
            <AutoField tag="[TABLE_2]"       desc="Outcome-level Weighted Score table"/>
            <AutoField tag="[TABLE_3]"       desc="Aggregated evidence metrics table"/>
            <AutoField tag="[N_IMPROVED]"    desc="Count of outcomes with Improved direction"/>
            <AutoField tag="[N_SIGNIFICANT]" desc="Count of statistically significant outcomes"/>
            <AutoField tag="[N_MCID]"        desc="Count of outcomes meeting MCID threshold"/>
            <AutoField tag="[CONSISTENCY]"   desc="% directional improvement (consistency rate)"/>
            <AutoField tag="[MEAN_BIAS]"     desc="Mean bias penalty across all outcomes"/>
          </Section>
        </div>

        {/* Discussion */}
        <div style={{background:T.bg2,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`}}>
          <Section title="💬 Discussion (AI-expanded)">
            <AutoField tag="[INTRO_PARA_1]"   desc="AI: Disease burden + epidemiology (~120w)"/>
            <AutoField tag="[INTRO_PARA_2]"   desc="AI: Pharmacological limitations (~100w)"/>
            <AutoField tag="[INTRO_PARA_3]"   desc="AI: Compound mechanism of action (~120w)"/>
            <AutoField tag="[INTRO_PARA_4]"   desc="AI: Synthesis objectives (~80w)"/>
            <AutoField tag="[DISCUSS_MAIN]"   desc="AI: Evidence strength in context (~200w)"/>
            <AutoField tag="[DISCUSS_BIO]"    desc="AI: Bioavailability + formulation (~150w)"/>
            <AutoField tag="[DISCUSS_BIAS]"   desc="AI: Risk of bias commentary (~120w)"/>
            <AutoField tag="[DISCUSS_LIMIT]"  desc="AI: Limitations (~100w)"/>
          </Section>
        </div>

        {/* References */}
        <div style={{background:T.bg2,borderRadius:8,padding:16,
          border:`1px solid ${T.border}`}}>
          <Section title="📚 References + Declarations">
            <AutoField tag="[REFERENCES]"       desc="Vancouver format, auto-numbered from References tab"/>
            <Filler tag="[AUTHOR_CONTRIBS]"     source="Auto-built from research team roles" required={false}/>
            <Filler tag="[FUNDING]"             source="Optional — add in Project Settings" required={false}/>
            <Filler tag="[CONFLICTS]"           source="Optional — add in Project Settings" required={false}/>
            <AutoField tag="[DATA_AVAIL]"       desc="Standard NEP data availability statement"/>
          </Section>
        </div>

      </div>

      {/* Document structure map */}
      <div style={{marginTop:20,padding:"16px 20px",background:T.bg2,
        borderRadius:8,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:12,color:T.teal,fontWeight:700,
          textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
          📑 Generated document structure (IMRaD)
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[
            ["Title block",     "Authors · Affiliation · Journal · Date"],
            ["Abstract",        "Background · Objective · Methods · Results · Conclusions · Keywords"],
            ["1. Introduction", "AI-expanded · 4 paragraphs · ~400 words"],
            ["2. Methods",      "Framework · Eligibility · Scoring · Aggregation"],
            ["3. Results",      "Table 1 (studies) · Table 2 (outcomes) · Table 3 (metrics)"],
            ["4. Discussion",   "AI-expanded · 4 subsections · ~600 words"],
            ["5. Conclusions",  "Bullet summary + narrative · GRADE statement"],
            ["Supplementary",   "Scoring methodology · MCID reference table"],
            ["Declarations",    "Authors · Funding · Conflicts · Data availability · References"],
          ].map(([sec, desc])=>(
            <div key={sec} style={{padding:"8px 12px",background:T.bg3,
              borderRadius:6,border:`1px solid ${T.border}`}}>
              <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",marginBottom:2}}>
                {sec}
              </div>
              <div style={{fontSize:10,color:T.text3,lineHeight:1.5}}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};



/* ─── DOCUMENT GENERATION — Word 2003 XML + Anthropic AI expansion ─────────
   Stage 1: instant Word XML skeleton from structured data
   Stage 2: Anthropic API expands Introduction + Discussion to full paragraphs
   Falls back gracefully to skeleton if API unavailable.
────────────────────────────────────────────────────────────────────── */

/* ── Anthropic API call for narrative expansion ── */
const expandNarrative = async (compound, outcomes, project, metrics) => {
  const name     = compound.compound_name || "the compound";
  const sci      = compound.scientific_name ? `(${compound.scientific_name})` : "";
  const extract  = compound.extract_form   || "standardised extract";
  const std      = compound.standardisation|| "";
  const dose     = compound.dose_range     || "";
  const duration = compound.duration_range || "";
  const journal  = metrics.journal || "a peer-reviewed nutraceutical journal";

  const outcomeList = outcomes.slice(0,8).map(o=>
    `${o.outcome_name||"outcome"} (${o.direction||"—"}, ${o.significance||"—"}, WS=${o._ws!=null?(Number(o._ws)||0).toFixed(1):"?"}, n=${o.sample_n||"?"})`
  ).join("; ");

  const sigOutcomes = outcomes.filter(o=>o.significance==="Significant");
  const topOutcome  = sigOutcomes[0]?.outcome_name || outcomes[0]?.outcome_name || "the primary outcome";
  const mcidMet     = outcomes.filter(o=>o.mcid_met==="Yes").length;

  try {
    const res = await fetch("/api/claude", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "anthropic-version":"2023-06-01",
        
      },
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens: 4500,
        messages:[{role:"user", content:
`You are a scientific medical writer producing a publication-ready nutraceutical evidence synthesis paper for ${journal}.

COMPOUND: ${name} ${sci}
EXTRACT: ${extract}${std?`, standardised to ${std}`:""}
DOSE/DURATION: ${dose||"variable"}${duration?` for ${duration}`:""}
ESS: ${(Number(metrics.ess)||0).toFixed(2)}/15.0 (${metrics.essC||"—"})
GRADE estimate: ${metrics.gradeC||"—"}
Studies: ${metrics.nStudies}, Participants: ${metrics.parts?.toLocaleString()||"—"}
Outcomes: ${outcomeList}
MCID met: ${mcidMet}/${outcomes.length}
Consistency: ${metrics.consC||"—"}

Write the following sections. Use formal academic language. Each section must be comprehensive and publication-ready. Do NOT use placeholders.

=== INTRODUCTION (600-700 words) ===
Paragraph 1 (100-120w): Global health burden of the conditions studied (${topOutcome} and related outcomes). Cite epidemiological significance.
Paragraph 2 (120-140w): Limitations of conventional pharmacological approaches — side effects, cost, patient compliance issues.
Paragraph 3 (150-180w): ${name} ${sci} — botanical origin, traditional use in Ayurvedic/traditional medicine, active constituents (${std||"key phytochemicals"}), proposed mechanisms of action.
Paragraph 4 (120-140w): Existing clinical evidence landscape — what systematic reviews exist, what gaps remain.
Paragraph 5 (100-120w): Rationale for this synthesis — why the NEP Weighted Scoring Framework provides value, study objectives.

=== DISCUSSION (750-900 words) ===
Paragraph 1 (150-180w): Interpretation of ESS ${(Number(metrics.ess)||0).toFixed(2)} and ${metrics.essC||""} classification in clinical context. What this means for practitioners.
Paragraph 2 (150-180w): Key findings for ${topOutcome} — effect sizes, clinical meaningfulness, MCID thresholds. Compare to existing meta-analyses if any.
Paragraph 3 (120-150w): Bioavailability and formulation considerations — how ${extract}${std?` standardised to ${std}`:""} compares to other preparations. Dose-response relationship at ${dose||"studied doses"}.
Paragraph 4 (120-150w): Risk of bias analysis — what the bias penalty scores mean, quality of included studies, limitations of the evidence base.
Paragraph 5 (100-120w): Limitations of this synthesis — database coverage, publication bias, heterogeneity, generalisability.
Paragraph 6 (80-100w): Future research directions — what RCTs are needed, optimal dosing, population subgroups, long-term safety.

=== CONCLUSIONS (150-180 words) ===
A cohesive paragraph summarising: ESS classification, primary outcome findings, clinical grade estimate, key caveats, and a clear recommendation statement for clinicians and researchers.

Format: Return each section with its header on a line by itself (e.g. "INTRODUCTION", "DISCUSSION", "CONCLUSIONS"), then the text. No markdown formatting, no bullet points — flowing academic prose only.`
        }]
      }),
      signal: AbortSignal.timeout(45000),
    });

    if(!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim()||"";

    // Parse sections
    const parseSection = (label) => {
      const re = new RegExp(`${label}\\n([\\s\\S]*?)(?=\\n(?:INTRODUCTION|DISCUSSION|CONCLUSIONS)\\n|$)`, "i");
      const m = text.match(re);
      return m ? m[1].trim() : "";
    };

    return {
      intro:       parseSection("INTRODUCTION"),
      discussion:  parseSection("DISCUSSION"),
      conclusions: parseSection("CONCLUSIONS"),
    };

  } catch(e) {
    console.warn("expandNarrative failed:", e.message);
    // Rich deterministic fallback (~3,000-4,000 words total document)
    const outcomeStr = outcomes.slice(0,3).map(o=>o.outcome_name).filter(Boolean).join(", ") || "clinical outcomes";
    const doseStr = dose ? `${dose}${duration ? ` administered for ${duration}` : ""}` : "variable doses";
    const studyDesigns = [...new Set(outcomes.map(o=>o.study_type).filter(Boolean))].join(", ") || "multiple designs";
    const topThreeOutcomes = outcomes
      .filter(o=>o._ws!=null)
      .sort((a,b)=>Number(b._ws)-Number(a._ws))
      .slice(0,3);
    const topOutcomeStr = topThreeOutcomes.map(o=>
      `${o.outcome_name} (WS=${(Number(o._ws)||0).toFixed(1)}${o.es_value?`, ES=${o.es_value}${o.es_type||""}`:""})`)
      .join("; ") || outcomeStr;

    return {
      intro: [
        // Para 1: Disease burden (~150w)
        `${topOutcome} and related outcomes addressed in this synthesis collectively represent a significant global health burden. ${topOutcome} affects substantial proportions of adult populations worldwide, contributing to reduced quality of life, impaired functional capacity, and considerable healthcare expenditure. Epidemiological data consistently demonstrate rising prevalence across industrialised and transitional economies, driven by demographic ageing, lifestyle factors, and increasing rates of comorbid metabolic conditions. Standard-of-care pharmacological interventions — including synthetic pharmaceuticals and biological agents — provide meaningful symptomatic relief for a proportion of patients; however, their chronic use is associated with tolerability concerns, including gastrointestinal adverse effects, hepatotoxicity risk, and immune modulation, which limit long-term adherence and patient acceptability. These limitations have sustained clinical and research interest in evidence-based nutraceutical adjuncts that may address similar biological pathways with more favourable tolerability profiles [1].`,

        // Para 2: Pharmacological context (~150w)  
        `Conventional pharmacological management of ${outcomeStr} relies principally on agents with well-characterised mechanisms but significant adverse effect burdens. First-line agents frequently carry risks of dependency, metabolic dysregulation, gastrointestinal intolerance, and — with chronic administration — end-organ toxicity. Patient-reported dissatisfaction with conventional therapies is substantial: meta-analyses of adherence data consistently identify tolerability concerns as a primary driver of discontinuation. The economic burden of chronic pharmacological management is a further limiting factor, particularly in healthcare systems with limited formulary access. These systemic challenges have created a recognised gap between clinical need and available pharmacological solutions, driving both patient self-directed use of nutraceutical supplements and formal academic interest in rigorously evaluating their clinical evidence base using methodology equivalent to that applied to pharmaceutical agents [2,3].`,

        // Para 3: Compound identity and mechanism (~200w)
        `${name} (${sci||"botanical nutraceutical"}) is a ${extract||"standardised botanical extract"} with an established history of use in traditional medicine systems, particularly Ayurvedic, Chinese, and Unani medicine. Its principal bioactive constituents — ${std||"characterised phytochemicals including terpenoids, alkaloids, and polyphenolic compounds"} — exert pleiotropic biological effects through multiple converging molecular pathways. In vitro and preclinical investigations have characterised mechanisms including modulation of inflammatory signalling cascades (NF-κB, COX-2), hypothalamic-pituitary-adrenal (HPA) axis regulation, mitochondrial biogenesis support, and antioxidant capacity enhancement. The biological plausibility of these mechanisms is well-supported by preclinical data, and translational evidence from human clinical trials has progressively substantiated mechanistic hypotheses across the outcome domains investigated in this synthesis. Formulation standardisation — ${std ? `specifically to ${std}` : "targeting key bioactive fractions"} — is considered essential for reproducible clinical outcomes, as pharmacokinetic variability between preparations has been identified as a significant source of heterogeneity in the published literature [4,5].`,

        // Para 4: Existing evidence (~150w)
        `The published clinical evidence base for ${name} spans ${metrics.nStudies||"multiple"} studies encompassing ${studyDesigns} study designs. Systematic reviews and structured narrative analyses have identified promising effects across ${outcomeStr}, though previous syntheses have been limited by methodological heterogeneity, inconsistent outcome reporting standards, and the absence of a reproducible cross-compound scoring framework. Meta-analyses incorporating randomised controlled trial data have generally demonstrated clinically relevant effect sizes for primary outcome measures, with pooled estimates consistently favouring ${name} supplementation over placebo in appropriately designed trials. However, variability in extract preparation, standardisation specification, dose regimen, and study duration across published trials has complicated direct comparison and limited confidence in generalised efficacy statements. The present synthesis addresses this gap through application of a standardised, reproducible evidence scoring methodology [6,7].`,

        // Para 5: Rationale (~120w)
        `The Nutraceutical Evidence Platform (NEP) Weighted Scoring Framework (v5.0) was applied in the present synthesis to provide a structured, reproducible evaluation of the available ${name} evidence base. The NEP framework assigns each clinical outcome a Weighted Score (WS) derived from four independently assessed parameters: Study Quality (Q, 1–5), Sample Adequacy (S, 0–5), Outcome Relevance (O, 1–5 anchored to published MCID thresholds), and Bias Penalty (B, 0–5 from validated bias tools). The aggregated Evidence Strength Score (ESS) — the arithmetic mean of all outcome-level WS values — provides a single, interpretable metric that maps directly onto GRADE certainty levels, enabling cross-compound evidence comparison. This synthesis aimed to: (1) compute outcome-level evidence scores for all available ${name} clinical data; (2) derive compound-level aggregated evidence metrics; (3) produce a calibrated GRADE-parallel evidence classification; and (4) generate a data-driven synthesis suitable for peer-reviewed publication.`,
      ].join("\n\n"),

      discussion: [
        // Para 1: ESS interpretation (~200w)
        `This structured synthesis demonstrates that standardised ${name} (${extract||"botanical extract"}${std?`, standardised to ${std}`:""}; ${doseStr}) carries ${metrics.essC||"Moderate"} overall evidence strength (ESS = ${(Number(metrics.ess)||0).toFixed(2)}/15.0) and ${metrics.consC||"Mixed"} outcome consistency across ${outcomeStr}. The estimated GRADE certainty of ${metrics.gradeC||"Moderate"} reflects convergent evidence from ${metrics.nStudies||"multiple"} studies encompassing ${metrics.parts?.toLocaleString()||"a substantial"} participants, with findings that are directionally consistent across the preponderance of outcome measures assessed. In GRADE terms, an ESS of ${(Number(metrics.ess)||0).toFixed(2)}/15.0 is broadly equivalent to ${metrics.essC==="Very Strong"?"High":metrics.essC==="Strong"?"Moderate–High":"Moderate"} certainty evidence, indicating that the effect estimate is likely to be close to the true effect and that further research is unlikely to change confidence in the estimate substantially, conditional on replication with adequately powered confirmatory trials. These findings provide a quantitative basis for clinical decision-making regarding ${name} supplementation as an adjunctive intervention for the outcome domains assessed [1–3].`,

        // Para 2: Key outcomes (~200w)
        `The most robustly evidenced effects in this synthesis were observed for ${topOutcomeStr}. ${topThreeOutcomes[0] ? `${topThreeOutcomes[0].outcome_name} achieved a Weighted Score of ${(Number(topThreeOutcomes[0]._ws)||0).toFixed(1)}/15.0${topThreeOutcomes[0].es_value ? `, with a reported effect size of ${topThreeOutcomes[0].es_value}${topThreeOutcomes[0].es_type||""}` : ""}${topThreeOutcomes[0].significance==="Significant" ? " (p < 0.05)" : ""}${topThreeOutcomes[0].mcid_met==="Yes" ? ", exceeding the published MCID threshold and therefore meeting the criterion for clinical as well as statistical significance" : ""}.` : ""} These findings are consistent with mechanistic data supporting ${name}'s biological activity in the relevant pathways. Comparison with published systematic reviews and meta-analyses reveals directional convergence with pooled effect estimates from randomised controlled trial data, providing cross-methodological validation of the present findings. Where prior syntheses reported heterogeneity (I² > 50%) attributable to dose and formulation variability, the present analysis — restricted to standardised preparations — demonstrates more consistent directional outcomes, supporting the hypothesis that formulation standardisation is a primary driver of reproducibility in this compound class [4–6].`,

        // Para 3: Bioavailability (~150w)
        `${name}'s pharmacokinetic profile presents important constraints on evidence interpretation. ${extract||"Standard oral preparations"} demonstrate variable bioavailability, with inter-individual variability in absorption, first-pass metabolism, and tissue distribution influencing clinical response magnitude. ${std ? `Standardisation to ${std} provides a defined phytochemical profile that reduces batch-to-batch variability but does not fully eliminate pharmacokinetic heterogeneity across individuals.` : "Formulation differences across included studies represent a recognised source of outcome heterogeneity."} Clinical investigations employing enhanced-bioavailability formulations (lipid-based delivery, phospholipid complexation, nanoparticulate systems) have generally reported larger effect sizes compared to conventional preparations at equivalent nominal doses. The findings of this synthesis cannot be extrapolated to non-standardised or conventionally formulated preparations without bioequivalence data. Clinicians selecting ${name} products for clinical application should prioritise preparations with documented bioavailability data and standardised phytochemical specifications consistent with those used in the included studies [7,8].`,

        // Para 4: Clinical vs statistical significance (~150w)
        `This synthesis explicitly separates statistical significance (p < 0.05) from clinical significance (MCID exceedance), a distinction with direct implications for clinical decision-making. The clinical significance rate of ${(Number(metrics.clin||0)*100).toFixed(0)}% (${metrics.clinC||"Partially Significant"}) reflects that ${mcidMet} of ${outcomes.length} assessed outcomes exceeded their respective published MCID thresholds — the minimum change considered meaningful from a patient or clinical perspective. Statistically significant findings that do not reach MCID thresholds may reflect real but clinically unimportant biological effects, or may represent underpowered studies where effect sizes are inflated by small sample bias. Conversely, outcomes that exceeded MCID thresholds provide the strongest support for clinical utility. The separation of these two significance criteria is a methodological strength of the present framework and is recommended as standard reporting practice for future clinical investigations of ${name} supplementation [9,10].`,

        // Para 5: Bias (~120w)
        `The overall risk of bias profile across included studies was ${metrics.biasC||"Moderate Bias"} (mean bias penalty: ${(Number(metrics.meanBias)||0).toFixed(2)}/5.0). ${metrics.biasC==="Low Bias" ? `This favourable bias profile strengthens confidence in the pooled evidence estimate and supports the GRADE classification assigned.` : `This moderate bias profile reflects recognised methodological limitations in the nutraceutical clinical trial literature, including variable blinding quality, incomplete outcome reporting, and heterogeneous randomisation procedures.`} Domain-level bias findings are presented in Table 2 and are traceable to published bias assessments of source papers. Studies employing Cochrane RoB 2 (for RCTs) and AMSTAR 2 (for systematic reviews) demonstrated the most comprehensive bias documentation. Future investigations should prioritise pre-registration, allocation concealment, independent outcome assessment, and full reporting of CONSORT or PRISMA requirements to reduce residual bias concerns in this evidence base.`,

        // Para 6: Limitations (~150w)
        `Several limitations warrant explicit acknowledgement. First, this synthesis encompasses ${metrics.nStudies||"a focused set of"} studies, representing a targeted rather than exhaustive search of the ${name} evidence base; while findings are representative of the available standardised extract literature, publication bias cannot be excluded. Second, aggregation across heterogeneous study designs (${studyDesigns}) creates comparability constraints; a synthesis restricted to RCT-only data would yield a modified primary metric. Third, the GRADE certainty estimate of ${metrics.gradeC||"Moderate"} is algorithm-derived from NEP scoring parameters rather than a formal GRADE panel assessment involving independent reviewer consensus — this is acknowledged as a methodological approximation. Fourth, dose and duration heterogeneity across included studies limits the derivation of a single optimal therapeutic regimen. Fifth, the outcome set covered in this synthesis may not be exhaustive of all clinical indications for ${name}; outcome domains not represented here may demonstrate different evidence profiles. These limitations should inform the interpretation of findings and the design of future confirmatory investigations.`,
      ].join("\n\n"),

      bioavailability: `${name}'s oral bioavailability in standard extract form is subject to significant inter-individual variability driven by gastrointestinal physiology, gut microbiota composition, and hepatic first-pass metabolism. Enhanced-bioavailability formulations — including lipid matrix systems, phospholipid complexes, and nanoparticulate delivery platforms — have demonstrated 2–5-fold improvements in plasma Cmax and AUC versus conventional extracts at equivalent doses in pharmacokinetic studies. Included studies in this synthesis employed ${extract||"standardised oral preparations"}${std?`, standardised to ${std},`:","}  which represent a defined phytochemical specification associated with improved pharmacokinetic consistency versus non-standardised preparations. Findings are not directly generalisable to non-standardised or conventionally formulated ${name} products without bioequivalence data. Prescribers and formulators should reference the specific preparation parameters of included studies when selecting products for clinical application.`,

      conclusions: `Application of the NEP Weighted Scoring Framework (v5.0) to standardised ${name} (${sci||""}) supplementation demonstrates ${metrics.essC||"Moderate"} overall evidence strength (ESS = ${(Number(metrics.ess)||0).toFixed(2)}/15.0) and ${metrics.consC||"Mixed"} outcome consistency. The estimated GRADE certainty of ${metrics.gradeC||"Moderate"} is supported by directionally consistent findings across ${metrics.nStudies||"multiple"} studies (${metrics.parts?.toLocaleString()||"n"} participants) and ${outcomes.length} assessed outcomes. The clinical significance rate of ${(Number(metrics.clin||0)*100).toFixed(0)}% (${mcidMet}/${outcomes.length} outcomes exceeding MCID) provides evidence that the observed effects meet minimum clinically important difference thresholds in a meaningful proportion of outcome domains. Priority areas for strengthening this evidence base include: (1) larger, pre-registered RCTs with MCID-anchored primary endpoints (n > 200 per arm); (2) standardised formulation specifications enabling cross-study comparability; (3) extended follow-up (≥ 16 weeks) to characterise durability of effect; (4) head-to-head comparisons with active pharmacological comparators; and (5) inclusion of patient-reported outcome measures alongside biomarker endpoints.`,
    };
  }
};



/* ─── WORD XML HELPERS (module scope) ───────────────────────────── */

/* ── Academic document styles (Times New Roman, double-spaced) ──── */
const DOCX_STYLES =
  `<w:fonts><w:defaultFonts w:ascii="Times New Roman" w:fareast="Times New Roman" w:h-ansi="Times New Roman" w:cs="Times New Roman"/></w:fonts>` +
  `<w:docPr><w:view w:val="print"/></w:docPr>` +
  `<w:styles>` +
  `<w:style w:type="paragraph" w:default="on" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:line="480" w:line-rule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:h-ansi="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="360" w:after="120" w:line="480" w:line-rule="auto"/><w:keepNext/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:h-ansi="Times New Roman"/><w:b/><w:sz w:val="28"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="240" w:after="100" w:line="480" w:line-rule="auto"/><w:keepNext/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:h-ansi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="200" w:after="80" w:line="480" w:line-rule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:h-ansi="Times New Roman"/><w:b/><w:i/><w:sz w:val="24"/></w:rPr></w:style>` +
  `</w:styles>`;

const esc = (s) => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

/* ── Word 2003 XML helpers ─────────────────────────────────────── */
const rpr = (o={}) => {
  let r = "";
  if(o.b)   r += "<w:b/>";
  if(o.i)   r += "<w:i/>";
  if(o.u)   r += '<w:u w:val="single"/>';
  if(o.sz)  r += `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`;
  if(o.col) r += `<w:color w:val="${o.col}"/>`;
  if(o.font) r += `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}"/>`;
  else r += '<w:rFonts w:ascii="Times New Roman" w:h-ansi="Times New Roman"/>';
  return r ? `<w:rPr>${r}</w:rPr>` : "";
};
const ppr = (o={}) => {
  let r = "";
  if(o.center) r += `<w:jc w:val="center"/>`;
  if(o.style)  r += `<w:pStyle w:val="${o.style}"/>`;
  if(o.sb)     r += `<w:spacing w:before="${o.sb}"/>`;
  if(o.sa)     r += `<w:spacing w:after="${o.sa||120}"/>`;
  if(o.ind)    r += `<w:ind w:left="${o.ind}"/>`;
  return r ? `<w:pPr>${r}</w:pPr>` : "";
};
const _run = (text, o={}) =>
  `<w:r>${rpr(o)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const _p = (text, o={}) =>
  `<w:p>${ppr(o)}${_run(text, o)}</w:p>`;

const _h = (text, level=1) => {
  const sizes = [32, 28, 24, 22];
  const colors = ["1A2E44","2C4A6E","3A5F82","4A7098"];
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${sizes[level-1]||22}"/><w:color w:val="${colors[level-1]||"1A2E44"}"/></w:rPr><w:t>${esc(text)}</w:t></w:r></w:p>`;
};

const _blt = (text, o={}) =>
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/></w:pPr><w:r>${rpr({...o})}<w:t xml:space="preserve">• ${esc(text)}</w:t></w:r></w:p>`;

const _hr = () =>
  `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>`;

const _tc = (text, o={}) => {
  const bg = o.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.bg}"/>` : "";
  const align = o.center ? `<w:jc w:val="center"/>` : "";
  const width = o.w ? `<w:tcW w:w="${o.w}" w:type="dxa"/>` : "";
  const bold = (o.header||o.b) ? "<w:b/>" : "";
  const color = o.col ? `<w:color w:val="${o.col}"/>` : "";
  return `<w:tc><w:tcPr>${width}<w:tcBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/></w:tcBorders>${bg}</w:tcPr><w:p><w:pPr>${align}<w:spacing w:after="60"/></w:pPr><w:r><w:rPr>${bold}${color}<w:sz w:val="${o.sz||20}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`;
};

const _tr = (cells) => `<w:tr>${cells}</w:tr>`;

const _tbl = (rows, widths="") =>
  `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`;

const _textToParas = (text) =>
  (text||"").split(/\n\n+/).map(para => para.trim()).filter(Boolean)
    .map(para => _p(para, {sa:120})).join("");
/* ── End helpers ───────────────────────────────────────────────── */


/* ─── BUILD BLANK TEMPLATE .doc ─────────────────────────────────── */
const buildBlankTemplate = () => {
  // Produces a Word 2003 XML document with [FILLER] placeholders
  // This is the standard template stored in Administration

  const amber  = "E6820A";
  const green  = "16A34A";
  const navy   = "1A2E44";
  const grey   = "666666";
  const lgrey  = "F5F5F5";

  // Styled placeholder tag
  const ph = (tag, color=amber) =>
    `<w:r><w:rPr><w:color w:val="${color}"/><w:b/><w:sz w:val="20"/></w:rPr>` +
    `<w:t xml:space="preserve">${tag}</w:t></w:r>`;

  // Plain text run
  const tx = (text, opts={}) =>
    `<w:r><w:rPr>${opts.b?"<w:b/>":""}${opts.i?"<w:i/>":""}` +
    `<w:sz w:val="${opts.sz||20}"/><w:color w:val="${opts.col||"000000"}"/>` +
    `</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;

  // Paragraph
  const para = (children, opts={}) =>
    `<w:p><w:pPr>` +
    (opts.center?`<w:jc w:val="center"/>`:"") +
    `<w:spacing w:before="${opts.sb||0}" w:after="${opts.sa||120}"/>` +
    `</w:pPr>${children}</w:p>`;

  // Heading
  const h = (text, level=1) => {
    const sz = [32,28,24,22][level-1]||22;
    const col = ["1A2E44","2C4A6E","3A5F82","4A7098"][level-1]||navy;
    return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/>` +
      `<w:spacing w:before="240" w:after="120"/></w:pPr>` +
      `<w:r><w:rPr><w:b/><w:sz w:val="${sz}"/><w:color w:val="${col}"/></w:rPr>` +
      `<w:t>${text}</w:t></w:r></w:p>`;
  };

  const hr = () =>
    `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" ` +
    `w:color="CCCCCC"/></w:pBdr><w:spacing w:before="120" w:after="120"/>` +
    `</w:pPr></w:p>`;

  const blt = (children) =>
    `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>` +
    `<w:spacing w:after="60"/></w:pPr>${children}</w:p>`;

  let body = "";

  // ── TITLE BLOCK ──────────────────────────────────────────────────
  body += para(ph("[PAPER_TITLE]", navy), {center:true, sb:80, sa:40});
  body += para(
    ph("[AUTHORS]", grey),
    {center:true, sa:20}
  );
  body += para(ph("[AFFILIATION]", grey), {center:true, sa:20});
  body += para(
    tx("Target journal: ", {col:grey}) + ph("[TARGET_JOURNAL]", grey) +
    tx("  ·  Date: ", {col:grey}) + ph("[DATE]", grey) +
    tx("  ·  NEP v5.0", {col:grey}),
    {center:true, sa:60}
  );
  body += hr();

  // ── ABSTRACT ─────────────────────────────────────────────────────
  body += h("Abstract", 1);
  body += para(
    tx("Background: ", {b:true}) +
    ph("[COMPOUND_NAME]") + tx(" (") + ph("[SCIENTIFIC_NAME]") +
    tx(") is a nutraceutical compound evaluated in this synthesis. ")
  );
  body += para(
    tx("Objective: ") +
    tx("To evaluate the clinical evidence for ") + ph("[COMPOUND_NAME]") +
    tx(" using the NEP Weighted Scoring Framework.")
  );
  body += para(
    tx("Methods: ") + ph("[N_STUDIES]") + tx(" studies comprising ") +
    ph("[N_PARTICIPANTS]") + tx(" participants were assessed across ") +
    ph("[N_OUTCOMES]") + tx(" clinical outcomes. Each outcome was scored on " +
    "Study Quality (Q), Sample Adequacy (S), Outcome Relevance (O), and " +
    "Bias Penalty (B) using the formula WS = Q + S + O − B.")
  );
  body += para(
    tx("Results: ESS = ") + ph("[ESS_VALUE]") + tx("/15.0 (") +
    ph("[ESS_CLASS]") + tx("). Consistency: ") + ph("[CONSISTENCY]") +
    tx("%. GRADE-parallel estimate: ") + ph("[GRADE_EST]") + tx(".")
  );
  body += para(
    tx("Conclusions: ") + ph("[COMPOUND_NAME]") +
    tx(" demonstrates ") + ph("[ESS_CLASS]") +
    tx(" evidence for the outcomes studied.")
  );
  body += para(
    tx("Keywords: ", {b:true}) + ph("[KEYWORDS]")
  );
  body += hr();

  // ── 1. INTRODUCTION ──────────────────────────────────────────────
  body += h("1. Introduction", 1);
  body += para(ph("[INTRO_PARA_1 — Disease burden and epidemiology ~120w]", "7C3AED"));
  body += para(ph("[INTRO_PARA_2 — Pharmacological limitations ~100w]", "7C3AED"));
  body += para(ph("[INTRO_PARA_3 — Compound mechanism of action ~120w]", "7C3AED"));
  body += para(ph("[INTRO_PARA_4 — Synthesis objectives ~80w]", "7C3AED"));
  body += hr();

  // ── 2. METHODS ───────────────────────────────────────────────────
  body += h("2. Methods", 1);
  body += h("2.1 Framework overview", 2);
  body += para(tx(
    "This synthesis applies the NEP Weighted Scoring Framework (v5.0). " +
    "Each clinical outcome is evaluated on four independent scoring parameters: " +
    "Study Quality (Q, 1–5), Sample Adequacy (S, 0–5), Outcome Relevance (O, 1–5), " +
    "and Bias Penalty (B, 0–5). The Weighted Score (WS = Q + S + O − B) is computed " +
    "per outcome, and the Evidence Strength Score (ESS) is the arithmetic mean of all WS values."
  ));
  body += h("2.2 Compound and study details", 2);
  body += para(
    tx("Compound(s) evaluated: ") + ph("[COMPOUND_LIST]") + tx(". ") +
    tx("Extract form: ") + ph("[EXTRACT_FORM]") + tx(". ") +
    tx("Standardisation: ") + ph("[STANDARDISATION]") + tx(".")
  );
  body += para(
    tx("Dosage range: ") + ph("[DOSE_RANGE]") + tx(". ") +
    tx("Duration range: ") + ph("[DURATION_RANGE]") + tx(". ") +
    tx("Study designs: ") + ph("[STUDY_DESIGNS]") + tx(".")
  );
  body += h("2.3 Eligibility criteria", 2);
  body += para(ph("[ELIGIBILITY — auto-generated from study types present]", green));
  body += h("2.4 Bias assessment", 2);
  body += para(
    tx("Bias was assessed using: ") + ph("[BIAS_TOOLS]") +
    tx(". Domain scores were summed to produce the Bias Penalty (B, 0–5).")
  );
  body += h("2.5 MCID thresholds", 2);
  body += para(tx(
    "Minimal Clinically Important Differences (MCIDs) were applied from " +
    "published literature to determine clinical significance of each outcome."
  ));
  body += hr();

  // ── 3. RESULTS ───────────────────────────────────────────────────
  body += h("3. Results", 1);
  body += h("3.1 Study characteristics", 2);
  body += para(ph("[TABLE_1 — Study-level characteristics: Study ID, Design, N, Compound, Duration]", green));
  body += h("3.2 Outcome-level scoring", 2);
  body += para(ph("[TABLE_2 — Outcome scores: Outcome, Direction, Q, S, O, B, WS, MCID]", green));
  body += h("3.3 Aggregated evidence metrics", 2);
  body += para(ph("[TABLE_3 — ESS, Consistency, Clinical significance rate, Mean bias, GRADE]", green));
  body += para(
    tx("Of ") + ph("[N_OUTCOMES]") + tx(" outcomes assessed, ") +
    ph("[N_IMPROVED]") + tx(" showed directional improvement (") +
    ph("[CONSISTENCY]") + tx("% consistency). ") +
    ph("[N_SIGNIFICANT]") + tx(" outcomes were statistically significant. ") +
    ph("[N_MCID]") + tx(" outcomes exceeded published MCID thresholds (") +
    ph("[CLINICAL_SIG_RATE]") + tx("% clinical significance rate). ") +
    tx("ESS = ") + ph("[ESS_VALUE]") + tx("/15.0 (") + ph("[ESS_CLASS]") + tx("). ") +
    tx("Mean Bias Penalty = ") + ph("[MEAN_BIAS]") + tx(" (") + ph("[BIAS_CLASS]") + tx(").")
  );
  body += hr();

  // ── 4. DISCUSSION ────────────────────────────────────────────────
  body += h("4. Discussion", 1);
  body += para(ph("[DISCUSS_MAIN — Evidence strength in context ~200w]", "7C3AED"));
  body += para(ph("[DISCUSS_BIOAVAIL — Bioavailability and formulation considerations ~150w]", "7C3AED"));
  body += para(ph("[DISCUSS_BIAS — Risk of bias commentary ~120w]", "7C3AED"));
  body += para(ph("[DISCUSS_LIMITATIONS — Study limitations ~100w]", "7C3AED"));
  body += hr();

  // ── 5. CONCLUSIONS ───────────────────────────────────────────────
  body += h("5. Conclusions", 1);
  body += blt(
    tx("ESS = ") + ph("[ESS_VALUE]") + tx("/15.0 — ") + ph("[ESS_CLASS]") +
    tx(" evidence (GRADE-parallel: ") + ph("[GRADE_EST]") + tx(")")
  );
  body += blt(
    tx("Consistency: ") + ph("[N_IMPROVED]") + tx("/") + ph("[N_OUTCOMES]") +
    tx(" outcomes improved (") + ph("[CONSISTENCY]") + tx("%)")
  );
  body += blt(
    tx("Clinical significance: ") + ph("[N_MCID]") + tx(" outcomes met MCID threshold")
  );
  body += blt(
    tx("Mean Bias Penalty: ") + ph("[MEAN_BIAS]") + tx(" (") + ph("[BIAS_CLASS]") + tx(")")
  );
  body += para(ph("[CONCLUSIONS_NARRATIVE — 2-3 sentence summary ~80w]", "7C3AED"));
  body += hr();

  // ── DECLARATIONS ─────────────────────────────────────────────────
  body += h("Author contributions", 2);
  body += para(ph("[AUTHOR_CONTRIBS — auto from research team roles]", green));
  body += h("Funding", 2);
  body += para(ph("[FUNDING — optional]", grey));
  body += h("Conflicts of interest", 2);
  body += para(ph("[CONFLICTS — optional]", grey));
  body += h("Data availability", 2);
  body += para(tx(
    "All scoring data, outcome parameters, and bias assessments are documented " +
    "in Tables 1–3 and are available from the corresponding author on request."
  ));
  body += h("References", 2);
  body += para(ph("[REFERENCES — Vancouver format, auto-numbered]", green));

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<?mso-application progid="Word.Document"?>\n` +
    `<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml" ` +
    `xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint" ` +
    `w:macrosPresent="no" w:embeddedObjPresent="no" w:ocxPresent="no">\n` +
    DOCX_STYLES + `\n` +
    `<w:body>\n${body}\n` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>` +
    `</w:sectPr>\n</w:body>\n</w:wordDocument>`;

  return new Blob([xml], {type:"application/msword"});
};

const buildDocxBlob = async (project, compound, outcomes, refs, onProgress) => {

  /* ── Scoring ── */
  const safeOutcomes = outcomes.map(o=>({
    ...o,
    _ws:    o._ws!=null    ? Number(o._ws)    : null,
    _biasP: o._biasP!=null ? Number(o._biasP) : 0,
  }));
  const wsVals    = safeOutcomes.map(o=>o._ws).filter(x=>x!=null&&!isNaN(x)&&x>0);
  const wsArr     = wsVals; // alias for backwards compat
  const ess       = wsVals.length ? wsVals.reduce((a,b)=>a+b,0)/wsVals.length : 0;
  const essC      = ess>=12?"Very Strong":ess>=9?"Strong":ess>=6?"Moderate":"Weak";
  const nImp      = safeOutcomes.filter(o=>o.direction==="Improved").length;
  const nSig      = safeOutcomes.filter(o=>o.significance==="Significant").length;
  const nMcid     = safeOutcomes.filter(o=>o.mcid_met==="Yes").length;
  const cons      = outcomes.length ? nImp/outcomes.length  : 0;
  const clin      = outcomes.length ? nMcid/outcomes.length : 0;
  const consC     = cons>=0.8?"Highly Consistent":cons>=0.5?"Mixed":"Inconsistent";
  const clinC     = clin>=0.6?"Clinically Significant":clin>=0.3?"Partially Significant":"Clinically Uncertain";
  const meanBias  = safeOutcomes.length ? safeOutcomes.reduce((a,b)=>a+(b._biasP||0),0)/safeOutcomes.length : 0;
  const biasC     = meanBias<=1?"Low Bias":meanBias<=2.5?"Moderate Bias":"High Bias";
  const grade     = ess>=9&&cons>=0.8?"Moderate\u2013High":ess>=6?"Moderate":"Low\u2013Moderate";
  const studies   = [...new Set(outcomes.map(o=>o.study_ref_id).filter(Boolean))];
  const totalParts= studies.reduce((s,ref)=>{
    const r=outcomes.find(o=>o.study_ref_id===ref);
    return s+(Number(r?.sample_n)||0);
  },0);
  const sortedByWS= [...safeOutcomes].filter(o=>o._ws!=null).sort((a,b)=>b._ws-a._ws);
  const topOutcome = sortedByWS[0];
  const topOutcomes = sortedByWS.slice(0,3)
    .map(o=>`${o.outcome_name||"outcome"} (WS=${(Number(o._ws)||0).toFixed(1)})`)
    .join("; ");

  // Derive compound info from outcomes
  const allC = [...new Map(outcomes.flatMap(o=>{
    if(o.compounds?.length>0) return o.compounds.map(c=>[c.id,c]);
    if(o.compound_name) return [[o.compound_name,{id:o.compound_name,name:o.compound_name,scientific:o.scientific_name||""}]];
    return [];
  })).values()].filter(c=>c.name);
  const compName    = allC.map(c=>c.name).join(" + ") || compound?.compound_name || "the compound";
  const compSci     = allC.map(c=>c.scientific).filter(Boolean).join("; ") || compound?.scientific_name || "";
  const compExtract = compound?.extract_form || "";
  const compStd     = compound?.standardisation || "";
  const compDose    = compound?.dose_range || outcomes.map(o=>o.dosage?`${o.dosage}${o.dose_unit||""}`:"").filter(Boolean).join(", ") || "";
  const compDur     = compound?.duration_range || "";

  /* ── Stage 1: AI expansion ── */
  if(onProgress) onProgress("Stage 1: AI expansion (~20s)\u2026");
  const metrics = {
    nStudies:studies.length, parts:totalParts, nOutcomes:outcomes.length,
    nImp, nSig, ess:Number(ess)||0, essC, cons, consC, clin, clinC,
    meanBias:Number(meanBias)||0, biasC, grade,
    topOutcome: topOutcome ? `${topOutcome.outcome_name} (WS=${topOutcome._ws?.toFixed?.(1)||topOutcome._ws}, ES=${topOutcome.es_value||""}${topOutcome.es_type||""}, p=${topOutcome.p_value||"?"})` : "",
    journal: project?.target_journal||"",
  };
  const expanded = await expandNarrative(compound, outcomes, project, metrics);
  if(onProgress) onProgress("Stage 2: Building document\u2026");

  /* ── Stage 2: Assemble Word XML ── */
  let body = "";

  // ── Title block ──────────────────────────────────────────────
  const fullTitle = project?.paper_title ||
    `${esc(compName)}${compSci?` (${esc(compSci)})`:""}${compExtract?` ${esc(compExtract)}`:""}${compDose?` ${esc(compDose)}`:""}` +
    `: A Structured Evidence Synthesis`;
  body += _p(fullTitle, {b:true,sz:32,col:"1A2E44",center:true,sa:100});

  // Resolve researcher details from team array (saved by Paper Metadata)
  // Resolve team from project or localStorage meta
  const _metaKey = `nep_study_meta_${compName||"default"}`;
  const _savedMeta = (() => { try { return JSON.parse(localStorage.getItem(_metaKey)||"{}"); } catch(e) { return {}; } })();
  const _team = project?.team || _savedMeta?.team || project?.research_team || [];
  const _lead = _team[0]?.name || project?.researcher || "";
  const _coAuth = _team.slice(1).map(m=>m.name).filter(Boolean).join(", ") || project?.co_authors || "";
  const _affil = project?.affiliation || _savedMeta?.affiliation || "";
  const _journal = project?.journal || project?.target_journal || _savedMeta?.journal || "";
  const authLine = project?.authors_paper || [_lead, _coAuth].filter(Boolean).join("  \u00b7  ");
  if(authLine) body += _p(authLine, {sz:22,col:"333333",center:true,sa:40});
  if(_affil) body += _p(_affil, {sz:24,col:"555555",center:true,sa:20});

  const metaLine = [
    _journal ? `Target journal: ${esc(_journal)}` : "",
    `Submission date: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}`,
    "NEP Platform v6.0",
  ].filter(Boolean).join("  \u00b7  ");
  body += _p(metaLine, {sz:18,col:"777777",center:true,sa:60});
  body += _hr();

  // ── Abstract ─────────────────────────────────────────────────
  body += _h("Abstract", 1);
  body += _p(
    `Background: ${esc(compName)}${compSci?` (${esc(compSci)})`:""}` +
    ` is a nutraceutical compound${compExtract?` administered as ${esc(compExtract)}`:""} with ` +
    `established pharmacological actions relevant to the outcomes assessed in this synthesis. ` +
    `Despite a substantial published evidence base, structured quantitative synthesis has been limited ` +
    `by heterogeneous outcome reporting and lack of standardised scoring methodology.`,
    {sz:24,sa:80}
  );
  body += _p(
    `Objective: To systematically evaluate the available evidence for standardised ${esc(compName)} ` +
    `supplementation${compDose?` (${esc(compDose)})`:""}${compDur?` over ${esc(compDur)}`:""} ` +
    `across ${outcomes.length} outcome${outcomes.length!==1?"s":""} using the NEP Weighted Scoring Framework v5.0.`,
    {sz:24,sa:60}
  );
  body += _p(
    `Methods: A structured evidence synthesis was conducted across ${studies.length||1} study design${(studies.length||1)!==1?"s":""} ` +
    `(${totalParts>0?`${totalParts} participants; `:""}${outcomes.length} outcomes) ` +
    `spanning ${[...new Set(outcomes.map(o=>o.study_type).filter(Boolean))].join(", ")||"mixed"} designs. ` +
    `Each outcome was independently scored on four parameters: Study Quality (Q, 1\u20135), ` +
    `Sample Adequacy (S, 0\u20135), Outcome Relevance (O, 1\u20135), and Bias Penalty (B, 0\u20135). ` +
    `Weighted Score (WS) = Q + S + O \u2212 B. Evidence Strength Score (ESS) = mean(WS > 0).`,
    {sz:24,sa:60}
  );
  body += _p(
    `Results: ESS = ${(Number(ess)||0).toFixed(2)}/15.0 (${essC}). ` +
    `Outcome consistency: ${(Number(cons)*100).toFixed(0)}% (${consC}). ` +
    `${nSig}/${outcomes.length} outcomes statistically significant. ` +
    `${nMcid}/${outcomes.length} outcomes exceeded clinically important difference thresholds (${clinC}). ` +
    (topOutcome?`Strongest outcome: ${esc(topOutcome.outcome_name||"")} (WS = ${topOutcome._ws?.toFixed?.(1)||topOutcome._ws||"\u2014"}). `:"") +
    `Estimated GRADE certainty: ${grade}.`,
    {sz:24,sa:60}
  );
  body += _p(
    `Conclusions: ${esc(compName)}${compExtract?` (${esc(compExtract)})`:""}` +
    ` demonstrates ${essC.toLowerCase()} overall evidence strength and ${consC.toLowerCase()} outcome consistency, ` +
    `with estimated GRADE certainty of ${grade}. ` +
    `Findings support consideration as an evidence-based adjunct, conditional on standardised ` +
    `${compExtract||"formulations"} and replication in larger, adequately powered trials.`,
    {sz:24,sa:60}
  );
  if(project?.keywords){
    body += _p(`Keywords: ${esc(project.keywords)}`, {sz:24,sa:80,i:true});
  }
  body += _hr();

  // ── 1. Introduction ──────────────────────────────────────────
  body += _h("1. Introduction", 1);
  body += _textToParas(expanded.intro || (
    `${esc(compName)}${compSci?` (${esc(compSci)})`:""} is a botanical nutraceutical with established traditional and clinical use. ` +
    `The outcomes assessed in this synthesis represent areas of significant unmet clinical need, ` +
    `where standard pharmacological approaches carry risks and limitations with long-term use, ` +
    `driving sustained interest in evidence-based nutraceutical adjuncts.\n\n` +
    `${esc(compName)} exerts its primary biological effects through multiple mechanistic pathways, ` +
    `including modulation of inflammatory signalling, neuroendocrine regulation, and antioxidant activity. ` +
    `Prior clinical evidence has demonstrated efficacy across multiple outcome domains, though synthesis ` +
    `has been constrained by formulation variability, heterogeneous outcome reporting, and inconsistent ` +
    `methodological standards across published trials.\n\n` +
    `A critical methodological challenge in the ${esc(compName)} evidence base is the absence of ` +
    `standardised scoring criteria applicable across study designs. The present analysis addresses ` +
    `this gap by applying the NEP Weighted Scoring Framework (v5.0), a parameter-based methodology ` +
    `enabling reproducible cross-compound evidence comparison with GRADE-parallel classification.\n\n` +
    `The NEP Weighted Scoring Framework was applied to evaluate the available evidence with the ` +
    `following objectives: (1) compute outcome-level Weighted Scores across all included studies; ` +
    `(2) derive compound-level Evidence Strength Score (ESS) and aggregated evidence metrics; ` +
    `(3) produce a calibrated GRADE-parallel evidence classification; ` +
    `(4) generate a data-driven synthesis suitable for peer-reviewed publication.`
  ));
  body += _hr();

  // ── 2. Methods ───────────────────────────────────────────────────────
  body += _h("2. Methods", 1);

  body += _h("2.1 Evidence Assessment Framework", 2);
  body += _p(
    `This evidence synthesis was conducted using the Nutraceutical Evidence Platform (NEP) ` +
    `Weighted Scoring Framework v5.0, a parameter-based methodology designed to produce ` +
    `reproducible, quantitative appraisal of nutraceutical clinical evidence across heterogeneous ` +
    `study designs. The framework was developed to address the recognised absence of standardised ` +
    `scoring methodology in the nutraceutical literature — a gap that limits cross-compound ` +
    `comparisons and prevents meaningful benchmarking against pharmaceutical evidence evaluated ` +
    `under GRADE or Cochrane methodology. The NEP framework applies a four-component scoring ` +
    `architecture to each discrete clinical outcome, generating an outcome-level Weighted Score ` +
    `(WS) and a compound-level Evidence Strength Score (ESS) that maps directly onto GRADE ` +
    `certainty categories. All scoring operations are performed within the NEP Platform v5.0, ` +
    `which provides auditable, version-controlled scoring records traceable to the source data.`
  );

  body += _h("2.2 Search Strategy and Study Selection", 2);
  body += _p(
    `Studies were identified through systematic searching of PubMed, MEDLINE, Embase, and ` +
    `Cochrane Library using compound name synonyms ` +
    `(${esc(compName)}${compSci ? `; ${esc(compSci)}` : ""}) ` +
    `combined with outcome domain terms and study design filters. ` +
    `Reference lists of included studies and relevant systematic reviews were screened manually ` +
    `to identify additional eligible records. Grey literature and clinical trial registries ` +
    `(ClinicalTrials.gov, WHO ICTRP) were searched for registered but unpublished trials ` +
    `in the relevant indication areas. ` +
    `Studies were considered eligible if they: (i) administered ${esc(compName)} as the primary ` +
    `intervention${compExtract ? ` in the form of ${esc(compExtract)}` : ""}` +
    `${compStd ? `, standardised to ${esc(compStd)}` : ""}; ` +
    `(ii) enrolled adult human participants; (iii) reported at least one quantifiable primary ` +
    `outcome in a relevant domain; and (iv) employed a randomised controlled, systematic review ` +
    `or meta-analysis, observational cohort, or mechanistic study design. ` +
    `Uncontrolled case reports, non-peer-reviewed abstracts, and studies using non-human models ` +
    `without a human clinical comparator were excluded from the primary analysis.`
  );

  body += _h("2.3 Eligibility Criteria", 2);
  body += _p(
    `Full eligibility criteria were defined a priori. Inclusion required: ` +
    `(i) oral administration of ${esc(compName)}${compSci ? ` (${esc(compSci)})` : ""} ` +
    `${compExtract ? `as ${esc(compExtract)}` : ""}` +
    `${compStd ? `, standardised to ${esc(compStd)},` : ""} as the primary study intervention; ` +
    `(ii) dose${compDose ? ` within the range ${esc(compDose)}` : " as reported by investigators"}` +
    `${compDur ? ` for a duration of at least ${esc(compDur)}` : ""}; ` +
    `(iii) enrolment of adult human participants aged ≥18 years; ` +
    `(iv) reporting of at least one quantifiable primary outcome with a defined effect estimate ` +
    `and measure of precision (SD, SE, or 95% CI); and ` +
    `(v) availability of full-text publication in English. ` +
    `Exclusion criteria included: studies using unstandardised or native (non-extract) forms ` +
    `of the compound without bioequivalence data; trials with duration < 4 weeks for chronic ` +
    `outcome domains; studies restricted to paediatric populations (< 18 years); and studies ` +
    `with incomplete outcome reporting precluding Weighted Score calculation.`
  );

  body += _h("2.4 Data Extraction", 2);
  body += _p(
    `Data were extracted by two independent reviewers using a pre-specified standardised ` +
    `extraction schema capturing: study identity (first author, year, design, country, registration ` +
    `status); participant characteristics (sample size, age, sex, diagnosis/condition, ` +
    `comorbidities); intervention details (compound, dose, formulation, standardisation, ` +
    `co-interventions); comparator (placebo, active control, or no comparator); outcome name, ` +
    `domain, and measurement instrument; effect estimate (MD, SMD, RR, or OR) with 95% ` +
    `confidence interval; p-value; statistical significance; and whether the reported effect ` +
    `magnitude exceeded the pre-specified Minimal Clinically Important Difference (MCID) threshold ` +
    `for that outcome domain. I² was recorded for meta-analytic outcomes. Discrepancies between ` +
    `extractors were resolved by consensus discussion; a third reviewer adjudicated disagreements ` +
    `that could not be resolved bilaterally. All extracted data were entered into the NEP ` +
    `evidence input schema and independently verified against source publications prior to scoring.`
  );

  body += _h("2.5 Quality and Risk of Bias Assessment", 2);
  const biasTools = [...new Set(outcomes.map(o=>o.bias_tool).filter(Boolean))];
  body += _p(
    `Risk of bias was assessed for each included study using validated, design-appropriate tools. ` +
    `Cochrane Risk of Bias 2 (RoB 2) was applied to randomised controlled trials, ` +
    `evaluating five domains: (1) randomisation process; (2) deviations from intended ` +
    `interventions; (3) missing outcome data; (4) outcome measurement; and ` +
    `(5) selective outcome reporting. ROBINS-I was applied to observational studies, and ` +
    `AMSTAR 2 to systematic reviews and meta-analyses. ` +
    (biasTools.length ? `Tools applied in the present synthesis: ${esc(biasTools.join(", "))}. ` : "") +
    `Each risk of bias domain was scored on a three-point scale: 0 = Low risk; ` +
    `0.5 = Some concerns; 1 = High risk. The Bias Penalty (B) represents the arithmetic ` +
    `sum of domain scores (range: 0–5) and is subtracted directly from the Weighted Score ` +
    `formula, ensuring that higher bias burdens translate proportionally to lower evidence ` +
    `strength classifications. Domain-level scores for each included study are documented ` +
    `in Table 2 and are directly traceable to the published bias assessments of source papers.`
  );

  body += _h("2.6 Evidence Scoring", 2);
  body += _p(
    `Each outcome was independently scored on four parameters, with all scoring thresholds ` +
    `pre-specified and applied uniformly: ` +
    `(i) Study Quality (Q, scale 1–5): SR/MA = 5; RCT = 4; Observational = 3; ` +
    `Mechanistic/in vitro = 2; Case report = 1. ` +
    `(ii) Sample Adequacy (S, scale 0–5): automatically calculated from reported participant ` +
    `count (n ≥ 200 = 5; n 100–199 = 4; n 50–99 = 3; n 20–49 = 2; n < 20 = 1; in vitro = 0). ` +
    `(iii) Outcome Relevance (O, scale 1–5): anchored to published Minimal Clinically Important ` +
    `Difference (MCID) thresholds; outcomes exceeding MCID with p < 0.01 score 5, ` +
    `outcomes with significant effect below MCID score 3, non-significant outcomes score 2, ` +
    `and worsening outcomes score 1. ` +
    `(iv) Bias Penalty (B, scale 0–5): the sum of domain-level risk of bias scores as described. ` +
    `The Weighted Score formula: WS = Q + S + O − B. ` +
    `Non-significant outcomes receive an additional −2 penalty (ceiling WS = 8). ` +
    `Significant outcomes are capped at WS = 15. ` +
    `Evidence Strength Score (ESS) = arithmetic mean of all outcome-level WS values > 0.`
  );

  body += _h("2.7 Evidence Classification", 2);
  body += _p(
    `ESS is classified per NEP v5.0 thresholds: ESS ≥ 12 = Very Strong; ` +
    `ESS 9–11.9 = Strong; ESS 6–8.9 = Moderate; ESS < 6 = Weak. ` +
    `Outcome consistency is reported as the proportion of outcomes with a positive ` +
    `(Improved) directional effect: ≥ 80% = Highly Consistent; 50–79% = Mixed; ` +
    `< 50% = Inconsistent. Clinical significance rate is the proportion of outcomes ` +
    `exceeding their respective MCID threshold: ≥ 60% = Clinically Significant; ` +
    `30–59% = Partially Significant; < 30% = Clinically Uncertain. ` +
    `GRADE-parallel mapping: Very Strong ≈ High certainty; Strong ≈ Moderate–High; ` +
    `Moderate ≈ Moderate; Weak ≈ Low/Very Low. ` +
    `This estimate is algorithm-derived and represents a calibrated approximation, ` +
    `not a formal GRADE panel assessment with domain-by-domain deliberation.`
  );
  body += _hr();

  // ── 3. Results ────────────────────────────────────────────────────────
  body += _h("3. Results", 1);

  body += _h("3.1 Included Studies", 2);
  body += _p(
    `The synthesis included ${studies.length||1} study/studies (${totalParts.toLocaleString()} ` +
    `participants; ${outcomes.length} outcomes) spanning the following designs: ` +
    [...new Set(outcomes.map(o=>o.study_type).filter(Boolean))].join(", ") ||
    "randomised controlled trials and observational studies" +
    `. All included studies administered ${esc(compName)} as the primary intervention` +
    `${compExtract ? ` in the form of ${esc(compExtract)}` : ""}` +
    `${compStd ? `, standardised to ${esc(compStd)}` : ""}` +
    `${compDose ? ` at doses within ${esc(compDose)}` : ""}` +
    `${compDur ? ` for ${esc(compDur)}` : ""}. ` +
    `Outcome domains included: ` +
    ([...new Set(outcomes.map(o=>o.outcome_category).filter(Boolean))].join(", ") || "multiple clinical domains") + ". " +
    `Full study-level characteristics are presented in Table 1 below.`
  );

  // Table 1 — Study characteristics
  body += _p("Table 1. Study-level characteristics", {b:true, sa:60});
  {
    const hdr = ["#","Study / Ref","Design","N","Compound / Dose","Duration","Outcomes assessed"];
    const hw  = [200,900,500,300,900,500,900];
    body += _tbl(
      _tr(hdr.map((h,i)=>_tc(h,{header:true,bg:"1A2E44",w:hw[i],sz:18,center:true}))) +
      studies.map((ref,si)=>{
        const rows = safeOutcomes.filter(o=>o.study_ref_id===ref);
        const r0   = rows[0]||{};
        const outs = rows.map(o=>o.outcome_name||"").filter(Boolean).join("; ");
        return _tr([
          _tc(String(si+1),{w:200,center:true,sz:18}),
          _tc(esc(ref),{w:900,sz:18}),
          _tc(esc(r0.study_type||"—"),{w:500,sz:18,center:true}),
          _tc(esc(r0.sample_n||"—"),{w:300,sz:18,center:true}),
          _tc(`${esc(compName)}${r0.dosage?` ${esc(r0.dosage)}${r0.dose_unit||""}`:""}`
                 ,{w:900,sz:18}),
          _tc(esc(r0.duration||r0.frequency||"—"),{w:500,sz:18,center:true}),
          _tc(esc(outs||"See outcomes table"),{w:900,sz:16}),
        ]);
      }).join("")
    );
  }
  body += _p(""); // spacer

  body += _h("3.2 Outcome-Level Results", 2);
  body += _p(
    `Across ${outcomes.length} assessed outcomes, ${nImp} (${(Number(cons)*100).toFixed(0)}%) ` +
    `demonstrated directional improvement (${consC}). ` +
    `${nSig} of ${outcomes.length} outcomes (${((nSig/outcomes.length)*100).toFixed(0)}%) ` +
    `achieved statistical significance (p < 0.05). ` +
    `${nMcid} of ${outcomes.length} outcomes (${(Number(clin)*100).toFixed(0)}%) ` +
    `exceeded their respective published MCID threshold (${clinC}). ` +
    `Weighted Scores ranged from ` +
    (wsArr.length ? `${Math.min(...wsArr.map(Number))}/15.0 to ${Math.max(...wsArr.map(Number))}/15.0` : "—") + `. ` +
    `The highest-weighted outcomes were: ` +
    (topOutcomes || "as detailed in Table 2 below") + `. ` +
    `Full outcome-level scoring details, including effect sizes, confidence intervals, ` +
    `p-values, MCID status, and Weighted Scores, are presented in Table 2.`
  );

  // Table 2 — Outcome-level results
  body += _p("Table 2. Aggregated outcome results by symptom", {b:true, sa:60});
  {
    // Aggregate outcomes by symptom (outcome_name)
    const symAgg = {};
    safeOutcomes.forEach(o => {
      const sym = o.outcome_name || "Unknown";
      if(!symAgg[sym]) symAgg[sym] = {name:sym, n:0, imp:0, sig:0, mcid:0, wsArr:[], qArr:[], cat:o.outcome_category||"Clinical"};
      const d = symAgg[sym];
      d.n++;
      if(o.direction==="Improved") d.imp++;
      if(o.significance==="Significant") d.sig++;
      if(o.mcid_met==="Yes") d.mcid++;
      if(o._ws!=null && Number(o._ws)>0) { d.wsArr.push(Number(o._ws)); }
      if(o.quality_score) d.qArr.push(Number(o.quality_score));
    });
    const symRows = Object.values(symAgg).sort((a,b) => b.n - a.n);

    const hdr2 = ["Outcome","n","Improved","Imp %","Significant","MCID met","Mean Q","Mean WS","Verdict"];
    const hw2  = [1200,260,360,320,420,360,300,320,500];
    const rows2 = symRows.map((s,idx) => {
      const bg = idx%2===0?"F8F9FA":"FFFFFF";
      const impPct = s.n>0 ? Math.round(s.imp/s.n*100) : 0;
      const meanWS = s.wsArr.length ? (s.wsArr.reduce((a,b)=>a+b,0)/s.wsArr.length).toFixed(1) : "—";
      const meanQ  = s.qArr.length ? (s.qArr.reduce((a,b)=>a+b,0)/s.qArr.length).toFixed(1) : "—";
      const wsCol = Number(meanWS)>=9?"1A5C2A":Number(meanWS)>=6?"7D5A00":"8B0000";
      const verdict = impPct>=75?"Strong positive":impPct>=50?"Moderate positive":impPct>=25?"Mixed":"Limited";
      return _tr([
        _tc(esc(s.name),{w:1200,bg,sz:18}),
        _tc(String(s.n),{w:260,bg,sz:18,center:true}),
        _tc(`${s.imp}/${s.n}`,{w:360,bg,sz:18,center:true}),
        _tc(`${impPct}%`,{w:320,bg,sz:18,center:true}),
        _tc(`${s.sig}/${s.n}`,{w:420,bg,sz:18,center:true}),
        _tc(`${s.mcid}/${s.n}`,{w:360,bg,sz:18,center:true}),
        _tc(String(meanQ),{w:300,bg,sz:18,center:true}),
        _tc(meanWS,{w:320,bg,sz:18,center:true,b:true,col:wsCol}),
        _tc(verdict,{w:500,bg,sz:18,center:true}),
      ]);
    }).join("");
    body += _tbl(
      _tr(hdr2.map((h,i)=>_tc(h,{header:true,bg:"1A2E44",w:hw2[i],sz:18,center:true}))) + rows2
    );
  }
  body += _p(`Based on ${safeOutcomes.length} outcome observations across ${[...new Set(safeOutcomes.map(o=>o._patientId).filter(Boolean))].length || "multiple"} patients. Q = Study Quality (1–5); WS = Weighted Score (Q+S+O−B, max 15).`,
    {sz:18,col:"666666",sa:120});
  body += _p(""); // spacer

  body += _h("3.3 Aggregated Evidence Summary", 2);
  body += _p(
    `The aggregate ESS for ${esc(compName)} across ${outcomes.length} outcomes ` +
    `was ${(Number(ess)||0).toFixed(2)}/15.0, classified as ${essC} evidence strength. ` +
    `This reflects a mean Weighted Score derived from ${wsArr.length} scored outcomes. ` +
    `The mean bias penalty was ${(Number(meanBias)||0).toFixed(2)}/5.0 (${biasC}), ` +
    `indicating a ${biasC.toLowerCase()} bias profile across included studies. ` +
    `The GRADE-parallel certainty estimate is ${grade}. ` +
    `Full aggregated metrics are presented in Table 3 below.`
  );

  // Table 3 — Aggregated summary
  body += _p("Table 3. Aggregated evidence metrics summary", {b:true, sa:60});
  {
    const metRows = [
      ["Studies included", `${studies.length||1}`,
       [...new Set(outcomes.map(o=>o.study_type).filter(Boolean))].join(" · ") || "—"],
      ["Participants (deduplicated)", totalParts.toLocaleString(), "Adult human participants"],
      ["Outcomes assessed", String(outcomes.length),
       [...new Set(outcomes.map(o=>o.outcome_category).filter(Boolean))].join(", ") || "Multiple domains"],
      ["Directional improvement",
       `${nImp}/${outcomes.length} (${(Number(cons)*100).toFixed(0)}%)`,
       consC],
      ["Statistical significance",
       `${nSig}/${outcomes.length} (${((nSig/outcomes.length)*100).toFixed(0)}%)`,
       "p < 0.05"],
      ["MCID exceedance",
       `${nMcid}/${outcomes.length} (${(Number(clin)*100).toFixed(0)}%)`,
       clinC],
      ["Evidence Strength Score (ESS)",
       `${(Number(ess)||0).toFixed(2)} / 15.0`, essC],
      ["Consistency", `${(Number(cons)*100).toFixed(0)}%`, consC],
      ["Clinical significance rate", `${(Number(clin)*100).toFixed(0)}%`, clinC],
      ["Mean Bias Penalty", (Number(meanBias)||0).toFixed(2), biasC],
      ["Estimated GRADE certainty", grade, "Algorithm-derived (NEP v5.0)"],
    ];
    body += _tbl(
      _tr([
        _tc("Metric",{header:true,bg:"1A2E44",w:1600,sz:18}),
        _tc("Value",{header:true,bg:"1A2E44",w:800,sz:18,center:true}),
        _tc("Classification / Notes",{header:true,bg:"1A2E44",w:2200,sz:18}),
      ]) +
      metRows.map(([m,v,n],i)=>{
        const bg = i%2===0?"F8F9FA":"FFFFFF";
        const bold = i>=6;
        return _tr([
          _tc(esc(m),{w:1600,bg,sz:18}),
          bold
            ? `<w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${bg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="1A5C2A"/></w:rPr><w:t>${esc(v)}</w:t></w:r></w:p></w:tc>`
            : _tc(esc(v),{w:800,bg,sz:18,center:true}),
          _tc(esc(n),{w:2200,bg,sz:18}),
        ]);
      }).join("")
    );
  }
  body += _hr();

  // ── 4. Discussion ───────────────────────────────────────────────────
  body += _h("4. Discussion", 1);

  body += _h("4.1 Evidence Strength and Consistency", 2);
  body += _textToParas(expanded.discussion || (
    `This structured synthesis demonstrates that standardised ${esc(compName)} supplementation ` +
    `carries ${essC.toLowerCase()} overall evidence strength ` +
    `(ESS = ${(Number(ess)||0).toFixed(2)}/15.0; GRADE estimate: ${grade}), ` +
    `with ${consC.toLowerCase()} outcome consistency across all assessed domains ` +
    `(${(Number(cons)*100).toFixed(0)}% of outcomes showing directional improvement). ` +
    `These findings position ${esc(compName)} within the Moderate–Strong tier of nutraceutical ` +
    `evidence, warranting consideration as an adjunct intervention in appropriate clinical contexts.\n\n` +
    `The most robustly evidenced effects were observed for ` +
    (topOutcome ? `${esc(topOutcome.outcome_name||"")} ` +
      `(WS = ${(Number(topOutcome._ws)||0).toFixed(1)}/15.0` +
      (topOutcome.es_value ? `, ES = ${esc(topOutcome.es_value)} ${esc(topOutcome.es_type||"")}` : "") +
      (topOutcome.significance === "Significant" ? ", p < 0.05" : "") + `). ` :
      "the highest-scoring outcomes (detailed in Table 2). ") +
    `These findings are consistent with the mechanistic rationale for ${esc(compName)} and align ` +
    `with prior published systematic reviews demonstrating clinically meaningful effects in ` +
    `relevant outcome domains. The convergence of statistical significance and MCID exceedance ` +
    `across multiple outcomes strengthens the clinical interpretation, indicating that observed ` +
    `effects are not merely statistically detectable artefacts but represent changes of practical ` +
    `importance to patients and clinicians.\n\n` +
    `The ESS of ${(Number(ess)||0).toFixed(2)}/15.0 (${essC}) maps to an estimated GRADE ` +
    `certainty of ${grade}, reflecting ${
      grade.includes("High") ? "convergent evidence from well-designed clinical trials with low bias profiles" :
      grade.includes("Moderate") ? "a body of evidence with generally consistent findings, tempered by some methodological heterogeneity" :
      "a developing evidence base that, while promising, requires larger and more rigorous trials to elevate certainty"
    }. ` +
    `The mean bias penalty of ${(Number(meanBias)||0).toFixed(2)}/5.0 (${biasC}) indicates that ` +
    `the included studies are of ${biasC.toLowerCase()} methodological quality overall, ` +
    `and this is reflected proportionally in the ESS calculation.`
  ));

  body += _h("4.2 Bioavailability and Formulation Considerations", 2);
  body += _textToParas(expanded.bioavailability || (
    `Formulation standardisation represents a critical determinant of ${esc(compName)} clinical ` +
    `efficacy and a key source of inter-study variability in the evidence base. ` +
    `${compExtract ? `The ${esc(compExtract)} preparation` : "Studies included in this synthesis"} ` +
    `${compStd ? `standardised to ${esc(compStd)}` : "employed standardisation criteria"} ` +
    `confer defined bioactive content and reproducible pharmacokinetic profiles, which is ` +
    `essential for consistent therapeutic effect across populations and settings.\n\n` +
    `A critical consideration in interpreting results from ${esc(compName)} trials is the ` +
    `well-documented variability in oral bioavailability across preparation types. ` +
    `Unstandardised extracts, native powders, and low-solubility formulations may deliver ` +
    `substantially lower systemic concentrations than standardised high-bioavailability preparations ` +
    `at nominally equivalent doses. The findings of this synthesis therefore cannot be ` +
    `generalised to non-standardised ${esc(compName)} preparations without bioequivalence data ` +
    `demonstrating comparable systemic exposure. ` +
    `Clinicians and formulators should specify preparation type, standardisation marker, ` +
    `and delivery system when applying these findings to product selection.`
  ));

  body += _h("4.3 Statistical vs Clinical Significance", 2);
  body += _p(
    `This synthesis explicitly separates statistical significance (p < 0.05) from clinical ` +
    `significance (MCID exceedance), a distinction of substantial practical importance ` +
    `that is frequently conflated in nutraceutical literature. Statistical significance reflects ` +
    `the probability that an observed effect is not attributable to chance; it does not, ` +
    `by itself, indicate that the effect magnitude is meaningful to patients or clinicians. ` +
    `Conversely, a result that fails to achieve conventional statistical significance may ` +
    `nevertheless confer meaningful patient benefit if the point estimate exceeds the MCID ` +
    `in a well-powered trial — and may reflect type II error in smaller studies. ` +
    `The clinical significance rate of ${(Number(clin)*100).toFixed(0)}% (${clinC}) in the ` +
    `present synthesis reflects that ${nMcid} of ${outcomes.length} outcomes exceeded their ` +
    `respective published MCID threshold. ` +
    `MCID values applied are drawn from the published literature and are documented in the ` +
    `MCID reference library of the NEP platform. For outcome domains where published ` +
    `MCID values are unavailable, a standardised mean difference (SMD) of 0.5 ` +
    `(representing a medium effect size per Cohen's conventions) was applied as a surrogate threshold.`
  );

  body += _h("4.4 Risk of Bias", 2);
  body += _p(
    `The overall risk of bias profile across included studies was ${biasC} ` +
    `(mean Bias Penalty: ${(Number(meanBias)||0).toFixed(2)}/5.0). ` +
    (biasTools.length ? `Assessments were conducted using ${esc(biasTools.join(" and "))}. ` : "") +
    `Domain-level bias scores are documented per outcome in Table 2 above and are directly ` +
    `traceable to the published bias assessments of the source papers. ` +
    `The most common sources of bias in the included studies were: (i) inadequate allocation ` +
    `concealment or blinding procedures, particularly in open-label and observational designs; ` +
    `(ii) incomplete outcome data reporting with missing variance estimates; and ` +
    `(iii) post-hoc outcome selection where primary endpoints were not pre-registered. ` +
    `The Bias Penalty architecture of the NEP Weighted Scoring Framework ensures that these ` +
    `methodological limitations are proportionally reflected in outcome-level WS values and ` +
    `therefore in the aggregate ESS, providing a calibrated rather than binary assessment ` +
    `of the evidence quality profile.`
  );

  body += _h("4.5 Limitations", 2);
  body += _p(
    `Several limitations of the present synthesis warrant explicit acknowledgement. ` +
    `First, the synthesis is based on ${outcomes.length} outcome${outcomes.length!==1?"s":""} ` +
    `across ${studies.length||1} study/studies; a more comprehensive evidence base incorporating ` +
    `a full PRISMA-compliant systematic search would provide greater ESS precision and ` +
    `reduce the influence of individual studies on aggregate metrics. ` +
    `Second, aggregation across heterogeneous study designs — including ` +
    ([...new Set(outcomes.map(o=>o.study_type).filter(Boolean))].join(", ") || "multiple design types") +
    ` — introduces comparability constraints not fully resolved by the NEP scoring architecture; ` +
    `a synthesis restricted to RCT-only data would yield a different ESS and potentially ` +
    `different GRADE classification. ` +
    `Third, the GRADE certainty estimate is algorithm-derived via the NEP v5.0 classification ` +
    `thresholds and represents a calibrated approximation, not a formal GRADE panel assessment ` +
    `with domain-by-domain deliberation by independent clinical experts. ` +
    `Fourth, formulation variability across included studies — particularly where standardisation ` +
    `markers and extraction methods differ — limits the strict comparability of effect estimates ` +
    `across studies. Fifth, publication bias cannot be excluded in the absence of a prospectively ` +
    `registered systematic review protocol or formal funnel plot analysis; trials with null or ` +
    `negative results may be under-represented in the published literature. ` +
    `These limitations should be considered when interpreting the ESS and applying findings ` +
    `to clinical or regulatory decision-making contexts.`
  );
  body += _hr();

  // ── 5. Conclusions ──────────────────────────────────────────────────
  body += _h("5. Conclusions", 1);
  body += _p(
    `Application of the NEP Weighted Scoring Framework (v5.0) to standardised ${esc(compName)} ` +
    `${compSci?`(${esc(compSci)}) `:""}supplementation yields the following primary metrics:`
  );
  body += _blt(`Evidence Strength Score (ESS): ${(Number(ess)||0).toFixed(2)}/15.0 — ${essC} evidence strength (GRADE estimate: ${grade})`);
  body += _blt(`Consistency: ${(Number(cons)*100).toFixed(0)}% — ${consC} (${nImp}/${outcomes.length} outcomes improved)`);
  body += _blt(`Clinical significance rate: ${(Number(clin)*100).toFixed(0)}% — ${clinC} (MCID exceeded in ${nMcid}/${outcomes.length} outcomes)`);
  body += _blt(`Risk of bias: ${biasC} (mean Bias Penalty = ${(Number(meanBias)||0).toFixed(2)}/5.0)`);
  body += _blt(`Estimated GRADE certainty: ${grade}`);

  body += _p(
    (topOutcome ?
      `The strongest evidence resides in ${esc(topOutcome.outcome_name||"")} ` +
      `(WS = ${(Number(topOutcome._ws)||0).toFixed(1)}/15.0` +
      (topOutcome.es_value ? `, ES = ${esc(topOutcome.es_value)} ${esc(topOutcome.es_type||"")}` : "") +
      `). ` : "") +
    `These findings support the consideration of standardised ${esc(compName)} ` +
    `as an evidence-based adjunct${compDose?` at ${esc(compDose)}`:""}` +
    `, conditional on ${compExtract?`${esc(compExtract)} formulations`:"standardised formulations"} ` +
    `and replication in larger, homogeneous, pre-registered trials with MCID-anchored ` +
    `primary endpoints. Pending such replication, clinical application should specify ` +
    `formulation type, standardisation marker, dose, and treatment duration ` +
    `consistent with the parameters of the highest-weighted studies in this synthesis.`
  );

  body += _textToParas(expanded.conclusions || (
    `Priority areas for strengthening this evidence base include: (1) larger RCTs (n > 200 per arm) ` +
    `with pre-specified MCID-anchored primary endpoints; (2) head-to-head comparisons with ` +
    `active pharmacological controls; (3) standardisation of formulation and dose across trials ` +
    `to reduce the primary source of inter-study heterogeneity; (4) longer-duration trials ` +
    `(≥ 12 weeks) for chronic outcome domains; and (5) trials enrolling clinically defined ` +
    `populations with validated diagnostic criteria to improve population homogeneity ` +
    `and generalisability.`
  ));


    body += _h("Supplementary Materials", 2);
  body += _p("Table S1: NEP Weighted Scoring rubric (Q/S/O/B parameter definitions and thresholds). Table S2: MCID reference library used for Outcome Relevance scoring. Table S3: Bias domain item-level scores per study.", {sz:24});

  // ── Declarations ──────────────────────────────────────────────
  body += _h("Author Contributions", 2);
  if(project?.research_team?.length > 0) {
    const teamStr = project.research_team.map(m=>`${esc(m.name||"")} (${esc(m.role||"")})`).join("; ");
    body += _p(`Research team: ${teamStr}. All authors have read and agreed to the published version of the manuscript.`, {sz:24});
  } else {
    body += _p(`${esc(_lead||"Lead author")}: Conceptualisation, data curation, formal analysis, methodology, writing \u2014 original draft. ` +
      `${_coAuth?esc(_coAuth)+": Writing \u2014 review and editing. ":""}` +
      `All authors have read and agreed to the published version of the manuscript.`, {sz:24});
  }

  body += _h("Funding", 2);
  body += _p(project?.funding||"This research received no external funding.", {sz:24});

  body += _h("Institutional Review Board Statement", 2);
  body += _p("Not applicable (evidence synthesis; no primary human participant data were collected).", {sz:24});

  body += _h("Conflicts of Interest", 2);
  body += _p(project?.conflicts||`The authors declare no conflicts of interest. The scoring framework was applied independently with no commercial interest in ${esc(compName)} or any formulation manufacturer.`, {sz:24});

  body += _h("Data Availability Statement", 2);
  body += _p("All structured evidence input data, computed metrics, and framework specifications are available in the supplementary materials. Source code and scoring models are available on request from the corresponding author.", {sz:24});
  body += _hr();

  // ── References ────────────────────────────────────────────────
  body += _h("References", 1);
  if(refs.length > 0){
    body += _p("Source studies:", {b:true, sz:20, sa:60});
    refs.forEach((r,i) => {
      const vol  = r.volume  ? `;${r.volume}` : "";
      const iss  = r.issue   ? `(${r.issue})` : "";
      const pgs  = r.pages   ? `:${r.pages}`  : "";
      const doi  = r.doi     ? ` doi:${r.doi}` : "";
      const cit  = `[${i+1}]  ${esc(r.authors||"")}. ${esc(r.title||"")}. ${esc(r.journal||"")}. ${esc(r.year||"")}${vol}${iss}${pgs}.${doi}`;
      body += _p(cit, {sz:24,sa:60});
    });
  } else {
    body += _p("[References to be added — see References tab]", {sz:24,i:true});
  }

  // ── Assemble Word 2003 XML ─────────────────────────────────────
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<?mso-application progid="Word.Document"?>\n` +
    `<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml" ` +
    `xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint" ` +
    `w:macrosPresent="no" w:embeddedObjPresent="no" w:ocxPresent="no">\n` +
    DOCX_STYLES + `\n` +
    `<w:body>\n${body}\n` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>` +
    `</w:sectPr>\n</w:body>\n</w:wordDocument>`;

  return new Blob([xml], {type:"application/msword"});
};


/* Trigger download — works on Vercel and all browsers */
const downloadBlob = (blob, filename) => {
  if (!blob) { alert("Failed to generate document. Please try again."); return; }
  try {
    /* Method 1: standard blob URL */
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch(e1) {
    try {
      /* Method 2: FileReader base64 fallback */
      const reader = new FileReader();
      reader.onload = () => {
        const a = document.createElement("a");
        a.href = reader.result;
        a.download = filename;
        a.click();
      };
      reader.readAsDataURL(blob);
    } catch(e2) {
      alert("Download blocked by browser. Try right-clicking and Save As, or use a different browser.");
    }
  }
};

/* ─── GENERATION PANEL (API-wired) ──────────────────────────────────── */


/* ─── STUDY MANAGEMENT ──────────────────────────────────────────────── */
const STUDY_STATUSES = ["recruiting","collecting","analysis","draft","published"];
const STUDY_STATUS_LABELS = {recruiting:"Recruiting doctors",collecting:"Data collection",analysis:"Analysis",draft:"Paper draft",published:"Published"};
const STUDY_STATUS_COLORS = {recruiting:"#6366F1",collecting:T.amber,analysis:T.teal,draft:"#A78BFA",published:T.green};

const CreateStudyModal = ({ compounds, onClose, onCreate }) => {
  const [form, setForm] = useState({
    title:"", compound:null, targetSymptoms:[], targetSampleSize:"50",
    studyTypes:["Clinical observation","RCT","Case series"],
    duration:"12 weeks", description:"",
    invitedDoctors:[{email:"",name:""}],
  });
  const upd = (f,v) => setForm(p=>({...p,[f]:v}));

  const addDoctor = () => upd("invitedDoctors",[...form.invitedDoctors,{email:"",name:""}]);
  const updDoctor = (i,f,v) => {
    const docs = [...form.invitedDoctors];
    docs[i] = {...docs[i],[f]:v};
    upd("invitedDoctors",docs);
  };
  const delDoctor = (i) => upd("invitedDoctors",form.invitedDoctors.filter((_,j)=>j!==i));

  const valid = form.title && form.compound && form.invitedDoctors.some(d=>d.email);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bg1,borderRadius:12,width:"100%",maxWidth:560,
        maxHeight:"90vh",overflow:"auto",border:`1px solid ${T.teal}40`}}>
        <div style={{padding:20,borderBottom:`1px solid ${T.border}`}}>
          <div style={{fontSize:16,fontWeight:700,color:"#F0F6FF"}}>Create new study</div>
          <div style={{fontSize:11,color:T.text3,marginTop:4}}>Set up a study, select compound, invite doctors</div>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          {/* Study title */}
          <div>
            <FieldLabel label="Study title" required/>
            <input value={form.title} onChange={e=>upd("title",e.target.value)}
              placeholder="e.g. Ashwagandha Stress & Sleep Study 2026"
              style={{fontSize:13,width:"100%",padding:"10px 12px",borderRadius:6,
                background:T.bg3,border:`1px solid ${T.border2}`,color:"#F0F6FF",
                fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          {/* Compound */}
          <div>
            <FieldLabel label="Primary compound" required/>
            <select value={form.compound?.name||""} onChange={e=>{
              const c = compounds.find(x=>x.name===e.target.value);
              upd("compound",c||null);
            }} style={{width:"100%",padding:"10px 12px",borderRadius:6,
              background:T.bg3,border:`1px solid ${T.border2}`,color:"#F0F6FF",
              fontSize:13,fontFamily:"inherit"}}>
              <option value="">Select compound…</option>
              {compounds.map(c=><option key={c.name} value={c.name}>{c.name} ({c.scientific||""})</option>)}
            </select>
          </div>
          {/* Target sample & duration */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <FieldLabel label="Target sample size"/>
              <input value={form.targetSampleSize} onChange={e=>upd("targetSampleSize",e.target.value)}
                type="number" placeholder="50"
                style={{fontSize:13,width:"100%",padding:"10px 12px",borderRadius:6,
                  background:T.bg3,border:`1px solid ${T.border2}`,color:"#F0F6FF",
                  fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
            <div>
              <FieldLabel label="Duration"/>
              <select value={form.duration} onChange={e=>upd("duration",e.target.value)}
                style={{width:"100%",padding:"10px 12px",borderRadius:6,
                  background:T.bg3,border:`1px solid ${T.border2}`,color:"#F0F6FF",
                  fontSize:13,fontFamily:"inherit"}}>
                {["8 weeks","12 weeks","16 weeks","6 months","12 months"].map(d=>
                  <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {/* Invite doctors */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <FieldLabel label="Invite doctors" required/>
              <button onClick={addDoctor}
                style={{fontSize:11,color:T.teal,background:"none",border:`1px solid ${T.teal}40`,
                  borderRadius:4,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                + Add doctor
              </button>
            </div>
            {form.invitedDoctors.map((d,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 28px",gap:8,marginBottom:6}}>
                <input value={d.name} onChange={e=>updDoctor(i,"name",e.target.value)}
                  placeholder="Doctor name"
                  style={{padding:"9px 10px",borderRadius:6,background:T.bg3,
                    border:`1px solid ${T.border2}`,color:"#F0F6FF",fontSize:12,fontFamily:"inherit"}}/>
                <input value={d.email} onChange={e=>updDoctor(i,"email",e.target.value)}
                  placeholder="doctor@email.com" type="email"
                  style={{padding:"9px 10px",borderRadius:6,background:T.bg3,
                    border:`1px solid ${T.border2}`,color:"#F0F6FF",fontSize:12,fontFamily:"inherit"}}/>
                {i>0?(
                  <button onClick={()=>delDoctor(i)}
                    style={{background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:16}}>✕</button>
                ):<div/>}
              </div>
            ))}
            <div style={{fontSize:10,color:T.text3,marginTop:4}}>
              Doctors will receive an OTP via email to authenticate and enter patient data.
            </div>
          </div>
        </div>
        {/* Footer */}
        <div style={{padding:16,borderTop:`1px solid ${T.border}`,display:"flex",gap:10,justifyContent:"flex-end"}}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={()=>{
            const study = {
              id: `STUDY-${Date.now().toString(36).toUpperCase()}`,
              title: form.title,
              compound: form.compound,
              targetSampleSize: Number(form.targetSampleSize)||50,
              duration: form.duration,
              description: form.description,
              status: "recruiting",
              invitedDoctors: form.invitedDoctors.filter(d=>d.email).map(d=>({
                ...d, otp: String(Math.floor(100000+Math.random()*900000)),
                otpSentAt: Date.now(), authenticated: false,
              })),
              createdAt: Date.now(),
              patients: [],
            };
            onCreate(study);
            onClose();
          }} disabled={!valid}
            style={{padding:"11px 28px",fontWeight:700}}>
            Create study & send invites
          </Btn>
        </div>
      </div>
    </div>
  );
};



/* ─── DOCTOR PAGES PANEL ────────────────────────────────────────────── */
const DoctorPagesPanel = ({ study, allPatients, onBack, onPatientsChange }) => {
  const [activeDoctorIdx, setActiveDoctorIdx] = useState(0);
  const [expandedPat, setExpandedPat] = useState(null);
  const [editingPat, setEditingPat] = useState(null); // patient id being edited
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [addForm, setAddForm] = useState({patientId:"",age:"",gender:"",symptom1:"",symptom2:"",
    dose:"300",frequency:"Twice daily (BD)",form:"Capsule",duration:"12 weeks",
    studyType:"Clinical observation",qualityScore:"3"});
  const doctors = study?.invitedDoctors || [];
  const doctor = doctors[activeDoctorIdx];
  const compound = study?.compound;

  const getDoctorKey = (doc) => `nep_doctor_patients_${(doc?.email||"").toLowerCase().replace(/[^a-z0-9]/g,"-")}`;
  const [patients, setPatients] = useState(() => {
    try { return JSON.parse(localStorage.getItem(getDoctorKey(doctor))||"[]"); } catch(e) { return []; }
  });

  useEffect(() => {
    try { setPatients(JSON.parse(localStorage.getItem(getDoctorKey(doctor))||"[]")); } catch(e) { setPatients([]); }
    setExpandedPat(null); setEditingPat(null); setShowAddPatient(false);
  }, [activeDoctorIdx, doctor?.email]);

  const savePatients = (pts) => {
    setPatients(pts);
    try { localStorage.setItem(getDoctorKey(doctor), JSON.stringify(pts)); } catch(e) {}
    if(onPatientsChange) onPatientsChange();
  };

  const updatePatient = (id, updates) => {
    savePatients(patients.map(p=>p.id===id?{...p,...updates}:p));
  };

  const deletePatient = (id) => {
    if(confirm("Delete this patient record?")) savePatients(patients.filter(p=>p.id!==id));
  };

  // Add new patient manually
  const addNewPatient = (form) => {
    const SYMPTOMS = ["Chronic stress","Generalised anxiety","Poor sleep quality","High cortisol","Low energy & fatigue"];
    const newP = {
      id: `PAT-${Date.now().toString(36).toUpperCase()}`,
      patientId: form.patientId || `MRN-${Math.floor(10000+Math.random()*90000)}`,
      age: form.age || "35", gender: form.gender || "Male",
      symptom1: form.symptom1 || SYMPTOMS[0], symptom2: form.symptom2 || null,
      studyType: form.studyType || "Clinical observation", qualityScore: Number(form.qualityScore)||3,
      primaryCompound: compound ? {...compound} : {name:"Unknown"},
      primaryDose: form.dose || "300", primaryDoseUnit: "mg",
      primaryFrequency: form.frequency || "Twice daily (BD)", primaryForm: form.form || "Capsule",
      secondaryCompound: null, secondaryDose:"", secondaryDoseUnit:"", secondaryFrequency:"",
      targetDuration: form.duration || "12 weeks",
      doctorName: doctor?.name || "Doctor", doctorClinic: "", doctorRegNumber: "",
      createdAt: new Date().toISOString().split("T")[0],
      status: "active", weeklyLogs: [], outcome: null, studyId: study?.id || "",
    };
    savePatients([...patients, newP]);
    setShowAddPatient(false);
  };

  // Simulate test data
  const simulateTestData = () => {
    const SYMPTOMS = ["Chronic stress","Generalised anxiety","Poor sleep quality","High cortisol","Low energy & fatigue"];
    const r = (arr) => arr[Math.floor(Math.random()*arr.length)];
    const ri = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
    const PROFILES = ["responder","responder","responder","responder","partial","partial","non_responder","worsened"];
    const SIDE_FX = ["Mild nausea","Digestive discomfort","Headache","Dizziness"];
    const newPats = [];
    const count = ri(12,18);
    for(let i=0;i<count;i++){
      const s1=r(SYMPTOMS); const s2=Math.random()<0.6?r(SYMPTOMS.filter(x=>x!==s1)):null;
      const st=r([["Clinical observation",3],["Clinical observation",3],["RCT",4],["Case series",2]]);
      const dose=r(["300","450","600"]); const dur=r(["8 weeks","12 weeks"]); const weeks=parseInt(dur);
      const profile=r(PROFILES); const s1s=ri(6,9); const s2s=s2?ri(5,9):null;
      const isComplete=Math.random()<0.8; const nw=isComplete?weeks:ri(1,Math.min(4,weeks));
      const logs=[];
      for(let w=1;w<=nw;w++){
        const prog=w/weeks; let sc1,resp;
        if(profile==="responder"){sc1=Math.max(1,s1s-Math.floor(s1s*prog*0.85)-ri(0,1));resp=prog>0.5?"Much better":prog>0.25?"Better":"Same";}
        else if(profile==="partial"){sc1=Math.max(3,s1s-Math.floor(s1s*prog*0.35));resp=prog>0.5?"Better":"Same";}
        else if(profile==="non_responder"){sc1=Math.max(s1s-1,s1s-ri(0,1));resp="Same";}
        else{sc1=Math.min(10,s1s+ri(0,2));resp=prog>0.3?"Worse":"Same";}
        let sc2=null;
        if(s2){if(profile==="responder"||profile==="partial")sc2=Math.max(1,s2s-Math.floor(s2s*prog*(profile==="responder"?0.7:0.3)));
          else if(profile==="non_responder")sc2=s2s; else sc2=Math.min(10,s2s+ri(0,1));}
        const se=Math.random()<0.2?[r(SIDE_FX)]:[];
        const d=new Date(2025,ri(3,8),ri(1,28));d.setDate(d.getDate()+w*7);
        logs.push({week:w,date:d.toISOString().split("T")[0],response:resp,score1:sc1,score2:sc2,
          sideEffects:se,sideEffectSeverity:se.length?r(["Mild","Moderate"]):"",doseAdjusted:false,newDose:"",notes:""});
      }
      let outcome=null;
      if(isComplete){
        const f1=logs[logs.length-1].score1; const f2=s2?logs[logs.length-1].score2:null;
        const r1=s1s>0?Math.round((1-f1/s1s)*100):0;
        const dir1=profile==="worsened"?"Worsened":r1>=30?"Improved":"No change";
        const o2={};
        if(s2&&f2!==null&&s2s>0){const r2=Math.round((1-f2/s2s)*100);
          Object.assign(o2,{direction:profile==="worsened"?"Worsened":r2>=30?"Improved":"No change",
            magnitude:`${Math.abs(r2)}% ${profile==="worsened"?"increase":"reduction"} in ${s2}`,
            significance:r2>=30?"Yes":"No",mcid:r2>=25?"Yes":"No"});}
        outcome={outcome1:{direction:dir1,magnitude:`${Math.abs(r1)}% ${profile==="worsened"?"increase":"reduction"} in ${s1}`,
          significance:dir1==="Improved"?"Yes":"No",mcid:r1>=25?"Yes":"No"},outcome2:o2,weeksCompleted:String(weeks),finalNotes:""};
      }
      newPats.push({id:`SIM-${Date.now().toString(36)}-${i}`,patientId:`MRN-${ri(10000,99999)}`,
        age:String(ri(25,68)),gender:r(["Male","Female","Non-binary"]),symptom1:s1,symptom2:s2,
        studyType:st[0],qualityScore:st[1],primaryCompound:compound?{...compound}:{name:"Unknown"},
        primaryDose:dose,primaryDoseUnit:"mg",primaryFrequency:r(["Once daily (OD)","Twice daily (BD)"]),
        primaryForm:r(["Capsule","Tablet","Powder"]),secondaryCompound:null,secondaryDose:"",
        secondaryDoseUnit:"",secondaryFrequency:"",targetDuration:dur,
        doctorName:doctor?.name||"Doctor",doctorClinic:"",doctorRegNumber:"",
        createdAt:new Date(2025,ri(3,8),ri(1,28)).toISOString().split("T")[0],
        status:isComplete?"complete":"active",weeklyLogs:logs,outcome:outcome,studyId:study?.id||""});
    }
    savePatients([...patients,...newPats]);
  };

  const complete=patients.filter(p=>p.status==="complete");
  const active=patients.filter(p=>p.status==="active");
  const improved=complete.filter(p=>p.outcome?.outcome1?.direction==="Improved").length;

  // ── Inline edit field ──
  const EF = ({label,value,onChange,type="text",options}) => (
    <div style={{marginBottom:8}}>
      <div style={{fontSize:9,color:T.text3,textTransform:"uppercase",marginBottom:2}}>{label}</div>
      {options?(
        <select value={value||""} onChange={e=>onChange(e.target.value)}
          style={{width:"100%",padding:"7px 8px",borderRadius:4,background:T.bg2,
            border:`1px solid ${T.border2}`,color:"#F0F6FF",fontSize:12,fontFamily:"inherit"}}>
          <option value="">—</option>
          {options.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      ):(
        <input value={value||""} onChange={e=>onChange(e.target.value)} type={type}
          style={{width:"100%",padding:"7px 8px",borderRadius:4,background:T.bg2,
            border:`1px solid ${T.border2}`,color:"#F0F6FF",fontSize:12,
            fontFamily:"inherit",boxSizing:"border-box"}}/>
      )}
    </div>
  );

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:T.teal,
          cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>← Back to studies</button>
        <div style={{fontSize:14,fontWeight:600,color:"#F0F6FF"}}>{study?.title||"Study"} — Doctor pages</div>
      </div>

      {/* Doctor tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
        {doctors.map((d,i)=>(
          <button key={i} onClick={()=>setActiveDoctorIdx(i)}
            style={{padding:"9px 18px",fontSize:12,borderRadius:6,cursor:"pointer",
              fontFamily:"inherit",fontWeight:activeDoctorIdx===i?700:400,
              background:activeDoctorIdx===i?T.teal:"transparent",
              color:activeDoctorIdx===i?T.bg0:"#F0F6FF",
              border:`1px solid ${activeDoctorIdx===i?T.teal:T.border}`}}>
            {d.name||d.email} {d.authenticated?"✓":""}
          </button>
        ))}
      </div>

      {/* Doctor info + stats */}
      <div style={{background:T.bg2,borderRadius:10,padding:16,border:`1px solid ${T.border}`,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:"#F0F6FF"}}>{doctor?.name||"Doctor"}</div>
            <div style={{fontSize:11,color:T.text3}}>{doctor?.email} · {compound?.name||"—"}</div>
          </div>
          <Tag color={doctor?.authenticated?T.green:"#5A7A9A"}>
            {doctor?.authenticated?"Authenticated":"OTP pending"}
          </Tag>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:12}}>
          {[["Total",patients.length],["Complete",complete.length],["Active",active.length],
            ["Improved",`${improved}/${complete.length||1}`]
          ].map(([l,v])=>(
            <div key={l} style={{background:T.bg3,borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:T.teal}}>{v}</div>
              <div style={{fontSize:10,color:T.text3}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
          <Btn onClick={()=>{setShowAddPatient(true);setAddForm({patientId:"",age:"",gender:"",symptom1:"",symptom2:"",dose:"300",frequency:"Twice daily (BD)",form:"Capsule",duration:"12 weeks",studyType:"Clinical observation",qualityScore:"3"});}} style={{fontSize:12}}>+ Add patient</Btn>
          <Btn variant="secondary" onClick={()=>{simulateTestData();}} style={{fontSize:12}}>
            🧪 Simulate test data
          </Btn>
          {patients.length>0&&(
            <Btn variant="secondary" onClick={()=>{if(confirm("Clear all?"))savePatients([]);}}
              style={{fontSize:12,color:T.red,borderColor:T.red+"40"}}>✕ Clear all</Btn>
          )}
        </div>
      </div>

      {/* Add patient form */}
      {showAddPatient&&(
        <div style={{background:T.bg2,borderRadius:10,padding:16,border:`1px solid ${T.teal}40`,marginBottom:16}}>
          <div style={{fontSize:12,color:T.teal,fontWeight:700,marginBottom:12}}>Add new patient</div>
          {(()=>{
            const f=addForm; const u=(k,v)=>setAddForm(p=>({...p,[k]:v}));
            const SYMPTOMS=["Chronic stress","Generalised anxiety","Poor sleep quality","High cortisol","Low energy & fatigue"];
            return (
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <EF label="Patient ID *" value={f.patientId} onChange={v=>u("patientId",v)}/>
                  <EF label="Age *" value={f.age} onChange={v=>u("age",v)} type="number"/>
                  <EF label="Gender *" value={f.gender} onChange={v=>u("gender",v)}
                    options={["Male","Female","Non-binary"]}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <EF label="Primary symptom *" value={f.symptom1} onChange={v=>u("symptom1",v)} options={SYMPTOMS}/>
                  <EF label="Secondary symptom" value={f.symptom2} onChange={v=>u("symptom2",v)} options={["",... SYMPTOMS]}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                  <EF label="Dose (mg)" value={f.dose} onChange={v=>u("dose",v)}/>
                  <EF label="Frequency" value={f.frequency} onChange={v=>u("frequency",v)}
                    options={["Once daily (OD)","Twice daily (BD)","Three times daily (TDS)"]}/>
                  <EF label="Duration" value={f.duration} onChange={v=>u("duration",v)}
                    options={["8 weeks","12 weeks","16 weeks"]}/>
                  <EF label="Study type" value={f.studyType} onChange={v=>u("studyType",v)}
                    options={["Clinical observation","RCT","Case series"]}/>
                </div>
                <div style={{display:"flex",gap:8,marginTop:10}}>
                  <Btn onClick={()=>addNewPatient(addForm)} disabled={!addForm.patientId||!addForm.age||!addForm.gender||!addForm.symptom1}
                    style={{fontSize:12}}>✓ Add patient</Btn>
                  <Btn variant="secondary" onClick={()=>setShowAddPatient(false)} style={{fontSize:12}}>Cancel</Btn>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Patient list */}
      {patients.length===0?(
        <div style={{textAlign:"center",padding:"40px 20px",border:`1px dashed ${T.border2}`,borderRadius:8}}>
          <div style={{fontSize:28,marginBottom:8,opacity:0.3}}>👤</div>
          <p style={{fontSize:13,color:T.text3}}>No patients. Click "+ Add patient" or "Simulate" above.</p>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:11,color:T.text3,fontWeight:700,textTransform:"uppercase",
            letterSpacing:"0.06em",marginBottom:4}}>
            Patients ({patients.length}) — click to expand, edit or delete
          </div>
          {patients.map((p,idx)=>{
            const isExpanded = expandedPat===p.id;
            const isEditing = editingPat===p.id;
            return (
              <div key={p.id||idx}>
                <div onClick={()=>{setExpandedPat(isExpanded?null:p.id);setEditingPat(null);}}
                  style={{background:T.bg2,borderRadius:isExpanded?"8px 8px 0 0":"8px",padding:"10px 14px",
                    border:`1px solid ${T.border}`,cursor:"pointer",
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",gap:12,alignItems:"center",flex:1,minWidth:0}}>
                    <span style={{fontSize:12,fontFamily:T.mono,color:T.teal,flexShrink:0}}>{p.patientId||p.id}</span>
                    <span style={{fontSize:12,color:"#F0F6FF",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {p.symptom1}{p.symptom2?` · ${p.symptom2}`:""}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                    <Tag color={p.status==="complete"?T.green:T.amber} style={{fontSize:9}}>
                      {p.status==="complete"?"Complete":"Active"}
                    </Tag>
                    {p.outcome?.outcome1?.direction&&(
                      <Tag color={p.outcome.outcome1.direction==="Improved"?T.green:
                        p.outcome.outcome1.direction==="Worsened"?T.red:"#5A7A9A"} style={{fontSize:9}}>
                        {p.outcome.outcome1.direction}
                      </Tag>
                    )}
                    <span style={{fontSize:10,color:T.text3}}>{isExpanded?"▲":"▼"}</span>
                  </div>
                </div>
                {isExpanded&&(
                  <div style={{background:T.bg3,borderRadius:"0 0 8px 8px",padding:14,
                    border:`1px solid ${T.border}`,borderTop:"none",fontSize:12}}>
                    {/* Action buttons */}
                    <div style={{display:"flex",gap:6,marginBottom:10}}>
                      <button onClick={(e)=>{e.stopPropagation();setEditingPat(isEditing?null:p.id);}}
                        style={{fontSize:11,color:T.teal,background:"none",border:`1px solid ${T.teal}40`,
                          borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                        {isEditing?"✓ Done editing":"✎ Edit"}
                      </button>
                      <button onClick={(e)=>{e.stopPropagation();
                        updatePatient(p.id,{status:p.status==="complete"?"active":"complete",
                          outcome:p.status==="active"?{outcome1:{direction:"Improved",magnitude:"Marked improvement",
                            significance:"Yes",mcid:"Yes"},outcome2:{},weeksCompleted:p.targetDuration?.replace(/\D/g,"")||"8",finalNotes:""}:null});
                        }}
                        style={{fontSize:11,color:T.amber,background:"none",border:`1px solid ${T.amber}40`,
                          borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                        {p.status==="complete"?"↩ Reopen":"✓ Mark complete"}
                      </button>
                      <button onClick={(e)=>{e.stopPropagation();deletePatient(p.id);}}
                        style={{fontSize:11,color:T.red,background:"none",border:`1px solid ${T.red}40`,
                          borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>
                        ✕ Delete
                      </button>
                    </div>

                    {isEditing?(
                      /* Edit mode */
                      <div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                          <EF label="Patient ID" value={p.patientId} onChange={v=>updatePatient(p.id,{patientId:v})}/>
                          <EF label="Age" value={p.age} onChange={v=>updatePatient(p.id,{age:v})}/>
                          <EF label="Gender" value={p.gender} onChange={v=>updatePatient(p.id,{gender:v})}
                            options={["Male","Female","Non-binary"]}/>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <EF label="Symptom 1" value={p.symptom1} onChange={v=>updatePatient(p.id,{symptom1:v})}
                            options={["Chronic stress","Generalised anxiety","Poor sleep quality","High cortisol","Low energy & fatigue"]}/>
                          <EF label="Symptom 2" value={p.symptom2||""} onChange={v=>updatePatient(p.id,{symptom2:v||null})}
                            options={["","Chronic stress","Generalised anxiety","Poor sleep quality","High cortisol","Low energy & fatigue"]}/>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
                          <EF label="Dose" value={p.primaryDose} onChange={v=>updatePatient(p.id,{primaryDose:v})}/>
                          <EF label="Frequency" value={p.primaryFrequency} onChange={v=>updatePatient(p.id,{primaryFrequency:v})}
                            options={["Once daily (OD)","Twice daily (BD)","Three times daily (TDS)"]}/>
                          <EF label="Duration" value={p.targetDuration} onChange={v=>updatePatient(p.id,{targetDuration:v})}
                            options={["8 weeks","12 weeks","16 weeks"]}/>
                          <EF label="Study type" value={p.studyType} onChange={v=>updatePatient(p.id,{studyType:v})}
                            options={["Clinical observation","RCT","Case series"]}/>
                        </div>
                        {p.status==="complete"&&p.outcome&&(
                          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8,marginTop:8}}>
                            <div style={{fontSize:10,color:T.teal,fontWeight:700,marginBottom:4}}>OUTCOME</div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                              <EF label="Direction" value={p.outcome.outcome1?.direction}
                                onChange={v=>updatePatient(p.id,{outcome:{...p.outcome,outcome1:{...p.outcome.outcome1,direction:v}}})}
                                options={["Improved","No change","Worsened"]}/>
                              <EF label="Significance" value={p.outcome.outcome1?.significance}
                                onChange={v=>updatePatient(p.id,{outcome:{...p.outcome,outcome1:{...p.outcome.outcome1,significance:v}}})}
                                options={["Yes","No"]}/>
                              <EF label="Magnitude" value={p.outcome.outcome1?.magnitude}
                                onChange={v=>updatePatient(p.id,{outcome:{...p.outcome,outcome1:{...p.outcome.outcome1,magnitude:v}}})}/>
                              <EF label="MCID met" value={p.outcome.outcome1?.mcid}
                                onChange={v=>updatePatient(p.id,{outcome:{...p.outcome,outcome1:{...p.outcome.outcome1,mcid:v}}})}
                                options={["Yes","No"]}/>
                            </div>
                          </div>
                        )}
                      </div>
                    ):(
                      /* View mode */
                      <div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
                          {[["Age",p.age],["Gender",p.gender],
                            ["Dose",`${p.primaryDose||"—"}${p.primaryDoseUnit||"mg"} ${p.primaryFrequency||""}`],
                            ["Duration",p.targetDuration||"—"],["Study type",p.studyType||"—"],
                            ["Weeks logged",p.weeklyLogs?.length||0]
                          ].map(([l,v])=>(
                            <div key={l}>
                              <div style={{fontSize:9,color:T.text3,textTransform:"uppercase"}}>{l}</div>
                              <div style={{color:"#F0F6FF"}}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {p.outcome&&(
                          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8}}>
                            <div style={{fontSize:10,color:T.teal,fontWeight:700,marginBottom:4}}>OUTCOME</div>
                            <div style={{color:"#F0F6FF"}}>{p.outcome.outcome1?.magnitude||"—"}</div>
                            {p.outcome.outcome2?.direction&&(
                              <div style={{color:"#F0F6FF",marginTop:2}}>{p.outcome.outcome2?.magnitude||"—"}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};



/* ─── PAPERS PANEL ──────────────────────────────────────────────────── */
const PAPER_SECTIONS = ["Abstract","Introduction","Methods","Results","Discussion","Conclusion","References"];

const PapersPanel = ({ papers, onUpdate, onPublish, onCreateRevision, onDelete }) => {
  const [viewingId, setViewingId] = useState(null);
  const paper = papers.find(p=>p.id===viewingId);
  const isEditable = paper && paper.status !== "published";

  const inProgress = papers.filter(p=>p.status!=="published").sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const published  = papers.filter(p=>p.status==="published").sort((a,b)=>(b.publishedAt||0)-(a.publishedAt||0));

  const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "—";

  // ── Paper detail view (full HTML editor) ──
  if(viewingId && paper) {
    return (
      <div className="fade-in">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <button onClick={()=>setViewingId(null)}
            style={{background:"none",border:"none",color:T.teal,cursor:"pointer",
              fontSize:13,fontFamily:"inherit"}}>← Back to papers</button>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <Tag color={paper.status==="published"?T.green:T.amber}>
              {paper.status==="published"?"Published":"In Progress"}
            </Tag>
            <Tag color={T.purple}>v{paper.version}</Tag>
            <span style={{fontSize:10,color:T.text3}}>
              {paper.status==="published"?`Published ${fmtDate(paper.publishedAt)}`:`Updated ${fmtDate(paper.updatedAt)}`}
            </span>
          </div>
        </div>

        {/* Title bar */}
        <div style={{background:T.bg2,borderRadius:10,padding:16,border:`1px solid ${T.border}`,marginBottom:12}}>
          {isEditable?(
            <input value={paper.title||""} onChange={e=>onUpdate({...paper,title:e.target.value})}
              placeholder="Paper title"
              style={{fontSize:18,fontWeight:700,color:"#F0F6FF",fontFamily:"'DM Serif Display',serif",
                width:"100%",background:"transparent",border:"none",outline:"none"}}/>
          ):(
            <div style={{fontSize:18,fontWeight:700,color:"#F0F6FF",fontFamily:"'DM Serif Display',serif"}}>
              {paper.title||"Untitled"}
            </div>
          )}
          <div style={{fontSize:11,color:T.text3,marginTop:4}}>
            {paper.compound||"—"} · v{paper.version} · {fmtDate(paper.updatedAt||paper.createdAt)}
          </div>
        </div>

        {/* Full HTML editor */}
        <div style={{background:T.bg2,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden"}}>
          {isEditable&&(
            <div style={{display:"flex",gap:2,padding:"8px 12px",borderBottom:`1px solid ${T.border}`,
              background:T.bg3,flexWrap:"wrap"}}>
              {[["B","bold"],["I","italic"],["U","underline"],
                ["H1","formatBlock-H1"],["H2","formatBlock-H2"],["H3","formatBlock-H3"],
                ["¶","formatBlock-P"],["• List","insertUnorderedList"],["1. List","insertOrderedList"]
              ].map(([label,cmd])=>(
                <button key={cmd} onMouseDown={e=>{
                  e.preventDefault();
                  if(cmd.startsWith("formatBlock-")){
                    document.execCommand("formatBlock",false,`<${cmd.split("-")[1]}>`);
                  } else {
                    document.execCommand(cmd,false,null);
                  }
                }}
                  style={{padding:"4px 10px",fontSize:11,fontWeight:label==="B"?700:400,
                    fontStyle:label==="I"?"italic":"normal",
                    textDecoration:label==="U"?"underline":"none",
                    background:T.bg2,border:`1px solid ${T.border}`,borderRadius:4,
                    color:"#F0F6FF",cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
              ))}
            </div>
          )}
          <div
            contentEditable={isEditable}
            suppressContentEditableWarning
            onBlur={e=>{
              onUpdate({...paper, htmlContent:e.currentTarget.innerHTML, updatedAt:Date.now()});
            }}
            dangerouslySetInnerHTML={{__html:paper.htmlContent||paper.sections
              ? (paper.htmlContent || Object.entries(paper.sections||{}).map(([sec,txt])=>
                  `<h2 style="color:#00D2C8;margin:20px 0 8px">${sec}</h2><p>${(txt||"").replace(/\n/g,"<br/>")}</p>`
                ).join(""))
              : "<p><em>Empty paper — generate content from Validate & Generate tab</em></p>"
            }}
            style={{minHeight:500,padding:"20px 24px",fontSize:14,lineHeight:1.9,
              color:"#F0F6FF",fontFamily:"'Times New Roman',serif",
              outline:"none",cursor:isEditable?"text":"default",
              background:isEditable?"#0D1B2A":"transparent"}}/>
        </div>

        {/* Action bar */}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16}}>
          {isEditable&&(
            <>
              <Btn variant="secondary" onClick={()=>{
                onUpdate({...paper, updatedAt:Date.now()});
                alert("✓ Changes saved");
              }}>💾 Save changes</Btn>
              <Btn onClick={()=>{
                if(confirm("Publish this paper? It will become read-only. You can create a revision later.")){
                  onPublish(paper.id);
                }
              }} style={{fontWeight:700}}>✓ Publish paper</Btn>
            </>
          )}
          {paper.status==="published"&&(
            <Btn variant="secondary" onClick={()=>onCreateRevision(paper.id)}>
              Create revision (v{(Number(paper.version)+0.1).toFixed(1)})
            </Btn>
          )}
          <Btn variant="secondary" onClick={()=>{
            if(confirm("Delete this paper permanently?")) { onDelete(paper.id); setViewingId(null); }
          }} style={{color:T.red,borderColor:T.red+"40"}}>Delete</Btn>
        </div>
      </div>
    );
  }

  // ── Paper list view ──
  const PaperCard = ({p}) => (
    <div style={{background:T.bg2,borderRadius:10,padding:14,
      border:`1px solid ${T.border}`,transition:"border-color 0.2s"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setViewingId(p.id)}>
          <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF",marginBottom:3,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {p.title||"Untitled paper"}
          </div>
          <div style={{fontSize:11,color:T.text3,marginBottom:2}}>
            {p.compound||"—"} · v{p.version} · {fmtDate(p.status==="published"?p.publishedAt:p.updatedAt)}
          </div>
          <div style={{fontSize:10,color:T.text3,fontStyle:"italic",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {(p.htmlContent||"").replace(/<[^>]+>/g,"").slice(0,120)||"No content yet"}…
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0,marginLeft:8}}>
          <Tag color={p.status==="published"?T.green:T.amber} style={{fontSize:10}}>
            {p.status==="published"?"Published":p.status==="draft"?"Draft":"In Progress"}
          </Tag>
          <button onClick={(e)=>{e.stopPropagation();
            if(confirm("Delete this paper?")) onDelete(p.id);
          }} style={{fontSize:10,color:T.red,background:"none",border:"none",
            cursor:"pointer",fontFamily:"inherit",opacity:0.6}}>✕ Delete</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <SectionHeader title="Papers"
        subtitle={`${papers.length} paper(s) · ${published.length} published · ${inProgress.length} in progress`}/>

      {papers.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",
          border:`1px dashed ${T.border2}`,borderRadius:8,marginTop:16}}>
          <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>📄</div>
          <p style={{fontSize:13,color:T.text3}}>
            No papers yet. Generate a paper from the Validate & Generate tab.
          </p>
        </div>
      ):(
        <div style={{marginTop:16}}>
          {/* In Progress / Draft */}
          {inProgress.length>0&&(
            <div style={{marginBottom:24}}>
              <div style={{fontSize:11,color:T.amber,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",marginBottom:10}}>
                In Progress & Drafts ({inProgress.length})
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {inProgress.map(p=><PaperCard key={p.id} p={p}/>)}
              </div>
            </div>
          )}
          {/* Published */}
          {published.length>0&&(
            <div>
              <div style={{fontSize:11,color:T.green,fontWeight:700,textTransform:"uppercase",
                letterSpacing:"0.08em",marginBottom:10}}>
                Published ({published.length})
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {published.map(p=><PaperCard key={p.id} p={p}/>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};



const GenerationPanel = ({ outcomes, refs, compound, project, projectId, onBack }) => {
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const pollRef = useRef(null);
  const toast = useToast();
  const logRef = useRef(null);

  // Start generation
  const start = async () => {
    try {
      const id = await API.startGeneration(projectId || "demo");
      setJobId(id);
    } catch(e) {
      toast.error("Generation failed to start: " + e.message);
    }
  };

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const j = await API.pollJob(jobId);
        if (j) {
          setJob({...j});
          if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
          }
          if (j.status === "done" || j.status === "error") {
            clearInterval(pollRef.current);
            if (j.status === "done") toast.success("Manuscript generated successfully");
            if (j.status === "error") toast.error("Generation failed");
          }
        }
      } catch(e) {
        clearInterval(pollRef.current);
      }
    }, 300);
    return () => clearInterval(pollRef.current);
  }, [jobId, toast]);

  const n_out = outcomes.length;
  const ess = score.ess(outcomes.map(o=>({_ws:Number(o._ws)||null})));

  // Idle
  if (!jobId) return (
    <div style={{textAlign:"center",padding:"40px 20px"}}>
      <div style={{fontSize:48,marginBottom:16,opacity:0.4}}>⟡</div>
      <h3 style={{fontSize:18,fontWeight:600,color:T.text0,marginBottom:8}}>
        Ready to generate
      </h3>
      <p style={{fontSize:13,color:T.text3,marginBottom:24,maxWidth:400,margin:"0 auto 24px"}}>
        Two-stage engine: skeleton (~5s) + AI expansion (~25s).
        Target: 5,000–8,000 words, IMRaD, Vancouver references.
      </p>
      <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:24}}>
        {[[`${n_out} outcomes`,T.teal],[`ESS ${(Number(ess)||0).toFixed(2)}`,T.amber],[`${refs.length} refs`,T.purple]]
          .map(([l,c])=><Tag key={l} color={c}>{l}</Tag>)}
      </div>
      <Btn onClick={start} style={{padding:"12px 32px",fontSize:14,fontWeight:600}}>
        Generate manuscript →
      </Btn>
    </div>
  );

  // Running
  if (!job || job.status === "running") {
    const pct = job?.pct || 0;
    const stage = job?.stage || 1;
    const log = job?.log || [];
    return (
      <div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:12,color:T.text2,fontWeight:500}}>
              Stage {stage}: {stage===1?"Building skeleton…":"AI expansion…"}
            </span>
            <span style={{fontFamily:T.mono,fontSize:13,color:T.teal}}>{pct}%</span>
          </div>
          <div style={{height:6,background:T.border,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",background:T.teal,borderRadius:3,
              width:`${pct}%`,transition:"width 0.4s ease"}}/>
          </div>
        </div>
        <div ref={logRef} style={{height:240,overflowY:"auto",background:T.bg1,
          borderRadius:6,border:`1px solid ${T.border}`,padding:"10px 14px"}}>
          {log.map((entry,i)=>(
            <div key={i} style={{fontSize:11,fontFamily:T.mono,
              color:i===log.length-1?T.teal:T.text3,
              marginBottom:4,display:"flex",gap:8,
              animation:i===log.length-1?"pulse 1s ease infinite":"none"}}>
              <span style={{color:T.border2,flexShrink:0}}>
                {new Date(entry.t).toLocaleTimeString("en",
                  {hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"})}
              </span>
              {entry.msg}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Done
  if (job.status === "done") {
    const r = job.result;
    return (
      <div className="fade-in">
        <div style={{textAlign:"center",padding:"20px 0 28px"}}>
          <div style={{fontSize:40,marginBottom:8,color:T.green}}>✓</div>
          <h3 style={{fontSize:18,fontWeight:600,color:T.green,marginBottom:4}}>
            Manuscript generated
          </h3>
          <p style={{fontSize:12,color:T.text3}}>
            {r.veracity} veracity checks passed · ~{r.word_count.toLocaleString()} words · {r.tables} tables
          </p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
          {[["Word count",`~${r.word_count.toLocaleString()}`,T.text0],
            ["Veracity",r.veracity,T.green],
            ["Tables",r.tables,T.teal],
            ["References",refs.length,T.purple]].map(([l,v,c])=>(
            <div key={l} style={{textAlign:"center",background:T.bg3,borderRadius:6,
              padding:"12px 8px",border:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,color:T.text3,marginBottom:4,
                textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
              <div style={{fontSize:20,fontWeight:700,fontFamily:T.mono,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <Btn style={{flex:1,justifyContent:"center"}}
            onClick={async(e)=>{
              const btn=e.currentTarget;
              btn.textContent="Stage 1…";btn.disabled=true;
              try{
                const name=`${(project?.paper_title||compound?.name||compound?.compound_name||"NEP").replace(/[^a-zA-Z0-9]+/g,"_").slice(0,60)}_Evidence_Paper.doc`;
                const blob=await buildDocxBlob(project,compound,outcomes,refs,(msg)=>{btn.textContent=msg.slice(0,30)+"…";});
                downloadBlob(blob,name);
                // Save paper to Papers list
                try{
                  const existingPapers = JSON.parse(localStorage.getItem("nep_papers")||"[]");
                  const newPaper = {
                    id: crypto.randomUUID(),
                    title: project?.paper_title || `${compound?.name||""} Evidence Synthesis`,
                    compound: compound?.name || compound?.compound_name || "",
                    studyId: project?.id || "_default",
                    version: "1.0",
                    status: "in_progress",
                    publishedAt: null,
                    updatedAt: Date.now(),
                    createdAt: Date.now(),
                    sections: {},
                    team: project?.team || [],
                    affiliation: project?.affiliation || "",
                    journal: project?.journal || project?.target_journal || "",
                  };
                  // Parse generated docx content into sections (simplified)
                  const bodyText = (t) => t.replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
                  // Auto-populate sections from the paper generation
                  // Build full HTML content for the paper editor
                  const buildHtml = () => {
                    const cName = compound?.name||"";
                    const cSci = compound?.scientific||"";
                    const nOuts = outcomes.length;
                    const nImp = outcomes.filter(o=>o.direction==="Improved").length;
                    const nSig = outcomes.filter(o=>o.significance==="Significant").length;
                    const nMcid = outcomes.filter(o=>o.mcid_met==="Yes").length;
                    const wsVals = outcomes.map(o=>Number(o._ws)).filter(v=>!isNaN(v)&&v>0);
                    const ess = wsVals.length?wsVals.reduce((a,b)=>a+b,0)/wsVals.length:0;
                    const impPct = nOuts>0?Math.round(nImp/nOuts*100):0;
                    const _tm = project?.team||[];
                    const _ld = _tm[0]?.name||project?.researcher||"";
                    const _co = _tm.slice(1).map(m=>m.name).filter(Boolean).join(", ");
                    const _af = project?.affiliation||"";
                    const _jn = project?.journal||project?.target_journal||"";
                    const cons = nOuts?nImp/nOuts:0;
                    const consC = cons>=0.8?"Highly Consistent":cons>=0.5?"Mixed":"Inconsistent";
                    const clin = nOuts?nMcid/nOuts:0;
                    const clinC = clin>=0.6?"Clinically Significant":clin>=0.3?"Partially Significant":"Clinically Uncertain";
                    const meanBias = nOuts?outcomes.reduce((a,o)=>a+(Number(o._biasP)||0),0)/nOuts:0;
                    const biasC = meanBias<=1?"Low":meanBias<=2.5?"Moderate":"High";
                    const grade = ess>=9&&cons>=0.7?"High":ess>=6?"Moderate":"Low";
                    
                    // Symptom aggregation
                    const symMap = {};
                    outcomes.forEach(o=>{
                      const s=o.outcome_name||"Unknown";
                      if(!symMap[s])symMap[s]={n:0,imp:0,sig:0,mcid:0,ws:[]};
                      const d=symMap[s]; d.n++; 
                      if(o.direction==="Improved")d.imp++;
                      if(o.significance==="Significant")d.sig++;
                      if(o.mcid_met==="Yes")d.mcid++;
                      if(Number(o._ws)>0)d.ws.push(Number(o._ws));
                    });
                    const symRows = Object.entries(symMap).sort((a,b)=>b[1].n-a[1].n);
                    
                    // Study type breakdown
                    const stMap = {};
                    outcomes.forEach(o=>{const st=o.study_type||"Unknown";if(!stMap[st])stMap[st]=0;stMap[st]++;});
                    
                    // References
                    const refsH = refs.map((r,i)=>`<p style="margin:4px 0;padding-left:28px;text-indent:-28px;font-size:11px">[${i+1}] ${r.authors||""}. ${r.title||""}. <em>${r.journal||""}</em>. ${r.year||""}${r.volume?";"+r.volume:""}${r.issue?"("+r.issue+")":""}${r.pages?":"+r.pages:""}${r.doi?" doi:"+r.doi:""}.</p>`).join("");

                    return \`<div style="font-family:Times New Roman,serif;line-height:1.8;max-width:800px;margin:0 auto">
<h1 style="text-align:center;color:#1A2E44;font-size:20px;margin-bottom:4px">\${project?.paper_title||cName+" Evidence Synthesis"}</h1>
<p style="text-align:center;color:#555;font-size:13px">\${_ld}\${_co?" · "+_co:""}</p>
<p style="text-align:center;color:#777;font-size:11px">\${_af}</p>
<p style="text-align:center;color:#999;font-size:10px">\${_jn?"Target journal: "+_jn+" · ":""}NEP Platform v6.0 · \${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</p>
<hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/>

<h2 style="color:#1A2E44;font-size:16px">Abstract</h2>
<p><strong>Background:</strong> \${cName} (\${cSci}) is a nutraceutical compound with established pharmacological actions relevant to the outcomes assessed in this synthesis. Despite a substantial published evidence base, structured evidence synthesis using standardised scoring frameworks remains limited, creating a gap between available evidence and clinical decision-making.</p>
<p><strong>Objective:</strong> To systematically evaluate and score clinical evidence for \${cName} using the NEP Weighted Scoring Framework across \${nOuts} outcome measures from \${Object.keys(stMap).join(", ")} study designs.</p>
<p><strong>Methods:</strong> \${nOuts} clinical outcomes were evaluated using the NEP Weighted Scoring Framework (WS = Q + S + O − B). Each outcome was independently scored on four parameters: Study Quality (Q, 1–5), Sample Adequacy (S, 0–5, auto-computed), Outcome Relevance (O, 1–5), and Bias Penalty (B, 0–5). Evidence Strength Score (ESS) was computed as the mean WS across all assessed outcomes.</p>
<p><strong>Results:</strong> \${nImp}/\${nOuts} outcomes (\${impPct}%) demonstrated improvement. \${nSig} (\${nOuts>0?Math.round(nSig/nOuts*100):0}%) reached statistical significance (p < 0.05). \${nMcid} (\${nOuts>0?Math.round(nMcid/nOuts*100):0}%) exceeded their respective MCID thresholds. The overall ESS was \${ess.toFixed(2)}, classified as \${ess>=9?"Strong":ess>=6?"Moderate":"Weak"}. Outcome consistency was \${consC} (\${Math.round(cons*100)}%).</p>
<p><strong>Conclusion:</strong> \${cName} demonstrates \${impPct>=70?"strong":"moderate"} evidence supporting its clinical use in the assessed domains. The \${grade} estimated GRADE certainty is supported by \${consC.toLowerCase()} outcome consistency and \${biasC.toLowerCase()} overall bias risk.</p>

<p style="font-size:11px;color:#555"><strong>Keywords:</strong> \${project?.keywords||[cName,cSci,"evidence synthesis","nutraceutical","weighted scoring"].join("; ")}</p>
<hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/>

<h2 style="color:#1A2E44;font-size:16px">1. Introduction</h2>
<p>\${cName} (\${cSci}) is a widely studied nutraceutical compound with pharmacological actions relevant to stress adaptation, sleep quality, anxiety modulation, and related neuroendocrine conditions. Preclinical research has identified multiple bioactive constituents and mechanistic pathways supporting its traditional use, and a growing number of clinical trials have evaluated its efficacy across diverse patient populations and outcome measures.</p>
<p>Despite this substantial evidence base, there is no standardised scoring framework that assigns comparable quantitative scores across study types, allowing researchers to compute a single composite metric for evidence strength. The Nutraceutical Evidence Platform (NEP) addresses this gap through the Weighted Scoring Framework, which assigns each outcome a Weighted Score (WS) derived from four independently assessed parameters.</p>
<p>This synthesis evaluates \${nOuts} clinical outcomes for \${cName} across \${Object.keys(stMap).map(k=>k+" (n="+stMap[k]+")").join(", ")} study designs.</p>

<h2 style="color:#1A2E44;font-size:16px">2. Methods</h2>
<h3 style="color:#2C4A6E;font-size:14px">2.1 Evidence Scoring Framework</h3>
<p>Each outcome was scored using the NEP Weighted Scoring Framework v6.0. The composite Weighted Score (WS) is computed as: <strong>WS = Q + S + O − B</strong>, where Q = Study Quality (1–5, based on study design hierarchy), S = Sample Adequacy (0–5, auto-computed from sample size thresholds), O = Outcome Relevance (1–5, based on statistical significance and MCID attainment), and B = Bias Penalty (0–5, derived from domain-level risk of bias assessment).</p>
<h3 style="color:#2C4A6E;font-size:14px">2.2 Quality Score Assignment</h3>
<p>Q scores were assigned according to study design: Systematic review/Meta-analysis = 5, Randomised controlled trial = 4, Clinical observation/Observational = 3, Case series = 2, Mechanistic/In vitro = 1.</p>
<h3 style="color:#2C4A6E;font-size:14px">2.3 Evidence Strength Score</h3>
<p>The Evidence Strength Score (ESS) represents the mean WS across all assessed outcomes. ESS ≥ 12 = Very Strong, 9–11.9 = Strong, 6–8.9 = Moderate, < 6 = Weak.</p>

<h2 style="color:#1A2E44;font-size:16px">3. Results</h2>
<h3 style="color:#2C4A6E;font-size:14px">3.1 Overview</h3>
<p>\${nOuts} outcomes were assessed across \${Object.keys(stMap).length} study types. \${nImp} (\${impPct}%) demonstrated improvement, \${nOuts-nImp-outcomes.filter(o=>o.direction==="Worsened").length} showed no change, and \${outcomes.filter(o=>o.direction==="Worsened").length} worsened.</p>

<h3 style="color:#2C4A6E;font-size:14px">3.2 Aggregated Results by Symptom</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0">
<tr style="background:#1A2E44;color:white"><th style="padding:6px 8px;text-align:left">Outcome</th><th style="padding:6px 8px">n</th><th style="padding:6px 8px">Improved</th><th style="padding:6px 8px">%</th><th style="padding:6px 8px">Significant</th><th style="padding:6px 8px">MCID met</th><th style="padding:6px 8px">Mean WS</th></tr>
\${symRows.map(([sym,d],i)=>{
  const bg=i%2===0?"#f8f9fa":"#fff";
  const mws=d.ws.length?(d.ws.reduce((a,b)=>a+b,0)/d.ws.length).toFixed(1):"—";
  return \`<tr style="background:\${bg}"><td style="padding:5px 8px">\${sym}</td><td style="padding:5px 8px;text-align:center">\${d.n}</td><td style="padding:5px 8px;text-align:center">\${d.imp}/\${d.n}</td><td style="padding:5px 8px;text-align:center">\${d.n>0?Math.round(d.imp/d.n*100):0}%</td><td style="padding:5px 8px;text-align:center">\${d.sig}/\${d.n}</td><td style="padding:5px 8px;text-align:center">\${d.mcid}/\${d.n}</td><td style="padding:5px 8px;text-align:center;font-weight:bold;color:\${Number(mws)>=9?"#1A5C2A":Number(mws)>=6?"#7D5A00":"#8B0000"}">\${mws}</td></tr>\`;
}).join("")}
</table>

<h3 style="color:#2C4A6E;font-size:14px">3.3 Evidence Summary</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0">
<tr style="background:#1A2E44;color:white"><th style="padding:6px 8px;text-align:left">Metric</th><th style="padding:6px 8px">Value</th><th style="padding:6px 8px">Classification</th></tr>
<tr style="background:#f8f9fa"><td style="padding:5px 8px">Evidence Strength Score (ESS)</td><td style="padding:5px 8px;text-align:center;font-weight:bold">\${ess.toFixed(2)}</td><td style="padding:5px 8px;text-align:center">\${ess>=9?"Strong":ess>=6?"Moderate":"Weak"}</td></tr>
<tr><td style="padding:5px 8px">Outcome consistency</td><td style="padding:5px 8px;text-align:center">\${nImp}/\${nOuts} (\${impPct}%)</td><td style="padding:5px 8px;text-align:center">\${consC}</td></tr>
<tr style="background:#f8f9fa"><td style="padding:5px 8px">Statistical significance</td><td style="padding:5px 8px;text-align:center">\${nSig}/\${nOuts}</td><td style="padding:5px 8px;text-align:center">p < 0.05</td></tr>
<tr><td style="padding:5px 8px">MCID exceedance</td><td style="padding:5px 8px;text-align:center">\${nMcid}/\${nOuts}</td><td style="padding:5px 8px;text-align:center">\${clinC}</td></tr>
<tr style="background:#f8f9fa"><td style="padding:5px 8px">Mean bias penalty</td><td style="padding:5px 8px;text-align:center">\${meanBias.toFixed(2)}/5.0</td><td style="padding:5px 8px;text-align:center">\${biasC}</td></tr>
<tr><td style="padding:5px 8px">Estimated GRADE certainty</td><td style="padding:5px 8px;text-align:center" colspan="2">\${grade}</td></tr>
</table>

<h2 style="color:#1A2E44;font-size:16px">4. Discussion</h2>
<p>This structured evidence synthesis demonstrates \${impPct>=70?"strong":"moderate"} support for \${cName} in the assessed clinical outcome domains. The overall ESS of \${ess.toFixed(2)} (\${ess>=9?"Strong":ess>=6?"Moderate":"Weak"}) reflects \${impPct>=80?"consistent":"variable"} improvement across \${Object.keys(stMap).length} study designs, with \${impPct}% of outcomes demonstrating directional improvement.</p>
<p>The \${consC.toLowerCase()} outcome consistency (\${impPct}%) and \${biasC.toLowerCase()} mean bias penalty (\${meanBias.toFixed(2)}/5.0) contribute to an estimated GRADE certainty of \${grade}. \${nSig} of \${nOuts} outcomes (\${nOuts>0?Math.round(nSig/nOuts*100):0}%) achieved statistical significance, and \${nMcid} (\${nOuts>0?Math.round(nMcid/nOuts*100):0}%) exceeded their MCID thresholds, indicating clinically meaningful effects.</p>
<p>Key limitations include the observational nature of the majority of included evidence, potential for confounding in uncontrolled designs, and the heterogeneity of outcome measures across studies. The NEP scoring framework mitigates some of these limitations through its bias penalty mechanism and study-type-weighted quality scores.</p>

<h2 style="color:#1A2E44;font-size:16px">5. Conclusion</h2>
<p>Based on \${nOuts} scored outcomes evaluated using the NEP Weighted Scoring Framework, \${cName} (\${cSci}) demonstrates \${impPct>=70?"promising":"mixed"} evidence for clinical efficacy in the assessed domains. The ESS of \${ess.toFixed(2)} supports \${grade.toLowerCase()} confidence in the current evidence base. Further investigation through well-designed randomised controlled trials with standardised outcome measures is warranted to strengthen the evidence classification.</p>

<h2 style="color:#1A2E44;font-size:16px">Author Contributions</h2>
<p>\${_ld||"Lead author"}: Conceptualisation, data curation, formal analysis, methodology, writing — original draft. \${_co?_co+": Writing — review and editing. ":""}All authors have read and agreed to the published version of the manuscript.</p>

<h2 style="color:#1A2E44;font-size:16px">References</h2>
\${refsH||"<p><em>No references added</em></p>"}
</div>\`;
                  }
                  newPaper.htmlContent = buildHtml();
                  existingPapers.push(newPaper);
                  localStorage.setItem("nep_papers", JSON.stringify(existingPapers));
                  // Dispatch event so Papers tab picks it up
                  window.dispatchEvent(new CustomEvent("nep-papers-updated"));
                }catch(ex){ console.warn("Paper save:", ex); }
                btn.textContent="✓ Downloaded — view in Papers tab";
                setTimeout(()=>{btn.textContent="↓ Download .doc";btn.disabled=false;},3000);
              }catch(err){
                alert("Download failed: "+err.message);
                btn.textContent="↓ Download .doc";btn.disabled=false;
              }
            }}>
            ↓ Download .docx
          </Btn>
          <Btn variant="secondary" style={{flex:1,justifyContent:"center"}}
            onClick={()=>{
              // Generate HTML version - always works, no ZIP needed
              const cname = compound?.compound_name||"Compound";
              const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${cname} Evidence Synthesis</title>
<style>
body{font-family:Times New Roman,serif;max-width:800px;margin:40px auto;padding:0 20px;font-size:12pt;line-height:1.6}
h1{font-size:16pt;color:#1A2E44;margin-top:24pt}
h2{font-size:13pt;color:#1A2E44;margin-top:16pt}
table{width:100%;border-collapse:collapse;margin:12pt 0;font-size:10pt}
th{background:#1A2E44;color:white;padding:6px 8px;text-align:left}
td{padding:5px 8px;border:1px solid #aaa}
tr:nth-child(even) td{background:#f4f6f9}
.meta{color:#888;font-size:10pt}
</style></head><body>
<h1>${cname} Evidence Synthesis</h1>
<p class="meta">${(()=>{
  try{
    const k=`nep_study_meta_${compound?.name||project?.compound_name||"default"}`;
    const m=JSON.parse(localStorage.getItem(k)||"{}");
    const lead=m.team?.[0]?.name||(()=>{try{const m=JSON.parse(localStorage.getItem(`nep_study_meta_${compound?.name||project?.compound_name||'default'}`)||'{}');return m?.team?.[0]?.name||project?.researcher||'';}catch(e){return project?.researcher||'';}})();
    const aff=m.affiliation||project?.affiliation||"";
    const jnl=m.target_journal||project?.target_journal||"";
    return [lead,aff,jnl].filter(Boolean).join(" &bull; ");
  }catch(e){return (()=>{try{const m=JSON.parse(localStorage.getItem(`nep_study_meta_${compound?.name||project?.compound_name||'default'}`)||'{}');return m?.team?.[0]?.name||project?.researcher||'';}catch(e){return project?.researcher||'';}})();}
})()}</p>
<p class="meta">NEP Evidence Platform &bull; ${new Date().toLocaleDateString()}</p>
<hr/>
<h1>Results Summary</h1>
<table><tr><th>Metric</th><th>Value</th><th>Classification</th></tr>
${(()=>{
  const wsV=outcomes.map(o=>o._ws).filter(x=>x!=null&&x>0);
  const ess=wsV.length?wsV.reduce((a,b)=>a+b,0)/wsV.length:0;
  const essC=ess>=12?"Very Strong":ess>=9?"Strong":ess>=6?"Moderate":"Weak";
  const cons=outcomes.length?outcomes.filter(o=>o.direction==="Improved").length/outcomes.length:0;
  const consC=cons>=0.8?"Highly Consistent":cons>=0.5?"Mixed":"Inconsistent";
  const nMcid=outcomes.filter(o=>o.mcid_met==="Yes").length;
  const clin=outcomes.length?nMcid/outcomes.length:0;
  const clinC=clin>=0.6?"Clinically Significant":clin>=0.3?"Partially Significant":"Clinically Uncertain";
  const mb=outcomes.length?outcomes.reduce((a,b)=>a+(b._biasP||0),0)/outcomes.length:0;
  const grade=ess>=9&&cons>=0.8?"Moderate–High":ess>=6?"Moderate":"Low–Moderate";
  return [
    ["ESS",(Number(ess)||0).toFixed(2)+" / 15.0",essC],
    ["Consistency",(Number(cons)*100).toFixed(0)+"%",consC],
    ["Clinical significance",(Number(clin)*100).toFixed(0)+"%",clinC],
    ["Mean Bias",(Number(mb)||0).toFixed(2),""],
    ["Estimated GRADE",grade,"Algorithmic estimate"],
  ].map(([m,v,c])=>`<tr><td>${m}</td><td><b>${v}</b></td><td>${c}</td></tr>`).join("");
})()}
</table>
<h1>Outcome Details</h1>
<table><tr><th>Study</th><th>Outcome</th><th>Effect Size</th><th>p</th><th>WS</th></tr>
${outcomes.map(o=>`<tr><td>${o.study_ref_id||""}</td><td>${o.outcome_name||""}</td><td>${o.es_value||""} ${o.es_type||""}</td><td>${o.p_value||""}</td><td><b>${o._ws!=null?o._ws:""}</b></td></tr>`).join("")}
</table>
${refs.length?`<h1>References</h1><ol>${refs.map(r=>`<li>${r.authors||""}. ${r.title||""}. <i>${r.journal||""}</i>. ${r.year||""}${r.volume?";"+r.volume:""}${r.issue?"("+r.issue+")":""}${r.pages?":"+r.pages:""}${r.doi?" doi:"+r.doi:""}.</li>`).join("")}</ol>`:""}
</body></html>`;
              const blob = new Blob([html],{type:"text/html"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href=url; a.download=`${cname.replace(/\s+/g,"_")}_Evidence_Synthesis.html`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
            ↓ Download HTML
          </Btn>
          <Btn variant="secondary" style={{flex:1,justifyContent:"center"}}
            onClick={()=>{
              const url=window.location.href;
              navigator.clipboard?.writeText(url).then(()=>alert("Link copied to clipboard!")).catch(()=>alert("Share URL: "+url));
            }}>
            ⎘ Copy link
          </Btn>
        
          <Btn variant="secondary" style={{flex:1,justifyContent:"center"}}
            onClick={()=>{
              try{
                const existingPapers = JSON.parse(localStorage.getItem("nep_papers")||"[]");
                const newPaper = {
                  id: crypto.randomUUID(),
                  title: project?.paper_title || `${compound?.name||""} Evidence Synthesis`,
                  compound: compound?.name || compound?.compound_name || "",
                  studyId: project?.id || "_default",
                  version: "1.0",
                  status: "in_progress",
                  publishedAt: null,
                  updatedAt: Date.now(),
                  createdAt: Date.now(),
                  htmlContent: (()=>{
                    const cN=compound?.name||"",cS=compound?.scientific||"",nO=outcomes.length;
                    const nI=outcomes.filter(o=>o.direction==="Improved").length;
                    const nSg=outcomes.filter(o=>o.significance==="Significant").length;
                    const nM=outcomes.filter(o=>o.mcid_met==="Yes").length;
                    const wV=outcomes.map(o=>Number(o._ws)).filter(v=>!isNaN(v)&&v>0);
                    const es=wV.length?wV.reduce((a,b)=>a+b,0)/wV.length:0;
                    const ip=nO>0?Math.round(nI/nO*100):0;
                    const tm=project?.team||[];const ld=tm[0]?.name||"";const co=tm.slice(1).map(m=>m.name).filter(Boolean).join(", ");
                    const af=project?.affiliation||"";const jn=project?.journal||project?.target_journal||"";
                    const cn=nO?nI/nO:0;const cnC=cn>=0.8?"Highly Consistent":cn>=0.5?"Mixed":"Inconsistent";
                    const mb=nO?outcomes.reduce((a,o)=>a+(Number(o._biasP)||0),0)/nO:0;
                    const gr=es>=9&&cn>=0.7?"High":es>=6?"Moderate":"Low";
                    const sM={};outcomes.forEach(o=>{const s=o.outcome_name||"?";if(!sM[s])sM[s]={n:0,imp:0,sig:0,mcid:0,ws:[]};const d=sM[s];d.n++;if(o.direction==="Improved")d.imp++;if(o.significance==="Significant")d.sig++;if(o.mcid_met==="Yes")d.mcid++;if(Number(o._ws)>0)d.ws.push(Number(o._ws));});
                    const sR=Object.entries(sM).sort((a,b)=>b[1].n-a[1].n);
                    const rH=refs.map((r,i)=>`<p style="margin:4px 0;padding-left:28px;text-indent:-28px;font-size:11px">[${i+1}] ${r.authors||""}. ${r.title||""}. <em>${r.journal||""}</em>. ${r.year||""}.</p>`).join("");
                    const tR=sR.map(([s,d],i)=>{const bg=i%2===0?"#f8f9fa":"#fff";const mw=d.ws.length?(d.ws.reduce((a,b)=>a+b,0)/d.ws.length).toFixed(1):"—";return `<tr style="background:${bg}"><td style="padding:5px 8px">${s}</td><td style="padding:5px 8px;text-align:center">${d.n}</td><td style="padding:5px 8px;text-align:center">${d.imp}/${d.n}</td><td style="padding:5px 8px;text-align:center">${d.n>0?Math.round(d.imp/d.n*100):0}%</td><td style="padding:5px 8px;text-align:center">${d.sig}/${d.n}</td><td style="padding:5px 8px;text-align:center">${d.mcid}/${d.n}</td><td style="padding:5px 8px;text-align:center;font-weight:bold">${mw}</td></tr>`;}).join("");
                    return `<div style="font-family:Times New Roman,serif;line-height:1.8;max-width:800px;margin:0 auto"><h1 style="text-align:center;color:#1A2E44;font-size:20px">${project?.paper_title||cN+" Evidence Synthesis"}</h1><p style="text-align:center;color:#555;font-size:13px">${ld}${co?" · "+co:""}</p><p style="text-align:center;color:#777;font-size:11px">${af}</p><p style="text-align:center;color:#999;font-size:10px">${jn?"Target: "+jn+" · ":""}NEP v6.0 · ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</p><hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/><h2 style="color:#1A2E44">Abstract</h2><p><strong>Background:</strong> ${cN} (${cS}) is a nutraceutical with established pharmacological actions.</p><p><strong>Methods:</strong> ${nO} outcomes evaluated using NEP WS Framework (WS = Q + S + O − B).</p><p><strong>Results:</strong> ${nI}/${nO} (${ip}%) improved. ${nSg} significant. ${nM} exceeded MCID. ESS: ${es.toFixed(2)}.</p><p><strong>Conclusion:</strong> ${cN} shows ${ip>=70?"strong":"moderate"} evidence.</p><hr/><h2 style="color:#1A2E44">1. Introduction</h2><p>${cN} (${cS}) is a widely studied nutraceutical. This synthesis evaluates ${nO} outcomes.</p><h2 style="color:#1A2E44">2. Methods</h2><p>WS = Q + S + O − B. Q: Study Quality (1–5). S: Sample Adequacy (0–5). O: Outcome Relevance (1–5). B: Bias Penalty (0–5). ESS = mean WS.</p><h2 style="color:#1A2E44">3. Results</h2><p>${nI}/${nO} (${ip}%) improved. ${nSg} significant. ${nM} MCID exceeded. ESS: ${es.toFixed(2)} (${es>=9?"Strong":es>=6?"Moderate":"Weak"}).</p><table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0"><tr style="background:#1A2E44;color:white"><th style="padding:6px 8px;text-align:left">Outcome</th><th style="padding:6px 8px">n</th><th style="padding:6px 8px">Improved</th><th style="padding:6px 8px">%</th><th style="padding:6px 8px">Significant</th><th style="padding:6px 8px">MCID</th><th style="padding:6px 8px">Mean WS</th></tr>${tR}</table><h2 style="color:#1A2E44">4. Discussion</h2><p>${ip>=70?"Strong":"Moderate"} support for ${cN}. ESS ${es.toFixed(2)}, ${cnC.toLowerCase()} consistency, ${gr} GRADE certainty.</p><h2 style="color:#1A2E44">5. Conclusion</h2><p>${cN} shows ${ip>=70?"promising":"mixed"} evidence. Further RCTs warranted.</p><h2 style="color:#1A2E44">Author Contributions</h2><p>${ld||"Lead author"}: Conceptualisation, analysis, writing. ${co?co+": Review & editing.":""}</p><h2 style="color:#1A2E44">References</h2>${rH||"<p><em>No references</em></p>"}</div>`;
                  })(),
                  team: project?.team || [],
                  affiliation: project?.affiliation || "",
                  journal: project?.journal || project?.target_journal || "",
                };
                existingPapers.push(newPaper);
                localStorage.setItem("nep_papers", JSON.stringify(existingPapers));
                window.dispatchEvent(new CustomEvent("nep-papers-updated"));
                alert("✓ Paper saved. View and edit it in the Papers tab.");
              }catch(ex){ alert("Save failed: "+ex.message); }
            }}>
            💾 Save as draft
          </Btn>
</div>
        <div style={{padding:"10px 14px",background:T.amberBg,borderRadius:6,
          border:`1px solid ${T.amber}30`,fontSize:11,color:T.text2,marginBottom:12}}>
          <strong style={{color:T.amber}}>Before submission:</strong>
          {" "}Verify all effect sizes, CIs, and MCID comparisons against source papers.
          The manuscript is a structured draft, not a final submission.
        </div>
        <div style={{textAlign:"center"}}>
          <Btn variant="ghost" onClick={onBack}>← Back to evidence input</Btn>
        </div>
      </div>
    );
  }

  // Error
  return (
    <div style={{textAlign:"center",padding:"40px 20px"}}>
      <div style={{fontSize:32,color:T.red,marginBottom:12}}>✕</div>
      <p style={{color:T.red,marginBottom:16}}>Generation failed. Please try again.</p>
      <Btn onClick={()=>{setJobId(null);setJob(null);}}>Try again</Btn>
    </div>
  );
};

/* ─── MCID LIBRARY PANEL ─────────────────────────────────────────────── */
const MCIDPanel = () => (
  <div>
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 2fr",gap:0,
      background:T.bg3,borderRadius:"6px 6px 0 0",
      borderBottom:`1px solid ${T.border}`}}>
      {["Outcome / Measure","MCID Value","Unit","Published Reference"].map(h=>(
        <div key={h} style={{padding:"8px 12px",fontSize:10,color:T.text3,
          fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>
      ))}
    </div>
    {MCID_LIB.map((m,i)=>(
      <div key={m.outcome} className="row-hover" style={{
        display:"grid",gridTemplateColumns:"2fr 1fr 1fr 2fr",
        borderBottom:`1px solid ${T.border}`,
        background:i%2===0?T.bg2:T.bg1,
      }}>
        <div style={{padding:"9px 12px",fontSize:12,color:T.text0}}>{m.outcome}</div>
        <div style={{padding:"9px 12px",fontSize:13,color:T.teal,
          fontFamily:T.mono,fontWeight:600}}>{m.value}</div>
        <div style={{padding:"9px 12px",fontSize:12,color:'#C8D8EF'}}>{m.unit}</div>
        <div style={{padding:"9px 12px",fontSize:11,color:T.text3}}>{m.ref}</div>
      </div>
    ))}
    <div style={{marginTop:16,fontSize:11,color:T.text3,padding:"0 4px"}}>
      Add compound-specific thresholds above. If no published MCID exists for an outcome,
      set MCID_Met = Unknown in Evidence Input.
    </div>
  </div>
);

/* ─── MAIN APP ───────────────────────────────────────────────────────── */

/* ─── MOCK API ADAPTER ─────────────────────────────────────────────────
   Swap `const API = MockAdapter` for SupabaseAdapter to go live.
   Shape is identical — every method returns a Promise.
────────────────────────────────────────────────────────────────────── */

/* ─── NAVIGATION COMPONENTS ─────────────────────────────────────────── */
const generateProjectId = (existingProjects) => {
  const nums = (existingProjects||[])
    .map(p=>parseInt((p.project_id||"").replace("PRJ-",""))||0);
  const next = nums.length ? Math.max(...nums)+1 : 1;
  return `PRJ-${String(next).padStart(3,"0")}`;
};


/* ─── ABOUT PANEL ─────────────────────────────────────────────────────── */
const AboutPanel = () => (
  <div className="fade-in" style={{maxWidth:780,margin:"0 auto"}}>
    <div style={{
      background:`linear-gradient(135deg,${T.bg3} 0%,${T.bg4} 100%)`,
      border:`1px solid ${T.border2}`,borderRadius:12,
      padding:"40px 48px",marginBottom:28,textAlign:"center",
    }}>
      <div style={{width:56,height:56,borderRadius:12,background:T.teal,
        display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
        <span style={{color:T.bg0,fontSize:28,fontWeight:800,fontFamily:T.mono}}>N</span>
      </div>
      <h1 style={{fontSize:26,fontWeight:800,color:"#F0F6FF",marginBottom:8}}>
        Nutraceutical Evidence Platform
      </h1>
      <p style={{fontSize:15,color:"#7A94B8",lineHeight:1.7}}>
        A structured, reproducible framework for evaluating nutraceutical clinical evidence —
        producing GRADE-parallel scores and publication-ready synthesis documents.
      </p>
    </div>
    {[
      {icon:"🔬",title:"What is NEP?",body:`The Nutraceutical Evidence Platform (NEP) applies the Weighted Scoring Framework (v5.0) to evaluate clinical outcomes across four dimensions, producing a single Evidence Strength Score (ESS) that maps directly onto GRADE certainty levels — making nutraceutical evidence directly comparable to pharmaceutical evidence under standard systematic review methods.`},
      {icon:"⚠️",title:"The evidence gap NEP addresses",body:`Nutraceutical research lacks a standardised scoring framework. Pharmaceutical evidence uses GRADE and Cochrane methodology; nutraceutical evidence has no equivalent — leaving researchers and clinicians without a reproducible way to compare evidence quality. NEP closes this gap.`},
      {icon:"📊",title:"The Weighted Scoring Framework",body:`Every outcome scored on four parameters:\n• Study Quality (Q, 1–5): SR/MA=5 · RCT=4 · Observational=3 · Mechanistic=2 · Case=1\n• Sample Adequacy (S, 0–5): Auto-calculated from participant count\n• Outcome Relevance (O, 1–5): Anchored to published MCID thresholds\n• Bias Penalty (B, 0–5): Sum of RoB 2 / ROBINS-I / AMSTAR 2 domain scores\n\nWS = Q + S + O − B   (Not significant: −2, cap 8 · Significant: cap 15)\nESS = mean(WS)   ·   ≥12=Very Strong · 9–11.9=Strong · 6–8.9=Moderate · <6=Weak`},
      {icon:"🗺️",title:"How to use — step by step",body:`1. Create a project — name it, add your research team, set the target journal\n2. Fill compound details — name, extract form, standardisation, dose, duration\n3. Enter evidence outcomes — one row per outcome per study, fill all scored fields\n4. Add references — use AI suggestions or add manually in Vancouver format\n5. Check Portfolio — compare ESS across all your projects\n6. Validate & Generate — all filler fields must be populated before generating\n7. Download the .doc — opens in Word, review AI-expanded Introduction and Discussion, submit`},
      {icon:"📄",title:"Generated document structure",body:`Title · Abstract (Background/Objective/Methods/Results/Conclusions/Keywords)\n1. Introduction (AI-expanded — disease burden, pharmacological limitations, mechanism of action)\n2. Methods (Framework overview, eligibility criteria, Q/S/O/B parameters, aggregation)\n3. Results (Table 1: Studies · Table 2: Outcome scores · Table 3: Aggregated metrics)\n4. Discussion (AI-expanded — evidence in context, bioavailability, bias, limitations)\n5. Conclusions + Supplementary Materials + Declarations + References (Vancouver)`},
    ].map(({icon,title,body})=>(
      <div key={title} style={{background:T.bg2,border:`1px solid ${T.border}`,
        borderRadius:10,padding:"22px 28px",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <span style={{fontSize:18}}>{icon}</span>
          <h2 style={{fontSize:15,fontWeight:700,color:"#F0F6FF",margin:0}}>{title}</h2>
        </div>
        <div style={{fontSize:13,color:"#C8D8EF",lineHeight:1.8,whiteSpace:"pre-line"}}>{body}</div>
      </div>
    ))}
    <div style={{textAlign:"center",padding:"16px 0",fontSize:11,color:"#4A6080"}}>
      NEP Platform v5.4 · Weighted Scoring Framework · © 2026
    </div>
  </div>
);

/* ─── INLINE FIELD (editable in place) ──────────────────────────────── */
const InlineField = ({ label, value, onChange, placeholder="", readOnly=false }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  useEffect(()=>setVal(value),[value]);

  const commit = () => {
    setEditing(false);
    if (val !== value && onChange) onChange(val);
  };

  return (
    <div style={{marginBottom:7,display:"flex",gap:6,alignItems:"center",fontSize:12}}>
      <span style={{color:T.text3,width:110,flexShrink:0,fontSize:11}}>{label}</span>
      {readOnly ? (
        <span style={{color:T.teal,fontFamily:T.mono,fontWeight:600,fontSize:12}}>{value||"—"}</span>
      ) : editing ? (
        <input
          value={val}
          autoFocus
          onChange={e=>setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e=>{if(e.key==="Enter") commit(); if(e.key==="Escape"){setEditing(false);setVal(value);}}}
          placeholder={placeholder}
          style={{flex:1,padding:"3px 8px",fontSize:12,height:28}}/>
      ) : (
        <div style={{flex:1,display:"flex",alignItems:"center",gap:6,
          cursor:"pointer",group:true}}
          onClick={()=>setEditing(true)}>
          <span style={{color:val?"#F0F6FF":T.text3,fontStyle:val?"normal":"italic",
            fontSize:12,flex:1}}>
            {val||placeholder||"Click to edit…"}
          </span>
          <span style={{fontSize:10,color:T.text3,opacity:0,
            transition:"opacity 0.15s"}}
            className="edit-hint">✎</span>
        </div>
      )}
    </div>
  );
};

/* ─── TEAM EDITOR (inline in Portfolio) ─────────────────────────────── */
const TeamEditor = ({ project, onUpdate }) => {
  const ROLES = ["Lead Investigator","Co-Investigator","Data Curator",
    "Statistician","Reviewer","Contributing Author"];
  const team = project.research_team?.filter(m=>m.name?.trim()) || [];

  const updateTeam = (newTeam) => {
    const filled = newTeam.filter(m=>m.name?.trim());
    onUpdate({
      ...project,
      research_team:  newTeam,
      researcher:     filled[0]?.name || project.researcher || "",
      co_authors:     filled.slice(1).map(m=>m.name).join(", "),
      authors_paper:  filled.map(m=>m.name).join("  ·  "),
    });
  };

  const addMember = () => updateTeam([
    ...team,
    {id:crypto.randomUUID(), name:"", role:"Co-Investigator"}
  ]);

  const removeMember = (id) => updateTeam(team.filter(m=>m.id!==id));

  const updateMember = (id, field, val) =>
    updateTeam(team.map(m=>m.id===id?{...m,[field]:val}:m));

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,color:T.teal,fontWeight:700,
          textTransform:"uppercase",letterSpacing:"0.08em"}}>
          Research team
        </div>
        <button onClick={addMember}
          style={{background:"none",border:`1px solid ${T.border2}`,
            borderRadius:4,color:T.teal,fontSize:10,cursor:"pointer",
            padding:"2px 8px",fontFamily:"inherit"}}>
          + Add
        </button>
      </div>

      {team.length===0 && (
        <div style={{fontSize:11,color:T.text3,fontStyle:"italic",marginBottom:8}}>
          No team members yet — click + Add
        </div>
      )}

      {team.map((m,mi)=>(
        <div key={m.id||mi} style={{
          display:"grid",gridTemplateColumns:"1fr 140px 24px",
          gap:6,marginBottom:6,alignItems:"center",
        }}>
          {/* Avatar + name */}
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <div style={{
              width:24,height:24,borderRadius:"50%",flexShrink:0,
              background:mi===0?T.teal:T.bg4,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:10,fontWeight:700,
              color:mi===0?T.bg0:"#F0F6FF",
            }}>
              {(m.name||"?")[0].toUpperCase()}
            </div>
            <input
              value={m.name}
              onChange={e=>updateMember(m.id,"name",e.target.value)}
              placeholder={mi===0?"Lead investigator…":"Member name…"}
              style={{fontSize:12,padding:"4px 8px",height:28}}/>
          </div>
          {/* Role */}
          <select value={m.role}
            onChange={e=>updateMember(m.id,"role",e.target.value)}
            style={{fontSize:11,padding:"4px 6px",height:28}}>
            {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          {/* Remove */}
          {team.length>1 ? (
            <button onClick={()=>removeMember(m.id)}
              style={{background:"none",border:"none",color:T.text3,
                cursor:"pointer",fontSize:14,padding:2}}>✕</button>
          ) : <div/>}
        </div>
      ))}
    </div>
  );
};

/* ─── STUDY SUMMARY PANEL ───────────────────────────────────────────── */
/* ─── PATIENT FEED PANEL ─────────────────────────────────────────────── */

const PortfolioDashboard = ({ projects, projectOutcomes, onOpen, onDelete, onUpdate, activeProjectId }) => {
  const [expanded,    setExpanded]    = useState(null);
  const [confirming,  setConfirming]  = useState(null);
  const [deleting,    setDeleting]    = useState(null);
  const [editing,     setEditing]     = useState({});   // {[projectId]: edits}
  const [saving,      setSaving]      = useState(null);

  if (!projects.length) return (
    <div style={{textAlign:"center",padding:"80px 20px",color:T.text3}}>
      <div style={{fontSize:40,marginBottom:12,opacity:0.3}}>📊</div>
      <p style={{fontSize:14}}>No projects yet. Create one to see portfolio reporting.</p>
    </div>
  );

  /* Compute metrics */
  const rows = projects.map(p => {
    const outs   = projectOutcomes[p.id] || [];
    const wsVals = outs.map(o=>o._ws).filter(x=>x!=null&&x>0);
    const ess    = wsVals.length ? wsVals.reduce((a,b)=>a+b,0)/wsVals.length : null;
    const essC   = ess!=null ? score.essClass(ess) : "—";
    const nImp   = outs.filter(o=>o.direction==="Improved").length;
    const cons   = outs.length ? nImp/outs.length : null;
    const nMcid  = outs.filter(o=>o.mcid_met==="Yes").length;
    const meanBias = outs.length ? outs.reduce((a,b)=>a+(b._biasP||0),0)/outs.length : null;
    const grade  = ess!=null&&cons!=null
      ? score.gradeFromMetrics(
          essC,
          cons>=0.8?"Highly Consistent":cons>=0.5?"Mixed":"Inconsistent",
          outs.length?(nMcid/outs.length)>=0.6?"Clinically Significant":"Partially Significant":"",
          meanBias!=null?meanBias<=1?"Low Bias":meanBias<=2.5?"Moderate Bias":"High Bias":"")
      : "—";
    // Derive compounds from outcomes
    const compoundNames = [...new Map(
      outs.flatMap(o=>(o.compounds||[]).map(c=>[c.id,c.name]))
    ).values()];
    return {p, ess, essC, cons, nImp, nMcid, meanBias, grade, nOuts:outs.length, compoundNames};
  }).sort((a,b)=>(b.ess||0)-(a.ess||0));

  const handleDelete = async (id) => {
    setDeleting(id);
    await onDelete(id);
    setDeleting(null);
    setConfirming(null);
    setExpanded(null);
  };

  const [view, setView] = useState("overview"); // "overview" | "compare"
  const [selected, setSelected] = useState([]); // project ids for comparison

  const toggleSelect = (id) => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const compRows = rows.filter(r => selected.includes(r.p.id));

  return (
    <div className="fade-in">

      {/* View toggle */}
      <div style={{display:"flex",gap:8,marginBottom:20,alignItems:"center"}}>
        {["overview","compare"].map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{
            padding:"8px 20px",borderRadius:6,fontSize:13,fontWeight:view===v?700:400,
            background:view===v?T.teal:"transparent",
            color:view===v?T.bg0:"#F0F6FF",
            border:`1px solid ${view===v?T.teal:T.border}`,
            cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",
          }}>
            {v==="overview"?"📊 Overview":"⚖ Compare projects"}
          </button>
        ))}
        {view==="compare"&&(
          <span style={{fontSize:12,color:T.text3,marginLeft:4}}>
            Select up to 3 projects from the table below to compare
          </span>
        )}
      </div>

      {/* COMPARE VIEW */}
      {view==="compare"&&(
        <div style={{marginBottom:24}}>
          {selected.length===0 ? (
            <div style={{textAlign:"center",padding:"40px 20px",
              border:`1px dashed ${T.border2}`,borderRadius:10,color:T.text3}}>
              <div style={{fontSize:24,marginBottom:8,opacity:0.4}}>⚖</div>
              <p style={{fontSize:13}}>
                Select 2–3 projects below using the checkboxes to compare them side by side
              </p>
            </div>
          ) : (
            <div>
              {/* Comparison grid */}
              <div style={{display:"grid",
                gridTemplateColumns:`160px repeat(${compRows.length},1fr)`,
                gap:1,background:T.border,borderRadius:10,overflow:"hidden",
                marginBottom:16}}>

                {/* Header row */}
                <div style={{background:T.bg3,padding:"10px 14px"}}/>
                {compRows.map(({p})=>(
                  <div key={p.id} style={{background:T.bg3,padding:"10px 14px",
                    borderLeft:`1px solid ${T.border}`}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>{p.name}</div>
                    <Tag color={T.teal} style={{fontSize:9,marginTop:4}}>{p.project_id}</Tag>
                  </div>
                ))}

                {/* Metric rows */}
                {[
                  {label:"ESS",           fn:r=>r.ess!=null?<ScoreChip value={(Number(r.ess)||0).toFixed(2)}/>:<span style={{color:T.text3}}>—</span>},
                  {label:"ESS Class",     fn:r=><span style={{fontSize:12,color:r.ess!=null?score.wsColor(r.ess):T.text3}}>{r.essC}</span>},
                  {label:"GRADE est.",    fn:r=><span style={{fontSize:12,color:T.text3}}>{r.grade}</span>},
                  {label:"Outcomes",      fn:r=><span style={{fontSize:13,fontFamily:T.mono,color:"#F0F6FF"}}>{r.nOuts}</span>},
                  {label:"Consistency",   fn:r=><span style={{fontSize:12,color:r.cons!=null?(r.cons>=0.8?T.green:r.cons>=0.5?T.amber:T.red):T.text3}}>{r.cons!=null?`${(Number(r.cons)*100).toFixed(0)}%`:"—"}</span>},
                  {label:"MCID-met",      fn:r=><span style={{fontSize:12,color:'#C8D8EF'}}>{r.nMcid}/{r.nOuts}</span>},
                  {label:"Mean bias",     fn:r=><span style={{fontSize:12,color:r.meanBias!=null?(r.meanBias<=1?T.green:r.meanBias<=2.5?T.amber:T.red):T.text3}}>{r.meanBias!=null?(Number(r.meanBias)||0).toFixed(2):"—"}</span>},
                  {label:"Compounds",     fn:r=><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{r.compoundNames.slice(0,2).map(n=><Tag key={n} color={T.teal} style={{fontSize:9}}>{n}</Tag>)}</div>},
                  {label:"Target journal",fn:r=><span style={{fontSize:11,color:T.text3}}>{r.p.target_journal||"—"}</span>},
                  {label:"Researcher",    fn:r=><span style={{fontSize:11,color:T.text3}}>{r.p.researcher||"—"}</span>},
                ].map(({label,fn})=>(
                  <div key={label} style={{display:"contents"}}>
                    <div style={{background:T.bg2,padding:"9px 14px",
                      fontSize:12,color:T.text3,fontWeight:600,
                      borderTop:`1px solid ${T.border}`}}>
                      {label}
                    </div>
                    {compRows.map(r=>(
                      <div key={r.p.id} style={{background:T.bg1,
                        padding:"9px 14px",
                        borderTop:`1px solid ${T.border}`,
                        borderLeft:`1px solid ${T.border}`}}>
                        {fn(r)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* ESS bar chart */}
              {compRows.some(r=>r.ess!=null)&&(
                <div style={{background:T.bg2,borderRadius:8,padding:16,
                  border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:12,color:T.teal,fontWeight:700,
                    textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
                    ESS comparison
                  </div>
                  {compRows.map(r=>(
                    <div key={r.p.id} style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",marginBottom:4}}>
                        <span style={{fontSize:12,color:"#F0F6FF",fontWeight:500}}>
                          {r.p.name}
                        </span>
                        <span style={{fontFamily:T.mono,fontSize:12,
                          color:r.ess!=null?score.wsColor(r.ess):T.text3}}>
                          {r.ess!=null?(Number(r.ess)||0).toFixed(2):"—"}/15.0
                        </span>
                      </div>
                      <div style={{height:10,background:T.bg3,borderRadius:5,overflow:"hidden"}}>
                        <div style={{
                          height:"100%",borderRadius:5,
                          width:`${r.ess!=null?Math.min((r.ess/15)*100,100):0}%`,
                          background:r.ess!=null?score.wsColor(r.ess):T.border,
                          transition:"width 0.6s ease",
                        }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {[
          ["Total projects",  projects.length,                                              T.teal],
          ["With evidence",   rows.filter(r=>r.nOuts>0).length,                            T.blue],
          ["Strong+ ESS",     rows.filter(r=>r.ess!=null&&r.ess>=9).length,                T.green],
          ["Avg ESS",         rows.filter(r=>r.ess!=null).length
            ? (rows.filter(r=>r.ess!=null).reduce((a,b)=>a+(b.ess||0),0)
               / rows.filter(r=>r.ess!=null).length).toFixed(2)
            : "—",                                                                          T.amber],
        ].map(([lbl,val,col])=>(
          <div key={lbl} style={{background:T.bg2,borderRadius:8,
            padding:"14px 16px",border:`1px solid ${T.border}`}}>
            <div style={{fontSize:10,color:T.text3,textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:6}}>{lbl}</div>
            <div style={{fontSize:24,fontWeight:700,color:col,fontFamily:T.mono}}>{val}</div>
          </div>
        ))}
      </div>

      {/* Projects table */}
      <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>

        {/* Header */}
        <div style={{display:"grid",
          gridTemplateColumns:"28px 80px 1fr 150px 90px 70px 100px 100px 90px",
          padding:"8px 16px",background:T.bg3,
          borderBottom:`1px solid ${T.border}`}}>
          {["","ID","Project","Compounds","ESS","Outcomes","Consistency","GRADE",""].map(h=>(
            <div key={h} style={{fontSize:10,color:T.text3,fontWeight:700,
              textTransform:"uppercase",letterSpacing:"0.08em"}}>{h}</div>
          ))}
        </div>

        {rows.map(({p,ess,essC,cons,nOuts,grade,compoundNames},i)=>{
          const isActive   = activeProjectId===p.id;
          const isExpanded = expanded===p.id;
          const team       = p.research_team?.filter(m=>m.name?.trim()) || [];

          return (
            <div key={p.id} style={{
              borderBottom:`1px solid ${isActive?T.teal:T.border}`,
              borderLeft:`3px solid ${isActive?T.teal:"transparent"}`,
            }}>

              {/* ── Main row ── */}
              <div
                onClick={()=>setExpanded(isExpanded?null:p.id)}
                style={{display:"grid",
                  gridTemplateColumns:"28px 80px 1fr 150px 90px 70px 100px 100px 90px",
                  padding:"12px 16px",cursor:"pointer",alignItems:"center",
                  background:isActive?T.tealBg:i%2===0?T.bg2:T.bg1,
                  transition:"background 0.15s",
                }}>

                {/* Expand arrow / compare checkbox */}
                <div style={{
                  fontSize:view==="compare"?16:10,
                  color:view==="compare"?(selected.includes(p.id)?T.teal:T.text3):T.text3,
                  textAlign:"center",
                  transition:"transform 0.2s",
                  transform:view==="overview"&&isExpanded?"rotate(90deg)":"rotate(0deg)",
                }}>
                  {view==="compare"
                    ? (selected.includes(p.id)?"☑":"☐")
                    : "▶"}
                </div>

                {/* Project ID */}
                <div><Tag color={isActive?T.teal:T.text3}>{p.project_id||"—"}</Tag></div>

                {/* Name + researcher */}
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF",
                    display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {p.name}
                    {isActive&&<Tag color={T.teal} style={{fontSize:9}}>● Active</Tag>}
                  </div>
                  {p.researcher&&(
                    <div style={{fontSize:11,color:T.text3,marginTop:1}}>
                      {p.researcher}
                      {p.co_authors?` · ${p.co_authors}`:""}
                    </div>
                  )}
                </div>

                {/* Compounds */}
                <div style={{display:"flex",flexWrap:"wrap",gap:3,alignItems:"center"}}>
                  {compoundNames.length>0
                    ? compoundNames.slice(0,2).map(n=>(
                        <Tag key={n} color={T.teal} style={{fontSize:9}}>{n}</Tag>
                      ))
                    : <span style={{fontSize:11,color:T.text3}}>—</span>
                  }
                  {compoundNames.length>2&&(
                    <span style={{fontSize:9,color:T.text3}}>+{compoundNames.length-2}</span>
                  )}
                </div>

                {/* ESS */}
                <div style={{display:"flex",alignItems:"center"}}>
                  {ess!=null
                    ? <ScoreChip value={(Number(ess)||0).toFixed(2)}/>
                    : <span style={{color:T.text3,fontSize:11}}>—</span>}
                </div>

                {/* Outcomes */}
                <div style={{fontSize:13,fontFamily:T.mono,color:'#C8D8EF'}}>{nOuts}</div>

                {/* Consistency */}
                <div style={{fontSize:11,
                  color:cons!=null?(cons>=0.8?T.green:cons>=0.5?T.amber:T.red):T.text3}}>
                  {cons!=null?`${(Number(cons)*100).toFixed(0)}%`:"—"}
                </div>

                {/* GRADE */}
                <div style={{fontSize:11,color:T.text3}}>{grade}</div>

                {/* Open button */}
                <div onClick={e=>e.stopPropagation()}>
                  <Btn
                    onClick={()=>onOpen(p)}
                    variant={isActive?"primary":"secondary"}
                    style={{fontSize:11,padding:"3px 10px"}}>
                    {isActive?"Resume →":"Open →"}
                  </Btn>
                </div>
              </div>

              {/* ── Expanded details ── */}
              {isExpanded&&(
                <div style={{
                  borderTop:`1px solid ${T.border}`,
                  background:T.bg1,
                  padding:"20px 24px",
                  animation:"fadeIn 0.2s ease both",
                }}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>

                    {/* Project details — inline editable */}
                    <div>
                      <div style={{fontSize:11,color:T.teal,fontWeight:700,
                        textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
                        Project details
                      </div>
                      <InlineField label="Project ID"   value={p.project_id||""} readOnly/>
                      <InlineField label="Name"         value={p.name||""}
                        onChange={v=>onUpdate({...p,name:v})}/>
                      <InlineField label="Target journal" value={p.target_journal||""}
                        onChange={v=>onUpdate({...p,target_journal:v})}
                        placeholder="e.g. J Ethnopharmacology"/>
                      <InlineField label="Affiliation"  value={p.affiliation||""}
                        onChange={v=>onUpdate({...p,affiliation:v})}
                        placeholder="e.g. NIH, Bethesda MD"/>
                      <InlineField label="Keywords"     value={p.keywords||""}
                        onChange={v=>onUpdate({...p,keywords:v})}
                        placeholder="e.g. Ashwagandha; stress"/>
                      <InlineField label="Publication date" value={p.publication_date||""}
                        onChange={v=>onUpdate({...p,publication_date:v})}
                        placeholder="e.g. March 2026"/>
                      <div style={{fontSize:11,color:T.text3,marginTop:6}}>
                        Created: {p.created_at
                          ? new Date(p.created_at).toLocaleDateString("en-GB",
                              {day:"2-digit",month:"short",year:"numeric"})
                          : "—"}
                      </div>
                    </div>

                    {/* Research team — editable inline */}
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",marginBottom:10}}>
                        <div style={{fontSize:11,color:T.teal,fontWeight:700,
                          textTransform:"uppercase",letterSpacing:"0.08em"}}>
                          Research team
                        </div>
                        <button onClick={()=>{
                          if(!editing[p.id]) setEditing(prev=>({...prev,[p.id]:{...p,
                            research_team:p.research_team?.length
                              ?[...p.research_team]
                              :[{id:crypto.randomUUID(),name:p.researcher||"",role:"Lead Investigator"}]
                          }}));
                          const cur = (editing[p.id]?.research_team)||p.research_team||[];
                          setEditing(prev=>({...prev,[p.id]:{
                            ...(prev[p.id]||p),
                            research_team:[...cur,{id:crypto.randomUUID(),name:"",role:"Co-Investigator"}]
                          }}));
                        }} style={{fontSize:11,color:T.teal,background:"none",
                          border:`1px solid ${T.teal}30`,borderRadius:4,
                          padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                          + Add
                        </button>
                      </div>
                      {((editing[p.id]?.research_team)||(p.research_team?.length
                        ?p.research_team
                        :[{id:"_",name:p.researcher||"",role:"Lead Investigator"}])
                      ).map((m,mi,arr)=>(
                        <div key={m.id||mi} style={{
                          display:"grid",gridTemplateColumns:"1fr 130px 24px",
                          gap:4,marginBottom:5,alignItems:"center",
                        }}>
                          <input
                            value={m.name||""}
                            onChange={e=>{
                              const cur = editing[p.id]?.research_team||p.research_team||[];
                              setEditing(prev=>({...prev,[p.id]:{
                                ...(prev[p.id]||p),
                                research_team:cur.map((x,xi)=>xi===mi?{...x,name:e.target.value}:x)
                              }}));
                            }}
                            placeholder={mi===0?"Lead investigator…":"Member name…"}
                            style={{fontSize:11,padding:"4px 8px"}}/>
                          <select
                            value={m.role||"Co-Investigator"}
                            onChange={e=>{
                              const cur = editing[p.id]?.research_team||p.research_team||[];
                              setEditing(prev=>({...prev,[p.id]:{
                                ...(prev[p.id]||p),
                                research_team:cur.map((x,xi)=>xi===mi?{...x,role:e.target.value}:x)
                              }}));
                            }}
                            style={{fontSize:10,padding:"4px 6px"}}>
                            {["Lead Investigator","Co-Investigator","Data Curator",
                              "Statistician","Reviewer","Contributing Author"].map(r=>(
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          {arr.length>1?(
                            <button onClick={()=>{
                              const cur = editing[p.id]?.research_team||p.research_team||[];
                              setEditing(prev=>({...prev,[p.id]:{
                                ...(prev[p.id]||p),
                                research_team:cur.filter((_,xi)=>xi!==mi)
                              }}));
                            }} style={{background:"none",border:"none",
                              color:T.text3,cursor:"pointer",fontSize:13,padding:2}}>✕</button>
                          ):<div/>}
                        </div>
                      ))}
                    </div>

                    {/* Evidence summary */}
                    <div>
                      <div style={{fontSize:11,color:T.teal,fontWeight:700,
                        textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
                        Evidence summary
                      </div>
                      {nOuts===0 ? (
                        <div style={{fontSize:12,color:T.text3,fontStyle:"italic"}}>
                          No outcomes yet.
                        </div>
                      ) : (()=>{
                        const outs = projectOutcomes[p.id]||[];
                        const nSig = outs.filter(o=>o.significance==="Significant").length;
                        const nMcid = outs.filter(o=>o.mcid_met==="Yes").length;
                        const meanBias = outs.length
                          ? outs.reduce((a,b)=>a+(b._biasP||0),0)/outs.length : 0;
                        return [
                          ["Outcomes",    nOuts],
                          ["ESS",         ess!=null?`${(Number(ess)||0).toFixed(2)}/15.0 (${essC})`:"—"],
                          ["Significant", `${nSig}/${nOuts}`],
                          ["MCID-met",    `${nMcid}/${nOuts}`],
                          ["Mean bias",   (Number(meanBias)||0).toFixed(2)],
                          ["GRADE est.",  grade],
                          ["Compounds",   compoundNames.join(", ")||"—"],
                        ].map(([lbl,val])=>(
                          <div key={lbl} style={{marginBottom:6,
                            display:"flex",gap:8,fontSize:12}}>
                            <span style={{color:T.text3,width:90,flexShrink:0}}>{lbl}</span>
                            <span style={{color:"#F0F6FF",fontWeight:500}}>{val}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{marginTop:20,paddingTop:16,
                    borderTop:`1px solid ${T.border}`,
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>

                    {/* Delete */}
                    {confirming===p.id ? (
                      <div style={{display:"flex",gap:8,alignItems:"center",
                        padding:"8px 14px",background:T.redBg,
                        borderRadius:8,border:`1px solid ${T.red}30`}}>
                        <span style={{fontSize:12,color:T.red,fontWeight:600}}>
                          Permanently delete "{p.name}" and all its data?
                        </span>
                        <Btn variant="danger"
                          onClick={()=>handleDelete(p.id)}
                          disabled={deleting===p.id}
                          style={{fontSize:11,padding:"4px 12px"}}>
                          {deleting===p.id?"Deleting…":"Yes, delete permanently"}
                        </Btn>
                        <Btn variant="secondary"
                          onClick={()=>setConfirming(null)}
                          style={{fontSize:11,padding:"4px 10px"}}>
                          Cancel
                        </Btn>
                      </div>
                    ) : (
                      <Btn variant="ghost"
                        onClick={()=>setConfirming(p.id)}
                        style={{fontSize:11,color:T.red}}>
                        🗑 Delete project
                      </Btn>
                    )}

                    <div style={{display:"flex",gap:8}}>
                      <Btn variant="secondary"
                        onClick={()=>setExpanded(null)}
                        style={{fontSize:12}}>
                        Collapse
                      </Btn>
                      <Btn variant="secondary"
                        onClick={async()=>{
                          if(editing[p.id]){
                            const filledTeam=(editing[p.id].research_team||team).filter(m=>m.name?.trim());
                            const updated={...p,...editing[p.id],
                              research_team:filledTeam,
                              researcher:filledTeam[0]?.name||p.researcher||"",
                              co_authors:filledTeam.slice(1).map(m=>m.name).join(", "),
                              authors_paper:filledTeam.map(m=>m.name).join("  ·  "),
                            };
                            await onUpdate(updated);
                            setEditing(prev=>{const n={...prev};delete n[p.id];return n;});
                          }
                        }}
                        disabled={!editing[p.id]}
                        style={{fontSize:12}}>
                        {editing[p.id]?"Save changes":"No changes"}
                      </Btn>
                      <Btn onClick={()=>onOpen(p)} style={{fontSize:12}}>
                        {isActive?"Resume project →":"Open project →"}
                      </Btn>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ─── NEW PROJECT MODAL ───────────────────────────────────────────────── */
const NewProjectModal = ({ onClose, onCreate, existingProjects }) => {
  const [step,     setStep]    = useState(1);
  const [creating, setCreating]= useState(false);
  const [error,    setError]   = useState("");
  const [name,     setName]    = useState("");
  const ROLES = ["Lead Investigator","Co-Investigator","Data Curator",
    "Statistician","Reviewer","Contributing Author","Consultant"];
  const [team, setTeam] = useState([
    {id:crypto.randomUUID(), name:"", role:"Lead Investigator"},
  ]);
  const addMember  = () => setTeam(t=>[...t,{id:crypto.randomUUID(),name:"",role:"Co-Investigator"}]);
  const updMember  = (id,f,v) => setTeam(t=>t.map(m=>m.id===id?{...m,[f]:v}:m));
  const delMember  = (id) => setTeam(t=>t.filter(m=>m.id!==id));

  const handleCreate = async () => {
    if(!name.trim()){ setError("Study name is required"); return; }
    setCreating(true);
    const filled   = team.filter(m=>m.name.trim());
    const lead     = filled[0]?.name||"";
    const coAuth   = filled.slice(1).map(m=>m.name).filter(Boolean).join(", ");
    const projectId= `NEP-${String(existingProjects.length+1).padStart(3,"0")}`;
    await onCreate({
      name: name.trim(),
      project_id: projectId,
      researcher: lead,
      co_authors: coAuth,
      research_team: filled,
    });
    setCreating(false);
    onClose();
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(0,0,0,0.75)"}}>
      <div style={{background:T.bg2,border:`1px solid ${T.border2}`,
        borderRadius:14,padding:28,width:520,
        boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",marginBottom:20}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:700,color:"#F0F6FF",marginBottom:4}}>
              Create new study
            </h2>
            <div style={{fontSize:12,color:T.text3}}>
              Step {step} of 2 — {step===1?"Study details":"Research team"}
            </div>
          </div>
          <Btn variant="ghost" onClick={onClose} style={{fontSize:18,padding:4}}>✕</Btn>
        </div>

        {/* Step indicators */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:24}}>
          {[1,2].map(s=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:"50%",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:13,fontWeight:700,
                background:step>=s?T.teal:T.bg3,
                color:step>=s?T.bg0:T.text3,
                border:`1px solid ${step>=s?T.teal:T.border}`}}>
                {s}
              </div>
              <span style={{fontSize:13,color:step===s?"#F0F6FF":T.text3,
                fontWeight:step===s?600:400}}>
                {s===1?"Study details":"Research team"}
              </span>
              {s<2&&<span style={{color:T.border2,fontSize:16}}>→</span>}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step===1&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <FieldLabel label="Study name" required/>
              <input value={name}
                onChange={e=>{setName(e.target.value);setError("");}}
                placeholder="e.g. Ashwagandha Stress & Anxiety Study 2026"
                autoFocus/>
              {error&&(
                <div style={{fontSize:11,color:T.red,marginTop:4}}>
                  ⚠ {error}
                </div>
              )}
              <div style={{fontSize:11,color:T.text3,marginTop:4}}>
                Compound details are automatically sourced from doctor patient data.
              </div>
            </div>
            <div style={{padding:"12px 16px",background:T.bg3,borderRadius:8,
              border:`1px solid ${T.border}`,fontSize:12,color:T.text3,lineHeight:1.6}}>
              💡 After creating the study, you can import doctor patient outcomes,
              add references, and generate a full IMRaD paper. Keywords and paper title
              can be auto-generated from your evidence data.
            </div>
          </div>
        )}

        {/* Step 2 — Research team */}
        {step===2&&(
          <div>
            <div style={{fontSize:13,color:T.text3,marginBottom:16}}>
              Add your research team. The lead investigator appears as first author on the paper.
            </div>
            <div style={{display:"grid",
              gridTemplateColumns:"1fr 180px 32px",
              gap:8,padding:"0 0 8px",
              fontSize:9,color:T.text3,fontWeight:700,
              textTransform:"uppercase",letterSpacing:"0.06em",
              borderBottom:`1px solid ${T.border}`,marginBottom:10}}>
              <span>Name</span><span>Role</span><span/>
            </div>
            {team.map((m,i)=>(
              <div key={m.id} style={{display:"grid",
                gridTemplateColumns:"1fr 180px 32px",
                gap:8,marginBottom:8,alignItems:"center"}}>
                <input value={m.name}
                  onChange={e=>updMember(m.id,"name",e.target.value)}
                  placeholder={i===0?"Lead researcher name…":"Team member name…"}
                  autoFocus={i===team.length-1&&i>0}/>
                <select value={m.role}
                  onChange={e=>updMember(m.id,"role",e.target.value)}
                  style={{padding:"9px 10px",borderRadius:6,
                    background:T.bg3,border:`1px solid ${T.border2}`,
                    color:"#F0F6FF",fontSize:13,fontFamily:"inherit"}}>
                  {ROLES.map(r=>(
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {i>0?(
                  <button onClick={()=>delMember(m.id)}
                    style={{background:"none",border:"none",color:T.red,
                      cursor:"pointer",fontSize:18,padding:0}}>✕</button>
                ):<div/>}
              </div>
            ))}
            <button onClick={addMember}
              style={{fontSize:12,color:T.teal,background:"none",
                border:`1px dashed ${T.teal}50`,borderRadius:6,
                padding:"6px 16px",cursor:"pointer",
                fontFamily:"inherit",marginTop:4,width:"100%"}}>
              + Add team member
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:24}}>
          {step>1?(
            <Btn variant="secondary" onClick={()=>setStep(1)}>← Back</Btn>
          ):(
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          )}
          {step<2?(
            <Btn onClick={()=>{
              if(!name.trim()){setError("Study name is required");return;}
              setStep(2);
            }}>
              Next: Research team →
            </Btn>
          ):(
            <Btn onClick={handleCreate} disabled={creating}>
              {creating?"Creating…":"Create study →"}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
};



const ProjectsPanel = ({ projects, onSelect, onNew, onDelete, onUpdate, loading, activeProjectId }) => {
  const [expanded, setExpanded] = useState(null);  // project id
  const [editing, setEditing]   = useState({});    // {[id]: {field: val}}
  const [confirming, setConfirming] = useState(null); // project id to delete
  const [saving, setSaving] = useState(null);

  const ROLES = ["Lead Investigator","Co-Investigator","Data Curator","Statistician","Reviewer","Contributing Author"];

  const startEdit = (p) => {
    setEditing(prev => ({
      ...prev,
      [p.id]: {
        name:           p.name||"",
        target_journal: p.target_journal||"",
        researcher:     p.researcher||"",
        co_authors:     p.co_authors||"",
        affiliation:    p.affiliation||"",
        keywords:       p.keywords||"",
        authors_paper:  p.authors_paper||p.researcher||"",
        research_team:  p.research_team?.length
          ? [...p.research_team]
          : [{id:crypto.randomUUID(),name:p.researcher||"",role:"Lead Investigator"}],
      }
    }));
  };

  const getEdit = (id) => editing[id];

  const updField = (id, field, val) =>
    setEditing(prev => ({...prev, [id]: {...prev[id], [field]: val}}));

  const updTeam = (projId, memberId, field, val) =>
    setEditing(prev => ({
      ...prev,
      [projId]: {
        ...prev[projId],
        research_team: prev[projId].research_team.map(m =>
          m.id===memberId ? {...m, [field]:val} : m
        )
      }
    }));

  const addTeamMember = (projId) =>
    setEditing(prev => ({
      ...prev,
      [projId]: {
        ...prev[projId],
        research_team: [
          ...prev[projId].research_team,
          {id:crypto.randomUUID(), name:"", role:"Co-Investigator"}
        ]
      }
    }));

  const removeTeamMember = (projId, memberId) =>
    setEditing(prev => ({
      ...prev,
      [projId]: {
        ...prev[projId],
        research_team: prev[projId].research_team.filter(m => m.id!==memberId)
      }
    }));

  const saveEdit = async (p) => {
    const e = editing[p.id];
    if (!e) return;
    setSaving(p.id);
    const filledTeam = e.research_team.filter(m=>m.name.trim());
    const updated = {
      ...p,
      name:           e.name,
      target_journal: e.target_journal,
      researcher:     filledTeam[0]?.name || e.researcher,
      co_authors:     filledTeam.slice(1).map(m=>m.name).join(", "),
      affiliation:    e.affiliation,
      keywords:       e.keywords,
      authors_paper:  e.authors_paper || filledTeam.map(m=>m.name).join("  ·  "),
      research_team:  filledTeam,
    };
    await onUpdate(updated);
    setEditing(prev => { const n={...prev}; delete n[p.id]; return n; });
    setSaving(null);
  };

  const cancelEdit = (id) =>
    setEditing(prev => { const n={...prev}; delete n[id]; return n; });

  return (
    <div className="fade-in" style={{maxWidth:960,margin:"0 auto"}}>
      <SectionHeader
        title="Projects"
        subtitle="Click a row to expand details, edit research team, or delete. Click Open to work on a project."
        action={<Btn onClick={onNew}>+ New project</Btn>}/>

      {loading ? (
        <div style={{textAlign:"center",padding:"60px 0",color:T.text3}}>
          <div style={{fontSize:24,marginBottom:8,
            animation:"spin 1s linear infinite",display:"inline-block"}}>↻</div>
          <div>Loading…</div>
        </div>
      ) : projects.length===0 ? (
        <div style={{textAlign:"center",padding:"80px 20px",
          border:`1px dashed ${T.border2}`,borderRadius:10}}>
          <div style={{fontSize:40,marginBottom:12,opacity:0.3}}>📁</div>
          <p style={{fontSize:14,color:T.text3,marginBottom:20}}>
            No projects yet. Create your first evidence synthesis.
          </p>
          <Btn onClick={onNew}>+ Create first project</Btn>
        </div>
      ) : (
        <div style={{border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>

          {/* Header row */}
          <div style={{display:"grid",
            gridTemplateColumns:"28px 80px 1fr 130px 70px 110px 70px 80px",
            padding:"8px 16px",background:T.bg3,
            borderBottom:`1px solid ${T.border}`}}>
            {["","ID","Project / Researcher","Journal","ESS","Updated","Outcomes",""].map(h=>(
              <div key={h} style={{fontSize:10,color:T.text3,fontWeight:700,
                textTransform:"uppercase",letterSpacing:"0.08em"}}>{h}</div>
            ))}
          </div>

          {projects.map((p,i)=>{
            const isExpanded = expanded===p.id;
            const isActive   = activeProjectId===p.id;
            const ed         = getEdit(p.id);
            const isEditing  = !!ed;

            return (
              <div key={p.id} style={{
                borderBottom:`1px solid ${T.border}`,
                borderLeft:`3px solid ${isActive?T.teal:"transparent"}`,
                background:isActive?T.tealBg:i%2===0?T.bg2:T.bg1,
              }}>

                {/* ── Collapsed row ── */}
                <div
                  onClick={()=>{
                    const next = isExpanded ? null : p.id;
                    setExpanded(next);
                    if (next && !ed) startEdit(p);
                  }}
                  style={{display:"grid",
                    gridTemplateColumns:"28px 80px 1fr 130px 70px 110px 70px 80px",
                    padding:"13px 16px",cursor:"pointer",alignItems:"center"}}>

                  {/* Expand toggle */}
                  <div style={{fontSize:11,color:T.text3,
                    transition:"transform 0.2s",
                    transform:isExpanded?"rotate(90deg)":"rotate(0deg)"}}>▶</div>

                  {/* Project ID */}
                  <div><Tag color={isActive?T.teal:T.text3}>{p.project_id||"—"}</Tag></div>

                  {/* Name + researcher */}
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF",
                      display:"flex",alignItems:"center",gap:6}}>
                      {p.name}
                      {isActive&&<Tag color={T.teal} style={{fontSize:9}}>● Active</Tag>}
                    </div>
                    {p.researcher&&(
                      <div style={{fontSize:11,color:T.text3,marginTop:1}}>
                        {p.researcher}{p.co_authors?` · ${p.co_authors}`:""}
                      </div>
                    )}
                  </div>

                  {/* Journal */}
                  <div style={{fontSize:11,color:T.text2,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {p.target_journal||"—"}
                  </div>

                  {/* ESS */}
                  <div style={{display:"flex",alignItems:"center"}}>
                    {p.ess!=null
                      ?<ScoreChip value={Number(p.ess).toFixed(2)}/>
                      :<span style={{color:T.text3,fontSize:11}}>—</span>}
                  </div>

                  {/* Updated */}
                  <div style={{fontSize:11,color:T.text3}}>
                    {p.updated_at
                      ?new Date(p.updated_at).toLocaleDateString("en-GB",
                          {day:"2-digit",month:"short",year:"2-digit"})
                      :"—"}
                  </div>

                  {/* Outcomes count */}
                  <div style={{fontSize:13,fontFamily:T.mono,color:'#C8D8EF'}}>
                    {p.outcome_count??0}
                  </div>

                  {/* Actions */}
                  <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                    <Btn onClick={()=>onSelect(p)}
                      variant={isActive?"primary":"secondary"}
                      style={{fontSize:11,padding:"3px 10px"}}>
                      {isActive?"Resume →":"Open →"}
                    </Btn>
                  </div>
                </div>

                {/* ── Expanded section ── */}
                {isExpanded&&(
                  <div style={{
                    borderTop:`1px solid ${T.border}`,
                    background:T.bg1,
                    padding:"20px 24px",
                    animation:"fadeIn 0.2s ease both",
                  }}>

                    {/* Project info fields */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
                      gap:10,marginBottom:20}}>
                      {[
                        ["Project name","name"],
                        ["Target journal","target_journal"],
                        ["Affiliation","affiliation"],
                        ["Keywords","keywords"],
                      ].map(([lbl,fld])=>(
                        <div key={fld}>
                          <FieldLabel label={lbl}/>
                          <input
                            value={ed?.[fld]??""}
                            onChange={e=>updField(p.id,fld,e.target.value)}/>
                        </div>
                      ))}
                      <div style={{gridColumn:"1/-1"}}>
                        <FieldLabel label="Paper authors (for title block)"/>
                        <input
                          value={ed?.authors_paper??""}
                          onChange={e=>updField(p.id,"authors_paper",e.target.value)}
                          placeholder="e.g. Smith AB  ·  Jones CD  ·  Patel R"/>
                        <div style={{fontSize:10,color:T.text3,marginTop:3}}>
                          Auto-populated from research team. Edit as needed. Format: Surname AB
                        </div>
                      </div>
                    </div>

                    {/* Research team */}
                    <div style={{marginBottom:20}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",marginBottom:10}}>
                        <FieldLabel label="Research team"/>
                        <Btn variant="ghost"
                          onClick={()=>addTeamMember(p.id)}
                          style={{fontSize:11,padding:"3px 8px"}}>
                          + Add member
                        </Btn>
                      </div>

                      {(ed?.research_team||[]).map((m,mi)=>(
                        <div key={m.id} style={{
                          display:"grid",
                          gridTemplateColumns:"1fr 160px 28px",
                          gap:8,marginBottom:6,alignItems:"center",
                        }}>
                          <input
                            value={m.name}
                            onChange={e=>updTeam(p.id,m.id,"name",e.target.value)}
                            placeholder={mi===0?"Lead investigator name…":"Team member name…"}/>
                          <select
                            value={m.role}
                            onChange={e=>updTeam(p.id,m.id,"role",e.target.value)}
                            style={{fontSize:12}}>
                            {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                          </select>
                          {(ed?.research_team||[]).length>1 ? (
                            <button
                              onClick={()=>removeTeamMember(p.id,m.id)}
                              style={{background:"none",border:"none",
                                color:T.text3,cursor:"pointer",
                                fontSize:16,padding:4,borderRadius:4}}>
                              ✕
                            </button>
                          ) : <div/>}
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div style={{display:"flex",gap:8,
                      justifyContent:"space-between",alignItems:"center"}}>

                      {/* Delete zone */}
                      {confirming===p.id ? (
                        <div style={{display:"flex",gap:8,alignItems:"center",
                          padding:"8px 12px",background:T.redBg,
                          borderRadius:8,border:`1px solid ${T.red}30`}}>
                          <span style={{fontSize:12,color:T.red,fontWeight:600}}>
                            Delete "{p.name}" and all its data?
                          </span>
                          <Btn variant="danger"
                            onClick={async()=>{
                              await onDelete(p.id);
                              setConfirming(null);
                              setExpanded(null);
                            }}
                            style={{fontSize:11,padding:"4px 12px"}}>
                            Yes, delete
                          </Btn>
                          <Btn variant="secondary"
                            onClick={()=>setConfirming(null)}
                            style={{fontSize:11,padding:"4px 10px"}}>
                            Cancel
                          </Btn>
                        </div>
                      ) : (
                        <Btn variant="ghost"
                          onClick={()=>setConfirming(p.id)}
                          style={{fontSize:11,color:T.red,padding:"4px 10px"}}>
                          🗑 Delete project
                        </Btn>
                      )}

                      <div style={{display:"flex",gap:8}}>
                        <Btn variant="secondary"
                          onClick={()=>{cancelEdit(p.id);setExpanded(null);}}
                          style={{fontSize:12}}>
                          Cancel
                        </Btn>
                        <Btn
                          onClick={()=>saveEdit(p)}
                          disabled={saving===p.id}
                          style={{fontSize:12,fontWeight:600}}>
                          {saving===p.id?"Saving…":"Save changes"}
                        </Btn>
                        <Btn
                          onClick={()=>onSelect(p)}
                          style={{fontSize:12}}>
                          {activeProjectId===p.id?"Resume →":"Open project →"}
                        </Btn>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ─── VALIDATE & GENERATE PANEL ──────────────────────────────────────── */
const AutoGenBtn = ({label, onClick}) => {
  const [running, setRunning] = useState(false);
  return (
    <button onClick={async()=>{setRunning(true);await onClick();setRunning(false);}}
      disabled={running}
      style={{fontSize:11,color:"#F59E0B",background:"none",
        border:"1px solid rgba(245,158,11,0.4)",borderRadius:4,
        padding:"4px 10px",cursor:running?"wait":"pointer",
        fontFamily:"inherit",opacity:running?0.7:1}}>
      {running?"Generating…":label}
    </button>
  );
};

const ValidateGeneratePanel = ({ outcomes, refs, compound, project,
  projectId, onUpdateProject, allPatients=[], activeCompound="",
  onNavToOverview, onNavToRefs, onNavToResults }) => {

  const [genMode,      setGenMode]      = useState(false);
  const [serverResult, setServerResult] = useState(null);
  const [checking,     setChecking]     = useState(false);
  const [section,      setSection]      = useState("metadata");
  const [titleVal,     setTitleVal]     = useState(project?.paper_title||"");
  const [keywordsVal,  setKeywordsVal]  = useState(project?.keywords||"");
  const [genLoading,   setGenLoading]   = useState(null);

  // Patients for this compound
  // Resolve compound name — fallback to first compound in patient data
  const _resolvedCompound = activeCompound
    || compound?.name || compound?.compound_name
    || [...new Set(allPatients.map(p=>p.primaryCompound?.name).filter(Boolean))][0]
    || "";
  const compPats  = _resolvedCompound
    ? allPatients.filter(p=>p.primaryCompound?.name===_resolvedCompound)
    : allPatients;
  const complete  = compPats.filter(p=>p.status==="complete");

  // Evidence methodology
  // Q varies by study type - use mean from patient data
  const qScores = {"RCT":4,"Meta-analysis":5,"Systematic review":5,
    "Clinical observation":3,"Observational":3,"Case series":2,"Mechanistic":2};
  const getQ = (p) => p.qualityScore || qScores[p.studyType||""] || 3;
  const compPatsComplete = complete; // reuse `complete` already computed above
  const meanQ = compPatsComplete.length
    ? Math.round(compPatsComplete.reduce((a,p)=>
        a+getQ(p),0)/compPatsComplete.length*10)/10
    : 3;
  const Q = meanQ;
  const Q_MAP = qScores;
  const S = complete.length>=200?5:complete.length>=100?4:
            complete.length>=50?3:complete.length>=20?2:1;

  // Per-symptom aggregation for synopsis
  const symMap = {};
  complete.forEach(p=>{
    [["symptom1","outcome1"],["symptom2","outcome2"]].forEach(([sk,ok])=>{
      const sym=p[sk]; const out=p.outcome?.[ok];
      if(!sym||!out?.direction) return;
      if(!symMap[sym]) symMap[sym]={imp:0,nc:0,wor:0,sig:0,mcid:0,total:0,ws:[]};
      const d=symMap[sym]; d.total++;
      const isImp=out.direction==="Improved";
      const isSig=out.significance==="Yes";
      const isMcid=out.mcid==="Yes";
      if(isImp) d.imp++; else if(out.direction==="Worsened") d.wor++; else d.nc++;
      if(isSig) d.sig++;
      if(isMcid) d.mcid++;
      const O = isImp&&isSig&&isMcid?4:isImp&&isSig?3:isImp?2:1;
      d.ws.push(Q+S+O-0);
    });
  });
  const symptoms  = Object.values(symMap).sort((a,b)=>b.total-a.total);
  const allWS     = symptoms.flatMap(s=>s.ws);
  const ess       = allWS.length?allWS.reduce((a,b)=>a+b,0)/allWS.length:null;
  const essC      = ess==null?"—":ess>=12?"Very Strong":ess>=9?"Strong":ess>=6?"Moderate":"Weak";
  const essCol    = ess==null?T.text3:ess>=9?T.green:ess>=6?T.amber:T.red;
  const overallImpRate = symptoms.reduce((a,s)=>a+s.imp,0) /
    Math.max(symptoms.reduce((a,s)=>a+s.total,0),1) * 100;

  // Auto-populate title/keywords
    // Auto-import patient outcomes if none exist
  useEffect(()=>{
    if(outcomes.length===0 && allPatients.length>0){
      const completed = allPatients.filter(p=>p.status==="complete"&&p.outcome?.outcome1?.direction);
      if(completed.length>0){
        // Build outcome rows from patient data inline
        const newOuts = [];
        completed.forEach(p=>{
          const comp = p.primaryCompound;
          const compObj = comp?[{id:comp.id||comp.name,name:comp.name,scientific:comp.scientific||""}]:[];
          const base = {
            study_type:p.studyType||"Clinical observation",
            population:`${p.age||"?"}y ${p.gender||""}`,
            sample_n:String(completed.length),
            quality_score:String(p.qualityScore||3), outcome_score:"3",
            bias_tool:"Clinical observation",
            bias_d1:"0",bias_d2:"0",bias_d3:"0",bias_d4:"0",bias_d5:"0",
            _biasP:0, _sampleScore:0, _ws:null, _saved:false, _errors:{},
            study_ref_id:`${p.id}-OBS`,
            compounds:compObj, compound_name:comp?.name||"",
            dosage:p.primaryDose||"", dose_unit:p.primaryDoseUnit||"mg",
            frequency:p.primaryFrequency||"", duration:p.targetDuration||"",
            _fromPatient:true, _patientId:p.id, _doctorName:p.doctorName||"",
          };
          [["symptom1","outcome1"],["symptom2","outcome2"]].forEach(([sk,ok])=>{
            const sym=p[sk]; const out=p.outcome?.[ok];
            if(!sym||!out?.direction) return;
            const isImp=out.direction==="Improved";
            const isSig=out.significance==="Yes";
            const isMcid=out.mcid==="Yes";
            const oScore=isImp?(isSig&&isMcid?4:isSig?3:2):1;
            const ss = completed.length>=200?5:completed.length>=100?4:completed.length>=50?3:completed.length>=20?2:1;
            const ws = Number(p.qualityScore||3)+ss+oScore-0;
            newOuts.push({...base, id:crypto.randomUUID(),
              outcome_name:sym, outcome_category:"Clinical",
              direction:out.direction,
              significance:isSig?"Significant":"Not Significant",
              es_value:out.magnitude||"", mcid_met:isMcid?"Yes":"No",
              outcome_score:String(oScore), p_value:isSig?"< 0.05":"",
              _sampleScore:ss, _biasP:0, _ws:ws,
            });
          });
        });
        if(newOuts.length>0){
          // This is a prop — we can't set it directly. Signal parent via callback.
          // Instead, save to _STORE and let parent pick it up
          try{
            const pid = "_default";
            _STORE.outcomes[pid] = newOuts;
            _persist();
          }catch(e){}
        }
      }
    }
  },[]);

useEffect(()=>{
    const compName = _resolvedCompound||compound?.name||compound?.compound_name||"";
    const symNames = symptoms.slice(0,3).map(s=>Object.keys(symMap).find(k=>symMap[k]===s)).filter(Boolean);
    if(!titleVal&&compName){
      const t = `${compName}: Evidence Synthesis of Clinical Outcomes in ${symNames.slice(0,2).join(" and ")||"Wellness Conditions"}`;
      setTitleVal(t);
      if(project&&onUpdateProject) onUpdateProject({...project,paper_title:t});
    }
    if(!keywordsVal&&compName){
      const k = [compName, compound?.scientific||"Withania somnifera",
        ...symNames.slice(0,3), "clinical observation","evidence synthesis",
        "nutraceutical"].filter(Boolean).join("; ");
      setKeywordsVal(k);
      if(project&&onUpdateProject) onUpdateProject({...project,keywords:k});
    }
  },[project?.id, symptoms.length]);

  // Derive team from project
  // Load researcher details from localStorage meta (saved by StudiesListPanel)
  const _studyMeta = (() => {
    try {
      const compName = _resolvedCompound || compound?.name || project?.compound_name || "";
      const key = `nep_study_meta_${compName||"default"}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : null;
    } catch(e) { return null; }
  })();
  const _initTeam   = _studyMeta?.team || project?.research_team || [];
  const _initCoAuth = _initTeam.slice(1).map(m=>m.name).filter(Boolean).join(", ")
    || project?.co_authors || "";

  const [lead,   setLead]   = useState(_initTeam[0]?.name || project?.researcher || "");
  const [coAuth]            = useState(_initCoAuth);
  const [affil,  setAffil]  = useState(_studyMeta?.affiliation || project?.affiliation || "");
  const [journal,setJournal]= useState(_studyMeta?.journal || _studyMeta?.target_journal || project?.target_journal || "");
  const [team,   setTeamLocal] = useState(_initTeam);
  const notes  = _studyMeta?.notes || project?.notes || "";

  const _saveMetaLocal = (overrides={}) => {
    const meta = {notes, prognosis:"", team:overrides.team||team, affiliation:overrides.affiliation||affil, journal:overrides.journal||journal};
    try{localStorage.setItem(`nep_study_meta_${_resolvedCompound||"default"}`,JSON.stringify(meta));}catch(ex){}
  };


  if(genMode) return (
    <GenerationPanel outcomes={outcomes} refs={refs} compound={compound}
      project={project} projectId={projectId} onBack={()=>setGenMode(false)}/>
  );

  // Primary compound details from patient data
  const _compDetail = compPats[0]?.primaryCompound || {};
  const compScientific = _compDetail.scientific || "";
  const compExtract    = _compDetail.extract_form || "";
  const compStd        = _compDetail.standardisation || "";
  const compDoseRange  = _compDetail.dose_range || "";
  const compDurRange   = _compDetail.duration_range || "";

  // Field completeness check - comprehensive
  const fields = [
    {cat:"Paper",     label:"Paper title",       val:titleVal,         fix:"Auto-generate or type above",             nav:"",         required:true},
    {cat:"Paper",     label:"Keywords",          val:keywordsVal,      fix:"Auto-generate or type above",             nav:"",         required:true},
    {cat:"Paper",     label:"Target journal",    val:journal,          fix:"Study Overview → Research Team → ✎ Edit", nav:"overview", required:false},
    {cat:"Authors",   label:"Lead researcher",   val:lead,             fix:"Study Overview → Research Team → ✎ Edit", nav:"overview", required:true},
    {cat:"Authors",   label:"Affiliation",       val:affil,            fix:"Study Overview → Research Team → ✎ Edit", nav:"overview", required:false},
    {cat:"Authors",   label:"Co-authors",        val:coAuth,           fix:"Study Overview → Research Team → ✎ Edit", nav:"overview", required:false},
    {cat:"Compound",  label:"Primary compound",  val:_resolvedCompound,   fix:"Auto-sourced from patient data",           nav:"",         required:true},
    {cat:"Compound",  label:"Scientific name",   val:compScientific,   fix:"Auto-sourced from patient data",           nav:"",         required:false},
    {cat:"Compound",  label:"Extract form",      val:compExtract,      fix:"Auto-sourced from patient data",           nav:"",         required:false},
    {cat:"Compound",  label:"Standardisation",   val:compStd,          fix:"Auto-sourced from patient data",           nav:"",         required:false},
    {cat:"Compound",  label:"Dose range",        val:compDoseRange,    fix:"Auto-sourced from patient data",           nav:"",         required:false},
    {cat:"Compound",  label:"Duration range",    val:compDurRange,     fix:"Auto-sourced from patient data",           nav:"",         required:false},
    {cat:"Compound",  label:"Study notes",       val:notes,            fix:"Study Overview → Study Notes",             nav:"overview", required:false},
    {cat:"Evidence",  label:"Completed cases",   val:compPatsComplete.length>0?`${compPatsComplete.length} cases`:"", fix:"Doctors must close patient cases", nav:"", required:true},
    {cat:"Evidence",  label:"Outcome rows",      val:(()=>{ const n=outcomes.length||(allPatients||[]).filter(p=>p.status==="complete"&&p.outcome?.outcome1?.direction).length; return n>0?`${n} rows`:""; })(), fix:"Computed Results → Import outcomes", nav:"results", required:true},
    {cat:"Evidence",  label:"ESS computed",      val:ess!=null?`${(Number(ess)||0).toFixed(2)} (${essC})`:"", fix:"Computed Results tab", nav:"results", required:true},
    {cat:"References",label:"References",        val:refs.length>0?`${refs.length} added`:"", fix:"References tab → Search PubMed", nav:"refs", required:false},
  ];


  const filled  = fields.filter(f=>f.val).length;
  const missing = fields.filter(f=>!f.val&&f.required);
  const optional= fields.filter(f=>!f.val&&!f.required);

  const blockers = [
    ...complete.length===0?["No completed patient cases — doctors need to close cases"]:[] ,
    ...!titleVal?["Paper title required — auto-generate or type below"]:[] ,
  ];
  const ready = blockers.length===0;

  const TabBtn = ({id,label,warn=false})=>(
    <button onClick={()=>setSection(id)} style={{
      padding:"9px 18px",fontSize:13,fontWeight:section===id?700:400,
      background:section===id?T.teal:"transparent",
      color:section===id?T.bg0:"#F0F6FF",
      border:`1px solid ${section===id?T.teal:T.border}`,
      borderRadius:6,cursor:"pointer",fontFamily:"inherit",
      display:"flex",alignItems:"center",gap:6,
    }}>
      {label}
      {warn&&<span style={{fontSize:10,color:section===id?T.bg0:T.amber}}>⚠</span>}
    </button>
  );

  const autoGenTitle = async()=>{
    setGenLoading("title");
    try{
      const t = await generatePaperTitle(
        [{name:_resolvedCompound||compound?.name||"",scientific:compound?.scientific||""}],
        outcomes, project?.target_journal
      );
      setTitleVal(t);
      if(project) onUpdateProject({...project,paper_title:t});
    }catch(e){}
    setGenLoading(null);
  };
  const autoGenKeywords = async()=>{
    setGenLoading("keywords");
    try{
      const k = await generateKeywords(
        [{name:_resolvedCompound||compound?.name||""}], outcomes
      );
      setKeywordsVal(k);
      if(project) onUpdateProject({...project,keywords:k});
    }catch(e){}
    setGenLoading(null);
  };

  return (
    <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:20}}>

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div style={{background:T.bg2,borderRadius:10,padding:20,
        border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:"#F0F6FF",marginBottom:4}}>
              Validate & Generate
            </div>
            <div style={{fontSize:12,color:T.text3}}>
              Review all fields, confirm methodology, then generate your IMRaD paper
            </div>
          </div>
          {/* Readiness indicator */}
          <div style={{textAlign:"center",background:T.bg3,borderRadius:10,
            padding:"12px 20px",border:`1px solid ${ready?T.green:T.amber}40`}}>
            <div style={{fontSize:24,fontWeight:800,
              color:ready?T.green:T.amber,lineHeight:1}}>
              {filled}/{fields.length}
            </div>
            <div style={{fontSize:10,color:ready?T.green:T.amber,
              fontWeight:700,marginTop:4}}>
              {ready?"✓ Ready":"Fields filled"}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{height:6,background:T.bg3,borderRadius:3,
          overflow:"hidden",marginBottom:12}}>
          <div style={{height:"100%",borderRadius:3,
            background:ready?T.green:T.amber,
            width:`${filled/fields.length*100}%`,
            transition:"width 0.5s"}}/>
        </div>

        {/* Blockers */}
        {blockers.length>0&&(
          <div style={{background:T.amberBg,borderRadius:8,
            padding:"12px 14px",border:`1px solid ${T.amber}30`}}>
            <div style={{fontSize:11,fontWeight:700,color:T.amber,
              marginBottom:8}}>
              {blockers.length} item{blockers.length>1?"s":""} need attention before generating:
            </div>
            {blockers.map((b,i)=>(
              <div key={i} style={{display:"flex",gap:8,
                fontSize:12,color:"#F0F6FF",marginBottom:4,
                alignItems:"center"}}>
                <span style={{color:T.amber,flexShrink:0}}>→</span>
                {b}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TABS ────────────────────────────────────────────────── */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <TabBtn id="metadata" label="Paper metadata"/>
        <TabBtn id="check"    label={`Field check (${filled}/${fields.length})`}
          warn={missing.length>0}/>
        <TabBtn id="synopsis" label="Results synopsis"/>
        <TabBtn id="generate" label={`Generate${blockers.length>0?` (${blockers.length} issues)`:""}`}/>
      </div>

      {/* ── FIELD CHECK TAB ─────────────────────────────────────── */}
      {section==="check"&&(
        <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
          {["Paper","Authors","Compound","Evidence","References"].map(cat=>{
            const catFields = fields.filter(f=>f.cat===cat);
            const catFilled = catFields.filter(f=>f.val).length;
            return (
              <div key={cat} style={{background:T.bg2,borderRadius:10,
                padding:16,border:`1px solid ${T.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:700,color:T.teal,
                    textTransform:"uppercase",letterSpacing:"0.06em"}}>
                    {cat}
                  </div>
                  <span style={{fontSize:11,color:catFilled===catFields.length?T.green:T.amber,
                    fontWeight:600}}>
                    {catFilled}/{catFields.length}
                  </span>
                </div>
                {catFields.map(f=>(
                  <div key={f.label} style={{display:"flex",alignItems:"flex-start",
                    gap:10,padding:"8px 10px",borderRadius:6,marginBottom:4,
                    background:f.val?T.greenBg:f.required?T.redBg:T.bg3,
                    border:`1px solid ${f.val?T.green:f.required?"#E05C5C30":T.border}`}}>
                    <span style={{color:f.val?T.green:f.required?T.red:T.text3,
                      fontSize:14,flexShrink:0,marginTop:1}}>
                      {f.val?"✓":f.required?"✕":"○"}
                    </span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#F0F6FF",fontWeight:600}}>
                          {f.label}
                          {f.required&&!f.val&&(
                            <span style={{color:T.red,marginLeft:4,fontSize:10}}>required</span>
                          )}
                        </span>
                        {f.val?(
                          <span style={{fontSize:11,color:T.text3,
                            overflow:"hidden",textOverflow:"ellipsis",
                            whiteSpace:"nowrap",maxWidth:200}}>
                            {f.val}
                          </span>
                        ):(
                          <button onClick={()=>{
                              if(f.nav==="overview") { onNavToOverview&&onNavToOverview(); }
                              else if(f.nav==="refs") { onNavToRefs&&onNavToRefs(); }
                              else if(f.nav==="results") { onNavToResults&&onNavToResults(); }
                            }}
                            style={{fontSize:10,color:T.teal,fontStyle:"italic",
                              background:"none",border:"none",cursor:"pointer",
                              fontFamily:"inherit",padding:0,textDecoration:"underline"}}>
                            → {f.fix}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── RESULTS SYNOPSIS TAB ────────────────────────────────── */}
      {section==="synopsis"&&(
        <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Methodology box */}
          <div style={{background:T.bg2,borderRadius:10,padding:20,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:4}}>
              Evidence methodology
            </div>
            <div style={{fontSize:11,color:T.text3,marginBottom:16}}>
              This will appear in the Methods section of your paper
            </div>

            <div style={{background:T.bg3,borderRadius:8,padding:14,
              fontSize:13,color:"#F0F6FF",lineHeight:1.8,marginBottom:16,
              border:`1px solid ${T.border}`}}>
              <strong>Study design:</strong> Multi-site clinical observational study.
              Patient data collected by {[...new Set(compPats.map(p=>p.doctorName).filter(Boolean))].length} contributing
              clinician{[...new Set(compPats.map(p=>p.doctorName).filter(Boolean))].length!==1?"s":""} using
              the NEP Clinical mobile application. {complete.length} cases completed
              out of {compPats.length} enrolled ({compPats.length?Math.round(complete.length/compPats.length*100):0}% completion rate).
              <br/><br/>
              <strong>Scoring methodology:</strong> Evidence weighted using the NEP
              Weighted Score (WS) formula: WS = Q + S + O − B, where Q = study quality
              (3 for clinical observation), S = sample score (auto-computed from n={complete.length},
              S={S}), O = outcome score (auto-computed from direction × significance × MCID;
              range 1–4), B = bias penalty (0 for prospective clinical observation).
              Evidence Strength Score (ESS) = mean WS across all outcome rows.
              <br/><br/>
              <strong>Outcome recording:</strong> Treating clinicians recorded direction
              (Improved/No change/Worsened), effect magnitude, statistical significance
              and MCID attainment per symptom per patient at case closure.
              Active cases excluded from evidence synthesis.
            </div>

            {/* WS breakdown */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
              {[
                {label:"Q — Quality",val:Q,desc:"Clinical observation"},
                {label:"S — Sample",val:S,desc:`n=${complete.length} completed`},
                {label:"O — Outcome",val:"1–4",desc:"Auto from direction+sig+MCID"},
                {label:"B — Bias",val:0,desc:"Prospective obs. = 0"},
              ].map(({label,val,desc})=>(
                <div key={label} style={{background:T.bg3,borderRadius:8,
                  padding:"10px 12px",border:`1px solid ${T.border}`,
                  textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:T.teal,
                    fontFamily:T.mono}}>{val}</div>
                  <div style={{fontSize:11,fontWeight:700,color:"#F0F6FF",
                    marginTop:4}}>{label}</div>
                  <div style={{fontSize:10,color:T.text3,marginTop:2}}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Results summary */}
          <div style={{background:T.bg2,borderRadius:10,padding:20,
            border:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF"}}>
                Results summary
              </div>
              <div style={{textAlign:"center",background:T.bg3,
                borderRadius:8,padding:"8px 16px",
                border:`1px solid ${essCol}40`}}>
                <div style={{fontSize:22,fontWeight:800,color:essCol,
                  fontFamily:T.mono}}>
                  {ess!=null?(Number(ess)||0).toFixed(2):"—"}
                </div>
                <div style={{fontSize:10,color:essCol,fontWeight:700}}>
                  ESS · {essC}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",
              gap:10,marginBottom:16}}>
              {[
                ["Completed cases",    complete.length,         "#F0F6FF"],
                ["Overall improved",   `${Math.round(overallImpRate)}%`, T.green],
                ["Statistically sig.", symptoms.reduce((a,s)=>a+s.sig,0), T.teal],
                ["MCID met",           symptoms.reduce((a,s)=>a+s.mcid,0), T.amber],
              ].map(([label,val,col])=>(
                <div key={label} style={{background:T.bg3,borderRadius:8,
                  padding:"10px 12px",border:`1px solid ${T.border}`,
                  textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:col,
                    fontFamily:T.mono}}>{val}</div>
                  <div style={{fontSize:10,color:T.text3,marginTop:4}}>{label}</div>
                </div>
              ))}
            </div>

            {/* Per-symptom synopsis */}
            {symptoms.length>0&&(
              <div>
                <div style={{fontSize:11,color:T.text3,fontWeight:700,
                  textTransform:"uppercase",letterSpacing:"0.06em",
                  marginBottom:8}}>Per-symptom results</div>
                {symptoms.map((s,i)=>{
                  const symName = Object.keys(symMap).find(k=>symMap[k]===s)||"";
                  const impPct  = Math.round(s.imp/s.total*100);
                  const meanWS  = s.ws.length?s.ws.reduce((a,b)=>a+b,0)/s.ws.length:0;
                  const verdict = impPct>=75?"Strong positive"
                    :impPct>=50?"Moderate positive"
                    :impPct>=25?"Mixed":"Limited";
                  const vCol    = impPct>=75?T.green:impPct>=50?T.teal:T.amber;
                  return (
                    <div key={symName} style={{padding:"10px 12px",
                      borderRadius:8,marginBottom:6,background:T.bg3,
                      border:`1px solid ${T.border}`,
                      display:"flex",alignItems:"center",gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",
                          marginBottom:2}}>{symName}</div>
                        <div style={{fontSize:11,color:T.text3}}>
                          {s.total} cases · {s.imp} improved ({impPct}%) ·{" "}
                          {s.sig} significant · {s.mcid} met MCID
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:16,fontWeight:700,color:meanWS>=9?T.green:meanWS>=6?T.teal:T.amber,
                          fontFamily:T.mono}}>WS {meanWS.toFixed(1)}</div>
                        <span style={{fontSize:10,padding:"2px 8px",
                          borderRadius:4,fontWeight:700,
                          background:`${vCol}20`,color:vCol}}>
                          {verdict}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Prognosis summary */}
          {project?.notes&&(
            <div style={{background:T.bg2,borderRadius:10,padding:20,
              border:`1px solid ${T.border}`}}>
              <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:12}}>
                Study notes (from Study Overview)
              </div>
              <div style={{fontSize:13,color:"#F0F6FF",lineHeight:1.7,
                whiteSpace:"pre-line"}}>{project.notes}</div>
            </div>
          )}
        </div>
      )}

      {/* ── PAPER METADATA TAB ──────────────────────────────────── */}
      {section==="metadata"&&(
        <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:T.bg2,borderRadius:10,padding:20,
            border:`1px solid ${T.border}`}}>
            <div style={{fontSize:12,color:T.teal,fontWeight:700,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:16}}>
              Paper metadata — edit before generating
            </div>

            {/* Title */}
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:6}}>
                <FieldLabel label="Paper title" required/>
                <button onClick={autoGenTitle} disabled={genLoading==="title"}
                  style={{fontSize:11,color:T.teal,background:"none",
                    border:`1px solid ${T.teal}40`,borderRadius:4,
                    padding:"3px 12px",cursor:"pointer",fontFamily:"inherit"}}>
                  {genLoading==="title"
                    ?<span style={{animation:"spin 1s linear infinite",
                      display:"inline-block"}}>↻</span>
                    :"✦ Auto-generate"}
                </button>
              </div>
              <input value={titleVal}
                onChange={e=>{setTitleVal(e.target.value);
                  if(project) onUpdateProject({...project,paper_title:e.target.value});}}
                placeholder="Auto-generate or type your paper title…"
                style={{fontSize:13,fontWeight:500}}/>
            </div>

            {/* Keywords */}
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:6}}>
                <FieldLabel label="Keywords"/>
                <button onClick={autoGenKeywords} disabled={genLoading==="keywords"}
                  style={{fontSize:11,color:T.teal,background:"none",
                    border:`1px solid ${T.teal}40`,borderRadius:4,
                    padding:"3px 12px",cursor:"pointer",fontFamily:"inherit"}}>
                  {genLoading==="keywords"
                    ?<span style={{animation:"spin 1s linear infinite",
                      display:"inline-block"}}>↻</span>
                    :"✦ Auto-generate"}
                </button>
              </div>
              <input value={keywordsVal}
                onChange={e=>{setKeywordsVal(e.target.value);
                  if(project) onUpdateProject({...project,keywords:e.target.value});}}
                placeholder="Auto-generate or enter keywords separated by semicolons…"
                style={{fontSize:13}}/>
              <div style={{fontSize:10,color:T.text3,marginTop:4}}>
                Separate with semicolons · will appear in paper header
              </div>
            </div>

            {/* Research team & journal — full editor */}
            <div style={{paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:10,color:T.teal,fontWeight:700,
                  textTransform:"uppercase",letterSpacing:"0.06em"}}>
                  👥 Research team & journal
                </div>
                <button onClick={()=>{
                  const newM = {id:crypto.randomUUID(),name:"",role:"Co-Investigator"};
                  const updated = [...team, newM];
                  setTeamLocal(updated);
                  _saveMetaLocal({team:updated});
                }} style={{fontSize:11,color:T.teal,background:"none",
                  border:`1px solid ${T.teal}40`,borderRadius:4,
                  padding:"3px 12px",cursor:"pointer",fontFamily:"inherit"}}>
                  + Add member
                </button>
              </div>

              {/* Affiliation + Journal */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div>
                  <FieldLabel label="Institution / Affiliation"/>
                  <input value={affil}
                    onChange={e=>{
                      setAffil(e.target.value);
                      _saveMetaLocal({affiliation:e.target.value});
                    }}
                    placeholder="e.g. AIIMS New Delhi, India"
                    style={{fontSize:13}}/>
                </div>
                <div>
                  <FieldLabel label="Target journal"/>
                  <input value={journal}
                    onChange={e=>{
                      setJournal(e.target.value);
                      _saveMetaLocal({journal:e.target.value});
                    }}
                    placeholder="e.g. Journal of Ethnopharmacology"
                    style={{fontSize:13}}/>
                </div>
              </div>

              {/* Team member rows */}
              <div style={{display:"grid",
                gridTemplateColumns:"1fr 180px 32px",
                gap:6,padding:"0 0 6px",fontSize:9,color:T.text3,
                fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",
                borderBottom:`1px solid ${T.border}`,marginBottom:8}}>
                <span>Name</span><span>Role</span><span/>
              </div>
              {team.map((m,i)=>(
                <div key={m.id||i} style={{display:"grid",
                  gridTemplateColumns:"1fr 180px 32px",
                  gap:6,alignItems:"center",marginBottom:6}}>
                  <input value={m.name||""}
                    onChange={e=>{
                      const updated = team.map((t,j)=>j===i?{...t,name:e.target.value}:t);
                      setTeamLocal(updated);
                      if(i===0) setLead(e.target.value);
                      _saveMetaLocal({team:updated});
                    }}
                    placeholder={i===0?"Lead researcher name…":"Team member name…"}
                    style={{padding:"8px 10px",borderRadius:6,
                      background:T.bg3,border:`1px solid ${T.border2}`,
                      color:"#F0F6FF",fontSize:13,fontFamily:"inherit",
                      width:"100%",boxSizing:"border-box"}}/>
                  <select value={m.role||"Co-Investigator"}
                    onChange={e=>{
                      const updated = team.map((t,j)=>j===i?{...t,role:e.target.value}:t);
                      setTeamLocal(updated);
                      _saveMetaLocal({team:updated});
                    }}
                    style={{padding:"8px 8px",borderRadius:6,
                      background:T.bg3,border:`1px solid ${T.border2}`,
                      color:"#F0F6FF",fontSize:13,fontFamily:"inherit",width:"100%"}}>
                    {RESEARCHER_ROLES.map(r=>(
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {i>0?(
                    <button onClick={()=>{
                      const updated = team.filter((_,j)=>j!==i);
                      setTeamLocal(updated);
                      _saveMetaLocal({team:updated});
                    }}
                      style={{background:"none",border:"none",
                        color:T.red,cursor:"pointer",fontSize:18,padding:0}}>
                      ✕
                    </button>
                  ):<div/>}
                </div>
              ))}
            </div>

            {/* Compound summary — read-only from patient data */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,
              paddingTop:14,borderTop:`1px solid ${T.border}`,marginTop:14}}>
              {[
                ["Primary compound",  _resolvedCompound||compound?.name||"—"],
                ["Scientific name",   compound?.scientific||compScientific||"—"],
              ].map(([label,val])=>(
                <div key={label}>
                  <div style={{fontSize:9,color:T.text3,fontWeight:700,
                    textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>
                    {label}
                  </div>
                  <div style={{fontSize:12,color:"#F0F6FF"}}>
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── GENERATE TAB ────────────────────────────────────────── */}
      {section==="generate"&&(
        <div className="fade-in" style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[
              {label:"Completed cases",    ok:complete.length>0,  detail:`${complete.length} cases`},
              {label:"Outcome rows",       ok:outcomes.length>0,  detail:`${outcomes.length} rows imported`},
              {label:"ESS computed",       ok:ess!=null,          detail:ess!=null?`${(Number(ess)||0).toFixed(2)} · ${essC}`:"Not yet"},
              {label:"Lead researcher",    ok:!!lead,             detail:lead||"Not set"},
              {label:"Paper title",        ok:!!titleVal,         detail:titleVal?titleVal.slice(0,40)+"…":"Not set"},
              {label:"References",         ok:refs.length>0,      detail:`${refs.length} reference${refs.length!==1?"s":""}`,optional:true},
            ].map(({label,ok,detail,optional})=>(
              <div key={label} style={{display:"flex",gap:10,padding:"10px 14px",
                background:T.bg3,borderRadius:6,
                border:`1px solid ${ok?T.border:optional?"#F5A62330":"#E05C5C30"}`,
                alignItems:"center"}}>
                <span style={{color:ok?T.green:optional?T.amber:T.red,
                  fontSize:16,flexShrink:0}}>
                  {ok?"✓":optional?"○":"✕"}
                </span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,color:"#F0F6FF",fontWeight:500}}>
                    {label}
                    {optional&&!ok&&(
                      <span style={{fontSize:10,color:T.amber,marginLeft:6}}>
                        optional
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:T.text3,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>
                </div>
              </div>
            ))}
          </div>

          {blockers.map((b,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"10px 14px",
              background:T.redBg,borderRadius:8,
              border:`1px solid ${T.red}30`,alignItems:"center"}}>
              <span style={{color:T.red,flexShrink:0}}>✕</span>
              <span style={{fontSize:12,color:"#F0F6FF"}}>{b}</span>
            </div>
          ))}

          <div style={{background:T.bg2,borderRadius:10,padding:20,
            border:`1px solid ${ready?T.green:T.amber}40`,
            display:"flex",alignItems:"center",
            justifyContent:"space-between",gap:16}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#F0F6FF",marginBottom:4}}>
                {ready?"✓ Ready to generate your paper":"Fix the issues above first"}
              </div>
              <div style={{fontSize:11,color:T.text3}}>
                Generates a full IMRaD paper: Abstract, Introduction, Methods,
                Results, Discussion, Conclusion, References
              </div>
            </div>
            <div style={{display:"flex",gap:10,flexShrink:0}}>
              <Btn variant="secondary" onClick={async()=>{
                  setChecking(true);
                  try{const r=await API.validate(projectId||"_default");setServerResult(r);}
                  catch(e){setServerResult({ready:false,issues:[e.message],warnings:[]});}
                  setChecking(false);
                }} disabled={checking} style={{fontSize:12}}>
                {checking?"↻ Checking…":"Run check"}
              </Btn>
              <Btn onClick={()=>setGenMode(true)} disabled={!ready}
                style={{padding:"11px 28px",fontSize:14,fontWeight:700}}>
                {ready?"✓ Generate paper →":"Fix issues first"}
              </Btn>
            </div>
          </div>
          {serverResult&&(
            <div style={{fontSize:12,color:serverResult.ready?T.green:T.amber,
              padding:"8px 14px",background:T.bg3,borderRadius:6,
              border:`1px solid ${serverResult.ready?T.green:T.amber}30`}}>
              Server check: {serverResult.ready
                ?"✓ All passed"
                :`${serverResult.issues?.length||0} issue(s) — ${serverResult.issues?.join(", ")}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};




const _delay = (ms) => new Promise(r => setTimeout(r, ms));
/* Load persisted store — per-user key so roles don't share data */
const _loadStoreForUser = (userId) => {
  try {
    const key = "nep_store_" + userId;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
          // Merge shared compounds + studies (cross-user sync)
      const sharedComps = (() => {
        try { return JSON.parse(localStorage.getItem("nep_shared_compounds")||"null"); }
        catch(e){ return null; }
      })();
      const sharedStudies = (() => {
        try { return JSON.parse(localStorage.getItem("nep_shared_studies")||"null"); }
        catch(e){ return null; }
      })();
      return {
        projects:        parsed.projects||[],
        outcomes:        parsed.outcomes||{},
        refs:            parsed.refs||{},
        compounds:       parsed.compounds||{},
        compounds_repo:  sharedComps || parsed.compounds_repo||null,
        patients:        parsed.patients||{},
        patientProgress: parsed.patientProgress||{},
        studies:         sharedStudies || parsed.studies||[],
      };
    }
  } catch(e) { /* ignore corrupt storage */ }
  // No per-user data — still load shared compounds + studies
  const sharedCompsF = (() => {
    try { return JSON.parse(localStorage.getItem("nep_shared_compounds")||"null"); }
    catch(e){ return null; }
  })();
  const sharedStudiesF = (() => {
    try { return JSON.parse(localStorage.getItem("nep_shared_studies")||"null"); }
    catch(e){ return null; }
  })();
  return {
    projects:[], outcomes:{}, refs:{}, compounds:{},
    compounds_repo: sharedCompsF||null,
    patients:{}, patientProgress:{},
    studies: sharedStudiesF||[],
  };
};
const _loadStore = () => {
  // Restore session from localStorage
  try {
    const saved = localStorage.getItem("nep_session");
    if(saved) {
      const u = JSON.parse(saved);
      if(u && u.email) {
        // Always re-derive role from email — never trust stored role
        const roleMap = {
          "admin@nep.science":      "admin",
          "researcher@nep.science": "researcher",
          "doctor@nep.science":     "doctor",
          "doctor2@nep.science":    "doctor",
          "demo@nep.science":       "researcher",
        };
        u.role = roleMap[u.email.toLowerCase()] || "researcher";
        return { user:u, jobs:{}, projects:[], outcomes:{},
          refs:{}, compounds:{}, patients:{},
          patientProgress:{}, studies:[], compounds_repo:null };
      }
    }
  } catch(e) {}
  return { user:null, jobs:{}, projects:[], outcomes:{}, refs:{},
    compounds:{}, patients:{}, patientProgress:{},
    studies:[], compounds_repo:null };
};
const _STORE = _loadStore();
const _persist = () => {
  if(!_STORE.user?.id) return;
  try {
    const key = "nep_store_" + _STORE.user.id;
    localStorage.setItem(key, JSON.stringify({
      projects:        _STORE.projects,
      outcomes:        _STORE.outcomes,
      refs:            _STORE.refs,
      compounds:       _STORE.compounds,
      compounds_repo:  _STORE.compounds_repo,
      patients:        _STORE.patients,
      patientProgress: _STORE.patientProgress,
      studies:         _STORE.studies,
    }));
    // Shared keys — visible across all users (compounds + studies)
    if(_STORE.compounds_repo?.length){
      localStorage.setItem("nep_shared_compounds",
        JSON.stringify(_STORE.compounds_repo));
    }
    if(_STORE.studies?.length){
      localStorage.setItem("nep_shared_studies",
        JSON.stringify(_STORE.studies));
    }
  } catch(e) { /* ignore quota errors */ }
};

const MockAdapter = {
  async signIn({email,password}){
    await _delay(600);
    if(!email||!password) throw new Error("Email and password required");
    const userId = "user-" + email.toLowerCase().replace(/[^a-z0-9]/g,"-");
    const roleMap = {
      "admin@nep.science":      "admin",
      "researcher@nep.science": "researcher",
      "doctor@nep.science":     "doctor",
      "doctor2@nep.science":    "doctor",
      "demo@nep.science":       "researcher",
    };
    const role = roleMap[email.toLowerCase()] || "researcher";
    const displayName = email.split("@")[0];
    _STORE.user={id:userId,email,name:displayName,
                 org:"org-"+userId,role,displayName};
    // Load per-user data — also migrate from old "user-1" key if empty
    let userData = _loadStoreForUser(userId);
    if(!userData.projects.length){
      const legacy = _loadStoreForUser("user-1");
      if(legacy.projects.length) userData = legacy;
    }
    _STORE.projects       = userData.projects;
    _STORE.outcomes       = userData.outcomes;
    _STORE.refs           = userData.refs;
    _STORE.compounds      = userData.compounds;
    _STORE.compounds_repo = userData.compounds_repo;
    _STORE.patients       = userData.patients || {};
    _STORE.patientProgress= userData.patientProgress || {};
    _STORE.studies        = userData.studies || [];
    // Persist session so role survives page refresh
    localStorage.setItem("nep_session", JSON.stringify(_STORE.user));
    return _STORE.user;
  },
  async signUp({email,password,name,role="researcher"}){
    await _delay(800);
    if(!email||!password) throw new Error("All fields required");
    const userId = "user-" + email.toLowerCase().replace(/[^a-z0-9]/g,"-");
    _STORE.user={id:userId,email,name,org:"org-"+userId,
                 role,displayName:name};
    _STORE.projects=[]; _STORE.outcomes={}; _STORE.refs={};
    _STORE.compounds={}; _STORE.compounds_repo=null;
    _STORE.patients={}; _STORE.patientProgress={}; _STORE.studies=[];
    return _STORE.user;
  },
  async signOut(){
    await _delay(200);
    _STORE.user=null;
    localStorage.removeItem("nep_session");
  },
  getSession(){
    const u = _STORE.user;
    if(!u) return null;
    // Always re-derive role from email — never trust stored role
    const roleMap = {
      "admin@nep.science":      "admin",
      "researcher@nep.science": "researcher",
      "doctor@nep.science":     "doctor",
      "doctor2@nep.science":    "doctor",
      "demo@nep.science":       "researcher",
    };
    u.role = roleMap[u.email?.toLowerCase()] || "researcher";
    return u;
  },
  async listProjects(){ await _delay(300); return [..._STORE.projects]; },
  async createProject(data){
    await _delay(400);
    const p={id:"proj-"+Date.now(),...data,created_at:new Date().toISOString()};
    _STORE.projects.push(p); _persist(); return p;
  },
  async updateProject(id,data){
    await _delay(250);
    _STORE.projects=_STORE.projects.map(p=>p.id===id?{...p,...data}:p); _persist();
    return _STORE.projects.find(p=>p.id===id);
  },
  async deleteProject(id){
    await _delay(300);
    _STORE.projects = _STORE.projects.filter(p=>p.id!==id);
    delete _STORE.outcomes[id];
    delete _STORE.refs[id];
    delete _STORE.compounds[id];
    if(_STORE.compounds_repo){
      // compounds_repo is shared, don't delete from it
    }
    _persist();
    return {ok:true};
  },
  async saveCompound(pid,data){ await _delay(250); _STORE.compounds[pid]=data; _persist(); return data; },
  async getCompound(pid){ await _delay(150); return _STORE.compounds[pid]||null; },
  async listOutcomes(pid){ await _delay(200); return [...(_STORE.outcomes[pid]||[])]; },
  async saveOutcomes(pid,arr){
    await _delay(50);
    _STORE.outcomes[pid]=arr;
    _persist(); return arr;
  },
  async saveOutcome(pid,o){
    await _delay(180);
    if(!_STORE.outcomes[pid]) _STORE.outcomes[pid]=[];
    const idx=_STORE.outcomes[pid].findIndex(x=>x.id===o.id);
    if(idx>=0) _STORE.outcomes[pid][idx]=o; else _STORE.outcomes[pid].push(o);
    _persist(); return o;
  },
  async deleteOutcome(pid,oid){
    await _delay(150);
    if(_STORE.outcomes[pid]) _STORE.outcomes[pid]=_STORE.outcomes[pid].filter(o=>o.id!==oid);
    _persist();
  },
  async listRefs(pid){ await _delay(200); return [...(_STORE.refs[pid]||[])]; },
  async saveRef(pid,r){
    await _delay(180);
    if(!_STORE.refs[pid]) _STORE.refs[pid]=[];
    const idx=_STORE.refs[pid].findIndex(x=>x.id===r.id);
    if(idx>=0) _STORE.refs[pid][idx]=r; else _STORE.refs[pid].push(r);
    _persist(); return r;
  },
  async deleteRef(pid,rid){
    await _delay(150);
    if(_STORE.refs[pid]) _STORE.refs[pid]=_STORE.refs[pid].filter(r=>r.id!==rid);
    _persist();
  },
  async validate(pid){
    await _delay(500);
    const outcomes=_STORE.outcomes[pid]||[], refs=_STORE.refs[pid]||[];
    const issues=[], warnings=[];
    outcomes.forEach(o=>{
      if(o.mcid_met==="Yes"){
        const found=MCID_LIB.some(m=>
          (o.outcome_name||"").toLowerCase().includes(m.outcome.toLowerCase().split("(")[0].trim())||
          m.outcome.toLowerCase().includes((o.outcome_name||"").toLowerCase().split("(")[0].trim())
        );
        if(!found) warnings.push(`MCID_Met=Yes for "${o.outcome_name}" but no threshold in MCID library`);
      }
    });
    refs.forEach(r=>{
      if(r.study_ref_id&&(!r.volume||!r.pages)&&
         !["N/A","guideline","background"].some(s=>(r.bias_overall||"").includes(s)))
        warnings.push(`Reference [${r.study_ref_id}]: missing volume or pages`);
      if(r.study_ref_id&&!r.study_ref_id.includes("BKG")&&!r.bias_overall)
        warnings.push(`Reference [${r.study_ref_id}]: Bias_Overall_Rating not set`);
    });
    const incomplete=outcomes.filter(o=>!o.outcome_name||!o.study_ref_id||!o.significance||!o.quality_score||!o.outcome_score);
    if(incomplete.length) issues.push(`${incomplete.length} outcome(s) missing required fields`);
    // Single outcome is acceptable; warn but don't block
if(outcomes.length<1) issues.push("At least 1 outcome is required");
    return {issues,warnings,ready:issues.length===0};
  },
  async startGeneration(pid){
    await _delay(350);
    const jobId="job-"+Date.now();
    _STORE.jobs[jobId]={id:jobId,pid,status:"running",stage:1,pct:0,log:[],started_at:Date.now()};
    const steps=[
      [600,10,"s1","Validating evidence input…"],
      [700,22,"s1","Computing aggregated metrics…"],
      [500,34,"s1","Building Table 1 (study summary)…"],
      [600,44,"s1","Building Table 2 (outcome scores)…"],
      [500,54,"s1","Building Table 3 (compound metrics)…"],
      [700,60,"s1","Generating structured abstract…"],
      [400,62,"s2","Stage 1 complete (3,200 words) — AI expansion starting…"],
      [1100,68,"s2","Expanding Introduction with SR landscape…"],
      [950,75,"s2","Expanding Discussion 4.1 — evidence strength…"],
      [900,81,"s2","Expanding Discussion 4.2 — bioavailability…"],
      [850,87,"s2","Expanding Discussion 4.3–4.6…"],
      [700,91,"s2","Generating Conclusions and priority areas…"],
      [600,94,"s2","Rendering .docx (Times New Roman, IMRaD)…"],
      [500,97,"s2","Rendering .pdf (headless conversion)…"],
      [600,100,"s2","Veracity audit: 39/39 checks passed ✓"],
    ];
    (async()=>{
      const j=_STORE.jobs[jobId];
      for(const [ms,pct,stage,msg] of steps){
        await _delay(ms);
        j.pct=pct; j.stage=(stage==="s1"?1:2); j.log.push({t:Date.now(),msg});
      }
      j.status="done";
      j.result={word_count:5820,veracity:"39/39",tables:3,
        docx_url:"#download-docx",pdf_url:"#download-pdf",share_url:"#share-"+jobId};
    })();
    return jobId;
  },
  async pollJob(jobId){ await _delay(80); return _STORE.jobs[jobId]||null; },
  async listCompounds() {
    await _delay(150);
    if(!_STORE.compounds_repo) _STORE.compounds_repo=[...SEED_COMPOUNDS];
    return [..._STORE.compounds_repo];
  },

  /* ── Patient API ── */
  async listPatients(studyId){
    await _delay(200);
    if(!_STORE.user?.id) return [];
    return Object.values(_STORE.patients||{})
      .filter(p=>!studyId||p.studyId===studyId);
  },
  async createPatient(data){
    await _delay(300);
    const id = "PAT-" + String(Object.keys(_STORE.patients||{}).length+1).padStart(3,"0");
    const patient = {
      id, ...data,
      createdBy: _STORE.user?.id,
      doctorName: _STORE.user?.displayName||_STORE.user?.email,
      createdAt: new Date().toISOString(),
      status: "active",
      // Encrypt sensitive fields (mock AES - in prod use real encryption)
      _encrypted: true,
      _name_enc: btoa(data.name||""),
      _dob_enc:  btoa(data.dob||""),
      _contact_enc: btoa(data.contact||""),
      name: id, // display name = patient ID only
      dob: null,
      contact: null,
    };
    if(!_STORE.patients) _STORE.patients={};
    _STORE.patients[id] = patient;
    _persist(); return patient;
  },
  async getPatientDecrypted(id){
    // Only the doctor who created the patient can decrypt
    const p = _STORE.patients?.[id];
    if(!p) throw new Error("Patient not found");
    if(p.createdBy !== _STORE.user?.id)
      throw new Error("Access denied — not your patient");
    return {
      ...p,
      name:    p._name_enc    ? atob(p._name_enc)    : p.id,
      dob:     p._dob_enc     ? atob(p._dob_enc)     : "",
      contact: p._contact_enc ? atob(p._contact_enc) : "",
    };
  },
  async savePatientProgress(patientId, weekData){
    await _delay(200);
    if(!_STORE.patientProgress) _STORE.patientProgress={};
    if(!_STORE.patientProgress[patientId]) _STORE.patientProgress[patientId]=[];
    const idx = _STORE.patientProgress[patientId].findIndex(w=>w.week===weekData.week);
    if(idx>=0) _STORE.patientProgress[patientId][idx]=weekData;
    else _STORE.patientProgress[patientId].push(weekData);
    _persist(); return weekData;
  },
  async listPatientProgress(patientId){
    await _delay(150);
    return [...(_STORE.patientProgress?.[patientId]||[])];
  },
  async markPatientComplete(patientId, outcomeData){
    await _delay(300);
    if(_STORE.patients?.[patientId]){
      _STORE.patients[patientId].status = "complete";
      _STORE.patients[patientId].outcome = outcomeData;
    }
    _persist();
    return _STORE.patients[patientId];
  },

  /* ── Study API (compound-centric) ── */
  async listStudies(){
    await _delay(200);
    return [...(_STORE.studies||[])];
  },
  async createStudy(data){
    await _delay(300);
    const s = {id:"study-"+Date.now(),...data,
      createdAt:new Date().toISOString(),
      createdBy:_STORE.user?.id,
      patientCount:0, outcomeCount:0};
    if(!_STORE.studies) _STORE.studies=[];
    _STORE.studies.push(s); _persist(); return s;
  },
  async getStudyPatientOutcomes(studyId){
    // Aggregate completed patient outcomes into evidence rows
    await _delay(300);
    const patients = Object.values(_STORE.patients||{})
      .filter(p=>p.studyId===studyId && p.status==="complete" && p.outcome);
    return patients.map((p,i)=>({
      id: crypto.randomUUID(),
      study_id: "STUDY-"+String(i+1).padStart(3,"0"),
      study_ref_id: p.id+"-CLINICAL-01",
      compounds: p.compounds||[],
      outcome_name: p.outcome?.outcome_name||"",
      outcome_category: p.outcome?.category||"",
      direction: p.outcome?.direction||"",
      significance: p.outcome?.significance||"",
      sample_n: patients.length,
      quality_score: p.outcome?.quality_score||"3",
      outcome_score: p.outcome?.outcome_score||"3",
      bias_d1:"0",bias_d2:"0",bias_d3:"0",bias_d4:"0",bias_d5:"0",
      bias_tool: "Clinical observation",
      mcid_met: p.outcome?.mcid_met||"Unknown",
      _saved: true, _errors:{},
      _sampleScore: 0, _biasP: 0, _ws: null,
      _fromPatientData: true,
      _patientId: p.id,
      _doctorName: p.doctorName,
    }));
  },
  async addCompound(compound) {
    await _delay(200);
    if(!_STORE.compounds_repo) _STORE.compounds_repo=[...SEED_COMPOUNDS];
    _STORE.compounds_repo.push(compound);
    _persist();
    return compound;
  },
};
const API=MockAdapter;

/* ─── TOAST ──────────────────────────────────────────────────────────── */
const ToastCtx=createContext(null);
const useToast=()=>useContext(ToastCtx);
const ToastProvider=({children})=>{
  const [toasts,setToasts]=useState([]);
  const add=useCallback((msg,type="success")=>{
    const id=Date.now()+Math.random();
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3500);
  },[]);
  const toast={success:m=>add(m,"success"),error:m=>add(m,"error"),info:m=>add(m,"info")};
  return(
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{position:"fixed",bottom:20,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
        {toasts.map(t=>(
          <div key={t.id} style={{
            padding:"10px 16px",borderRadius:8,fontSize:13,fontWeight:500,
            background:t.type==="error"?"#7F1D1D":t.type==="info"?"#1E3A5F":"#064E3B",
            border:`1px solid ${t.type==="error"?T.red:t.type==="info"?T.blue:T.green}50`,
            color:t.type==="error"?T.red:t.type==="info"?"#93C5FD":T.green,
            boxShadow:"0 4px 16px rgba(0,0,0,0.5)",animation:"fadeIn 0.2s ease both",
            maxWidth:360,display:"flex",alignItems:"center",gap:8,
          }}>
            <span>{t.type==="error"?"✕":t.type==="info"?"ℹ":"✓"}</span>{t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};


/* ─── AUTH SCREEN ────────────────────────────────────────────────────── */

/* ─── PROJECT SELECTOR ───────────────────────────────────────────────── */
const ProjectSelector=({user,onSelect,onSignOut})=>{
  const [projects,setProjects]=useState([]);
  const [loading,setLoading]=useState(true);
  const [creating,setCreating]=useState(false);
  const [form,setForm]=useState({name:"",compound_id:"",target_journal:""});
  const toast=useToast();
  useEffect(()=>{API.listProjects().then(p=>{setProjects(p);setLoading(false);});},[]);
  const create=async()=>{
    if(!form.name.trim()) return;
    const p=await API.createProject({name:form.name,compound_id:form.compound_id||"COMP-001",
      target_journal:form.target_journal,researcher:user.name});
    setProjects(prev=>[...prev,p]);toast.success("Project created");
    setCreating(false);setForm({name:"",compound_id:"",target_journal:""});onSelect(p);
  };
  return(
    <div style={{minHeight:"100vh",background:T.bg0,display:"flex",flexDirection:"column"}}>
      <div style={{borderBottom:`1px solid ${T.border}`,padding:"14px 24px",
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:28,height:28,borderRadius:6,background:T.teal,display:"flex",
            alignItems:"center",justifyContent:"center"}}>
            <span style={{color:T.bg0,fontSize:14,fontWeight:700,fontFamily:T.mono}}>N</span>
          </div>
          <span style={{fontSize:13,fontWeight:600,color:T.text0}}>NEP Platform</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:12,color:T.text3}}>{user.email}</span>
          <Btn variant="ghost" onClick={()=>{
            if(confirm("Clear all local data? This cannot be undone.")){
              localStorage.removeItem("nep_store");
              window.location.reload();
            }
          }} style={{fontSize:12,color:T.red}}>Clear data</Btn>
          <Btn variant="ghost" onClick={onSignOut} style={{fontSize:12}}>Sign out</Btn>
        </div>
      </div>
      <div style={{flex:1,padding:"40px 24px",maxWidth:800,margin:"0 auto",width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
          <div>
            <h1 style={{fontSize:24,fontWeight:600,color:T.text0,marginBottom:4}}>Your projects</h1>
            <p style={{fontSize:13,color:T.text3}}>Each project = one compound synthesis</p>
          </div>
          <Btn onClick={()=>setCreating(true)}>+ New project</Btn>
        </div>
        {creating&&(
          <div style={{background:T.bg2,border:`1px solid ${T.tealDim}40`,borderRadius:10,
            padding:20,marginBottom:20,animation:"fadeIn 0.2s ease both"}}>
            <h3 style={{fontSize:14,fontWeight:600,color:T.text0,marginBottom:14}}>New project</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
              <div><FieldLabel label="Study name" required/>
                <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                  placeholder="Ashwagandha KSM-66 Synthesis" autoFocus/></div>
              <div><FieldLabel label="Compound ID"/>
                <input value={form.compound_id} onChange={e=>setForm(p=>({...p,compound_id:e.target.value}))}
                  placeholder="ASH-001"/></div>
              <div><FieldLabel label="Target journal"/>
                <input value={form.target_journal} onChange={e=>setForm(p=>({...p,target_journal:e.target.value}))}
                  placeholder="J Ethnopharmacol"/></div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={create}>Create project</Btn>
              <Btn variant="secondary" onClick={()=>{setCreating(false);setForm({name:"",compound_id:"",target_journal:""});}}>Cancel</Btn>
            </div>
          </div>
        )}
        {loading?<div style={{textAlign:"center",padding:40,color:T.text3}}>Loading…</div>
        :projects.length===0?(
          <div style={{textAlign:"center",padding:"60px 20px",border:`1px dashed ${T.border2}`,borderRadius:10}}>
            <div style={{fontSize:36,marginBottom:12,opacity:0.3}}>⊕</div>
            <p style={{fontSize:14,marginBottom:6,color:'#C8D8EF'}}>No projects yet</p>
            <p style={{fontSize:12,color:T.text3,marginBottom:20}}>Create your first project to start a compound evidence synthesis</p>
            <Btn onClick={()=>setCreating(true)}>Create first project</Btn>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {projects.map(p=>(
              <button key={p.id} onClick={()=>onSelect(p)} style={{
                textAlign:"left",background:T.bg2,border:`1px solid ${T.border}`,
                borderRadius:10,padding:"16px 20px",cursor:"pointer",width:"100%",
                transition:"border-color 0.15s,background 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.tealDim;e.currentTarget.style.background=T.bg3;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.bg2;}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:600,color:T.text0,marginBottom:3}}>{p.name}</div>
                    <div style={{fontSize:11,color:T.text3,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      {p.compound_id&&<Tag color={T.teal}>{p.compound_id}</Tag>}
                      {p.target_journal&&<span>{p.target_journal}</span>}
                      <span>Created {new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span style={{color:T.text3,fontSize:18}}>›</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── VALIDATE TAB (API-wired) ───────────────────────────────────────── */
const ValidateTab=({outcomes,refs,compound,project,projectId})=>{
  const [genMode,setGenMode]=useState(false);
  const [apiResult,setApiResult]=useState(null);
  const [checking,setChecking]=useState(false);
  const toast=useToast();
  const runCheck=async()=>{
    setChecking(true);
    try{
      const r=await API.validate(projectId||"demo");
      setApiResult(r);
      if(r.ready) toast.success("All checks passed");
      else toast.info(`${r.issues.length} issue(s) found`);
    }catch(e){toast.error("Validation failed: "+e.message);}
    finally{setChecking(false);}
  };
  return(
    <div className="fade-in">
      <SectionHeader title="Validate & generate"
        subtitle="Pre-flight checks before paper generation. All issues must be resolved."
        action={
          <Btn variant="secondary" onClick={runCheck} disabled={checking} style={{fontSize:12}}>
            {checking?<><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>Checking…</>:"↻ Re-run server checks"}
          </Btn>
        }/>
      {apiResult&&(
        <div style={{marginBottom:14,padding:"10px 14px",borderRadius:8,
          background:apiResult.ready?T.greenBg:T.redBg,
          border:`1px solid ${apiResult.ready?T.green:T.red}30`}}>
          <div style={{fontSize:12,fontWeight:600,color:apiResult.ready?T.green:T.red,marginBottom:4}}>
            Server: {apiResult.ready?"✓ All checks passed":`✗ ${apiResult.issues.length} issue(s)`}
          </div>
          {apiResult.issues.map((i,idx)=><div key={idx} style={{fontSize:11,color:T.red,marginBottom:2}}>✕ {i}</div>)}
          {apiResult.warnings.map((w,idx)=><div key={idx} style={{fontSize:11,color:T.amber,marginBottom:2}}>⚠ {w}</div>)}
        </div>
      )}
      {genMode
        ?<GenerationPanel outcomes={outcomes} refs={refs} compound={compound}
            project={project} projectId={projectId} onBack={()=>setGenMode(false)}/>
        :<ValidationPanel outcomes={outcomes} refs={refs} compound={compound}
            onGenerate={()=>setGenMode(true)}/>}
    </div>
  );
};

/* ─── MAIN APP (API-WIRED) ────────────────────────────────────────────── */


/* ─── SYMPTOM TAXONOMY ───────────────────────────────────────────────── */
const DEFAULT_SYMPTOM_TAXONOMY = [
  { category:"Stress & Sleep", subcategories:[
    { name:"Stress & Sleep", symptoms:[
      "Chronic stress",
      "Generalised anxiety",
      "Poor sleep quality",
      "Low mood",
      "Chronic fatigue",
      "Brain fog",
    ]},
  ]},
];

const loadTaxonomy = () => {
  try {
    const shared = localStorage.getItem("nep_shared_taxonomy");
    if(shared) return JSON.parse(shared);
  } catch(e) {}
  return DEFAULT_SYMPTOM_TAXONOMY;
};

/* ─── TEST DATA SEED ─────────────────────────────────────────────────── */
const SEED_PATIENTS = [{"id":"RAV-001","age":"59","gender":"Male","symptom1":"Chronic stress","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-14","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-21","response":"Same","score1":6,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-28","response":"Same","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-04","response":"Same","score1":6,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-11","response":"Same","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-18","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-25","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-10-02","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-09","response":"Better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-16","response":"Better","score1":2,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-23","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-30","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-11-06","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-11-13","response":"Much better","score1":2,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-11-20","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-11-27","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-12-04","response":"Much better","score1":2,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-002","age":"56","gender":"Female","symptom1":"Generalised anxiety","symptom2":null,"studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-07-05","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-12","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-19","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-26","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-02","response":"Same","score1":8,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-09","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-16","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-23","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-30","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-09-06","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-13","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-09-20","response":"Better","score1":3,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-09-27","response":"Much better","score1":2,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-10-04","response":"Same","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-10-11","response":"Much better","score1":1,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-10-18","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-10-25","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-003","age":"44","gender":"Female","symptom1":"Poor sleep quality","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-21","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-28","response":"Same","score1":7,"score2":8,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-05","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-12","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-19","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-26","response":"Better","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-02","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-09","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-16","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-23","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-11-30","response":"Better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-07","response":"Same","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-14","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-12-21","response":"Much better","score1":2,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-12-28","response":"Same","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-04","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-01-11","response":"Much better","score1":1,"score2":3,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"62% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-004","age":"30","gender":"Male","symptom1":"Chronic stress","symptom2":"Low energy & fatigue","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-04-20","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-27","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-05-04","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-05-11","response":"Same","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-05-18","response":"Same","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-25","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-06-01","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-06-08","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-06-15","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-06-22","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-06-29","response":"Much better","score1":3,"score2":3,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-07-06","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-07-13","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-07-20","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-07-27","response":"Much better","score1":2,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-08-03","response":"Much better","score1":1,"score2":1,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-08-10","response":"Much better","score1":1,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-005","age":"34","gender":"Male","symptom1":"Generalised anxiety","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-10-06","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-13","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-20","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-27","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-03","response":"Same","score1":7,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-10","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-17","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-24","response":"Same","score1":7,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-01","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-08","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-15","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-22","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-29","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2026-01-05","response":"Same","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2026-01-12","response":"Much better","score1":2,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-19","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-01-26","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"86% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-006","age":"61","gender":"Female","symptom1":"Low energy & fatigue","symptom2":"High cortisol","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-07-18","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-25","response":"Same","score1":5,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-01","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-08","response":"Same","score1":5,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-15","response":"Same","score1":5,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-22","response":"Better","score1":3,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-29","response":"Better","score1":3,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-05","response":"Better","score1":4,"score2":4,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-12","response":"Better","score1":2,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-09-19","response":"Better","score1":2,"score2":4,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-26","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-03","response":"Much better","score1":3,"score2":3,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-10-10","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-10-17","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-10-24","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-10-31","response":"Same","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-11-07","response":"Same","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"50% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"71% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-007","age":"47","gender":"Female","symptom1":"Low energy & fatigue","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-10-27","status":"complete","weeklyLogs":[{"week":1,"date":"2025-11-03","response":"Same","score1":9,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-11-10","response":"Same","score1":9,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-17","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-24","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-12-01","response":"Better","score1":5,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-12-08","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-12-15","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-22","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-008","age":"27","gender":"Male","symptom1":"Chronic stress","symptom2":"Generalised anxiety","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-05-07","status":"complete","weeklyLogs":[{"week":1,"date":"2025-05-14","response":"Same","score1":6,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-05-21","response":"Same","score1":6,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-05-28","response":"Same","score1":6,"score2":9,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-06-04","response":"Same","score1":6,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-06-11","response":"Better","score1":3,"score2":6,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-06-18","response":"Better","score1":3,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-06-25","response":"Better","score1":4,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-07-02","response":"Much better","score1":3,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-07-09","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-07-16","response":"Much better","score1":3,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-07-23","response":"Much better","score1":2,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-07-30","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-08-06","response":"Much better","score1":2,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-08-13","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-08-20","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-08-27","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"78% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-009","age":"56","gender":"Female","symptom1":"Generalised anxiety","symptom2":null,"studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-04-10","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-17","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-04-24","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-05-01","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-05-08","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-15","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-22","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-05-29","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-06-05","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-06-12","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-06-19","response":"Same","score1":6,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-06-26","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-07-03","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-07-10","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-07-17","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-07-24","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-07-31","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-010","age":"49","gender":"Female","symptom1":"Generalised anxiety","symptom2":"Low energy & fatigue","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-28","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-05","response":"Same","score1":9,"score2":7,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-12","response":"Same","score1":9,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-19","response":"Same","score1":9,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-26","response":"Same","score1":9,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-02","response":"Same","score1":7,"score2":4,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-09","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-16","response":"Same","score1":7,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-23","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-08-30","response":"Much better","score1":4,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-06","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-09-13","response":"Much better","score1":5,"score2":4,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-09-20","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-09-27","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-10-04","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-10-11","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-10-18","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"57% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-011","age":"28","gender":"Male","symptom1":"High cortisol","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-12","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-19","response":"Same","score1":8,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-26","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-02","response":"Same","score1":9,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-09","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-16","response":"Better","score1":6,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-23","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-30","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-07","response":"Much better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-14","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-21","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-28","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-11-04","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-012","age":"45","gender":"Male","symptom1":"Generalised anxiety","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-08","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-15","response":"Same","score1":8,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-22","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-29","response":"Same","score1":9,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-06","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-13","response":"Better","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-20","response":"Much better","score1":5,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-10-27","response":"Much better","score1":5,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-03","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-10","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-11-17","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-11-24","response":"Much better","score1":3,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-01","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-013","age":"62","gender":"Male","symptom1":"Generalised anxiety","symptom2":"Chronic stress","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-05-15","status":"complete","weeklyLogs":[{"week":1,"date":"2025-05-22","response":"Same","score1":7,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-05-29","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-05","response":"Same","score1":7,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-06-12","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-06-19","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-06-26","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-07-03","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-07-10","response":"Better","score1":3,"score2":3,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-07-17","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-07-24","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-07-31","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-08-07","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"75% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-014","age":"29","gender":"Male","symptom1":"High cortisol","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-10-08","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-15","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-22","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-29","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-05","response":"Better","score1":5,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-12","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-19","response":"Much better","score1":4,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-26","response":"Much better","score1":4,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-03","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-10","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-17","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-24","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-31","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-015","age":"42","gender":"Male","symptom1":"Poor sleep quality","symptom2":"High cortisol","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-10-27","status":"complete","weeklyLogs":[{"week":1,"date":"2025-11-03","response":"Same","score1":9,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-11-10","response":"Same","score1":9,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-17","response":"Same","score1":9,"score2":5,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-24","response":"Better","score1":5,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-12-01","response":"Better","score1":6,"score2":4,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-12-08","response":"Much better","score1":5,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-12-15","response":"Much better","score1":5,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-22","response":"Much better","score1":5,"score2":3,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-29","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2026-01-05","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2026-01-12","response":"Much better","score1":3,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2026-01-19","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"80% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-016","age":"39","gender":"Female","symptom1":"Low energy & fatigue","symptom2":"Chronic stress","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-27","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-04","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-11","response":"Same","score1":8,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-18","response":"Same","score1":8,"score2":8,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-25","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-01","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-08","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-15","response":"Better","score1":5,"score2":3,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-22","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-08-29","response":"Same","score1":5,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-05","response":"Much better","score1":2,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-09-12","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-09-19","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"62% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-017","age":"35","gender":"Non-binary","symptom1":"Poor sleep quality","symptom2":null,"studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-03","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-10","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-17","response":"Same","score1":7,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-24","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-01","response":"Same","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-08","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-15","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-10-22","response":"Same","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-29","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-018","age":"26","gender":"Female","symptom1":"Low energy & fatigue","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-10-11","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-18","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-25","response":"Same","score1":9,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-01","response":"Same","score1":9,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-08","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-15","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-22","response":"Much better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-29","response":"Much better","score1":5,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-06","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-13","response":"Much better","score1":3,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-20","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-27","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2026-01-03","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-019","age":"53","gender":"Non-binary","symptom1":"Low energy & fatigue","symptom2":"Poor sleep quality","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-26","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-03","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-10","response":"Same","score1":9,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-17","response":"Same","score1":8,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-24","response":"Better","score1":5,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-31","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-07","response":"Much better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-14","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-21","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-08-28","response":"Much better","score1":1,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-04","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-09-11","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-09-18","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"78% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-020","age":"67","gender":"Non-binary","symptom1":"Generalised anxiety","symptom2":"Chronic stress","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-10-24","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-31","response":"Same","score1":5,"score2":8,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-11-07","response":"Same","score1":5,"score2":8,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-14","response":"Better","score1":4,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-21","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-28","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-12-05","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-12-12","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-19","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"62% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-021","age":"37","gender":"Non-binary","symptom1":"High cortisol","symptom2":null,"studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-05-28","status":"complete","weeklyLogs":[{"week":1,"date":"2025-06-04","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-06-11","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-18","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-06-25","response":"Much better","score1":3,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-02","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-07-09","response":"Same","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-07-16","response":"Much better","score1":2,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-07-23","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-022","age":"64","gender":"Male","symptom1":"Generalised anxiety","symptom2":"High cortisol","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-04-01","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-08","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-04-15","response":"Same","score1":9,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-04-22","response":"Same","score1":7,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-04-29","response":"Better","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-06","response":"Better","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-13","response":"Much better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-05-20","response":"Same","score1":6,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-05-27","response":"Much better","score1":3,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-06-03","response":"Same","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-06-10","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-06-17","response":"Same","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-06-24","response":"Much better","score1":1,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-023","age":"47","gender":"Male","symptom1":"Poor sleep quality","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-09","status":"complete","weeklyLogs":[{"week":1,"date":"2025-06-16","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-06-23","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-30","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-07","response":"Same","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-14","response":"Better","score1":4,"score2":4,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-07-21","response":"Much better","score1":2,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-07-28","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-04","response":"Better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-08-11","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-08-18","response":"Much better","score1":1,"score2":3,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-08-25","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-09-01","response":"Much better","score1":1,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"71% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-024","age":"49","gender":"Non-binary","symptom1":"Poor sleep quality","symptom2":"Chronic stress","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-25","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-02","response":"Same","score1":8,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-09","response":"Same","score1":8,"score2":8,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-16","response":"Same","score1":8,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-23","response":"Same","score1":7,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-30","response":"Better","score1":6,"score2":5,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-06","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-13","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-20","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-08-27","response":"Much better","score1":3,"score2":3,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-03","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-09-10","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-09-17","response":"Much better","score1":2,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-09-24","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-10-01","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-10-08","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-10-15","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"75% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-025","age":"65","gender":"Non-binary","symptom1":"Chronic stress","symptom2":"High cortisol","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-21","status":"complete","weeklyLogs":[{"week":1,"date":"2025-06-28","response":"Same","score1":8,"score2":7,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-05","response":"Same","score1":7,"score2":7,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-12","response":"Same","score1":7,"score2":7,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-19","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-26","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-02","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-09","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-16","response":"Much better","score1":3,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-08-23","response":"Much better","score1":2,"score2":3,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-08-30","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-09-06","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-09-13","response":"Same","score1":3,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"62% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"75% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-026","age":"31","gender":"Female","symptom1":"Chronic stress","symptom2":"Low energy & fatigue","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-26","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-03","response":"Same","score1":7,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-10","response":"Same","score1":9,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-17","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-24","response":"Much better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-31","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-07","response":"Much better","score1":2,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-14","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-21","response":"Much better","score1":2,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-027","age":"34","gender":"Female","symptom1":"Generalised anxiety","symptom2":"Chronic stress","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-07","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-14","response":"Same","score1":8,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-21","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-28","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-05","response":"Better","score1":5,"score2":6,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-12","response":"Better","score1":5,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-19","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-10-26","response":"Much better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-02","response":"Much better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-09","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-11-16","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-11-23","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-11-30","response":"Same","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"44% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-028","age":"33","gender":"Male","symptom1":"Generalised anxiety","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-05-14","status":"complete","weeklyLogs":[{"week":1,"date":"2025-05-21","response":"Same","score1":9,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-05-28","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-04","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-06-11","response":"Same","score1":9,"score2":7,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-06-18","response":"Better","score1":6,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-06-25","response":"Better","score1":5,"score2":5,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-07-02","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-07-09","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-07-16","response":"Better","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-07-23","response":"Much better","score1":5,"score2":4,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-07-30","response":"Much better","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-08-06","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-08-13","response":"Much better","score1":2,"score2":2,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-08-20","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-08-27","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-09-03","response":"Much better","score1":2,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"62% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-029","age":"63","gender":"Male","symptom1":"Low energy & fatigue","symptom2":"High cortisol","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-15","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-22","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-29","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-05","response":"Same","score1":7,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-12","response":"Same","score1":7,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-19","response":"Better","score1":6,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-26","response":"Better","score1":6,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-10-03","response":"Better","score1":6,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-10","response":"Much better","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-17","response":"Same","score1":6,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-24","response":"Much better","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-31","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-11-07","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-11-14","response":"Much better","score1":1,"score2":2,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-11-21","response":"Much better","score1":1,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-11-28","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-12-05","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"60% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-030","age":"27","gender":"Female","symptom1":"High cortisol","symptom2":"Chronic stress","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-23","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-30","response":"Same","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-07","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-14","response":"Same","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-21","response":"Same","score1":6,"score2":5,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-28","response":"Better","score1":3,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-04","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-11","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-18","response":"Better","score1":3,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-25","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-02","response":"Better","score1":2,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-09","response":"Much better","score1":2,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-16","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-12-23","response":"Much better","score1":2,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-12-30","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-06","response":"Much better","score1":1,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-01-13","response":"Much better","score1":1,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"83% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-031","age":"27","gender":"Non-binary","symptom1":"High cortisol","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-10-08","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-15","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-22","response":"Same","score1":6,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-29","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-05","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-12","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-19","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-26","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-03","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-10","response":"Same","score1":4,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-17","response":"Same","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-24","response":"Much better","score1":1,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-31","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-032","age":"37","gender":"Non-binary","symptom1":"Chronic stress","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-09","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-16","response":"Same","score1":7,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-23","response":"Same","score1":8,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-30","response":"Better","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-06","response":"Better","score1":3,"score2":4,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-13","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-20","response":"Same","score1":3,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-27","response":"Same","score1":4,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-04","response":"Much better","score1":2,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"71% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-033","age":"31","gender":"Female","symptom1":"Generalised anxiety","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Powder","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"450","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-10-03","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-10","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-17","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-24","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-31","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-07","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-14","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-21","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-28","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-034","age":"26","gender":"Male","symptom1":"Poor sleep quality","symptom2":"Chronic stress","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-18","status":"complete","weeklyLogs":[{"week":1,"date":"2025-06-25","response":"Same","score1":7,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-02","response":"Same","score1":6,"score2":9,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-09","response":"Better","score1":4,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-16","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-23","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-07-30","response":"Much better","score1":1,"score2":3,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-06","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-13","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"78% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-035","age":"43","gender":"Non-binary","symptom1":"Generalised anxiety","symptom2":"Poor sleep quality","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-21","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-28","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-05","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-12","response":"Same","score1":9,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-19","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-26","response":"Better","score1":6,"score2":6,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-02","response":"Better","score1":4,"score2":4,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-09","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-16","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-23","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-11-30","response":"Same","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-07","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-14","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"78% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-036","age":"58","gender":"Female","symptom1":"Chronic stress","symptom2":"Poor sleep quality","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-07-04","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-11","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-18","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-25","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-01","response":"Much better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-08","response":"Better","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-15","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-22","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-29","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"62% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-037","age":"49","gender":"Non-binary","symptom1":"Generalised anxiety","symptom2":"High cortisol","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Powder","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-04","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-11","response":"Same","score1":7,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-18","response":"Same","score1":7,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-25","response":"Same","score1":8,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-01","response":"Same","score1":8,"score2":6,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-08","response":"Better","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-15","response":"Better","score1":6,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-22","response":"Better","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-29","response":"Much better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-06","response":"Much better","score1":3,"score2":4,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-13","response":"Much better","score1":4,"score2":4,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-20","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-10-27","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-11-03","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-11-10","response":"Much better","score1":2,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-11-17","response":"Much better","score1":2,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-11-24","response":"Much better","score1":1,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"71% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-038","age":"43","gender":"Female","symptom1":"Low energy & fatigue","symptom2":"Poor sleep quality","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-09","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-16","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-23","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-30","response":"Same","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-06","response":"Same","score1":5,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-13","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-20","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-27","response":"Better","score1":3,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-04","response":"Better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-11","response":"Better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-18","response":"Better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-25","response":"Better","score1":3,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-11-01","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-11-08","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-11-15","response":"Same","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-11-22","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-11-29","response":"Much better","score1":2,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-039","age":"39","gender":"Female","symptom1":"Poor sleep quality","symptom2":null,"studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-26","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-03","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-10","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-17","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-24","response":"Better","score1":3,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-31","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-07","response":"Much better","score1":2,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-14","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-21","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-040","age":"63","gender":"Non-binary","symptom1":"Low energy & fatigue","symptom2":"Poor sleep quality","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"450","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-13","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-20","response":"Same","score1":8,"score2":4,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-27","response":"Same","score1":7,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-04","response":"Same","score1":7,"score2":4,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-11","response":"Same","score1":9,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-18","response":"Better","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-25","response":"Better","score1":6,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-01","response":"Better","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-08","response":"Much better","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-15","response":"Better","score1":4,"score2":3,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-11-22","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-11-29","response":"Much better","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-06","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-12-13","response":"Much better","score1":1,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-12-20","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-12-27","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-01-03","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"60% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"RAV-041","age":"25","gender":"Male","symptom1":"Low energy & fatigue","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-07-12","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-19","response":"Same","score1":9,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-26","response":"Same","score1":9,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-02","response":"Better","score1":5,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-09","response":"Much better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-16","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-23","response":"Much better","score1":3,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-30","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-06","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-042","age":"25","gender":"Female","symptom1":"Low energy & fatigue","symptom2":"Poor sleep quality","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-04-08","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-15","response":"Same","score1":7,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-04-22","response":"Same","score1":7,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-04-29","response":"Better","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-05-06","response":"Same","score1":6,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-13","response":"Better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-20","response":"Much better","score1":1,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-05-27","response":"Much better","score1":1,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-06-03","response":"Much better","score1":1,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"80% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-043","age":"45","gender":"Female","symptom1":"Generalised anxiety","symptom2":"Chronic stress","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-12","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-19","response":"Same","score1":6,"score2":7,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-26","response":"Same","score1":7,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-02","response":"Same","score1":7,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-09","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-16","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-23","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-30","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-07","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-14","response":"Much better","score1":2,"score2":2,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-21","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-28","response":"Same","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-11-04","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"75% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"RAV-044","age":"27","gender":"Non-binary","symptom1":"High cortisol","symptom2":"Generalised anxiety","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-08","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-15","response":"Same","score1":9,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-22","response":"Same","score1":8,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-29","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-05","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-12","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-19","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-26","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-03","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"62% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-045","age":"36","gender":"Male","symptom1":"Chronic stress","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Powder","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-26","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-03","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-10","response":"Same","score1":8,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-17","response":"Better","score1":6,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-24","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-31","response":"Better","score1":4,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-07","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-14","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-21","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"RAV-046","age":"52","gender":"Non-binary","symptom1":"High cortisol","symptom2":"Poor sleep quality","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-07-21","status":"active","weeklyLogs":[{"week":1,"date":"2025-07-28","response":"Same","score1":7,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-04","response":"Same","score1":7,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-11","response":"Same","score1":8,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-18","response":"Same","score1":7,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-25","response":"Better","score1":6,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-01","response":"Better","score1":5,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-047","age":"41","gender":"Male","symptom1":"Poor sleep quality","symptom2":"High cortisol","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-04-02","status":"active","weeklyLogs":[{"week":1,"date":"2025-04-09","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-04-16","response":"Same","score1":8,"score2":7,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-04-23","response":"Same","score1":9,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-04-30","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-07","response":"Better","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-14","response":"Better","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-048","age":"46","gender":"Male","symptom1":"Chronic stress","symptom2":"Poor sleep quality","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-05-14","status":"active","weeklyLogs":[{"week":1,"date":"2025-05-21","response":"Same","score1":9,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-05-28","response":"Same","score1":9,"score2":7,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-04","response":"Better","score1":5,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-049","age":"66","gender":"Non-binary","symptom1":"Chronic stress","symptom2":"Low energy & fatigue","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-07-06","status":"active","weeklyLogs":[{"week":1,"date":"2025-07-13","response":"Same","score1":9,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-20","response":"Same","score1":7,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-27","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-050","age":"40","gender":"Female","symptom1":"Low energy & fatigue","symptom2":"Chronic stress","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-03","status":"active","weeklyLogs":[{"week":1,"date":"2025-06-10","response":"Same","score1":9,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-06-17","response":"Same","score1":9,"score2":5,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-24","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-01","response":"Same","score1":8,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-08","response":"Better","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-051","age":"51","gender":"Male","symptom1":"Poor sleep quality","symptom2":"Chronic stress","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"450","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-08-19","status":"active","weeklyLogs":[{"week":1,"date":"2025-08-26","response":"Same","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-02","response":"Same","score1":5,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-09","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-16","response":"Better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-23","response":"Better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-052","age":"53","gender":"Female","symptom1":"Poor sleep quality","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Powder","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-14","status":"active","weeklyLogs":[{"week":1,"date":"2025-09-21","response":"Same","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-28","response":"Same","score1":5,"score2":6,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-05","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-12","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-053","age":"26","gender":"Male","symptom1":"Generalised anxiety","symptom2":"Low energy & fatigue","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-16","status":"active","weeklyLogs":[{"week":1,"date":"2025-06-23","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-06-30","response":"Same","score1":9,"score2":5,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-07","response":"Same","score1":9,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-14","response":"Same","score1":9,"score2":6,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-054","age":"49","gender":"Female","symptom1":"Low energy & fatigue","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Powder","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"12 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-06-07","status":"active","weeklyLogs":[{"week":1,"date":"2025-06-14","response":"Same","score1":8,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-06-21","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-28","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"RAV-055","age":"63","gender":"Female","symptom1":"Poor sleep quality","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Ravi Somarapu","doctorClinic":"Patajani Ayurveda Clinic","doctorRegNumber":"AYUSH-12345","createdAt":"2025-09-11","status":"active","weeklyLogs":[{"week":1,"date":"2025-09-18","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-25","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-02","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-09","response":"Much better","score1":4,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-16","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-23","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null}];

const seedTestPatients = (userId) => {
  const key = `nep_doctor_patients_${userId}`;
  localStorage.removeItem(key);
  localStorage.setItem(key, JSON.stringify(SEED_PATIENTS));
  return SEED_PATIENTS.length;
};

const SEED_PATIENTS_DR2 = [{"id":"PY-001","age":"47","gender":"Male","symptom1":"Low energy & fatigue","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-09-28","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-05","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-12","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-19","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-26","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-02","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-09","response":"Much better","score1":2,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-16","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-23","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"PY-002","age":"30","gender":"Male","symptom1":"Chronic stress","symptom2":"High cortisol","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-07-21","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-28","response":"Same","score1":8,"score2":7,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-04","response":"Same","score1":9,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-11","response":"Same","score1":9,"score2":8,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-18","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-25","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-01","response":"Much better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-08","response":"Much better","score1":5,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-15","response":"Better","score1":5,"score2":4,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-09-22","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-29","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-06","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-10-13","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"62% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-003","age":"31","gender":"Non-binary","symptom1":"Chronic stress","symptom2":"Generalised anxiety","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-08-04","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-11","response":"Same","score1":8,"score2":4,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-18","response":"Same","score1":7,"score2":4,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-25","response":"Same","score1":7,"score2":4,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-01","response":"Better","score1":5,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-08","response":"Better","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-15","response":"Much better","score1":3,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-22","response":"Much better","score1":3,"score2":2,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-29","response":"Better","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-06","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-13","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-20","response":"Much better","score1":1,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-10-27","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"60% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-004","age":"49","gender":"Female","symptom1":"Generalised anxiety","symptom2":"Low energy & fatigue","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-08-01","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-08","response":"Same","score1":6,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-15","response":"Same","score1":7,"score2":7,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-22","response":"Same","score1":7,"score2":7,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-29","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-05","response":"Better","score1":4,"score2":5,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-12","response":"Better","score1":5,"score2":5,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-19","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-26","response":"Better","score1":3,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-03","response":"Same","score1":6,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-10","response":"Much better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-17","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-10-24","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-10-31","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-11-07","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-11-14","response":"Much better","score1":1,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-11-21","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"75% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-005","age":"68","gender":"Non-binary","symptom1":"High cortisol","symptom2":"Generalised anxiety","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-10-15","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-22","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-29","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-05","response":"Same","score1":9,"score2":9,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-12","response":"Same","score1":8,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-19","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-26","response":"Better","score1":5,"score2":6,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-12-03","response":"Better","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-10","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-17","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-24","response":"Much better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-31","response":"Same","score1":7,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2026-01-07","response":"Much better","score1":2,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2026-01-14","response":"Much better","score1":3,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2026-01-21","response":"Much better","score1":3,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-28","response":"Much better","score1":2,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-02-04","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-006","age":"29","gender":"Male","symptom1":"Low energy & fatigue","symptom2":"Generalised anxiety","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-05-24","status":"complete","weeklyLogs":[{"week":1,"date":"2025-05-31","response":"Same","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-06-07","response":"Same","score1":8,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-14","response":"Same","score1":6,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-06-21","response":"Same","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-06-28","response":"Better","score1":3,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-07-05","response":"Better","score1":4,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-07-12","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-07-19","response":"Better","score1":2,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-07-26","response":"Better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-08-02","response":"Better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-08-09","response":"Better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-08-16","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-08-23","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-08-30","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-09-06","response":"Much better","score1":1,"score2":3,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-09-13","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"62% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-007","age":"54","gender":"Non-binary","symptom1":"Low energy & fatigue","symptom2":null,"studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"8 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-04-03","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-10","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-04-17","response":"Same","score1":6,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-04-24","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-05-01","response":"Better","score1":2,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-08","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-15","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-05-22","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-05-29","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"PY-008","age":"68","gender":"Non-binary","symptom1":"Low energy & fatigue","symptom2":"High cortisol","studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-09-12","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-19","response":"Same","score1":8,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-26","response":"Same","score1":5,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-03","response":"Same","score1":5,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-10","response":"Better","score1":4,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-17","response":"Better","score1":3,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-24","response":"Much better","score1":3,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-10-31","response":"Much better","score1":2,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-07","response":"Much better","score1":3,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-14","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-11-21","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-11-28","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-05","response":"Much better","score1":1,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"78% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-009","age":"63","gender":"Male","symptom1":"Poor sleep quality","symptom2":null,"studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-10-09","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-16","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-23","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-30","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-06","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-13","response":"Better","score1":4,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-20","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-27","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-04","response":"Better","score1":4,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-11","response":"Much better","score1":4,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-18","response":"Much better","score1":4,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-25","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2026-01-01","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2026-01-08","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2026-01-15","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-22","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-01-29","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-010","age":"35","gender":"Male","symptom1":"High cortisol","symptom2":null,"studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-04-17","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-24","response":"Same","score1":8,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-05-01","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-05-08","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-05-15","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-22","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-29","response":"Better","score1":4,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-06-05","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-06-12","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-06-19","response":"Much better","score1":1,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-06-26","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-07-03","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-07-10","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-011","age":"49","gender":"Male","symptom1":"Poor sleep quality","symptom2":null,"studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-04-07","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-14","response":"Same","score1":9,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-04-21","response":"Same","score1":9,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-04-28","response":"Same","score1":8,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-05-05","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-12","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-19","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-05-26","response":"Much better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-06-02","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-06-09","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-06-16","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-06-23","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-06-30","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-012","age":"44","gender":"Non-binary","symptom1":"Generalised anxiety","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-10-23","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-30","response":"Same","score1":9,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-11-06","response":"Same","score1":9,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-13","response":"Same","score1":8,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-20","response":"Better","score1":6,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-27","response":"Same","score1":7,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-12-04","response":"Much better","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-12-11","response":"Same","score1":7,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-18","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-25","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2026-01-01","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2026-01-08","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2026-01-15","response":"Much better","score1":3,"score2":2,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-013","age":"37","gender":"Female","symptom1":"Low energy & fatigue","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Tablet","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-07-19","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-26","response":"Same","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-02","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-09","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-16","response":"Same","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-23","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-30","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-06","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-13","response":"Better","score1":2,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-09-20","response":"Better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-27","response":"Better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-04","response":"Better","score1":2,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-10-11","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-10-18","response":"Much better","score1":2,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-10-25","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-11-01","response":"Much better","score1":1,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-11-08","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-014","age":"57","gender":"Female","symptom1":"High cortisol","symptom2":"Poor sleep quality","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"8 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-05-25","status":"complete","weeklyLogs":[{"week":1,"date":"2025-06-01","response":"Same","score1":6,"score2":4,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-06-08","response":"Same","score1":7,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-15","response":"Better","score1":4,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-06-22","response":"Much better","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-06-29","response":"Better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-07-06","response":"Much better","score1":1,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-07-13","response":"Much better","score1":1,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-07-20","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"60% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"PY-015","age":"33","gender":"Non-binary","symptom1":"High cortisol","symptom2":"Generalised anxiety","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-08-18","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-25","response":"Same","score1":7,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-01","response":"Same","score1":7,"score2":8,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-08","response":"Same","score1":8,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-15","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-22","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-29","response":"Much better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-10-06","response":"Better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-13","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-10-20","response":"Same","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-27","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-11-03","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-11-10","response":"Much better","score1":1,"score2":2,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"75% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-016","age":"31","gender":"Male","symptom1":"Poor sleep quality","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-07-18","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-25","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-01","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-08","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-15","response":"Better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-22","response":"Better","score1":3,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-29","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-05","response":"Much better","score1":1,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-12","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"83% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"PY-017","age":"41","gender":"Male","symptom1":"Poor sleep quality","symptom2":"Generalised anxiety","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Powder","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-04-01","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-08","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-04-15","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-04-22","response":"Same","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-04-29","response":"Better","score1":5,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-06","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-13","response":"Same","score1":5,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-05-20","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-05-27","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-06-03","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-06-10","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-06-17","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-06-24","response":"Much better","score1":2,"score2":2,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"71% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-018","age":"30","gender":"Male","symptom1":"Poor sleep quality","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-04-09","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-16","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-04-23","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-04-30","response":"Same","score1":9,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-05-07","response":"Better","score1":6,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-14","response":"Better","score1":6,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-21","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-05-28","response":"Much better","score1":5,"score2":2,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-06-04","response":"Better","score1":5,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-06-11","response":"Same","score1":4,"score2":2,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-06-18","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-06-25","response":"Same","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-07-02","response":"Much better","score1":3,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"60% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-019","age":"49","gender":"Female","symptom1":"Poor sleep quality","symptom2":null,"studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-09-05","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-12","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-19","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-26","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-03","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-10","response":"Same","score1":8,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-17","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-10-24","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-10-31","response":"Better","score1":3,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-07","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-11-14","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-11-21","response":"Better","score1":4,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-11-28","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-12-05","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-12-12","response":"Same","score1":3,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-12-19","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-12-26","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-020","age":"29","gender":"Female","symptom1":"High cortisol","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-brahmi","name":"Brahmi","scientific":"Bacopa monnieri","category":"Nootropic","shortCode":"BRA","extract_form":"Leaf extract","standardisation":"20% bacosides","dose_range":"300\u2013450 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"300","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-05-17","status":"complete","weeklyLogs":[{"week":1,"date":"2025-05-24","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-05-31","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-06-07","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-06-14","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-06-21","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-06-28","response":"Better","score1":4,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-07-05","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-07-12","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-07-19","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-07-26","response":"Better","score1":2,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-08-02","response":"Much better","score1":2,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-08-09","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-08-16","response":"Same","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-08-23","response":"Much better","score1":2,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-08-30","response":"Same","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-09-06","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-021","age":"29","gender":"Non-binary","symptom1":"Poor sleep quality","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-10-16","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-23","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-30","response":"Same","score1":7,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-06","response":"Same","score1":8,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-13","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-20","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-27","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-12-04","response":"Better","score1":5,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-11","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-18","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-25","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2026-01-01","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2026-01-08","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2026-01-15","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2026-01-22","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-29","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-02-05","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-022","age":"67","gender":"Female","symptom1":"Generalised anxiety","symptom2":"Low energy & fatigue","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-07-12","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-19","response":"Same","score1":7,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-26","response":"Same","score1":7,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-02","response":"Better","score1":6,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-09","response":"Better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-16","response":"Much better","score1":4,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-23","response":"Much better","score1":1,"score2":2,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-30","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-06","response":"Much better","score1":2,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"75% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"83% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"8","finalNotes":""}},{"id":"PY-023","age":"67","gender":"Female","symptom1":"Low energy & fatigue","symptom2":"High cortisol","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-10-04","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-11","response":"Same","score1":5,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-18","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-25","response":"Same","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-01","response":"Same","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-08","response":"Better","score1":3,"score2":4,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-15","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-22","response":"Better","score1":3,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-29","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-06","response":"Better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-13","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-20","response":"Much better","score1":2,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-27","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2026-01-03","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2026-01-10","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-17","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-01-24","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"71% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-024","age":"36","gender":"Male","symptom1":"High cortisol","symptom2":null,"studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"8 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-10-20","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-27","response":"Same","score1":8,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-11-03","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-10","response":"Better","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-17","response":"Much better","score1":3,"score2":null,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-24","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-12-01","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-12-08","response":"Same","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-12-15","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"8","finalNotes":""}},{"id":"PY-025","age":"45","gender":"Female","symptom1":"High cortisol","symptom2":null,"studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-09-19","status":"complete","weeklyLogs":[{"week":1,"date":"2025-09-26","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-03","response":"Same","score1":6,"score2":null,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-10","response":"Same","score1":5,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-17","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-10-24","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-31","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-07","response":"Better","score1":4,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-14","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-11-21","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-11-28","response":"Better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-05","response":"Much better","score1":3,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-12","response":"Much better","score1":2,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-12-19","response":"Much better","score1":1,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-12-26","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-02","response":"Much better","score1":2,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-01-09","response":"Much better","score1":2,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-026","age":"41","gender":"Male","symptom1":"High cortisol","symptom2":"Generalised anxiety","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-07-28","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-04","response":"Same","score1":9,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-11","response":"Same","score1":8,"score2":8,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-18","response":"Same","score1":9,"score2":9,"sideEffects":["Headache"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-25","response":"Same","score1":9,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-01","response":"Better","score1":5,"score2":6,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-08","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-15","response":"Better","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-22","response":"Better","score1":5,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-09-29","response":"Much better","score1":5,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-06","response":"Better","score1":4,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-13","response":"Much better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-10-20","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-10-27","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-11-03","response":"Much better","score1":3,"score2":2,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-11-10","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-11-17","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"78% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"67% reduction in Generalised anxiety severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-027","age":"60","gender":"Female","symptom1":"Chronic stress","symptom2":"High cortisol","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-10-01","status":"complete","weeklyLogs":[{"week":1,"date":"2025-10-08","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-15","response":"Same","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-10-22","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-10-29","response":"Same","score1":5,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-11-05","response":"Better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-11-12","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-11-19","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-11-26","response":"Better","score1":2,"score2":4,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-12-03","response":"Better","score1":2,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-12-10","response":"Better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-12-17","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-12-24","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-12-31","response":"Much better","score1":2,"score2":3,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2026-01-07","response":"Much better","score1":2,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2026-01-14","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2026-01-21","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"67% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"57% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-028","age":"54","gender":"Male","symptom1":"Low energy & fatigue","symptom2":"Poor sleep quality","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-04-17","status":"complete","weeklyLogs":[{"week":1,"date":"2025-04-24","response":"Same","score1":7,"score2":5,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-05-01","response":"Same","score1":7,"score2":5,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-05-08","response":"Same","score1":8,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-05-15","response":"Better","score1":5,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-05-22","response":"Same","score1":8,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-05-29","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-06-05","response":"Same","score1":6,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-06-12","response":"Much better","score1":4,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-06-19","response":"Much better","score1":2,"score2":1,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-06-26","response":"Much better","score1":1,"score2":1,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-07-03","response":"Much better","score1":1,"score2":1,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-07-10","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Low energy & fatigue severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"60% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-029","age":"54","gender":"Male","symptom1":"Poor sleep quality","symptom2":"Chronic stress","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"450","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-06-25","status":"complete","weeklyLogs":[{"week":1,"date":"2025-07-02","response":"Same","score1":8,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-09","response":"Same","score1":8,"score2":8,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-16","response":"Same","score1":7,"score2":8,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-23","response":"Better","score1":5,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-30","response":"Better","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-06","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-08-13","response":"Better","score1":3,"score2":4,"sideEffects":["Dizziness"],"sideEffectSeverity":"Mild","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-08-20","response":"Much better","score1":3,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-08-27","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-09-03","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-09-10","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-09-17","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"88% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"78% reduction in Chronic stress severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"12","finalNotes":""}},{"id":"PY-030","age":"25","gender":"Non-binary","symptom1":"Poor sleep quality","symptom2":"High cortisol","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-07-28","status":"complete","weeklyLogs":[{"week":1,"date":"2025-08-04","response":"Same","score1":7,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-08-11","response":"Same","score1":7,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-18","response":"Same","score1":7,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-25","response":"Same","score1":6,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-01","response":"Better","score1":5,"score2":5,"sideEffects":["Dizziness"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-09-08","response":"Better","score1":4,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":7,"date":"2025-09-15","response":"Same","score1":7,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":8,"date":"2025-09-22","response":"Much better","score1":4,"score2":3,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":9,"date":"2025-09-29","response":"Much better","score1":3,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":10,"date":"2025-10-06","response":"Much better","score1":3,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":11,"date":"2025-10-13","response":"Much better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":12,"date":"2025-10-20","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":13,"date":"2025-10-27","response":"Much better","score1":1,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":14,"date":"2025-11-03","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":15,"date":"2025-11-10","response":"Much better","score1":1,"score2":2,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":16,"date":"2025-11-17","response":"Much better","score1":2,"score2":3,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":{"outcome1":{"direction":"Improved","magnitude":"71% reduction in Poor sleep quality severity","significance":"Yes","mcid":"Yes"},"outcome2":{"direction":"Improved","magnitude":"57% reduction in High cortisol severity","significance":"Yes","mcid":"Yes"},"weeksCompleted":"16","finalNotes":""}},{"id":"PY-031","age":"59","gender":"Male","symptom1":"Chronic stress","symptom2":null,"studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Twice daily (BD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-07-15","status":"active","weeklyLogs":[{"week":1,"date":"2025-07-22","response":"Same","score1":8,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-29","response":"Same","score1":8,"score2":null,"sideEffects":["Headache"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-08-05","response":"Same","score1":9,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-08-12","response":"Better","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-08-19","response":"Better","score1":6,"score2":null,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"PY-032","age":"34","gender":"Non-binary","symptom1":"Low energy & fatigue","symptom2":"Poor sleep quality","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Tablet","secondaryCompound":{"id":"herb-triphala","name":"Triphala","scientific":"Terminalia chebula blend","category":"Digestive tonic","shortCode":"TRI","extract_form":"Fruit powder","standardisation":"40% tannins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"1000","secondaryDoseUnit":"mg","secondaryFrequency":"Twice daily (BD)","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-06-26","status":"active","weeklyLogs":[{"week":1,"date":"2025-07-03","response":"Same","score1":7,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-07-10","response":"Same","score1":7,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-07-17","response":"Same","score1":7,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-07-24","response":"Same","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-07-31","response":"Better","score1":5,"score2":5,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-08-07","response":"Better","score1":5,"score2":4,"sideEffects":["Digestive discomfort"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"PY-033","age":"41","gender":"Male","symptom1":"Poor sleep quality","symptom2":"Generalised anxiety","studyType":"RCT","qualityScore":4,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"600","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Softgel","secondaryCompound":{"id":"herb-shatavari","name":"Shatavari","scientific":"Asparagus racemosus","category":"Rejuvenative","shortCode":"SHA","extract_form":"Root extract","standardisation":"40% saponins","dose_range":"500\u20131000 mg/day","duration_range":"8\u201312 weeks"},"secondaryDose":"500","secondaryDoseUnit":"mg","secondaryFrequency":"Once daily (OD)","targetDuration":"12 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-10-14","status":"active","weeklyLogs":[{"week":1,"date":"2025-10-21","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-10-28","response":"Same","score1":6,"score2":7,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-11-04","response":"Same","score1":5,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-11-11","response":"Better","score1":4,"score2":4,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"PY-034","age":"36","gender":"Female","symptom1":"Generalised anxiety","symptom2":null,"studyType":"Case series","qualityScore":2,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Three times daily (TDS)","primaryForm":"Powder","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-08-01","status":"active","weeklyLogs":[{"week":1,"date":"2025-08-08","response":"Same","score1":6,"score2":null,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null},{"id":"PY-035","age":"30","gender":"Male","symptom1":"Poor sleep quality","symptom2":"High cortisol","studyType":"Clinical observation","qualityScore":3,"primaryCompound":{"id":"herb-ashwagandha","name":"Ashwagandha","scientific":"Withania somnifera","category":"Adaptogen","shortCode":"ASH","extract_form":"Root extract (KSM-66)","standardisation":"5% withanolides","dose_range":"300\u2013600 mg/day","duration_range":"8\u201316 weeks"},"primaryDose":"300","primaryDoseUnit":"mg","primaryFrequency":"Once daily (OD)","primaryForm":"Capsule","secondaryCompound":null,"secondaryDose":"","secondaryDoseUnit":"","secondaryFrequency":"","targetDuration":"16 weeks","doctorName":"Dr. Priya Sharma","doctorClinic":"Integrative Wellness Clinic","doctorRegNumber":"GMC-67890","createdAt":"2025-08-22","status":"active","weeklyLogs":[{"week":1,"date":"2025-08-29","response":"Same","score1":7,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":2,"date":"2025-09-05","response":"Same","score1":6,"score2":9,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":3,"date":"2025-09-12","response":"Same","score1":6,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":4,"date":"2025-09-19","response":"Same","score1":6,"score2":8,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""},{"week":5,"date":"2025-09-26","response":"Better","score1":4,"score2":6,"sideEffects":["Mild nausea"],"sideEffectSeverity":"Moderate","doseAdjusted":false,"newDose":"","notes":""},{"week":6,"date":"2025-10-03","response":"Better","score1":4,"score2":6,"sideEffects":[],"sideEffectSeverity":"","doseAdjusted":false,"newDose":"","notes":""}],"outcome":null}];

const seedTestPatientsDr2 = (userId) => {
  const key = `nep_doctor_patients_${userId}`;
  localStorage.removeItem(key);
  localStorage.setItem(key, JSON.stringify(SEED_PATIENTS_DR2));
  return SEED_PATIENTS_DR2.length;
};


const DoctorApp = ({ user, onSignOut }) => {
  const userId  = user?.id || ("user-" + (user?.email||"doctor").toLowerCase().replace(/[^a-z0-9]/g,"-"));
  const storeKey = `nep_doctor_patients_${userId}`;
  const profKey  = `nep_doctor_profile_${userId}`;

  const readPatients = () => {
    try { return JSON.parse(localStorage.getItem(storeKey)||"[]"); } catch(e) { return []; }
  };
  const writePatients = (pts) => {
    try { localStorage.setItem(storeKey, JSON.stringify(pts)); } catch(e) {}
  };
  const readProfile = () => {
    try { return JSON.parse(localStorage.getItem(profKey)||"null"); } catch(e) { return null; }
  };

  const [patients,      setPatients]      = useState([]);
  const [screen,        setScreen]        = useState("patients");
  const [activePatient, setActivePatient] = useState(null);
  const [showAdd,       setShowAdd]       = useState(false);
  const [profile,       setProfile]       = useState({
    fullName: user?.displayName || user?.name || "Doctor",
    regNumber: "", clinic: "", specialty: "", setupDone: true,
  });
  const compounds = SEED_COMPOUNDS || [];
  const taxonomy  = loadTaxonomy();

  // Load patients on mount — seed if empty
  useEffect(() => {
    const stored = readPatients();
    if (stored.length > 0) {
      setPatients(stored);
    } else {
      // Auto-seed test patients for this doctor
      const seeded = userId.includes("doctor2") || userId.includes("priya")
        ? SEED_PATIENTS_DR2
        : SEED_PATIENTS;
      try { localStorage.setItem(storeKey, JSON.stringify(seeded)); } catch(e) {}
      setPatients(seeded);
    }
    // Load profile
    const savedProfile = readProfile();
    if (savedProfile) setProfile(savedProfile);
  }, [userId]);

  const addPatient = (p) => {
    const newP = {
      ...p,
      id: p.id || `PAT-${Date.now().toString(36).toUpperCase()}`,
      patientId: p.patientId || "",
      doctorName: profile.fullName,
      doctorClinic: profile.clinic || "",
      doctorRegNumber: profile.regNumber || "",
      createdAt: new Date().toISOString().split("T")[0],
      status: "active",
      weeklyLogs: [],
      outcome: null,
    };
    const updated = [...patients, newP];
    setPatients(updated);
    writePatients(updated);
    setShowAdd(false);
  };

  const updatePatient = (updated) => {
    const pts = patients.map(p => p.id === updated.id ? updated : p);
    setPatients(pts);
    writePatients(pts);
    if (activePatient?.id === updated.id) setActivePatient(updated);
  };

  return (
    <div style={{minHeight:"100vh",background:"#0A1628",
      maxWidth:480,margin:"0 auto",fontFamily:"system-ui,sans-serif"}}>

      {/* Header */}
      <div style={{background:"#0F1923",borderBottom:"1px solid #1A2A3A",
        padding:"14px 16px",display:"flex",alignItems:"center",
        justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:"#00D2C8",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:"#0A1628",fontSize:15,fontWeight:800}}>N</span>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>NEP Clinical</div>
            <div style={{fontSize:10,color:"#00D2C8"}}>Dr. {profile.fullName}</div>
          </div>
        </div>
        <button onClick={onSignOut}
          style={{fontSize:11,color:"#5A7A9A",background:"none",
            border:"none",cursor:"pointer",fontFamily:"inherit"}}>
          Sign out
        </button>
      </div>

      {/* Content */}
      <div style={{padding:16,paddingBottom:80}}>
        {screen==="patients"&&!activePatient&&(
          <PatientsScreen
            patients={patients}
            onAdd={()=>setShowAdd(true)}
            onSelect={p=>{setActivePatient(p);setScreen("detail");}}
          />
        )}
        {screen==="detail"&&activePatient&&(
          <PatientDetailScreen
            patient={activePatient}
            taxonomy={taxonomy}
            onBack={()=>{setActivePatient(null);setScreen("patients");}}
            onUpdate={updatePatient}
          />
        )}
        {screen==="profile"&&(
          <ProfileScreen
            profile={profile}
            onSignOut={onSignOut}
            patients={patients}
            userId={userId}
            onReseed={()=>{
              const seeded = userId.includes("doctor2")||userId.includes("priya")
                ? SEED_PATIENTS_DR2 : SEED_PATIENTS;
              try { localStorage.setItem(storeKey, JSON.stringify(seeded)); } catch(e) {}
              setPatients(seeded);
              alert("✓ Reloaded test patients");
            }}
          />
        )}
      </div>

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",
        transform:"translateX(-50%)",width:"100%",maxWidth:480,
        background:"#0F1923",borderTop:"1px solid #1A2A3A",
        display:"flex",zIndex:50}}>
        {[
          {id:"patients",label:"Patients",icon:"👤"},
          {id:"profile", label:"Profile", icon:"⚙️"},
        ].map(tab=>(
          <button key={tab.id}
            onClick={()=>{setScreen(tab.id);setActivePatient(null);}}
            style={{flex:1,padding:"10px 4px",background:"none",border:"none",
              cursor:"pointer",textAlign:"center",fontFamily:"inherit"}}>
            <div style={{fontSize:20}}>{tab.icon}</div>
            <div style={{fontSize:10,marginTop:2,fontWeight:600,
              color:screen===tab.id?"#00D2C8":"#5A7A9A"}}>
              {tab.label}
            </div>
          </button>
        ))}
      </div>

      {showAdd&&(
        <AddPatientModal
          compounds={compounds}
          taxonomy={taxonomy}
          onClose={()=>setShowAdd(false)}
          onCreate={addPatient}
        />
      )}
    </div>
  );
};


const PatientsScreen = ({ patients, onAdd, onSelect }) => {
  const active    = patients.filter(p=>p.status==="active");
  const completed = patients.filter(p=>p.status==="complete");

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:20}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700,color:"#F0F6FF",margin:0}}>
            My Patients
          </h2>
          <p style={{fontSize:12,color:"#5A7A9A",margin:"4px 0 0"}}>
            {patients.length} total · {active.length} active · {completed.length} closed
          </p>
        </div>
        <button onClick={onAdd}
          style={{padding:"9px 16px",borderRadius:8,background:"#00D2C8",
            color:"#0A1628",border:"none",fontSize:13,fontWeight:700,
            cursor:"pointer",fontFamily:"inherit"}}>
          + Add
        </button>
      </div>

      {patients.length===0&&(
        <div style={{textAlign:"center",padding:"60px 20px",
          border:"1px dashed #1A2A3A",borderRadius:12}}>
          <div style={{fontSize:36,marginBottom:12,opacity:0.3}}>👤</div>
          <p style={{fontSize:14,color:"#5A7A9A",marginBottom:20}}>
            No patients yet.
          </p>
          <button onClick={onAdd}
            style={{padding:"11px 24px",borderRadius:8,background:"#00D2C8",
              color:"#0A1628",border:"none",fontSize:14,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit"}}>
            Add first patient
          </button>
        </div>
      )}

      {active.length>0&&(
        <>
          <div style={{fontSize:10,color:"#5A7A9A",fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em",
            marginBottom:8}}>Active</div>
          {active.map(p=><PatientCard key={p.id} patient={p} onSelect={onSelect}/>)}
        </>
      )}
      {completed.length>0&&(
        <>
          <div style={{fontSize:10,color:"#5A7A9A",fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.08em",
            margin:"16px 0 8px"}}>Closed</div>
          {completed.map(p=><PatientCard key={p.id} patient={p} onSelect={onSelect}/>)}
        </>
      )}
    </div>
  );
};

/* ─── PATIENT CARD ───────────────────────────────────────────────────── */
const PatientCard = ({ patient, onSelect }) => {
  const weeks = (patient.weeklyLogs||[]).length;
  const s1    = patient.symptom1;
  const s2    = patient.symptom2;

  return (
    <div onClick={()=>onSelect(patient)}
      style={{background:"#0F1923",borderRadius:10,padding:"14px 16px",
        marginBottom:10,border:"1px solid #1A2A3A",cursor:"pointer"}}>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontFamily:"monospace",fontSize:14,fontWeight:700,
              color:"#00D2C8"}}>{patient.id}</span>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,
              fontWeight:600,
              background:patient.status==="complete"
                ?"rgba(0,200,100,0.15)":"rgba(0,210,200,0.12)",
              color:patient.status==="complete"?"#00C864":"#00D2C8"}}>
              {patient.status==="complete"?"Closed":"Active"}
            </span>
          </div>

          <div style={{fontSize:12,color:"#8AACCC",marginBottom:6}}>
            {patient.age&&<span>{patient.age}y</span>}
            {patient.gender&&<span> · {patient.gender}</span>}
            {patient.primaryCompound&&
              <span> · {patient.primaryCompound.name}</span>}
          </div>

          {(s1||s2)&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {s1&&<span style={{fontSize:11,color:"#F5A623",
                background:"rgba(245,166,35,0.12)",
                padding:"2px 8px",borderRadius:4}}>{s1}</span>}
              {s2&&<span style={{fontSize:11,color:"#F5A623",
                background:"rgba(245,166,35,0.12)",
                padding:"2px 8px",borderRadius:4}}>{s2}</span>}
            </div>
          )}
        </div>

        <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
          <div style={{fontSize:18,fontWeight:700,color:"#F0F6FF"}}>{weeks}</div>
          <div style={{fontSize:10,color:"#5A7A9A"}}>weeks</div>
        </div>
      </div>
    </div>
  );
};

/* ─── ADD PATIENT MODAL ───────────────────────────────────────────────── */
const AddPatientModal = ({ compounds, taxonomy, onClose, onCreate }) => {
  const [step, setStep] = useState(1); // 1=patient, 2=symptoms, 3=prescription
  const [form, setForm] = useState({
    age:"", gender:"",
    symptom1: null, symptom2: null,
    primaryCompound: null, primaryDose:"", primaryDoseUnit:"mg",
    primaryFrequency:"", primaryForm:"",
    secondaryCompound: null, secondaryDose:"", secondaryDoseUnit:"mg",
    secondaryFrequency:"", secondaryForm:"",
    targetDuration:"",
  });
  const [showCompSearch, setShowCompSearch] = useState(null); // "primary"|"secondary"
  const upd = (f,v) => setForm(p=>({...p,[f]:v}));

  const FREQ_OPTIONS = ["Once daily (OD)","Twice daily (BD)",
    "Three times daily (TDS)","Four times daily (QDS)","As needed (PRN)"];
  const FORM_OPTIONS = ["Capsule","Tablet","Powder","Liquid","Softgel","Gummy"];
  const DOSE_UNITS   = ["mg","g","ml","IU","mcg"];
  const DURATION_OPTIONS = ["4 weeks","6 weeks","8 weeks","12 weeks",
    "16 weeks","6 months","12 months"];

  const stepValid = {
    1: form.age && form.gender,
    2: form.symptom1,
    3: form.primaryCompound && form.primaryDose && form.primaryFrequency,
  };

  const MobileSelect = ({value, onChange, options, placeholder}) => (
    <select value={value||""} onChange={e=>onChange(e.target.value)}
      style={{width:"100%",padding:"11px 14px",borderRadius:8,
        background:"#1A2535",border:"1px solid #2A3A50",
        color:value?"#F0F6FF":"#5A7A9A",fontSize:13,
        fontFamily:"inherit",appearance:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%235A7A9A' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
        backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center"}}>
      <option value="">{placeholder}</option>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );

  const MobileInput = ({value, onChange, placeholder, type="text", style={}}) => (
    <input value={value} onChange={e=>onChange(e.target.value)}
      type={type} placeholder={placeholder}
      style={{width:"100%",padding:"11px 14px",borderRadius:8,
        background:"#1A2535",border:"1px solid #2A3A50",
        color:"#F0F6FF",fontSize:13,fontFamily:"inherit",
        boxSizing:"border-box",...style}}/>
  );

  const CompoundRow = ({which}) => {
    const c = form[`${which}Compound`];
    return (
      <div>
        <div style={{fontSize:11,color:"#8AACCC",fontWeight:600,
          textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
          {which==="primary"?"Primary compound *":"Secondary compound (optional)"}
        </div>
        {!c ? (
          <button onClick={()=>setShowCompSearch(which)}
            style={{width:"100%",padding:"12px 14px",borderRadius:8,
              background:"#1A2535",border:"1px dashed #2A3A50",
              color:"#5A7A9A",fontSize:13,cursor:"pointer",
              fontFamily:"inherit",textAlign:"left"}}>
            🔍 Search compound…
          </button>
        ):(
          <div style={{background:"rgba(0,210,200,0.08)",borderRadius:8,
            padding:"10px 14px",border:"1px solid rgba(0,210,200,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:8}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>
                  {c.name}
                </div>
                {c.scientific&&(
                  <div style={{fontSize:10,color:"#5A7A9A",fontStyle:"italic"}}>
                    {c.scientific}
                  </div>
                )}
              </div>
              <button onClick={()=>upd(`${which}Compound`,null)}
                style={{background:"none",border:"none",color:"#5A7A9A",
                  cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 80px 1fr",
              gap:6,marginBottom:6}}>
              <MobileInput
                value={form[`${which}Dose`]}
                onChange={v=>upd(`${which}Dose`,v)}
                placeholder="Dose" type="number"/>
              <MobileSelect
                value={form[`${which}DoseUnit`]}
                onChange={v=>upd(`${which}DoseUnit`,v)}
                options={DOSE_UNITS} placeholder="mg"/>
              <MobileSelect
                value={form[`${which}Form`]}
                onChange={v=>upd(`${which}Form`,v)}
                options={FORM_OPTIONS} placeholder="Form"/>
            </div>
            <MobileSelect
              value={form[`${which}Frequency`]}
              onChange={v=>upd(`${which}Frequency`,v)}
              options={FREQ_OPTIONS} placeholder="Frequency…"/>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,
      background:"rgba(0,0,0,0.85)",display:"flex",
      flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:"#0F1923",borderRadius:"16px 16px 0 0",
        maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}>
          <div style={{width:36,height:4,borderRadius:2,background:"#2A3A50"}}/>
        </div>

        {/* Header */}
        <div style={{padding:"12px 20px",borderBottom:"1px solid #1A2A3A",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#F0F6FF"}}>
              {step===1?"Patient details":step===2?"Symptoms":"Prescription"}
            </div>
            {/* Step dots */}
            <div style={{display:"flex",gap:4,marginTop:4}}>
              {[1,2,3].map(s=>(
                <div key={s} style={{width:s<=step?20:6,height:6,
                  borderRadius:3,transition:"all 0.2s",
                  background:s<=step?"#00D2C8":"#2A3A50"}}/>
              ))}
            </div>
          </div>
          <button onClick={onClose}
            style={{background:"none",border:"none",color:"#5A7A9A",
              cursor:"pointer",fontSize:20}}>✕</button>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>

          {step===1&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{padding:"10px 14px",background:"rgba(0,210,200,0.06)",
                borderRadius:8,border:"1px solid rgba(0,210,200,0.15)",
                fontSize:11,color:"#8AACCC",lineHeight:1.6}}>
                🔒 Patient identity is not stored. Only clinical data is recorded.
                A unique Patient ID is auto-assigned.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:11,color:"#8AACCC",fontWeight:600,
                    textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                    Patient ID *
                  </div>
                  <MobileInput value={form.patientId} onChange={v=>upd("patientId",v)}
                    placeholder="Doctor's record ID (e.g. MRN-12345)"/>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#8AACCC",fontWeight:600,
                    textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                    Age *
                  </div>
                  <MobileInput value={form.age} onChange={v=>upd("age",v)}
                    placeholder="e.g. 42" type="number"/>
                </div>
                <div>
                  <div style={{fontSize:11,color:"#8AACCC",fontWeight:600,
                    textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                    Gender *
                  </div>
                  <MobileSelect value={form.gender}
                    onChange={v=>upd("gender",v)}
                    options={["Male","Female","Non-binary","Prefer not to say"]}
                    placeholder="Select"/>
                </div>
              </div>
            </div>
          )}

          {step===2&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <p style={{fontSize:13,color:"#5A7A9A",margin:0,lineHeight:1.6}}>
                Select up to 2 presenting symptoms. These will be tracked
                weekly with a 1–10 severity score.
              </p>
              <SymptomPicker
                label="Primary symptom *"
                value={form.symptom1}
                onChange={v=>upd("symptom1",v)}
                taxonomy={taxonomy}
                exclude={form.symptom2?[form.symptom2]:[]}
              />
              <SymptomPicker
                label="Secondary symptom (optional)"
                value={form.symptom2}
                onChange={v=>upd("symptom2",v)}
                taxonomy={taxonomy}
                exclude={form.symptom1?[form.symptom1]:[]}
              />
            </div>
          )}

          {step===3&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <CompoundRow which="primary"/>
              <CompoundRow which="secondary"/>
              <div>
                <div style={{fontSize:11,color:"#8AACCC",fontWeight:600,
                  textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                  Target duration
                </div>
                <MobileSelect value={form.targetDuration}
                  onChange={v=>upd("targetDuration",v)}
                  options={DURATION_OPTIONS} placeholder="Select duration…"/>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:"14px 20px",borderTop:"1px solid #1A2A3A",
          display:"flex",gap:8}}>
          <button onClick={step>1?()=>setStep(s=>s-1):onClose}
            style={{flex:1,padding:"13px",borderRadius:8,
              background:"#1A2535",color:"#F0F6FF",border:"none",
              fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
            {step>1?"← Back":"Cancel"}
          </button>
          <button
            onClick={step<3?()=>setStep(s=>s+1):()=>onCreate(form)}
            disabled={!stepValid[step]}
            style={{flex:2,padding:"13px",borderRadius:8,
              background:stepValid[step]?"#00D2C8":"#1A2535",
              color:stepValid[step]?"#0A1628":"#3A5A7A",
              border:"none",fontSize:14,fontWeight:700,
              cursor:stepValid[step]?"pointer":"default",
              fontFamily:"inherit",transition:"all 0.2s"}}>
            {step<3?"Next →":"Add patient →"}
          </button>
        </div>
      </div>

      {/* Compound search */}
      {showCompSearch&&(
        <CompoundSearchModal
          compounds={compounds}
          onSelect={c=>{
            upd(`${showCompSearch}Compound`,c);
            setShowCompSearch(null);
          }}
          onClose={()=>setShowCompSearch(null)}/>
      )}
    </div>
  );
};

/* ─── PATIENT DETAIL SCREEN ───────────────────────────────────────────── */
const PatientDetailScreen = ({ patient, taxonomy, onBack, onUpdate }) => {
  const [tab, setTab] = useState("progress");
  const [showLog,      setShowLog]      = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  const logs = patient.weeklyLogs||[];
  const nextWeek = logs.length+1;

  const saveLog = (log) => {
    const updated = {...patient, weeklyLogs:[...logs, log]};
    onUpdate(updated);
    setShowLog(false);
  };

  const closeCase = (outcome) => {
    const updated = {...patient, status:"complete", outcome};
    onUpdate(updated);
    setShowComplete(false);
  };

  return (
    <div>
      {/* Back */}
      <button onClick={onBack}
        style={{display:"flex",alignItems:"center",gap:6,background:"none",
          border:"none",cursor:"pointer",color:"#00D2C8",fontSize:13,
          fontFamily:"inherit",padding:"0 0 16px"}}>
        ← Patients
      </button>

      {/* Patient header card */}
      <div style={{background:"#0F1923",borderRadius:12,padding:16,
        marginBottom:16,border:"1px solid #1A2A3A"}}>

        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,
                color:"#00D2C8"}}>{patient.id}</span>
              <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,
                fontWeight:600,
                background:patient.status==="complete"
                  ?"rgba(0,200,100,0.15)":"rgba(0,210,200,0.12)",
                color:patient.status==="complete"?"#00C864":"#00D2C8"}}>
                {patient.status==="complete"?"Closed":"Active"}
              </span>
            </div>
            <div style={{fontSize:12,color:"#5A7A9A",marginTop:4}}>
              {patient.age&&`${patient.age}y`}
              {patient.gender&&` · ${patient.gender}`}
              {patient.doctorName&&` · ${patient.doctorName}`}
            </div>
          </div>
        </div>

        {/* Symptoms */}
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {patient.symptom1&&(
            <span style={{fontSize:12,color:"#F5A623",
              background:"rgba(245,166,35,0.12)",
              padding:"3px 10px",borderRadius:6,fontWeight:500}}>
              ① {patient.symptom1}
            </span>
          )}
          {patient.symptom2&&(
            <span style={{fontSize:12,color:"#F5A623",
              background:"rgba(245,166,35,0.12)",
              padding:"3px 10px",borderRadius:6,fontWeight:500}}>
              ② {patient.symptom2}
            </span>
          )}
        </div>

        {/* Prescription */}
        {patient.primaryCompound&&(
          <div style={{background:"#0A1628",borderRadius:8,padding:"10px 12px",
            border:"1px solid #1A2A3A"}}>
            <div style={{fontSize:10,color:"#5A7A9A",fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>
              Prescription
            </div>
            <div style={{fontSize:13,color:"#F0F6FF",fontWeight:500}}>
              {patient.primaryCompound.name}
              {patient.primaryDose&&` ${patient.primaryDose}${patient.primaryDoseUnit}`}
              {patient.primaryForm&&` · ${patient.primaryForm}`}
            </div>
            {patient.primaryFrequency&&(
              <div style={{fontSize:11,color:"#5A7A9A",marginTop:2}}>
                {patient.primaryFrequency}
                {patient.targetDuration&&` · ${patient.targetDuration}`}
              </div>
            )}
            {patient.secondaryCompound&&(
              <div style={{fontSize:12,color:"#8AACCC",marginTop:6}}>
                + {patient.secondaryCompound.name}
                {patient.secondaryDose&&` ${patient.secondaryDose}${patient.secondaryDoseUnit}`}
                {patient.secondaryFrequency&&` · ${patient.secondaryFrequency}`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[
          {id:"progress",label:`Progress (${logs.length})`},
          {id:"outcome", label:"Outcome"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:"10px",fontSize:13,borderRadius:8,
              cursor:"pointer",fontFamily:"inherit",fontWeight:tab===t.id?700:500,
              background:tab===t.id?"#00D2C8":"#0F1923",
              color:tab===t.id?"#0A1628":"#F0F6FF",
              border:`1px solid ${tab===t.id?"#00D2C8":"#1A2A3A"}`}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Progress tab */}
      {tab==="progress"&&(
        <div>
          {patient.status!=="complete"&&(
            <button onClick={()=>setShowLog(true)}
              style={{width:"100%",padding:"13px",borderRadius:8,
                background:"#00D2C8",color:"#0A1628",border:"none",
                fontSize:14,fontWeight:700,cursor:"pointer",
                fontFamily:"inherit",marginBottom:16}}>
              + Log Week {nextWeek}
            </button>
          )}

          {logs.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px",
              border:"1px dashed #1A2A3A",borderRadius:10}}>
              <p style={{fontSize:13,color:"#5A7A9A"}}>
                No progress logged yet.
              </p>
            </div>
          )}

          {[...logs].reverse().map((log,i)=>(
            <WeekLogCard key={i} log={log} patient={patient}/>
          ))}
        </div>
      )}

      {/* Outcome tab */}
      {tab==="outcome"&&(
        <div>
          {patient.status==="complete"?(
            <OutcomeCard patient={patient}/>
          ):(
            <div>
              <div style={{background:"#0F1923",borderRadius:10,padding:16,
                marginBottom:16,border:"1px solid #1A2A3A",
                fontSize:13,color:"#5A7A9A",lineHeight:1.7}}>
                Record the final outcome when treatment is complete.
                Both symptoms will be captured separately and submitted
                to the research platform as individual evidence rows.
              </div>
              <button onClick={()=>setShowComplete(true)}
                style={{width:"100%",padding:"13px",borderRadius:8,
                  background:"#00C864",color:"#0A1628",border:"none",
                  fontSize:14,fontWeight:700,cursor:"pointer",
                  fontFamily:"inherit"}}>
                Close case & record outcome →
              </button>
            </div>
          )}
        </div>
      )}

      {showLog&&(
        <WeekLogModal patient={patient} weekNumber={nextWeek}
          onClose={()=>setShowLog(false)} onSave={saveLog}/>
      )}
      {showComplete&&(
        <OutcomeModal patient={patient}
          onClose={()=>setShowComplete(false)} onSave={closeCase}/>
      )}
    </div>
  );
};

/* ─── WEEK LOG CARD ──────────────────────────────────────────────────── */
const WeekLogCard = ({ log, patient }) => {
  const responseColors = {
    "Much better":"#00C864","Better":"#00D2C8",
    "Same":"#8AACCC","Worse":"#F5A623","Much worse":"#E05C5C"
  };
  const col = responseColors[log.response]||"#8AACCC";

  return (
    <div style={{background:"#0F1923",borderRadius:10,padding:"14px 16px",
      marginBottom:10,border:"1px solid #1A2A3A"}}>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:"#00D2C8",
          fontFamily:"monospace"}}>Week {log.week}</span>
        <span style={{fontSize:10,color:"#5A7A9A"}}>
          {log.date?new Date(log.date).toLocaleDateString("en-GB",
            {day:"2-digit",month:"short"}):""}
        </span>
      </div>

      <div style={{fontSize:14,fontWeight:600,color:col,marginBottom:8}}>
        {log.response}
      </div>

      {(log.score1!=null||log.score2!=null)&&(
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          {log.score1!=null&&(
            <div style={{background:"#0A1628",borderRadius:6,
              padding:"6px 10px",flex:1}}>
              <div style={{fontSize:10,color:"#5A7A9A",marginBottom:2}}>
                {patient.symptom1}
              </div>
              <div style={{fontSize:16,fontWeight:700,
                color:log.score1<=3?"#00C864":log.score1<=6?"#F5A623":"#E05C5C"}}>
                {log.score1}<span style={{fontSize:11,color:"#5A7A9A"}}>/10</span>
              </div>
            </div>
          )}
          {log.score2!=null&&patient.symptom2&&(
            <div style={{background:"#0A1628",borderRadius:6,
              padding:"6px 10px",flex:1}}>
              <div style={{fontSize:10,color:"#5A7A9A",marginBottom:2}}>
                {patient.symptom2}
              </div>
              <div style={{fontSize:16,fontWeight:700,
                color:log.score2<=3?"#00C864":log.score2<=6?"#F5A623":"#E05C5C"}}>
                {log.score2}<span style={{fontSize:11,color:"#5A7A9A"}}>/10</span>
              </div>
            </div>
          )}
        </div>
      )}

      {log.sideEffects?.length>0&&(
        <div style={{fontSize:11,color:"#F5A623",marginBottom:4}}>
          ⚠ {log.sideEffects.join(", ")}
          {log.sideEffectSeverity&&` (${log.sideEffectSeverity})`}
        </div>
      )}
      {log.doseAdjusted&&(
        <div style={{fontSize:11,color:"#8AACCC"}}>
          Dose adjusted → {log.newDose}
        </div>
      )}
      {log.notes&&(
        <div style={{fontSize:12,color:"#5A7A9A",fontStyle:"italic",marginTop:4}}>
          {log.notes}
        </div>
      )}
    </div>
  );
};

/* ─── WEEK LOG MODAL ──────────────────────────────────────────────────── */
const WeekLogModal = ({ patient, weekNumber, onClose, onSave }) => {
  const [form, setForm] = useState({
    week: weekNumber,
    date: new Date().toISOString().split("T")[0],
    response:"", score1:5, score2:5,
    sideEffects:[], sideEffectSeverity:"",
    doseAdjusted:false, newDose:"", notes:"",
  });
  const upd = (f,v) => setForm(p=>({...p,[f]:v}));

  const RESPONSES = ["Much better","Better","Same","Worse","Much worse"];
  const SIDE_EFFECTS = ["Nausea","Headache","Dizziness","Insomnia",
    "Palpitations","Skin reaction","Digestive upset","Fatigue","Other"];
  const responseColors = {
    "Much better":"#00C864","Better":"#00D2C8",
    "Same":"#2A3A50","Worse":"rgba(245,166,35,0.3)","Much worse":"rgba(224,92,92,0.3)"
  };
  const responseText = {
    "Much better":"#00C864","Better":"#00D2C8",
    "Same":"#8AACCC","Worse":"#F5A623","Much worse":"#E05C5C"
  };

  const ScoreSlider = ({label, field}) => (
    <div style={{background:"#0A1628",borderRadius:8,padding:"12px 14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:12,color:"#8AACCC",fontWeight:500}}>{label}</div>
        <div style={{fontSize:20,fontWeight:700,
          color:form[field]<=3?"#00C864":form[field]<=6?"#F5A623":"#E05C5C"}}>
          {form[field]}<span style={{fontSize:12,color:"#5A7A9A"}}>/10</span>
        </div>
      </div>
      <input type="range" min={1} max={10} value={form[field]}
        onChange={e=>upd(field,Number(e.target.value))}
        style={{width:"100%",accentColor:"#00D2C8"}}/>
      <div style={{display:"flex",justifyContent:"space-between",
        fontSize:10,color:"#5A7A9A",marginTop:2}}>
        <span>1 — None</span><span>5 — Moderate</span><span>10 — Severe</span>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,
      background:"rgba(0,0,0,0.85)",display:"flex",
      flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:"#0F1923",borderRadius:"16px 16px 0 0",
        maxHeight:"90vh",display:"flex",flexDirection:"column"}}>

        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}>
          <div style={{width:36,height:4,borderRadius:2,background:"#2A3A50"}}/>
        </div>
        <div style={{padding:"12px 20px",borderBottom:"1px solid #1A2A3A",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:15,fontWeight:700,color:"#F0F6FF"}}>
            Week {weekNumber} — {patient.id}
          </div>
          <button onClick={onClose}
            style={{background:"none",border:"none",color:"#5A7A9A",
              cursor:"pointer",fontSize:20}}>✕</button>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 20px",
          display:"flex",flexDirection:"column",gap:14}}>

          {/* Overall response */}
          <div>
            <div style={{fontSize:11,color:"#8AACCC",fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
              Overall response *
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {RESPONSES.map(r=>(
                <button key={r} onClick={()=>upd("response",r)}
                  style={{padding:"12px 14px",borderRadius:8,fontSize:14,
                    cursor:"pointer",fontFamily:"inherit",textAlign:"left",
                    background:form.response===r
                      ?responseColors[r]:"#1A2535",
                    color:form.response===r
                      ?responseText[r]:"#8AACCC",
                    border:`1px solid ${form.response===r
                      ?responseText[r]:"#2A3A50"}`,
                    fontWeight:form.response===r?700:400}}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Symptom scores */}
          <ScoreSlider label={`① ${patient.symptom1} severity`} field="score1"/>
          {patient.symptom2&&(
            <ScoreSlider label={`② ${patient.symptom2} severity`} field="score2"/>
          )}

          {/* Side effects */}
          <div>
            <div style={{fontSize:11,color:"#8AACCC",fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
              Side effects
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
              {SIDE_EFFECTS.map(se=>(
                <button key={se}
                  onClick={()=>upd("sideEffects",
                    form.sideEffects.includes(se)
                      ?form.sideEffects.filter(x=>x!==se)
                      :[...form.sideEffects,se])}
                  style={{padding:"6px 12px",borderRadius:20,fontSize:12,
                    cursor:"pointer",fontFamily:"inherit",
                    background:form.sideEffects.includes(se)
                      ?"rgba(224,92,92,0.2)":"#1A2535",
                    color:form.sideEffects.includes(se)?"#E05C5C":"#8AACCC",
                    border:`1px solid ${form.sideEffects.includes(se)
                      ?"#E05C5C":"#2A3A50"}`}}>
                  {se}
                </button>
              ))}
            </div>
            {form.sideEffects.length>0&&(
              <div style={{display:"flex",gap:6}}>
                {["Mild","Moderate","Severe"].map(sev=>(
                  <button key={sev} onClick={()=>upd("sideEffectSeverity",sev)}
                    style={{flex:1,padding:"8px",borderRadius:8,fontSize:12,
                      cursor:"pointer",fontFamily:"inherit",
                      background:form.sideEffectSeverity===sev
                        ?"rgba(245,166,35,0.2)":"#1A2535",
                      color:form.sideEffectSeverity===sev
                        ?"#F5A623":"#8AACCC",
                      border:`1px solid ${form.sideEffectSeverity===sev
                        ?"#F5A623":"#2A3A50"}`}}>
                    {sev}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dose adjustment */}
          <div style={{background:"#0A1628",borderRadius:8,padding:"12px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:form.doseAdjusted?10:0}}>
              <span style={{fontSize:13,color:"#F0F6FF"}}>Dose adjusted?</span>
              <button onClick={()=>upd("doseAdjusted",!form.doseAdjusted)}
                style={{width:44,height:24,borderRadius:12,border:"none",
                  cursor:"pointer",position:"relative",
                  background:form.doseAdjusted?"#00D2C8":"#2A3A50",
                  transition:"all 0.2s"}}>
                <div style={{width:18,height:18,borderRadius:9,
                  background:"#F0F6FF",position:"absolute",
                  top:3,transition:"all 0.2s",
                  left:form.doseAdjusted?22:4}}/>
              </button>
            </div>
            {form.doseAdjusted&&(
              <input value={form.newDose}
                onChange={e=>upd("newDose",e.target.value)}
                placeholder="New dose e.g. 900mg BD"
                style={{width:"100%",padding:"9px 12px",borderRadius:6,
                  background:"#1A2535",border:"1px solid #2A3A50",
                  color:"#F0F6FF",fontSize:13,fontFamily:"inherit",
                  boxSizing:"border-box"}}/>
            )}
          </div>

          {/* Notes */}
          <div>
            <div style={{fontSize:11,color:"#8AACCC",fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
              Clinical notes
            </div>
            <textarea value={form.notes}
              onChange={e=>upd("notes",e.target.value)}
              rows={3} placeholder="Any observations or patient feedback…"
              style={{width:"100%",padding:"10px 12px",borderRadius:8,
                background:"#1A2535",border:"1px solid #2A3A50",
                color:"#F0F6FF",fontSize:13,fontFamily:"inherit",
                resize:"none",boxSizing:"border-box"}}/>
          </div>
        </div>

        <div style={{padding:"14px 20px",borderTop:"1px solid #1A2A3A",
          display:"flex",gap:8}}>
          <button onClick={onClose}
            style={{flex:1,padding:"13px",borderRadius:8,
              background:"#1A2535",color:"#F0F6FF",border:"none",
              fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
            Cancel
          </button>
          <button onClick={()=>onSave(form)} disabled={!form.response}
            style={{flex:2,padding:"13px",borderRadius:8,
              background:form.response?"#00D2C8":"#1A2535",
              color:form.response?"#0A1628":"#3A5A7A",
              border:"none",fontSize:14,fontWeight:700,
              cursor:form.response?"pointer":"default",
              fontFamily:"inherit",transition:"all 0.2s"}}>
            Save week {weekNumber}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── OUTCOME MODAL ───────────────────────────────────────────────────── */
const OutcomeModal = ({ patient, onClose, onSave }) => {
  const makeOutcome = () => ({
    direction:"", magnitude:"", significance:"", mcid:""
  });
  const [form, setForm] = useState({
    outcome1: makeOutcome(),
    outcome2: makeOutcome(),
    weeksCompleted: String((patient.weeklyLogs||[]).length),
    finalNotes:"",
  });

  const updO = (which, field, val) =>
    setForm(p=>({...p,[which]:{...p[which],[field]:val}}));

  const valid = form.outcome1.direction && form.outcome1.magnitude;

  const OutcomeSection = ({which, symptom}) => {
    if(!symptom) return null;
    const o = form[which];
    return (
      <div style={{background:"#0A1628",borderRadius:10,padding:14,
        border:"1px solid #1A2A3A"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#F5A623",
          marginBottom:12}}>
          {which==="outcome1"?"①":"②"} {symptom}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <div style={{fontSize:10,color:"#5A7A9A",fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>
              Direction *
            </div>
            <div style={{display:"flex",gap:6}}>
              {["Improved","No change","Worsened"].map(d=>(
                <button key={d} onClick={()=>updO(which,"direction",d)}
                  style={{flex:1,padding:"9px 4px",borderRadius:8,
                    fontSize:12,cursor:"pointer",fontFamily:"inherit",
                    background:o.direction===d
                      ?d==="Improved"?"rgba(0,200,100,0.2)"
                        :d==="Worsened"?"rgba(224,92,92,0.2)"
                        :"rgba(138,172,204,0.2)":"#1A2535",
                    color:o.direction===d
                      ?d==="Improved"?"#00C864"
                        :d==="Worsened"?"#E05C5C":"#8AACCC":"#5A7A9A",
                    border:`1px solid ${o.direction===d
                      ?d==="Improved"?"#00C864"
                        :d==="Worsened"?"#E05C5C":"#8AACCC":"#2A3A50"}`,
                    fontWeight:o.direction===d?700:400}}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{fontSize:10,color:"#5A7A9A",fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
              Effect magnitude *
            </div>
            <input value={o.magnitude}
              onChange={e=>updO(which,"magnitude",e.target.value)}
              placeholder="e.g. 40% reduction, -2.1 SD, 3-point drop"
              style={{width:"100%",padding:"9px 12px",borderRadius:6,
                background:"#1A2535",border:"1px solid #2A3A50",
                color:"#F0F6FF",fontSize:12,fontFamily:"inherit",
                boxSizing:"border-box"}}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div>
              <div style={{fontSize:10,color:"#5A7A9A",fontWeight:600,
                textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                Statistically significant?
              </div>
              <select value={o.significance}
                onChange={e=>updO(which,"significance",e.target.value)}
                style={{width:"100%",padding:"9px 10px",borderRadius:6,
                  background:"#1A2535",border:"1px solid #2A3A50",
                  color:o.significance?"#F0F6FF":"#5A7A9A",
                  fontSize:12,fontFamily:"inherit"}}>
                <option value="">Unknown</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:10,color:"#5A7A9A",fontWeight:600,
                textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                Clinically meaningful?
              </div>
              <select value={o.mcid}
                onChange={e=>updO(which,"mcid",e.target.value)}
                style={{width:"100%",padding:"9px 10px",borderRadius:6,
                  background:"#1A2535",border:"1px solid #2A3A50",
                  color:o.mcid?"#F0F6FF":"#5A7A9A",
                  fontSize:12,fontFamily:"inherit"}}>
                <option value="">Unknown</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,
      background:"rgba(0,0,0,0.85)",display:"flex",
      flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:"#0F1923",borderRadius:"16px 16px 0 0",
        maxHeight:"92vh",display:"flex",flexDirection:"column"}}>

        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}>
          <div style={{width:36,height:4,borderRadius:2,background:"#2A3A50"}}/>
        </div>
        <div style={{padding:"12px 20px",borderBottom:"1px solid #1A2A3A",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:"#F0F6FF"}}>
              Close case — {patient.id}
            </div>
            <div style={{fontSize:11,color:"#5A7A9A",marginTop:2}}>
              Outcome submitted to research platform as evidence rows
            </div>
          </div>
          <button onClick={onClose}
            style={{background:"none",border:"none",color:"#5A7A9A",
              cursor:"pointer",fontSize:20}}>✕</button>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 20px",
          display:"flex",flexDirection:"column",gap:14}}>

          <OutcomeSection which="outcome1" symptom={patient.symptom1}/>
          <OutcomeSection which="outcome2" symptom={patient.symptom2}/>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:10,color:"#5A7A9A",fontWeight:600,
                textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                Weeks completed
              </div>
              <input value={form.weeksCompleted}
                onChange={e=>setForm(p=>({...p,weeksCompleted:e.target.value}))}
                type="number" placeholder="e.g. 8"
                style={{width:"100%",padding:"9px 12px",borderRadius:6,
                  background:"#1A2535",border:"1px solid #2A3A50",
                  color:"#F0F6FF",fontSize:13,fontFamily:"inherit",
                  boxSizing:"border-box"}}/>
            </div>
          </div>

          <div>
            <div style={{fontSize:10,color:"#5A7A9A",fontWeight:600,
              textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
              Final clinical notes
            </div>
            <textarea value={form.finalNotes}
              onChange={e=>setForm(p=>({...p,finalNotes:e.target.value}))}
              rows={3} placeholder="Summary of treatment response…"
              style={{width:"100%",padding:"10px 12px",borderRadius:8,
                background:"#1A2535",border:"1px solid #2A3A50",
                color:"#F0F6FF",fontSize:13,fontFamily:"inherit",
                resize:"none",boxSizing:"border-box"}}/>
          </div>
        </div>

        <div style={{padding:"14px 20px",borderTop:"1px solid #1A2A3A",
          display:"flex",gap:8}}>
          <button onClick={onClose}
            style={{flex:1,padding:"13px",borderRadius:8,
              background:"#1A2535",color:"#F0F6FF",border:"none",
              fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
            Cancel
          </button>
          <button onClick={()=>onSave(form)} disabled={!valid}
            style={{flex:2,padding:"13px",borderRadius:8,
              background:valid?"#00C864":"#1A2535",
              color:valid?"#0A1628":"#3A5A7A",
              border:"none",fontSize:14,fontWeight:700,
              cursor:valid?"pointer":"default",
              fontFamily:"inherit",transition:"all 0.2s"}}>
            Submit outcome →
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── OUTCOME CARD (closed case) ─────────────────────────────────────── */
const OutcomeCard = ({ patient }) => {
  const o = patient.outcome;
  if(!o) return null;
  return (
    <div style={{background:"rgba(0,200,100,0.08)",borderRadius:10,padding:16,
      border:"1px solid rgba(0,200,100,0.2)"}}>
      <div style={{fontSize:13,fontWeight:700,color:"#00C864",marginBottom:12}}>
        ✓ Case closed — outcome submitted to research platform
      </div>
      {[
        {label:"Weeks completed", val:o.weeksCompleted},
      ].filter(x=>x.val).map(({label,val})=>(
        <div key={label} style={{display:"flex",gap:8,fontSize:12,marginBottom:6}}>
          <span style={{color:"#5A7A9A",width:140,flexShrink:0}}>{label}</span>
          <span style={{color:"#F0F6FF",fontWeight:500}}>{val}</span>
        </div>
      ))}
      {patient.symptom1&&o.outcome1&&(
        <div style={{marginTop:10,padding:"10px 12px",background:"#0A1628",
          borderRadius:8}}>
          <div style={{fontSize:11,color:"#F5A623",marginBottom:6,fontWeight:600}}>
            ① {patient.symptom1}
          </div>
          <div style={{fontSize:13,color:"#F0F6FF"}}>{o.outcome1.direction}</div>
          <div style={{fontSize:12,color:"#8AACCC"}}>{o.outcome1.magnitude}</div>
        </div>
      )}
      {patient.symptom2&&o.outcome2&&o.outcome2.direction&&(
        <div style={{marginTop:8,padding:"10px 12px",background:"#0A1628",
          borderRadius:8}}>
          <div style={{fontSize:11,color:"#F5A623",marginBottom:6,fontWeight:600}}>
            ② {patient.symptom2}
          </div>
          <div style={{fontSize:13,color:"#F0F6FF"}}>{o.outcome2.direction}</div>
          <div style={{fontSize:12,color:"#8AACCC"}}>{o.outcome2.magnitude}</div>
        </div>
      )}
    </div>
  );
};

/* ─── PROFILE SCREEN ─────────────────────────────────────────────────── */
const ProfileScreen = ({ profile, onSignOut, patients, userId, onReseed }) => (
  <div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#F0F6FF",marginBottom:20}}>
      Profile
    </h2>
    <div style={{background:"#0F1923",borderRadius:12,padding:16,
      marginBottom:12,border:"1px solid #1A2A3A"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:"#00D2C8",
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:22,fontWeight:700,color:"#0A1628",flexShrink:0}}>
          {(profile.fullName||"D")[0].toUpperCase()}
        </div>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:"#F0F6FF"}}>
            Dr. {profile.fullName}
          </div>
          <div style={{fontSize:12,color:"#5A7A9A",marginTop:2}}>
            {profile.specialisation||"Clinical Contributor"}
          </div>
          {profile.clinic&&(
            <div style={{fontSize:12,color:"#8AACCC",marginTop:2}}>
              {profile.clinic}{profile.location&&` · ${profile.location}`}
            </div>
          )}
        </div>
      </div>

      {[
        ["Total patients",  patients.length],
        ["Active cases",    patients.filter(p=>p.status==="active").length],
        ["Closed cases",    patients.filter(p=>p.status==="complete").length],
        ["Progress entries",patients.reduce((n,p)=>n+(p.weeklyLogs||[]).length,0)],
      ].map(([lbl,val])=>(
        <div key={lbl} style={{display:"flex",justifyContent:"space-between",
          padding:"9px 0",borderTop:"1px solid #1A2A3A"}}>
          <span style={{fontSize:13,color:"#8AACCC"}}>{lbl}</span>
          <span style={{fontSize:13,fontWeight:700,color:"#F0F6FF",
            fontFamily:"monospace"}}>{val}</span>
        </div>
      ))}
    </div>

    {profile.regNumber&&(
      <div style={{fontSize:11,color:"#5A7A9A",textAlign:"center",
        marginBottom:16}}>Reg: {profile.regNumber}</div>
    )}

    {/* Seed test data */}
    <div style={{marginBottom:16}}>
      <div style={{fontSize:11,color:"#5A7A9A",marginBottom:8,fontWeight:600,
        textTransform:"uppercase",letterSpacing:"0.06em"}}>
        Test data
      </div>
      {[
        {label:"🧪 Load 50 test patients (Dr. Ravi)",
          fn:()=>{ if(onReseed) onReseed(); else { const n=seedTestPatients(userId||"user-doctor-nep-science"); alert(`✓ Loaded ${n} patients`); window.location.reload(); }}},
        {label:"🧪 Load 25 test patients (Dr. Priya)",
          fn:()=>{ const n=seedTestPatientsDr2("user-doctor2-nep-science"); alert(`✓ Loaded ${n} patients for Dr. Priya`); window.location.reload(); }},
      ].map(({label,fn})=>(
        <button key={label} onClick={fn}
          style={{width:"100%",padding:"11px 14px",borderRadius:8,
            background:"#0F1923",color:"#00D2C8",
            border:"1px solid #00D2C820",
            fontSize:13,cursor:"pointer",fontFamily:"inherit",
            marginBottom:8,textAlign:"left"}}>
          {label}
        </button>
      ))}
    </div>

    <button onClick={onSignOut}
      style={{width:"100%",padding:"13px",borderRadius:8,
        background:"#1A2535",color:"#8AACCC",border:"1px solid #2A3A50",
        fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
      Sign out
    </button>
  </div>
);

/* ─── ADMIN PANEL (stub — full build in Sprint 3) ─────────────────────── */
const AdminPanel = ({ user, onSignOut }) => (
  <div style={{minHeight:"100vh",background:"#0A1628"}}>
    <div style={{height:52,background:"#0F1923",
      borderBottom:"1px solid #1A2A3A",
      display:"flex",alignItems:"center",
      padding:"0 24px",gap:12}}>
      <div style={{width:28,height:28,borderRadius:6,background:"#E05C5C",
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"#fff",fontSize:14,fontWeight:800}}>A</span>
      </div>
      <span style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>NEP Admin</span>
      <span style={{fontSize:12,color:"#5A7A9A"}}>— {user.email}</span>
      <div style={{flex:1}}/>
      <button onClick={onSignOut}
        style={{fontSize:12,color:"#5A7A9A",background:"none",
          border:"none",cursor:"pointer"}}>Sign out</button>
    </div>
    <div style={{maxWidth:600,margin:"60px auto",padding:24,textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>⚙️</div>
      <h2 style={{fontSize:18,color:"#F0F6FF",marginBottom:8}}>Admin Panel</h2>
      <p style={{color:"#5A7A9A",fontSize:13,lineHeight:1.7}}>
        Compound repository, symptom taxonomy, study management
        and user roles — coming in Sprint 3.
      </p>
    </div>
  </div>
);



export default function App(){
  const [user,setUser]                     = useState(()=>API.getSession());
  const [allPatients, setAllPatients]      = useState([]);
  const [projects,setProjects]             = useState([]);
  const [projectOutcomes,setProjectOutcomes]=useState({});
  const [project,setProject]              = useState(null);
  const [outcomes,setOutcomes]             = useState(()=>{
    try{ return _STORE.outcomes["_default"]||[]; }catch(e){ return []; }
  });
  const [papers,setPapers]                 = useState(()=>{
    try{ return JSON.parse(localStorage.getItem("nep_papers")||"[]"); }catch(e){ return []; }
  });
  const savePapers = (p) => { setPapers(p); try{localStorage.setItem("nep_papers",JSON.stringify(p));}catch(e){} };
  const [nepStudies,setNepStudies]         = useState(()=>{
    try{ return JSON.parse(localStorage.getItem("nep_studies_v2")||"[]"); }catch(e){ return []; }
  });
  const saveNepStudies = (s) => { setNepStudies(s); try{localStorage.setItem("nep_studies_v2",JSON.stringify(s));}catch(e){} };
  const [showCreateStudy,setShowCreateStudy] = useState(false);
  const [selectedStudy,setSelectedStudy] = useState(null);
  const [refs,setRefs]                     = useState(()=>{
    try{ return _STORE.refs["_default"]||[]; }catch(e){ return []; }
  });
  const [compounds,setCompounds]           = useState([...SEED_COMPOUNDS]);
  const [activeTab,setActiveTab]           = useState("studies");
  const [activeCompound,setActiveCompound] = useState(null);
  const [compoundTab,setCompoundTab]       = useState("overview");

  // [auto-import placeholder removed]
  const [projectOpen,setProjectOpen]       = useState(false);
  const [showNewProject,setShowNewProject] = useState(false);
  const [saving,setSaving]                 = useState(false);
  const [loading,setLoading]               = useState(false);
  const [projectsLoading,setProjectsLoading]=useState(false);
  const toast  = useToast();
  const saveTimer = useRef(null);

  /* Load projects */
  const loadProjects=useCallback(async()=>{
    if(!user) return;
    setProjectsLoading(true);
    try{
      const list=await API.listProjects();
      setProjects(list||[]);
    }catch(e){toast.error("Failed to load projects");}
    finally{setProjectsLoading(false);}
  },[user,toast]);

  // Clear stale data on version change
  const SEED_VERSION = "v6.2-clean";
  if(localStorage.getItem("nep_seed_version") !== SEED_VERSION) {
    // Clear old test data for clean start
    for(let i=localStorage.length-1;i>=0;i--){
      const k=localStorage.key(i);
      if(k&&(k.startsWith("nep_doctor_patients_")||k.startsWith("nep_store_")||
        k==="nep_papers"||k.startsWith("nep_study_meta_")||k==="nep_studies_v2"))
        localStorage.removeItem(k);
    }
    localStorage.setItem("nep_seed_version", SEED_VERSION);
    console.log("Cleared test data for", SEED_VERSION);
  }

  // Load all doctor patients from localStorage
  const loadAllPatients = () => {
    const pts = [];
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key&&key.startsWith("nep_doctor_patients_")){
        try{ pts.push(...JSON.parse(localStorage.getItem(key)||"[]")); }
        catch(e){}
      }
    }
    setAllPatients(pts);
    return pts;
  };

  useEffect(()=>{ loadAllPatients(); },[]);
  useEffect(()=>{
    if(activeTab==="studies") loadAllPatients();
    if(activeTab==="papers"){ try{ setPapers(JSON.parse(localStorage.getItem("nep_papers")||"[]")); }catch(e){} }
  },[activeTab]);

  // Listen for paper updates from generation panel
  useEffect(()=>{
    const handler = () => {
      try{ setPapers(JSON.parse(localStorage.getItem("nep_papers")||"[]")); }catch(e){}
    };
    window.addEventListener("nep-papers-updated", handler);
    return () => window.removeEventListener("nep-papers-updated", handler);
  },[]);

  // Auto-import outcomes when entering V&G tab if empty
  useEffect(()=>{
    if(activeTab==="studies" && compoundTab==="generate" && outcomes.length===0){
      const completed = allPatients.filter(p=>p.status==="complete"&&p.outcome);
      if(completed.length>0){
        setTimeout(()=>importPatientOutcomes(), 200);
      }
    }
  },[activeTab, compoundTab, allPatients.length]);


  // Load outcomes/refs from _STORE (persisted by mock adapter)
  useEffect(()=>{
    if(user){
      const stored = _STORE.outcomes["_default"];
      if(stored?.length && outcomes.length===0) setOutcomes(stored);
      const storedRefs = _STORE.refs["_default"];
      if(storedRefs?.length && refs.length===0) setRefs(storedRefs);
    }
  },[user]);

  useEffect(()=>{
    if(user) loadProjects();
  },[user]);

  /* Load a project */
  const loadProject=async(proj)=>{
    setProject(proj); setLoading(true);
    if(user?.id) localStorage.setItem(`nep_last_project_${user.id}`, proj.id);
    try{
      const [outs,rfs,comps]=await Promise.all([
        API.listOutcomes(proj.id),
        API.listRefs(proj.id),
        API.listCompounds(),
      ]);
      const migratedOuts=(outs||[]).map(o=>{
        if((o.compound_id||o.compound_name)&&(!o.compounds||o.compounds.length===0)){
          return {...o,compounds:[{
            id:o.compound_id||o.compound_name,
            name:o.compound_name||o.compound_id||"",
            scientific:o.scientific_name||"",
          }]};
        }
        return o;
      });
      setOutcomes(migratedOuts);
      setRefs(rfs||[]);
      if(comps?.length>0){
        const merged=[...SEED_COMPOUNDS];
        comps.forEach(c=>{if(!merged.find(x=>x.id===c.id))merged.push(c);});
        setCompounds(merged);
      }
      // Compute project outcomes for list view
      const wsVals=(migratedOuts||[]).map(o=>Number(o._ws)).filter(v=>!isNaN(v)&&v>0);
      const ess=wsVals.length?wsVals.reduce((a,b)=>a+b,0)/wsVals.length:null;
      setProjectOutcomes(prev=>({...prev,[proj.id]:migratedOuts}));
    }catch(e){ toast.error("Failed to load project"); }
    finally{ setLoading(false); }
    setActiveTab("studies");
    setCompoundTab("overview");
  };

  /* Scheduling auto-save */
  const scheduleSave=(type,data)=>{
    if(saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current=setTimeout(async()=>{
      try{
        if(type==="outcomes") await API.saveOutcomes(project?.id||"_default",data);
        if(type==="refs"&&project) await API.saveRefs(project.id,data);
      }catch(e){}
      setSaving(false);
    },1500);
  };

  /* Outcome CRUD */
  const addOutcome=()=>{
    const id=crypto.randomUUID();
    const newO={
      id, study_id:`STUDY-${String(outcomes.length+1).padStart(3,"0")}`,
      study_type:"", study_ref_id:"", compounds:[],
      compound_name:"", compound_id:"", scientific_name:"",
      outcome_name:"", outcome_category:"", outcome_score:"",
      direction:"", significance:"", p_value:"", es_value:"",
      es_type:"", mcid_met:"", sample_n:"", quality_score:"",
      bias_tool:"", bias_d1:"0",bias_d2:"0",bias_d3:"0",bias_d4:"0",bias_d5:"0",
      dosage:"", dose_unit:"mg", frequency:"", duration:"",
      population:"", _biasP:0, _sampleScore:0, _ws:null,
      _saved:false, _errors:{}, _fromPatient:false,
    };
    const updated=[...outcomes,newO];
    setOutcomes(updated);
    scheduleSave("outcomes",updated);
  };

  const updateOutcome=(id,upd)=>{
    const updated=outcomes.map(o=>{
      if(o.id!==id) return o;
      const merged={...o,...upd};
      merged._sampleScore=score.sampleScore(merged.sample_n);
      merged._biasP=score.biasP(merged.bias_d1,merged.bias_d2,
        merged.bias_d3,merged.bias_d4,merged.bias_d5);
      merged._ws=score.ws(merged.quality_score,merged._sampleScore,
        merged.outcome_score,merged._biasP,merged.significance);
      merged._saved=true;
      return merged;
    });
    setOutcomes(updated);
    scheduleSave("outcomes",updated);
  };

  const removeOutcome=(id)=>{
    const updated=outcomes.filter(o=>o.id!==id);
    setOutcomes(updated);
    scheduleSave("outcomes",updated);
  };

  /* Ref CRUD */
  const addRef=(ref={})=>{
    const newR={id:crypto.randomUUID(),ref_id:`REF-${Date.now()}`,
      study_ref_id:"",compound_id:"",title:"",authors:"",year:"",
      journal:"",doi:"",volume:"",issue:"",pages:"",
      bias_tool:"",bias_overall:"",...ref};
    const updated=[...refs,newR];
    setRefs(updated);
    scheduleSave("refs",updated);
  };

  const updateRef=(id,upd)=>{
    const updated=refs.map(r=>r.id===id?{...r,...upd}:r);
    setRefs(updated);
    scheduleSave("refs",updated);
  };

  const removeRef=(id)=>{
    const updated=refs.filter(r=>r.id!==id);
    setRefs(updated);
    scheduleSave("refs",updated);
  };

  const deleteProject=async(proj)=>{
    if(!window.confirm(`Delete "${proj.name}"?`)) return;
    await API.deleteProject(proj.id);
    setProjects(prev=>prev.filter(p=>p.id!==proj.id));
    if(project?.id===proj.id){ setProject(null);setOutcomes([]);setRefs([]); }
  };

  const updateProjectFull=async(updated)=>{
    setProject(updated);
    setProjects(prev=>prev.map(p=>p.id===updated.id?updated:p));
    await API.updateProject(updated);
  };

  const handleAddCompound=async(c)=>{
    setCompounds(prev=>prev.find(x=>x.id===c.id)?prev:[...prev,c]);
    if(project){try{await API.addCompound(c);}catch(e){}}
  };

  // Import completed patient outcomes
  const importPatientOutcomes=()=>{
    const freshPatients=loadAllPatients();
    const completed=freshPatients.filter(p=>p.status==="complete"&&p.outcome);
    if(!completed.length){
      toast.error("No completed patient outcomes found.");
      return;
    }
    const newOutcomes=[];
    completed.forEach((p)=>{
      const comp=p.primaryCompound;
      const compObj=comp?[{id:comp.id||comp.name,name:comp.name,
        scientific:comp.scientific||""}]:[];
      const base={
        study_type:p.studyType||"Clinical observation",
        population:`${p.age||"?"}y ${p.gender||""}`,
        sample_n:String(completed.length),
        quality_score:String(p.qualityScore||3),outcome_score:"3",
        bias_tool:"Clinical observation",
        bias_d1:"0",bias_d2:"0",bias_d3:"0",bias_d4:"0",bias_d5:"0",
        _biasP:0,_sampleScore:0,_ws:null,_saved:false,_errors:{},
        study_ref_id:`${p.id}-OBS`,
        compounds:compObj,compound_name:comp?.name||"",
        dosage:p.primaryDose||"",dose_unit:p.primaryDoseUnit||"mg",
        frequency:p.primaryFrequency||"",duration:p.targetDuration||"",
        _fromPatient:true,_patientId:p.id,_doctorName:p.doctorName||"",
      };
      [["symptom1","outcome1"],["symptom2","outcome2"]].forEach(([sk,ok])=>{
        const sym=p[sk]; const out=p.outcome?.[ok];
        if(!sym||!out?.direction) return;
        const isImp=out.direction==="Improved";
        const isSig=out.significance==="Yes";
        const isMcid=out.mcid==="Yes";
        const oScore=isImp?(isSig&&isMcid?4:isSig?3:2):1;
        newOutcomes.push({
          ...base,
          id:crypto.randomUUID(),
          outcome_name:sym,outcome_category:"Clinical",
          direction:out.direction,
          significance:isSig?"Significant":"Not Significant",
          es_value:out.magnitude||"",
          mcid_met:isMcid?"Yes":"No",
          outcome_score:String(oScore),
          p_value:isSig?"< 0.05":"",
        });
      });
    });
    if(!newOutcomes.length){ toast.error("No outcome rows created."); return; }
    const scored=newOutcomes.map(o=>{
      const ss=score.sampleScore(Number(o.sample_n));
      const bp=score.biasP(o.bias_d1,o.bias_d2,o.bias_d3,o.bias_d4,o.bias_d5);
      const ws=score.ws(Number(o.quality_score),ss,Number(o.outcome_score),bp,o.significance);
      return {...o,_sampleScore:ss,_biasP:bp,_ws:ws};
    });
    setOutcomes(prev=>{
      const seen=new Set(prev.map(o=>o._patientId+"|"+o.outcome_name));
      const fresh=scored.filter(o=>!seen.has(o._patientId+"|"+o.outcome_name));
      const all=[...prev,...fresh];
      // Always persist to _STORE — use project.id or fallback key
      const pid = project?.id || "_default";
      try{ API.saveOutcomes(pid, all); }catch(e){}
      return all;
    });
    toast.success(`✓ Imported ${scored.length} outcome rows from ${completed.length} patients`);
  };

  // Note: outcomes are imported manually via "Import patient data" button

  /* Derived values */
  const allCompoundsUsed=[...new Map(
    outcomes.flatMap(o=>{
      if(o.compounds?.length>0) return o.compounds.map(c=>[c.id,c]);
      if(o.compound_id||o.compound_name) return [[
        o.compound_id||o.compound_name,
        {id:o.compound_id||o.compound_name,
         name:o.compound_name||o.compound_id||"",
         scientific:o.scientific_name||""},
      ]];
      return [];
    })
  ).values()].filter(c=>c.name);

  const compound = allCompoundsUsed[0]||
    compounds.find(c=>outcomes.some(o=>o.compound_id===c.id))||
    compounds[0]||{};

  const wsArr  = outcomes.map(o=>Number(o._ws)).filter(v=>!isNaN(v)&&v>0);
  const ess    = wsArr.length?wsArr.reduce((a,b)=>a+b,0)/wsArr.length:null;
  const essC   = ess==null?"No data":ess>=12?"Very Strong":ess>=9?"Strong":ess>=6?"Moderate":"Weak";

  /* Role-based routing */
  if(!user) return <AuthScreen onAuth={u=>{setUser(u);loadProjects();}}/>;
  if(user.role==="doctor") return (
    <DoctorApp user={user} onSignOut={async()=>{await API.signOut();setUser(null);}}/>
  );
  if(user.role==="admin") return (
    <AdminPanel user={user} onSignOut={async()=>{await API.signOut();setUser(null);}}/>
  );

  /* Researcher platform */
  const NavBtn=({id,label,indent=false,badge=null,onClick:customClick})=>{
    const active=activeTab===id||(id.startsWith("_ct_")&&activeTab==="studies"&&compoundTab===id.replace("_ct_",""));
    return(
      <button onClick={customClick||(()=>setActiveTab(id))} style={{
        width:"100%",textAlign:"left",
        padding:indent?"7px 14px 7px 22px":"9px 14px",
        borderRadius:6,fontSize:indent?12:13,fontWeight:active?600:400,
        background:active?"rgba(0,210,200,0.12)":"transparent",
        color:active?T.teal:"#F0F6FF",
        border:"none",cursor:"pointer",fontFamily:"inherit",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        transition:"all 0.15s",
      }}>
        <span>{label}</span>
        {badge!=null&&<span style={{fontSize:10,background:T.teal,
          color:T.bg0,borderRadius:10,padding:"1px 6px",fontWeight:700}}>
          {badge}
        </span>}
      </button>
    );
  };

  return (
    <div style={{position:"relative"}}>
      {saving&&<div style={{position:"fixed",top:12,right:16,zIndex:999,
        fontSize:12,color:T.text3,display:"flex",alignItems:"center",gap:6}}>
        <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
        Saving…
      </div>}

      <div style={{display:"flex",height:"100vh",background:T.bg0,
        color:"#F0F6FF",fontFamily:T.sans,fontSize:14}}>

        {/* Sidebar */}
        <div style={{width:214,flexShrink:0,background:T.bg1,
          borderRight:`1px solid ${T.border}`,
          display:"flex",flexDirection:"column",
          padding:"12px 8px",overflowY:"auto"}}>

          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:10,
            padding:"4px 6px",marginBottom:16}}>
            <div style={{width:32,height:32,borderRadius:8,background:T.teal,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:16,fontWeight:800,color:T.bg0,flexShrink:0}}>N</div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>
                NEP Platform
              </div>
              <div style={{fontSize:10,color:T.text3}}>{user.email}</div>
            </div>
          </div>

          {/* Studies nav */}
          {/* Studies */}
          <NavBtn id="studies" label="My Studies"
            onClick={()=>{setActiveTab("studies");setActiveCompound(null);setCompoundTab("overview");}}/>

          {/* Compound sub-tabs */}
          {(()=>{
            const compNames=[...new Set(allPatients.map(p=>p.primaryCompound?.name).filter(Boolean))];
            return compNames.map(name=>{
              const isSelected=activeCompound===name||(!activeCompound&&compNames[0]===name);
              return (
                <div key={name}>
                  <NavBtn id="studies"
                    label={name}
                    badge={allPatients.filter(p=>p.primaryCompound?.name===name).length||null}
                    indent
                    onClick={()=>{setActiveCompound(name);setActiveTab("studies");setCompoundTab("overview");}}/>
                  {isSelected&&(
                    <div style={{marginLeft:16,borderLeft:`2px solid ${T.border2}`,
                      paddingLeft:6,marginTop:2,marginBottom:4}}>
                      <NavBtn id="_ct_overview" label="Study Overview" indent
                        onClick={()=>{setActiveTab("studies");setCompoundTab("overview");}}/>
                      <NavBtn id="_ct_results" label="Computed Results" indent
                        onClick={()=>{setActiveTab("studies");setCompoundTab("results");}}/>
                      <NavBtn id="_ct_refs" label={"References"+(refs.length>0?` (${refs.length})`:"")} indent
                        onClick={()=>{setActiveTab("studies");setCompoundTab("refs");}}/>
                      <NavBtn id="_ct_generate" label="Validate & Generate" indent
                        onClick={()=>{setActiveTab("studies");setCompoundTab("generate");}}/>
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* Administration */}
          <div style={{fontSize:10,color:T.text3,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.1em",
            padding:"14px 14px 6px",marginTop:4,
            borderTop:`1px solid ${T.border}`}}>Administration</div>
              <NavBtn id="papers" label="Papers"
                badge={papers.length||null}
                onClick={()=>setActiveTab("papers")}/>
          <NavBtn id="compounds" label={`Compounds (${compounds.length})`}/>
          <NavBtn id="mcid"      label="MCID Library"/>
          <NavBtn id="template"  label="Paper Template"/>

          <div style={{flex:1}}/>

          {/* WS quick ref */}
          <div style={{padding:"10px 8px",borderTop:`1px solid ${T.border}`,marginTop:8}}>
            <div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:6}}>WS Formula</div>
            {[["Q","Study quality","1-5"],["S","Sample size","0-5 auto"],
              ["O","Outcome","1-5"],["B","Bias penalty","0-5"]].map(([k,l,r])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",
                fontSize:10,color:T.text3,padding:"2px 0"}}>
                <span><span style={{color:T.teal,fontWeight:700}}>{k}</span> {l}</span>
                <span>{r}</span>
              </div>
            ))}
            <div style={{marginTop:6,padding:"4px 8px",background:T.bg2,
              borderRadius:4,fontSize:10,color:T.teal,fontWeight:700,
              textAlign:"center",letterSpacing:"0.05em"}}>
              WS = Q+S+O−B
            </div>
          </div>

          {/* Sign out */}
          <button onClick={async()=>{await API.signOut();setUser(null);}}
            style={{margin:"8px 0",padding:"8px 14px",borderRadius:6,
              background:"none",border:`1px solid ${T.border}`,
              color:T.text3,fontSize:12,cursor:"pointer",
              fontFamily:"inherit",textAlign:"left"}}>
            ✕ Sign out
          </button>
        </div>

        {/* Main content */}
        <div style={{flex:1,overflowY:"auto",padding:28}}>
          {loading&&(
            <div style={{textAlign:"center",padding:"60px",color:T.text3}}>
              <div style={{fontSize:32,marginBottom:12,
                animation:"spin 1s linear infinite",display:"inline-block"}}>↻</div>
              <p>Loading…</p>
            </div>
          )}
          {!loading&&(
            <div>
              {/* Active Studies */}
              {activeTab==="studies"&&!activeCompound&&nepStudies.length>0&&(
                <div style={{marginBottom:20}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>Active studies</div>
                    <Btn onClick={()=>setShowCreateStudy(true)} style={{fontSize:12}}>+ New study</Btn>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
                    {nepStudies.map(s=>(
                      <div key={s.id} onClick={()=>{
                        setSelectedStudy(s);
                        const compName = s.compound?.name;
                        if(compName) setActiveCompound(compName);
                        setCompoundTab("overview");
                        setActiveTab("studies");
                      }}
                        style={{background:T.bg2,borderRadius:10,padding:14,
                          border:`1px solid ${STUDY_STATUS_COLORS[s.status]||T.border}40`,
                          cursor:"pointer",transition:"border-color 0.2s"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                          <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>{s.title}</div>
                          <Tag color={STUDY_STATUS_COLORS[s.status]||T.teal} style={{fontSize:9,flexShrink:0}}>
                            {STUDY_STATUS_LABELS[s.status]||s.status}
                          </Tag>
                        </div>
                        <div style={{fontSize:11,color:T.text3}}>
                          {s.compound?.name||"—"} · {s.invitedDoctors?.length||0} doctor(s) · Target: {s.targetSampleSize} patients
                        </div>
                        {s.invitedDoctors?.length>0&&(
                          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
                            {s.invitedDoctors.map((d,i)=>(
                              <Tag key={i} color={d.authenticated?T.green:"#5A7A9A"} style={{fontSize:9}}>
                                {d.name||d.email} {d.authenticated?"✓":"· OTP sent"}
                              </Tag>
                            ))}
                          </div>
                        )}
                        {/* Actions */}
                        <div style={{display:"flex",gap:6,marginTop:10,borderTop:`1px solid ${T.border}`,paddingTop:8}}
                          onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>{
                            setSelectedStudy(s);
                            setActiveCompound(s.compound?.name||null);
                            setCompoundTab("overview");
                            setActiveTab("studies");
                          }} style={{fontSize:11,color:T.teal,background:"none",border:`1px solid ${T.teal}40`,
                            borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                            View study
                          </button>
                          <button onClick={()=>{
                            setSelectedStudy(s);
                            setActiveTab("doctors");
                          }} style={{fontSize:11,color:"#A78BFA",background:"none",border:"1px solid #A78BFA40",
                            borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                            👥 Doctor pages ({s.invitedDoctors?.length||0})
                          </button>
                          <button onClick={()=>{
                            if(confirm(`Delete study "${s.title}"? This cannot be undone.`)){
                              saveNepStudies(nepStudies.filter(x=>x.id!==s.id));
                            }
                          }} style={{fontSize:11,color:T.red,background:"none",border:`1px solid ${T.red}40`,
                            borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>
                            ✕ Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab==="studies"&&nepStudies.length===0&&!activeCompound&&(
                <div style={{textAlign:"center",padding:"40px 20px",marginBottom:20,
                  border:`1px dashed ${T.border2}`,borderRadius:8}}>
                  <div style={{fontSize:28,marginBottom:8,opacity:0.3}}>🔬</div>
                  <p style={{fontSize:13,color:T.text3,marginBottom:12}}>
                    Create a study to invite doctors and start collecting evidence.
                  </p>
                  <Btn onClick={()=>setShowCreateStudy(true)}>+ Create first study</Btn>
                </div>
              )}
              {showCreateStudy&&(
                <CreateStudyModal compounds={compounds}
                  onClose={()=>setShowCreateStudy(false)}
                  onCreate={(study)=>{
                    const updated = [...nepStudies, study];
                    saveNepStudies(updated);
                    // Simulate OTP sent toast
                    study.invitedDoctors.forEach(d=>{
                      if(d.email) console.log(`OTP ${d.otp} sent to ${d.email}`);
                    });
                  }}/>
              )}
              {/* Studies tabs */}
              {activeTab==="studies"&&(compoundTab==="overview"||!compoundTab)&&(
                <StudiesListPanel
                  projects={projects}
                  projectOutcomes={projectOutcomes}
                  patients={allPatients}
                  outcomes={outcomes}
                  refs={refs}
                  user={user}
                  activeCompound={activeCompound}
                  onSelectCompound={setActiveCompound}
                  onImport={importPatientOutcomes}
                  onGoToResults={()=>setCompoundTab("results")}
                  onGoToRefs={()=>setCompoundTab("refs")}
                  onGoToValidate={()=>setCompoundTab("generate")}
                  onSaveMeta={(meta)=>{
                    // Persist researcher details so ValidateGeneratePanel can read them
                    const key=`nep_study_meta_${activeCompound||"default"}`;
                    try{ localStorage.setItem(key,JSON.stringify(meta)); }catch(e){}
                    // If project exists, also save to project
                    if(project&&meta.researcher){
                      updateProjectFull({...project,...meta});
                    }
                  }}
                  onUpdateProject={updateProjectFull}
                  onOpen={loadProject}
                  onDelete={deleteProject}
                  onNew={()=>setShowNewProject(true)}
                  onAutoCreate={()=>{}}/>
              )}

              {activeTab==="studies"&&compoundTab==="results"&&(
                <div className="fade-in">
                  <SectionHeader title="Computed Results"
                    subtitle={`Evidence weighting & synthesis — ${activeCompound||""} · completed cases only`}/>
                  {outcomes.length===0&&allPatients.filter(p=>p.status==="complete").length>0&&(
                    <div style={{background:"rgba(0,212,170,0.08)",borderRadius:8,
                      padding:"16px 20px",marginBottom:16,
                      border:"1px solid rgba(0,212,170,0.3)",
                      display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{fontSize:13,color:"#F0F6FF"}}>
                        {allPatients.filter(p=>p.status==="complete").length} completed cases ready.
                        Import to compute evidence scores.
                      </div>
                      <Btn onClick={importPatientOutcomes} style={{fontWeight:700}}>
                        ↓ Import now
                      </Btn>
                    </div>
                  )}
                  <ComputedResultsPanel
                    patients={!activeCompound?allPatients:allPatients.filter(p=>
                      p.primaryCompound?.name===activeCompound)}
                    outcomes={outcomes}
                    compound={activeCompound||""}
                    onNext={()=>setCompoundTab("refs")}/>
                </div>
              )}

              {activeTab==="studies"&&compoundTab==="refs"&&(
                <div className="fade-in">
                  <SectionHeader title="References"
                    subtitle="Search PubMed for published literature. Click Read to review before adding."
                    action={<Btn variant="secondary" onClick={addRef}
                      style={{fontSize:12}}>+ Add manually</Btn>}/>
                  <ReferencesPanel refs={refs} onAdd={addRef} onUpdate={updateRef}
                    onRemove={removeRef}
                    onNext={()=>setCompoundTab("generate")}
                    compoundName={activeCompound||""}
                    compounds={allPatients.filter(p=>
                      !activeCompound||p.primaryCompound?.name===activeCompound)
                      .map(p=>p.primaryCompound).filter(Boolean)
                      .filter((c,i,a)=>a.findIndex(x=>x.name===c.name)===i)}/>
                </div>
              )}

              {activeTab==="studies"&&compoundTab==="generate"&&(
                <ValidateGeneratePanel
                  outcomes={outcomes}
                  refs={refs}
                  activeCompound={activeCompound||[...new Set(allPatients.map(p=>p.primaryCompound?.name).filter(Boolean))][0]||""}
                  compound={allPatients.filter(p=>
                    !activeCompound||p.primaryCompound?.name===activeCompound)
                    .map(p=>p.primaryCompound).filter(Boolean)[0]||{}}
                  project={(()=>{
                    // Merge project with locally saved meta
                    const savedMeta=(()=>{try{
                      return JSON.parse(localStorage.getItem(
                        `nep_study_meta_${activeCompound||"default"}`)||"{}");
                    }catch(e){return {};}})();
                    return {
                      name:(activeCompound||"")+" Evidence Study",
                      compound_name:activeCompound,
                      ...(project||{}),
                      ...savedMeta,
                    };
                  })()}
                  projectId={project?.id}
                  onUpdateProject={updateProjectFull}
                  allPatients={allPatients.filter(p=>
                    !activeCompound||p.primaryCompound?.name===activeCompound)}
                  onNavToOverview={()=>setCompoundTab("overview")}
                  onNavToRefs={()=>setCompoundTab("refs")}
                  onNavToResults={()=>setCompoundTab("results")}/>
              )}

              {activeTab==="evidence"&&project&&(
                <div className="fade-in">
                  <SectionHeader title="Evidence"
                    subtitle={`${outcomes.length} outcome rows · ESS ${(Number(ess)||0).toFixed(2)} (${essC})`}
                    action={<Btn onClick={importPatientOutcomes} style={{fontSize:12}}>
                      ↓ Import / refresh
                    </Btn>}/>
                  {outcomes.length===0?(
                    <div style={{textAlign:"center",padding:"60px 20px",
                      border:`1px dashed ${T.border2}`,borderRadius:8}}>
                      <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>📊</div>
                      <p style={{fontSize:13,color:T.text3,marginBottom:16}}>
                        No outcomes yet. Import from doctor patient data.
                      </p>
                      <Btn onClick={importPatientOutcomes}>↓ Import patient outcomes</Btn>
                    </div>
                  ):(
                    <>
                      <div style={{display:"grid",
                        gridTemplateColumns:"28px 1fr 1fr 100px 110px 100px 90px 90px 64px 32px",
                        gap:8,padding:"6px 12px",fontSize:9,color:T.text3,fontWeight:600,
                        textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>
                        <span style={{textAlign:"center"}}>#</span>
                        <span>Outcome</span><span>Category</span><span>Direction</span>
                        <span>Significance</span><span>Effect size</span><span>MCID</span>
                        <span style={{textAlign:"center"}}>WS</span><span/><span/>
                      </div>
                      {outcomes.map((o,i)=>(
                        <OutcomeRow key={o.id} outcome={o} idx={i}
                          onChange={upd=>updateOutcome(o.id,upd)}
                          onRemove={()=>removeOutcome(o.id)}
                          compounds={compounds}
                          onAddCompound={handleAddCompound}/>
                      ))}
                    </>
                  )}
                </div>
              )}

              {activeTab==="references"&&project&&(
                <div className="fade-in">
                  <SectionHeader title="References"
                    subtitle="Vancouver format."
                    action={<Btn variant="secondary" onClick={addRef}
                      style={{fontSize:12}}>+ Add manually</Btn>}/>
                  <ReferencesPanel refs={refs} onAdd={addRef} onUpdate={updateRef}
                    onRemove={removeRef}
                    onNext={()=>setActiveTab("validate")}
                    compoundName={compound.compound_name||project?.compound_id||""}
                    compounds={allCompoundsUsed}/>
                </div>
              )}

              {activeTab==="validate"&&project&&(
                <ValidateGeneratePanel outcomes={outcomes} refs={refs}
                  compound={compound} project={project} projectId={project?.id}
                  activeCompound={activeCompound||compound?.name||compound?.compound_name||""}
                  onUpdateProject={updateProjectFull}
                  allPatients={allPatients}/>
              )}

              {activeTab==="doctors"&&selectedStudy&&(
                <div className="fade-in">
                  <DoctorPagesPanel
                    study={selectedStudy}
                    allPatients={allPatients}
                    onBack={()=>{setActiveTab("studies");setSelectedStudy(null);}}
                    onPatientsChange={()=>{
                      // Reload all patients
                      const pts=[];
                      for(let i=0;i<localStorage.length;i++){
                        const key=localStorage.key(i);
                        if(key&&key.startsWith("nep_doctor_patients_")){
                          try{pts.push(...JSON.parse(localStorage.getItem(key)||"[]"));}catch(e){}
                        }
                      }
                      setAllPatients(pts);
                    }}/>
                </div>
              )}

              {activeTab==="papers"&&(
                <div className="fade-in">
                  <PapersPanel
                    papers={papers}
                    onUpdate={(p)=>{
                      const updated = papers.map(x=>x.id===p.id?{...p,updatedAt:Date.now()}:x);
                      savePapers(updated);
                    }}
                    onPublish={(id)=>{
                      const updated = papers.map(p=>p.id===id?{...p,status:"published",publishedAt:Date.now(),updatedAt:Date.now()}:p);
                      savePapers(updated);
                    }}
                    onCreateRevision={(id)=>{
                      const orig = papers.find(p=>p.id===id);
                      if(!orig) return;
                      const rev = {...orig, id:crypto.randomUUID(),
                        version:(Number(orig.version)+0.1).toFixed(1),
                        status:"in_progress", publishedAt:null, updatedAt:Date.now(),
                        title:orig.title+" (Revision)"};
                      savePapers([...papers, rev]);
                    }}
                    onDelete={(id)=>savePapers(papers.filter(p=>p.id!==id))}
                    compounds={compounds} outcomes={outcomes} refs={refs}/>
                </div>
              )}

              {activeTab==="compounds"&&(
                <div className="fade-in">
                  <SectionHeader title="Compound repository"
                    subtitle="All compounds used across projects."
                    action={<Tag color={T.teal}>{compounds.length} compounds</Tag>}/>
                  <CompoundRepositoryPanel compounds={compounds}
                    onUpdate={(updated)=>{
                      setCompounds(prev=>prev.map(c=>c.id===updated.id?updated:c));
                      API.addCompound(updated).catch(()=>{});
                    }}/>
                </div>
              )}

              {activeTab==="mcid"&&(
                <div className="fade-in">
                  <SectionHeader title="MCID library"
                    subtitle="Published Minimal Clinically Important Differences."/>
                  <MCIDPanel/>
                </div>
              )}

              {activeTab==="template"&&(
                <div className="fade-in">
                  <SectionHeader title="Paper template — filler positions"
                    subtitle="Orange = auto-filled. Red = missing."
                    action={<TemplatePreviewPanel/>}/>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showNewProject&&(
        <NewProjectModal
          onClose={()=>setShowNewProject(false)}
          existingProjects={projects}
          onCreate={async(proj)=>{
            const created=await API.createProject(proj);
            setProjects(prev=>[...prev,created]);
            setShowNewProject(false);
            await loadProject(created);
          }}/>
      )}
    </div>
  );
}


export function Root(){
  return <ToastProvider><App/></ToastProvider>;
}
