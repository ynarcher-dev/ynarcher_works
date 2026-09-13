-- The module list embeds program_module_assignees and then users. PostgREST checks
-- table privileges for every embedded relation before RLS, so granting SELECT only
-- on program_modules is not enough for that request.
--
-- Writes remain behind public.set_program_module(), which is the atomic server
-- boundary for replacing assignees. Do not grant INSERT/UPDATE/DELETE here.
do $$
begin
  if not exists (
    select 1
      from pg_class c
     where c.oid = 'public.program_module_assignees'::regclass
       and c.relrowsecurity
  ) then
    raise exception 'RLS must be enabled before exposing program_module_assignees'
      using errcode = '42501';
  end if;
end $$;

grant select on table public.program_module_assignees to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.program_module_assignees
  from anon, authenticated;
