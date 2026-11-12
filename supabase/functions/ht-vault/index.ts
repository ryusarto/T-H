// H&T Vault Agent Gateway v1 — REST + MCP Streamable HTTP (stateless)
// Custom authorization is enforced inside this function: do not rely on the
// project's publishable key as a credential. Never expose service-role keys.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const URL_BASE = Deno.env.get("SUPABASE_URL") || "";
const KEYS = (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); } catch { return {}; } })();
const SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || KEYS.default || "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
if (!URL_BASE || !SECRET) console.error("H&T gateway: missing Supabase configuration");
const adminDb = createClient(URL_BASE, SECRET, {auth:{autoRefreshToken:false,persistSession:false}});
const authDb = createClient(URL_BASE, PUBLIC_KEY || SECRET, {auth:{autoRefreshToken:false,persistSession:false}});
const MAX_RESULTS = 50;
const MAX_QUERY_LENGTH = 120;
const CORS = {
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers":"authorization, content-type, apikey, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers":"mcp-session-id"
};
type Claim = {id:string,allowed_projects:string[],allow_download:boolean};
const j = (v:unknown,status=200,headers:Record<string,string>={}) =>
  new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...CORS,...headers}});
function fail(message:string,status=400){return j({error:message},status)}
function clean(v:unknown,max=MAX_QUERY_LENGTH):string{return typeof v==="string"?v.trim().slice(0,max):""}
function isUuid(s:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)}
function extract(req:Request) {const match=/^Bearer (.+)$/i.exec(req.headers.get("authorization")||"");return match?.[1]?.trim() || ""}
function base64url(bytes:Uint8Array) {let b="";for(const x of bytes)b+=String.fromCharCode(x);return btoa(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"")}
async function digest(value:string){
 const bytes=new TextEncoder().encode(value);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function memberAdmin(token:string) {
 if (!token || token.startsWith("ht_")) return null;
 const {data:auth,error:authError}=await authDb.auth.getUser(token);
 if(authError||!auth?.user?.id) return null;
 const {data,error}=await adminDb.from("memberships").select("role").eq("user_id",auth.user.id).maybeSingle();
 return !error&&data?.role==="admin"?auth.user:null;
}
async function agentClaim(req:Request):Promise<Claim|null>{
 const token=extract(req);
 if (!/^ht_v1_[A-Za-z0-9_-]{35,}$/.test(token)) return null;
 const sha=await digest(token);
 const {data,error}=await adminDb.from("vault_api_tokens").select("id,allowed_projects,allow_download,expires_at,revoked_at,created_by").eq("token_hash",sha).maybeSingle();
 if(error||!data||data.revoked_at||Date.parse(data.expires_at)<=Date.now())return null;
 // Creator must remain a Vault admin; demotion or account deletion disables token.
 const {data:member,error:memberError}=await adminDb.from("memberships").select("role").eq("user_id",data.created_by).maybeSingle();
 if(memberError||member?.role!=="admin")return null;
 return {id:data.id,allowed_projects:data.allowed_projects,allow_download:data.allow_download};
}
function within(claim:Claim,project:string){return claim.allowed_projects.includes(project)}
function exposed(a:any){
 // The source path, creator UUID, temporary URLs and internal secrets are never
 // returned by metadata actions.
 return {
  id:a.id,key:a.asset_key,version:a.version,title:a.title,kind:a.kind,
  artist:a.artist,project:a.project,character:a.character,chapter:a.chapter,
  scene:a.scene,animation:a.animation_name,direction:a.direction,status:a.status,
  tags:a.tags,description:a.description,credits:a.credits,
  owner:a.owner_name,rights:a.rights_scope,compatibility:a.compatibility,
  frame_count:a.frame_count,fps:a.fps,github_path:a.github_path,
  filename:a.file_name,mime_type:a.mime_type,size:a.file_size,
  sha256:a.source_sha256,created_at:a.created_at
 };
}
async function assetsSearch(claim:Claim,args:any){
 const limit=Math.min(Math.max(Number(args?.limit)||25,1),MAX_RESULTS);
 let query=adminDb.from("assets").select("*").in("project",claim.allowed_projects)
  .neq("status","archived").neq("rights_scope","restricted").order("created_at",{ascending:false}).limit(500);
 for(const field of ["project","artist","character","chapter","kind","status","direction","animation_name"]){
   const value=clean(args?.[field]);
   if(value)query=query.eq(field,value);
 }
 const {data,error}=await query;
 if(error)throw new Error("Search unavailable");
 const search=clean(args?.q).toLocaleLowerCase("pt-BR");
 const filtered=search?(data||[]).filter(a=>[a.title,a.artist,a.project,a.character,a.chapter,a.scene,a.description,...(a.tags||[])].join(" ").toLocaleLowerCase("pt-BR").includes(search)):(data||[]);
 return {items:filtered.slice(0,limit).map(exposed),count:filtered.length,limit};
}
async function findAsset(claim:Claim,id:string){
 if(!isUuid(id))return null;
 const {data,error}=await adminDb.from("assets").select("*").eq("id",id).maybeSingle();
 if(error||!data||data.status==="archived"||data.rights_scope==="restricted"||!within(claim,data.project))return null;
 return data;
}
async function downloadLink(claim:Claim,args:any){
 if(!claim.allow_download)throw new Error("Token without download permission");
 const id=clean(args?.id,100);const a=await findAsset(claim,id);
 if(!a)throw new Error("Asset unavailable");
 const {data,error}=await adminDb.storage.from("vault").createSignedUrl(a.storage_path,60,{download:a.file_name});
 if(error)throw new Error("File unavailable in private Storage");
 return {id:a.id,filename:a.file_name,url:data.signedUrl,expires_in_seconds:60,
   warning:"This short-lived URL grants access to the file until expiration. Do not publish it."};
}
async function assetManifest(claim:Claim,args:any){
 const a=await findAsset(claim,clean(args?.id,100));
 if(!a)throw new Error("Asset unavailable");
 const {data:clips}=await adminDb.from("animation_clips").select("name,direction,frames,fps")
   .eq("asset_id",a.id).limit(100);
 const {data:files}=await adminDb.from("asset_files").select("role,file_name,mime_type,file_size")
   .eq("asset_id",a.id).limit(100);
 return {schema:"ht.asset.v1",asset:exposed(a),animations:clips||[],support_files:files||[],
   private_file:true,download_available:claim.allow_download,
   download_instruction:claim.allow_download?"Call get_asset_download_url with the asset ID.":"Ask an H&T admin for download permission."};
}
async function listProjects(claim:Claim){
 const {data,error}=await adminDb.from("projects").select("id,name,artist_id").limit(500);
 if(error)throw new Error("Projects unavailable");
 const canonical=(data||[]).filter(x=>claim.allowed_projects.includes(x.name));
 return {allowed_projects:claim.allowed_projects,project_records:canonical};
}
async function listKnowledge(claim:Claim,args:any){
 const limit=Math.min(Math.max(Number(args?.limit)||25,1),MAX_RESULTS);
 let query=adminDb.from("knowledge_entries").select("title,project,character,chapter,kind,production_state,original_filename,tags,notes,source_file_size")
  .in("project",claim.allowed_projects).order("created_at",{ascending:false}).limit(200);
 const project=clean(args?.project);if(project)query=query.eq("project",project);
 const {data,error}=await query;if(error)throw new Error("Knowledge unavailable");
 const q=clean(args?.q).toLocaleLowerCase("pt-BR");
 const filtered=q?(data||[]).filter(x=>[x.title,x.character,x.chapter,x.notes].join(" ").toLocaleLowerCase("pt-BR").includes(q)):(data||[]);
 return {items:filtered.slice(0,limit),count:Math.min(filtered.length,limit),
  note:"Knowledge entries are reference metadata. They may not have imported image files."};
}
async function dispatch(claim:Claim,name:string,args:any){
 switch(name){
  case "search_assets":return await assetsSearch(claim,args);
  case "get_asset_manifest":return await assetManifest(claim,args);
  case "get_asset_download_url":return await downloadLink(claim,args);
  case "list_projects":return await listProjects(claim);
  case "search_knowledge":return await listKnowledge(claim,args);
  default:throw new Error("Unknown tool");
 }
}
const tools=[
 {name:"search_assets",description:"Find approved, draft and review H&T game assets scoped to permitted projects. Metadata only, no permanent private file URLs.",
  inputSchema:{type:"object",properties:{q:{type:"string"},project:{type:"string"},artist:{type:"string"},character:{type:"string"},chapter:{type:"string"},kind:{type:"string"},status:{type:"string"},direction:{type:"string"},animation_name:{type:"string"},limit:{type:"integer",minimum:1,maximum:50}}}},
 {name:"get_asset_manifest",description:"Get one asset's animation metadata, versions, provenance and import hints. Requires asset UUID.",
  inputSchema:{type:"object",properties:{id:{type:"string"}},required:["id"]}},
 {name:"get_asset_download_url",description:"Create 60-second signed download URL for one authorized private asset. Requires download-enabled token; treat link as sensitive.",
  inputSchema:{type:"object",properties:{id:{type:"string"}},required:["id"]}},
 {name:"list_projects",description:"List only H&T projects within this token's scope.",inputSchema:{type:"object",properties:{}}},
 {name:"search_knowledge",description:"Find indexed sprite concepts and reference sheets, including items awaiting original image upload.",
  inputSchema:{type:"object",properties:{q:{type:"string"},project:{type:"string"},limit:{type:"integer",maximum:50}}}}
];
function rpc(id:unknown,result:unknown){return {jsonrpc:"2.0",id,result}}
function rpcError(id:unknown,code:number,message:string){return {jsonrpc:"2.0",id,error:{code,message}}}
async function mcp(req:Request,claim:Claim){
 if(req.method!=="POST")return fail("Use POST",405);
 let body:any;try{body=await req.json()}catch{return fail("Invalid JSON",400)}
 if(!body||typeof body!=="object"||Array.isArray(body))return fail("Expected one JSON-RPC request",400);
 if(body.jsonrpc!=="2.0"||typeof body.method!=="string")return j(rpcError(body.id??null,-32600,"Invalid request"));
 if(body.method==="notifications/initialized")return new Response(null,{status:202,headers:CORS});
 if(body.method==="initialize")return j(rpc(body.id,{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"ht-vault",version:"1.0.0"}}));
 if(body.method==="ping")return j(rpc(body.id,{}));
 if(body.method==="tools/list")return j(rpc(body.id,{tools:tools.filter(x=>claim.allow_download||x.name!=="get_asset_download_url")}));
 if(body.method==="tools/call"){
  const name=clean(body.params?.name,120);
  if(!tools.find(x=>x.name===name))return j(rpcError(body.id,-32601,"Unknown tool"));
  try{const result=await dispatch(claim,name,body.params?.arguments||{});
   return j(rpc(body.id,{content:[{type:"text",text:JSON.stringify(result)}],isError:false}));
  }catch(error){return j(rpc(body.id,{content:[{type:"text",text:error instanceof Error?error.message:"Request failed"}],isError:true}))}
 }
 return j(rpcError(body.id??null,-32601,"Method not found"));
}
function tokenSummary(t:any){return {id:t.id,label:t.label,allowed_projects:t.allowed_projects,allow_download:t.allow_download,created_at:t.created_at,expires_at:t.expires_at,revoked_at:t.revoked_at,last_used_at:t.last_used_at}}
async function admin(req:Request){
 const operator=await memberAdmin(extract(req));
 if(!operator)return fail("Admin authorization required",403);
 if(req.method==="GET"){
   const {data,error}=await adminDb.from("vault_api_tokens").select("id,label,allowed_projects,allow_download,created_at,expires_at,revoked_at,last_used_at")
    .eq("created_by",operator.id).order("created_at",{ascending:false}).limit(100);
   return error?fail("Token listing unavailable",500):j({tokens:data||[]});
 }
 if(req.method==="POST"){
  let body:any;try{body=await req.json()}catch{return fail("Invalid JSON",400)}
  const label=clean(body?.label,80);
  const projects=Array.isArray(body?.allowed_projects)?[...new Set(body.allowed_projects.map((v:any)=>clean(v,120)).filter(Boolean))]:[];
  const all=["Torii & Hutukara","Salvadores Nacionais"];
  if(!label||!projects.length||projects.length>30||projects.some(x=>!all.includes(x)))return fail("Choose valid project permissions",400);
  const days=Math.min(Math.max(Number(body?.expires_in_days)||30,1),90);
  const expires_at=new Date(Date.now()+days*86400000).toISOString();
  const random=new Uint8Array(40);crypto.getRandomValues(random);
  const secret="ht_v1_"+base64url(random);
  const {data,error}=await adminDb.from("vault_api_tokens").insert({
   label,token_hash:await digest(secret),allowed_projects:projects,allow_download:body?.allow_download===true,
   created_by:operator.id,expires_at
  }).select("id,label,allowed_projects,allow_download,created_at,expires_at").single();
  return error?fail("Could not create credential",500):j({token:secret,credential:data,note:"Copy now. Token cannot be shown again."},201);
 }
 if(req.method==="DELETE"){
  let body:any;try{body=await req.json()}catch{return fail("Invalid JSON",400)}
  if(!isUuid(clean(body?.id,100)))return fail("Invalid token ID",400);
  const {data,error}=await adminDb.from("vault_api_tokens").update({revoked_at:new Date().toISOString()})
   .eq("id",body.id).eq("created_by",operator.id).is("revoked_at",null).select("id").maybeSingle();
  return error?fail("Could not revoke",500):!data?fail("Not found",404):j({revoked:true});
 }
 return fail("Method not allowed",405);
}
Deno.serve(async(req:Request)=>{
 try{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  const pathname=new URL(req.url).pathname;
  const endpoint=pathname.split("/").pop();
  if(endpoint==="admin")return await admin(req);
  const claim=await agentClaim(req);
  if(!claim)return fail("Valid H&T API token required",401);
  if(endpoint==="mcp")return await mcp(req,claim);
  if(endpoint==="health")return j({status:"ok",authorized:true,projects:claim.allowed_projects});
  if(endpoint==="search"&&req.method==="GET"){
   const p=Object.fromEntries(new URL(req.url).searchParams.entries());
   return j(await assetsSearch(claim,p));
  }
  if(endpoint==="projects"&&req.method==="GET")return j(await listProjects(claim));
  if(endpoint==="knowledge"&&req.method==="GET"){
   const p=Object.fromEntries(new URL(req.url).searchParams.entries());
   return j(await listKnowledge(claim,p));
  }
  if(endpoint==="manifest"&&req.method==="GET")return j(await assetManifest(claim,{id:new URL(req.url).searchParams.get("id")}));
  if(endpoint==="download"&&req.method==="GET")return j(await downloadLink(claim,{id:new URL(req.url).searchParams.get("id")}));
  return fail("Not found",404);
 }catch(err){console.error("Vault gateway request failed",err instanceof Error?err.message:"unknown");return fail("Request failed",500)}
});
