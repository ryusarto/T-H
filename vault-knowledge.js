export function installKnowledge({ $, esc, notice, getDb, getAssets, getUser, getRole, reload, openDetail, bytes }) {
  let entries=[];
  const panel=document.createElement("section");
  panel.id="knowledgePanel";panel.className="vault-panel hidden";
  panel.innerHTML='<div class="vault-panel-head"><div><span class="eyebrow">H&T / KNOWLEDGE</span><h2>Conhecimento<span class="accent">.</span></h2><p>Pranchetas, personagens, cenários e conceitos preservados.</p></div><button class="primary" type="button" id="knowledgeImportBtn">↑ Importar ZIP</button></div>'+
    '<div class="knowledge-counts"><strong id="knowledgeCount">0 materiais</strong><span id="knowledgeCloudCount">0 originais na nuvem</span></div>'+
    '<div class="knowledge-search"><input id="knowledgeSearch" type="search" placeholder="Buscar personagem ou prancheta..."><select id="knowledgeProject"><option value="">Todos os jogos</option><option>Torii & Hutukara</option><option>Salvadores Nacionais</option></select></div>'+
    '<div id="knowledgeItems" class="knowledge-items"></div><p class="micro">Itens catalogados sem imagem precisam ser importados para o Storage privado. Pranchetas não são spritesheets recortados e validados.</p>';
  document.getElementById("assetGrid").insertAdjacentElement("afterend",panel);
  document.querySelector(".vault-tabs").insertAdjacentHTML("beforeend",'<button class="vault-tab" type="button" data-vault-tab="knowledge">▤ Conhecimento</button>');
  const dlg=document.createElement("dialog");dlg.className="modal knowledge-dialog";dlg.id="knowledgeImportDialog";
  dlg.innerHTML='<div class="knowledge-import"><div class="modal-head"><div><div class="eyebrow">H&T / NUVEM PRIVADA</div><h2>Importar originais<span class="accent">.</span></h2></div><button type="button" id="closeKnowledgeImport" class="icon-button">×</button></div><p>Selecione o ZIP exportado com <code>manifest.json</code> e pasta <code>images/</code>. Faça esta importação no desktop.</p><input id="knowledgeZip" type="file" accept=".zip"><p id="knowledgeLog" class="micro">Nenhum pacote selecionado.</p><div class="knowledge-meter"><span id="knowledgeMeterBar"></span></div><div class="modal-actions"><button id="cancelKnowledgeImport" type="button" class="ghost">Fechar</button><button type="button" id="startKnowledgeImport" class="primary">Enviar para o Vault</button></div></div>';
  document.body.appendChild(dlg);
  const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  let busy=false;
  const matching=x=>getAssets().find(a=>a.project===x.project&&(a.title===x.title||a.file_name===x.original_filename)&&a.source_origin==="chatgpt-library");
  async function refresh() {
    if(!getDb()||!getUser())return;
    const r=await getDb().from("knowledge_entries").select("*").order("created_at").limit(1000);
    if(r.error)return notice("Conhecimento: "+r.error.message,true);
    entries=r.data||[];render();
  }
  function render() {
    const q=norm($("knowledgeSearch").value),p=$("knowledgeProject").value;
    const list=entries.filter(x=>(!p||x.project===p)&&norm([x.title,x.character,x.chapter,x.project,x.notes].join(" ")).includes(q));
    $("knowledgeCount").textContent=entries.length+" materiais indexados";
    $("knowledgeCloudCount").textContent=entries.filter(matching).length+" originais na nuvem";
    $("knowledgeItems").innerHTML=list.map(x=>{
      const a=matching(x);
      return '<div class="knowledge-entry"><span class="knowledge-symbol">'+(x.kind==="environment"?"▧":x.kind==="animation"?"✳":"◈")+'</span><div class="knowledge-info"><strong>'+esc(x.title)+'</strong><small>'+esc(x.project)+' · '+esc(x.character||x.chapter||x.kind)+' · '+bytes(x.source_file_size)+'</small></div><span class="knowledge-label '+(a?"ready":"")+'">'+(a?"Na nuvem":"Só índice")+'</span>'+(a?'<button class="ghost small" type="button" data-kn-asset="'+esc(a.id)+'">Abrir ↗</button>':'')+'</div>';
    }).join("")||'<div class="placeholder-note">Nenhum item encontrado.</div>';
    $("knowledgeItems").querySelectorAll("[data-kn-asset]").forEach(b=>b.addEventListener("click",()=>openDetail(b.dataset.knAsset)));
  }
  $("knowledgeSearch").addEventListener("input",render);
  $("knowledgeProject").addEventListener("change",render);
  $("knowledgeImportBtn").addEventListener("click",()=>{if(getRole()==="viewer")return notice("Requer editor H&T.",true);dlg.showModal()});
  for(const id of ["closeKnowledgeImport","cancelKnowledgeImport"])$(id).addEventListener("click",()=>{if(busy)return notice("Importação em andamento.",true);dlg.close()});
  $("startKnowledgeImport").addEventListener("click",async()=>{
    if(busy)return;if(getRole()==="viewer"||!getUser())return notice("Requer editor autenticado.",true);
    const file=$("knowledgeZip").files[0];if(!file)return notice("Escolha o ZIP primeiro.",true);
    busy=true;$("startKnowledgeImport").disabled=true;
    const log=s=>$("knowledgeLog").textContent=s;let added=0,skipped=0,fail=0;
    try {
      const {default:JSZip}=await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
      log("Lendo ZIP…");const zip=await JSZip.loadAsync(file);
      const index=zip.file("manifest.json");if(!index)throw new Error("manifest.json não encontrado.");
      const pack=JSON.parse(await index.async("string"));
      if(pack.schema!=="ht.vault.import.v1"||!Array.isArray(pack.assets)||pack.assets.length>500)throw new Error("Formato H&T desconhecido.");
      const originals=getAssets().slice();
      let n=0;
      for(const x of pack.assets) {
        n++;
        try {
          if(!x||!["Torii & Hutukara","Salvadores Nacionais"].includes(x.project)||!/^images\/[^/]+\.(png|jpe?g|webp)$/i.test(x.file))throw new Error("Entrada inválida.");
          const zipped=zip.file(x.file);if(!zipped)throw new Error("Imagem ausente: "+x.file);
          const blob=await zipped.async("blob");
          if(blob.size>50*1024*1024)throw new Error("Arquivo acima de 50 MB.");
          if(!crypto.subtle)throw new Error("Abra o Vault via HTTPS.");
          const hashbytes=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
          const sha=Array.from(new Uint8Array(hashbytes)).map(v=>v.toString(16).padStart(2,"0")).join("");
          if(x.sha256&&x.sha256!==sha)throw new Error("Hash divergente: "+x.file);
          if(originals.some(a=>a.source_sha256===sha)){skipped++;continue}
          const filename=x.original_filename.replace(/[^A-Za-z0-9._-]/g,"_").slice(-120);
          const path=getUser().id+"/"+crypto.randomUUID()+"/"+(filename||"asset.png");
          const mime=/\.png$/i.test(x.file)?"image/png":/\.webp$/i.test(x.file)?"image/webp":"image/jpeg";
          const u=await getDb().storage.from("vault").upload(path,blob,{upsert:false,contentType:mime,cacheControl:"3600"});
          if(u.error)throw u.error;
          const data={
            asset_key:"knowledge-"+sha.slice(0,32),version:1,title:x.title.slice(0,160),
            kind:["character","animation","environment","prop","vfx","ui","audio","3d","other"].includes(x.kind)?x.kind:"other",
            artist:x.artist||"",project:x.project,character:x.character||"",chapter:x.chapter||"",scene:x.scene||"",
            animation_name:"",direction:"",status:"draft",owner_name:x.owner_name||"H&T Studio",
            credits:x.credits||"",compatibility:x.compatibility||[],reference_urls:[],tags:x.tags||[],
            description:x.description||"",frame_count:1,fps:12,rights_scope:"internal",
            source_origin:"chatgpt-library",source_sha256:sha,
            storage_path:path,file_name:x.original_filename,mime_type:mime,file_size:blob.size,created_by:getUser().id
          };
          const save=await getDb().from("assets").insert(data).select("id").single();
          if(save.error){await getDb().storage.from("vault").remove([path]);throw save.error}
          originals.push({...data,id:save.data.id});added++;
        }catch(ex){fail++;log("Erro em "+x.file+": "+ex.message)}
        finally{$("knowledgeMeterBar").style.width=Math.round(n/pack.assets.length*100)+"%";if(n%5===0||n===pack.assets.length)log(n+"/"+pack.assets.length+" · "+added+" salvos · "+skipped+" repetidos · "+fail+" falhas")}
      }
      await reload();await refresh();
      notice("Pacote processado: "+added+" imagens na nuvem, "+skipped+" repetidas, "+fail+" falhas.",fail>0);
    }catch(ex){log("Importação falhou: "+ex.message);notice("Não foi possível importar: "+ex.message,true)}
    finally{busy=false;$("startKnowledgeImport").disabled=false}
  });
  return {refresh,setVisible:v=>panel.classList.toggle("hidden",!v)};
}