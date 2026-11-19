// Meldingen voor medewerkers in de backoffice-app (wens eigenaar 9 november 2026): nieuwe gastmail en nieuwe aanvragen.
// Alleen tonen en openen; geen cache, geen gegevens. Een tik opent het gesprek of de reservering in de backoffice.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{
 let m={};try{m=e.data?e.data.json():{}}catch{m={body:e.data&&e.data.text()}}
 const path=typeof m.url==='string'&&/^\/[a-z]/.test(m.url)&&!m.url.startsWith('//')?m.url:'/gesprekken';
 e.waitUntil(self.registration.showNotification(String(m.title||'Boerderijrecreatie'),{body:String(m.body||''),tag:String(m.tag||'boerbart'),icon:'/logo.webp',badge:'/favicon.svg',data:{url:new URL(path,self.location.origin).href}}));
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();const url=(e.notification.data&&e.notification.data.url)||self.location.origin+'/gesprekken';
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list)if(c.url.startsWith(self.location.origin)&&'focus' in c){if('navigate' in c)return c.navigate(url).then(w=>(w||c).focus());return c.focus()}return self.clients.openWindow(url)}));
});
