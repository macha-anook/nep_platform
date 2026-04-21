-- ============================================================
-- NEP Platform — Doctor Cross-Org Access Policies
-- Migration: 003_doctor_access_rls
-- Run after 002_doctor_flow.sql in Supabase SQL Editor
-- ============================================================
-- Doctors sign up through OTP and get their own org via the
-- handle_new_user trigger.  These policies let invited doctors
-- read studies / manage their patients across org boundaries.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- clinical_studies: invited doctors can SELECT their studies
-- ─────────────────────────────────────────────────────────────
create policy "studies_invited_doctor" on clinical_studies
  for select
  using (
    id in (
      select si.study_id
      from study_invitations si
      inner join users u on lower(u.email) = lower(si.doctor_email)
      where u.id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- study_invitations: doctors can SELECT their own invitations
-- ─────────────────────────────────────────────────────────────
create policy "invitations_for_doctor" on study_invitations
  for select
  using (
    lower(doctor_email) = (
      select lower(email) from users where id = auth.uid()
    )
  );

-- Allow doctors to UPDATE their own invitation (mark authenticated/committed)
create policy "invitations_doctor_update" on study_invitations
  for update
  using (
    lower(doctor_email) = (
      select lower(email) from users where id = auth.uid()
    )
  )
  with check (
    lower(doctor_email) = (
      select lower(email) from users where id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- doctor_patients: doctors can manage their own patients
-- (permissive — passes if doctor_id = current user, even if
--  org_id belongs to the researcher's org)
-- ─────────────────────────────────────────────────────────────
create policy "patients_own_doctor" on doctor_patients
  for all
  using (doctor_id = auth.uid())
  with check (doctor_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- patient_weekly_logs: doctors can manage logs for their patients
-- ─────────────────────────────────────────────────────────────
create policy "logs_for_doctor" on patient_weekly_logs
  for all
  using (
    patient_id in (
      select id from doctor_patients where doctor_id = auth.uid()
    )
  );
