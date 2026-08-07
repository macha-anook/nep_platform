-- ============================================================
-- NEP Platform — Researcher Registration & Admin Approval
-- Migration: 012_researcher_registration_and_admin
-- Phase 1 of the AI Research Collaboration Platform enhancements.
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- ADMIN ROLE
-- role='admin' is never settable via completeProfile() or the
-- registration RPCs below — provisioning an admin is a manual,
-- out-of-band `update users set role='admin' where id=...`.
-- ─────────────────────────────────────────────────────────────
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('doctor','researcher','admin'));

create or replace function is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists(select 1 from users where id = auth.uid() and role = 'admin');
$$;

-- ─────────────────────────────────────────────────────────────
-- RESEARCHER REGISTRATIONS
-- Pre-auth application record — no org_id, since the applicant has no
-- organisation until an account exists and their role is approved.
-- ─────────────────────────────────────────────────────────────
create table researcher_registrations (
  id                uuid primary key default uuid_generate_v4(),
  email             text not null unique,
  full_name         text not null,
  affiliation       text,
  orcid             text,
  research_area     text,
  intended_use      text,
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected')),
  reviewed_by       uuid references users(id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  linked_user_id    uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_registrations_updated
  before update on researcher_registrations
  for each row execute function update_updated_at();

alter table researcher_registrations enable row level security;
create policy "registrations_admin_only" on researcher_registrations
  using (is_admin()) with check (is_admin());
-- No self-select policy: applicants have no session at submission time,
-- and post-login status checks go through resolve_my_researcher_registration()
-- (security definer, below) rather than direct table access.

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOG
-- Shared, append-only. Used by registration approval now; later phases
-- (feedback status changes, version provenance) reuse the same table.
-- ─────────────────────────────────────────────────────────────
create table audit_log (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid references organisations(id) on delete cascade,
  actor_id      uuid references users(id),
  actor_email   text,
  entity_type   text not null,
  entity_id     uuid not null,
  action        text not null,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index idx_audit_log_entity on audit_log(entity_type, entity_id);

alter table audit_log enable row level security;
create policy "audit_log_admin_read" on audit_log
  for select using (is_admin());
-- No insert/update/delete policy for regular clients — every row today is
-- written by the security-definer functions below, which bypass RLS as the
-- function owner. Keeps the trail authoritative and tamper-resistant.

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- Delivery log for transactional email. Written by Edge Functions via
-- their service-role client.
-- ─────────────────────────────────────────────────────────────
create table notifications (
  id                  uuid primary key default uuid_generate_v4(),
  org_id              uuid references organisations(id) on delete cascade,
  type                text not null,
  recipient_email     text not null,
  recipient_user_id   uuid references users(id),
  related_entity_type text,
  related_entity_id   uuid,
  subject             text,
  payload             jsonb not null default '{}',
  status              text not null default 'sent' check (status in ('sent','failed')),
  provider_message_id text,
  created_at          timestamptz not null default now()
);
create index idx_notifications_recipient on notifications(recipient_email);

alter table notifications enable row level security;
create policy "notifications_admin_read" on notifications
  for select using (is_admin());

-- ─────────────────────────────────────────────────────────────
-- RPC: submit_researcher_registration
-- Anon-callable — the applicant has no session yet.
-- ─────────────────────────────────────────────────────────────
create or replace function submit_researcher_registration(
  p_email text, p_full_name text, p_affiliation text default null,
  p_orcid text default null, p_research_area text default null,
  p_intended_use text default null
) returns researcher_registrations
language plpgsql security definer set search_path = public as $$
declare
  v_reg researcher_registrations;
begin
  if p_email is null or trim(p_email) = '' or p_full_name is null or trim(p_full_name) = '' then
    raise exception 'Email and full name are required';
  end if;

  insert into researcher_registrations (email, full_name, affiliation, orcid, research_area, intended_use)
  values (lower(trim(p_email)), trim(p_full_name), p_affiliation, p_orcid, p_research_area, p_intended_use)
  returning * into v_reg;

  insert into audit_log (entity_type, entity_id, action, actor_email, metadata)
  values ('registration', v_reg.id, 'submitted', v_reg.email, '{}'::jsonb);

  return v_reg;
exception when unique_violation then
  raise exception 'An application with this email already exists.';
end;
$$;
grant execute on function submit_researcher_registration to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- RPC: resolve_my_researcher_registration
-- Authenticated-only. Reads the caller's OWN status by their session
-- email (never a client-supplied one), and auto-links an approved
-- registration to the now-existing user account.
-- ─────────────────────────────────────────────────────────────
create or replace function resolve_my_researcher_registration()
returns table(status text, rejection_reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_status text;
  v_reason text;
begin
  select email into v_email from users where id = auth.uid();
  if v_email is null then
    return query select 'none'::text, null::text;
    return;
  end if;

  update researcher_registrations r
    set linked_user_id = auth.uid()
    where lower(r.email) = lower(v_email) and r.status = 'approved' and r.linked_user_id is null;

  select r.status, r.rejection_reason into v_status, v_reason
    from researcher_registrations r
    where lower(r.email) = lower(v_email)
    order by r.created_at desc
    limit 1;

  return query select coalesce(v_status, 'none'), v_reason;
end;
$$;
grant execute on function resolve_my_researcher_registration to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RPC: review_registration
-- Admin-only. Approves/rejects, immediately unlocks researcher access on
-- any existing (role IS NULL) account for that email, and audit-logs it.
-- ─────────────────────────────────────────────────────────────
create or replace function review_registration(
  p_registration_id uuid, p_decision text, p_reason text default null
) returns researcher_registrations
language plpgsql security definer set search_path = public as $$
declare
  v_reg researcher_registrations;
begin
  if not is_admin() then
    raise exception 'Only administrators can review registrations';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision: %', p_decision;
  end if;

  update researcher_registrations
    set status = p_decision,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        rejection_reason = case when p_decision = 'rejected' then p_reason else null end
    where id = p_registration_id
    returning * into v_reg;

  if v_reg.id is null then
    raise exception 'Registration not found: %', p_registration_id;
  end if;

  if p_decision = 'approved' then
    update users set role = 'researcher'
      where lower(email) = lower(v_reg.email) and role is null;
    update researcher_registrations
      set linked_user_id = (select id from users where lower(email) = lower(v_reg.email) and role = 'researcher' limit 1)
      where id = v_reg.id and linked_user_id is null;
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'decision_' || p_decision, 'registration', v_reg.id,
          jsonb_build_object('reason', p_reason));

  select * into v_reg from researcher_registrations where id = p_registration_id;
  return v_reg;
end;
$$;
grant execute on function review_registration to authenticated;

-- ─────────────────────────────────────────────────────────────
-- GRANDFATHER EXISTING RESEARCHERS
-- The approval gate must not lock out accounts created under the old
-- self-serve model. Every existing role='researcher' user is backfilled
-- as an already-approved registration (reviewed_by left null — this is a
-- data migration, not a human decision — the audit_log row below records
-- that distinction). Only signups from this point forward hit the gate.
-- ─────────────────────────────────────────────────────────────
insert into researcher_registrations (email, full_name, status, reviewed_at, linked_user_id)
select u.email, coalesce(u.full_name, split_part(u.email, '@', 1)), 'approved', now(), u.id
from users u
where u.role = 'researcher'
on conflict (email) do nothing;

insert into audit_log (org_id, entity_type, entity_id, action, metadata)
select u.org_id, 'registration', rr.id, 'auto_approved_grandfathered',
       jsonb_build_object('reason', 'pre-existing account at approval-gate rollout')
from researcher_registrations rr
join users u on lower(u.email) = lower(rr.email)
where rr.status = 'approved' and rr.reviewed_by is null;
