/**
 * رادار السويس — lightweight zero-dependency Node.js news-aggregation server.
 * Sources: publisher RSS where verified, Google News RSS site searches, GDELT DOC metadata.
 * Original headlines, snippets and credited thumbnails only; no full-text copying.
 * Node.js 20+ (22+ recommended).
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {getMetaImg, decodeGoogleNewsUrl, downloadPublisherImage, isPhotoUrl} = require('./news-images');

const PORT = Number(process.env.PORT || 3000);
const REFRESH_MS = Math.max(60_000, Number(process.env.REFRESH_MINUTES || 5) * 60_000);
const DAYS = Math.max(1, Math.min(90, Number(process.env.LOOKBACK_DAYS || 30)));
const MAX_ARTICLES = 350;
const TIMEOUT_MS = 9_000;
const PUBLIC = path.join(__dirname, 'public');
const SOURCES = [
  {id:'ahram',      name:'بوابة الأهرام',        domain:'gate.ahram.org.eg'},
  {id:'youm7',      name:'اليوم السابع',         domain:'youm7.com', feeds:['https://www.youm7.com/rss/SectionRss?SectionID=296','https://www.youm7.com/rss/rss']},
  {id:'watan',      name:'الوطن',                domain:'elwatannews.com'},
  {id:'masry',      name:'المصري اليوم',         domain:'almasryalyoum.com', feeds:['https://www.almasryalyoum.com/rss/rssfeed']},
  {id:'masrawy',    name:'مصراوي',              domain:'masrawy.com'},
  {id:'akhbar',     name:'أخبار اليوم',          domain:'akhbarelyom.com'},
  {id:'masrel',     name:'مصر اليوم',            domain:'egypt-today.com'},
  {id:'mesrelyoum', name:'جريدة مصر اليوم',     domain:'mesrelyoum.com'},
  {id:'veto',       name:'فيتو',                 domain:'vetogate.com'},
  {id:'shorouk',    name:'الشروق',               domain:'shorouknews.com', feed:'https://www.shorouknews.com/egypt/rss'},
  {id:'sada',       name:'صدى البلد',            domain:'elbalad.news'},
  {id:'cairo24',    name:'القاهرة 24',           domain:'cairo24.com'},
  {id:'dostor',     name:'الدستور',              domain:'dostor.org'},
  {id:'fagr',       name:'الفجر',                domain:'elfagr.org'},
  {id:'wafd',       name:'الوفد',                domain:'alwafd.news'},
  {id:'gomhuria',   name:'الجمهورية أونلاين',    domain:'gomhuriaonline.com'},
  {id:'bawaba',     name:'البوابة نيوز',         domain:'albawabhnews.com'},
  {id:'mal',        name:'جريدة المال',          domain:'almalnews.com'},
];

const state = {
  articles: [],
  updating: false,
  fetchedAt: null,
  lastAttempt: null,
  lastError: null,
  imagesLoading: false,
  imagesChecked: 0,
  imagesToCheck: 0,
  sources: Object.fromEntries(SOURCES.map(s=>[s.id,{status:'waiting',count:0,lastCheck:null}])),
};
let lastKickoff = 0;
let scheduledRefresh = null;
const ogCache = new Map();
const googleLinkCache = new Map();
const imageCache = new Map();
const pendingImageRequests = new Map();
let imageCacheBytes = 0;
let enrichGeneration = 0;
const ENRICH_CONCURRENCY = 6;
const ENRICH_LIMIT = MAX_ARTICLES;

const getText = async(url, timeout=TIMEOUT_MS) => {
  const res = await fetch(url, {signal:AbortSignal.timeout(timeout), headers:{
    'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept':url.includes('/rss')||url.includes('news.google.com/rss/')?'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.6':url.includes('api.gdeltproject.org')?'application/json,*/*;q=0.7':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.6',
    'Accept-Language':'ar-EG,ar;q=0.9,en;q=0.6'
  }, redirect:'follow'});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return {text:await res.text(),contentType:res.headers.get('content-type')||'',url:res.url};
};
function stripCdata(s='') {return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1');}
function decodeEntities(s='') {return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|hellip|mdash|ndash|raquo|laquo);/gi,(_,x)=>{
  const common={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',mdash:'—',ndash:'–',raquo:'»',laquo:'«'};
  if(x[0]==='#') {const num=x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):parseInt(x.slice(1),10);try{return String.fromCodePoint(num);}catch{return _;}}
  return common[x.toLowerCase()]||_;
});}
function unescapeAll(s='') {return decodeEntities(stripCdata(s));}
function plain(s='') {return unescapeAll(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function tag(xml,name) {
  const match=xml.match(new RegExp(`<${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));
  return match?unescapeAll(match[1]).trim():'';
}
function attr(s,key) {const m=String(s).match(new RegExp('(?:^|\\s)'+key+'\\s*=\\s*["\']([^"\']+)["\']','i'));return m?unescapeAll(m[1]):'';}
function httpsURL(raw,base) {
  try{const u=new URL(raw,base);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}
}
function validDate(raw) {
  if(!raw)return null;
  const d=new Date(raw);
  return Number.isFinite(d.getTime())?d.toISOString():null;
}
function safeDomain(raw) {try{return new URL(raw).hostname.replace(/^www\./,'').toLowerCase();}catch{return '';}}
function normalized(s) {return plain(s).normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
const INTEREST = /السويس|هاني\s+رشاد|محافظ\s+السويس|محافظه\s+السويس/;
function isRelevant(title,desc='') {
  const t=normalized(`${title} ${desc}`);
  if(!INTEREST.test(t)) return false;
  // A Canal/University headline alone need not describe Suez Governorate.
  if(/(?:جامعه|قناه) السويس/.test(normalized(title)) && !/محافظ السويس|محافظه السويس|هاني رشاد|مدينه السويس|حي السويس|محافظات السويس/.test(t)) return false;
  return true;
}
function categoryFor(title,desc='') {
  const t=normalized(`${title} ${desc}`);
  return /هاني\s+رشاد|محافظ\s+السويس/.test(t)?'governor':'suez';
}
function imageFromRss(xml,description,base) {
  // Use the ORIGINAL article's image from RSS media fields, never a feed logo.
  for (const pattern of [/<media:content\b[^>]*>/gi,/<media:thumbnail\b[^>]*>/gi,/<enclosure\b[^>]*>/gi,/<itunes:image\b[^>]*>/gi]) {
    const found=xml.match(pattern)||[];
    for(const el of found){
      const type=attr(el,'type');
      if(type && !type.startsWith('image/'))continue;
      const u=isPhotoUrl(attr(el,'url')||attr(el,'href'),base);
      if(u)return u;
    }
  }
  const html=String(description||'')+' '+tag(xml,'content:encoded');
  for(const img of html.match(/<img\b[^>]*>/gi)||[]){
    for(const key of ['data-src','data-original','src']){
      const url=isPhotoUrl(attr(img,key),base);if(url)return url;
    }
    const srcset=attr(img,'srcset');
    if(srcset){const url=isPhotoUrl(srcset.split(',').at(-1).trim().split(/\s+/)[0],base);if(url)return url;}
  }
  return '';
}
function decodeGoogleLink(url) {
  try{
    const u=new URL(url);
    if(!u.hostname.endsWith('news.google.com'))return url;
    const chunk=u.pathname.split('/').filter(Boolean).at(-1);
    if(!chunk)return url;
    const buf=Buffer.from(chunk.replace(/-/g,'+').replace(/_/g,'/'),'base64');
    const raw=buf.toString('utf8');
    const match=raw.match(/https?:\/\/[^\x00-\x20<>"'\\]+/);
    if(match){const original=match[0].replace(/[\x80-\xff]+$/,''); return httpsURL(original)||url;}
  }catch{}
  return url;
}
function story(title,url,date,description,image,source,collector) {
  const cleanTitle=plain(title).replace(/\s+[\-–—]\s+(?:اليوم السابع|الشروق|الوطن|المصري اليوم|مصراوي|فيتو|بوابة الأهرام|أخبار اليوم|القاهرة 24|مصر اليوم)\s*$/,'');
  const teaser=plain(description).replace(/\s+/g,' ').slice(0,260);
  if(cleanTitle.length<12||!isRelevant(cleanTitle,teaser))return null;
  const canonical=httpsURL(url);
  if(!canonical)return null;
  const dt=validDate(date);
  if(dt && Date.now()-new Date(dt).getTime()>DAYS*86400000+86400000)return null;
  return {id:crypto.createHash('sha1').update(source.id+'|'+normalized(cleanTitle)).digest('hex').slice(0,16),
    title:cleanTitle,url:canonical,publicationDate:dt,description:teaser,image:httpsURL(image)||null,imageSource:image?collector:null,
    sourceId:source.id,sourceName:source.name,category:categoryFor(cleanTitle,teaser),collector};
}
function parseRss(xml,source,collector='rss') {
  const blocks=[...(xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[])];
  const entries=[];
  for(const entry of blocks){
    const title=tag(entry,'title'),link=tag(entry,'link'),desc=tag(entry,'description'),date=tag(entry,'pubDate')||tag(entry,'dc:date');
    const url=decodeGoogleLink(link);
    const item=story(title,url,date,desc,imageFromRss(entry,desc,url),source,collector);
    if(item)entries.push(item);
  }
  return entries;
}
function googleUrl(domain) {
  const q=`("السويس" OR "محافظة السويس" OR "محافظ السويس" OR "هاني رشاد" OR "هانى رشاد") site:${domain} when:${DAYS}d`;
  const u=new URL('https://news.google.com/rss/search');
  u.searchParams.set('q',q);u.searchParams.set('hl','ar');u.searchParams.set('gl','EG');u.searchParams.set('ceid','EG:ar');
  return u.href;
}
function gdeltUrl() {
  const u=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  u.searchParams.set('query','("محافظ السويس" OR "محافظة السويس" OR "هاني رشاد" OR "هانى رشاد" OR "السويس")');
  u.searchParams.set('mode','artlist');u.searchParams.set('format','json');u.searchParams.set('timespan',`${DAYS}d`);
  u.searchParams.set('maxrecords','250');u.searchParams.set('sort','datedesc');
  return u.href;
}
async function getGdeltArticles() {
  try{
    const {text}=await getText(gdeltUrl(),11_000);
    const json=JSON.parse(text);
    if(!Array.isArray(json.articles))return [];
    const results=[];
    for(const a of json.articles) {
      const source=SOURCES.find(s=>safeDomain(a.url)===s.domain||safeDomain(a.url).endsWith('.'+s.domain));
      if(!source)continue;
      const date=/^\d{14}$/.test(a.seendate||'')?`${a.seendate.slice(0,4)}-${a.seendate.slice(4,6)}-${a.seendate.slice(6,8)}T${a.seendate.slice(8,10)}:${a.seendate.slice(10,12)}:${a.seendate.slice(12,14)}Z`:a.seendate;
      const item=story(a.title,a.url,date,'',a.socialimage,source,'gdelt');
      if(item)results.push(item);
    }
    return results;
  }catch(e){console.warn('[GDELT]',e.message);return [];}
}
// Bing News RSS sometimes provides the original article URL AND its article thumbnail.
// It is an independent fallback when Google News returns opaque redirects.
function bingUrl(phrase){
  const u=new URL('https://www.bing.com/news/search');
  u.searchParams.set('q',phrase);
  u.searchParams.set('format','rss');
  u.searchParams.set('setlang','ar');
  u.searchParams.set('cc','EG');
  return u.href;
}
function unwrapBingLink(raw){
  const url=httpsURL(raw);
  if(!url)return '';
  try{
    const u=new URL(url);
    if(!/(?:^|\.)bing\.com$/.test(u.hostname))return url;
    for(const key of ['url','target','redirectUrl']){
      const candidate=httpsURL(u.searchParams.get(key));
      if(candidate)return candidate;
    }
  }catch{}
  return url;
}
function parseBingRss(xml){
  const entries=[];
  for(const entry of (xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[])){
    const title=tag(entry,'title'), desc=tag(entry,'description');
    const link=unwrapBingLink(tag(entry,'link'));
    const domain=safeDomain(link);
    const source=SOURCES.find(s=>domain===s.domain||domain.endsWith('.'+s.domain));
    if(!source)continue;
    const date=tag(entry,'pubDate')||tag(entry,'dc:date');
    const media=tag(entry,'News:Image')||tag(entry,'news:image')||tag(entry,'thumbnail');
    const image=imageFromRss(entry,desc,link)||isPhotoUrl(media,link);
    const article=story(title,link,date,desc,image,source,'bing');
    if(article)entries.push(article);
  }
  return entries;
}
async function getBingArticles(){
  const terms=['"محافظة السويس" OR "محافظ السويس"','"هاني رشاد" OR "هانى رشاد"'];
  const responses=await Promise.allSettled(terms.map(async q=>{
    const xml=(await getText(bingUrl(q),11000)).text;
    if(!/<item(?:\s|>)/i.test(xml))throw new Error('Bing did not return RSS');
    return parseBingRss(xml);
  }));
  for(const r of responses)if(r.status==='rejected')console.warn('[Bing RSS]',r.reason.message);
  return responses.flatMap(r=>r.status==='fulfilled'?r.value:[]);
}
async function getSourceArticles(source){
  const tasks=[{kind:'google',url:googleUrl(source.domain)}];
  for(const feed of (source.feeds|| (source.feed?[source.feed]:[])))tasks.unshift({kind:'rss',url:feed});
  const responses=await Promise.allSettled(tasks.map(async t=>{const xml=(await getText(t.url)).text;if(!/<item(?:\s|>)/i.test(xml))throw new Error('RSS empty or invalid');return parseRss(xml,source,t.kind);}));
  const articles=responses.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  const success=responses.some(r=>r.status==='fulfilled');
  state.sources[source.id]={status:success?'ok':'error',count:articles.length,lastCheck:new Date().toISOString()};
  if(!success)console.warn(`[${source.id}] feed search failed:`,responses.map(r=>r.status==='rejected'?r.reason.message:'OK').join(', '));
  return articles;
}
function rankArticle(a){return (a.image?10:0)+(/news\.google\.com/.test(a.url)?0:4)+(a.description?1:0)+(a.collector==='gdelt'?1:0);}
function mergeNews(items){
  const map=new Map();
  for(const item of items){
    if(!item)continue;
    const key=item.sourceId+'|'+normalized(item.title);
    if(!map.has(key)){map.set(key,item);continue;}
    const prior=map.get(key);
    if(rankArticle(item)>rankArticle(prior))map.set(key,{...item,description:item.description||prior.description,publicationDate:item.publicationDate||prior.publicationDate,image:item.image||prior.image});
    else if(!prior.image&&item.image){prior.image=item.image;}
  }
  return [...map.values()].sort((a,b)=>(Date.parse(b.publicationDate)||0)-(Date.parse(a.publicationDate)||0)).slice(0,MAX_ARTICLES);
}
function isPublisherUrl(articleUrl,sourceId) {
  const domain=safeDomain(articleUrl);
  const source=SOURCES.find(s=>s.id===sourceId);
  return Boolean(source && (domain===source.domain||domain.endsWith('.'+source.domain)));
}
async function resolvePublisherArticle(article) {
  if(isPublisherUrl(article.url,article.sourceId))return article.url;
  if(safeDomain(article.url)!=='news.google.com')return '';
  const prev=googleLinkCache.get(article.url);
  if(prev&&Date.now()-prev.at<(prev.url?48*3600000:25*60000))return prev.url;
  let found='';
  try{
    const url=await decodeGoogleNewsUrl(article.url,{timeoutMs:6500});
    if(isPublisherUrl(url,article.sourceId))found=url;
  }catch(e){if(!googleLinkCache.size || googleLinkCache.size%40===0) console.warn('[Google News link]',e.message);}
  googleLinkCache.set(article.url,{url:found,at:Date.now()});
  return found;
}
async function findOriginalImage(article,{force=false}={}){
  if(article.image&&!force)return article.image;
  if(!isPublisherUrl(article.url,article.sourceId))return '';
  const prev=ogCache.get(article.url);
  if(prev&&Date.now()-prev.at<(prev.image?48*3600000:20*60000))return prev.image;
  let image='';
  try{
    // OG image, Twitter image, JSON-LD and article's featured <img> (in this order).
    const html=(await getText(article.url,6500)).text.slice(0,700000);
    image=getMetaImg(html,article.url);
  }catch{}
  ogCache.set(article.url,{image,at:Date.now()});
  return image;
}
async function enrichImages(articles,generation){
  const pending=articles.filter(a=>!a.image||safeDomain(a.url)==='news.google.com').slice(0,ENRICH_LIMIT);
  state.imagesToCheck=pending.length;
  state.imagesChecked=0;
  state.imagesLoading=Boolean(pending.length);
  let cursor=0;
  await Promise.all(Array.from({length:ENRICH_CONCURRENCY},async()=>{
    while(cursor<pending.length && generation===enrichGeneration){
      const article=pending[cursor++];
      if(safeDomain(article.url)==='news.google.com'){
        const original=await resolvePublisherArticle(article);
        if(original)article.url=original;
      }
      if(!article.image){article.image=await findOriginalImage(article)||null;if(article.image)article.imageSource='article';}
      article.imagePending=false;
      if(generation===enrichGeneration)state.imagesChecked++;
    }
  }));
  if(generation===enrichGeneration)state.imagesLoading=false;
  console.log(`[News pictures] checked ${state.imagesChecked}/${pending.length}, photo links ${articles.filter(a=>a.image).length}/${articles.length}`);
}
async function getCachedImage(article){
  const key=article.image;
  const cached=imageCache.get(key);
  if(cached){
    if(Date.now()<cached.expires)return cached;
    imageCache.delete(key);imageCacheBytes-=cached.data.length;
  }
  if(pendingImageRequests.has(key))return pendingImageRequests.get(key);
  const task=(async()=>{
    try{return await downloadPublisherImage(key,article.url);}
    catch(error){
      // If the thumbnail/CDN rejects requests, recover via the article's own OG image.
      // Never substitute an unrelated stock photo.
      const alternate=await findOriginalImage(article,{force:true});
      if(!alternate||alternate===key)throw error;
      const result=await downloadPublisherImage(alternate,article.url);
      article.image=alternate;article.imageSource='article';
      return result;
    }
  })().then(({data,mime})=>{
    // Keep the in-memory LRU small; browsers cache the returned image too.
    while(imageCacheBytes+data.length>35*1024*1024 && imageCache.size){
      const first=imageCache.keys().next().value;
      const old=imageCache.get(first);imageCacheBytes-=old.data.length;imageCache.delete(first);
    }
    const result={data,mime,expires:Date.now()+24*3600000};
    imageCache.set(key,result);imageCacheBytes+=data.length;
    return result;
  }).finally(()=>pendingImageRequests.delete(key));
  pendingImageRequests.set(key,task);
  return task;
}
async function runRefresh(){
  if(state.updating)return false;
  state.updating=true;state.lastAttempt=new Date().toISOString();lastKickoff=Date.now();
  const oldItems=state.articles;
  try{
    const queue=[...SOURCES];let idx=0;const all=[];
    await Promise.all(Array.from({length:7},async()=>{
      while(idx<queue.length){const s=queue[idx++];
        try{all.push(...await getSourceArticles(s));}catch(e){console.warn(`[${s.id}]`,e.message);}
      }
    }).concat([getGdeltArticles().then(arr=>{all.push(...arr);}),getBingArticles().then(arr=>{all.push(...arr);})]));
    const merged=mergeNews(all);
    if(merged.length){
      // Reuse links/images already retrieved in earlier updates.
      const priorById=new Map(oldItems.map(a=>[a.id,a]));
      for(const item of merged){
        const old=priorById.get(item.id);
        if(old){
          if(!item.image && old.image){item.image=old.image;item.imageSource=old.imageSource;}
          if(isPublisherUrl(old.url,old.sourceId) && !isPublisherUrl(item.url,item.sourceId))item.url=old.url;
        }
        item.imagePending=!item.image && (isPublisherUrl(item.url,item.sourceId)||safeDomain(item.url)==='news.google.com');
      }
      state.articles=merged;state.fetchedAt=new Date().toISOString();state.lastError=null;
      const generation=++enrichGeneration;
      // Publish titles immediately; photos arrive progressively in /api/news.
      void enrichImages(merged,generation).catch(e=>{console.warn('[Photo enrichment]',e.message);if(generation===enrichGeneration)state.imagesLoading=false;});
    }
    else if(!oldItems.length){state.articles=[];state.lastError='لم ترجع المصادر أخبارًا مطابقة حاليًا. تحقق من اتصال الخادم بالإنترنت أو وسّع مدة البحث.';}
    else{state.lastError='تعذّر جلب أخبار جديدة، ونعرض آخر نتائج محفوظة.';}
    console.log(`[News] matched ${merged.length} articles at ${state.lastAttempt}`);
  }catch(e){console.error('[Refresh]',e);state.lastError='تعذّر تحديث الأخبار من المصادر الخارجية.';}
  finally{state.updating=false;}
  return true;
}
function sendJson(res,data,code=200){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
const routes={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/assets/favicon.svg':'assets/favicon.svg','/assets/placeholder.svg':'assets/placeholder.svg','/assets/icon-192.png':'assets/icon-192.png','/assets/icon-512.png':'assets/icon-512.png','/assets/apple-touch-icon.png':'assets/apple-touch-icon.png'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&/^\/api\/image\/[a-f0-9]{16}$/.test(url.pathname)){
    const id=url.pathname.slice('/api/image/'.length);
    const article=state.articles.find(a=>a.id===id);
    if(!article?.image){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
    try{
      const {data,mime}=await getCachedImage(article);
      res.writeHead(200,{'Content-Type':mime,'Content-Length':data.length,'Cache-Control':'public, max-age=86400, stale-while-revalidate=3600','X-Content-Type-Options':'nosniff'});
      res.end(data);
    }catch(e){article.imageError=String(e.message||'image blocked').slice(0,90);console.warn('[Image proxy]',article.sourceId,e.message);res.writeHead(404,{'Cache-Control':'no-store'});res.end();}
    return;
  }
  if(req.method==='GET'&&url.pathname==='/api/news'){
    sendJson(res,{articles:state.articles,updating:state.updating,lastUpdated:state.fetchedAt,lastAttempt:state.lastAttempt,error:state.lastError,
      refreshSeconds:Math.round(REFRESH_MS/1000),windowDays:DAYS,imagesLoading:state.imagesLoading,imagesChecked:state.imagesChecked,imagesToCheck:state.imagesToCheck,sources:SOURCES.map(s=>({...s,...state.sources[s.id]}))});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/refresh'){
    const cooldown=Math.max(30_000,REFRESH_MS/4);
    if(state.updating){sendJson(res,{started:false,reason:'updating'});return;}
    if(Date.now()-lastKickoff<cooldown){sendJson(res,{started:false,reason:'cooldown'});return;}
    void runRefresh();sendJson(res,{started:true});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/diagnostics'){
    const total=state.articles.length;
    const withPhoto=state.articles.filter(a=>a.image).length;
    const unresolved=state.articles.filter(a=>safeDomain(a.url)==='news.google.com').length;
    sendJson(res,{total,withPhoto,withoutPhoto:total-withPhoto,unresolvedGoogleLinks:unresolved,
      imagesLoading:state.imagesLoading,imagesChecked:state.imagesChecked,imagesToCheck:state.imagesToCheck,
      // Only report source and failure category; never leak full publisher HTML.
      failedImages:state.articles.filter(a=>a.imageError).slice(0,15).map(a=>({source:a.sourceName,title:a.title,reason:a.imageError})),
      sourcesWithImage:Object.fromEntries(SOURCES.map(s=>[s.name,state.articles.filter(a=>a.sourceId===s.id&&a.image).length]))});return;
  }
  if(req.method==='GET'&&url.pathname==='/api/health'){
    sendJson(res,{ok:true,articles:state.articles.length,lastUpdated:state.fetchedAt,updating:state.updating});return;
  }
  const f=routes[url.pathname];
  if(req.method==='GET'&&f){
    try{const data=await fs.readFile(path.join(PUBLIC,f));res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':f==='index.html'||f==='app.js'||f==='style.css'||f==='sw.js'?'no-cache, must-revalidate':'public, max-age=3600','X-Content-Type-Options':'nosniff'});res.end(data);}
    catch{res.writeHead(404);res.end('Not found');}
    return;
  }
  res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('الصفحة غير موجودة');
});
if (require.main === module) server.listen(PORT,()=>{console.log(`Suez Radar: http://localhost:${PORT}`);void runRefresh();scheduledRefresh=setInterval(()=>{void runRefresh();},REFRESH_MS);scheduledRefresh.unref();});
module.exports={SOURCES,parseRss,parseBingRss,unwrapBingLink,normalized,isRelevant,story,mergeNews,getMetaImg,imageFromRss,isPublisherUrl,enrichImages,server,state,runRefresh};
