/*
 * H&T Vault v2 · Premium workflow extension.
 * Requires supabase/upgrade-v2.sql after setup.sql.
 * Keeps all originals private; shareable pack links require H&T membership.
 */
export function installVaultUpgrade(ctx) {
  const {
    $, esc, notice, getDb, getAssets, getUser, getRole, getPreviews,
    renderAssets, openDetail, stableLink, signedUrl, copy, bytes, date
  } = ctx;

  const state = {
    tab: "assets", selected: new Set(), collections: [], collectionAssets: [],
    packs: [], packAssets: [], chosenCollection: "", loadedPack: "", loading: false
  };
  const sel = (id) => $(id);
  const values = (key) => [...new Set(getAssets().map(a => String(a[key] || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,"pt-BR"));
  const tidyName = (name) => String(name || "asset").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,100);
  const labels = {draft:"Rascunho",review:"Em revisão",approved:"Aprovado",archived:"Arquivado"};
  const filters = ["artist","project","character","chapter","scene","animation_name","direction","status"];
  const filterLabels = ["Artista","Projeto","Personagem","Capítulo","Cenário","Animação","Direção","Estado"];

  function mount() {
    const library = sel("libraryScreen");
    const metrics = library.querySelector(".metrics");
    metrics.insertAdjacentHTML("beforebegin",
      '<nav class="vault-tabs" aria-label="Navegação da biblioteca">' +
      '<button type="button" class="vault-tab active" data-vault-tab="assets">✦ <span>Acervo</span></button>' +
      '<button type="button" class="vault-tab" data-vault-tab="collections">◈ <span>Coleções</span></button>' +
      '<button type="button" class="vault-tab" data-vault-tab="packs">▣ <span>Preparar pacote</span></button>' +
      '<div class="vault-tabs-caption">H&T / WORLDS IN PROGRESS</div></nav>');
    const toolbar = library.querySelector(".toolbar");
    toolbar.insertAdjacentHTML("afterend",
      '<div class="facet-toolbar"><button class="facet-toggle" type="button" id="facetToggle">☷ Filtrar por detalhes <span id="facetCount">0 filtros</span></button>' +
      '<div class="facet-grid" id="facetGrid">' +
      filters.map((k,i) => '<label class="facet"><span>'+filterLabels[i]+'</span><select id="facet-'+k+'"><option value="">Todos</option></select></label>').join("") +
      '</div><button type="button" id="clearFacets" class="clear-facets">Limpar filtros ×</button></div>');
    library.querySelector(".library-meta").insertAdjacentHTML("beforebegin",
      '<div id="selectionRibbon" class="selection-ribbon hidden"><strong>Modo pacote</strong><span>Toque nos cards para adicionar ou remover assets</span><em id="selectedCount">0 selecionados</em></div>');
    library.querySelector("#assetGrid").insertAdjacentHTML("afterend",
      '<section id="collectionsPanel" class="vault-panel hidden"><div class="vault-panel-head"><div><span class="eyebrow">ORGANIZE SEUS UNIVERSOS</span><h2>Coleções<span class="accent">.</span></h2><p>Grupos reutilizáveis por artista, jogo ou capítulo.</p></div><button id="newCollectionBtn" class="primary" type="button">+ Nova coleção</button></div><div class="collection-grid" id="collectionGrid"></div></section>' +
      '<section id="packsPanel" class="vault-panel hidden"><div class="vault-panel-head"><div><span class="eyebrow">EXPORT CENTER / H&T</span><h2>Pacotes de assets<span class="accent">.</span></h2><p>Selecione os assets acima e monte um pacote pronto para o seu jogo.</p></div></div>' +
      '<div class="pack-workspace"><div class="pack-form"><label>Nome do pacote<input id="packTitle" placeholder="Salvadores Nacionais · Capítulo 3"></label><label>Projeto<input id="packProject" placeholder="Salvadores Nacionais"></label><label>Compatibilidade<select id="packEngine"><option>HTML / JavaScript</option><option>Phaser</option><option>PixiJS</option><option>Godot</option><option>Unity</option></select></label><label>Notas de integração<textarea id="packNotes" rows="3" placeholder="Resolução, pastas, atenção aos estados da animação..."></textarea></label><div class="pack-actions"><button id="downloadPackBtn" type="button" class="primary">↓ Gerar ZIP + manifest</button><button id="savePackBtn" type="button" class="ghost">◈ Salvar link interno</button></div><p class="micro">ZIP gerado no navegador com os originais autorizados. Links de pacote exigem login H&T; não são links públicos de arquivos.</p></div><div class="pack-list"><div class="pack-list-title"><strong>Selecionados</strong><span id="packCount">0 assets</span></div><div id="packSelectedList" class="pack-selected-list"></div></div></div>' +
      '<div class="saved-packs"><h3>Pacotes salvos</h3><div id="savedPackGrid" class="saved-pack-grid"></div></div></section>');
    const uploadGrid = sel("uploadForm").querySelector(".form-grid");
    uploadGrid.insertAdjacentHTML("beforeend",
      '<div class="field"><label for="assetCharacter">Personagem</label><input id="assetCharacter" placeholder="Franco — Sintetizador"></div>' +
      '<div class="field"><label for="assetChapter">Capítulo</label><input id="assetChapter" placeholder="Capítulo 3"></div>' +
      '<div class="field"><label for="assetScene">Cenário / Ambiente</label><input id="assetScene" placeholder="Templo, estúdio, deserto..."></div>' +
      '<div class="field"><label for="assetAnimation">Animação / Ação</label><input id="assetAnimation" placeholder="idle, run, attack, special..."></div>' +
      '<div class="field"><label for="assetDirection">Direção</label><select id="assetDirection"><option value="">Não se aplica</option><option>front</option><option>back</option><option>left</option><option>right</option><option>up</option><option>down</option><option>all</option></select></div>' +
      '<div class="field"><label for="assetStatus">Estado de aprovação</label><select id="assetStatus"><option value="draft">Rascunho</option><option value="review">Em revisão</option><option value="approved">Aprovado</option><option value="archived">Arquivado</option></select></div>' +
      '<div class="field"><label for="assetFrames">Frames</label><input id="assetFrames" type="number" min="1" max="10000" value="1"></div>' +
      '<div class="field"><label for="assetFps">FPS</label><input id="assetFps" type="number" min="1" max="120" value="12"></div>' +
      '<div class="field"><label for="assetOwner">Responsável</label><input id="assetOwner" placeholder="Ryuchi / Franco / equipe"></div>' +
      '<div class="field"><label for="assetCompat">Compatibilidade (vírgulas)</label><input id="assetCompat" placeholder="HTML, Phaser, Godot"></div>' +
      '<div class="field full"><label for="assetCredits">Créditos</label><input id="assetCredits" placeholder="Arte, animação, direção, fotografia..."></div>' +
      '<div class="field full"><label for="assetReferences">Referências (URLs, uma por linha)</label><textarea id="assetReferences" rows="2" placeholder="https://..."></textarea></div>' +
      '<div class="field full"><label for="assetGithub">Caminho esperado no GitHub / HTML</label><input id="assetGithub" placeholder="assets/characters/ryuchi/idle.png"></div>');
    document.body.insertAdjacentHTML("beforeend",
      '<dialog id="collectionDialog" class="modal vault-small-modal"><form id="collectionForm"><div class="modal-head"><div><span class="eyebrow">H&T / ORGANIZAÇÃO</span><h2>Nova coleção<span class="accent">.</span></h2></div><button type="button" class="icon-button" id="closeCollectionBtn">×</button></div><label for="collectionTitle">Nome da coleção *</label><input id="collectionTitle" required maxlength="160" placeholder="Ryuchi · Todas as animações"><label for="collectionProject">Projeto</label><input id="collectionProject" placeholder="Salvadores Nacionais"><label for="collectionDescription">Descrição</label><textarea rows="3" id="collectionDescription" placeholder="Referências e finalidade..."></textarea><div class="modal-actions"><button type="button" class="ghost" id="cancelCollectionBtn">Cancelar</button><button class="primary" type="submit">Criar coleção</button></div></form></dialog>');

    library.addEventListener("click", e => {
      const tab = e.target.closest("[data-vault-tab]")?.dataset.vaultTab;
      if(tab) setTab(tab);
    });
    sel("facetToggle").addEventListener("click", () => sel("facetGrid").classList.toggle("collapsed"));
    filters.forEach(key => sel("facet-"+key).addEventListener("change", renderAssets));
    sel("clearFacets").addEventListener("click", () => {
      filters.forEach(key => sel("facet-"+key).value = "");
      state.chosenCollection = "";
      renderAssets();
    });
    sel("newCollectionBtn").addEventListener("click", () => {
      if(getRole() === "viewer") return notice("Apenas editores podem criar coleções.",true);
      sel("collectionForm").reset();
      sel("collectionDialog").showModal();
    });
    ["closeCollectionBtn","cancelCollectionBtn"].forEach(id=>sel(id).addEventListener("click",()=>sel("collectionDialog").close()));
    sel("collectionForm").addEventListener("submit", createCollection);
    sel("collectionGrid").addEventListener("click", e => {
      const id = e.target.closest("[data-collection]")?.dataset.collection;
      if(!id) return;
      state.chosenCollection = id;
      setTab("assets");
      renderAssets();
      notice("Mostrando a coleção selecionada.");
    });
    sel("downloadPackBtn").addEventListener("click", downloadPack);
    sel("savePackBtn").addEventListener("click", savePack);
    sel("packSelectedList").addEventListener("click", e => {
      const id = e.target.closest("[data-remove]")?.dataset.remove;
      if(id) toggleSelect(id);
    });
    sel("savedPackGrid").addEventListener("click", e => {
      const id = e.target.closest("[data-pack-id]")?.dataset.packId;
      if(id) openSavedPack(id);
    });
    sel("detailBody").addEventListener("click", onDetailClick);
    sel("detailBody").addEventListener("change", onFileChosen);
  }

  function passes(item) {
    for(const key of filters) {
      const chosen = sel("facet-"+key)?.value;
      if(chosen && String(item[key] || "") !== chosen) return false;
    }
    if(state.chosenCollection && !state.collectionAssets.some(row => row.collection_id === state.chosenCollection && row.asset_id === item.id)) return false;
    return true;
  }
  function fillFilters() {
    filters.forEach((key,i) => {
      const select = sel("facet-"+key);
      const current = select.value;
      const variants = key === "status" ? ["draft","review","approved","archived"] : values(key);
      select.innerHTML = '<option value="">'+filterLabels[i]+': todos</option>' +
        variants.map(v => '<option value="'+esc(v)+'">'+esc(key === "status" ? (labels[v] || v) : v)+'</option>').join("");
      select.value = variants.includes(current) ? current : "";
    });
    const selectedCount = filters.filter(key => sel("facet-"+key).value).length + (state.chosenCollection ? 1 : 0);
    sel("facetCount").textContent = selectedCount + (selectedCount === 1 ? " filtro" : " filtros");
  }
  function syncCards() {
    document.querySelectorAll("#assetGrid .asset-card").forEach(card => {
      card.classList.toggle("pack-picked",state.selected.has(card.dataset.id));
      card.setAttribute("aria-pressed", state.tab === "packs" ? String(state.selected.has(card.dataset.id)) : "false");
    });
  }
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".vault-tab").forEach(btn => btn.classList.toggle("active",btn.dataset.vaultTab === tab));
    sel("collectionsPanel").classList.toggle("hidden",tab !== "collections");
    sel("packsPanel").classList.toggle("hidden",tab !== "packs");
    for(const selector of [".section-header",".toolbar",".facet-toolbar",".library-meta","#assetGrid","#emptyState"]) {
      const el = sel("libraryScreen").querySelector(selector);
      if(el) el.classList.toggle("vault-hidden", tab === "collections");
    }
    sel("selectionRibbon").classList.toggle("hidden",tab !== "packs");
    if(tab === "packs") {
      sel("packTitle").focus({preventScroll:true});
      renderSelection();
    }
    syncCards();
  }
  function handleAssetCardClick(id) {
    if(state.tab !== "packs") return false;
    toggleSelect(id);
    return true;
  }
  function toggleSelect(id) {
    if(state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    syncCards();
    renderSelection();
  }
  function renderSelection() {
    const chosen = [...state.selected].map(id => getAssets().find(a=>a.id===id)).filter(Boolean);
    sel("selectedCount").textContent = chosen.length + " selecionados";
    sel("packCount").textContent = chosen.length + " assets";
    sel("packSelectedList").innerHTML = chosen.length ? chosen.map(a =>
      '<div class="pack-selected-item"><div><strong>'+esc(a.title)+'</strong><small>'+esc(a.artist || "H&T")+' · '+esc(a.project || "Biblioteca")+' · V'+a.version+'</small></div><button type="button" aria-label="Remover do pacote" data-remove="'+esc(a.id)+'">×</button></div>'
    ).join("") : '<div class="placeholder-note">Nenhum asset selecionado. Toque nos cards do acervo acima para incluir sprites, cenários ou animações.</div>';
  }
  async function onLoaded() {
    fillFilters();
    try {
      const db = getDb();
      const response = await Promise.all([
        db.from("collections").select("*").order("created_at",{ascending:false}).limit(250),
        db.from("collection_assets").select("collection_id,asset_id").limit(5000),
        db.from("packs").select("*").order("created_at",{ascending:false}).limit(100),
        db.from("pack_assets").select("pack_id,asset_id,position").limit(5000)
      ]);
      const err = response.find(r=>r.error)?.error;
      if(err) throw err;
      [state.collections,state.collectionAssets,state.packs,state.packAssets] = response.map(r=>r.data || []);
      renderCollections();
      renderSavedPacks();
      const requestedPack = new URLSearchParams(location.search).get("pack");
      if(requestedPack && /^[0-9a-f-]{36}$/i.test(requestedPack)) openSavedPack(requestedPack);
    } catch(err) {
      notice("Recursos avançados precisam do upgrade-v2.sql: "+err.message,true);
    }
    renderSelection();
  }
  function renderCollections() {
    sel("collectionGrid").innerHTML = state.collections.length ? state.collections.map(c => {
      const count = state.collectionAssets.filter(x=>x.collection_id===c.id).length;
      return '<button type="button" class="collection-card" data-collection="'+esc(c.id)+'"><span class="collection-sigil">◈</span><span class="collection-numeral">'+String(count).padStart(2,"0")+' ASSETS</span><h3>'+esc(c.title)+'</h3><p>'+esc(c.description || c.project || "Coleção H&T")+'</p><span class="collection-open">Explorar coleção ↗</span></button>';
    }).join("") : '<div class="placeholder-note">Crie coleções para agrupar personagens, capítulos e versões sem duplicar os arquivos.</div>';
    sel("newCollectionBtn").classList.toggle("hidden",getRole()==="viewer");
  }
  async function createCollection(event) {
    event.preventDefault();
    const db = getDb();
    const data = {
      title: sel("collectionTitle").value.trim(),
      project:sel("collectionProject").value.trim(),
      description:sel("collectionDescription").value.trim(),
      created_by:getUser().id
    };
    if(!data.title) return;
    const {error} = await db.from("collections").insert(data);
    if(error) return notice("Falha ao criar coleção: "+error.message,true);
    sel("collectionDialog").close();
    notice("Coleção criada.");
    await onLoaded();
  }
  async function addToCollection(assetId) {
    const id = sel("detailCollection")?.value;
    if(!id) return notice("Escolha uma coleção.",true);
    const {error} = await getDb().from("collection_assets")
      .insert({collection_id:id,asset_id:assetId,created_by:getUser().id});
    if(error) return notice(error.code === "23505" ? "Asset já pertence à coleção." : error.message,true);
    notice("Asset adicionado à coleção.");
    await onLoaded();
  }
  async function relations() {
    const artist = sel("assetArtist").value.trim();
    const project = sel("assetProject").value.trim();
    const character = sel("assetCharacter").value.trim();
    if(!artist) return {};
    const actorId = await getOrCreate("artists", {name:artist}, {name:artist});
    if(!project) return {artist_id:actorId};
    const projectId = await getOrCreate("projects",{artist_id:actorId,name:project},{artist_id:actorId,name:project});
    if(!character) return {artist_id:actorId,project_id:projectId};
    const characterId = await getOrCreate("characters",{project_id:projectId,name:character},{project_id:projectId,name:character});
    return {artist_id:actorId,project_id:projectId,character_id:characterId};
  }
  async function getOrCreate(table, filter, payload) {
    let query = getDb().from(table).select("id");
    Object.entries(filter).forEach(([key,value]) => query = query.eq(key,value));
    let {data,error} = await query.maybeSingle();
    if(error) throw error;
    if(data) return data.id;
    const result = await getDb().from(table).insert({...payload,created_by:getUser().id}).select("id").single();
    if(result.error) {
      // Another editor may have created the same record concurrently.
      let retry = getDb().from(table).select("id");
      Object.entries(filter).forEach(([key,value]) => retry = retry.eq(key,value));
      const existing = await retry.maybeSingle();
      if(existing.data) return existing.data.id;
      throw result.error;
    }
    return result.data.id;
  }
  function extraFields() {
    const split = v => String(v||"").split(",").map(x=>x.trim()).filter(Boolean);
    const references = sel("assetReferences").value.split(/\r?\n/).map(v=>v.trim()).filter(v=>{
      try { const u=new URL(v); return ["https:","http:"].includes(u.protocol); } catch { return false; }
    }).slice(0,30);
    return {
      character:sel("assetCharacter").value.trim(),
      chapter:sel("assetChapter").value.trim(),
      scene:sel("assetScene").value.trim(),
      animation_name:sel("assetAnimation").value.trim(),
      direction:sel("assetDirection").value,
      status:sel("assetStatus").value,
      owner_name:sel("assetOwner").value.trim(),
      credits:sel("assetCredits").value.trim(),
      compatibility:split(sel("assetCompat").value),
      reference_urls:references,
      github_path:sel("assetGithub").value.trim(),
      frame_count:Number(sel("assetFrames").value) || 1,
      fps:Number(sel("assetFps").value) || 12
    };
  }
  async function afterSave(assetId, metadata) {
    if(!metadata.animation_name) return;
    const {error} = await getDb().from("animation_clips").insert({
      asset_id:assetId,name:metadata.animation_name,direction:metadata.direction || "all",
      frames:metadata.frame_count,fps:metadata.fps,created_by:getUser().id
    });
    if(error) notice("Original salvo; não foi possível registrar o clipe: "+error.message,true);
  }
  function decorateDetail(item) {
    const root = sel("detailBody");
    const history = getAssets().filter(a => a.asset_key === item.asset_key)
      .sort((a,b)=>b.version-a.version);
    root.querySelector(".detail-visual")?.classList.add("sheet-stage");
    root.querySelector(".detail-info")?.insertAdjacentHTML("beforeend",
      info("PERSONAGEM",item.character || "—")+info("CAPÍTULO",item.chapter || "—")+
      info("CENÁRIO",item.scene || "—")+info("ANIMAÇÃO",item.animation_name || "—")+
      info("DIREÇÃO",item.direction || "—")+info("ESTADO",labels[item.status] || item.status || "—")+
      info("FPS / QUADROS",(item.fps || 12)+" fps · "+(item.frame_count || 1)+" frames")+
      info("RESPONSÁVEL",item.owner_name || "—")+
      info("CRÉDITOS",item.credits || "—")+
      info("COMPATIBILIDADE",(item.compatibility || []).join(", ") || "—")+
      info("HTML / GITHUB",item.github_path || "—"));
    root.querySelector(".detail-actions").insertAdjacentHTML("beforebegin",
      '<div class="detail-vault-extra"><div class="detail-minihead"><h3>Prancheta & referências</h3><span>VISUALIZAÇÃO DO ORIGINAL</span></div>'+
      '<label class="zoom-control">Zoom <input type="range" min="50" max="300" value="100" id="detailZoom"></label>' +
      '<div class="reference-links">'+(item.reference_urls || []).map((url,i) => {
        try{const u=new URL(url); if(!["https:","http:"].includes(u.protocol)) return ""; return '<a href="'+esc(u.href)+'" rel="noopener noreferrer" target="_blank">↗ Referência '+(i+1)+'</a>';}catch{return "";}
      }).join("")+'</div>'+
      '<div class="detail-minihead"><h3>Histórico de versões</h3><span>'+history.length+' VERSÕES</span></div>'+
      '<div class="version-row">'+history.map(v=>'<button type="button" class="'+(v.id===item.id?'active':'')+'" data-v2-version="'+esc(v.id)+'">V'+v.version+'</button>').join("")+'</div>'+
      '<div class="detail-minihead"><h3>Arquivos do asset</h3><span>ORIGINAL + ANEXOS</span></div>'+
      '<div class="file-list" id="detailFileList"><div class="file-row"><span>▧ '+esc(item.file_name)+'</span><small>'+bytes(item.file_size)+'</small><button type="button" data-action="download">Download</button></div></div>'+
      (getRole() === "viewer" ? "" : '<label class="attach-file">+ Anexar arquivo de apoio<input type="file" id="detailAttachFile" accept="image/*,.ase,.aseprite,.psd,.json,.zip,.atlas,.glb,.gltf,.wav,.mp3"></label>')+
      '<div class="detail-minihead"><h3>Organização & uso</h3></div>'+
      '<div class="detail-manage"><button class="ghost" type="button" data-v2="toggle-pack">'+(state.selected.has(item.id)?"✓ Remover do pacote":"+ Preparar no pacote")+'</button>'+
      (getRole() === "viewer" ? "" : '<select id="detailCollection"><option value="">Escolher coleção</option>'+state.collections.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.title)+'</option>').join("")+'</select><button class="ghost" type="button" data-v2="add-collection">Adicionar</button>')+
      '</div></div>');
    sel("detailZoom")?.addEventListener("input",e=>{
      const img=root.querySelector(".sheet-stage img");
      if(img) img.style.transform="scale("+(Number(e.target.value)/100)+")";
    });
    loadDetailExtras(item);
  }
  function info(label,value) {
    return '<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>';
  }
  async function loadDetailExtras(item) {
    const [files,clips] = await Promise.all([
      getDb().from("asset_files").select("*").eq("asset_id",item.id).order("created_at"),
      getDb().from("animation_clips").select("*").eq("asset_id",item.id)
    ]);
    if(sel("detailDialog").dataset.assetId !== item.id) return;
    const list = sel("detailFileList");
    if(list && files.data?.length) list.insertAdjacentHTML("beforeend",
      files.data.map(f=>'<div class="file-row"><span>◫ '+esc(f.file_name)+' <small>'+esc(f.role)+'</small></span><small>'+bytes(f.file_size)+'</small><button data-v2-file="'+esc(f.id)+'" type="button">Download</button></div>').join(""));
    const clipsData=clips.data||[];
    if(clipsData.length) {
      const tags = clipsData.map(a=>'<span>'+esc(a.name)+' · '+esc(a.direction)+' · '+a.frames+'f / '+a.fps+'fps</span>').join("");
      sel("detailFileList")?.insertAdjacentHTML("beforebegin",'<div class="clip-strip">'+tags+'</div>');
    }
  }
  async function onDetailClick(e) {
    const version=e.target.closest("[data-v2-version]")?.dataset.v2Version;
    if(version) {openDetail(version);return;}
    const action=e.target.closest("[data-v2]")?.dataset.v2;
    const id=sel("detailDialog").dataset.assetId;
    if(action === "toggle-pack") {
      toggleSelect(id);
      notice(state.selected.has(id) ? "Asset adicionado ao pacote." : "Asset removido do pacote.");
      const button=e.target.closest("[data-v2]");
      button.textContent=state.selected.has(id)?"✓ Remover do pacote":"+ Preparar no pacote";
    }
    if(action === "add-collection") await addToCollection(id);
    const fileId=e.target.closest("[data-v2-file]")?.dataset.v2File;
    if(fileId) {
      const {data,error}=await getDb().from("asset_files").select("*").eq("id",fileId).single();
      if(error) return notice(error.message,true);
      const {data:link,error:err}=await getDb().storage.from("vault").createSignedUrl(data.storage_path,3600,{download:data.file_name});
      if(err) return notice(err.message,true);
      const a=document.createElement("a");
      a.href=link.signedUrl; a.target="_blank";a.rel="noopener noreferrer";a.click();
    }
  }
  async function onFileChosen(e) {
    if(e.target.id !== "detailAttachFile") return;
    const file=e.target.files?.[0];
    if(!file || getRole()==="viewer") return;
    if(file.size > 50*1024*1024) return notice("Limite de 50 MB por arquivo.",true);
    const assetId=sel("detailDialog").dataset.assetId;
    const path=getUser().id+"/"+crypto.randomUUID()+"/"+tidyName(file.name);
    const db=getDb();
    const result=await db.storage.from("vault").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
    if(result.error) return notice("Falha no envio: "+result.error.message,true);
    const saved=await db.from("asset_files").insert({
      asset_id:assetId,role:/\.json$/i.test(file.name)?"metadata":"source",
      storage_path:path,file_name:file.name,mime_type:file.type||"application/octet-stream",
      file_size:file.size,created_by:getUser().id
    });
    if(saved.error) {
      await db.storage.from("vault").remove([path]);
      return notice("Falha no cadastro do anexo: "+saved.error.message,true);
    }
    notice("Arquivo de apoio adicionado.");
    const item=getAssets().find(a=>a.id===assetId);
    if(item) openDetail(assetId);
  }
  function selectedAssets() {
    return [...state.selected].map(id=>getAssets().find(a=>a.id===id)).filter(Boolean);
  }
  function manifest(items,engine) {
    return {
      schema:"ht.asset-pack.v2",generated_at:new Date().toISOString(),
      title:sel("packTitle").value.trim() || "H&T asset pack",
      project:sel("packProject").value.trim(),engine,
      notes:sel("packNotes").value.trim(),
      repository:"https://github.com/ryusarto/T-H",
      rights_notice:"Verifique os direitos de cada asset antes de redistribuir.",
      assets:items.map(a=>({
        id:a.id,key:a.asset_key,version:a.version,title:a.title,
        artist:a.artist,project:a.project,character:a.character,
        chapter:a.chapter,scene:a.scene,kind:a.kind,animation:a.animation_name,
        direction:a.direction,status:a.status,frames:a.frame_count,fps:a.fps,
        credits:a.credits,owner:a.owner_name,rights:a.rights_scope,
        compatibility:a.compatibility || [],reference_urls:a.reference_urls || [],
        github_target:a.github_path,
        original:"assets/"+tidyName(a.asset_key)+"/"+tidyName(a.file_name)
      }))
    };
  }
  async function downloadPack() {
    const items=selectedAssets();
    if(!items.length) return notice("Selecione pelo menos um asset.",true);
    if(state.loading) return;
    state.loading=true;
    const button=sel("downloadPackBtn");
    button.disabled=true;
    button.textContent="Preparando arquivos…";
    try {
      const {default:JSZip}=await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
      const zip=new JSZip();
      const meta=manifest(items,sel("packEngine").value);
      const db=getDb();
      const {data:attachments,error:extrasErr}=await db.from("asset_files").select("*").in("asset_id",items.map(a=>a.id));
      if(extrasErr) throw extrasErr;
      let done=0;
      const files = items.map(a=>({
        storage_path:a.storage_path,
        path:"assets/"+tidyName(a.asset_key)+"/"+tidyName(a.file_name)
      })).concat((attachments||[]).map(f=>{
        const parent=items.find(a=>a.id===f.asset_id);
        return {storage_path:f.storage_path,path:"assets/"+tidyName(parent.asset_key)+"/support/"+tidyName(f.file_name)};
      }));
      for(const f of files) {
        const {data,error}=await db.storage.from("vault").createSignedUrl(f.storage_path,3600);
        if(error) throw error;
        const response=await fetch(data.signedUrl);
        if(!response.ok) throw new Error("Falha ao baixar "+f.path+" ("+response.status+")");
        zip.file(f.path,await response.blob());
        done++;
        button.textContent="Preparando "+done+" / "+files.length;
      }
      meta.files=files.map(f=>f.path);
      zip.file("manifest.json",JSON.stringify(meta,null,2));
      zip.file("README.txt","H&T VAULT · ASSET PACK\nImporte os arquivos conforme manifest.json.\nRespeite os direitos e as licenças de cada artista.\n");
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:5}});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;link.download=tidyName(meta.title)+".zip";link.click();
      setTimeout(()=>URL.revokeObjectURL(url),15000);
      notice("Pacote ZIP gerado com "+files.length+" arquivos.");
    } catch(err) {notice("Erro ao gerar pacote: "+err.message,true);}
    finally {state.loading=false;button.disabled=false;button.textContent="↓ Gerar ZIP + manifest";}
  }
  async function savePack() {
    const items=selectedAssets();
    if(!items.length) return notice("Selecione pelo menos um asset.",true);
    if(getRole()==="viewer") return notice("Apenas editores salvam pacotes.",true);
    const db=getDb();
    const pack={
      title:sel("packTitle").value.trim()||"Pacote H&T",
      project:sel("packProject").value.trim(),engine:sel("packEngine").value,
      notes:sel("packNotes").value.trim(),created_by:getUser().id
    };
    const {data,error}=await db.from("packs").insert(pack).select("id").single();
    if(error) return notice("Erro ao salvar pacote: "+error.message,true);
    const join=await db.from("pack_assets").insert(items.map((a,i)=>({
      pack_id:data.id,asset_id:a.id,position:i,created_by:getUser().id
    })));
    if(join.error) return notice("Pacote criado, mas houve erro ao vincular assets: "+join.error.message,true);
    const url=location.origin+location.pathname+"?pack="+encodeURIComponent(data.id);
    await copy(url,"Link interno de pacote copiado. Requer acesso H&T.");
    await onLoaded();
  }
  function renderSavedPacks() {
    sel("savedPackGrid").innerHTML = state.packs.length ? state.packs.map(p=>{
      const count=state.packAssets.filter(x=>x.pack_id===p.id).length;
      return '<button type="button" class="saved-pack" data-pack-id="'+esc(p.id)+'"><span class="saved-pack-icon">▣</span><div><strong>'+esc(p.title)+'</strong><small>'+esc(p.engine)+' · '+count+' arquivos · '+date(p.created_at)+'</small></div><b>↗</b></button>';
    }).join("") : '<div class="placeholder-note">Os pacotes salvos aparecerão aqui com um link interno compartilhável.</div>';
  }
  function openSavedPack(id) {
    const pack=state.packs.find(p=>p.id===id);
    if(!pack) return;
    const list=state.packAssets.filter(x=>x.pack_id===id).sort((a,b)=>a.position-b.position);
    state.selected=new Set(list.map(x=>x.asset_id));
    state.loadedPack=id;
    sel("packTitle").value=pack.title;
    sel("packProject").value=pack.project;
    sel("packEngine").value=pack.engine;
    sel("packNotes").value=pack.notes;
    setTab("packs");
    renderSelection();
    notice("Pacote salvo carregado: "+pack.title);
    if(new URLSearchParams(location.search).get("pack") !== id) history.replaceState(null,"",location.pathname+"?pack="+encodeURIComponent(id));
  }
  mount();
  return {passes,fillFilters,onLoaded,handleAssetCardClick,syncCards,relations,extraFields,afterSave,decorateDetail,setTab};
}
