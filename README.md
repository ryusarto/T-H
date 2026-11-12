# H&T Vault

Biblioteca central de assets da **H&T**, estúdio de jogos de Ryuchi e Franco, The Sir!, com foco inicial nos projetos dos artistas da IKIRU.

## O que é

Uma fonte de verdade para sprites, cenários, animações, props, VFX, UI, áudio e arquivos 3D. O arquivo original fica no **Supabase Storage** (bucket privado); informações pesquisáveis e histórico de versões ficam no **Supabase Postgres**; o código e a documentação ficam neste repositório GitHub.

**Estado: MVP inicial.** Login por link de e-mail, upload, classificação, busca, visualização, download, link interno permanente por asset e exportação de catálogo JSON. O armazenamento em nuvem exige configuração de um projeto Supabase; ainda não há sincronização automática entre arquivos e GitHub, nem conector MCP próprio para ChatGPT.

## Arquivos

- `index.html`: interface web, pronta para hospedagem estática.
- `styles.css`: identidade visual.
- `app.js`: autenticação, catálogo, upload e integração Supabase.
- `supabase/setup.sql`: estrutura de banco, regras de acesso e políticas de Storage.
- `docs/ROADMAP.md`: arquitetura e próximas evoluções.

## Início rápido

1. Crie um projeto em [Supabase](https://supabase.com/).
2. No SQL Editor, execute `supabase/setup.sql`.
3. Em Storage, crie um bucket **privado** com ID `vault` e limite de arquivo de até 50 MB, conforme o limite da conta.
4. No painel Authentication > URL Configuration, configure o endereço do site como Site URL e inclua-o nas Redirect URLs. Mantenha e-mail habilitado para login por link.
5. Hospede os arquivos estáticos por HTTPS (por exemplo, GitHub Pages ou Vercel). Não use `file://`, porque o login por link necessita de URL válida.
6. Abra o site e insira o **Project URL** e a **publishable key** (ou chave anon) do projeto. **Nunca** insira `service_role` ou uma secret key. Essa configuração é armazenada apenas no navegador.
7. Faça login pelo link enviado ao e-mail. O usuário ainda não terá acesso aos arquivos até receber membership.
8. Volte ao SQL Editor e execute, trocando o email:

```sql
insert into public.memberships (user_id, role)
select id, 'admin' from auth.users where email = 'seu@email.com'
on conflict (user_id) do update set role = excluded.role;
```

9. Reabra a aplicação. Ela agora permite o upload de arquivos para a nuvem.

Para convidar Franco ou membros da equipe: peça que façam login uma vez, depois adicione seus e-mails como `editor` no mesmo comando de membership. **Somente os usuários cadastrados na tabela memberships têm acesso aos assets.**

## Fluxo

1. Cadastrar um asset, com artista, projeto, categoria, tags, direitos e arquivo de origem.
2. Criar novas versões com mesmo nome/artista/categoria (o app calcula a próxima versão).
3. Buscar no catálogo e visualizar imagens.
4. Abrir um item por link permanente `?asset=<uuid>` (exige login e autorização).
5. Baixar original ou gerar uma URL temporária de 1 hora (pode ser acessada por qualquer pessoa com o link durante a validade).
6. Exportar metadados JSON para compartilhar o catálogo ou iniciar a integração com engines.

## Limitações conscientes do MVP

- A URL privada do Supabase expira; **não** deve ser inserida diretamente no código de um jogo como link permanente.
- Manifestos JSON exportados são snapshots de metadados, não incluem binários nem credenciais.
- Para puxar assets automaticamente em jogos e no ChatGPT, a fase seguinte incluirá uma API autenticada com manifestos versionados, geração de ZIP/atlas e conector próprio (MCP ou API com autorização).
- Uploads padrão são adequados a arquivos pequenos; para arquivos acima de 6 MB, implemente TUS/resumable upload antes de uso intensivo.
- Ainda não há exclusão, comentários, aprovações, permissões por cliente ou sync com Github. Esses recursos exigem backend e políticas específicas.
- Não adicione credenciais privadas nem material licenciado sem autorização a este repositório **público**.

## Desenvolvimento

Os arquivos são HTML/CSS/JavaScript puros, sem build. Hospede em um servidor HTTP estático, por exemplo `python3 -m http.server 8000` e abra `http://localhost:8000` (adicione esse endereço na lista de URLs de redirecionamento do Supabase).

## Licença

Uso interno da H&T até definição de termos de propriedade intelectual, autorização dos artistas e licenças de redistribuição. O repositório público **não** implica que os assets de artistas sejam livres para uso.
