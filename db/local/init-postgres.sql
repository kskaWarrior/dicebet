-- Roda uma vez no primeiro boot do container `postgres` (docker-entrypoint-initdb.d),
-- antes de qualquer migration. Só cria o que o GoTrue precisa para subir: o schema
-- `auth` (ele mesmo cria as tabelas dele lá). O role da API e as tabelas do jogo
-- vêm de `node db/migrate.mjs`.
create role supabase_auth_admin login password 'supabase_auth_admin';
create schema auth authorization supabase_auth_admin;
