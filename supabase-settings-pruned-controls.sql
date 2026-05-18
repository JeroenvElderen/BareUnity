-- Prune removed/unimplemented settings from persisted profile setting state.
-- Keeps only controls that the app currently enforces:
--   - privacy.Profile visibility
--   - privacy.Display name visibility
--   - privacy.Location precision

alter table public.profile_settings
  add column if not exists setting_control_states jsonb not null default '{}'::jsonb;

update public.profile_settings
set
  setting_control_states = jsonb_build_object(
    'privacy.Profile visibility', coalesce(setting_control_states->'privacy.Profile visibility', '"Everyone"'::jsonb),
    'privacy.Display name visibility', coalesce(setting_control_states->'privacy.Display name visibility', '"Everyone"'::jsonb),
    'privacy.Location precision', coalesce(setting_control_states->'privacy.Location precision', '"No-one"'::jsonb)
  ),
  updated_at = now()
where setting_control_states <> jsonb_build_object(
    'privacy.Profile visibility', coalesce(setting_control_states->'privacy.Profile visibility', '"Everyone"'::jsonb),
    'privacy.Display name visibility', coalesce(setting_control_states->'privacy.Display name visibility', '"Everyone"'::jsonb),
    'privacy.Location precision', coalesce(setting_control_states->'privacy.Location precision', '"No-one"'::jsonb)
  );