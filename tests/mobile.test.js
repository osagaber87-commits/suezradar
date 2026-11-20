const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {server,parseBingRss,unwrapBingLink} = require('../server');

test('Bing RSS fallback selects the real publisher link and its matching thumbnail',()=>{
 const article='https://www.dostor.org/5555';
 const bing='https://www.bing.com/news/apiclick.aspx?ref=FexRss&url='+encodeURIComponent(article);
 const rss=`<rss><channel><item><title>محافظ السويس يبحث خطط التنمية - الدستور</title><link>${bing.replaceAll('&','&amp;')}</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate><description>&lt;img src=&quot;https://cdn.dostor.org/suez-5555.jpg&quot;&gt; خبر عن السويس</description></item></channel></rss>`;
 const items=parseBingRss(rss);
 assert.equal(items.length,1);
 assert.equal(items[0].url,article);
 assert.equal(items[0].image,'https://cdn.dostor.org/suez-5555.jpg');
 assert.equal(unwrapBingLink(bing),article);
});

test('Mobile PWA assets and install instructions are part of the shipped server',async()=>{
 const root=path.join(__dirname,'../public');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.lang,'ar');
 assert.equal(manifest.icons.length,2);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/id="installBtn"/);
 assert.match(html,/id="photoOnly"/);
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.match(app,/function renderCards\(/);
 const address=await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address())));
 try{
  const base='http://127.0.0.1:'+address.port;
  for(const url of ['/manifest.webmanifest','/sw.js','/assets/icon-192.png','/api/diagnostics']){
    const response=await fetch(base+url);
    assert.equal(response.status,200,url);
  }
 }finally {await new Promise(resolve=>server.close(resolve));}
});
