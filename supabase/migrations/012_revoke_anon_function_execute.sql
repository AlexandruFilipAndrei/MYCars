revoke all on function public.accept_fleet_invite(uuid, uuid) from public, anon;
grant execute on function public.accept_fleet_invite(uuid, uuid) to authenticated;

revoke all on function public.remove_fleet_access(uuid, uuid) from public, anon;
grant execute on function public.remove_fleet_access(uuid, uuid) to authenticated;

revoke all on function public.get_invite_owner_profiles(uuid[]) from public, anon;
grant execute on function public.get_invite_owner_profiles(uuid[]) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
