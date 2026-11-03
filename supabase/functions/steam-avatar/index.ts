// Deadlock Cup v3.2 • Steam avatars, RLS-authenticated administrator only.
// One role check: public.is_admin(), matching the dashboard and Supabase policies.
// STEAM_WEB_API_KEY is a server-side Supabase Edge Function secret.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
const respond = (body: Record<string,unknown>, status=200) => new Response(JSON.stringify(body), {
  status,headers: {...cors,'Content-Type':'application/json; charset=utf-8'}
});
const avatarHosts = new Set([
 'avatars.steamstatic.com','avatars.fastly.steamstatic.com','avatars.akamai.steamstatic.com',
 'avatars.cloudflare.steamstatic.com','steamcdn-a.akamaihd.net','cdn.akamai.steamstatic.com'
]);
function validAvatar(value: unknown): string {
 if (typeof value !== 'string') return '';
 try {const u=new URL(value);return u.protocol==='https:'&&avatarHosts.has(u.hostname)?u.href:'';}
 catch {return '';}
}
function bearer(req: Request): string {
 const value=req.headers.get('authorization')||'';
 return value.match(/^Bearer\s+([^\s]+)$/i)?.[1]||'';
}
function publicKey(): string {
 const legacy=Deno.env.get('SUPABASE_ANON_KEY')||'';
 if(legacy)return legacy;
 try {const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');return keys.default||'';}
 catch{return '';}
}
Deno.serve(async (request: Request) => {
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return respond({error:'Требуется POST'},405);
 try {
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=publicKey();
  const jwt=bearer(request);
  if(!url||!key||!jwt)return respond({error:'Отсутствует авторизация или публичный ключ Supabase'},401);
  // The browser-provided token is VERIFIED by Supabase Auth, not trusted blindly.
  // Every query uses this token and is subject to the existing RLS policies.
  const userDb=createClient(url,key,{
    global:{headers:{Authorization:`Bearer ${jwt}`}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:{user},error:authError}=await userDb.auth.getUser(jwt);
  if(authError||!user)return respond({error:'Необходимо войти в админ-панель повторно'},401);
  const {data:isAdmin,error:roleError}=await userDb.rpc('is_admin');
  if(roleError)return respond({error:'Не удалось проверить роль администратора: '+roleError.message},403);
  if(isAdmin!==true)return respond({error:'Учётная запись не имеет роли администратора'},403);
  const body=await request.json().catch(()=>null);
  const id=body?.registration_id;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))return respond({error:'Некорректный ID регистрации'},400);
  const {data:player,error:lookupError}=await userDb.from('registrations')
    .select('id,steam_profile,steam_avatar_opt_in,status').eq('id',id).maybeSingle();
  if(lookupError)return respond({error:'Не удалось прочитать анкету: '+lookupError.message},403);
  if(!player)return respond({error:'Анкета не найдена'},404);
  if(!player.steam_avatar_opt_in)return respond({error:'Игрок не разрешил публикацию Steam-аватара'},403);
  if(player.status!=='approved')return respond({error:'Сначала одобри заявку игрока'},400);
  const steamKey=Deno.env.get('STEAM_WEB_API_KEY')||'';
  if(!steamKey)return respond({error:'Секрет STEAM_WEB_API_KEY не установлен в Supabase'},503);
  let steamId=''; let vanity='';
  try {
   const profile=new URL(String(player.steam_profile||'').trim());
   if(profile.protocol!=='https:'||profile.hostname!=='steamcommunity.com')
     return respond({error:'Нужна ссылка https://steamcommunity.com/id/... или /profiles/...'},400);
   const match=profile.pathname.match(/^\/(profiles|id)\/([^/]+)\/?$/);
   if(!match)return respond({error:'Неподдерживаемая ссылка Steam'},400);
   if(match[1]==='profiles'&&/^\d{17}$/.test(match[2]))steamId=match[2];
   else if(match[1]==='id'&&/^[a-z\d_-]{2,64}$/i.test(match[2]))vanity=match[2];
   else return respond({error:'Неверный Steam ID'},400);
  }catch{return respond({error:'Некорректная ссылка на Steam'},400);}
  if(vanity){
   const res=await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(steamKey)}&vanityurl=${encodeURIComponent(vanity)}`);
   if(!res.ok)return respond({error:`Steam API: HTTP ${res.status} при поиске профиля`},502);
   const data=await res.json();
   if(data?.response?.success!==1||!/^\d{17}$/.test(String(data?.response?.steamid||'')))return respond({error:'Профиль Steam не найден'},404);
   steamId=data.response.steamid;
  }
  const res=await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(steamKey)}&steamids=${encodeURIComponent(steamId)}`);
  if(!res.ok)return respond({error:`Steam API: HTTP ${res.status} при загрузке аватара`},502);
  const data=await res.json();
  const avatar=validAvatar(data?.response?.players?.[0]?.avatarfull);
  if(!avatar)return respond({error:'Публичный Steam-аватар не найден'},404);
  const {error:updateError}=await userDb.from('registrations')
   .update({steam_avatar_url:avatar}).eq('id',id).eq('steam_avatar_opt_in',true);
  if(updateError)return respond({error:'Нет прав на запись аватара: '+updateError.message},403);
  return respond({ok:true,avatar_url:avatar});
 }catch(err){
  console.error('steam-avatar exception',err instanceof Error ? err.name : 'unknown');
  return respond({error:'Серверная ошибка синхронизации Steam-аватара'},500);
 }
});
