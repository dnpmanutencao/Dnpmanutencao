# Pedreira Ibiúna · Gestão Operacional

App de celular/tablet para lançar produção da britagem, viagens, paradas, manutenção (OS, ativos,
estoque, compras com aprovação, planos preventivos e inspeções) com painel gerencial.

- **Telas:** esta pasta, publicada pelo GitHub Pages.
- **Usuários e dados:** Supabase (banco PostgreSQL com login). Plano gratuito atende.
- **Login:** matrícula + senha. O administrador cadastra as pessoas e define os papéis.
- **Segurança:** as permissões por papel são conferidas no servidor (arquivo `supabase.sql`),
  e toda alteração fica registrada na tabela `auditoria`.

## Instalação (uma vez, ~15 minutos)

1. **Crie o projeto no Supabase**: entre em <https://supabase.com>, crie uma conta e um projeto
   (região *South America (São Paulo)*). Guarde a senha do banco.
2. **Crie o banco**: no projeto, abra **SQL Editor → New query**, cole todo o conteúdo de
   `supabase.sql` e clique em **Run**. Deve terminar com "Success".
3. **Ajuste o login**: em **Authentication → Sign In / Providers → Email**:
   - desligue **Confirm email** (as matrículas não têm e-mail real);
   - deixe **Allow new users to sign up** ligado (o app usa isso quando o administrador cadastra
     alguém; uma conta criada por fora não acessa nada sem o cadastro feito pelo administrador).
4. **Pegue as chaves**: em **Project Settings → API**, copie a *Project URL* e a *anon public key*
   e cole em `config.js` (`SUPABASE_URL` e `SUPABASE_ANON_KEY`). A chave *anon* pode ficar pública.
   **Nunca** coloque a chave *service_role* neste repositório.
5. **Publique**: no GitHub, **Settings → Pages → Build and deployment → Deploy from a branch →
   `main` / `(root)`**. O app fica em `https://dnpmanutencao.github.io/Dnpmanutencao/ibiuna/`.
6. **Primeiro acesso**: abra o endereço. Como ainda não há usuários, aparece a tela
   **Primeiro acesso** para criar o administrador (sua matrícula e senha).
7. **Cadastre a equipe**: em **Ajustes → Usuários e papéis → + Novo usuário**. O sistema mostra a
   senha provisória para você passar à pessoa; no primeiro acesso ela cria a senha dela.

No celular, abra o endereço no navegador e use **Adicionar à tela inicial** para virar um ícone.

## Papéis

| Papel | O que pode fazer além dos lançamentos |
|---|---|
| (sem papel) | Lançar viagens e britagem, abrir OS, fazer inspeções, criar requisições, registrar horímetro |
| Manutenção | Cadastrar ativos, planos preventivos e rotinas de inspeção |
| Almoxarife | Cadastrar peças, entradas/saídas/inventário, receber compras |
| Compras | Emitir pedido ao fornecedor, receber compras |
| Supervisor | Aprovar requisições até a alçada; corrigir lançamentos de outras pessoas |
| Gerente | Tudo acima, aprovar qualquer valor, alterar metas e parâmetros |
| Administrador | Tudo, e cadastrar/desativar usuários e redefinir senhas |

Ninguém aprova a própria requisição (exceto o administrador).

## Dia a dia

- **Esqueceu a senha:** o administrador usa **Redefinir senha** e passa uma provisória.
- **Funcionário saiu:** **Desativar** — perde o acesso na hora, os lançamentos continuam.
- **Projeto gratuito do Supabase pausa** depois de 7 dias sem nenhum acesso. Com uso diário isso
  não acontece; se pausar, reative no painel do Supabase.
- **Backup:** no Supabase, **Database → Backups** (planos pagos) ou exporte as tabelas `docs` e
  `perfis` em **Table Editor → Export CSV**. O painel do app também baixa CSV do mês.

## Arquivos

- `index.html` — o app (telas e cálculos)
- `backend.js` — login por matrícula, usuários e ligação com o Supabase
- `config.js` — endereço e chave pública do seu projeto Supabase
- `supabase.sql` — tabelas, regras de permissão, auditoria e funções de usuário
