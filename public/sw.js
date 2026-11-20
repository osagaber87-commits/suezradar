/* Installable mobile PWA: keeps the shell, last successful news list, and seen photos. */
const VERSION='suez-radar-mobile-v1.2';
const APP_CACHE=VERSION+'-app';
const NEWS_CACHE=VERSION+'-news';
const PICTURES_CACHE=VERSION+'-photos';
const SHELL=['/','/index.html','/app.js','/style.css','/manifest.webmanifest','/assets/favicon.svg','/assets/placeholder.svg','/assets/icon-192.png','/assets/icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(APP_CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>!key.startsWith(VERSION)).map(key=>caches.delete(key)))),self.clients.claim()]));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname==='/api/news'){
    event.respondWith(fetch(request).then(async response=>{
      if(response.ok){const cache=await caches.open(NEWS_CACHE);await cache.put(request,response.clone());}
      return response;
    }).catch(async()=>await (await caches.open(NEWS_CACHE)).match(request) || Response.json({articles:[],sources:[],error:'لا يوجد اتصال بالإنترنت. افتح الموقع عند توفر الشبكة لتحميل الأخبار.'})));
    return;
  }
  if(url.pathname.startsWith('/api/image/')){
    event.respondWith(caches.open(PICTURES_CACHE).then(async cache=>{
      const cached=await cache.match(request);
      if(cached)return cached;
      const response=await fetch(request);
      if(response.ok){cache.put(request,response.clone()).catch(()=>{});}
      return response;
    }));
    return;
  }
  if(SHELL.includes(url.pathname)){
    event.respondWith(fetch(request).then(async response=>{
      if(response.ok){const cache=await caches.open(APP_CACHE);cache.put(request,response.clone()).catch(()=>{});}
      return response;
    }).catch(()=>caches.match(request)));
  }
});
