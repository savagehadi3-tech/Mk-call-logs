-- Supabase SQL Schema for Clinic Call & Review Hub
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Create calls table
create table if not exists public.calls (
  id text primary key,
  caller_number text not null,
  call_type text not null check (call_type in ('answered', 'missed', 'voicemail')),
  status text not null default 'callback_needed' check (status in ('pending', 'callback_needed', 'resolved')),
  duration integer,
  recording_url text,
  summary text,
  patient_name text,
  urgency text default 'low',
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

-- 4. Create RLS policies for calls
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

-- 7. Insert sample calls
insert into public.calls (id, caller_number, call_type, status, duration, recording_url, summary, patient_name, created_at)
values
  ('call-init-1', '+1 (555) 234-8901', 'voicemail', 'callback_needed', 48, 'https://actions.google.com/sounds/v1/emergency/ambulance_siren.ogg', 'Patient reports severe post-op swelling and mild fever around incision site following Tuesday knee arthroscopy. Requests urgent callback regarding antibiotic adjustment.', 'Eleanor Vance', now() - interval '18 minutes'),
  ('call-init-2', '+1 (555) 876-5432', 'missed', 'callback_needed', 0, null, 'Missed inbound triage line after 5 rings. Patient has an upcoming cardiology stress test scheduled for Thursday morning.', 'Marcus Brody', now() - interval '55 minutes'),
  ('call-init-3', '+1 (555) 432-1098', 'answered', 'resolved', 182, null, 'Routine prescription refill inquiry for Lisinopril 20mg. Refill request electronically routed to CVS Pharmacy #402. Patient confirmed dosage instructions.', 'Sarah Jenkins', now() - interval '110 minutes')
on conflict (id) do nothing;

-- 8. Insert sample review requests
insert into public.review_requests (id, patient_name, patient_phone, status, rating, feedback, created_at)
values
  ('rev-init-1', 'Eleanor Vance', '+1 (555) 234-8901', 'completed', 5, 'Dr. Miller and staff were extremely prompt and caring following my knee arthroscopy.', now() - interval '25 minutes'),
  ('rev-init-2', 'David Chen', '+1 (555) 901-7744', 'delivered', null, null, now() - interval '80 minutes'),
  ('rev-init-3', 'Sarah Jenkins', '+1 (555) 432-1098', 'sent', null, null, now() - interval '140 minutes')
on conflict (id) do nothing;
