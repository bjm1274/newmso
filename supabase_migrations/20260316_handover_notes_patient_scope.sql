alter table if exists public.handover_notes
  add column if not exists patient_name text,
  add column if not exists patient_key text,
  add column if not exists note_scope text default 'general';

create index if not exists idx_handover_notes_patient_key
  on public.handover_notes (patient_key);

create index if not exists idx_handover_notes_note_scope
  on public.handover_notes (note_scope);

