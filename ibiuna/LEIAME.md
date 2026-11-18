# Pedreira Ibiúna · Gestão Operacional

App de celular/tablet para lançar produção da britagem, viagens, paradas e manutenção
(OS, ativos, estoque, compras com aprovação, planos preventivos e inspeções), com painel gerencial.

- **Telas:** esta pasta, publicada pelo GitHub Pages.
- **Dados e usuários:** planilha do Google Drive **"Pedreira Ibiúna · Banco de dados do app"**
  (uma aba por tipo de lançamento, mais `Usuarios` e `Auditoria`).
- **Servidor:** Google Apps Script **"Pedreira Ibiúna - Servidor do app"** (código em `servidor/Code.gs`),
  implantado como App da Web. Ele confere login por matrícula, as permissões de cada papel e
  registra tudo na aba `Auditoria`.
- **Senhas:** guardadas embaralhadas (hash com sal) na aba `Usuarios` — ninguém consegue lê-las.

## Primeiro acesso

1. Abra o endereço do app. Como ainda não há usuários, aparece **Primeiro acesso**: crie o
   administrador (sua matrícula e senha).
2. Em **Ajustes → Usuários e papéis → + Novo usuário**, cadastre a equipe. O app mostra a senha
   provisória; no primeiro acesso a pessoa cria a senha dela.
3. No celular, abra o endereço e use **Adicionar à tela inicial**.

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

Os papéis também podem ser editados direto na coluna `papeis` da aba `Usuarios`
(ex.: `manutencao, supervisor`). As colunas `admin` e `ativo` aceitam SIM/NÃO.

## Cuidados com a planilha

- **Não compartilhe a planilha** com a equipe: quem edita a planilha consegue mudar dados sem
  passar pelas regras do app. A equipe usa só o app.
- Não renomeie as abas nem as colunas `id` e `json`. As outras colunas são só para leitura humana.
- Para corrigir um lançamento, use o app (fica registrado na auditoria).

## Atualizar o servidor

Se `servidor/Code.gs` mudar: abra o projeto no Apps Script, cole o novo código, salve e use
**Implantar → Gerenciar implantações → Editar (lápis) → Versão: Nova versão → Implantar**.
Assim o endereço continua o mesmo e o `config.js` não precisa mudar.

## Arquivos

- `index.html` — o app (telas e cálculos)
- `backend.js` — login por matrícula e comunicação com o servidor
- `config.js` — endereço do servidor (Apps Script)
- `servidor/Code.gs` — código do servidor
