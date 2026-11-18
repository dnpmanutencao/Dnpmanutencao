-- =====================================================================
-- Pedreira Ibiúna · Gestão Operacional — banco de dados (Supabase)
-- Rode este arquivo inteiro no Supabase: SQL Editor → New query → Run.
-- Pode ser executado de novo sem perder dados (é idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  matricula     text not null unique,
  nome          text not null,
  papeis        text[] not null default '{}',
  admin         boolean not null default false,
  ativo         boolean not null default true,
  trocar_senha  boolean not null default true,
  criado_em     timestamptz not null default now(),
  constraint papeis_validos check (papeis <@ array['manutencao','almoxarife','compras','supervisor','gerente']::text[])
);

-- Todos os lançamentos do app ficam aqui: uma linha por documento (coleção + id).
create table if not exists public.docs (
  col         text not null,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (col, id)
);
create index if not exists docs_col_data on public.docs (col, ((data->>'data')));

-- Trilha de auditoria: quem mudou o quê e quando (somente leitura no app).
create table if not exists public.auditoria (
  id       bigserial primary key,
  em       timestamptz not null default now(),
  usuario  uuid,
  col      text,
  doc_id   text,
  acao     text,
  antes    jsonb,
  depois   jsonb
);
create index if not exists auditoria_doc on public.auditoria (col, doc_id);

-- ---------------------------------------------------------------------
-- Funções de apoio (papéis)
-- ---------------------------------------------------------------------
create or replace function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo);
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo and admin);
$$;

-- Administrador e gerente têm todos os papéis.
create or replace function public.tem_papel(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis
                 where id = auth.uid() and ativo
                   and (admin or 'gerente' = any(papeis) or p = any(papeis)));
$$;

create or replace function public.alcada() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(data->>'alcada','')::numeric from docs where col = 'cfg' and id = 'geral'), 5000);
$$;

create or replace function public.total_rc(d jsonb) returns numeric
language sql immutable as $$
  select coalesce(sum(coalesce((i->>'qtd')::numeric,0) * coalesce((i->>'valorUnit')::numeric,0)), 0)
  from jsonb_array_elements(coalesce(d->'itens','[]'::jsonb)) i;
$$;

-- ---------------------------------------------------------------------
-- Regras de permissão por papel (conferidas no servidor)
-- ---------------------------------------------------------------------
create or replace function public.docs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c      text := coalesce(new.col, old.col);
  uid    uuid := auth.uid();
  o      jsonb := case when tg_op <> 'INSERT' then old.data end;
  n      jsonb := case when tg_op <> 'DELETE' then new.data end;
  autor  text := coalesce(o->>'por', n->>'por');
  so     text := o->>'status';
  sn     text := n->>'status';
  proprio boolean;
  total  numeric;
begin
  if not usuario_ativo() then
    raise exception 'Usuário sem acesso ao sistema.' using errcode = '42501';
  end if;
  proprio := autor is not null and autor = uid::text;

  -- metas e parâmetros
  if c in ('cfg','metas') and not tem_papel('gerente') then
    raise exception 'Somente gerente ou administrador altera metas e parâmetros.' using errcode = '42501';
  end if;

  -- ativos: qualquer pessoa pode só registrar leitura de horímetro
  if c = 'ativos' and not (tem_papel('manutencao') or tem_papel('supervisor')) then
    if not (tg_op = 'UPDATE' and (n - 'hor' - 'horData') = (o - 'hor' - 'horData')) then
      raise exception 'Cadastro de ativos: somente Manutenção ou Supervisor.' using errcode = '42501';
    end if;
  end if;

  -- planos: qualquer pessoa pode só atualizar a última execução (ao concluir a OS)
  if c = 'planos' and not (tem_papel('manutencao') or tem_papel('supervisor')) then
    if not (tg_op = 'UPDATE' and (n - 'ultima') = (o - 'ultima')) then
      raise exception 'Planos de manutenção: somente Manutenção ou Supervisor.' using errcode = '42501';
    end if;
  end if;

  if c = 'rotinas' and not (tem_papel('manutencao') or tem_papel('supervisor')) then
    raise exception 'Rotinas de inspeção: somente Manutenção ou Supervisor.' using errcode = '42501';
  end if;

  -- peças: almoxarife; Compras/recebimento pode só atualizar o custo
  if c = 'pecas' and not tem_papel('almoxarife') then
    if not (tg_op = 'UPDATE' and tem_papel('compras') and (n - 'custoUnit') = (o - 'custoUnit')) then
      raise exception 'Cadastro de peças: somente Almoxarife.' using errcode = '42501';
    end if;
  end if;

  -- movimentações de estoque
  if c = 'movimentos' then
    if coalesce(n->>'ref', o->>'ref') = 'MANUAL' and not tem_papel('almoxarife') then
      raise exception 'Entradas, saídas e inventário avulsos: somente Almoxarife.' using errcode = '42501';
    end if;
    if coalesce(n->>'ref', o->>'ref') = 'RC' and not (tem_papel('almoxarife') or tem_papel('compras')) then
      raise exception 'Recebimento de compras: somente Almoxarife ou Compras.' using errcode = '42501';
    end if;
  end if;

  -- lançamentos de produção: alterar ou excluir o de outra pessoa exige supervisor/gerente
  if c in ('viagens','britagem') and tg_op <> 'INSERT' and not proprio and not tem_papel('supervisor') then
    raise exception 'Você só pode alterar os seus próprios lançamentos.' using errcode = '42501';
  end if;
  if c = 'manutencao' and tg_op = 'DELETE' and not proprio and not tem_papel('supervisor') then
    raise exception 'Somente quem abriu a OS ou um supervisor pode excluí-la.' using errcode = '42501';
  end if;
  if c = 'inspecoes' and tg_op <> 'INSERT' and not tem_papel('supervisor') then
    raise exception 'Inspeções registradas só podem ser alteradas por supervisor.' using errcode = '42501';
  end if;

  -- requisições de compra: fluxo de aprovação
  if c = 'requisicoes' then
    if tg_op = 'DELETE' then
      if not e_admin() then raise exception 'Somente o administrador exclui requisições.' using errcode = '42501'; end if;
    elsif tg_op = 'INSERT' then
      if sn <> 'Em aprovação' or (n->>'por') is distinct from uid::text then
        raise exception 'Requisição nova deve ser enviada para aprovação pelo próprio solicitante.' using errcode = '42501';
      end if;
    elsif so is distinct from sn then
      total := total_rc(n);
      if so = 'Em aprovação' and sn in ('Aprovada','Aprovação gerência','Reprovada','Em revisão') then
        if not tem_papel('supervisor') then raise exception 'Somente Supervisor ou Gerente aprova requisições.' using errcode = '42501'; end if;
        if proprio and not e_admin() then raise exception 'Você não pode aprovar a própria requisição.' using errcode = '42501'; end if;
        if sn = 'Aprovada' and total > alcada() and not tem_papel('gerente') then
          raise exception 'Valor acima da alçada do supervisor: precisa da aprovação da gerência.' using errcode = '42501';
        end if;
      elsif so = 'Aprovação gerência' and sn in ('Aprovada','Reprovada','Em revisão') then
        if not tem_papel('gerente') then raise exception 'Somente o Gerente aprova este valor.' using errcode = '42501'; end if;
        if proprio and not e_admin() then raise exception 'Você não pode aprovar a própria requisição.' using errcode = '42501'; end if;
      elsif so = 'Aprovada' and sn = 'Pedido emitido' then
        if not tem_papel('compras') then raise exception 'Somente Compras emite o pedido.' using errcode = '42501'; end if;
      elsif so in ('Pedido emitido','Recebida parcial') and sn in ('Recebida parcial','Recebida') then
        if not (tem_papel('almoxarife') or tem_papel('compras')) then raise exception 'Somente Almoxarife ou Compras registra o recebimento.' using errcode = '42501'; end if;
      elsif so = 'Em revisão' and sn = 'Em aprovação' then
        if not (proprio or tem_papel('gerente')) then raise exception 'Somente o solicitante reenvia a requisição.' using errcode = '42501'; end if;
      elsif sn = 'Cancelada' and so in ('Em aprovação','Aprovação gerência','Em revisão','Aprovada') then
        if not (proprio or tem_papel('gerente')) then raise exception 'Somente o solicitante ou o gerente cancela.' using errcode = '42501'; end if;
      else
        raise exception 'Mudança de situação não permitida: % → %.', so, sn using errcode = '42501';
      end if;
    elsif so = 'Recebida parcial' then
      if not (tem_papel('almoxarife') or tem_papel('compras')) then raise exception 'Somente Almoxarife ou Compras registra o recebimento.' using errcode = '42501'; end if;
    elsif not e_admin() then
      raise exception 'A requisição só muda pelo fluxo de aprovação.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  new.updated_by := uid;
  return new;
end $$;

drop trigger if exists docs_guard on public.docs;
create trigger docs_guard before insert or update or delete on public.docs
  for each row execute function public.docs_guard();

create or replace function public.docs_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (usuario, col, doc_id, acao, antes, depois)
  values (auth.uid(), coalesce(new.col, old.col), coalesce(new.id, old.id), lower(tg_op),
          case when tg_op <> 'INSERT' then old.data end, case when tg_op <> 'DELETE' then new.data end);
  return null;
end $$;

drop trigger if exists docs_audit on public.docs;
create trigger docs_audit after insert or update or delete on public.docs
  for each row execute function public.docs_audit();

-- Mescla campos num documento existente (usado pelo app em "update").
create or replace function public.doc_merge(p_col text, p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update docs set data = data || p_patch where col = p_col and id = p_id;
  if not found then raise exception 'Documento não encontrado.' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Segurança em nível de linha (RLS)
-- ---------------------------------------------------------------------
alter table public.perfis    enable row level security;
alter table public.docs      enable row level security;
alter table public.auditoria enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (usuario_ativo() or id = auth.uid());
drop policy if exists perfis_admin on public.perfis;
create policy perfis_admin on public.perfis for all to authenticated using (e_admin()) with check (e_admin());

drop policy if exists docs_ler on public.docs;
create policy docs_ler on public.docs for select to authenticated using (usuario_ativo());
drop policy if exists docs_gravar on public.docs;
create policy docs_gravar on public.docs for all to authenticated using (usuario_ativo()) with check (usuario_ativo());

drop policy if exists auditoria_ler on public.auditoria;
create policy auditoria_ler on public.auditoria for select to authenticated using (tem_papel('gerente'));

revoke all on public.perfis, public.docs, public.auditoria from anon;
grant select, insert, update, delete on public.perfis, public.docs to authenticated;
grant select on public.auditoria to authenticated;

-- ---------------------------------------------------------------------
-- Usuários: primeiro acesso, senhas
-- ---------------------------------------------------------------------
-- Diz à tela de login se o sistema já tem usuários (para mostrar o "primeiro acesso").
create or replace function public.ha_usuarios() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis);
$$;

-- Cria o primeiro administrador. Só funciona enquanto não houver nenhum usuário.
create or replace function public.criar_primeiro_admin(p_matricula text, p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from perfis) then raise exception 'O sistema já tem administrador.' using errcode = '42501'; end if;
  insert into perfis (id, matricula, nome, papeis, admin, ativo, trocar_senha)
  values (auth.uid(), lower(trim(p_matricula)), trim(p_nome), array['gerente'], true, true, false);
end $$;

-- Liga a conta recém-criada (pelo administrador) ao cadastro do funcionário.
create or replace function public.admin_vincular_usuario(p_user uuid, p_matricula text, p_nome text, p_papeis text[], p_admin boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not e_admin() then raise exception 'Somente o administrador cadastra usuários.' using errcode = '42501'; end if;
  update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_user;
  insert into public.perfis (id, matricula, nome, papeis, admin, ativo, trocar_senha)
  values (p_user, lower(trim(p_matricula)), trim(p_nome), coalesce(p_papeis,'{}'), coalesce(p_admin,false), true, true);
end $$;

-- Administrador redefine a senha de alguém (a pessoa troca no próximo acesso).
create or replace function public.admin_definir_senha(p_user uuid, p_senha text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not e_admin() then raise exception 'Somente o administrador redefine senhas.' using errcode = '42501'; end if;
  if length(coalesce(p_senha,'')) < 6 then raise exception 'A senha precisa ter pelo menos 6 caracteres.'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_user;
  if not found then raise exception 'Usuário não encontrado.'; end if;
  update public.perfis set trocar_senha = true where id = p_user;
end $$;

-- A própria pessoa avisa que já trocou a senha provisória.
create or replace function public.senha_trocada() returns void
language sql security definer set search_path = public as $$
  update perfis set trocar_senha = false where id = auth.uid();
$$;

revoke all on function public.admin_vincular_usuario(uuid,text,text,text[],boolean) from public, anon;
revoke all on function public.admin_definir_senha(uuid,text) from public, anon;
revoke all on function public.criar_primeiro_admin(text,text) from public, anon;
revoke all on function public.senha_trocada() from public, anon;
revoke all on function public.doc_merge(text,text,jsonb) from public, anon;
grant execute on function public.ha_usuarios() to anon, authenticated;
grant execute on function public.criar_primeiro_admin(text,text) to authenticated;
grant execute on function public.admin_vincular_usuario(uuid,text,text,text[],boolean) to authenticated;
grant execute on function public.admin_definir_senha(uuid,text) to authenticated;
grant execute on function public.senha_trocada() to authenticated;
grant execute on function public.doc_merge(text,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Atualização ao vivo entre celulares (Realtime)
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='docs') then
      execute 'alter publication supabase_realtime add table public.docs';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='perfis') then
      execute 'alter publication supabase_realtime add table public.perfis';
    end if;
  end if;
end $$;
