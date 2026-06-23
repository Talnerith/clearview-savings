-- Clearview Savings row-level security policies.
--
-- Enforcement model: every caregiver-owned row is reachable only by the
-- caregiver who owns the patient. Service-role connections (used by the
-- patient route group, the seed script, and migrations) bypass RLS by
-- default in Postgres, so this file does NOT define service-role rules.
--
-- Idempotent: safe to re-run.

-- Enable RLS on every public table.
alter table public.caregivers          enable row level security;
alter table public.patients            enable row level security;
alter table public.accounts            enable row level security;
alter table public.transactions        enable row level security;
alter table public.scheduled_deposits  enable row level security;
alter table public.deposit_codes       enable row level security;
alter table public.audit_log           enable row level security;
alter table public.mfa_recovery_codes  enable row level security;

-- Drop existing policies (in case we are re-applying).
drop policy if exists caregivers_self           on public.caregivers;
drop policy if exists patients_owner            on public.patients;
drop policy if exists accounts_owner            on public.accounts;
drop policy if exists transactions_owner        on public.transactions;
drop policy if exists scheduled_deposits_owner  on public.scheduled_deposits;
drop policy if exists deposit_codes_owner       on public.deposit_codes;
drop policy if exists audit_log_owner           on public.audit_log;
drop policy if exists mfa_recovery_codes_owner  on public.mfa_recovery_codes;

-- A user sees only their own caregiver row.
create policy caregivers_self on public.caregivers
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Patients are owned by a caregiver.
create policy patients_owner on public.patients
  for all
  to authenticated
  using (
    caregiver_id in (
      select id from public.caregivers where user_id = auth.uid()
    )
  )
  with check (
    caregiver_id in (
      select id from public.caregivers where user_id = auth.uid()
    )
  );

-- Accounts inherit ownership through patients.
create policy accounts_owner on public.accounts
  for all
  to authenticated
  using (
    patient_id in (
      select p.id
      from public.patients p
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  )
  with check (
    patient_id in (
      select p.id
      from public.patients p
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  );

-- Transactions inherit ownership through accounts → patients.
create policy transactions_owner on public.transactions
  for all
  to authenticated
  using (
    account_id in (
      select a.id
      from public.accounts a
      join public.patients p on p.id = a.patient_id
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  )
  with check (
    account_id in (
      select a.id
      from public.accounts a
      join public.patients p on p.id = a.patient_id
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  );

-- Scheduled deposits: same chain.
create policy scheduled_deposits_owner on public.scheduled_deposits
  for all
  to authenticated
  using (
    account_id in (
      select a.id
      from public.accounts a
      join public.patients p on p.id = a.patient_id
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  )
  with check (
    account_id in (
      select a.id
      from public.accounts a
      join public.patients p on p.id = a.patient_id
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  );

-- Deposit codes: same as patients.
create policy deposit_codes_owner on public.deposit_codes
  for all
  to authenticated
  using (
    patient_id in (
      select p.id
      from public.patients p
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  )
  with check (
    patient_id in (
      select p.id
      from public.patients p
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  );

-- Audit log rows are written with caregiver_id stamped at insert; scope by
-- direct caregiver ownership (no join chain). Defense-in-depth — the
-- audit-log writer in lib/audit-log.ts already scopes every insert by the
-- caller's current caregiver row, but the policy guards against any future
-- code path that forgets to.
create policy audit_log_owner on public.audit_log
  for all
  to authenticated
  using (
    caregiver_id in (
      select id from public.caregivers where user_id = auth.uid()
    )
  )
  with check (
    caregiver_id in (
      select id from public.caregivers where user_id = auth.uid()
    )
  );

-- MFA recovery codes: scoped by direct caregiver ownership, same shape as
-- audit_log_owner. Defense-in-depth — the recovery-code lib in
-- lib/mfa/recovery-codes.ts scopes every query by the caller's current
-- caregiver row; the policy guards the day a query reaches the Supabase
-- JS data path. Hashes only; no plaintext ever stored.
create policy mfa_recovery_codes_owner on public.mfa_recovery_codes
  for all
  to authenticated
  using (
    caregiver_id in (
      select id from public.caregivers where user_id = auth.uid()
    )
  )
  with check (
    caregiver_id in (
      select id from public.caregivers where user_id = auth.uid()
    )
  );
