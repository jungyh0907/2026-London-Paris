/* 2026 London–Paris: offline-first for app files; explicit download for images. */
const VERSION='20261117-offline-v1';
const CORE=["./","index.html","shopping.html","weather.html","site.css","site.js","enhancements.js","trip.md","shopping-list.md","tables/trip-01.json","tables/trip-02.json","tables/trip-03.json","tables/trip-04.json","tables/trip-05.json","tables/trip-06.json","tables/trip-07.json","tables/trip-08.json","tables/trip-09.json","tables/shopping-01.json","tables/shopping-02.json","tables/shopping-03.json","tables/shopping-04.json","details/11-20.md","details/11-21.md","details/11-22.md","details/11-23.md","details/11-24.md","details/11-25.md","details/11-26.md","details/11-27.md","details/11-28.md","details/paris-restaurants.md","manifest.webmanifest","icon.svg"];
const CORE_CACHE='trip-core-'+VERSION;
const MEDIA_CACHE='trip-media-'+VERSION;
const base=new URL('./',self.registration.scope);
function local(path){return new URL(path,base).href;}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CORE_CACHE);
    await Promise.allSettled(CORE.map(async path=>{
      const url=local(path);
      const response=await fetch(url,{cache:'reload'});
      if(!response.ok)throw Error('missing '+path);
      await cache.put(url,response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('trip-core-')&&k!==CORE_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  const m=event.data||{};
  if(m.type!=='SAVE_OFFLINE')return;
  event.waitUntil((async()=>{
    const client=event.source;
    const report=(payload)=>client?.postMessage({type:'OFFLINE_PROGRESS',requestId:m.requestId,...payload});
    const external=Array.isArray(m.urls)?m.urls.filter(u=>typeof u==='string').slice(0,600):[];
    const urls=[...new Set([...CORE.map(local),...external])];
    const coreCache=await caches.open(CORE_CACHE);
    const mediaCache=await caches.open(MEDIA_CACHE);
    let saved=0,failed=[];
    for(let i=0;i<urls.length;i+=5){
      await Promise.all(urls.slice(i,i+5).map(async url=>{
        try{
          const u=new URL(url,base);
          if(!['http:','https:'].includes(u.protocol))throw Error('invalid protocol');
          const same=u.origin===base.origin;
          if(same && !u.pathname.startsWith(base.pathname))throw Error('outside app scope');
          const cache=same?coreCache:mediaCache;
          const response=await fetch(u.href,same?{cache:'reload'}:{mode:'no-cors',cache:'reload'});
          if(response.type!=='opaque'&&!response.ok)throw Error('HTTP '+response.status);
          await cache.put(u.href,response);
          saved++;
        }catch(e){failed.push(url)}
        report({done:false,total:urls.length,saved,failed:failed.length});
      }));
    }
    report({done:true,total:urls.length,saved,failed:failed.length,failedUrls:failed.slice(0,15)});
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request,u=new URL(req.url);
  if(req.method!=='GET'||!['http:','https:'].includes(u.protocol))return;
  const same=u.origin===base.origin&&u.pathname.startsWith(base.pathname);
  if(same){
    // Cache-first guarantees pages and Markdown work while airplane mode is on.
    event.respondWith((async()=>{
      const cache=await caches.open(CORE_CACHE);
      const canonical=u.origin+u.pathname;
      const saved=await cache.match(canonical)||await cache.match(req,{ignoreSearch:true});
      if(saved)return saved;
      try{
        const response=await fetch(req);
        if(response.ok)cache.put(canonical,response.clone()).catch(()=>{});
        return response;
      }catch(e){
        if(req.mode==='navigate')return await cache.match(local('index.html'))||Response.error();
        return Response.error();
      }
    })());
  }else{
    // Third-party images and the Markdown renderer are cached explicitly.
    event.respondWith((async()=>{
      const cache=await caches.open(MEDIA_CACHE);
      const saved=await cache.match(req,{ignoreSearch:false});
      if(saved)return saved;
      try{
        const response=await fetch(req);
        if(response.ok||response.type==='opaque')cache.put(req,response.clone()).catch(()=>{});
        return response;
      }catch(e){return Response.error()}
    })());
  }
});
