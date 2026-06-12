begin;

alter table public.platform_settings
  add column if not exists sidebar_hidden_items jsonb not null default '[]'::jsonb;

insert into public.platform_settings (id)
values (true)
on conflict (id) do nothing;

commit;
