// ─── NEP Mock Adapter ───────────────────────────────────────────────────────
// In-memory store with realistic latency simulation.
// Swap for SupabaseAdapter by changing the import in App.jsx:
//   import { adapter } from './adapters/supabase.js'
// ────────────────────────────────────────────────────────────────────────────

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const STORE = {
  user: null,
  projects: [],
  outcomes: {},
  refs: {},
  compounds: {},
  jobs: {},
  feedbackReports: [],
  referencePapers: [],
};

export const adapter = {
  // ── AUTH ─────────────────────────────────────────────────────────────────
  async signIn({ email, password }) {
    await delay(600);
    if (!email || !password) throw new Error('Email and password required');
    STORE.user = { id: 'user-1', email, name: email.split('@')[0], org: 'demo-org' };
    return STORE.user;
  },
  async signUp({ email, password, name }) {
    await delay(800);
    if (!email || !password) throw new Error('All fields required');
    STORE.user = { id: 'user-' + Date.now(), email, name, org: 'org-' + Date.now() };
    return STORE.user;
  },
  async signOut() { await delay(200); STORE.user = null; },
  getSession() { return STORE.user; },

  // ── PROJECTS ─────────────────────────────────────────────────────────────
  async listProjects() {
    await delay(300);
    return [...STORE.projects];
  },
  async createProject(data) {
    await delay(400);
    const p = { id: 'proj-' + Date.now(), ...data, created_at: new Date().toISOString() };
    STORE.projects.push(p);
    return p;
  },
  async updateProject(id, data) {
    await delay(250);
    STORE.projects = STORE.projects.map(p => p.id === id ? { ...p, ...data } : p);
    return STORE.projects.find(p => p.id === id);
  },
  async deleteProject(id) {
    await delay(300);
    STORE.projects = STORE.projects.filter(p => p.id !== id);
  },

  // ── COMPOUND ─────────────────────────────────────────────────────────────
  async saveCompound(projectId, data) {
    await delay(250);
    STORE.compounds[projectId] = { ...data };
    return data;
  },
  async getCompound(projectId) {
    await delay(150);
    return STORE.compounds[projectId] || null;
  },

  // ── OUTCOMES ─────────────────────────────────────────────────────────────
  async listOutcomes(projectId) {
    await delay(200);
    return [...(STORE.outcomes[projectId] || [])];
  },
  async saveOutcome(projectId, outcome) {
    await delay(180);
    if (!STORE.outcomes[projectId]) STORE.outcomes[projectId] = [];
    const idx = STORE.outcomes[projectId].findIndex(o => o.id === outcome.id);
    if (idx >= 0) STORE.outcomes[projectId][idx] = outcome;
    else STORE.outcomes[projectId].push(outcome);
    return outcome;
  },
  async deleteOutcome(projectId, outcomeId) {
    await delay(150);
    if (STORE.outcomes[projectId])
      STORE.outcomes[projectId] = STORE.outcomes[projectId].filter(o => o.id !== outcomeId);
  },

  // ── REFERENCES ───────────────────────────────────────────────────────────
  async listRefs(projectId) {
    await delay(200);
    return [...(STORE.refs[projectId] || [])];
  },
  async saveRef(projectId, ref) {
    await delay(180);
    if (!STORE.refs[projectId]) STORE.refs[projectId] = [];
    const idx = STORE.refs[projectId].findIndex(r => r.id === ref.id);
    if (idx >= 0) STORE.refs[projectId][idx] = ref;
    else STORE.refs[projectId].push(ref);
    return ref;
  },
  async deleteRef(projectId, refId) {
    await delay(150);
    if (STORE.refs[projectId])
      STORE.refs[projectId] = STORE.refs[projectId].filter(r => r.id !== refId);
  },

  // ── VALIDATION ────────────────────────────────────────────────────────────
  async validate(projectId) {
    await delay(500);
    const outcomes = STORE.outcomes[projectId] || [];
    const refs = STORE.refs[projectId] || [];
    const issues = [], warnings = [];

    outcomes.forEach(o => {
      if (o.mcid_met === 'Yes') {
        const name = (o.outcome_name || '').toLowerCase();
        const found = MCID_LIBRARY.some(m =>
          name.includes(m.outcome.toLowerCase().split('(')[0].trim()) ||
          m.outcome.toLowerCase().includes(name.split('(')[0].trim())
        );
        if (!found) issues.push(`MCID_Met=Yes for "${o.outcome_name}" but no threshold in MCID library`);
      }
    });

    refs.forEach(r => {
      if (r.study_ref_id && (!r.volume || !r.pages) &&
          !['N/A', 'guideline', 'background'].some(s => (r.bias_overall || '').includes(s)))
        warnings.push(`Reference [${r.study_ref_id}]: missing volume or pages`);
      if (r.study_ref_id && !r.study_ref_id.includes('BKG') && !r.bias_overall)
        warnings.push(`Reference [${r.study_ref_id}]: Bias_Overall_Rating not set`);
    });

    const incomplete = outcomes.filter(o =>
      !o.outcome_name || !o.study_ref_id || !o.significance || !o.quality_score || !o.outcome_score
    );
    if (incomplete.length) issues.push(`${incomplete.length} outcome(s) missing required fields`);
    if (outcomes.length < 2) issues.push('At least 2 outcomes required for a valid synthesis');

    return { issues, warnings, ready: issues.length === 0 };
  },

  // ── GENERATION ────────────────────────────────────────────────────────────
  async startGeneration(projectId) {
    await delay(350);
    const jobId = 'job-' + Date.now();
    STORE.jobs[jobId] = {
      id: jobId, projectId, status: 'running',
      stage: 1, pct: 0, log: [], started_at: Date.now(),
    };
    const steps = [
      [600, 10, 1, 'Validating evidence input…'],
      [700, 22, 1, 'Computing aggregated metrics…'],
      [500, 34, 1, 'Building Table 1 (study summary)…'],
      [600, 44, 1, 'Building Table 2 (outcome scores)…'],
      [500, 54, 1, 'Building Table 3 (compound metrics)…'],
      [700, 60, 1, 'Generating structured abstract…'],
      [400, 62, 2, 'Stage 1 complete (3,200 words) — AI expansion starting…'],
      [1100, 68, 2, 'Expanding Introduction with SR landscape…'],
      [950, 75, 2, 'Expanding Discussion 4.1 — evidence strength…'],
      [900, 81, 2, 'Expanding Discussion 4.2 — bioavailability…'],
      [850, 87, 2, 'Expanding Discussion 4.3–4.6…'],
      [700, 91, 2, 'Generating Conclusions and priority areas…'],
      [600, 94, 2, 'Rendering .docx (Times New Roman, IMRaD)…'],
      [500, 97, 2, 'Rendering .pdf (headless conversion)…'],
      [600, 100, 2, 'Veracity audit: 39/39 checks passed ✓'],
    ];
    (async () => {
      const j = STORE.jobs[jobId];
      for (const [ms, pct, stage, msg] of steps) {
        await delay(ms);
        j.pct = pct; j.stage = stage;
        j.log.push({ t: Date.now(), msg });
      }
      j.status = 'done';
      j.result = {
        word_count: 5820, veracity: '39/39', tables: 3,
        docx_url: '#download-docx',
        pdf_url: '#download-pdf',
        share_url: '#share-' + jobId,
      };
    })();
    return jobId;
  },

  async pollJob(jobId) {
    await delay(80);
    return STORE.jobs[jobId] || null;
  },

  // ── PATIENT FEEDBACK REPORTS ─────────────────────────────────────────────
  async listFeedbackReports() {
    await delay(200);
    return [...STORE.feedbackReports];
  },
  async saveFeedbackReport(report) {
    await delay(180);
    if (report.id) {
      STORE.feedbackReports = STORE.feedbackReports.map(r => r.id === report.id ? { ...r, ...report } : r);
      return STORE.feedbackReports.find(r => r.id === report.id);
    }
    const saved = {
      ...report,
      id: 'fbr-' + Date.now(),
      patient_id: 'patient_' + (STORE.feedbackReports.length + 1),
      created_at: new Date().toISOString(),
    };
    STORE.feedbackReports.push(saved);
    return saved;
  },
  async deleteFeedbackReport(id) {
    await delay(150);
    STORE.feedbackReports = STORE.feedbackReports.filter(r => r.id !== id);
  },
  async getMedicineEffectiveness() {
    await delay(200);
    const byMedicine = {};
    STORE.feedbackReports.forEach(r => {
      if (!byMedicine[r.medicine]) byMedicine[r.medicine] = [];
      byMedicine[r.medicine].push(Number(r.rating));
    });
    return Object.entries(byMedicine).map(([medicine, ratings]) => ({
      medicine,
      avg_rating: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100,
      report_count: ratings.length,
    }));
  },

  // ── REFERENCE PAPERS ─────────────────────────────────────────────────────
  async listReferencePapers() {
    await delay(200);
    return [...STORE.referencePapers];
  },
  async uploadReferencePaper(paper) {
    await delay(300);
    const saved = { ...paper, id: 'refpaper-' + Date.now(), created_at: new Date().toISOString() };
    STORE.referencePapers.push(saved);
    return saved;
  },
  async deleteReferencePaper(id) {
    await delay(150);
    STORE.referencePapers = STORE.referencePapers.filter(p => p.id !== id);
  },
};

// MCID library reference (needed by validate)
const MCID_LIBRARY = [
  { outcome: 'Perceived Stress Scale (PSS)' },
  { outcome: 'Hamilton Anxiety Rating Scale (HAM-A)' },
  { outcome: 'C-Reactive Protein (CRP)' },
  { outcome: 'Pain — Visual Analogue Scale (VAS)' },
  { outcome: 'Body Mass Index (BMI)' },
  { outcome: 'HbA1c' },
  { outcome: 'Fasting Blood Glucose' },
  { outcome: 'Serum Cortisol' },
  { outcome: 'Sleep Onset Latency' },
  { outcome: 'Pittsburgh Sleep Quality Index (PSQI)' },
  { outcome: 'Total Cholesterol' },
  { outcome: 'LDL Cholesterol' },
  { outcome: 'Triglycerides' },
  { outcome: 'HOMA-IR' },
  { outcome: '6-Minute Walk Test' },
  { outcome: 'SF-36 Physical Function' },
  { outcome: 'SF-36 Mental Component Summary (MCS)' },
];
