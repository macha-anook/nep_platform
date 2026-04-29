// ─── NEP Supabase Adapter ───────────────────────────────────────────────────
// All data flows through Supabase. No localStorage, no mock.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _supabase = null;
function getClient() {
  if (_supabase) return _supabase;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase environment variables.\n' +
      'Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
    );
  }
  _supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });
  return _supabase;
}

const supabase = new Proxy({}, {
  get(_, prop) { return getClient()[prop]; },
});

function check(data, error, label) {
  if (error) throw new Error(`[${label}] ${error.message}`);
  return data;
}

let _cachedOrgId = null;
async function getOrgId() {
  if (_cachedOrgId) return _cachedOrgId;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  check(data, error, 'getOrgId');
  _cachedOrgId = data.org_id;
  return _cachedOrgId;
}

// ── Normalizers ──────────────────────────────────────────────────────────────

function normalizeStudy(s) {
  return {
    ...s,
    targetSampleSize: s.target_sample_size ?? s.targetSampleSize ?? 50,
    invitedDoctors: (s.study_invitations || []).map(inv => ({
      email: inv.doctor_email,
      name: inv.doctor_name || '',
      authenticated: inv.authenticated || false,
      committed: inv.committed || false,
    })),
  };
}

function normalizePatient(p) {
  const weeklyLogs = (p.patient_weekly_logs || [])
    .sort((a, b) => a.week - b.week)
    .map(l => ({
      id: l.id,
      week: l.week,
      date: l.log_date,
      response: l.response,
      score1: l.score1,
      score2: l.score2,
      sideEffects: l.side_effects || [],
      sideEffectSeverity: l.side_effect_severity || '',
      doseAdjusted: l.dose_adjusted || false,
      newDose: l.new_dose || '',
      notes: l.notes || '',
    }));

  return {
    id: p.id,
    studyId: p.study_id,
    patientId: p.patient_id,
    age: p.age != null ? String(p.age) : '',
    gender: p.gender || '',
    symptom1: p.symptom1 || '',
    symptom2: p.symptom2 || null,
    baselineScore1: p.baseline_score1 != null ? String(p.baseline_score1) : '',
    baselineScore2: p.baseline_score2 != null ? String(p.baseline_score2) : '',
    studyType: p.study_type || '',
    qualityScore: p.quality_score || 3,
    primaryCompound: p.primary_compound || null,
    primaryDose: p.primary_dose || '',
    primaryDoseUnit: p.primary_dose_unit || 'mg',
    primaryFrequency: p.primary_frequency || '',
    primaryForm: p.primary_form || '',
    secondaryCompound: p.secondary_compound || null,
    secondaryDose: p.secondary_dose || '',
    secondaryDoseUnit: p.secondary_dose_unit || 'mg',
    secondaryFrequency: p.secondary_frequency || '',
    targetDuration: p.target_duration || '',
    doctorName: p.doctor_name || '',
    doctorClinic: p.doctor_clinic || '',
    doctorRegNumber: p.doctor_reg_number || '',
    status: p.status || 'active',
    outcome: p.outcome || null,
    weeklyLogs,
    createdAt: p.created_at,
  };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export const adapter = {

  // ── AUTH ─────────────────────────────────────────────────────────────────

  // Sync stub — always returns null; use getCurrentUser() for async init
  getSession() {
    return null;
  },

  // Async session check — call once on app mount
  async getCurrentUser() {
    const { data: { session } } = await getClient().auth.getSession();
    if (!session?.user) return null;
    _cachedOrgId = null;
    const { data: profile } = await getClient()
      .from('users').select('full_name, org_id, role').eq('id', session.user.id).single();
    // Profile missing means user was deleted — clear the stale session
    if (!profile) {
      await getClient().auth.signOut();
      return null;
    }
    const role = ['doctor', 'researcher'].includes(profile.role) ? profile.role : 'researcher';
    return {
      id: session.user.id,
      email: session.user.email,
      name: profile.full_name || session.user.email?.split('@')[0],
      org: profile.org_id,
      role,
    };
  },

  // Auth state change subscription — returns { unsubscribe }
  // callback receives (event, session)
  onAuthStateChange(callback) {
    const { data: { subscription } } = getClient().auth.onAuthStateChange(callback);
    return subscription;
  },

  async signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    check(data, error, 'signIn');
    _cachedOrgId = null;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('users').select('full_name, org_id, role').eq('id', user.id).single();
    const role = ['doctor', 'researcher'].includes(profile?.role) ? profile.role : 'researcher';
    return { id: user.id, email: user.email, name: profile?.full_name, org: profile?.org_id, role };
  },

  async signUp({ email, password, name }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name } },
    });
    check(data, error, 'signUp');
    return { id: data.user.id, email: data.user.email, name };
  },

  async signOut() {
    _cachedOrgId = null;
    await supabase.auth.signOut();
  },

  async sendOtp(email, name, role) {
    const isSignIn = !name; // sign-in mode: no name supplied
    if (isSignIn) {
      // Block unregistered emails from sign-in — check profile exists first
      const { data: exists, error: rpcErr } = await supabase.rpc('check_user_exists', { p_email: email });
      if (!rpcErr && !exists) {
        throw new Error("No account found for this email. Don't have an account? Please register.");
      }
    }
    const options = { shouldCreateUser: !isSignIn };
    const metaData = {};
    if (name) metaData.full_name = name;
    if (role) metaData.role = role;
    if (Object.keys(metaData).length) options.data = metaData;
    const { error } = await supabase.auth.signInWithOtp({ email, options });
    if (error) throw new Error(`[sendOtp] ${error.message}`);
  },

  async verifyOtp(email, token, intendedRole = null) {
    const { data, error } = await supabase.auth.verifyOtp({
      email, token, type: 'email',
    });
    check(data, error, 'verifyOtp');
    _cachedOrgId = null;
    // Profile may take a moment (trigger is sync but API might lag)
    let profile = null;
    for (let i = 0; i < 3; i++) {
      const { data: p } = await supabase
        .from('users').select('full_name, org_id, role').eq('id', data.user.id).single();
      if (p) { profile = p; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    let resolvedRole = ['doctor', 'researcher'].includes(profile?.role) ? profile.role : 'researcher';

    // Registration flow: caller supplied intended role — persist it if it differs
    if (intendedRole && ['doctor', 'researcher'].includes(intendedRole) && profile) {
      if (profile.role !== intendedRole) {
        await supabase.from('users').update({ role: intendedRole }).eq('id', data.user.id);
      }
      resolvedRole = intendedRole;
    }

    return {
      id: data.user.id,
      email: data.user.email,
      name: profile?.full_name || email.split('@')[0],
      org: profile?.org_id,
      role: resolvedRole,
    };
  },

  async markDoctorAuthenticated(email, inviteToken = null) {
    const updates = { authenticated: true };
    if (inviteToken) updates.invite_status = 'accepted';
    await supabase
      .from('study_invitations')
      .update(updates)
      .eq('doctor_email', email.toLowerCase());
  },

  // Call Edge Function to send an invite email to a doctor via Resend.
  // studyMeta: { studyTitle, compoundName, duration, researcherName, researcherEmail, orgId }
  // Returns { success, emailId, token }.
  async sendDoctorInvite(studyId, doctorEmail, doctorName = null, studyMeta = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    // Explicitly pass the anon key (HS256) — when a user is authenticated,
    // functions.invoke() would otherwise send the session JWT (ES256) which the
    // Edge Function gateway rejects with UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM.
    const { data: body, error } = await supabase.functions.invoke('send-doctor-invite', {
      headers: { Authorization: `Bearer ${supabaseKey}` },
      body: {
        studyId,
        doctorEmail,
        doctorName,
        studyTitle:      studyMeta.studyTitle      || '',
        compoundName:    studyMeta.compoundName    || '',
        duration:        studyMeta.duration        || '',
        platformUrl:     window.location.origin,
        researcherEmail: studyMeta.researcherEmail || session.user.email,
        researcherName:  studyMeta.researcherName  || '',
        orgId:           studyMeta.orgId           || '',
        createdBy:       session.user.id,
      },
    });
    if (error) throw new Error(error.message || 'Failed to send invitation');
    return body;
  },

  // Validate a token from the invite link before the doctor has logged in.
  // Calls a security-definer DB function so no auth session is required.
  // Returns { valid, invite_id, doctor_email, study_title, expires_at } or { valid: false }.
  async validateInviteToken(studyId, token) {
    const { data, error } = await supabase.rpc('validate_invite_token', {
      p_study_id: studyId,
      p_token:    token,
    });
    if (error || !data || data.length === 0) return { valid: false };
    return data[0];
  },

  async markDoctorCommitted(studyId, email) {
    await supabase
      .from('study_invitations')
      .update({ committed: true, committed_at: new Date().toISOString() })
      .eq('study_id', studyId)
      .eq('doctor_email', email.toLowerCase());
  },

  // ── PROJECTS ─────────────────────────────────────────────────────────────

  async listProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    return check(data, error, 'listProjects');
  },

  async createProject(proj) {
    const orgId = await getOrgId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('projects')
      .insert({ ...proj, org_id: orgId, created_by: user.id })
      .select()
      .single();
    return check(data, error, 'createProject');
  },

  async updateProject(idOrObj, updates) {
    const id = typeof idOrObj === 'object' ? idOrObj.id : idOrObj;
    const payload = typeof idOrObj === 'object' ? { ...idOrObj } : { ...updates };
    delete payload.id;
    const { data, error } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    return check(data, error, 'updateProject');
  },

  async deleteProject(id) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    check(null, error, 'deleteProject');
  },

  // ── COMPOUND ─────────────────────────────────────────────────────────────

  async listCompounds() {
    const { data, error } = await supabase
      .from('compounds')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return [];
    return (data || []).map(c => ({
      id: c.compound_id || c.id,
      name: c.compound_name || '',
      scientific: c.scientific_name || '',
      class: c.class || '',
      extractForm: c.extract_form || '',
      standardisation: c.standardisation || '',
    }));
  },

  async addCompound(_compound) {
    // Compound repository is seeded client-side from SEED_COMPOUNDS.
    // Project-specific compounds are persisted via saveCompound(projectId, data).
    return _compound;
  },

  async saveCompound(projectId, data) {
    const orgId = await getOrgId();
    const { data: result, error } = await supabase
      .from('compounds')
      .upsert({ ...data, project_id: projectId, org_id: orgId }, { onConflict: 'project_id' })
      .select()
      .single();
    return check(result, error, 'saveCompound');
  },

  async getCompound(projectId) {
    const { data, error } = await supabase
      .from('compounds').select('*').eq('project_id', projectId).maybeSingle();
    if (error) throw new Error(`[getCompound] ${error.message}`);
    return data;
  },

  // ── OUTCOMES ─────────────────────────────────────────────────────────────

  async listOutcomes(projectId) {
    const { data, error } = await supabase
      .from('study_outcomes')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    return check(data, error, 'listOutcomes');
  },

  async saveOutcome(projectId, outcome) {
    const orgId = await getOrgId();
    const sample_n = Number(outcome.sample_n) || null;
    const sample_score = sample_n == null ? 0
      : sample_n >= 200 ? 5 : sample_n >= 100 ? 4 : sample_n >= 50 ? 3 : sample_n >= 20 ? 2 : 1;
    const bias_penalty =
      (Number(outcome.bias_d1)||0) + (Number(outcome.bias_d2)||0) +
      (Number(outcome.bias_d3)||0) + (Number(outcome.bias_d4)||0) +
      (Number(outcome.bias_d5)||0);
    const q = Number(outcome.quality_score)||0;
    const o = Number(outcome.outcome_score)||0;
    const base = q + sample_score + o - bias_penalty;
    const weighted_score = outcome.significance === 'Not Significant'
      ? Math.max(Math.min(base - 2, 8), 0)
      : outcome.significance ? Math.max(Math.min(base, 15), 0) : null;

    const row = {
      id: outcome.id,
      project_id: projectId, org_id: orgId,
      study_id: outcome.study_id, study_ref_id: outcome.study_ref_id,
      compound_id: outcome.compound_id, compound_name: outcome.compound_name,
      scientific_name: outcome.scientific_name, study_type: outcome.study_type,
      population: outcome.population, outcome_name: outcome.outcome_name,
      outcome_category: outcome.outcome_category, direction: outcome.direction,
      significance: outcome.significance,
      sample_n, es_value: outcome.es_value !== '' ? Number(outcome.es_value) || null : null,
      es_type: outcome.es_type,
      ci_lower: outcome.ci_lower !== '' ? Number(outcome.ci_lower) || null : null,
      ci_upper: outcome.ci_upper !== '' ? Number(outcome.ci_upper) || null : null,
      p_value: outcome.p_value, i2: outcome.i2 !== '' ? Number(outcome.i2) || null : null,
      quality_score: Number(outcome.quality_score) || null,
      outcome_score: Number(outcome.outcome_score) || null,
      bias_d1: outcome.bias_d1 !== '' ? Number(outcome.bias_d1) : null,
      bias_d2: outcome.bias_d2 !== '' ? Number(outcome.bias_d2) : null,
      bias_d3: outcome.bias_d3 !== '' ? Number(outcome.bias_d3) : null,
      bias_d4: outcome.bias_d4 !== '' ? Number(outcome.bias_d4) : null,
      bias_d5: outcome.bias_d5 !== '' ? Number(outcome.bias_d5) : null,
      bias_tool: outcome.bias_tool, mcid_met: outcome.mcid_met,
      sample_score, bias_penalty, weighted_score,
    };

    const { data, error } = await supabase
      .from('study_outcomes').upsert(row, { onConflict: 'id' }).select().single();
    check(data, error, 'saveOutcome');
    return { ...outcome, _sampleScore: sample_score, _biasP: bias_penalty, _ws: weighted_score };
  },

  async saveOutcomes(projectId, outcomes) {
    await Promise.all((outcomes || []).map(o => this.saveOutcome(projectId, o)));
    return outcomes;
  },

  async deleteOutcome(projectId, outcomeId) {
    const { error } = await supabase
      .from('study_outcomes').delete().eq('id', outcomeId).eq('project_id', projectId);
    check(null, error, 'deleteOutcome');
  },

  // ── REFERENCES ───────────────────────────────────────────────────────────

  async listRefs(projectId) {
    const { data, error } = await supabase
      .from('study_references').select('*').eq('project_id', projectId)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    return check(data, error, 'listRefs');
  },

  async saveRef(projectId, ref) {
    const orgId = await getOrgId();
    const { data, error } = await supabase
      .from('study_references')
      .upsert({ ...ref, project_id: projectId, org_id: orgId }, { onConflict: 'id' })
      .select().single();
    return check(data, error, 'saveRef');
  },

  async saveRefs(projectId, refs) {
    await Promise.all((refs || []).map(r => this.saveRef(projectId, r)));
    return refs;
  },

  async deleteRef(projectId, refId) {
    const { error } = await supabase
      .from('study_references').delete().eq('id', refId).eq('project_id', projectId);
    check(null, error, 'deleteRef');
  },

  // ── VALIDATION ────────────────────────────────────────────────────────────

  async validate(projectId) {
    const [outcomesRes, refsRes, mcidRes] = await Promise.all([
      supabase.from('study_outcomes').select('*').eq('project_id', projectId),
      supabase.from('study_references').select('*').eq('project_id', projectId),
      supabase.from('mcid_references').select('outcome_measure').eq('is_global', true),
    ]);
    const outcomes = outcomesRes.data || [];
    const refs = refsRes.data || [];
    const mcidNames = (mcidRes.data || []).map(m => m.outcome_measure.toLowerCase());
    const issues = [], warnings = [];

    outcomes.forEach(o => {
      if (o.mcid_met === 'Yes') {
        const name = (o.outcome_name || '').toLowerCase();
        const found = mcidNames.some(m =>
          name.includes(m.split('(')[0].trim()) || m.includes(name.split('(')[0].trim())
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
    const orgId = await getOrgId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('generated_papers')
      .insert({ project_id: projectId, org_id: orgId, generated_by: user.id, status: 'pending' })
      .select().single();
    check(data, error, 'startGeneration');
    return data.id;
  },

  async pollJob(jobId) {
    const { data, error } = await supabase
      .from('generated_papers').select('*').eq('id', jobId).single();
    if (error) return null;
    return {
      id: data.id, status: data.status, stage: data.stage, pct: data.pct,
      log: data.log || [],
      result: data.status === 'done' ? {
        word_count: data.word_count, veracity: data.veracity_score, tables: data.tables_count,
        docx_url: data.docx_path ? `${supabaseUrl}/storage/v1/object/sign/papers/${data.docx_path}` : '#',
        pdf_url: data.pdf_path ? `${supabaseUrl}/storage/v1/object/sign/papers/${data.pdf_path}` : '#',
      } : null,
    };
  },

  // ── CLINICAL STUDIES ─────────────────────────────────────────────────────

  async listStudies() {
    const { data, error } = await supabase
      .from('clinical_studies')
      .select('*, study_invitations(doctor_email, doctor_name, authenticated, committed, committed_at)')
      .order('created_at', { ascending: false });
    check(data, error, 'listStudies');
    return (data || []).map(normalizeStudy);
  },

  // Doctor-specific: list only studies this doctor is invited to
  async listDoctorStudies(email) {
    const { data, error } = await supabase
      .from('study_invitations')
      .select('*, clinical_studies(*)')
      .eq('doctor_email', email.toLowerCase());
    if (error) {
      console.warn('[listDoctorStudies]', error.message);
      return [];
    }
    return (data || [])
      .filter(row => row.clinical_studies)
      .map(row => ({
        ...normalizeStudy(row.clinical_studies),
        invitedDoctors: [{
          email: row.doctor_email,
          name: row.doctor_name || '',
          authenticated: row.authenticated || false,
          committed: row.committed || false,
        }],
      }));
  },

  async createStudy(study) {
    const orgId = await getOrgId();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('clinical_studies')
      .insert({
        title: study.title,
        description: study.description || null,
        compound: study.compound || null,
        target_sample_size: study.targetSampleSize || 50,
        duration: study.duration || '12 weeks',
        status: study.status || 'recruiting',
        org_id: orgId,
        created_by: user.id,
      })
      .select().single();
    check(data, error, 'createStudy');

    // Insert invitation rows for each invited doctor
    const doctors = (study.invitedDoctors || []).filter(d => d.email);
    if (doctors.length > 0) {
      await supabase.from('study_invitations').insert(
        doctors.map(d => ({
          study_id: data.id,
          org_id: orgId,
          doctor_email: d.email.toLowerCase(),
          doctor_name: d.name || null,
        }))
      );
    }

    return normalizeStudy({
      ...data,
      study_invitations: doctors.map(d => ({
        doctor_email: d.email, doctor_name: d.name || '',
        authenticated: false, committed: false,
      })),
    });
  },

  async updateStudy(id, updates) {
    const dbUpdates = { ...updates };
    if (updates.targetSampleSize !== undefined) {
      dbUpdates.target_sample_size = updates.targetSampleSize;
      delete dbUpdates.targetSampleSize;
    }
    delete dbUpdates.invitedDoctors;
    delete dbUpdates.study_invitations;
    const { data, error } = await supabase
      .from('clinical_studies').update(dbUpdates).eq('id', id).select().single();
    return check(data, error, 'updateStudy');
  },

  async deleteStudy(id) {
    const { error } = await supabase.from('clinical_studies').delete().eq('id', id);
    check(null, error, 'deleteStudy');
  },

  // ── DOCTOR PATIENTS ───────────────────────────────────────────────────────

  async listPatients(studyId) {
    const { data, error } = await supabase
      .from('doctor_patients')
      .select('*, patient_weekly_logs(*)')
      .eq('study_id', studyId)
      .order('created_at', { ascending: true });
    check(data, error, 'listPatients');
    return (data || []).map(normalizePatient);
  },

  async savePatient(patient) {
    const { data: { user } } = await supabase.auth.getUser();

    // Use the study's org_id so the researcher can see the patient via their own org policy
    let orgId;
    try {
      const { data: study } = await supabase
        .from('clinical_studies').select('org_id').eq('id', patient.studyId).single();
      orgId = study?.org_id;
    } catch (_) {}
    if (!orgId) orgId = await getOrgId();

    const row = {
      study_id: patient.studyId,
      org_id: orgId,
      doctor_id: user.id,
      patient_id: patient.patientId,
      age: patient.age ? parseInt(patient.age) : null,
      gender: patient.gender || null,
      symptom1: patient.symptom1 || null,
      symptom2: patient.symptom2 || null,
      baseline_score1: patient.baselineScore1 ? parseFloat(patient.baselineScore1) : null,
      baseline_score2: patient.baselineScore2 ? parseFloat(patient.baselineScore2) : null,
      study_type: patient.studyType || null,
      quality_score: patient.qualityScore ? parseInt(patient.qualityScore) : null,
      primary_compound: patient.primaryCompound || null,
      primary_dose: patient.primaryDose || null,
      primary_dose_unit: patient.primaryDoseUnit || 'mg',
      primary_frequency: patient.primaryFrequency || null,
      primary_form: patient.primaryForm || null,
      secondary_compound: patient.secondaryCompound || null,
      secondary_dose: patient.secondaryDose || null,
      secondary_dose_unit: patient.secondaryDoseUnit || null,
      secondary_frequency: patient.secondaryFrequency || null,
      target_duration: patient.targetDuration || null,
      doctor_name: patient.doctorName || null,
      doctor_clinic: patient.doctorClinic || null,
      doctor_reg_number: patient.doctorRegNumber || null,
      status: patient.status || 'active',
      outcome: patient.outcome || null,
    };

    // Determine insert vs update: IDs starting with "PAT-" are temp/client IDs → insert
    const isNew = !patient.id || patient.id.startsWith('PAT-');
    let data, error;
    if (isNew) {
      ({ data, error } = await supabase.from('doctor_patients').insert(row).select().single());
    } else {
      ({ data, error } = await supabase
        .from('doctor_patients').update(row).eq('id', patient.id).select().single());
    }
    check(data, error, 'savePatient');

    // Return with existing weeklyLogs intact (logs are saved separately via saveWeeklyLog)
    return normalizePatient({ ...data, patient_weekly_logs: [] });
  },

  async deletePatient(patientId) {
    const { error } = await supabase.from('doctor_patients').delete().eq('id', patientId);
    check(null, error, 'deletePatient');
  },

  // ── WEEKLY LOGS ───────────────────────────────────────────────────────────

  async saveWeeklyLog(patientId, log) {
    const row = {
      patient_id: patientId,
      week: log.week,
      log_date: log.date || log.log_date || null,
      response: log.response || null,
      score1: log.score1 != null ? Number(log.score1) : null,
      score2: log.score2 != null ? Number(log.score2) : null,
      side_effects: log.sideEffects || log.side_effects || [],
      side_effect_severity: log.sideEffectSeverity || log.side_effect_severity || null,
      dose_adjusted: log.doseAdjusted || log.dose_adjusted || false,
      new_dose: log.newDose || log.new_dose || null,
      notes: log.notes || null,
    };
    if (log.id) row.id = log.id;

    const { data, error } = await supabase
      .from('patient_weekly_logs')
      .upsert(row, { onConflict: log.id ? 'id' : 'patient_id,week' })
      .select().single();
    return check(data, error, 'saveWeeklyLog');
  },

  async deleteWeeklyLog(logId) {
    const { error } = await supabase.from('patient_weekly_logs').delete().eq('id', logId);
    check(null, error, 'deleteWeeklyLog');
  },

  // ── PAPERS ────────────────────────────────────────────────────────────────
  // All methods return the same normalised flat shape used by the UI so the
  // frontend never touches raw DB rows directly.

  // Normalise a paper_versions row → UI shape
  _normVersion(v, paper) {
    return {
      id: v.id,
      groupId: v.paper_id,
      title: paper?.title || '',
      compound: paper?.compound || '',
      status: 'published',
      version: v.version_number,
      htmlContent: v.html_content || '',
      fileName: v.file_name || '',
      fileData: v.file_data || '',
      fileSize: v.file_size || 0,
      notes: v.notes || '',
      metadata: v.metadata || {},
      basedOnVersion: v.based_on_version || null,
      isCurrent: v.is_current,
      publishedAt: v.published_at ? new Date(v.published_at).getTime() : null,
      updatedAt: v.published_at ? new Date(v.published_at).getTime() : null,
      createdAt: paper?.created_at ? new Date(paper.created_at).getTime() : null,
    };
  },

  // Normalise a paper_drafts row → UI shape
  // dynamicNext: pass the live-computed MAX(version)+1 so it stays accurate after sibling publishes
  _normDraft(d, paper, dynamicNext) {
    return {
      id: d.id,
      groupId: d.paper_id,
      title: d.title || paper?.title || '',
      compound: d.compound || paper?.compound || '',
      status: 'draft',
      version: null,
      nextVersion: dynamicNext ?? d.next_version_number,
      basedOnVersion: d.source_version_number || null,
      htmlContent: d.html_content || '',
      fileName: d.file_name || '',
      fileData: d.file_data || '',
      fileSize: d.file_size || 0,
      notes: d.notes || '',
      metadata: d.metadata || {},
      publishedAt: null,
      updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : null,
      createdAt: d.created_at ? new Date(d.created_at).getTime() : null,
    };
  },

  // Returns a unified flat array of drafts + published versions.
  // If projectId is provided, scopes to that project; otherwise returns all org papers.
  async listPapers(projectId) {
    const orgId = await getOrgId();

    let papersQuery = supabase.from('papers').select('*').eq('org_id', orgId);
    if (projectId) papersQuery = papersQuery.eq('project_id', projectId);

    const { data: paperRows, error: pErr } = await papersQuery;
    check(paperRows, pErr, 'listPapers/papers');

    if (!paperRows || paperRows.length === 0) return [];

    const paperIds = paperRows.map(p => p.id);
    const paperMap = Object.fromEntries(paperRows.map(p => [p.id, p]));

    // Fetch all published versions
    const { data: versionRows, error: vErr } = await supabase
      .from('paper_versions')
      .select('*')
      .in('paper_id', paperIds)
      .order('version_number', { ascending: true });
    check(versionRows, vErr, 'listPapers/versions');

    // Fetch all drafts
    const { data: draftRows, error: dErr } = await supabase
      .from('paper_drafts')
      .select('*')
      .in('paper_id', paperIds)
      .order('created_at', { ascending: true });
    check(draftRows, dErr, 'listPapers/drafts');

    // Compute max published version per paper so draft nextVersion is always accurate
    const maxVerPerPaper = {};
    (versionRows || []).forEach(v => {
      maxVerPerPaper[v.paper_id] = Math.max(maxVerPerPaper[v.paper_id] || 0, v.version_number);
    });

    const result = [];
    (versionRows || []).forEach(v => result.push(this._normVersion(v, paperMap[v.paper_id])));
    (draftRows   || []).forEach(d => {
      const dynamicNext = (maxVerPerPaper[d.paper_id] || 0) + 1;
      result.push(this._normDraft(d, paperMap[d.paper_id], dynamicNext));
    });
    return result;
  },

  // Create a new paper group + initial draft (called after generation).
  async createPaperDraft(projectId, data) {
    const orgId = await getOrgId();
    const { data: { user } } = await supabase.auth.getUser();

    // Insert the paper group
    const { data: paper, error: pErr } = await supabase
      .from('papers')
      .insert({
        org_id: orgId,
        project_id: projectId,
        title: data.title || '',
        compound: data.compound || '',
        current_version: 0,
        created_by: user.id,
      })
      .select()
      .single();
    check(paper, pErr, 'createPaperDraft/paper');

    // Insert the draft
    const { data: draft, error: dErr } = await supabase
      .from('paper_drafts')
      .insert({
        paper_id: paper.id,
        org_id: orgId,
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
        created_by: user.id,
      })
      .select()
      .single();
    check(draft, dErr, 'createPaperDraft/draft');

    return this._normDraft(draft, paper);
  },

  // Update a draft's content, notes, or metadata.
  async updatePaperDraft(draftId, data) {
    // Recompute next_version_number from DB to keep it accurate
    const { data: draft, error: fetchErr } = await supabase
      .from('paper_drafts').select('paper_id').eq('id', draftId).single();
    check(draft, fetchErr, 'updatePaperDraft/fetch');

    const { data: maxRow } = await supabase
      .from('paper_versions')
      .select('version_number')
      .eq('paper_id', draft.paper_id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVer = (maxRow?.version_number || 0) + 1;

    const payload = { next_version_number: nextVer, updated_at: new Date().toISOString() };
    if (data.htmlContent !== undefined) payload.html_content = data.htmlContent;
    if (data.fileName    !== undefined) payload.file_name    = data.fileName;
    if (data.fileData    !== undefined) payload.file_data    = data.fileData;
    if (data.fileSize    !== undefined) payload.file_size    = data.fileSize;
    if (data.title       !== undefined) payload.title        = data.title;
    if (data.compound    !== undefined) payload.compound     = data.compound;
    if (data.notes       !== undefined) payload.notes        = data.notes;
    if (data.metadata    !== undefined) payload.metadata     = data.metadata;

    const { data: updated, error } = await supabase
      .from('paper_drafts').update(payload).eq('id', draftId).select().single();
    check(updated, error, 'updatePaperDraft/update');

    const { data: paper } = await supabase
      .from('papers').select('*').eq('id', updated.paper_id).single();
    return this._normDraft(updated, paper);
  },

  // Publish a draft via the security-definer DB function.
  // The function atomically computes the version number, creates the version
  // record, updates papers, and deletes the draft.
  async publishPaperDraft(draftId, htmlContent) {
    // Patch html_content if the caller has unsaved in-memory edits
    if (htmlContent !== undefined) {
      await supabase
        .from('paper_drafts')
        .update({ html_content: htmlContent })
        .eq('id', draftId);
    }

    const { data: version, error } = await supabase
      .rpc('publish_paper_draft', { p_draft_id: draftId });
    check(version, error, 'publishPaperDraft');

    const { data: paper } = await supabase
      .from('papers').select('*').eq('id', version.paper_id).single();
    return this._normVersion(version, paper);
  },

  // Create a revision draft from the current published version via DB function.
  async createPaperRevision(paperId) {
    const { data: draft, error } = await supabase
      .rpc('create_paper_revision', { p_paper_id: paperId });
    check(draft, error, 'createPaperRevision');

    const { data: paper } = await supabase
      .from('papers').select('*').eq('id', draft.paper_id).single();
    return this._normDraft(draft, paper);
  },

  // Delete a draft or a published version by its UI id.
  async deletePaperEntry(id) {
    // Try draft first
    const { data: draft } = await supabase
      .from('paper_drafts').select('id, paper_id').eq('id', id).maybeSingle();
    if (draft) {
      const { error } = await supabase.from('paper_drafts').delete().eq('id', id);
      check(null, error, 'deletePaperEntry/draft');
      // Clean up paper group if no versions and no other drafts remain
      const { data: remaining } = await supabase
        .from('paper_versions').select('id').eq('paper_id', draft.paper_id).limit(1);
      const { data: remainingDrafts } = await supabase
        .from('paper_drafts').select('id').eq('paper_id', draft.paper_id).limit(1);
      if ((!remaining || remaining.length === 0) && (!remainingDrafts || remainingDrafts.length === 0)) {
        await supabase.from('papers').delete().eq('id', draft.paper_id);
      }
      return;
    }

    // Try published version
    const { data: version } = await supabase
      .from('paper_versions').select('id, paper_id').eq('id', id).maybeSingle();
    if (version) {
      const { error } = await supabase.from('paper_versions').delete().eq('id', id);
      check(null, error, 'deletePaperEntry/version');
      // Re-elect current version if needed
      const { data: remaining } = await supabase
        .from('paper_versions').select('id').eq('paper_id', version.paper_id)
        .order('version_number', { ascending: false }).limit(1);
      if (remaining && remaining.length > 0) {
        await supabase.from('paper_versions')
          .update({ is_current: true }).eq('id', remaining[0].id);
      } else {
        // No versions left — clean up paper group if no drafts either
        const { data: remainingDrafts } = await supabase
          .from('paper_drafts').select('id').eq('paper_id', version.paper_id).limit(1);
        if (!remainingDrafts || remainingDrafts.length === 0) {
          await supabase.from('papers').delete().eq('id', version.paper_id);
        }
      }
      return;
    }

    throw new Error(`deletePaperEntry: entry ${id} not found`);
  },
};
