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
  // Paper management
  papers: {},        // { [paperId]: paper_row }
  paperVersions: {}, // { [paperId]: version_row[] }
  paperDrafts: {},   // { [draftId]: draft_row }
  registrations: [], // researcher_registrations rows
  aiJobs: {},        // { [jobId]: ai_job_row }
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

  // ── RESEARCHER REGISTRATION & ADMIN APPROVAL ────────────────────────────────
  async submitResearcherRegistration(data) {
    await delay(400);
    const email = (data.email || '').toLowerCase().trim();
    if (!email || !data.fullName) throw new Error('Email and full name are required');
    if (STORE.registrations.some(r => r.email === email))
      throw new Error('An application with this email already exists.');
    const reg = {
      id: 'reg-' + Date.now(),
      email,
      full_name: data.fullName,
      affiliation: data.affiliation || '',
      orcid: data.orcid || '',
      research_area: data.researchArea || '',
      intended_use: data.intendedUse || '',
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      created_at: new Date().toISOString(),
    };
    STORE.registrations.push(reg);
    return reg;
  },
  async getRegistrationStatus(email) {
    await delay(200);
    const reg = STORE.registrations.find(r => r.email === (email || '').toLowerCase().trim());
    if (!reg) return { status: 'none', rejectionReason: null };
    return { status: reg.status, rejectionReason: reg.rejection_reason };
  },
  async listRegistrations(status) {
    await delay(250);
    return STORE.registrations
      .filter(r => !status || status === 'all' || r.status === status)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  async reviewRegistration(id, { decision, reason }) {
    await delay(300);
    const reg = STORE.registrations.find(r => r.id === id);
    if (!reg) throw new Error('Registration not found');
    reg.status = decision;
    reg.reviewed_by = STORE.user?.id || null;
    reg.reviewed_at = new Date().toISOString();
    reg.rejection_reason = decision === 'rejected' ? (reason || '') : null;
    return reg;
  },

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

  // ── AI DRAFT GENERATION ──────────────────────────────────────────────────
  // No real model call here — deterministic placeholder text standing in for
  // the Supabase adapter's ai-generate Edge Function call.
  async generateAIDraft(projectId, opts = {}) {
    await delay(900);
    const { paperId = null, sections } = opts;
    const secs = sections?.length ? sections : ['Title', 'Keywords', 'Abstract', 'Introduction', 'Methods'];
    const project = STORE.projects.find(p => p.id === projectId) || {};
    const compoundName = (STORE.compounds[projectId] || {}).compound_name
      || (STORE.compounds[projectId] || {}).name || '';
    const jobId = 'aijob-' + Date.now();
    const job = {
      id: jobId, org_id: 'demo-org', project_id: projectId, paper_id: paperId,
      job_type: 'draft_sections', status: 'running', stage: 1, pct: 50, log: [],
      input_ref: { paperId, sections: secs }, output_ref: null,
      model: 'mock', prompt_version: 'draft-sections-v1',
      created_by: STORE.user?.id || null, started_at: new Date().toISOString(), completed_at: null,
    };
    STORE.aiJobs[jobId] = job;

    const title = project.paper_title || `${compoundName || 'Untitled'} Evidence Synthesis`;
    const html =
      `<h1>${title}</h1>` +
      `<h2>Keywords</h2><p>${project.keywords || 'nutraceutical, evidence synthesis'}</p>` +
      `<h2>Abstract</h2><p>This mock AI draft summarises the available evidence for ${compoundName || 'the compound'} pending full outcome analysis.</p>` +
      `<h2>Introduction</h2><p>Placeholder introduction generated by the Mock adapter — no live AI call is made outside the Supabase adapter.</p>` +
      `<h2>Methods</h2><p>Placeholder methods section describing the evidence synthesis approach used in this project.</p>`;

    let targetPaperId = paperId;
    let draftId;
    if (!targetPaperId) {
      const created = await this.createPaperDraft(projectId, {
        title, compound: compoundName, htmlContent: html, notes: 'Generated by AI draft assistant',
      });
      targetPaperId = created.groupId;
      draftId = created.id;
      const draft = STORE.paperDrafts[draftId];
      if (draft) { draft.source = 'ai_draft'; draft.ai_job_id = jobId; }
    } else {
      draftId = 'draft-' + Date.now();
      const now = new Date().toISOString();
      const maxVer = Math.max(0, ...(STORE.paperVersions[targetPaperId] || []).map(v => v.version_number));
      STORE.paperDrafts[draftId] = {
        id: draftId, paper_id: targetPaperId, source_version_id: null, source_version_number: null,
        next_version_number: maxVer + 1,
        html_content: html, file_name: '', file_data: '', file_size: 0,
        title, compound: compoundName, notes: 'Generated by AI draft assistant',
        metadata: { sections: secs }, source: 'ai_draft', ai_job_id: jobId,
        status: 'draft', created_at: now, updated_at: now,
      };
    }

    job.status = 'done'; job.pct = 100; job.completed_at = new Date().toISOString();
    job.output_ref = { paperId: targetPaperId, draftId };
    return { jobId, paperId: targetPaperId, draftId };
  },
  async pollAIJob(jobId) {
    await delay(100);
    return STORE.aiJobs[jobId] || null;
  },

  // ── PAPERS ────────────────────────────────────────────────────────────────
  // Returns a unified flat array for the UI:
  //   drafts  → { ...draft,  status:"draft",     version:null }
  //   versions→ { ...version, status:"published", id: version.id }
  // Each item carries groupId (= paper.id) so the UI can link versions together.

  async listPapers(projectId) {
    await delay(200);
    const papers = Object.values(STORE.papers)
      .filter(p => !projectId || p.project_id === projectId);
    const result = [];
    for (const paper of papers) {
      // Published versions
      const versions = (STORE.paperVersions[paper.id] || [])
        .sort((a, b) => a.version_number - b.version_number);
      for (const v of versions) {
        result.push({
          id: v.id,
          groupId: paper.id,
          title: paper.title,
          compound: paper.compound,
          status: 'published',
          version: v.version_number,
          htmlContent: v.html_content,
          fileName: v.file_name,
          fileData: v.file_data,
          fileSize: v.file_size,
          notes: v.notes,
          metadata: v.metadata,
          basedOnVersion: v.based_on_version || null,
          publishedAt: new Date(v.published_at).getTime(),
          updatedAt: new Date(v.published_at).getTime(),
          createdAt: new Date(paper.created_at).getTime(),
          isCurrent: v.is_current,
          source: v.source || 'manual',
        });
      }
      // Drafts — nextVersion computed live from max published so it stays accurate
      const maxVer = versions.reduce((mx, v) => Math.max(mx, v.version_number), 0);
      const drafts = Object.values(STORE.paperDrafts)
        .filter(d => d.paper_id === paper.id);
      for (const d of drafts) {
        result.push({
          id: d.id,
          groupId: paper.id,
          title: d.title,
          compound: d.compound,
          status: 'draft',
          version: null,
          nextVersion: maxVer + 1,
          basedOnVersion: d.source_version_number || null,
          htmlContent: d.html_content,
          fileName: d.file_name,
          fileData: d.file_data,
          fileSize: d.file_size,
          notes: d.notes,
          metadata: d.metadata,
          publishedAt: null,
          updatedAt: new Date(d.updated_at).getTime(),
          createdAt: new Date(d.created_at).getTime(),
          source: d.source || 'manual',
        });
      }
    }
    return result;
  },

  // Create a new paper group + initial draft in one call.
  // Called right after generation completes.
  async createPaperDraft(projectId, data) {
    await delay(200);
    const paperId = 'paper-' + Date.now();
    const draftId = 'draft-' + Date.now();
    const now = new Date().toISOString();

    STORE.papers[paperId] = {
      id: paperId,
      project_id: projectId,
      title: data.title || '',
      compound: data.compound || '',
      current_version: 0,
      latest_version_id: null,
      created_at: now,
      updated_at: now,
    };
    STORE.paperVersions[paperId] = [];

    STORE.paperDrafts[draftId] = {
      id: draftId,
      paper_id: paperId,
      source_version_id: null,
      source_version_number: null,
      next_version_number: 1,
      html_content: data.htmlContent || '',
      file_name: data.fileName || '',
      file_data: data.fileData || '',
      file_size: data.fileSize || 0,
      title: data.title || '',
      compound: data.compound || '',
      notes: data.notes || '',
      metadata: data.metadata || {},
      status: 'draft',
      created_at: now,
      updated_at: now,
    };

    return {
      id: draftId,
      groupId: paperId,
      title: data.title || '',
      compound: data.compound || '',
      status: 'draft',
      version: null,
      nextVersion: 1,
      basedOnVersion: null,
      htmlContent: data.htmlContent || '',
      fileName: data.fileName || '',
      fileData: data.fileData || '',
      fileSize: data.fileSize || 0,
      notes: data.notes || '',
      metadata: data.metadata || {},
      publishedAt: null,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
  },

  // Update an existing draft's content / notes.
  async updatePaperDraft(draftId, data) {
    await delay(150);
    const draft = STORE.paperDrafts[draftId];
    if (!draft) throw new Error('Draft not found: ' + draftId);
    Object.assign(draft, {
      html_content: data.htmlContent ?? draft.html_content,
      file_name: data.fileName ?? draft.file_name,
      file_data: data.fileData ?? draft.file_data,
      file_size: data.fileSize ?? draft.file_size,
      title: data.title ?? draft.title,
      compound: data.compound ?? draft.compound,
      notes: data.notes ?? draft.notes,
      metadata: data.metadata ?? draft.metadata,
      updated_at: new Date().toISOString(),
    });
    // Recompute next_version_number dynamically
    const paperId = draft.paper_id;
    const maxVer = Math.max(
      0,
      ...(STORE.paperVersions[paperId] || []).map(v => v.version_number)
    );
    draft.next_version_number = maxVer + 1;
    return { ...draft };
  },

  // Publish a draft → creates an immutable version, removes the draft.
  async publishPaperDraft(draftId, htmlContent) {
    await delay(250);
    const draft = STORE.paperDrafts[draftId];
    if (!draft) throw new Error('Draft not found: ' + draftId);

    const paperId = draft.paper_id;
    if (!STORE.paperVersions[paperId]) STORE.paperVersions[paperId] = [];

    // Compute version number atomically
    const maxVer = Math.max(0, ...(STORE.paperVersions[paperId]).map(v => v.version_number));
    const versionNumber = maxVer + 1;
    const now = new Date().toISOString();
    const versionId = 'ver-' + Date.now();

    // Clear current flag on previous versions
    STORE.paperVersions[paperId].forEach(v => { v.is_current = false; });

    const version = {
      id: versionId,
      paper_id: paperId,
      version_number: versionNumber,
      html_content: htmlContent ?? draft.html_content,
      file_name: draft.file_name,
      file_data: draft.file_data,
      file_size: draft.file_size,
      based_on_version: draft.source_version_number || null,
      metadata: draft.metadata,
      notes: draft.notes,
      is_current: true,
      published_at: now,
      source: draft.source || 'manual',
    };
    STORE.paperVersions[paperId].push(version);

    // Update paper group
    const paper = STORE.papers[paperId];
    if (paper) {
      paper.current_version = versionNumber;
      paper.latest_version_id = versionId;
      paper.title = draft.title;
      paper.compound = draft.compound;
      paper.updated_at = now;
    }

    // Remove draft
    delete STORE.paperDrafts[draftId];

    return {
      id: versionId,
      groupId: paperId,
      title: paper?.title || draft.title,
      compound: paper?.compound || draft.compound,
      status: 'published',
      version: versionNumber,
      htmlContent: version.html_content,
      fileName: version.file_name,
      fileData: version.file_data,
      fileSize: version.file_size,
      notes: version.notes,
      basedOnVersion: version.based_on_version,
      publishedAt: new Date(now).getTime(),
      updatedAt: new Date(now).getTime(),
      isCurrent: true,
    };
  },

  // Create a new draft branched from the current published version.
  async createPaperRevision(paperId) {
    await delay(200);
    const paper = STORE.papers[paperId];
    if (!paper) throw new Error('Paper not found: ' + paperId);

    const versions = STORE.paperVersions[paperId] || [];
    const current = versions.find(v => v.is_current) || versions[versions.length - 1];
    if (!current) throw new Error('No published version found for paper: ' + paperId);

    // Next version is always MAX+1 (dynamic)
    const maxVer = Math.max(0, ...versions.map(v => v.version_number));
    const nextVer = maxVer + 1;
    const now = new Date().toISOString();
    const draftId = 'draft-' + Date.now();

    STORE.paperDrafts[draftId] = {
      id: draftId,
      paper_id: paperId,
      source_version_id: current.id,
      source_version_number: current.version_number,
      next_version_number: nextVer,
      html_content: current.html_content,
      file_name: current.file_name,
      file_data: current.file_data,
      file_size: current.file_size,
      title: paper.title,
      compound: paper.compound,
      notes: '',
      metadata: current.metadata || {},
      status: 'draft',
      created_at: now,
      updated_at: now,
    };

    return {
      id: draftId,
      groupId: paperId,
      title: paper.title,
      compound: paper.compound,
      status: 'draft',
      version: null,
      nextVersion: nextVer,
      basedOnVersion: current.version_number,
      htmlContent: current.html_content,
      fileName: current.file_name,
      fileData: current.file_data,
      fileSize: current.file_size,
      notes: '',
      metadata: current.metadata || {},
      publishedAt: null,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
  },

  // Delete a draft or a specific published version.
  // Pass the UI item id (draftId or versionId).
  async deletePaperEntry(id) {
    await delay(150);
    // Draft?
    if (STORE.paperDrafts[id]) {
      delete STORE.paperDrafts[id];
      return;
    }
    // Published version?
    for (const paperId of Object.keys(STORE.paperVersions)) {
      const idx = STORE.paperVersions[paperId].findIndex(v => v.id === id);
      if (idx >= 0) {
        STORE.paperVersions[paperId].splice(idx, 1);
        // If the paper has no more versions or drafts, remove the paper group too
        const remainingVersions = STORE.paperVersions[paperId].length;
        const remainingDrafts = Object.values(STORE.paperDrafts)
          .filter(d => d.paper_id === paperId).length;
        if (remainingVersions === 0 && remainingDrafts === 0) {
          delete STORE.papers[paperId];
          delete STORE.paperVersions[paperId];
        } else {
          // Re-elect current version
          const remaining = STORE.paperVersions[paperId];
          if (remaining.length > 0 && !remaining.some(v => v.is_current)) {
            remaining[remaining.length - 1].is_current = true;
          }
        }
        return;
      }
    }
    throw new Error('Entry not found: ' + id);
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
