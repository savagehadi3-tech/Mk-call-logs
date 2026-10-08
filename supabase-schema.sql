-- Supabase SQL Schema for OpenPhone Clinic Call & Review Hub
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Create calls table matching OpenPhone webhook schema
create table if not exists public.calls (
  id text primary key,
  caller_number text not null,
  clinic_number text,
  duration integer default 0,
  status text not null check (status in ('completed', 'missed', 'voicemail')),
  recording_url text,
  voicemail_url text,
  ai_summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create review_requests table
create table if not exists public.review_requests (
  id text primary key,
  patient_name text,
  patient_phone text not null,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'completed', 'failed')),
  rating integer check (rating >= 1 and rating <= 5),
  feedback text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Enable Row Level Security (RLS)
alter table public.calls enable row level security;
alter table public.review_requests enable row level security;

-- 4. Create RLS policies for calls (Public read/insert/update for dashboard & admin)
create policy "Allow anonymous and authenticated read calls"
  on public.calls for select
  using (true);

create policy "Allow anonymous and authenticated insert calls"
  on public.calls for insert
  with check (true);

create policy "Allow anonymous and authenticated update calls"
  on public.calls for update
  using (true);

-- 5. Create RLS policies for review_requests
create policy "Allow anonymous and authenticated read reviews"
  on public.review_requests for select
  using (true);

create policy "Allow anonymous and authenticated insert reviews"
  on public.review_requests for insert
  with check (true);

create policy "Allow anonymous and authenticated update reviews"
  on public.review_requests for update
  using (true);

-- 6. Enable Supabase Realtime publication on calls and review_requests
alter publication supabase_realtime add table public.calls;
alter publication supabase_realtime add table public.review_requests;

-- 7. Insert sample OpenPhone calls
insert into public.calls (id, caller_number, clinic_number, duration, status, recording_url, voicemail_url, ai_summary, created_at)
values
  ('call-init-1', '+1 (555) 234-8901', '+1 (800) 555-0199', 48, 'voicemail', null, 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg', 'Patient reports mild post-operative swelling and low-grade fever following Tuesday knee arthroscopy. Requests prompt physician callback regarding antibiotic adjustment.', now() - interval '18 minutes'),
  ('call-init-2', '+1 (555) 876-5432', '+1 (800) 555-0199', 0, 'missed', null, null, 'Missed triage call after 5 rings. Patient has an upcoming cardiology stress test scheduled for Thursday morning.', now() - interval '55 minutes'),
  ('call-init-3', '+1 (555) 432-1098', '+1 (800) 555-0199', 182, 'completed', 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg', null, 'Routine prescription refill inquiry for Lisinopril 20mg. Refill request electronically routed to CVS Pharmacy #402. Patient confirmed dosage instructions.', now() - interval '110 minutes')
on conflict (id) do nothing;

-- 8. Insert sample review requests
insert into public.review_requests (id, patient_name, patient_phone, status, rating, feedback, created_at)
values
  ('rev-init-1', 'Eleanor Vance', '+1 (555) 234-8901', 'completed', 5, 'Dr. Miller and staff were extremely prompt and caring following my knee arthroscopy.', now() - interval '25 minutes'),
  ('rev-init-2', 'David Chen', '+1 (555) 901-7744', 'delivered', null, null, now() - interval '80 minutes'),
  ('rev-init-3', 'Sarah Jenkins', '+1 (555) 432-1098', 'sent', null, null, now() - interval '140 minutes')
on conflict (id) do nothing;
