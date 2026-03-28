create or replace function public.prevent_duplicate_staff_member_identity()
returns trigger
language plpgsql
as $$
declare
  normalized_name text;
  normalized_resident_no text;
begin
  normalized_name := nullif(btrim(coalesce(new.name, '')), '');
  normalized_resident_no := nullif(regexp_replace(coalesce(new.resident_no, ''), '[^0-9]', '', 'g'), '');

  if normalized_name is null or normalized_resident_no is null then
    return new;
  end if;

  if exists (
    select 1
    from public.staff_members staff
    where staff.id is distinct from new.id
      and btrim(coalesce(staff.name, '')) = normalized_name
      and regexp_replace(coalesce(staff.resident_no, ''), '[^0-9]', '', 'g') = normalized_resident_no
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate_staff_identity';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_staff_member_identity on public.staff_members;

create trigger trg_prevent_duplicate_staff_member_identity
before insert or update of name, resident_no
on public.staff_members
for each row
execute function public.prevent_duplicate_staff_member_identity();
