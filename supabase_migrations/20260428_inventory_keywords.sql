alter table public.inventory
  add column if not exists keywords text;

comment on column public.inventory.keywords is
  'Comma-separated related search keywords for inventory item suggestions.';

