# H&T Vault · Integração com outras IAs (REST e MCP)

## Status

A Edge Function ht-vault foi publicada no projeto Supabase T&H. O banco tem tabela privada vault_api_tokens com hashes SHA-256 e escopos por projeto. O repositório também contém o painel administrativo Integrações.

O deploy foi verificado, mas chamadas autenticadas de um usuário real e cliente MCP externo ainda precisam ser testadas.

## Endpoints

Base: https://ztxxqeifbxnecicgaxpj.supabase.co/functions/v1/ht-vault

- POST /mcp — servidor MCP stateless (JSON-RPC 2.0 / Streamable HTTP).
- GET /search?q=franco — pesquisa, filtrável por project, artist, character, chapter, status, kind, direction, animation_name; máximo 50 resultados por chamada.
- GET /knowledge?q=NPC — conceitos e fichas catalogados, inclusive ainda não importados para o Storage.
- GET /projects — projetos autorizados.
- GET /manifest?id=UUID — metadados de animação e arquivos de um asset.
- GET /download?id=UUID — URL assinada com validade de 60 segundos, somente para tokens com permissão de download.
- GET, POST, DELETE /admin — administração das credenciais, exclusivamente por usuários com papel admin e JWT da sessão Supabase Auth.

Todas as rotas exigem Authorization: Bearer TOKEN. A publishable key do projeto NÃO concede acesso ao conteúdo privado.

## Ferramentas MCP

search_assets, get_asset_manifest, get_asset_download_url, list_projects, search_knowledge.

O endpoint MCP aceita as operações initialize, ping, tools/list, tools/call e notifications/initialized. É uma implementação stateless; não oferece OAuth nem sessões persistentes. Clientes que exigem exclusivamente autenticação OAuth não conseguirão usá-lo sem um adaptador.

## Criando acesso

1. Publique o frontend HTTPS e cadastre o domínio no Supabase Authentication > URL Configuration.
2. Faça login por e-mail e adicione seu usuário à tabela public.memberships como admin.
3. Abra Integrações no site e escolha um nome, os projetos permitidos, a validade e a permissão opcional de download.
4. Copie o token ht_v1_... exibido uma única vez.
5. Configure o servidor MCP HTTP no cliente de IA usando a URL abaixo e o cabeçalho Authorization: Bearer SEU_TOKEN. Não use service_role nem sb_secret_ em ferramentas externas.
6. Revogue tokens não usados pelo painel. A duração máxima é de 90 dias.

Endpoint MCP: https://ztxxqeifbxnecicgaxpj.supabase.co/functions/v1/ht-vault/mcp

## Teste HTTP

Configure a variável de ambiente HT_VAULT_TOKEN com o token copiado. Faça GET na rota /search?q=franco com cabeçalho Authorization: Bearer $HT_VAULT_TOKEN. Nunca inclua token no histórico compartilhado, em URLs ou em commits.

## Segurança

O banco armazena somente hashes de tokens. A função revalida a condição de administrador do criador, a expiração, a revogação e a lista de projetos autorizados. Downloads são opcionais. Assets de direitos restritos (rights_scope=restricted) são omitidos das consultas externas. As imagens permanecem no bucket privado.

URLs assinadas podem ser usadas por qualquer pessoa que tenha o link até expirarem; o período é de 60 segundos. A API não permite que agentes criem, apaguem ou modifiquem assets.

O conhecimento Torii & Hutukara / Salvadores Nacionais indexado no banco não equivale aos arquivos físicos importados. As imagens precisam estar no Storage para que o download funcione.

## Arquivos

- supabase/functions/ht-vault/index.ts — Edge Function REST e MCP
- supabase/mcp-api.sql — credenciais com escopo e revogação
- vault-connectors.js e vault-connectors.css — painel Integrações
- vault-knowledge.js — conhecimento visual e importação ZIP
