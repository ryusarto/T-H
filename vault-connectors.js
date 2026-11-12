export function installConnectors({ $, esc, notice, getDb, getRole }) {
  const BASE="https://ztxxqeifbxnecicgaxpj.supabase.co/functions/v1/ht-vault";
  const panel=document.createElement("section");
  panel.className="vault-panel hidden";
  panel.id="connectorsPanel";
  panel.innerHTML='<div class="vault-panel-head"><div><div class="eyebrow">H&T / AGENT API</div><h2>Integrações<span class="accent">.</span></h2><p>Conecte outras IAs à biblioteca sem tornar os originais públicos.</p></div></div>'+
   '<div class="connectors-grid"><div class="connector-card"><h3>⌁ Endpoint MCP</h3><p>Para Claude, Cursor e clientes MCP compatíveis.</p><div class="connector-url"><input id="connectorMcp" readonly><button type="button" id="copyMcp" class="ghost small">Copiar</button></div><h3>API REST</h3><div class="connector-url"><input id="connectorRest" readonly><button type="button" id="copyRest" class="ghost small">Copiar</button></div><p class="micro">Cabeçalho: Authorization: Bearer SEU_TOKEN. Nunca coloque a credencial no GitHub.</p></div>'+
   '<form id="connectorCreate" class="connector-card"><h3>＋ Criar acesso para IA</h3><label>Nome<input id="connectorLabel" maxlength="80" required placeholder="Claude / Torii"></label><label>Projetos permitidos</label><div class="connector-checkboxes"><label><input type="checkbox" id="connectorTorii" checked> Torii & Hutukara</label><label><input type="checkbox" id="connectorFight"> Salvadores Nacionais</label></div><label>Validade<select id="connectorExpiry"><option value="7">7 dias</option><option selected value="30">30 dias</option><option value="90">90 dias</option></select></label><label class="connector-checkbox"><input type="checkbox" id="connectorDownload"> Permitir baixar originais</label><button id="connectorCreateBtn" type="submit" class="primary">Criar credencial ↗</button><p class="micro">O padrão é somente leitura de metadados. Não concede poder de apagar, editar ou publicar assets.</p></form></div>'+
   '<div id="connectorIssued" class="connector-issued hidden"><h3>Credencial criada — copie agora</h3><p>Ela só é mostrada uma vez. Guarde em um gerenciador de senhas.</p><div class="connector-url"><input id="connectorSecret" type="password" readonly><button id="connectorShow" type="button" class="ghost small">Mostrar</button><button id="connectorCopy" type="button" class="primary">Copiar token</button></div><button id="connectorDismiss" type="button" class="ghost small">Ocultar token</button></div>'+
   '<div class="connector-list-head"><h3>Credenciais existentes</h3><button type="button" id="connectorRefresh" class="ghost small">↻ Atualizar</button></div><div id="connectorList"></div>'+
   '<p class="micro">Use /search?q=franco, /knowledge, /manifest?id=UUID e /download?id=UUID para integrações HTTP. Para clientes MCP, use o endpoint /mcp e o token no cabeçalho Authorization.</p>';
  $("assetGrid").insertAdjacentElement("afterend",panel);
  document.querySelector(".vault-tabs").insertAdjacentHTML("beforeend",'<button type="button" class="vault-tab" data-vault-tab="connectors">⛓ Integrações</button>');
  $("connectorMcp").value=BASE+"/mcp";$("connectorRest").value=BASE+"/search";
  const copy=async(v)=>{try{await navigator.clipboard.writeText(v);notice("Copiado.");}catch{window.prompt("Copie:",v)}};
  $("copyMcp").addEventListener("click",()=>copy(BASE+"/mcp"));
  $("copyRest").addEventListener("click",()=>copy(BASE+"/search"));
  $("connectorCopy").addEventListener("click",()=>copy($("connectorSecret").value));
  $("connectorShow").addEventListener("click",()=>{$("connectorSecret").type=$("connectorSecret").type==="password"?"text":"password"});
  $("connectorDismiss").addEventListener("click",()=>{$("connectorSecret").value="";$("connectorIssued").classList.add("hidden")});
  async function request(method,body){
    const {data,error}=await getDb().auth.getSession();
    if(error||!data?.session?.access_token)throw Error("Entre novamente no Vault.");
    const r=await fetch(BASE+"/admin",{method,headers:{"Authorization":"Bearer "+data.session.access_token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    const v=await r.json();
    if(!r.ok)throw Error(v.error||"Gateway indisponível");
    return v;
  }
  async function refresh(){
    if(getRole()!=="admin"){$("connectorList").innerHTML='<p class="placeholder-note">É necessário ser administrador da H&T.</p>';return;}
    try{
      const data=await request("GET");
      $("connectorList").innerHTML=(data.tokens||[]).map(t=>{
        const expired=Date.parse(t.expires_at)<=Date.now(),revoked=!!t.revoked_at;
        return '<div class="connector-token"><div><strong>'+esc(t.label)+'</strong><small>'+esc(t.allowed_projects.join(" / "))+' · '+(t.allow_download?"Com download":"Somente metadados")+' · até '+new Date(t.expires_at).toLocaleDateString("pt-BR")+'</small></div><span>'+(revoked?"Revogado":expired?"Expirado":"Ativo")+'</span>'+(!revoked&&!expired?'<button data-revoke="'+esc(t.id)+'" type="button" class="ghost small">Revogar</button>':'')+'</div>';
      }).join("")||'<p class="placeholder-note">Nenhum token criado ainda.</p>';
    }catch(e){$("connectorList").textContent="Erro: "+e.message;}
  }
  $("connectorCreate").addEventListener("submit",async e=>{
    e.preventDefault();
    const projects=[];if($("connectorTorii").checked)projects.push("Torii & Hutukara");if($("connectorFight").checked)projects.push("Salvadores Nacionais");
    if(!projects.length)return notice("Selecione um projeto.",true);
    const button=$("connectorCreateBtn");button.disabled=true;
    try{
      const v=await request("POST",{label:$("connectorLabel").value.trim(),allowed_projects:projects,allow_download:$("connectorDownload").checked,expires_in_days:Number($("connectorExpiry").value)});
      $("connectorSecret").value=v.token;$("connectorSecret").type="password";$("connectorIssued").classList.remove("hidden");
      notice("Token criado. Copie agora.");await refresh();
    }catch(err){notice("Erro ao criar token: "+err.message,true)}finally{button.disabled=false}
  });
  $("connectorList").addEventListener("click",async e=>{
    const id=e.target.closest("[data-revoke]")?.dataset.revoke;
    if(!id||!confirm("Revogar o acesso desta IA imediatamente?"))return;
    try{await request("DELETE",{id});notice("Token revogado.");await refresh()}catch(err){notice(err.message,true)}
  });
  $("connectorRefresh").addEventListener("click",refresh);
  return {setVisible:open=>{panel.classList.toggle("hidden",!open);if(open)refresh()},refresh};
}