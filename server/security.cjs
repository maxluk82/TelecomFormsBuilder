const crypto=require('node:crypto');
const cookieName='__Host-cmhk_session';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function identity(body){const method=body.method;if(!['email','sms'].includes(method))throw new Error('invalid');const value=String(body.identity||'').trim();const normalized=method==='email'?value.toLowerCase():value.replace(/[\s()-]/g,'');if(method==='email'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||normalized.length>254:!/^\+[1-9]\d{7,14}$/.test(normalized))throw new Error('invalid');return {method,value:normalized,column:method==='email'?'email':'phone'};}
function cookie(req){const match=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));const value=match?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null;}
function sessionCookie(value,age=28800){return `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;}
module.exports={hash,identity,cookie,sessionCookie};
