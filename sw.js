const CACHE='zela-shell-v6';
const SHELL=[
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/zela-mark.svg',
  './assets/zela-logo.svg',
  './apple-touch-icon.png',
  './src/app.js',
  './src/modules/csv.js',
  './src/modules/model.js',
  './src/modules/demo.js'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(SHELL))
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
  if(url.origin!==location.origin)return;

  event.respondWith(
    caches.match(event.request).then(cached=>
      cached||fetch(event.request).then(response=>{
        if(['document','script','style','image','manifest'].includes(event.request.destination)){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      }).catch(()=>caches.match('./index.html'))
    )
  );
});