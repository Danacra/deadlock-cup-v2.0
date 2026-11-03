// Deadlock Cup • Steam avatar sync (admin-only) • Supabase Edge Function
// Configure secret STEAM_WEB_API_KEY in Supabase Edge Functions > Secrets.
// Never put Steam credentials or a service key in a browser bundle.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: object, status=200) {
  return new Response(JSON.stringify(body), {status,headers:{...cors,'content-type':'application/json'}});
}
const validAvatar = (value: unknown) => {
  if (typeof value !== 'string') return '';
  try {
    const url=new URL(value);
    return url.protocol==='https:' && [
      'avatars.steamstatic.com','avatars.fastly.steamstatic.com','avatars.akamai.steamstatic.com',
      'avatars.cloudflare.steamstatic.com','steamcdn-a.akamaihd.net','cdn.akamai.steamstatic.com'
    ].includes(url.hostname) ? url.href : '';
  } catch {return '';}
};

Deno.serve(async (request: Request) => {
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return json({error:'POST only'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL')||'';
    const publicKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
    const anon=Deno.env.get('SUPABASE_ANON_KEY')||publicKeys.default||'';
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||secretKeys.default||'';
    const steamKey=Deno.env.get('STEAM_WEB_API_KEY')||'';
    const jwt=(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    if(!jwt||!anon||!service)return json({error:'Не настроена авторизация функции'},401);
    const publicClient=createClient(url,anon);
    const {data:{user},error:userError}=await publicClient.auth.getUser(jwt);
    if(userError||!user)return json({error:'Вход администратора обязателен'},401);
    const adminClient=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:admin,error:roleError}=await adminClient.from('app_admins')
      .select('user_id').eq('user_id',user.id).maybeSingle();
    if(roleError||!admin)return json({error:'Нет прав администратора'},403);
    const payload=await request.json();
    const id=payload?.registration_id;
    if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))return json({error:'Некорректный ID'},400);
    const {data:player,error:readError}=await adminClient.from('registrations')
      .select('id,steam_profile,steam_avatar_opt_in,status').eq('id',id).maybeSingle();
    if(readError||!player)return json({error:'Игрок не найден'},404);
    if(!player.steam_avatar_opt_in)return json({error:'Нет согласия игрока на публикацию аватара'},403);
    if(player.status!=='approved')return json({error:'Сначала одобри заявку игрока'},400);
    const input=String(player.steam_profile||'').trim();
    let steamId='';let vanity='';
    // Parse only strict Steam community URLs. No URL supplied by player is fetched directly.
    try {
      const parsed=new URL(input);
      if(parsed.protocol!=='https:'||parsed.hostname!=='steamcommunity.com')
        return json({error:'Нужна ссылка https://steamcommunity.com/id/... или /profiles/...'},400);
      const match=parsed.pathname.match(/^\/(profiles|id)\/([^/]+)\/?$/);
      if(!match)return json({error:'Неподдерживаемая ссылка Steam'},400);
      if(match[1]==='profiles' && /^\d{17}$/.test(match[2]))steamId=match[2];
      else if(match[1]==='id' && /^[a-z\d_-]{2,64}$/i.test(match[2]))vanity=match[2];
      else return json({error:'Некорректный Steam ID'},400);
    } catch {return json({error:'Неверная ссылка Steam'},400);}
    if(!steamKey)return json({error:'Организатор ещё не настроил STEAM_WEB_API_KEY'},503);
    if(vanity){
      const response=await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(steamKey)}&vanityurl=${encodeURIComponent(vanity)}`);
      if(!response.ok)return json({error:`Steam API отклонил запрос (HTTP ${response.status}). Проверь STEAM_WEB_API_KEY в Secrets.`},502);
      const data=await response.json();
      if(data?.response?.success!==1||!/^\d{17}$/.test(data.response.steamid||''))return json({error:'Не найден Steam-профиль'},404);
      steamId=data.response.steamid;
    }
    const response=await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(steamKey)}&steamids=${steamId}`);
    if(!response.ok)return json({error:`Steam API отклонил запрос (HTTP ${response.status}). Проверь STEAM_WEB_API_KEY в Secrets.`},502);
    const body=await response.json();
    const avatar=validAvatar(body?.response?.players?.[0]?.avatarfull);
    if(!avatar)return json({error:'Публичный Steam-аватар не найден'},404);
    const {error:updateError}=await adminClient.from('registrations')
      .update({steam_avatar_url:avatar}).eq('id',id).eq('steam_avatar_opt_in',true);
    if(updateError)throw updateError;
    return json({ok:true,avatar_url:avatar});
  }catch(error){
    console.error('Steam avatar sync error',error);
    return json({error:'Ошибка получения аватара Steam'},500);
  }
});
