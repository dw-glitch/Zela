const CACHE='zela-shell-v10';
const XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const SHELL=[
  './',
  './index.html',
  './styles.css?v=10',
  './manifest.webmanifest?v=10',
  './assets/zela-icon-192-v2.png',
  './assets/zela-touch-180-v2.png',
  './src/app.js?v=10',
  './src/modules/csv.js',
  './src/modules/model.js',
  './src/modules/demo.js'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(async cache=>{
        await cache.addAll(SHELL);
        await Promise.allSettled([cache.add(XLSX_URL)]);
      })
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);

  if(url.origin!==location.origin){
    if(url.hostname==='cdn.sheetjs.com'){
      event.respondWith(
        caches.open(CACHE).then(async cache=>{
          const cached=await cache.match(event.request);
          if(cached)return cached;
          const response=await fetch(event.request);
          if(response.ok)cache.put(event.request,response.clone());
          return response;
        })
      );
    }
    return;
  }

  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});