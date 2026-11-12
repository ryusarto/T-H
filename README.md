# H&T Vault

Biblioteca central de assets da **H&T**, estúdio de jogos de Ryuchi e Franco, The Sir!, com foco inicial nos projetos dos artistas da IKIRU.

## Conexão T&H (12/11/2026)

O frontend está **pré-configurado** com o projeto Supabase **T&H** (`ztxxqeifbxnecicgaxpj`) usando apenas a **publishable key pública**. Não é necessário informar URL/chave na primeira visita. As migrações `ht_vault_base` e `ht_vault_schema_v2` e o bucket privado `vault` já foram aplicados ao projeto T&H.

O catálogo ainda está vazio e a autenticação depende de duas etapas manuais: hospedar o site em HTTPS e cadastrar essa URL em **Supabase → Authentication → URL Configuration** (Site URL e Redirect URLs); depois, cada membro deve fazer login pelo link recebido e um administrador deve conceder a função na tabela `public.memberships`. O site não publica arquivos privados anonimamente. O botão de compartilhar um pacote gera link interno com autorização H&T.

### Campos e recursos v2
- Relações normalizadas artista → projeto → personagem → asset → animação.
- Metadados: capítulo, cenário, direção, estado, FPS, quadros, referências, créditos, responsável e integração HTML/GitHub.
- Coleções privadas e associação de assets sem duplicar arquivos.
- Prancheta com zoom, histórico de versões e múltiplos arquivos de apoio.
- Montagem de pacote em ZIP (originais + anexos + `manifest.json`) no navegador; links internos de pacotes salvos exigem login.
- Filtros facetados no catálogo com busca e seleção por toque para pacotes.

**Importante:** o ZIP é criado localmente no navegador, não é um ZIP público permanente hospedado na nuvem. Projetos grandes exigem uma etapa posterior com geração de pacotes no servidor, limites de tamanho e distribuição autorizada. A integração com GitHub é por metadados e caminho de destino, **não** faz commit automático de binários.

## Conhecimento dos jogos — importação inicial

Foram indexados **73 materiais** na tabela privada `knowledge_entries` do Supabase T&H: **20** de *Torii & Hutukara* e **53** de *Salvadores Nacionais*. A indexação é um catálogo de metadados; **o bucket privado ainda não contém os binários**.

Os arquivos originais foram reunidos em dois ZIPs para importação local. Cada ZIP contém `manifest.json` (`ht.vault.import.v1`) e `images/` com pranchetas completas; os hashes SHA-256 são verificados pelo importador antes do upload.

### Como colocar os PNGs no Vault

1. Baixe `H&T_TORII_HUTUKARA_ASSETS.zip` e `H&T_SALVADORES_NACIONAIS_ASSETS.zip` nos anexos da conversa de preparação.
2. Abra a versão publicada do site, faça login como membro `editor` ou `admin`.
3. Entre em **Conhecimento → Importar ZIP** e escolha um pacote por vez (recomenda-se desktop por causa do tamanho total).
4. O navegador valida o manifesto e os hashes, envia os originais ao bucket privado `vault`, cadastra em `assets` e mantém a proveniência `source_origin = chatgpt-library`.
5. Verifique os previews e prepare os recortes/frames antes de usar num jogo.

Os materiais foram recuperados da **Library do ChatGPT**, e não dos repositórios `Torii-Hutukara` ou `Salvadores-Nacionais`, que ainda não têm esses arquivos. Itens foram classificados como **conceito/ficha/prancheta a preparar**, não como animações prontas. Referências com pessoas e múltiplas poses exigem revisão artística. O index foi gerado por nomes de arquivos; imagens com nomes genéricos podem precisar de identificação manual.

**Não comitar os PNGs em um GitHub público.** Permissões de artistas e direitos devem ser revisados antes de redistribuir. Para a primeira importação, nenhum arquivo exige chave secreta no navegador; o login e as políticas RLS permitem apenas usuários autorizados.

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
