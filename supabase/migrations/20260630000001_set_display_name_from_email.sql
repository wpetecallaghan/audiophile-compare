-- Update the new-user trigger to derive an initial display_name from the
-- email local-part (the part before @). This means every user gets a name
-- immediately on first sign-in rather than displaying as "Anonymous".
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill display_name for any existing users where it is still null.
update public.users
set display_name = split_part(email, '@', 1)
where display_name is null;
