-- ============================================================
-- NEP Platform — Practitioner Notifications
-- Migration: 017_practitioner_notifications
-- Phase 8 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- No new tables — the `notifications` table already exists (migration 012,
-- built for the registration ack/decision emails). This migration only
-- extends its visibility so a researcher's own org can read its own
-- notification history (previously admin-only), same additive pattern as
-- audit_log_org_read in migration 015.
-- ============================================================

create policy "notifications_org_read" on notifications
  for select using (org_id = nep_current_org_id());
