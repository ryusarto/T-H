# H&T Vault — arquitetura e evolução

## Princípio

**O asset é um produto reutilizável.** Não é apenas um PNG: tem autor, artista, projeto, direito de uso, identidade, versões, arquivos associados e metadados de importação.

## Modelo conceitual

- **Artist**: Ryuchi, Franco, artistas IKIRU e clientes.
- **Universe**: identidade narrativa/visual de um projeto (ex.: Torii e Hutukara).
- **Project**: jogo específico ligado a um artista/universo.
- **Asset**: personagem, cenário, prop, VFX, UI, áudio, 3D.
- **Asset Version**: original imutável + derivados; nunca sobrescrever versão antiga.
- **Animation Set**: estados `idle`, `walk`, `run`, `jump`, `attack`, `hurt`, `special`, `death`, direções e fps.
- **Asset Pack**: coleção de assets de um jogo/episódio/cliente.
- **Release**: manifesto versionado e pacote pronto para engine, com checksums e URLs assinadas sob demanda.

## Separação de responsabilidades

- GitHub: código-fonte, documentação, esquemas e manifestos com referências.
- Supabase Postgres: catálogo, permissões, relações, histórico e metadados.
- Supabase Storage privado: arquivos originais e prévias.
- Site: descoberta, revisão, visualização, upload, download, compartilhamento com controle.
- Futuro backend API: tokens de projeto, manifestos estáveis, geração de spritesheets/ZIP, GitHub App/webhooks, conectores MCP e autorização granular.

Não usar GitHub como bucket principal: a biblioteca é potencialmente muito grande e terá direitos de uso distintos por artista.

## Entregável inicial (MVP)

- [x] Identidade e landing da biblioteca web
- [x] Conexão ao Supabase configurável na interface
- [x] Login magic link
- [x] Associação a membros autorizados via banco
- [x] Upload de originais a Storage privado
- [x] Cadastro com tags/artista/projeto/direitos
- [x] Versionamento simples por chave
- [x] Busca e filtro
- [x] Preview de imagens e download de arquivo
- [x] Deep link do asset (autenticado)
- [x] Export de catálogo JSON (metadados)
- [ ] Criar projeto Supabase e executar setup.sql
- [ ] Publicar site por HTTPS, testar conta da H&T e upload real
- [ ] Testes automatizados / pipeline de deploy
- [ ] Importar assets existentes

Os itens marcados [x] indicam funcionalidade implementada em código, não infraestrutura já provisionada ou homologada.

## Próximas entregas prioritárias

1. **Asset Packs**: agrupamentos por projeto e personagem, suporte a múltiplos arquivos por asset (ex.: PNG + JSON + fonte Aseprite).
2. **Manifesto v1 e API autenticada**: IDs estáveis, hash SHA-256, dimensões, frames, pixel ratio, FPS, pivot/hitbox, URL temporária de download e política de cache.
3. **Publicação**: pacote versionado para Phaser, PixiJS, Godot ou Unity, download ZIP e integrações com repositórios; nunca armazenar token do GitHub no frontend.
4. **ChatGPT e agentes**: endpoint somente leitura com token limitado + MCP servidor, buscas por personagem/projeto/estilo, acesso autorizado aos manifestos e anexos.
5. **Revisão criativa**: aprovação Ryuchi/Franco, comentários, comparação de sprites, estados draft/review/approved/archived.
6. **Segurança e negócios**: organizações/clientes, permissões separadas, rastreabilidade de direitos, backups/restauração, uso faturável/escopo de contratos.

## Exemplo de manifesto futuro

```json
{
  "schema": "ht.asset.v1",
  "id": "ryuchi-percussionista",
  "version": 3,
  "artist": "Ryuchi",
  "kind": "character",
  "files": [{"role":"spritesheet","format":"png","sha256":"..."}],
  "animations": {
    "idle": {"frames": 8, "fps": 10, "directions": ["left","right"]},
    "special": {"frames": 12, "fps": 12, "directions": ["up","down","left","right"]}
  }
}
```

Este JSON é ilustrativo; o MVP atual exporta metadados básicos.

## Futuras ideias de produto

- **Character DNA**: ficha canônica visual com paleta, proporções e referências, para evitar gerar uma versão diferente do mesmo artista a cada projeto.
- **Continuity Check**: validação de tamanho de quadros, paleta, baseline, transparência, FPS e direções faltantes.
- **Sprite Lab**: ferramenta para atlas automático e visualização de animações com onion-skin.
- **World Library**: ambientes reutilizáveis por camadas de parallax, clima e horários.
- **Rights Ledger**: contratos e limites de reutilização para artistas clientes.
- **Provenance**: prompt, ferramenta, origem da imagem e responsáveis pela aprovação.
