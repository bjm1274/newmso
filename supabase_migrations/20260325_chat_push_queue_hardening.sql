do $$
begin
  if to_regclass('public.chat_push_jobs') is not null then
    alter table public.chat_push_jobs
      add column if not exists next_attempt_at timestamptz,
      add column if not exists dead_lettered_at timestamptz;

    update public.chat_push_jobs
    set next_attempt_at = coalesce(next_attempt_at, created_at, now())
    where next_attempt_at is null;

    alter table public.chat_push_jobs
      alter column next_attempt_at set default now();

    alter table public.chat_push_jobs
      alter column next_attempt_at set not null;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.chat_push_jobs') is not null then
    execute '
      create index if not exists idx_chat_push_jobs_ready
      on public.chat_push_jobs (next_attempt_at, created_at)
      where processed_at is null and dead_lettered_at is null
    ';
  end if;
end
$$;
