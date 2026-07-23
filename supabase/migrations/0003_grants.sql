-- With "automatically expose new tables" disabled in the project settings,
-- no API role gets privileges by default — grants are explicit and minimal.
--
--   service_role  — the Express API; full access (RLS doesn't apply to it)
--   authenticated — browser clients; read-only, rows filtered by RLS policies
--   anon          — no access at all
grant usage on schema public to service_role, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Browser reads (RLS limits them to their own rows). Note: user_seeds is
-- deliberately excluded — unrevealed server seeds must stay API-only.
grant select on public.profiles, public.wallets, public.transactions, public.bets
  to authenticated;
grant update (username) on public.profiles to authenticated;
