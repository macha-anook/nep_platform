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

// Centralized new-vs-existing check, shared by both auth entry points
// (email OTP verification and the Google OAuth session resolved after
// redirect). A user profile row is created for every signup (trigger
// on auth.users insert), but `role` is left NULL until Registration
// completes — so "no role yet" IS "doesn't exist as a full account yet".
function needsRoleFor(profile) {
  return !['doctor', 'researcher'].includes(profile?.role);
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
    // The handle_new_user trigger inserts the profile row synchronously, but a
    // fresh sign-in (esp. the Google OAuth redirect landing) can still race
    // PostgREST's view of it — retry before concluding it's really missing.
    // Without this, a first-time Google sign-in would hit the "deleted user"
    // branch below on the very first request and get bounced back to sign-in.
    let profile = null;
    for (let i = 0; i < 3; i++) {
      const { data: p } = await getClient()
        .from('users').select('full_name, org_id, role').eq('id', session.user.id).single();
      if (p) { profile = p; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    // Profile still missing after retries means the user was actually deleted —
    // clear the stale session.
    if (!profile) {
      await getClient().auth.signOut();
      return null;
    }
    const needsRole = needsRoleFor(profile);
    // Only present for OAuth providers (Google) — nothing to persist it to
    // yet, just surfaced for the registration screen to display if new.
    const avatarUrl = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null;
    return {
      id: session.user.id,
      email: session.user.email,
      name: profile.full_name || session.user.email?.split('@')[0],
      org: profile.org_id,
      role: needsRole ? null : profile.role,
      needsRole,
      avatarUrl,
    };
  },

  // Persists the role (+ name) chosen on first login for accounts created
  // without one — neither Google nor the email-OTP flow ask for a role
  // upfront anymore, both defer to this after the account already exists.
  async completeProfile({ role, fullName }) {
    if (!['doctor', 'researcher'].includes(role)) throw new Error('Invalid role');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const updates = { role };
    if (fullName?.trim()) updates.full_name = fullName.trim();
    const { error } = await supabase.from('users').update(updates).eq('id', user.id);
    if (error) throw new Error(`[completeProfile] ${error.message}`);
    return updates;
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

  // Redirect-based OAuth sign-in. Preserves the current URL's meaningful query
  // params (incl. ?study=/&token= doctor-invite params) so the app can resume
  // the right context after the provider redirects back — but strips any
  // leftover auth hash/params first. Using window.location.href verbatim would
  // bake a stale #access_token=... (e.g. from a Sign Out that didn't clean the
  // URL) into this redirect target, and the next OAuth round-trip appends a
  // fresh token set on top instead of replacing it.
  async signInWithGoogle() {
    const url = new URL(window.location.href);
    ['code', 'error', 'error_code', 'error_description', 'state'].forEach(k => url.searchParams.delete(k));
    url.hash = '';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: url.toString() },
    });
    if (error) throw new Error(`[signInWithGoogle] ${error.message}`);
  },

  // One entry point for any email — Supabase creates the account on first use,
  // signs in as normal otherwise. New-vs-existing is resolved after verifyOtp,
  // the same way it's resolved after a Google redirect (see getCurrentUser).
  async sendOtp(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { shouldCreateUser: true },
    });
    if (error) throw new Error(`[sendOtp] ${error.message}`);
  },

  async verifyOtp(email, token) {
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
    const needsRole = needsRoleFor(profile);
    return {
      id: data.user.id,
      email: data.user.email,
      name: profile?.full_name || email.split('@')[0],
      org: profile?.org_id,
      role: needsRole ? null : profile.role,
      needsRole,
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

  // ── PATIENT FEEDBACK REPORTS ─────────────────────────────────────────────
  // Platform-wide, practitioner-owned — no org scoping (see migration 012).

  async listFeedbackReports() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('patient_feedback_reports')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });
    return check(data || [], error, 'listFeedbackReports');
  },

  async saveFeedbackReport(report) {
    const { data: { user } } = await supabase.auth.getUser();
    const row = {
      created_by: user.id,
      complaints: report.complaints || null,
      medicine: report.medicine,
      feedback_6mo: report.feedback6mo || report.feedback_6mo || null,
      rating: Number(report.rating),
      updated_at: new Date().toISOString(),
    };
    if (report.id) row.id = report.id;

    const { data, error } = await supabase
      .from('patient_feedback_reports')
      .upsert(row, { onConflict: 'id' })
      .select().single();
    return check(data, error, 'saveFeedbackReport');
  },

  async deleteFeedbackReport(id) {
    const { error } = await supabase.from('patient_feedback_reports').delete().eq('id', id);
    check(null, error, 'deleteFeedbackReport');
  },

  async getMedicineEffectiveness() {
    const { data, error } = await supabase.rpc('get_medicine_effectiveness');
    return check(data || [], error, 'getMedicineEffectiveness');
  },

  // ── REFERENCE PAPERS ─────────────────────────────────────────────────────
  // Platform-wide — researchers upload, everyone can view/download.

  async listReferencePapers() {
    const { data, error } = await supabase
      .from('reference_papers')
      .select('*')
      .order('created_at', { ascending: false });
    return check(data || [], error, 'listReferencePapers');
  },

  async uploadReferencePaper({ title, fileName, fileSize, fileType, fileData }) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('reference_papers')
      .insert({
        uploaded_by: user.id,
        title,
        file_name: fileName,
        file_size: fileSize,
        file_type: fileType,
        file_data: fileData,
      })
      .select().single();
    return check(data, error, 'uploadReferencePaper');
  },

  async deleteReferencePaper(id) {
    const { error } = await supabase.from('reference_papers').delete().eq('id', id);
    check(null, error, 'deleteReferencePaper');
  },
};
