// NEP Platform v5.26-backup — Doctor Mobile App — 2026-03-27
import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from "react";
/* ─── DESIGN TOKENS ──────────────────────────────────────────────────── */
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
        <span style={{fontSize:11,color:T.text2}}>Bias quality:</span>
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
  const [mode,setMode]=useState("signin");
  const [form,setForm]=useState({email:"",password:"",name:""});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const submit=async()=>{
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
      <div style={{width:400,padding:"40px 36px",background:T.bg2,border:`1px solid ${T.border}`,
        borderRadius:14,boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:32}}>
          <div style={{width:36,height:36,borderRadius:8,background:T.teal,display:"flex",
            alignItems:"center",justifyContent:"center"}}>
            <span style={{color:T.bg0,fontSize:18,fontWeight:700,fontFamily:T.mono}}>N</span>
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:T.text0}}>NEP Platform</div>
            <div style={{fontSize:11,color:T.text3}}>Nutraceutical Evidence Platform v5.0</div>
          </div>
        </div>
        <h1 style={{fontSize:22,fontWeight:600,color:T.text0,marginBottom:6}}>
          {mode==="signin"?"Sign in":"Create account"}
        </h1>
        <p style={{fontSize:12,color:T.text3,marginBottom:24}}>
          {mode==="signin"?"Enter your credentials to continue.":"Start your free 14-day trial. No credit card required."}
        </p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="signup"&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <FieldLabel label="Full name" required/>
                <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                  placeholder="Dr. Jane Smith" autoFocus/>
              </div>
              <div>
                <FieldLabel label="I am a…" required/>
                <div style={{display:"flex",gap:8}}>
                  {[
                    {id:"researcher",label:"🔬 Researcher",desc:"Platform access"},
                    {id:"doctor",    label:"👤 Doctor",    desc:"Mobile + patients"},
                  ].map(r=>(
                    <button key={r.id}
                      onClick={()=>setForm(p=>({...p,role:r.id}))}
                      style={{flex:1,padding:"10px 8px",borderRadius:8,
                        cursor:"pointer",fontFamily:"inherit",textAlign:"center",
                        background:(form.role||"researcher")===r.id?T.teal:T.bg3,
                        color:(form.role||"researcher")===r.id?T.bg0:"#F0F6FF",
                        border:`1px solid ${(form.role||"researcher")===r.id?T.teal:T.border}`,
                        fontWeight:(form.role||"researcher")===r.id?700:400}}>
                      <div style={{fontSize:13}}>{r.label}</div>
                      <div style={{fontSize:10,opacity:0.8,marginTop:2}}>{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div>
            <FieldLabel label="Email" required/>
            <input type="email" value={form.email}
              onChange={e=>setForm(p=>({...p,email:e.target.value}))}
              placeholder="researcher@institution.edu" autoFocus={mode==="signin"}
              onKeyDown={e=>e.key==="Enter"&&submit()}/>
          </div>
          <div>
            <FieldLabel label="Password" required/>
            <input type="password" value={form.password}
              onChange={e=>setForm(p=>({...p,password:e.target.value}))}
              placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()}/>
          </div>
        </div>
        {error&&<div style={{marginTop:12,padding:"8px 12px",background:T.redBg,
          borderRadius:6,fontSize:12,color:T.red}}>{error}</div>}
        <Btn onClick={submit} disabled={loading}
          style={{width:"100%",justifyContent:"center",marginTop:20,padding:"10px",fontSize:14,fontWeight:600}}>
          {loading?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
            :mode==="signin"?"Sign in →":"Create account →"}
        </Btn>
        <div style={{marginTop:16,textAlign:"center",fontSize:12,color:T.text3}}>
          {mode==="signin"?"No account?":"Already have an account?"}{" "}
          <button onClick={()=>{setMode(mode==="signin"?"signup":"signin");setError("");}}
            style={{background:"none",border:"none",color:T.teal,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>
            {mode==="signin"?"Sign up free":"Sign in"}
          </button>
        </div>
        {mode==="signin"&&(
          <div style={{marginTop:24,padding:12,background:T.bg3,borderRadius:8,
            border:`1px solid ${T.border}`,textAlign:"center"}}>
            <div style={{fontSize:11,color:T.text3,marginBottom:6}}>Demo credentials</div>
            <button onClick={()=>setForm({email:"demo@nep.science",password:"demo123",name:""})}
              style={{background:"none",border:"none",cursor:"pointer",fontFamily:T.mono,fontSize:11,color:T.teal}}>
              demo@nep.science / demo123
            </button>
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
  {id:"HER-ASH-001",name:"Ashwagandha",scientific:"Withania somnifera",category:"Herb",shortCode:"ASH",
   extract_form:"Root extract",standardisation:"5% withanolides",dose_range:"300-600mg/day",duration_range:"8-12 weeks",notes:"Adaptogen/Rasayana",
   refs:[
     {ref_id:"REF-ASH-001",authors:"Chandrasekhar K et al.",year:"2012",title:"A prospective, randomized double-blind, placebo-controlled study of safety and efficacy of a high-concentration full-spectrum extract of Ashwagandha root",journal:"Indian J Psychol Med",volume:"34",issue:"3",pages:"255-262",doi:"10.4103/0253-7176.106022"},
     {ref_id:"REF-ASH-002",authors:"Langade D et al.",year:"2019",title:"Efficacy and safety of Ashwagandha root extract in insomnia and anxiety",journal:"Cureus",volume:"11",issue:"9",pages:"e5797",doi:"10.7759/cureus.5797"},
     {ref_id:"REF-ASH-003",authors:"Pratte MA et al.",year:"2022",title:"A systematic review and meta-analysis on the effects of Ashwagandha on anxiety and stress",journal:"J Ethnopharmacol",volume:"295",pages:"115271",doi:"10.1016/j.jep.2021.114539"},
   ]},
  {id:"HER-CUR-001",name:"Curcumin",scientific:"Curcuma longa",category:"Herb",shortCode:"CUR",
   extract_form:"Rhizome extract",standardisation:"95% curcuminoids",dose_range:"500-1000mg/day",duration_range:"8-16 weeks",notes:"Anti-inflammatory/antioxidant",
   refs:[
     {ref_id:"REF-CUR-001",authors:"Hewlings SJ, Kalman DS",year:"2017",title:"Curcumin: A Review of Its Effects on Human Health",journal:"Foods",volume:"6",issue:"10",pages:"92",doi:"10.3390/foods6100092"},
     {ref_id:"REF-CUR-002",authors:"Sahebkar A et al.",year:"2016",title:"Effect of curcuminoids on oxidative stress: A systematic review and meta-analysis",journal:"J Funct Foods",volume:"18",pages:"898-909",doi:"10.1016/j.jff.2015.01.005"},
   ]},
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
              <div style={{fontSize:11,color:T.text2}}>{c.extract_form||"—"}</div>
              <div style={{fontSize:11,color:T.text2}}>{c.dose_range||"—"}</div>
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
              <div style={{fontSize:13,fontFamily:T.mono,color:T.text2}}>
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
const ReferencesPanel = ({ refs, onAdd, onUpdate, onRemove, compoundName, compounds=[] }) => {
  const [searching,     setSearching]     = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch,    setShowSearch]    = useState(false);
  const [autoLoaded,    setAutoLoaded]    = useState(false);

  const primaryCompound   = compounds[0]?.name       || compoundName || "";
  const primaryScientific = compounds[0]?.scientific || "";

  const [searchQuery, setSearchQuery] = useState(
    primaryCompound ? `"${primaryCompound}" clinical trial` : ""
  );

  // Auto-load when panel opens if compounds exist and refs are empty
  useEffect(()=>{
    if(compounds.length>0 && refs.length===0 && !autoLoaded && !searching){
      setAutoLoaded(true);
      setSearching(true);
      setShowSearch(true);
      autoFetchReferences(compounds)
        .then(results=>{
          if(results.length){
            // Auto-add all found refs directly to the list
            results.forEach(r => {
              const ref = {
                id: crypto.randomUUID(),
                ref_id: r.ref_id||`REF-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
                study_ref_id:"", compound_id:"",
                title:r.title||"", authors:r.authors||"",
                year:r.year||"", journal:r.journal||"",
                doi:r.doi||"", volume:r.volume||"",
                issue:r.issue||"", pages:r.pages||"",
                bias_tool:"", bias_overall:"",
                _source:r._source, _url:r._url,
              };
              onAdd(ref);
            });
            setShowSearch(false);
          } else {
            setSearchResults([{_empty:true}]);
            setShowSearch(true);
          }
          setSearching(false);
        })
        .catch(()=>{ setSearching(false); setSearchResults([{_error:"Auto-search failed — add manually below"}]); setShowSearch(true); });
    }
    if(primaryCompound && !searchQuery){
      setSearchQuery(`"${primaryCompound}" clinical trial`);
    }
  },[compounds.length]);

  const handleSearch = async () => {
    const q = searchQuery.trim() || (primaryCompound ? `"${primaryCompound}" clinical trial` : "");
    if(!q){ alert("Add a compound to Evidence first, then search."); return; }
    setSearching(true);
    setShowSearch(true);
    setSearchResults([]);
    try {
      const results = await searchReferences(q, 10);
      setSearchResults(results.length ? results : [{_empty:true}]);
    } catch(e) {
      setSearchResults([{_error:e.message}]);
    }
    setSearching(false);
  };

  const addToRefs = (r) => {
    const ref = {
      id: crypto.randomUUID(),
      ref_id: r.ref_id||`REF-${Date.now()}`,
      study_ref_id:"", compound_id:"",
      title:r.title||"", authors:r.authors||"",
      year:r.year||"", journal:r.journal||"",
      doi:r.doi||"", volume:r.volume||"",
      issue:r.issue||"", pages:r.pages||"",
      bias_tool:"", bias_overall:"",
      _source:r._source, _url:r._url,
    };
    onAdd(ref);
  };

  const quickSearches = [
    ...compounds.slice(0,2).map(c=>`"${c.name}" clinical trial`),
    ...compounds.filter(c=>c.scientific).slice(0,1).map(c=>`"${c.scientific}" randomized`),
    compounds.length>1
      ? `${compounds.map(c=>c.name).join(" ")} combination`
      : primaryCompound ? `"${primaryCompound}" systematic review` : null,
    primaryCompound ? `"${primaryCompound}" safety adverse effects` : null,
  ].filter(Boolean).slice(0,5);

  return (
    <div>
      {/* Search bar */}
      <div style={{background:T.bg3,borderRadius:8,padding:16,
        marginBottom:16,border:`1px solid ${T.border}`}}>

        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",marginBottom:8}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF",marginBottom:2}}>
              Search published papers
            </div>
            <div style={{fontSize:11,color:T.text3}}>
              {compounds.length>0
                ? <span>Searching for: <span style={{color:T.teal}}>
                    {compounds.map(c=>c.scientific?`${c.name} (${c.scientific})`:c.name).join(" + ")}
                  </span></span>
                : "Add compounds in Evidence tab to enable auto-search"
              }
            </div>
          </div>
          {refs.length===0&&compounds.length>0&&!autoLoaded&&(
            <Btn variant="secondary" onClick={()=>{
              setAutoLoaded(true);
              setSearching(true);setShowSearch(true);
              autoFetchReferences(compounds)
                .then(r=>{setSearchResults(r.length?r:[{_empty:true}]);setSearching(false);})
                .catch(()=>setSearching(false));
            }} style={{fontSize:11,flexShrink:0}}>
              ↻ Auto-load references
            </Btn>
          )}
        </div>

        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <input value={searchQuery}
            onChange={e=>setSearchQuery(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleSearch()}
            placeholder={primaryCompound
              ? `e.g. "${primaryCompound}" clinical trial`
              : "e.g. Ashwagandha anxiety RCT"}
            style={{flex:1,fontSize:13}}/>
          <Btn onClick={handleSearch} disabled={searching}
            variant="secondary" style={{fontSize:12,flexShrink:0}}>
            {searching
              ? <><span style={{animation:"spin 1s linear infinite",
                  display:"inline-block"}}>↻</span> Searching…</>
              : "🔍 Search"}
          </Btn>
        </div>

        {quickSearches.length>0&&(
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:10,color:T.text3,flexShrink:0}}>Quick:</span>
            {quickSearches.map(q=>(
              <button key={q}
                onClick={()=>{setSearchQuery(q);}}
                style={{fontSize:10,color:T.teal,background:"none",
                  border:`1px solid ${T.teal}30`,borderRadius:4,
                  padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {showSearch&&(
          <div style={{marginTop:12}}>
            {searching&&(
              <div style={{display:"flex",alignItems:"center",gap:8,
                fontSize:12,color:T.text3,padding:"8px 0"}}>
                <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
                Searching PubMed and Europe PMC…
              </div>
            )}
            {!searching&&searchResults[0]?._empty&&(
              <div style={{fontSize:12,color:T.amber,padding:"8px 0"}}>
                No results found. Try the scientific name
                {primaryScientific?` "${primaryScientific}"`:""} or a broader term.
              </div>
            )}
            {!searching&&searchResults[0]?._error&&(
              <div style={{fontSize:12,color:T.red,padding:"8px 0"}}>
                ⚠ Search unavailable — network or proxy issue. Add references manually below.
              </div>
            )}
            {!searching&&searchResults.filter(r=>!r._empty&&!r._error).map((r,i)=>{
              const alreadyAdded = refs.some(x=>(x.doi&&x.doi===r.doi)||(x.title&&x.title===r.title));
              return (
                <div key={i} style={{display:"flex",gap:8,
                  padding:"8px 10px",borderRadius:6,marginBottom:4,
                  background:alreadyAdded?T.greenBg:T.bg2,
                  border:`1px solid ${alreadyAdded?T.green:T.border}`,
                  alignItems:"flex-start"}}>
                  <button onClick={()=>!alreadyAdded&&addToRefs(r)}
                    style={{background:alreadyAdded?"none":T.teal,
                      border:"none",borderRadius:4,
                      color:alreadyAdded?T.green:T.bg0,
                      width:22,height:22,cursor:alreadyAdded?"default":"pointer",
                      fontSize:14,fontWeight:700,flexShrink:0,marginTop:1,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {alreadyAdded?"✓":"+"}
                  </button>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#F0F6FF",
                      marginBottom:2,lineHeight:1.3}}>{r.title}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                      {r._source&&(
                        <Tag color={r._source==="PubMed"?T.blue:T.teal}
                          style={{fontSize:9}}>{r._source}</Tag>
                      )}
                      <span style={{fontSize:10,color:T.text3}}>
                        {r.authors} · {r.journal} · {r.year}
                      </span>
                      {r.doi&&(
                        <a href={`https://doi.org/${r.doi}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{fontSize:10,color:T.teal,textDecoration:"none"}}
                          onClick={e=>e.stopPropagation()}>
                          doi ↗
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
        alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>
          References ({refs.length})
        </div>
        <Btn onClick={()=>onAdd(null)} variant="secondary" style={{fontSize:12}}>
          + Add manually
        </Btn>
      </div>

      {refs.length===0 ? (
        <div style={{textAlign:"center",padding:"40px 20px",
          border:`1px dashed ${T.border2}`,borderRadius:8,color:T.text3}}>
          <div style={{fontSize:24,marginBottom:8,opacity:0.3}}>📚</div>
          <p style={{fontSize:13}}>
            {compounds.length>0
              ? "Auto-searching for references… or search above."
              : "Add compounds in Evidence first, then references will auto-suggest."}
          </p>
        </div>
      ) : refs.map((ref,i)=>(
        <div key={ref.id} style={{background:T.bg2,borderRadius:8,
          padding:"12px 14px",marginBottom:8,border:`1px solid ${T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"flex-start",marginBottom:8}}>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:11,color:T.text3,fontFamily:T.mono}}>[{i+1}]</span>
              {ref._source&&(
                <Tag color={ref._source==="PubMed"?T.blue:T.teal}
                  style={{fontSize:9}}>{ref._source}</Tag>
              )}
              {ref._url&&(
                <a href={ref._url} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:10,color:T.teal,textDecoration:"none"}}>↗ View</a>
              )}
            </div>
            <button onClick={()=>onRemove(ref.id)}
              style={{background:"none",border:"none",color:T.text3,
                cursor:"pointer",fontSize:14,padding:2}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {[["Authors","authors"],["Year","year"],["Title","title"],
              ["Journal","journal"],["Volume","volume"],["Issue","issue"],
              ["Pages","pages"],["DOI","doi"],
            ].map(([lbl,fld])=>(
              <div key={fld} style={fld==="title"||fld==="doi"?{gridColumn:"1/-1"}:{}}>
                <div style={{fontSize:9,color:T.text3,fontWeight:700,
                  textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>
                  {lbl}
                </div>
                <input value={ref[fld]||""}
                  onChange={e=>onUpdate(ref.id,fld,e.target.value)}
                  style={{fontSize:12,padding:"4px 8px"}}/>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};


/* ─── TEMPLATE PREVIEW PANEL ────────────────────────────────────────── */
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
          <span style={{fontSize:12,color:T.text2}}>
            Filled from Project Settings or Evidence Input
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontFamily:T.mono,fontSize:11,color:T.green,
            background:T.greenBg,padding:"1px 6px",borderRadius:3}}>
            [TAG]
          </span>
          <span style={{fontSize:12,color:T.text2}}>
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
  return `<w:tc><w:tcPr>${width}<w:tcBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/></w:tcBorders>${bg}</w:tcPr><w:p><w:pPr>${align}<w:spacing w:after="60"/></w:pPr><w:r><w:rPr>${o.header?"<w:b/>":""}<w:sz w:val="${o.sz||20}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`;
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

  const authLine = project?.authors_paper || [project?.researcher, project?.co_authors].filter(Boolean).join("  \u00b7  ");
  if(authLine) body += _p(authLine, {sz:22,col:"333333",center:true,sa:40});
  if(project?.affiliation) body += _p(project.affiliation, {sz:20,col:"555555",center:true,sa:20});

  const metaLine = [
    project?.target_journal ? `Target journal: ${esc(project.target_journal)}` : "",
    `Submission date: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}`,
    "NEP Platform v5.0",
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
    {sz:20,sa:80}
  );
  body += _p(
    `Objective: To systematically evaluate the available evidence for standardised ${esc(compName)} ` +
    `supplementation${compDose?` (${esc(compDose)})`:""}${compDur?` over ${esc(compDur)}`:""} ` +
    `across ${outcomes.length} outcome${outcomes.length!==1?"s":""} using the NEP Weighted Scoring Framework v5.0.`,
    {sz:20,sa:60}
  );
  body += _p(
    `Methods: A structured evidence synthesis was conducted across ${studies.length||1} study design${(studies.length||1)!==1?"s":""} ` +
    `(${totalParts>0?`${totalParts} participants; `:""}${outcomes.length} outcomes) ` +
    `spanning ${[...new Set(outcomes.map(o=>o.study_type).filter(Boolean))].join(", ")||"mixed"} designs. ` +
    `Each outcome was independently scored on four parameters: Study Quality (Q, 1\u20135), ` +
    `Sample Adequacy (S, 0\u20135), Outcome Relevance (O, 1\u20135), and Bias Penalty (B, 0\u20135). ` +
    `Weighted Score (WS) = Q + S + O \u2212 B. Evidence Strength Score (ESS) = mean(WS > 0).`,
    {sz:20,sa:60}
  );
  body += _p(
    `Results: ESS = ${(Number(ess)||0).toFixed(2)}/15.0 (${essC}). ` +
    `Outcome consistency: ${(Number(cons)*100).toFixed(0)}% (${consC}). ` +
    `${nSig}/${outcomes.length} outcomes statistically significant. ` +
    `${nMcid}/${outcomes.length} outcomes exceeded clinically important difference thresholds (${clinC}). ` +
    (topOutcome?`Strongest outcome: ${esc(topOutcome.outcome_name||"")} (WS = ${topOutcome._ws?.toFixed?.(1)||topOutcome._ws||"\u2014"}). `:"") +
    `Estimated GRADE certainty: ${grade}.`,
    {sz:20,sa:60}
  );
  body += _p(
    `Conclusions: ${esc(compName)}${compExtract?` (${esc(compExtract)})`:""}` +
    ` demonstrates ${essC.toLowerCase()} overall evidence strength and ${consC.toLowerCase()} outcome consistency, ` +
    `with estimated GRADE certainty of ${grade}. ` +
    `Findings support consideration as an evidence-based adjunct, conditional on standardised ` +
    `${compExtract||"formulations"} and replication in larger, adequately powered trials.`,
    {sz:20,sa:60}
  );
  if(project?.keywords){
    body += _p(`Keywords: ${esc(project.keywords)}`, {sz:20,sa:80,i:true});
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
  body += _p("Table 2. Outcome-level Weighted Score results", {b:true, sa:60});
  {
    const hdr2 = ["Study","Outcome","Category","n","Direction","Significance","Effect size","MCID met","Q","S","O","B","WS"];
    const hw2  = [600,800,600,260,440,500,560,360,180,180,180,180,220];
    const rows2 = safeOutcomes.map((o,idx)=>{
      const bg = idx%2===0?"F8F9FA":"FFFFFF";
      const wsCol = o._ws!=null
        ? (Number(o._ws)>=9?"1A5C2A":Number(o._ws)>=6?"7D5A00":"8B0000")
        : "666666";
      return _tr([
        _tc(esc(o.study_ref_id||o.study_id||String(idx+1)),{w:600,bg,sz:18}),
        _tc(esc(o.outcome_name||"—"),{w:800,bg,sz:18}),
        _tc(esc(o.outcome_category||"—"),{w:600,bg,sz:18,center:true}),
        _tc(esc(String(o.sample_n||"—")),{w:260,bg,sz:18,center:true}),
        _tc(esc(o.direction||"—"),{w:440,bg,sz:18,center:true}),
        _tc(esc(o.significance||"—"),{w:500,bg,sz:18,center:true}),
        _tc(o.es_value?`${esc(o.es_value)} ${esc(o.es_type||"")} [${esc(o.ci_lower||"?")}–${esc(o.ci_upper||"?")}]`:"—",{w:560,bg,sz:18,center:true}),
        _tc(esc(o.mcid_met||"—"),{w:360,bg,sz:18,center:true}),
        _tc(esc(String(o.quality_score||"—")),{w:180,bg,sz:18,center:true}),
        _tc(esc(String(o._sampleScore||"—")),{w:180,bg,sz:18,center:true}),
        _tc(esc(String(o.outcome_score||"—")),{w:180,bg,sz:18,center:true}),
        _tc((Number(o._biasP)||0).toFixed(1),{w:180,bg,sz:18,center:true}),
        _tc(o._ws!=null?`<w:r><w:rPr><w:color w:val="${wsCol}"/><w:b/><w:sz w:val="18"/></w:rPr><w:t>${(Number(o._ws)||0).toFixed(1)}</w:t></w:r>`:"—",{w:220,bg,sz:18,center:true}),
      ]);
    }).join("");
    body += _tbl(
      _tr(hdr2.map((h,i)=>_tc(h,{header:true,bg:"1A2E44",w:hw2[i],sz:18,center:true}))) + rows2
    );
  }
  body += _p("MCID = Minimal Clinically Important Difference; Q = Study Quality; S = Sample Adequacy; O = Outcome Relevance; B = Bias Penalty; WS = Weighted Score (max 15).",
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
  body += _p("Table S1: NEP Weighted Scoring rubric (Q/S/O/B parameter definitions and thresholds). Table S2: MCID reference library used for Outcome Relevance scoring. Table S3: Bias domain item-level scores per study.", {sz:20});

  // ── Declarations ──────────────────────────────────────────────
  body += _h("Author Contributions", 2);
  if(project?.research_team?.length > 0) {
    const teamStr = project.research_team.map(m=>`${esc(m.name||"")} (${esc(m.role||"")})`).join("; ");
    body += _p(`Research team: ${teamStr}. All authors have read and agreed to the published version of the manuscript.`, {sz:20});
  } else {
    body += _p(`${esc(project?.researcher||"Lead author")}: Conceptualisation, data curation, formal analysis, methodology, writing \u2014 original draft. ` +
      `${esc(project?.co_authors||"")?project.co_authors+": Writing \u2014 review and editing. ":""}` +
      `All authors have read and agreed to the published version of the manuscript.`, {sz:20});
  }

  body += _h("Funding", 2);
  body += _p(project?.funding||"This research received no external funding.", {sz:20});

  body += _h("Institutional Review Board Statement", 2);
  body += _p("Not applicable (evidence synthesis; no primary human participant data were collected).", {sz:20});

  body += _h("Conflicts of Interest", 2);
  body += _p(project?.conflicts||`The authors declare no conflicts of interest. The scoring framework was applied independently with no commercial interest in ${esc(compName)} or any formulation manufacturer.`, {sz:20});

  body += _h("Data Availability Statement", 2);
  body += _p("All structured evidence input data, computed metrics, and framework specifications are available in the supplementary materials. Source code and scoring models are available on request from the corresponding author.", {sz:20});
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
      body += _p(cit, {sz:20,sa:60});
    });
  } else {
    body += _p("[References to be added — see References tab]", {sz:20,i:true});
  }

  // ── Assemble Word 2003 XML ─────────────────────────────────────
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<?mso-application progid="Word.Document"?>\n` +
    `<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml" ` +
    `xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint" ` +
    `w:macrosPresent="no" w:embeddedObjPresent="no" w:ocxPresent="no">\n` +
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
                const name=`${(compound?.compound_name||"NEP").replace(/\s+/g,"_")}_Evidence_Synthesis.doc`;
                const blob=await buildDocxBlob(project,compound,outcomes,refs,(msg)=>{btn.textContent=msg.slice(0,30)+"…";});
                downloadBlob(blob,name);
                btn.textContent="✓ Downloaded";
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
<p class="meta">${project?.researcher||""} &bull; ${project?.target_journal||""} &bull; NEP v5.0 &bull; ${new Date().toLocaleDateString()}</p>
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
        <div style={{padding:"9px 12px",fontSize:12,color:T.text2}}>{m.unit}</div>
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
                  {label:"MCID-met",      fn:r=><span style={{fontSize:12,color:T.text2}}>{r.nMcid}/{r.nOuts}</span>},
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
                <div style={{fontSize:13,fontFamily:T.mono,color:T.text2}}>{nOuts}</div>

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
  const [step,     setStep]     = useState(1);
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState("");
  const [name,        setName]        = useState("");
  const [journal,     setJournal]     = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [keywords,    setKeywords]    = useState("");
  const [paperTitle,  setPaperTitle]  = useState("");
  const ROLES = ["Lead Investigator","Co-Investigator","Data Curator",
    "Statistician","Reviewer","Contributing Author"];
  const [team, setTeam] = useState([
    {id:crypto.randomUUID(), name:"", role:"Lead Investigator"},
  ]);
  const addMember    = () => setTeam(t=>[...t,{id:crypto.randomUUID(),name:"",role:"Co-Investigator"}]);
  const removeMember = (id) => setTeam(t=>t.filter(m=>m.id!==id));
  const updateMember = (id,field,val) => setTeam(t=>t.map(m=>m.id===id?{...m,[field]:val}:m));

  const validateStep1 = () => {
    if(!name.trim()){ setError("Project name is required"); return false; }
    const dup = existingProjects.find(p=>p.name.trim().toLowerCase()===name.trim().toLowerCase());
    if(dup){ setError(`A project named "${name}" already exists (${dup.project_id})`); return false; }
    setError(""); return true;
  };

  const handleCreate = async () => {
    if(!validateStep1()) return;
    setCreating(true);
    const projectId  = generateProjectId(existingProjects);
    const filledTeam = team.filter(m=>m.name.trim());
    const researcher = filledTeam[0]?.name || "";
    const coAuthors  = filledTeam.slice(1).map(m=>m.name).join(", ");
    const authors    = filledTeam.map(m=>m.name).join("  ·  ");
    await onCreate({
      name: name.trim(), project_id: projectId,
      target_journal: journal.trim(), affiliation: affiliation.trim(),
      keywords: keywords.trim(), paper_title: paperTitle.trim(),
      researcher, co_authors: coAuthors,
      research_team: filledTeam, authors_paper: authors,
    });
    setCreating(false); onClose();
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,
      display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(0,0,0,0.75)"}}>
      <div style={{background:T.bg2,border:`1px solid ${T.border2}`,
        borderRadius:14,width:580,maxHeight:"92vh",
        display:"flex",flexDirection:"column",
        boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",padding:"20px 24px 14px",
          borderBottom:`1px solid ${T.border}`}}>
          <div>
            <h2 style={{fontSize:16,fontWeight:700,color:"#F0F6FF",margin:0}}>
              Create new project
            </h2>
            <div style={{fontSize:11,color:T.text3,marginTop:2}}>
              Step {step} of 2 — {step===1?"Project details":"Research team"}
            </div>
          </div>
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>

        {/* Step indicator */}
        <div style={{display:"flex",alignItems:"center",gap:8,
          padding:"12px 24px 0"}}>
          {[["1","Project details"],["2","Research team"]].map(([n,lbl],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{
                width:22,height:22,borderRadius:"50%",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:11,fontWeight:700,flexShrink:0,
                background:step>i+1?T.teal:step===i+1?T.teal:T.bg3,
                color:step>i+1?T.bg0:step===i+1?T.bg0:T.text3,
                border:`1px solid ${step>=i+1?T.teal:T.border}`,
              }}>{step>i+1?"✓":n}</div>
              <span style={{fontSize:12,fontWeight:step===i+1?600:400,
                color:step===i+1?"#F0F6FF":step>i+1?T.teal:T.text3}}>
                {lbl}
              </span>
              {i===0&&<span style={{color:T.border2,fontSize:14,margin:"0 4px"}}>→</span>}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>

          {step===1&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <FieldLabel label="Project name" required/>
                <input value={name}
                  onChange={e=>{setName(e.target.value);setError("");}}
                  placeholder="e.g. Triphala Digestive Health Synthesis"
                  autoFocus/>
                {error&&<div style={{fontSize:11,color:T.red,marginTop:4}}>⚠ {error}</div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <FieldLabel label="Target journal"/>
                  <input value={journal} onChange={e=>setJournal(e.target.value)}
                    placeholder="e.g. J Ethnopharmacology"/>
                </div>
                <div>
                  <FieldLabel label="Affiliation"/>
                  <input value={affiliation} onChange={e=>setAffiliation(e.target.value)}
                    placeholder="e.g. AIIMS New Delhi, India"/>
                </div>
              </div>
              <div>
                <FieldLabel label="Keywords"/>
                <input value={keywords} onChange={e=>setKeywords(e.target.value)}
                  placeholder="e.g. Triphala; digestive; antioxidant; clinical trial"/>
                <div style={{fontSize:10,color:T.text3,marginTop:2}}>
                  Separate with semicolons. Can auto-generate after adding evidence.
                </div>
              </div>
              <div>
                <FieldLabel label="Paper title"/>
                <input value={paperTitle} onChange={e=>setPaperTitle(e.target.value)}
                  placeholder="Leave blank to auto-generate from compound + outcomes"/>
                <div style={{fontSize:10,color:T.text3,marginTop:2}}>
                  Can auto-generate in Project Settings after adding evidence.
                </div>
              </div>
            </div>
          )}

          {step===2&&(
            <div>
              <div style={{fontSize:12,color:T.text3,marginBottom:12,lineHeight:1.6}}>
                First member becomes lead author. All members populate the paper's
                author list. Editable anytime in Project Settings.
              </div>
              {team.map((m,i)=>(
                <div key={m.id} style={{display:"grid",
                  gridTemplateColumns:"1fr 160px 28px",
                  gap:8,marginBottom:8,alignItems:"center"}}>
                  <input value={m.name}
                    onChange={e=>updateMember(m.id,"name",e.target.value)}
                    placeholder={i===0?"Lead investigator name…":"Team member name…"}
                    autoFocus={i===0&&step===2}/>
                  <select value={m.role}
                    onChange={e=>updateMember(m.id,"role",e.target.value)}
                    style={{fontSize:12}}>
                    {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                  {team.length>1
                    ?<button onClick={()=>removeMember(m.id)}
                       style={{background:"none",border:"none",
                         color:T.text3,cursor:"pointer",fontSize:16,padding:4}}>✕</button>
                    :<div/>}
                </div>
              ))}
              <Btn variant="ghost" onClick={addMember} style={{fontSize:12,marginTop:4}}>
                + Add team member
              </Btn>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:"14px 24px",borderTop:`1px solid ${T.border}`,
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            {step===2&&(
              <Btn variant="secondary" onClick={()=>setStep(1)}>← Back</Btn>
            )}
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            {step===1
              ? <Btn onClick={()=>{if(validateStep1()) setStep(2);}}>
                  Next: Research team →
                </Btn>
              : <Btn onClick={handleCreate} disabled={creating}>
                  {creating?"Creating…":"Create project →"}
                </Btn>
            }
          </div>
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
                  <div style={{fontSize:13,fontFamily:T.mono,color:T.text2}}>
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

const ValidateGeneratePanel = ({ outcomes, refs, compound, project, projectId, onUpdateProject }) => {
  const [genMode,setGenMode]           = useState(false);
  const [serverResult,setServerResult] = useState(null);
  const [checking,setChecking]         = useState(false);
  const [section,setSection]           = useState("fillers");
  const [titleVal,    setTitleVal]     = useState(project?.paper_title||"");
  const [keywordsVal, setKeywordsVal]  = useState(project?.keywords||"");
  const [genLoading,  setGenLoading]   = useState(null);

  // Sync from project on load + auto-generate if empty
  useEffect(()=>{
    const t = project?.paper_title||"";
    const k = project?.keywords||"";
    if(t) setTitleVal(t);
    if(k) setKeywordsVal(k);
    const aUsed = [...new Map(
      outcomes.flatMap(o=>{
        if(o.compounds?.length>0) return o.compounds.map(c=>[c.id,c]);
        if(o.compound_id) return [[o.compound_id,{id:o.compound_id,name:o.compound_name||"",scientific:o.scientific_name||""}]];
        return [];
      })
    ).values()].filter(c=>c.name);
    if(!t && aUsed.length>0){
      setGenLoading("title");
      generatePaperTitle(aUsed, outcomes, project?.target_journal)
        .then(title=>{ setTitleVal(title); if(project&&onUpdateProject) onUpdateProject({...project,paper_title:title}); })
        .catch(()=>{})
        .finally(()=>setGenLoading(null));
    }
    if(!k && aUsed.length>0){
      generateKeywords(aUsed, outcomes)
        .then(kw=>{ setKeywordsVal(kw); if(project&&onUpdateProject) onUpdateProject({...project,keywords:kw}); })
        .catch(()=>{});
    }
  },[project?.id]);

  if (genMode) return (
    <GenerationPanel outcomes={outcomes} refs={refs} compound={compound}
      project={project} projectId={projectId} onBack={()=>setGenMode(false)}/>
  );

  // Handle both new (compounds[]) and legacy (compound_id/compound_name) formats
  const allUsed = [...new Map(
    outcomes.flatMap(o=>{
      if(o.compounds?.length>0) return o.compounds.map(c=>[c.id,c]);
      if(o.compound_id||o.compound_name) return [[
        o.compound_id||o.compound_name,
        {id:o.compound_id||o.compound_name,
         name:o.compound_name||o.compound_id||"",
         scientific:o.scientific_name||""}
      ]];
      return [];
    })
  ).values()].filter(c=>c.name);

  const fillers = [
    {label:"Paper title",     value:project?.paper_title||(allUsed.length>0?`${allUsed.map(c=>c.name).join(" + ")}: Evidence Synthesis`:""), section:"Title", where:"Project Settings → Paper title (or auto-generate)"},
    {label:"Project name",    value:project?.name,            section:"Title",      where:"Project Settings → Name"},
    {label:"Project ID",      value:project?.project_id,      section:"Title",      where:"Auto-generated on create"},
    {label:"Researcher",      value:project?.researcher,      section:"Authors",    where:"Project Settings → Researcher"},
    {label:"Co-authors",      value:project?.co_authors,      section:"Authors",    where:"Project Settings → Co-authors"},
    {label:"Affiliation",     value:project?.affiliation,     section:"Authors",    where:"Project Settings → Affiliation"},
    {label:"Target journal",  value:project?.target_journal,  section:"Title",      where:"Project Settings → Target journal"},
    {label:"Keywords",        value:project?.keywords,        section:"Abstract",   where:"Project Settings → Keywords"},
    {label:"Compounds",       value:allUsed.length>0?allUsed.map(c=>c.name).join(" + "):"", section:"Methods", where:"Evidence Input → outcome → Select compound"},
    {label:"Outcomes",        value:outcomes.length>0?`${outcomes.length} entered`:"",      section:"Results",  where:"Evidence Input → Add outcome"},
    {label:"References",      value:refs.length>0?`${refs.length} entered`:"",              section:"References",where:"References tab → Add reference"},
  ];

  const filled  = fillers.filter(f=>f.value).length;
  const missing = fillers.filter(f=>!f.value);
  const sectionGroups = [...new Set(fillers.map(f=>f.section))];

  const isComplete = o => o.study_type&&o.outcome_name&&o.direction&&
    o.significance&&o.sample_n&&o.quality_score&&o.outcome_score&&
    o.bias_tool&&o.mcid_met&&(o.compounds?.length>0||o.compound_name);
  const unsaved    = outcomes.filter(o=>!o._saved&&!isComplete(o));
  const withErrors = outcomes.filter(o=>Object.keys(o._errors||{}).length>0);
  const blockers   = [
    ...unsaved.length>0    ? [`${unsaved.length} outcome(s) incomplete`] : [],
    ...withErrors.length>0 ? ["Validation errors in outcomes"]            : [],
    ...outcomes.length===0 ? ["At least 1 outcome required"]             : [],
  ];
  const ready = blockers.length===0;

  const TabBtn = ({id,label}) => (
    <button onClick={()=>setSection(id)} style={{
      padding:"9px 18px",fontSize:13,fontWeight:section===id?700:400,
      background:section===id?T.teal:"transparent",
      color:section===id?T.bg0:"#F0F6FF",
      border:`1px solid ${section===id?T.teal:T.border}`,
      borderRadius:6,cursor:"pointer",transition:"all 0.15s",fontFamily:"inherit",
    }}>{label}</button>
  );



  const autoGenTitle = async () => {
    setGenLoading("title");
    try {
      const t = await generatePaperTitle(allUsed, outcomes, project?.target_journal);
      setTitleVal(t);
      if(project) onUpdateProject({...project, paper_title:t});
    } catch(e) { console.error(e); }
    setGenLoading(null);
  };

  const autoGenKeywords = async () => {
    setGenLoading("keywords");
    try {
      const k = await generateKeywords(allUsed, outcomes);
      setKeywordsVal(k);
      if(project) onUpdateProject({...project, keywords:k});
    } catch(e) { console.error(e); }
    setGenLoading(null);
  };

  return (
    <div className="fade-in">
      <SectionHeader title="Validate and Generate"
        subtitle="Check all fields, edit title and keywords, then generate your paper."/>

      {/* Editable title + keywords */}
      <div style={{background:T.bg2,borderRadius:8,padding:16,
        marginBottom:16,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:12,color:T.teal,fontWeight:700,
          textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>
          Paper metadata — edit before generating
        </div>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:4}}>
            <FieldLabel label="Paper title"/>
            <button onClick={autoGenTitle} disabled={genLoading==="title"}
              style={{fontSize:11,color:T.teal,background:"none",
                border:`1px solid ${T.teal}30`,borderRadius:4,
                padding:"2px 10px",cursor:"pointer",fontFamily:"inherit"}}>
              {genLoading==="title"
                ? <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
                : "✦ Auto-generate"}
            </button>
          </div>
          <input value={titleVal}
            onChange={e=>{setTitleVal(e.target.value);
              if(project) onUpdateProject({...project,paper_title:e.target.value});}}
            placeholder="Auto-generate or type your paper title…"
            style={{fontSize:13,fontWeight:500}}/>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:4}}>
            <FieldLabel label="Keywords"/>
            <button onClick={autoGenKeywords} disabled={genLoading==="keywords"}
              style={{fontSize:11,color:T.teal,background:"none",
                border:`1px solid ${T.teal}30`,borderRadius:4,
                padding:"2px 10px",cursor:"pointer",fontFamily:"inherit"}}>
              {genLoading==="keywords"
                ? <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
                : "✦ Auto-generate"}
            </button>
          </div>
          <input value={keywordsVal}
            onChange={e=>{setKeywordsVal(e.target.value);
              if(project) onUpdateProject({...project,keywords:e.target.value});}}
            placeholder="Auto-generate or enter keywords separated by semicolons…"
            style={{fontSize:13}}/>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:16,padding:"12px 16px",
        background:T.bg2,borderRadius:8,border:`1px solid ${T.border}`,marginBottom:20}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:12,fontWeight:600,color:"#F0F6FF"}}>Overall readiness</span>
            <span style={{fontSize:12,fontFamily:"monospace",fontWeight:700,
              color:filled===fillers.length&&ready?T.green:filled>=7?T.amber:T.red}}>
              {filled}/{fillers.length} fields filled · {ready?"✓ Ready to generate":"⚠ Issues remain"}
            </span>
          </div>
          <div style={{height:6,background:T.bg1,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:3,transition:"width 0.5s",
              width:`${filled/fillers.length*100}%`,
              background:filled===fillers.length?T.green:filled>=7?T.amber:T.red}}/>
          </div>
        </div>
        <Btn onClick={()=>setSection("generate")} disabled={!ready}
          style={{fontSize:13,fontWeight:700,padding:"10px 22px",flexShrink:0}}>
          Generate paper →
        </Btn>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:20}}>
        <TabBtn id="fillers"  label={`Field completeness (${filled}/${fillers.length})`}/>
        <TabBtn id="template" label="Template filler mapping"/>
        <TabBtn id="generate" label={`Generate${blockers.length>0?" ("+blockers.length+" issues)":""}`}/>
      </div>

      {section==="fillers"&&(
        <div className="fade-in">
          {missing.length>0&&(
            <div style={{marginBottom:14,padding:"12px 14px",borderRadius:8,
              background:T.amberBg,border:`1px solid ${T.amber}30`}}>
              <div style={{fontSize:12,fontWeight:600,color:T.amber,marginBottom:10}}>
                {missing.length} field{missing.length>1?"s":""} need to be filled before generating:
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {missing.map(f=>(
                  <div key={f.label} style={{display:"flex",
                    alignItems:"center",gap:8,fontSize:12}}>
                    <span style={{color:T.red,flexShrink:0,fontSize:14}}>✕</span>
                    <span style={{color:"#F0F6FF",fontWeight:600,
                      minWidth:130,flexShrink:0}}>{f.label}</span>
                    {f.label==="Keywords"&&(
                      <button onClick={autoGenKeywords} disabled={genLoading==="keywords"}
                        style={{fontSize:11,color:T.teal,background:"none",
                          border:`1px solid ${T.teal}40`,borderRadius:4,
                          padding:"2px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                        {genLoading==="keywords"
                          ?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
                          :"✦ Auto-generate"}
                      </button>
                    )}
                    {f.label==="Paper title"&&(
                      <button onClick={autoGenTitle} disabled={genLoading==="title"}
                        style={{fontSize:11,color:T.teal,background:"none",
                          border:`1px solid ${T.teal}40`,borderRadius:4,
                          padding:"2px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                        {genLoading==="title"
                          ?<span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>↻</span>
                          :"✦ Auto-generate"}
                      </button>
                    )}
                    {!["Keywords","Paper title"].includes(f.label)&&(
                      <span style={{fontSize:11,color:T.text3}}>
                        Fill via ✎ Project Settings (top bar)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* filler cards grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {sectionGroups.map(sec=>(
              <div key={sec} style={{background:T.bg2,borderRadius:8,padding:14,
                border:`1px solid ${T.border}`}}>
                <div style={{fontSize:10,color:T.teal,fontWeight:700,
                  textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
                  {sec} section
                </div>
                {fillers.filter(f=>f.section===sec).map(f=>(
                  <div key={f.label} style={{display:"flex",alignItems:"center",
                    gap:8,marginBottom:6,padding:"6px 10px",borderRadius:5,
                    background:f.value?T.greenBg:T.redBg,
                    border:`1px solid ${f.value?T.green:T.red}20`}}>
                    <span style={{fontSize:12,flexShrink:0,color:f.value?T.green:T.red}}>
                      {f.value?"✓":"✕"}
                    </span>
                    <span style={{fontSize:12,color:"#F0F6FF",flex:1,fontWeight:500}}>
                      {f.label}
                    </span>
                    <span style={{fontSize:11,color:T.text3,
                      overflow:"hidden",textOverflow:"ellipsis",
                      whiteSpace:"nowrap",maxWidth:140}}>
                      {f.value || f.where}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {section==="template"&&(
        <div className="fade-in">
          <TemplatePreviewPanel/>
        </div>
      )}

      {section==="generate"&&(
        <div className="fade-in">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            {[
              {label:"Project fields",     ok:missing.length===0,                        detail:`${filled}/${fillers.length} filled`},
              {label:"Outcomes entered",   ok:outcomes.length>=1,                        detail:`${outcomes.length} outcome(s)`},
              {label:"Outcomes valid",     ok:unsaved.length===0&&withErrors.length===0, detail:unsaved.length+withErrors.length===0?"All complete":`${unsaved.length+withErrors.length} need attention`},
              {label:"References entered", ok:refs.length>=1,                            detail:`${refs.length} reference(s)`},
              {label:"Compounds assigned", ok:allUsed.length>0,                          detail:allUsed.length>0?allUsed.map(c=>c.name).join(" + "):"None yet"},
              {label:"Ready to generate",  ok:ready,                                     detail:ready?"✓ All checks passed":`${blockers.length} blocker(s)`},
            ].map(({label,ok,detail})=>(
              <div key={label} style={{display:"flex",gap:10,padding:"10px 14px",
                background:T.bg3,borderRadius:6,border:`1px solid ${T.border}`,alignItems:"center"}}>
                <span style={{color:ok?T.green:T.text3,fontSize:16,flexShrink:0}}>{ok?"✓":"○"}</span>
                <div>
                  <div style={{fontSize:13,color:ok?"#F0F6FF":T.text2,fontWeight:500}}>{label}</div>
                  <div style={{fontSize:11,color:T.text3}}>{detail}</div>
                </div>
              </div>
            ))}
          </div>
          {blockers.map((b,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"8px 12px",background:T.redBg,
              borderRadius:6,marginBottom:4,border:`1px solid ${T.red}20`}}>
              <span style={{color:T.red}}>✕</span>
              <span style={{fontSize:12,color:"#F0F6FF"}}>{b}</span>
            </div>
          ))}
          <div style={{display:"flex",gap:10,alignItems:"center",marginTop:16,flexWrap:"wrap"}}>
            <Btn variant="secondary" onClick={async()=>{
              setChecking(true);
              try{const r=await API.validate(projectId);setServerResult(r);}
              catch(e){setServerResult({ready:false,issues:[e.message],warnings:[]});}
              setChecking(false);
            }} disabled={checking}>
              {checking?"↻ Checking…":"Run server check"}
            </Btn>
            <Btn onClick={()=>setGenMode(true)} disabled={!ready}
              style={{padding:"11px 28px",fontSize:14,fontWeight:700}}>
              {ready?"✓ Generate paper →":"Fix issues first"}
            </Btn>
            {serverResult&&(
              <span style={{fontSize:12,color:serverResult.ready?T.green:T.amber}}>
                Server: {serverResult.ready?"✓ Passed":`${serverResult.issues?.length||0} issue(s)`}
              </span>
            )}
          </div>
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
  // Restore session from localStorage including role
  try {
    const saved = localStorage.getItem("nep_session");
    if(saved) {
      const u = JSON.parse(saved);
      if(u && u.email && u.role) {
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
    // Re-derive role from email if missing (handles cached sessions)
    if(!u.role){
      const roleMap = {
        "admin@nep.science":      "admin",
        "researcher@nep.science": "researcher",
        "doctor@nep.science":     "doctor",
        "demo@nep.science":       "researcher",
      };
      u.role = roleMap[u.email?.toLowerCase()] || "researcher";
    }
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
        if(!found) issues.push(`MCID_Met=Yes for "${o.outcome_name}" but no threshold in MCID library`);
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
              <div><FieldLabel label="Project name" required/>
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
            <p style={{fontSize:14,marginBottom:6,color:T.text2}}>No projects yet</p>
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


export default function App(){
  const [user,setUser]=useState(()=>API.getSession());
  const [projects,setProjects]=useState([]);
  const [projectOutcomes,setProjectOutcomes]=useState({});
  const [project,setProject]=useState(null);
  // compound derived from outcomes (see allCompoundsUsed below)
  const [outcomes,setOutcomes]=useState([]);
  const [refs,setRefs]=useState([]);
  const [compounds,setCompounds]=useState([...SEED_COMPOUNDS]);
  const [activeTab,setActiveTab]=useState("about");
  const [projectOpen,setProjectOpen]=useState(false);
  const [showNewProject,setShowNewProject]=useState(false);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(false);
  const [projectsLoading,setProjectsLoading]=useState(false);
  const toast=useToast();
  const saveTimer=useRef(null);

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

  useEffect(()=>{
    if(user) loadProjects().then(()=>{
      // Auto-restore last active project
      const lastId = localStorage.getItem(`nep_last_project_${user.id}`);
      if(lastId){
        const p = _STORE.projects.find(x=>x.id===lastId);
        if(p) loadProject(p);
      }
    });
  },[user]);

  /* Load a project */
  const loadProject=async(proj)=>{
    setProject(proj);setLoading(true);
    // Remember last opened project for this user
    if(user?.id) localStorage.setItem(`nep_last_project_${user.id}`, proj.id);
    try{
      const [outs,rfs,comps]=await Promise.all([
        API.listOutcomes(proj.id),
        API.listRefs(proj.id),API.listCompounds()]);
      // Migrate legacy outcomes: if compound_id set but compounds[] empty, populate it
      const migratedOuts = (outs||[]).map(o => {
        if ((o.compound_id||o.compound_name) && (!o.compounds||o.compounds.length===0)) {
          return {
            ...o,
            compounds: [{
              id: o.compound_id || o.compound_name,
              name: o.compound_name || o.compound_id || "",
              scientific: o.scientific_name || "",
            }]
          };
        }
        return o;
      });
      setOutcomes(migratedOuts);setRefs(rfs||[]);
      if(comps&&comps.length) setCompounds(comps);
      // Cache outcomes for portfolio dashboard
      setProjectOutcomes(prev=>({...prev,[proj.id]:outs||[]}));
      setActiveTab("dashboard");
    }catch(e){toast.error("Failed to load: "+e.message);}
    finally{setLoading(false);}
  };

  /* Create project */
  const createProject=async(data)=>{
    try{
      const p=await API.createProject(data);
      const updated=[...projects,p];
      setProjects(updated);
      await loadProject(p);
    }catch(e){toast.error("Failed to create: "+e.message);}
  };

  const scheduleSave=useCallback((type,data)=>{
    if(!project) return;
    clearTimeout(saveTimer.current);setSaving(true);
    saveTimer.current=setTimeout(async()=>{
      try{
        if(type==="compound") await API.saveCompound(project.id,data);
        else if(type==="outcome") await API.saveOutcome(project.id,data);
        else if(type==="ref") await API.saveRef(project.id,data);
        else if(type==="project") await API.updateProject(project.id,data);
        setSaving(false);
      }catch(e){setSaving(false);toast.error("Save failed: "+e.message);}
    },800);
  },[project,toast]);

  const addOutcome=()=>{
    const o=newOutcome(outcomes,[]);
    setOutcomes(p=>[...p,o]);setActiveTab("evidence");
    if(project) scheduleSave("outcome",o);
  };

  const handleAddCompound=async(c)=>{
    setCompounds(prev=>prev.find(x=>x.id===c.id)?prev:[...prev,c]);
    if(project){try{await API.addCompound(c);}catch(e){}}
    // Auto-seed references from compound registry
    if(c.refs?.length>0){
      const existingTitles = new Set(refs.map(r=>r.title?.toLowerCase()));
      const newRefs = c.refs
        .filter(r=>r.title && !existingTitles.has(r.title.toLowerCase()))
        .map(r=>({
          id: crypto.randomUUID(),
          ref_id: r.ref_id||`REF-${c.id}-${Date.now()}`,
          study_ref_id:"", compound_id:c.id,
          title:r.title||"", authors:r.authors||"",
          year:r.year||"", journal:r.journal||"",
          doi:r.doi||"", volume:r.volume||"",
          issue:r.issue||"", pages:r.pages||"",
          bias_tool:"", bias_overall:"",
          _source:"Registry",
          _url: r.doi?`https://doi.org/${r.doi}`:"",
        }));
      if(newRefs.length>0){
        setRefs(prev=>[...prev,...newRefs]);
        if(project) newRefs.forEach(r=>scheduleSave("ref",r));
        toast.success(`Added ${newRefs.length} reference(s) from ${c.name} registry`);
      }
    }
  };


  // Import completed patient outcomes from doctor mobile data
  const importPatientOutcomes = () => {
    const allPatients = [];
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && key.startsWith("nep_doctor_patients_")){
        try{ allPatients.push(...JSON.parse(localStorage.getItem(key)||"[]")); }
        catch(e){}
      }
    }
    const completed = allPatients.filter(p=>p.status==="complete"&&p.outcome);
    if(!completed.length){
      toast.error("No completed patient outcomes found. Ensure doctor has closed cases.");
      return;
    }
    const newOutcomes = [];
    completed.forEach((p,pi)=>{
      const comp = p.primaryCompound;
      const compObj = comp?[{id:comp.id||comp.name,name:comp.name,
        scientific:comp.scientific||""}]:[];
      const base = {
        study_type:"Clinical observation",
        population:`${p.age||"?"}y ${p.gender||""}`,
        sample_n: String(completed.length),
        quality_score:"3", outcome_score:"3",
        bias_tool:"Clinical observation",
        bias_d1:"0",bias_d2:"0",bias_d3:"0",bias_d4:"0",bias_d5:"0",
        _biasP:0,_sampleScore:0,_ws:null,
        _saved:false,_errors:{},
        study_ref_id:`${p.id}-OBS`,
        compounds: compObj,
        compound_name: comp?.name||"",
        dosage: p.primaryDose||"",
        dose_unit: p.primaryDoseUnit||"mg",
        frequency: p.primaryFrequency||"",
        duration: p.targetDuration||"",
        _fromPatient:true,
        _patientId:p.id,
        _doctorName:p.doctorName||"",
      };
      [["symptom1","outcome1"],["symptom2","outcome2"]].forEach(([sk,ok])=>{
        const sym = p[sk];
        const out = p.outcome?.[ok];
        if(!sym||!out?.direction) return;
        newOutcomes.push({
          ...base,
          id: crypto.randomUUID(),
          outcome_name: sym,
          outcome_category:"Clinical",
          direction: out.direction,
          significance: out.significance==="Yes"?"Significant":
                        out.significance==="No"?"Not Significant":"",
          es_value: out.magnitude||"",
          mcid_met: out.mcid==="Yes"?"Yes":out.mcid==="No"?"No":"Unknown",
          outcome_score: out.direction==="Improved"?"4":
                         out.direction==="No change"?"2":"1",
          p_value: out.significance==="Yes"?"< 0.05":"",
        });
      });
    });
    if(!newOutcomes.length){ toast.error("No outcome rows could be created."); return; }
    const scored = newOutcomes.map(o=>{
      const ss=score.sampleScore(Number(o.sample_n));
      const bp=score.biasP(o.bias_d1,o.bias_d2,o.bias_d3,o.bias_d4,o.bias_d5);
      const ws=score.ws(Number(o.quality_score),ss,Number(o.outcome_score),bp,o.significance);
      return {...o,_sampleScore:ss,_biasP:bp,_ws:ws};
    });
    setOutcomes(prev=>{
      const seen=new Set(prev.map(o=>o._patientId+"|"+o.outcome_name));
      const fresh=scored.filter(o=>!seen.has(o._patientId+"|"+o.outcome_name));
      const all=[...prev,...fresh];
      if(project) scheduleSave("outcomes",all);
      return all;
    });
    toast.success(`✓ Imported ${scored.length} outcome rows from ${completed.length} patients`);
  };
  const updateOutcome=(id,u)=>{setOutcomes(p=>p.map(o=>o.id===id?u:o));if(project) scheduleSave("outcome",u);};
  const removeOutcome=async(id)=>{setOutcomes(p=>p.filter(o=>o.id!==id));if(project){try{await API.deleteOutcome(project.id,id);}catch(e){toast.error("Delete failed");}}};
  const addRef=(ref)=>{
    const r = (ref && ref.id) ? ref : newRef();
    setRefs(p=>[...p,r]);
    if(project) scheduleSave("ref",r);
  };

  const deleteProject=async(id)=>{
    try{
      // Cascade delete in storage
      await API.deleteProject(id);
      // Clear UI state
      setProjects(prev=>prev.filter(p=>p.id!==id));
      setProjectOutcomes(prev=>{const n={...prev};delete n[id];return n;});
      if(project?.id===id){
        setProject(null);setOutcomes([]);setRefs([]);
        setActiveTab("projects");
      }
      toast.success("Project and all its data deleted");
    }catch(e){
      console.error("Delete failed:",e);
      toast.error("Delete failed: "+e.message);
    }
  };

  const updateProjectFull=async(updated)=>{
    try{
      await API.updateProject(updated.id, updated);
      setProjects(prev=>prev.map(p=>p.id===updated.id?{...p,...updated}:p));
      if(project?.id===updated.id) setProject(u=>({...u,...updated}));
    }catch(e){toast.error("Failed to save: "+e.message);}
  };
  const updateRef=(id,field,val)=>{const cur=refs.find(r=>r.id===id);setRefs(p=>p.map(r=>r.id===id?{...r,[field]:val}:r));if(project&&cur) scheduleSave("ref",{...cur,[field]:val});};
  const removeRef=async(id)=>{setRefs(p=>p.filter(r=>r.id!==id));if(project){try{await API.deleteRef(project.id,id);}catch(e){toast.error("Delete failed");}}};

  const updateProject=(field,val)=>{const u={...project,[field]:val};setProject(u);scheduleSave("project",u);};

  const ess=score.ess(outcomes.map(o=>({_ws:Number(o._ws)||null})));
  const essC=score.essClass(ess);

  // Derive ALL compounds used across outcomes
  const allCompoundsUsed = [...new Map(
    outcomes.flatMap(o=>{
      // New format: o.compounds[]
      if(o.compounds?.length>0) return o.compounds.map(c=>[c.id,{...c}]);
      // Legacy: o.compound_id / o.compound_name
      if(o.compound_id||o.compound_name) return [[
        o.compound_id||o.compound_name,
        {id:o.compound_id||o.compound_name,
         name:o.compound_name||o.compound_id||"",
         scientific:o.scientific_name||""}
      ]];
      return [];
    })
  ).values()]
  // Enrich with full repository data (extract_form, standardisation etc.)
  .map(c=>{const full=compounds.find(r=>r.id===c.id);return full?{...c,...full}:c;});
  const primaryCompound = allCompoundsUsed[0] || {};

  // Derived compound object for doc generation + template preview
  // Compound-level fields from outcomes; formulation fields from project settings
  const compound = {
    compound_id:    allCompoundsUsed.map(c=>c.id).join("+") || "",
    compound_name:  allCompoundsUsed.length===1
      ? (primaryCompound.name||"")
      : allCompoundsUsed.length>1
        ? allCompoundsUsed.map(c=>c.name).join(" + ")
        : "",
    scientific_name: allCompoundsUsed.map(c=>c.scientific).filter(Boolean).join(", ") || "",
    // Formulation details from compound registry (primary compound)
    extract_form:    primaryCompound.extract_form    || project?.extract_form    || "",
    standardisation: primaryCompound.standardisation || project?.standardisation || "",
    // Dose range: from registry, or derive from outcomes dosage fields
    dose_range: primaryCompound.dose_range || project?.dose_range ||
      (()=>{
        const doses = outcomes.map(o=>o.dosage).filter(Boolean);
        if(!doses.length) return "";
        const nums = doses.map(Number).filter(n=>!isNaN(n));
        if(!nums.length) return doses[0]+" "+(outcomes[0]?.dose_unit||"");
        const mn=Math.min(...nums), mx=Math.max(...nums);
        const unit = outcomes[0]?.dose_unit||"mg";
        return mn===mx?`${mn}${unit}`:`${mn}–${mx}${unit}/day`;
      })(),
    duration_range:  primaryCompound.duration_range  || project?.duration_range  || "",
  };

  if(!user) return <AuthScreen onAuth={u=>{setUser(u);loadProjects();}}/>;

  // Sprint 2 role routing (mobile app) — see nep_app.jsx

  const NavBtn=({id,label,indent=false,badge=null,onClick:customClick})=>{
    const active=activeTab===id;
    return(
      <button onClick={customClick||(()=>setActiveTab(id))} style={{
        width:"100%",textAlign:"left",
        padding:indent?"7px 14px 7px 22px":"9px 14px",
        borderRadius:6,fontSize:indent?12:13,fontWeight:active?600:400,
        background:active?T.tealBg:"transparent",
        color:active?T.teal:"#F0F6FF",
        border:active?`1px solid ${T.tealDim}30`:"1px solid transparent",
        marginBottom:2,cursor:"pointer",transition:"all 0.15s",
        display:"flex",justifyContent:"space-between",alignItems:"center",
      }}>
        <span>{label}</span>
        {badge!=null&&(
          <span style={{fontSize:10,fontFamily:T.mono,fontWeight:600,
            color:active?T.teal:T.text3,background:active?`${T.teal}20`:T.bg3,
            padding:"1px 6px",borderRadius:10}}>{badge}</span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Top bar */}
      <div style={{height:52,background:T.bg2,borderBottom:`1px solid ${T.border}`,
        display:"flex",alignItems:"center",padding:"0 20px",
        gap:12,flexShrink:0,position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:8}}>
          <div style={{width:28,height:28,borderRadius:6,background:T.teal,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:T.bg0,fontSize:14,fontWeight:800,fontFamily:T.mono}}>N</span>
          </div>
          <span style={{fontSize:13,fontWeight:700,color:"#F0F6FF"}}>NEP Platform</span>
        </div>
        {project&&(
          <>
            <span style={{color:T.border2,fontSize:16}}>›</span>
            <button onClick={()=>setActiveTab("projects")}
              style={{background:"none",border:"none",cursor:"pointer",
                fontSize:13,color:T.text2}}>Projects</button>
            <span style={{color:T.border2,fontSize:16}}>›</span>
            <span style={{fontSize:13,fontWeight:600,color:"#F0F6FF"}}>{project.name}</span>
            {project.project_id&&(
              <Tag color={T.teal} style={{fontSize:10}}>{project.project_id}</Tag>
            )}
            <button onClick={()=>setProjectOpen(p=>!p)}
              style={{background:"none",border:"none",cursor:"pointer",
                fontSize:11,color:T.teal}}>✎</button>
          </>
        )}
        <div style={{flex:1}}/>
        <SaveIndicator saving={saving}/>
        <button onClick={async()=>{await API.signOut();
              if(user?.id) localStorage.removeItem(`nep_last_project_${user.id}`);
              setUser(null);setProject(null);setProjects([]);}}
          style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:T.text3}}>
          Sign out
        </button>
      </div>

      {/* Project settings drawer */}
      {projectOpen&&project&&(
        <div style={{position:"fixed",top:52,right:0,width:520,
          background:T.bg2,border:`1px solid ${T.border}`,
          borderRadius:"0 0 0 12px",zIndex:100,
          boxShadow:"-8px 8px 32px rgba(0,0,0,0.5)",
          display:"flex",flexDirection:"column",
          maxHeight:"calc(100vh - 52px)"}}>
          {/* Sticky header */}
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",padding:"16px 20px",flexShrink:0,
            borderBottom:`1px solid ${T.border}`,background:T.bg2}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14,fontWeight:700,color:"#F0F6FF"}}>Project settings</span>
              {project.project_id&&(
                <Tag color={T.teal}>{project.project_id}</Tag>
              )}
            </div>
            <Btn variant="ghost" onClick={()=>setProjectOpen(false)}>✕</Btn>
          </div>
          {/* Scrollable body */}
          <div style={{overflowY:"auto",flex:1,padding:"16px 20px"}}>

          {/* Project fields */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {[["Project name","name"],["Target journal","target_journal"],
              ["Lead researcher","researcher"],["Co-authors","co_authors"],
              ["Affiliation","affiliation"],
            ].map(([lbl,fld])=>(
              <div key={fld}>
                <FieldLabel label={lbl}/>
                <input value={project[fld]||""} onChange={e=>updateProject(fld,e.target.value)}
                  placeholder={
                    fld==="researcher"?"e.g. S Ravi Kumar":
                    fld==="co_authors"?"e.g. Priya M, Anjali K":
                    fld==="affiliation"?"e.g. AIIMS New Delhi, India":
                    fld==="target_journal"?"e.g. J Ethnopharmacology":""
                  }/>
              </div>
            ))}
            <div style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <FieldLabel label="Keywords"/>
                <button onClick={async()=>{
                  const names = allCompoundsUsed.map(c=>c.name).join(", ")||"the compound";
                  const outcomes_str = outcomes.slice(0,5).map(o=>o.outcome_name).filter(Boolean).join(", ");
                  try{
                    const res = await fetch("/api/claude",{
                      method:"POST",
                      headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01",
                        "anthropic-dangerous-direct-browser-access":"true"},
                      body:JSON.stringify({
                        model:"claude-sonnet-4-20250514",max_tokens:200,
                        messages:[{role:"user",content:
                          `Generate 6-8 academic keywords for a nutraceutical evidence synthesis paper about ${names}${outcomes_str?`, studying ${outcomes_str}`:""}. Return ONLY a semicolon-separated list, no other text. Example format: Ashwagandha; Withania somnifera; stress; anxiety; adaptogen; clinical trial; systematic review`
                        }]
                      })
                    });
                    const data = await res.json();
                    const kw = data.content?.[0]?.text?.trim()||"";
                    if(kw) updateProject("keywords", kw);
                  }catch(e){ console.error(e); }
                }} style={{fontSize:10,color:T.teal,background:"none",
                  border:`1px solid ${T.teal}30`,borderRadius:4,
                  padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                  ✦ Auto-generate
                </button>
              </div>
              <input value={project.keywords||""} onChange={e=>updateProject("keywords",e.target.value)}
                placeholder="e.g. Ashwagandha; stress; anxiety; adaptogen; clinical trial"/>
            </div>
          </div>

          {/* Paper title */}
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:12,color:"#F0F6FF",fontWeight:700}}>Paper title</div>
              <button onClick={async()=>{
                const names = allCompoundsUsed.map(c=>c.name).join(" + ")||project.name;
                const scientific = allCompoundsUsed.map(c=>c.scientific).filter(Boolean).join(", ");
                const outcomes_str = outcomes.slice(0,4).map(o=>o.outcome_name).filter(Boolean).join(", ");
                const journal = project.target_journal||"";
                try{
                  const res = await fetch("/api/claude",{
                    method:"POST",
                    headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01",
                      "anthropic-dangerous-direct-browser-access":"true"},
                    body:JSON.stringify({
                      model:"claude-sonnet-4-20250514",max_tokens:150,
                      messages:[{role:"user",content:
                        `Generate a concise, academic paper title for a nutraceutical evidence synthesis about ${names}${scientific?` (${scientific})`:""}${outcomes_str?`, examining ${outcomes_str}`:""}${journal?`, targeting ${journal}`:""}. The title should follow IMRaD conventions, be specific and informative. Return ONLY the title, no quotes or explanation.`
                      }]
                    })
                  });
                  const data = await res.json();
                  const title = data.content?.[0]?.text?.trim()||"";
                  if(title) updateProject("paper_title", title);
                }catch(e){ console.error(e); }
              }} style={{fontSize:10,color:T.teal,background:"none",
                border:`1px solid ${T.teal}30`,borderRadius:4,
                padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                ✦ Auto-generate
              </button>
            </div>
            <input value={project.paper_title||""}
              onChange={e=>updateProject("paper_title",e.target.value)}
              placeholder="Auto-generated from compound + outcomes — or type your own"/>
          </div>

          {/* Authors for paper */}
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
            <div style={{fontSize:12,color:"#F0F6FF",fontWeight:700,marginBottom:6}}>
              Paper authors (populates title block)
            </div>
            <div style={{fontSize:11,color:T.text3,marginBottom:8}}>
              Defaulted from research team. Edit as needed. Format: Surname AB
            </div>
            <textarea value={project.authors_paper||project.researcher||""}
              onChange={e=>updateProject("authors_paper",e.target.value)}
              rows={2} placeholder="e.g. Smith AB  ·  Jones CD  ·  Patel R"
              style={{resize:"vertical"}}/>
          </div>

          {/* Compound details for paper (Methods section) */}
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginBottom:12}}>
            <div style={{fontSize:12,color:"#F0F6FF",fontWeight:700,marginBottom:4}}>
              Compound details — Methods section
            </div>
            <div style={{fontSize:11,color:T.text3,marginBottom:8}}>
              Compounds in this project:{" "}
              <strong style={{color:T.teal}}>
                {allCompoundsUsed.length>0
                  ? allCompoundsUsed.map(c=>c.name).join(" + ")
                  : "none yet — add via Evidence tab"}
              </strong>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                ["Extract form",    "extract_form",    "e.g. Root extract, KSM-66"],
                ["Standardisation", "standardisation", "e.g. 5% withanolides"],
                ["Dose range",      "dose_range",      "e.g. 300–600 mg/day"],
                ["Duration range",  "duration_range",  "e.g. 8–12 weeks"],
              ].map(([lbl,fld,ph])=>(
                <div key={fld}>
                  <FieldLabel label={lbl}/>
                  <input value={project[fld]||""}
                    onChange={e=>updateProject(fld,e.target.value)}
                    placeholder={ph}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <Btn onClick={()=>setProjectOpen(false)}>Done</Btn>
          </div>
          </div>{/* end scrollable */}
        </div>
      )}

      <div style={{display:"flex",height:"calc(100vh - 52px)"}}>

        {/* Sidebar */}
        <div style={{width:214,flexShrink:0,background:T.bg1,
          borderRight:`1px solid ${T.border}`,
          display:"flex",flexDirection:"column",
          padding:"12px 8px",overflowY:"auto"}}>

          <NavBtn id="about" label="About NEP"/>

          {/* Portfolio — outside projects */}
          <NavBtn id="portfolio" label="Portfolio" badge={projects.length||null}/>

          {/* Projects */}
          <NavBtn id="projects" label="Projects"/>

          {/* Project sub-items */}
          {project&&(
            <div style={{marginLeft:8,borderLeft:`2px solid ${T.border2}`,
              paddingLeft:6,marginTop:2,marginBottom:4}}>
              <NavBtn id="dashboard"  label="Project Dashboard" indent/>
              <NavBtn id="evidence"   label={"Evidence"+(outcomes.length>0?` (${outcomes.length})`:"")} indent/>
              <NavBtn id="references" label={"References"+(refs.length>0?` (${refs.length})`:"")} indent/>
              <NavBtn id="validate"   label="Validate & Generate" indent/>
            </div>
          )}

          {/* Administration */}
          <div style={{fontSize:10,color:T.text3,fontWeight:700,
            textTransform:"uppercase",letterSpacing:"0.1em",
            padding:"14px 14px 6px",marginTop:4,
            borderTop:`1px solid ${T.border}`}}>Administration</div>
          <NavBtn id="compounds" label={`Compounds (${compounds.length})`}/>
          <NavBtn id="mcid"      label="MCID Library"/>
          <NavBtn id="template"  label="Paper Template"/>

          <div style={{flex:1}}/>

          {/* WS quick ref */}
          <div style={{padding:"10px 8px",borderTop:`1px solid ${T.border}`,marginTop:8}}>
            <div style={{fontSize:9,color:T.text3,fontWeight:700,textTransform:"uppercase",
              letterSpacing:"0.06em",marginBottom:6}}>WS Formula</div>
            {[["Q","Study quality","1–5"],["S","Sample size","0–5 auto"],
              ["O","Outcome","1–5"],["B","Bias penalty","0–5"]].map(([a,l,r])=>(
              <div key={a} style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                <span style={{fontFamily:T.mono,fontSize:11,fontWeight:700,color:T.teal,width:14,flexShrink:0}}>{a}</span>
                <span style={{fontSize:10,color:T.text3,flex:1}}>{l}</span>
                <span style={{fontFamily:T.mono,fontSize:9,color:T.text3}}>{r}</span>
              </div>
            ))}
            <div style={{marginTop:6,padding:"5px 8px",background:T.bg2,borderRadius:4,
              fontFamily:T.mono,fontSize:11,color:"#F0F6FF",textAlign:"center"}}>
              WS = Q+S+O−B
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{flex:1,overflowY:"auto",padding:24,background:T.bg1}}>
          <div style={{maxWidth:1100,margin:"0 auto"}}>

            {activeTab==="about" && <AboutPanel/>}

            {activeTab==="portfolio" && (
              <div className="fade-in">
                <SectionHeader title="Portfolio"
                  subtitle="Evidence strength summary across all projects."
                  action={<Btn onClick={()=>setShowNewProject(true)}>+ New project</Btn>}/>
                 <PortfolioDashboard
                   projects={projects}
                   projectOutcomes={projectOutcomes}
                   onOpen={loadProject}
                   onDelete={deleteProject}
                   onUpdate={updateProjectFull}
                   activeProjectId={project?.id}/>
              </div>
            )}

            {activeTab==="projects" && (
               <ProjectsPanel
                 projects={projects}
                 onSelect={loadProject}
                 onNew={()=>setShowNewProject(true)}
                 onDelete={deleteProject}
                 onUpdate={updateProjectFull}
                 loading={projectsLoading}
                 activeProjectId={project?.id}/>
            )}

            {activeTab==="dashboard" && project && (
              <div className="fade-in">
                <SectionHeader
                  title="Project Dashboard"
                  subtitle={`${project.project_id||""} · ${compound.compound_name||project.compound_id||"—"} · ${compound.extract_form||"—"}`}
                  action={
                    <div style={{display:"flex",gap:8}}>
                      <Btn variant="secondary" onClick={()=>setActiveTab("evidence")} style={{fontSize:12}}>
                        View outcomes
                      </Btn>
                      <Btn onClick={addOutcome} style={{fontSize:12}}>+ Add outcome</Btn>
                    </div>
                  }/>
                <DashboardPanel outcomes={outcomes} compound={compound} project={project}/>
                {outcomes.length>0&&(()=>{
                  const studies=[...new Set(outcomes.map(o=>o.study_ref_id).filter(Boolean))];
                  return(
                    <div style={{marginTop:24}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#F0F6FF",marginBottom:10,
                        paddingBottom:8,borderBottom:`1px solid ${T.border}`}}>Per-study summary</div>
                      <div style={{display:"grid",
                        gridTemplateColumns:"repeat(3,1fr) 0.5fr auto",
                        background:T.bg3,borderRadius:"6px 6px 0 0",
                        borderBottom:`1px solid ${T.border}`}}>
                        {["Study","Outcomes","Mean WS","N","Bias"].map(h=>(
                          <div key={h} style={{padding:"7px 12px",fontSize:10,color:T.text3,
                            fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>
                        ))}
                      </div>
                      {studies.map((ref,i)=>{
                        const rows=outcomes.filter(o=>o.study_ref_id===ref);
                        const mws=rows.filter(o=>o._ws!=null).length
                          ?rows.filter(o=>o._ws!=null).reduce((a,b)=>a+b._ws,0)/rows.filter(o=>o._ws!=null).length:null;
                        const bp=rows.length?rows.reduce((a,b)=>a+b._biasP,0)/rows.length:0;
                        return(
                          <div key={ref} className="row-hover" style={{display:"grid",
                            gridTemplateColumns:"repeat(3,1fr) 0.5fr auto",
                            borderBottom:`1px solid ${T.border}`,
                            background:i%2===0?T.bg2:T.bg1}}>
                            <div style={{padding:"9px 12px",fontSize:12,color:T.teal,fontWeight:600,fontFamily:T.mono}}>{ref}</div>
                            <div style={{padding:"9px 12px",fontSize:12,color:"#C8D8EF"}}>{rows.length} outcome(s)</div>
                            <div style={{padding:"9px 12px"}}>{mws!=null?<ScoreChip value={(Number(mws)||0).toFixed(1)}/>:"—"}</div>
                            <div style={{padding:"9px 12px",fontSize:12,color:T.text2,fontFamily:T.mono}}>{rows[0]?.sample_n||"—"}</div>
                            <div style={{padding:"9px 12px"}}>
                              <Tag color={bp<=1?T.green:bp<=2?T.amber:T.red}>B={(Number(bp)||0).toFixed(1)}</Tag>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab==="evidence" && project && (
              <div className="fade-in">
                <SectionHeader title="Evidence input"
                  subtitle="One row per outcome per study. Fields marked * are required."
                  action={<Btn onClick={addOutcome}>+ Add outcome</Btn>}/>
                {outcomes.length===0?(
                  <div style={{textAlign:"center",padding:"60px 20px",
                    border:`1px dashed ${T.border2}`,borderRadius:8}}>
                    <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>⊕</div>
                    <p style={{fontSize:13,color:T.text3,marginBottom:16}}>No outcomes yet.</p>
                    <Btn onClick={addOutcome}>+ Add first outcome</Btn>
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
                    <div style={{marginTop:8,display:"flex",
                      justifyContent:"space-between",alignItems:"center"}}>
                      <Btn variant="secondary" onClick={addOutcome}>+ Add another outcome</Btn>
                      <span style={{fontSize:11,color:T.text3}}>
                        {outcomes.length} outcome(s) · ESS {(Number(ess)||0).toFixed(2)} ({essC})
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab==="references" && project && (
              <div className="fade-in">
                <SectionHeader title="References"
                  subtitle="Vancouver format. Source studies must have full vol/issue/pages."
                  action={<Btn onClick={addRef}>+ Add reference</Btn>}/>
                <ReferencesPanel refs={refs} onAdd={addRef} onUpdate={updateRef}
                  onRemove={removeRef}
                  compoundName={compound.compound_name||project?.compound_id||""}/>
              </div>
            )}

            {activeTab==="validate" && project && (
              <ValidateGeneratePanel outcomes={outcomes} refs={refs}
                compound={compound} project={project} projectId={project?.id}
                onUpdateProject={updateProjectFull}
               />
            )}

            {activeTab==="compounds" && (
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

            {activeTab==="mcid" && (
              <div className="fade-in">
                <SectionHeader title="MCID library"
                  subtitle="Published Minimal Clinically Important Differences."/>
                <MCIDPanel/>
              </div>
            )}

            {activeTab==="template" && (
              <div className="fade-in">
                <SectionHeader title="Paper template — filler positions"
                  subtitle="Orange = auto-filled. Red = missing. Fill compound details in Administration → Compounds → expand row."
                  action={
                    <Btn variant="secondary"
                      onClick={(e)=>{
                        const btn=e.currentTarget;
                        btn.textContent="Building…";btn.disabled=true;
                        try{
                          const blob = buildBlankTemplate();
                          downloadBlob(blob,"NEP_Standard_Template_v5.doc");
                          btn.textContent="✓ Downloaded";
                          setTimeout(()=>{btn.textContent="↓ Download blank template";btn.disabled=false;},2000);
                        }catch(err){
                          alert("Failed: "+err.message);
                          btn.textContent="↓ Download blank template";btn.disabled=false;
                        }
                      }}
                      style={{fontSize:12}}>
                      ↓ Download blank template
                    </Btn>
                  }/>
                <TemplatePreviewPanel/>
              </div>
            )}

            {/* Guard */}
            {["dashboard","evidence","references","validate"].includes(activeTab)&&!project&&(
              <div style={{textAlign:"center",padding:"80px 20px"}}>
                <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>📁</div>
                <p style={{fontSize:15,color:T.text3,marginBottom:20}}>
                  Select a project to continue.
                </p>
                <Btn onClick={()=>setActiveTab("projects")}>Go to Projects →</Btn>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New project modal */}
      {showNewProject&&(
        <NewProjectModal
          onClose={()=>setShowNewProject(false)}
          onCreate={createProject}
          existingProjects={projects}/>
      )}
    </>
  );
}

export function Root(){
  return <ToastProvider><App/></ToastProvider>;
}
