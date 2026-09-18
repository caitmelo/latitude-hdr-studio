// Adds isolation headers for RAW WASM when the host does not supply them.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.cache==='only-if-cached'&&req.mode!=='same-origin')return;
 event.respondWith(fetch(req).then(res=>{if(res.status===0)return res;const headers=new Headers(res.headers);headers.set('Cross-Origin-Embedder-Policy','require-corp');headers.set('Cross-Origin-Opener-Policy','same-origin');return new Response(res.body,{status:res.status,statusText:res.statusText,headers});}));
});
