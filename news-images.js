'use strict';
/**
 * Publisher images only: RSS metadata, article-page Open Graph/JSON-LD, and
 * a bounded same-origin image delivery endpoint. No generic stock pictures.
 */
const dns = require('node:dns').promises;
const net = require('node:net');

function attr(element, key) {
  const match = String(element).match(new RegExp(`(?:^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : '';
}
function decodeEntities(text='') {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    const named = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' '};
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? all;
    const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : parseInt(entity.slice(1),10);
    try {return String.fromCodePoint(code);} catch {return all;}
  });
}
function absoluteUrl(raw, base) {
  if (!String(raw || '').trim()) return '';
  try {
    const u = new URL(decodeEntities(String(raw || '').trim()), base);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password) return u.href;
  } catch {}
  return '';
}
function isPhotoUrl(raw,base) {
  const url=absoluteUrl(raw,base);
  if(!url)return '';
  try {
    const path=new URL(url).pathname.toLowerCase();
    if(/(?:^|[\/_-])(?:logo|favicon|placeholder|avatar|sprite|default-profile|site-icon)(?:[\/_\-.]|$)/i.test(path))return '';
    if(/\.(?:svg|ico|mp4|pdf|webm|mp3)(?:$)/i.test(path))return '';
  }catch{return '';}
  return url;
}
function extractFromJsonLd(script,base) {
  let json;
  try {json=JSON.parse(decodeEntities(script.trim()));}catch{return '';}
  const queue=[json];let checked=0;
  while(queue.length && checked++<120) {
    const obj=queue.shift();
    if(!obj || typeof obj!=='object')continue;
    if(Array.isArray(obj)) {queue.push(...obj.slice(0,35));continue;}
    const types=[].concat(obj['@type']||[]).join(' ').toLowerCase();
    if(/(?:newsarticle|article|reportagenewsarticle|blogposting|webpage|videoobject)/.test(types)) {
      const raw=obj.image||obj.thumbnailUrl||obj.primaryImageOfPage;
      const imgs=Array.isArray(raw)?raw:[raw];
      for(const candidate of imgs){
        const value=typeof candidate==='string'?candidate:(candidate?.url||candidate?.contentUrl||'');
        const found=isPhotoUrl(value,base);
        if(found)return found;
      }
    }
    for(const key of ['@graph','mainEntity','mainEntityOfPage','hasPart']) if(obj[key]) queue.push(obj[key]);
  }
  return '';
}
function getMetaImg(html,base) {
  const metas=String(html).match(/<meta\b[^>]*>/gi)||[];
  for(const name of ['og:image:secure_url','og:image','twitter:image:src','twitter:image','thumbnail','image']) {
    for(const meta of metas) {
      const key=(attr(meta,'property')||attr(meta,'name')||attr(meta,'itemprop')).toLowerCase();
      if(key!==name)continue;
      const url=isPhotoUrl(attr(meta,'content'),base);
      if(url)return url;
    }
  }
  for(const link of String(html).match(/<link\b[^>]*>/gi)||[]) {
    if(/(?:^|\s)(?:image_src|preload)(?:\s|$)/i.test(attr(link,'rel')) &&
      (attr(link,'rel').toLowerCase()==='image_src'||attr(link,'as').toLowerCase()==='image')) {
      const u=isPhotoUrl(attr(link,'href'),base);if(u)return u;
    }
  }
  for(const script of String(html).match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)||[]) {
    const body=script.replace(/^<script\b[^>]*>/i,'').replace(/<\/script>$/i,'');
    const u=extractFromJsonLd(body,base);if(u)return u;
  }
  // Fallback to image inside the actual article, never an unrelated thumbnail from the sidebar.
  const article=(String(html).match(/<article\b[\s\S]*?<\/article>/i)||[])[0]||'';
  for(const image of article.match(/<img\b[^>]*>/gi)||[]) {
    for(const key of ['data-src','data-original','data-lazy-src','src']) {
      const url=isPhotoUrl(attr(image,key),base);
      if(url)return url;
    }
    const srcset=attr(image,'data-srcset')||attr(image,'srcset');
    if(srcset){const url=isPhotoUrl(srcset.split(',').at(-1).trim().split(/\s+/)[0],base);if(url)return url;}
  }
  return '';
}
function parseGoogleNewsResponse(body) {
  const content=String(body||'');
  const start=content.indexOf('\n\n');
  const json=JSON.parse(start>=0?content.slice(start+2):content.replace(/^\)\]\}'\s*/,'').trim());
  const rows=Array.isArray(json)?json:[];
  const frame=rows.find(a=>Array.isArray(a)&&a[0]==='wrb.fr'&&a[1]==='Fbv4je');
  if(!frame||!frame[2])return '';
  const result=JSON.parse(frame[2]);
  return result?.[0]==='garturlres'?absoluteUrl(result[1]):'';
}
async function decodeGoogleNewsUrl(link,{fetcher=fetch,timeoutMs=8500}={}) {
  const url=new URL(link);
  if(url.hostname!=='news.google.com')return absoluteUrl(link);
  const id=url.pathname.match(/\/(?:rss\/)?(?:articles|read)\/([^/?#]+)/)?.[1];
  if(!id||!/^[A-Za-z0-9_-]{20,}$/.test(id))return '';
  const raw=Buffer.from(id.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
  if(!raw.includes('AU_yqL')) {
    const found=raw.match(/https?:\/\/[^\x00-\x20<>"'\\]+/);
    if(found)return absoluteUrl(found[0].replace(/[\x80-\xff]+$/,''));
  }
  const headers={
    'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language':'ar-EG,ar;q=0.9,en-US;q=0.8',
    'Cookie':'CONSENT=PENDING+987',
    'Accept':'text/html,application/xhtml+xml,*/*;q=0.8'
  };
  const page=await fetcher(`https://news.google.com/rss/articles/${id}`,{headers,signal:AbortSignal.timeout(timeoutMs),redirect:'follow'});
  if(!page.ok)throw new Error(`Google News page HTTP ${page.status}`);
  const html=(await page.text()).slice(0,500000);
  const sg=html.match(/data-n-a-sg=["']([^"']+)["']/i)?.[1];
  const ts=html.match(/data-n-a-ts=["'](\d+)["']/i)?.[1];
  if(!sg||!ts)throw new Error('Google News decode parameters missing');
  const inner=['garturlreq', [['X','X',['X','X'],null,null,1,1,'US:en',null,1,null,null,null,null,null,0,1], 'X','X',1,[1,1,1],1,1,null,0,0,null,0], id,Number(ts),sg];
  const form=new URLSearchParams({'f.req':JSON.stringify([[['Fbv4je',JSON.stringify(inner),null,'generic']]])});
  const res=await fetcher('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je',{
    method:'POST',signal:AbortSignal.timeout(timeoutMs),
    headers:{...headers,'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Origin':'https://news.google.com','Referer':'https://news.google.com/','X-Same-Domain':'1'},
    body:form.toString()
  });
  if(!res.ok)throw new Error(`Google News decode HTTP ${res.status}`);
  return parseGoogleNewsResponse(await res.text());
}
function isPublicAddress(address) {
  const ip=net.isIP(address);
  if(ip===4) {
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0&&c===2||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
  }
  if(ip===6) {
    const raw=address.toLowerCase();
    return !(raw==='::1'||raw==='::'||raw.startsWith('fc')||raw.startsWith('fd')||raw.startsWith('fe8')||raw.startsWith('fe9')||raw.startsWith('fea')||raw.startsWith('feb')||raw.startsWith('ff')||raw.startsWith('2001:db8')||raw.startsWith('::ffff:'));
  }
  return false;
}
async function assertRemotePublic(raw,{lookup=dns.lookup}={}) {
  const u=new URL(raw);
  if(!['https:','http:'].includes(u.protocol) || u.username||u.password)throw new Error('Invalid remote URL');
  if(u.port && !['80','443'].includes(u.port))throw new Error('Remote port blocked');
  const hostname=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(net.isIP(hostname)||!hostname.includes('.')||/\.(?:local|internal|localhost|test|invalid|example)$/i.test(hostname))throw new Error('Remote host blocked');
  const addrs=await lookup(hostname,{all:true});
  if(!addrs.length||addrs.some(a=>!isPublicAddress(a.address)))throw new Error('Non-public address blocked');
  return u.href;
}
function imageMime(buffer) {
  if(buffer.length>3 && buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return 'image/jpeg';
  if(buffer.length>=8 && buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))return 'image/png';
  if(buffer.length>=12 && buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return 'image/webp';
  if(buffer.length>=6 && /^GIF8[79]a/.test(buffer.toString('ascii',0,6)))return 'image/gif';
  if(buffer.length>=12 && buffer.toString('ascii',4,8)==='ftyp'&&/avif|avis/.test(buffer.toString('ascii',8,12)))return 'image/avif';
  return '';
}
async function downloadPublisherImage(imageUrl,articleUrl,{fetcher=fetch,lookup=dns.lookup,limit=6*1024*1024}={}) {
  let current=imageUrl;
  for(let attempt=0;attempt<4;attempt++) {
    current=await assertRemotePublic(current,{lookup});
    const response=await fetcher(current,{
      headers:{
        'Accept':'image/avif,image/webp,image/apng,image/*;q=0.8,*/*;q=0.5',
        'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        'Referer':articleUrl,
      },redirect:'manual',signal:AbortSignal.timeout(10_000)
    });
    if(response.status>=300&&response.status<400){
      if(!response.headers.get('location'))throw new Error('Empty image redirect');
      current=new URL(response.headers.get('location'),current).href;
      await response.body?.cancel();continue;
    }
    if(!response.ok)throw new Error(`Image HTTP ${response.status}`);
    const declared=Number(response.headers.get('content-length')||0);
    if(declared>limit)throw new Error('Image file too big');
    if(/text\/|json|svg|html|xml/.test(response.headers.get('content-type')||''))throw new Error('Not a photo');
    let bytes=0;const chunks=[];
    try {
      for await(const chunk of response.body){
        bytes+=chunk.length;
        if(bytes>limit)throw new Error('Image exceeded limit');
        chunks.push(Buffer.from(chunk));
      }
    }catch(e){try{await response.body?.cancel();}catch{}throw e;}
    const data=Buffer.concat(chunks);
    const mime=imageMime(data);
    if(!mime)throw new Error('Image format not supported');
    return {data,mime};
  }
  throw new Error('Too many image redirects');
}
module.exports={absoluteUrl,isPhotoUrl,getMetaImg,parseGoogleNewsResponse,decodeGoogleNewsUrl,assertRemotePublic,isPublicAddress,imageMime,downloadPublisherImage};
