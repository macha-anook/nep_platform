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
  return !['doctor', 'researcher', 'admin'].includes(profile?.role);
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

  // ── RESEARCHER REGISTRATION & ADMIN APPROVAL ────────────────────────────────

  // Anon-callable — the applicant has no session yet.
  async submitResearcherRegistration(data) {
    const { data: reg, error } = await supabase.rpc('submit_researcher_registration', {
      p_email: data.email,
      p_full_name: data.fullName,
      p_affiliation: data.affiliation || null,
      p_orcid: data.orcid || null,
      p_research_area: data.researchArea || null,
      p_intended_use: data.intendedUse || null,
    });
    check(reg, error, 'submitResearcherRegistration');
    try {
      await supabase.functions.invoke('send-registration-ack', {
        headers: { Authorization: `Bearer ${supabaseKey}` },
        body: { registrationId: reg.id, platformUrl: window.location.origin },
      });
    } catch (e) { console.warn('[send-registration-ack]', e.message); }
    return reg;
  },

  // Reads the CALLER's own status server-side (resolve_my_researcher_registration
  // ignores any client-supplied email) — the email param exists only so the
  // Mock adapter has an equivalent signature.
  async getRegistrationStatus(_email) {
    const { data, error } = await supabase.rpc('resolve_my_researcher_registration');
    check(data, error, 'getRegistrationStatus');
    const row = Array.isArray(data) ? data[0] : data;
    return { status: row?.status || 'none', rejectionReason: row?.rejection_reason || null };
  },

  // Admin-only (enforced by RLS on researcher_registrations).
  async listRegistrations(status) {
    let q = supabase.from('researcher_registrations').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    return check(data, error, 'listRegistrations');
  },

  // Admin-only RPC — approves/rejects and unlocks a matching pending account.
  async reviewRegistration(id, { decision, reason }) {
    const { data, error } = await supabase.rpc('review_registration', {
      p_registration_id: id, p_decision: decision, p_reason: reason || null,
    });
    check(data, error, 'reviewRegistration');
    try {
      await supabase.functions.invoke('send-registration-decision', {
        headers: { Authorization: `Bearer ${supabaseKey}` },
        body: { registrationId: id, platformUrl: window.location.origin },
      });
    } catch (e) { console.warn('[send-registration-decision]', e.message); }
    return data;
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
    const role = ['doctor', 'researcher', 'admin'].includes(profile?.role) ? profile.role : 'researcher';
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

  // ── AI DRAFT GENERATION ──────────────────────────────────────────────────
  // The ai_jobs row is inserted here, under the caller's own RLS-scoped
  // session, so its org_id/project_id are trustworthy before the Edge
  // Function (service role) ever reads them — the function is invoked with
  // only the jobId, not fresh project/paper ids from the client.
  async generateAIDraft(projectId, opts = {}) {
    const orgId = await getOrgId();
    const { data: { user } } = await supabase.auth.getUser();
    const { paperId = null, sections = null } = opts;

    const { data: job, error: jobErr } = await supabase
      .from('ai_jobs')
      .insert({
        org_id: orgId, project_id: projectId, paper_id: paperId,
        job_type: 'draft_sections', status: 'pending',
        input_ref: { paperId, sections },
        created_by: user.id,
      })
      .select().single();
    check(job, jobErr, 'generateAIDraft/insert');

    const { data: body, error } = await supabase.functions.invoke('ai-generate', {
      headers: { Authorization: `Bearer ${supabaseKey}` },
      body: { jobId: job.id },
    });
    if (error) throw new Error(error.message || 'AI draft generation failed');
    if (body?.error) throw new Error(body.error);
    return { jobId: job.id, paperId: body.paperId, draftId: body.draftId };
  },

  async pollAIJob(jobId) {
    const { data, error } = await supabase.from('ai_jobs').select('*').eq('id', jobId).single();
    if (error) return null;
    return data;
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
      source: v.source || 'manual',
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
      version: dynamicNext ?? d.next_version_number ?? 1,
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
      source: d.source || 'manual',
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

    // If this paper's latest review cycle was closed (researcher finished
    // collecting feedback and revised), publishing here completes it —
    // feature #9's "New Draft Version" / "Publication" steps. No-op if the
    // paper was never sent for review, or its cycle is still open.
    try { await supabase.rpc('advance_review_cycle_on_publish', { p_paper_id: version.paper_id }); }
    catch (e) { console.warn('[advance_review_cycle_on_publish]', e.message); }

    // Feature #10: "After final research paper generation: Automatically
    // invite same practitioners for validation." Best-effort — a paper
    // that was never sent for practitioner review (no paper_review_invitations
    // rows yet) has no one to re-invite, and that's not a publish failure.
    try { await this.invitePostPublicationValidation(version.paper_id); }
    catch (e) { console.warn('[invitePostPublicationValidation]', e.message); }

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

  // Restore an arbitrary past version into a new editable draft — never
  // rewrites paper_versions history, just branches a fresh draft from it
  // (feature #7: "previous version restoration" / "never overwrite").
  async restorePaperVersion(versionId) {
    const { data: draft, error } = await supabase
      .rpc('restore_paper_version', { p_version_id: versionId });
    check(draft, error, 'restorePaperVersion');

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

  // ── PRACTITIONER REVIEW ──────────────────────────────────────────────────
  // Practitioner = the existing `doctor` role — same cross-org invite-by-email
  // model as study_invitations, just scoped to a paper instead of a study.

  async inviteReviewer(paperId, { email, name }) {
    const orgId = await getOrgId();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    // Cycle bookkeeping is transparent to the researcher — inviting just
    // works, and cycle 1/2/3… advances automatically as review→revise→
    // publish repeats (feature #9).
    const { error: cycleErr } = await supabase.rpc('ensure_open_review_cycle', { p_paper_id: paperId });
    if (cycleErr) throw new Error(`Could not open a review cycle: ${cycleErr.message}`);

    const { data: body, error } = await supabase.functions.invoke('send-review-invite', {
      headers: { Authorization: `Bearer ${supabaseKey}` },
      body: {
        paperId, practitionerEmail: email, practitionerName: name || null,
        platformUrl: window.location.origin,
        researcherEmail: session.user.email,
        orgId, invitedByUserId: session.user.id,
      },
    });
    if (error) throw new Error(error.message || 'Failed to send invitation');
    return body;
  },

  async listReviewInvitations(paperId) {
    const { data, error } = await supabase
      .from('paper_review_invitations').select('*').eq('paper_id', paperId)
      .order('invited_at', { ascending: false });
    return check(data, error, 'listReviewInvitations');
  },

  // Feature #9: full cycle history for a paper — draft → review → revise →
  // publish, repeated. Chronological, oldest first.
  async listReviewCycles(paperId) {
    const { data, error } = await supabase
      .from('paper_review_cycles').select('*').eq('paper_id', paperId)
      .order('cycle_number', { ascending: true });
    return check(data, error, 'listReviewCycles');
  },

  // Explicit "I'm done collecting feedback for this round" action.
  async closeReviewCycle(cycleId) {
    const { data, error } = await supabase.rpc('close_review_cycle', { p_cycle_id: cycleId });
    return check(data, error, 'closeReviewCycle');
  },

  // Practitioner-side: the paper's draft content — reviewers read the
  // work-in-progress draft (feature #4: "review draft papers"), readable via
  // the papers_practitioner_via_invite / paper_drafts_practitioner_via_invite
  // RLS policies (migration 014) rather than org membership.
  async getPaperForReview(paperId) {
    const { data: paper, error: pErr } = await supabase.from('papers').select('*').eq('id', paperId).single();
    if (pErr || !paper) throw new Error('Paper not found or not accessible');
    const { data: draft, error: dErr } = await supabase
      .from('paper_drafts').select('*').eq('paper_id', paperId)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (dErr || !draft) throw new Error('No draft available to review yet');
    return {
      id: paper.id, title: draft.title || paper.title, compound: draft.compound || paper.compound,
      nextVersion: draft.next_version_number, htmlContent: draft.html_content,
      fileName: draft.file_name, fileData: draft.file_data, fileSize: draft.file_size,
    };
  },

  // Validate a token from the invite link before the practitioner has logged in.
  async validateReviewInviteToken(paperId, token) {
    const { data, error } = await supabase.rpc('validate_review_invite_token', {
      p_paper_id: paperId, p_token: token,
    });
    if (error || !data || data.length === 0) return { valid: false };
    return data[0];
  },

  async markReviewInviteAccepted(paperId, email) {
    await supabase.from('paper_review_invitations')
      .update({ invite_status: 'accepted' })
      .eq('paper_id', paperId).eq('practitioner_email', email.toLowerCase());
  },

  // Practitioner-side: every paper this reviewer email has been invited to.
  async listMyReviewInvitations(email) {
    const { data, error } = await supabase
      .from('paper_review_invitations')
      .select('*, papers(title, compound)')
      .eq('practitioner_email', email.toLowerCase());
    if (error) { console.warn('[listMyReviewInvitations]', error.message); return []; }
    return (data || []).map(i => ({
      id: i.id, paperId: i.paper_id, token: i.token,
      title: i.papers?.title || '', compound: i.papers?.compound || '',
      status: i.invite_status, invitedAt: i.invited_at,
    }));
  },

  // Resume an in-progress review, or start a new one against the paper's
  // draft (most recently updated one, if more than one exists).
  //
  // reviewer_name / version_label are denormalized onto the row at creation
  // time (feature #5: "practitioner details" / "paper version" must be
  // stored, not just derived) so they survive paper_draft_id going null
  // once the draft is eventually published and deleted. `iteration` counts
  // this reviewer's prior passes on this paper — real cross-reviewer cycle
  // sync is a later phase (Iterative Review Process).
  async startPaperReview(paperId) {
    const { data: { user } } = await supabase.auth.getUser();
    const email = user.email.toLowerCase();

    const { data: existing } = await supabase
      .from('paper_reviews').select('*')
      .eq('paper_id', paperId).eq('reviewer_email', email).eq('status', 'in_progress')
      .maybeSingle();
    if (existing) return existing;

    const { data: draft, error: dErr } = await supabase
      .from('paper_drafts').select('id, org_id, next_version_number').eq('paper_id', paperId)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (dErr || !draft) throw new Error('No draft available to review yet');

    const { data: invitation } = await supabase
      .from('paper_review_invitations').select('id, practitioner_name')
      .eq('paper_id', paperId).eq('practitioner_email', email).maybeSingle();

    const { count: priorCount } = await supabase
      .from('paper_reviews').select('id', { count: 'exact', head: true })
      .eq('paper_id', paperId).eq('reviewer_email', email);

    const { data: cycle } = await supabase
      .from('paper_review_cycles').select('id')
      .eq('paper_id', paperId).order('cycle_number', { ascending: false }).limit(1).maybeSingle();

    const { data, error } = await supabase
      .from('paper_reviews')
      .insert({
        paper_id: paperId, paper_draft_id: draft.id, org_id: draft.org_id,
        invitation_id: invitation?.id || null, reviewer_email: email,
        reviewer_name: invitation?.practitioner_name || null,
        version_label: `Draft v${draft.next_version_number}`,
        iteration: (priorCount || 0) + 1,
        review_cycle_id: cycle?.id || null,
      })
      .select().single();
    return check(data, error, 'startPaperReview');
  },

  async saveReviewComment(reviewId, comment) {
    const { data: review } = await supabase
      .from('paper_reviews').select('paper_id, org_id').eq('id', reviewId).single();
    if (!review) throw new Error('Review not found');
    const { data, error } = await supabase
      .from('paper_review_comments')
      .insert({
        review_id: reviewId, paper_id: review.paper_id, org_id: review.org_id,
        section_key: comment.sectionKey || null, quoted_text: comment.quotedText || null,
        comment_text: comment.commentText, importance: comment.importance || 'medium',
      })
      .select().single();
    return check(data, error, 'saveReviewComment');
  },

  async listReviewComments(reviewId) {
    const { data, error } = await supabase
      .from('paper_review_comments').select('*').eq('review_id', reviewId)
      .order('created_at', { ascending: true });
    return check(data, error, 'listReviewComments');
  },

  async submitPaperReview(reviewId, { overallComments, recommendation }) {
    const { data, error } = await supabase
      .from('paper_reviews')
      .update({
        overall_comments: overallComments, recommendation,
        status: 'submitted', submitted_at: new Date().toISOString(),
      })
      .eq('id', reviewId).select().single();
    check(data, error, 'submitPaperReview');
    // Best-effort — a notification failure must never fail an already-
    // successful submission from the practitioner's point of view.
    try {
      await supabase.functions.invoke('send-review-submitted-notification', {
        headers: { Authorization: `Bearer ${supabaseKey}` },
        body: { reviewId, platformUrl: window.location.origin },
      });
    } catch (e) { console.warn('[send-review-submitted-notification]', e.message); }
    return data;
  },

  // Researcher-side: every review + its comments for a paper.
  async listPaperFeedback(paperId) {
    const { data, error } = await supabase
      .from('paper_reviews')
      .select('*, paper_review_comments(*)')
      .eq('paper_id', paperId)
      .order('created_at', { ascending: false });
    return check(data, error, 'listPaperFeedback');
  },

  // Centralized feedback repository — every review + comments across every
  // paper in the org, for the cross-paper triage view (feature #5).
  async listAllFeedback() {
    const { data, error } = await supabase
      .from('paper_reviews')
      .select('*, papers(title, compound), paper_review_comments(*)')
      .order('created_at', { ascending: false });
    return check(data, error, 'listAllFeedback');
  },

  // Routed through update_comment_implementation_status (migration 015) so
  // every change is captured in audit_log atomically with the write.
  async updateCommentStatus(commentId, status) {
    const { data, error } = await supabase.rpc('update_comment_implementation_status', {
      p_comment_id: commentId, p_status: status,
    });
    return check(data, error, 'updateCommentStatus');
  },

  // "Maintain complete feedback audit history" — who changed a comment's
  // implementation_status, when, and from what to what.
  async listCommentHistory(commentId) {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('entity_type', 'review_comment').eq('entity_id', commentId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('[listCommentHistory]', error.message); return []; }
    return data || [];
  },

  // "Maintain notification history" (feature #8) — every email this org has
  // been sent (registration, review-submitted, etc.), newest first.
  async listNotifications(type) {
    let q = supabase.from('notifications').select('*').order('created_at', { ascending: false });
    if (type) q = q.eq('type', type);
    const { data, error } = await q;
    if (error) { console.warn('[listNotifications]', error.message); return []; }
    return data || [];
  },

  // ── POST-PUBLICATION VALIDATION ──────────────────────────────────────────
  // Reuses the same practitioners already invited to review this paper
  // (paper_review_invitations) — feature #10's "automatically invite same
  // practitioners for validation."

  async invitePostPublicationValidation(paperId) {
    const orgId = await getOrgId();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const { data: invitees, error: invErr } = await supabase
      .from('paper_review_invitations').select('practitioner_email, practitioner_name').eq('paper_id', paperId);
    check(invitees, invErr, 'invitePostPublicationValidation/invitees');
    if (!invitees.length) throw new Error('No practitioners have reviewed this paper yet — nothing to re-invite');

    const results = await Promise.all(invitees.map(async (p) => {
      try {
        const { data: body, error } = await supabase.functions.invoke('send-validation-invite', {
          headers: { Authorization: `Bearer ${supabaseKey}` },
          body: {
            paperId, practitionerEmail: p.practitioner_email, practitionerName: p.practitioner_name,
            platformUrl: window.location.origin,
            researcherEmail: session.user.email, orgId,
          },
        });
        if (error) throw new Error(error.message || 'Failed to send');
        return { email: p.practitioner_email, success: true, ...body };
      } catch (e) {
        return { email: p.practitioner_email, success: false, error: e.message };
      }
    }));
    return results;
  },

  async validatePpvToken(paperId, token) {
    const { data, error } = await supabase.rpc('validate_ppv_token', {
      p_paper_id: paperId, p_token: token,
    });
    if (error || !data || data.length === 0) return { valid: false };
    return data[0];
  },

  // Practitioner-side inbox, mirrors listMyReviewInvitations.
  async listMyValidationInvitations(email) {
    const { data, error } = await supabase
      .from('post_publication_validations')
      .select('*, papers(title, compound)')
      .eq('practitioner_email', email.toLowerCase());
    if (error) { console.warn('[listMyValidationInvitations]', error.message); return []; }
    return (data || []).map(v => ({
      id: v.id, paperId: v.paper_id,
      title: v.papers?.title || '', compound: v.papers?.compound || '',
      status: v.status, invitedAt: v.invited_at,
    }));
  },

  // Practitioner-side: the final paper + the version it was based on (for
  // "previous version comparison") + a summary of implemented feedback
  // (feature #10's "summary of implemented changes" — sourced from
  // paper_review_comments already marked implemented, not a new dataset).
  async getPaperForValidation(paperId) {
    const { data: paper, error: pErr } = await supabase.from('papers').select('*').eq('id', paperId).single();
    if (pErr || !paper) throw new Error('Paper not found or not accessible');

    const { data: finalVersion, error: vErr } = await supabase
      .from('paper_versions').select('*').eq('paper_id', paperId).eq('is_current', true).single();
    if (vErr || !finalVersion) throw new Error('No published version available');

    const { data: previousVersion } = await supabase
      .from('paper_versions').select('*').eq('paper_id', paperId)
      .lt('version_number', finalVersion.version_number)
      .order('version_number', { ascending: false }).limit(1).maybeSingle();

    const { data: implementedComments } = await supabase
      .from('paper_review_comments').select('section_key, comment_text')
      .eq('paper_id', paperId).eq('implementation_status', 'implemented');

    return {
      id: paper.id, title: paper.title, compound: paper.compound,
      version: finalVersion.version_number, htmlContent: finalVersion.html_content,
      fileName: finalVersion.file_name, fileData: finalVersion.file_data, fileSize: finalVersion.file_size,
      previousVersion: previousVersion ? {
        version: previousVersion.version_number, htmlContent: previousVersion.html_content,
      } : null,
      implementedChanges: implementedComments || [],
    };
  },

  async getMyValidation(paperId) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('post_publication_validations').select('*')
      .eq('paper_id', paperId).eq('practitioner_email', user.email.toLowerCase())
      .order('invited_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('No validation invitation found for this paper');
    return data;
  },

  async submitPostPublicationFeedback(id, { findingValidation, practicalApplicability, recommendations, futureResearchSuggestions }) {
    const { data, error } = await supabase
      .from('post_publication_validations')
      .update({
        finding_validation: findingValidation,
        practical_applicability: practicalApplicability,
        recommendations, future_research_suggestions: futureResearchSuggestions,
        status: 'submitted', submitted_at: new Date().toISOString(),
      })
      .eq('id', id).select().single();
    check(data, error, 'submitPostPublicationFeedback');
    try {
      await supabase.functions.invoke('send-validation-submitted-notification', {
        headers: { Authorization: `Bearer ${supabaseKey}` },
        body: { validationId: id, platformUrl: window.location.origin },
      });
    } catch (e) { console.warn('[send-validation-submitted-notification]', e.message); }
    return data;
  },

  // Consolidated report (feature #10) — reads the security_invoker view, so
  // it's automatically scoped to the caller's own org via RLS.
  async getPostPublicationReport(paperId) {
    const { data, error } = await supabase
      .from('post_publication_report').select('*').eq('paper_id', paperId).maybeSingle();
    if (error) { console.warn('[getPostPublicationReport]', error.message); return null; }
    return data;
  },

  // The researcher-facing "separate post-publication feedback repository"
  // itself (feature #10) — the actual submitted content per practitioner,
  // not just the aggregate counts getPostPublicationReport returns. Scoped
  // to the caller's org via the existing ppv_org_all RLS policy.
  async listPostPublicationValidations(paperId) {
    const { data, error } = await supabase
      .from('post_publication_validations').select('*')
      .eq('paper_id', paperId).order('invited_at', { ascending: false });
    if (error) { console.warn('[listPostPublicationValidations]', error.message); return []; }
    return (data || []).map(v => ({
      id: v.id, practitionerEmail: v.practitioner_email, practitionerName: v.practitioner_name,
      status: v.status,
      findingValidation: v.finding_validation, practicalApplicability: v.practical_applicability,
      recommendations: v.recommendations, futureResearchSuggestions: v.future_research_suggestions,
      invitedAt: v.invited_at, submittedAt: v.submitted_at,
    }));
  },
};
