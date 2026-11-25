/* Pedreira Ibiúna · guarda o app no aparelho para abrir sem internet.
   Arquivos do app: busca na rede primeiro (para pegar atualizações) e usa a cópia guardada se não houver sinal.
   Fontes e bibliotecas externas: usa a cópia guardada. As chamadas ao servidor (Apps Script) não passam por aqui. */
var CACHE='ibiuna-app-v7';
var BASE=['./','index.html','backend.js','config.js','logo.png','icon.svg','manifest.webmanifest','omr.js','omr-layout.js','folhas/folha_viagens.pdf','folhas/folha_britagem.pdf'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(BASE);}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var u=new URL(req.url);
  if(/script\.google(usercontent)?\.com$/.test(u.hostname)||/googleusercontent\.com$/.test(u.hostname))return;
  if(u.origin===self.location.origin){
    e.respondWith(fetch(req).then(function(r){if(r&&r.ok){var cp=r.clone();caches.open(CACHE).then(function(c){c.put(req,cp);});}return r;})
      .catch(function(){return caches.match(req,{ignoreSearch:true}).then(function(m){return m||(req.mode==='navigate'?caches.match('index.html'):undefined);});}));
    return;}
  if(/fonts\.(googleapis|gstatic)\.com$|cdnjs\.cloudflare\.com$/.test(u.hostname)){
    e.respondWith(caches.match(req).then(function(m){return m||fetch(req).then(function(r){var cp=r.clone();caches.open(CACHE).then(function(c){c.put(req,cp);});return r;});}));}
});
