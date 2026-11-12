import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { installVaultUpgrade } from "./vault-upgrade.js";

const $ = (id) => document.getElementById(id);
const CONFIG_KEY = "ht_vault_config_v1";
const DEFAULT_CONFIG = {
  url: "https://ztxxqeifbxnecicgaxpj.supabase.co",
  key: "sb_publishable_jHrhtSqGnha2Mja8JmgQ3Q_BJW7y42r"
}; // Public (publishable) browser key only. Never embed secret/service_role.
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const kindNames = {
  character: "Personagem", environment: "Cenário", animation: "Animação",
  prop: "Prop", vfx: "VFX", ui: "Interface", audio: "Áudio",
  "3d": "3D", other: "Outro"
};
const rightNames = {
  internal: "Uso interno H&T",
  "artist-approved": "Autorizado pelo artista",
  restricted: "Restrito / Cliente"
};
const screens = ["setupScreen", "authScreen", "accessScreen", "libraryScreen"];
let db = null;
let user = null;
let role = null;
let assets = [];
let previews = new Map();
let toastTimer = null;
let previewRun = 0;

function screen(id) {
  screens.forEach((name) => $(name).classList.toggle("hidden", name !== id));
}
function notice(message, error = false) {
  const n = $("toast");
  n.textContent = message;
  n.style.borderLeftColor = error ? "#f46f6f" : "#ff5a43";
  n.classList.add("active");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove("active"), 4800);
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])
  );
}
function normalize(value) {
  return String(value ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150) || "asset";
}
function bytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}
function date(value) {
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function setConnection(connected) {
  const status = $("connectionStatus");
  status.classList.toggle("connected", connected);
  status.innerHTML = '<span class="dot"></span> ' + (connected ? "NUVEM ATIVA" : "NÃO CONECTADO");
}
function stableLink(asset) {
  return location.origin + location.pathname + "?asset=" + encodeURIComponent(asset.id);
}
async function copy(value, message) {
  try {
    await navigator.clipboard.writeText(value);
    notice(message);
  } catch (_) {
    window.prompt("Copie o conteúdo abaixo:", value);
  }
}
function showSetup() {
  screen("setupScreen");
  setConnection(false);
  $("logoutBtn").classList.add("hidden");
  $("memberEmail").textContent = "";
}
function showAuth() {
  screen("authScreen");
  $("logoutBtn").classList.add("hidden");
  $("memberEmail").textContent = "";
}
function showPending() {
  screen("accessScreen");
  $("pendingEmail").textContent = user ? user.email : "";
  $("memberEmail").textContent = user ? user.email : "";
  $("logoutBtn").classList.remove("hidden");
}
async function initClient() {
  const saved = localStorage.getItem(CONFIG_KEY) || JSON.stringify(DEFAULT_CONFIG);
  try {
    const conf = JSON.parse(saved);
    db = createClient(conf.url, conf.key);
    setConnection(true);
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    user = data.session?.user || null;
    db.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user && user?.id !== session.user.id) {
        user = session.user;
        queueMicrotask(() => checkAccess());
      }
      if (event === "SIGNED_OUT") {
        user = null;
        role = null;
        showAuth();
      }
    });
    if (user) await checkAccess();
    else showAuth();
  } catch (err) {
    showSetup();
    notice("Falha ao conectar: " + err.message, true);
  }
}
async function checkAccess() {
  if (!db || !user) return showAuth();
  const { data, error } = await db.from("memberships")
    .select("role").eq("user_id", user.id).maybeSingle();
  if (error) {
    showPending();
    notice("Não foi possível verificar o acesso: " + error.message, true);
    return;
  }
  if (!data) return showPending();
  role = data.role;
  $("memberEmail").textContent = user.email || "Membro H&T";
  $("logoutBtn").classList.remove("hidden");
  $("openUploadBtn").classList.toggle("hidden", role === "viewer");
  screen("libraryScreen");
  await loadAssets();
  const requested = new URLSearchParams(location.search).get("asset");
  if (requested && /^[0-9a-f-]{36}$/i.test(requested)) {
    const item = assets.find((a) => a.id === requested);
    if (item) openDetail(item.id);
  }
}
async function loadAssets() {
  const { data, error } = await db.from("assets").select("*")
    .order("created_at", { ascending: false }).limit(1000);
  if (error) {
    notice("Erro ao carregar catálogo: " + error.message, true);
    return;
  }
  assets = data || [];
  $("totalCount").textContent = String(assets.length).padStart(2, "0");
  $("artistCount").textContent = String(new Set(assets.map((a) => a.artist.trim()).filter(Boolean)).size).padStart(2, "0");
  $("projectCount").textContent = String(new Set(assets.map((a) => a.project.trim()).filter(Boolean)).size).padStart(2, "0");
  renderAssets();
  await upgrade.onLoaded();
}
function visibleAssets() {
  const text = normalize($("searchInput").value.trim());
  const kind = $("kindFilter").value;
  return assets.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (!upgrade.passes(item)) return false;
    const haystack = normalize([item.title, item.artist, item.project, item.description, ...(item.tags || [])].join(" "));
    return !text || haystack.includes(text);
  });
}
function previewOf(item) {
  if (previews.has(item.id)) return '<img alt="" loading="lazy" src="' + esc(previews.get(item.id)) + '">';
  const icon = item.kind === "audio" ? "♫" : item.kind === "3d" ? "⬡" : "✳";
  return '<span class="preview-placeholder">' + icon + "</span>";
}
function renderAssets() {
  const shown = visibleAssets();
  $("resultCount").textContent = shown.length + (shown.length === 1 ? " ASSET ENCONTRADO" : " ASSETS ENCONTRADOS");
  $("assetGrid").innerHTML = shown.map((item) =>
    '<button class="asset-card" type="button" data-id="' + esc(item.id) + '">' +
      '<div class="asset-preview">' +
        previewOf(item) +
        '<span class="tag-corner">' + esc(kindNames[item.kind] || item.kind) + "</span>" +
      "</div>" +
      '<div class="asset-info">' +
        '<span class="name" title="' + esc(item.title) + '">' + esc(item.title) + "</span>" +
        '<div class="asset-meta"><span>' + esc(item.artist || "H&T Studio") + "</span><span>V" + item.version + "</span></div>" +
        '<div class="asset-meta"><span>' + esc(item.project || "Biblioteca geral") + "</span><span>" + date(item.created_at) + "</span></div>" +
      "</div>" +
    "</button>"
  ).join("");
  $("emptyState").classList.toggle("hidden", shown.length !== 0);
  upgrade.syncCards();
  loadPreviews(shown.slice(0, 70));
}
async function loadPreviews(list) {
  const run = ++previewRun;
  const candidates = list.filter((a) => a.mime_type?.startsWith("image/") && !previews.has(a.id));
  if (!candidates.length) return;
  const results = await Promise.allSettled(candidates.map(async (asset) => {
    const { data, error } = await db.storage.from("vault").createSignedUrl(asset.storage_path, 3600);
    if (error) throw error;
    return [asset.id, data.signedUrl];
  }));
  if (run !== previewRun) return;
  let changed = false;
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      previews.set(result.value[0], result.value[1]);
      changed = true;
    }
  });
  if (changed) {
    // Redesenhar sem iniciar outra rodada de URLs para os mesmos assets.
    const grid = $("assetGrid");
    grid.querySelectorAll(".asset-card").forEach((card) => {
      const url = previews.get(card.dataset.id);
      if (!url) return;
      const place = card.querySelector(".asset-preview");
      if (place?.querySelector("img")) return;
      const old = place?.querySelector(".preview-placeholder");
      if (old) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        old.replaceWith(img);
      }
    });
  }
}
function openDetail(id) {
  const item = assets.find((a) => a.id === id);
  if (!item) return;
  const preview = previews.get(item.id);
  const img = preview ? '<img alt="' + esc(item.title) + '" src="' + esc(preview) + '">' : previewOf(item);
  $("detailBody").innerHTML =
    '<div class="modal-head"><div><div class="eyebrow">H&T VAULT / ID ' + esc(item.id.slice(0, 8).toUpperCase()) +
    '</div><h2>' + esc(item.title) + '<span class="accent">.</span></h2></div>' +
    '<button class="icon-button" type="button" data-action="close" aria-label="Fechar">×</button></div>' +
    '<div class="detail-visual">' + img + '</div>' +
    '<div class="detail-tags">' + (item.tags || []).map((t) => "<span>#" + esc(t) + "</span>").join("") + "</div>" +
    '<div class="detail-info">' +
      info("CATEGORIA", kindNames[item.kind] || item.kind) +
      info("ARTISTA", item.artist || "H&T Studio") +
      info("PROJETO", item.project || "Biblioteca geral") +
      info("VERSÃO", "V" + item.version + " · " + item.asset_key) +
      info("DIREITOS", rightNames[item.rights_scope] || item.rights_scope) +
      info("ORIGINAL", item.file_name + " · " + bytes(item.file_size)) +
      info("CADASTRO", date(item.created_at)) +
      info("ARQUIVO", item.mime_type) +
    "</div>" +
    (item.description ? '<p class="detail-description">' + esc(item.description) + "</p>" : "") +
    '<div class="detail-actions">' +
    '<button class="primary" type="button" data-action="download">↓ Baixar original</button>' +
    '<button class="ghost" type="button" data-action="link">Copiar link interno</button>' +
    '<button class="ghost" type="button" data-action="temp">Link temporário (1h)</button></div>';
  $("detailDialog").dataset.assetId = item.id;
  if (!$("detailDialog").open) $("detailDialog").showModal();
  upgrade.decorateDetail(item);
}
function info(label, value) {
  return "<div><small>" + esc(label) + "</small><strong>" + esc(value) + "</strong></div>";
}
async function signedUrl(asset, seconds = 3600) {
  const { data, error } = await db.storage.from("vault").createSignedUrl(asset.storage_path, seconds, {
    download: false
  });
  if (error) throw error;
  return data.signedUrl;
}
async function detailAction(action) {
  const item = assets.find((a) => a.id === $("detailDialog").dataset.assetId);
  if (action === "close") return $("detailDialog").close();
  if (!item) return;
  if (action === "link") return copy(stableLink(item), "Link interno copiado. Requer login H&T.");
  try {
    const url = await signedUrl(item);
    if (action === "temp") {
      await copy(url, "URL temporária copiada. Expira em 1 hora.");
    }
    if (action === "download") {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } catch (e) {
    notice("Não foi possível acessar o arquivo: " + e.message, true);
  }
}
function updateFileName() {
  const file = $("assetFile").files[0];
  $("fileName").textContent = file ? file.name + " · " + bytes(file.size) : "PNG, GIF, WEBP, PSD, ASEPRITE, JSON, ZIP, GLB, ÁUDIO…";
}
function openUpload() {
  if (role === "viewer") return;
  $("uploadForm").reset();
  updateFileName();
  $("uploadDialog").showModal();
}
async function saveAsset(event) {
  event.preventDefault();
  if (role === "viewer" || !user) return;
  const file = $("assetFile").files[0];
  const title = $("assetTitle").value.trim();
  const kind = $("assetKind").value;
  const rights = $("assetRights").value;
  const artist = $("assetArtist").value.trim();
  const project = $("assetProject").value.trim();
  const tags = $("assetTags").value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 30);
  const description = $("assetDescription").value.trim();
  const additional = upgrade.extraFields();
  if (!file || !title) return notice("Selecione um arquivo e informe o nome.", true);
  if (file.size > MAX_FILE_SIZE) return notice("Limite do MVP: 50 MB por arquivo.", true);
  if (file.size > 6 * 1024 * 1024) {
    const proceed = confirm("Arquivos acima de 6 MB podem falhar no envio padrão. Deseja continuar mesmo assim?");
    if (!proceed) return;
  }
  const key = slug([artist, project, title, kind].join(" "));
  const version = 1 + Math.max(0, ...assets.filter((a) => a.asset_key === key).map((a) => a.version));
  const filename = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "asset.bin";
  const path = user.id + "/" + crypto.randomUUID() + "/" + filename;
  const btn = $("saveAssetBtn");
  btn.disabled = true;
  btn.textContent = "Enviando arquivo…";
  let uploaded = false;
  try {
    const upload = await db.storage.from("vault").upload(path, file, {
      upsert: false, contentType: file.type || "application/octet-stream", cacheControl: "3600"
    });
    if (upload.error) throw upload.error;
    uploaded = true;
    const relationIds = await upgrade.relations();
    const { data: inserted, error } = await db.from("assets").insert({
      title, kind, artist, project, tags, description, rights_scope: rights,
      ...additional, ...relationIds,
      asset_key: key, version, storage_path: path, file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size, created_by: user.id
    }).select("id").single();
    if (error) throw error;
    await upgrade.afterSave(inserted.id, additional);
    $("uploadDialog").close();
    notice("Asset salvo na nuvem como V" + version + ".");
    await loadAssets();
  } catch (err) {
    if (uploaded) await db.storage.from("vault").remove([path]);
    notice("Falha ao salvar: " + err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Enviar para a nuvem <span>↗</span>';
  }
}
function exportCatalog() {
  const data = {
    schema: "ht.vault.catalog.v1",
    generated_at: new Date().toISOString(),
    notice: "Metadados sem arquivos. Assets privados exigem autorização para download.",
    repository: "https://github.com/ryusarto/T-H",
    assets: visibleAssets().map((a) => ({
      id: a.id, asset_key: a.asset_key, version: a.version, title: a.title,
      kind: a.kind, artist: a.artist, project: a.project, tags: a.tags,
      description: a.description, rights_scope: a.rights_scope,
      file_name: a.file_name, mime_type: a.mime_type, file_size: a.file_size,
      created_at: a.created_at, internal_link: stableLink(a)
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ht-vault-catalogo.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  notice("Catálogo JSON exportado (" + data.assets.length + " itens).");
}
$("setupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = $("supabaseUrl").value.trim().replace(/\/$/, "");
  const key = $("supabaseKey").value.trim();
  if (!/^https:\/\//i.test(url) || !key) return notice("Insira uma URL HTTPS válida e a chave pública.", true);
  if (/^(sb_secret_|eyJ.*service_role)/.test(key)) return notice("Não use uma chave secreta neste site.", true);
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key }));
  await initClient();
});
$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db) return;
  const email = $("emailInput").value.trim();
  const button = $("loginForm").querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const { error } = await db.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    $("loginHint").textContent = "Confira sua caixa de entrada e clique no link. O primeiro acesso requer autorização do estúdio.";
    notice("Enviamos um link de acesso para " + email + ".");
  } catch (e) {
    notice("Erro no login: " + e.message, true);
  } finally {
    button.disabled = false;
  }
});
$("logoutBtn").addEventListener("click", async () => {
  await db?.auth.signOut();
  user = null;
  role = null;
  previews.clear();
  showAuth();
});
$("changeConnectionBtn").addEventListener("click", () => {
  if (!confirm("Deseja trocar a conexão de nuvem deste navegador?")) return;
  localStorage.removeItem(CONFIG_KEY);
  db = null;
  showSetup();
});
$("retryAccessBtn").addEventListener("click", checkAccess);
$("searchInput").addEventListener("input", renderAssets);
$("kindFilter").addEventListener("change", renderAssets);
$("openUploadBtn").addEventListener("click", openUpload);
$("refreshBtn").addEventListener("click", loadAssets);
$("exportBtn").addEventListener("click", exportCatalog);
$("assetGrid").addEventListener("click", (event) => {
  const card = event.target.closest("[data-id]");
  if (card && !upgrade.handleAssetCardClick(card.dataset.id)) openDetail(card.dataset.id);
});
$("closeUploadBtn").addEventListener("click", () => $("uploadDialog").close());
$("cancelUploadBtn").addEventListener("click", () => $("uploadDialog").close());
$("assetFile").addEventListener("change", updateFileName);
$("uploadForm").addEventListener("submit", saveAsset);
$("detailBody").addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action) detailAction(action);
});
const dropzone = $("dropzone");
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  if (!event.dataTransfer?.files?.length) return;
  const transfer = new DataTransfer();
  transfer.items.add(event.dataTransfer.files[0]);
  $("assetFile").files = transfer.files;
  updateFileName();
});

const upgrade = installVaultUpgrade({
  $, esc, notice, getDb: () => db, getAssets: () => assets,
  getUser: () => user, getRole: () => role, getPreviews: () => previews,
  renderAssets, openDetail, stableLink, signedUrl, copy, bytes, date
});
initClient();
