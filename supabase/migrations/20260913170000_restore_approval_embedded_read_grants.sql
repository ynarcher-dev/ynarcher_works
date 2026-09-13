-- The approval list/detail endpoints embed these relations in the
-- approval_documents select. Table privileges are checked before their RLS
-- policies, so removing SELECT from either relation makes the whole PostgREST
-- request fail with 42501 / HTTP 403.
grant select on table
  public.approval_recipients,
  public.approval_reads
to authenticated;
