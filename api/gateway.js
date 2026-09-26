const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {hash,identity,cookie,sessionCookie}=require('../server/security.cjs');
const tasks=['cover','date','senior','address','name','owner','broadband'];
const assets=new Set(['index.html','app.js','forms.js','style.css','disclaimer.js','security-ui.js','template.png','mnp-1.png','mnp-2.png','senior-remark.png','bb-cancel.png','bb-install.png','bb-effective.png','bb-effective-label.png']);
function config(){const e=process.env;if(!e.APP_ORIGIN||!e.SUPABASE_URL||!e.SUPABASE_ANON_KEY||!e.SUPABASE_SERVICE_ROLE_KEY||!e.RATE_LIMIT_SECRET||e.RATE_LIMIT_SECRET.length<32)throw new Error('setup');if(new URL(e.APP_ORIGIN).protocol!=='https:'||new URL(e.SUPABASE_URL).protocol!=='https:')throw new Error('setup');return e;}
async function api(route,{method='GET',body,auth=false}={}){const e=config(),key=auth?e.SUPABASE_ANON_KEY:e.SUPABASE_SERVICE_ROLE_KEY;const r=await fetch(e.SUPABASE_URL+route,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('provider');return r.status===204?null:r.json();}
async function member(column,value){const rows=await api(`/rest/v1/tool_members?${column}=eq.${encodeURIComponent(value)}&active=eq.true&select=id,email,phone&limit=1`);return rows[0];}
async function session(req){const token=cookie(req);if(!token)return null;const rows=await api(`/rest/v1/tool_sessions?token_hash=eq.${hash(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=member_id&limit=1`);if(!rows.length)return null;return member('id',rows[0].member_id);}
async function audit(m,event,task){await api('/rest/v1/tool_audit',{method:'POST',body:{member_id:m.id,event,task:task||null}});}
async function limit(req,stage,id){const e=config();const ip=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown';for(const [tag,value,max,seconds]of [['ip',String(ip).split(',')[0],stage==='send'?15:40,600],['identity',id,stage==='send'?3:8,600]]){const key=crypto.createHmac('sha256',e.RATE_LIMIT_SECRET).update(`${stage}:${tag}:${value}`).digest('hex');const ok=await api('/rest/v1/rpc/tool_rate_limit',{method:'POST',body:{p_key:key,p_max:max,p_seconds:seconds}});if(!ok)return false;}return true;}
function json(res,status,value){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));}
async function body(req){if(Number(req.headers['content-length']||0)>2048)throw new Error('body');if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new Error('body');if(req.body){const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(JSON.stringify(b).length>2048)throw new Error('body');return b;}let s='';for await(const chunk of req){s+=chunk;if(s.length>2048)throw new Error('body');}return JSON.parse(s);}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Strict-Transport-Security','max-age=31536000');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try{
 const e=config(),url=new URL(req.url,'https://local.invalid'),route=url.searchParams.has('__path')?'/'+url.searchParams.get('__path'):url.pathname;
 if(req.method==='POST'&&req.headers.origin!==new URL(e.APP_ORIGIN).origin)return json(res,403,{error:'Request denied.'});
 if(req.method==='GET'&&route==='/auth/config')return json(res,200,{sms:e.SMS_ENABLED==='true'});
 if(req.method==='POST'&&['/auth/send','/auth/verify'].includes(route)){
  let b,i;try{b=await body(req);i=identity(b);}catch{return json(res,400,{error:'請輸入有效電郵或國際格式電話號碼。 / Enter a valid email or international phone number.'});}
  if(i.method==='sms'&&e.SMS_ENABLED!=='true')return json(res,400,{error:'SMS 尚未啟用。 / SMS is not enabled.'});
  const send=route==='/auth/send';if(!await limit(req,send?'send':'verify',i.value))return json(res,429,{error:'請稍後再試。 / Too many attempts. Try again in 10 minutes.'});
  const m=await member(i.column,i.value);
  if(send){if(m)await api('/auth/v1/otp',{method:'POST',auth:true,body:{[i.column]:i.value,create_user:true,...(i.method==='sms'?{channel:'sms'}:{})}});return json(res,200,{message:'如獲授權，驗證碼將發送至該電郵或電話。 / If approved, a code will be sent to this address or number.'});}
  if(!m||!/^\d{6,10}$/.test(String(b.code||'')))return json(res,401,{error:'驗證失敗或未獲授權。 / Invalid code or access not approved.'});
  let verified;try{verified=await api('/auth/v1/verify',{method:'POST',auth:true,body:{[i.column]:i.value,token:String(b.code),type:i.method==='sms'?'sms':'email'}});}catch{return json(res,401,{error:'驗證碼無效或已過期。 / Invalid or expired code.'});}
  const actual=i.method==='sms'?'+'+String(verified.user?.phone||'').replace(/^\+/,''):String(verified.user?.email||'').toLowerCase();
  if(actual!==i.value||!await member('id',m.id))return json(res,401,{error:'Access denied.'});
  const token=crypto.randomBytes(32).toString('hex');await audit(m,i.method==='sms'?'login_sms':'login_email');await api('/rest/v1/tool_sessions',{method:'POST',body:{token_hash:hash(token),member_id:m.id,expires_at:new Date(Date.now()+8*3600000).toISOString()}});res.setHeader('Set-Cookie',sessionCookie(token));return json(res,200,{ok:true});
 }
 if(req.method==='GET'&&['/login','/login.js','/login.css'].includes(route)){const f=route==='/login'?'login.html':route.slice(1);res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');return res.end(await fs.readFile(path.join(process.cwd(),'private',f)));}
 const m=await session(req);
 if(!m){if(req.method==='GET'&&['/','/index.html'].includes(route)){res.statusCode=302;res.setHeader('Location','/login');return res.end();}return json(res,401,{error:'請重新登入。 / Sign in again.'});}
 if(req.method==='GET'&&route==='/auth/session')return json(res,200,{ok:true});
 if(req.method==='POST'&&route==='/auth/logout'){await api(`/rest/v1/tool_sessions?token_hash=eq.${hash(cookie(req))}`,{method:'DELETE'});res.setHeader('Set-Cookie',sessionCookie('',0));await audit(m,'logout');return json(res,200,{ok:true});}
 if(req.method==='POST'&&route==='/auth/generate'){const b=await body(req);if(!tasks.includes(b.task))return json(res,400,{error:'Invalid task.'});await audit(m,'generate_request',b.task);return json(res,200,{ok:true});}
 if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
 const f=route==='/'?'index.html':route.slice(1);if(!assets.has(f))return json(res,404,{error:'Not found.'});res.setHeader('Content-Type',f.endsWith('.png')?'image/png':f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');return res.end(req.method==='HEAD'?undefined:await fs.readFile(path.join(process.cwd(),'private/tool',f)));
 }catch{return json(res,503,{error:'服務未設定或暫時無法使用，請聯絡管理員。 / Service unavailable. Contact the administrator.'});}
};
