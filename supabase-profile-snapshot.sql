-- Profile snapshot RPC for instant profile loading.
-- Run in Supabase SQL editor (or via migration runner) before enabling /api/profile/snapshot RPC fast-path.

create or replace function public.rpc_get_profile_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile jsonb;
  v_posts jsonb;
  v_interests text[];
  v_post_count integer;
  v_friend_count integer;
  v_comment_count integer;
begin
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'bio', p.bio,
    'avatar_url', p.avatar_url,
    'location', p.location
  )
  into v_profile
  from public.profiles p
  where p.id = p_user_id;

  if v_profile is null then
    return jsonb_build_object(
      'profile', null,
      'posts', '[]'::jsonb,
      'interests', '[]'::jsonb,
      'stats', jsonb_build_object('posts', 0, 'friends', 0, 'comments', 0)
    );
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_posts
  from (
    select
      p.id,
      p.title,
      p.content,
      p.media_url,
      p.created_at,
      p.post_type
    from public.posts p
    where p.author_id = p_user_id
      and (p.post_type is null or p.post_type <> 'story')
    order by p.created_at desc
    limit 30
  ) t;

  select coalesce(ps.interests, '{}'::text[])
  into v_interests
  from public.profile_settings ps
  where ps.user_id = p_user_id;

  select count(*)::int into v_post_count
  from public.posts p
  where p.author_id = p_user_id
    and (p.post_type is null or p.post_type <> 'story');

  select count(*)::int into v_friend_count
  from public.friendships f
  where f.user_id = p_user_id;

  select count(*)::int into v_comment_count
  from public.comments c
  where c.author_id = p_user_id;

  return jsonb_build_object(
    'profile', v_profile,
    'posts', v_posts,
    'interests', to_jsonb(coalesce(v_interests[1:8], '{}'::text[])),
    'stats', jsonb_build_object(
      'posts', v_post_count,
      'friends', v_friend_count,
      'comments', v_comment_count
    )
  );
end;
$$;

grant execute on function public.rpc_get_profile_snapshot(uuid) to authenticated;
grant execute on function public.rpc_get_profile_snapshot(uuid) to service_role;

create index if not exists posts_author_created_desc_idx on public.posts (author_id, created_at desc);

create or replace function public.rpc_get_settings_snapshot(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'username', coalesce((select p.username from public.profiles p where p.id = p_user_id), 'member'),
    'email', coalesce((select u.email from auth.users u where u.id = p_user_id), 'member@example.com'),
    'recoveryKeys', coalesce((
      select to_jsonb(
        coalesce(
          (select array_agg(value) from unnest(coalesce(ps.recovery_keys, '{}'::text[])) value limit 10),
          '{}'::text[]
        )
      )
      from public.profile_settings ps
      where ps.user_id = p_user_id
    ), '[]'::jsonb)
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
    order by created_at desc
    limit 48
  ) p
  left join public.profiles pr on pr.id = p.author_id;
$$;

grant execute on function public.rpc_get_gallery_snapshot() to authenticated;
grant execute on function public.rpc_get_gallery_snapshot() to anon;
grant execute on function public.rpc_get_gallery_snapshot() to service_role;
