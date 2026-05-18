-- Adds the per-member setting that controls whether feed post images are eligible for Gallery.

alter table public.profile_settings
  add column if not exists add_post_images_to_gallery boolean not null default true;

alter table public.profile_settings
  add column if not exists setting_control_states jsonb not null default '{}'::jsonb;

create or replace function public.rpc_get_settings_snapshot(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'username', coalesce((select p.username from public.profiles p where p.id = p_user_id), 'member'),
    'email', coalesce((select u.email from auth.users u where u.id = p_user_id), 'member@example.com'),
    'hasRecoveryKeys', coalesce((
      select jsonb_array_length(coalesce(ps.recovery_keys, '[]'::jsonb)) > 0
      from public.profile_settings ps
      where ps.user_id = p_user_id
    ), false),
    'addPostImagesToGallery', coalesce((
      select ps.add_post_images_to_gallery
      from public.profile_settings ps
      where ps.user_id = p_user_id
    ), true),
    'optionStates', coalesce((
      select jsonb_build_object(
        'privacy.Profile visibility', coalesce(ps.setting_control_states->'privacy.Profile visibility', '"Everyone"'::jsonb),
        'privacy.Display name visibility', coalesce(ps.setting_control_states->'privacy.Display name visibility', '"Everyone"'::jsonb),
        'privacy.Location precision', coalesce(ps.setting_control_states->'privacy.Location precision', '"No-one"'::jsonb)
      )
      from public.profile_settings ps
      where ps.user_id = p_user_id
    ), jsonb_build_object(
      'privacy.Profile visibility', 'Everyone',
      'privacy.Display name visibility', 'Everyone',
      'privacy.Location precision', 'No-one'
    ))
  );
$$;

grant execute on function public.rpc_get_settings_snapshot(uuid) to authenticated;
grant execute on function public.rpc_get_settings_snapshot(uuid) to service_role;

create or replace function public.rpc_get_gallery_snapshot()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', 'post-' || p.id::text,
        'title', coalesce(nullif(trim(p.title), ''), 'Untitled capture'),
        'place', coalesce(nullif(trim(pr.location), ''), pr.username, 'BareUnity Community'),
        'src', coalesce(p.media_url, '')
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.posts
    where media_url is not null
      and (post_type is null or post_type <> 'story')
      and coalesce((
        select ps.add_post_images_to_gallery
        from public.profile_settings ps
        where ps.user_id = posts.author_id
      ), true)
    order by created_at desc
    limit 48
  ) p
  left join public.profiles pr on pr.id = p.author_id;
$$;

grant execute on function public.rpc_get_gallery_snapshot() to authenticated;
grant execute on function public.rpc_get_gallery_snapshot() to anon;
grant execute on function public.rpc_get_gallery_snapshot() to service_role;
