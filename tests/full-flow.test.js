const test=require('node:test');
const assert=require('node:assert/strict');
const dns=require('node:dns').promises;
const {server,state,runRefresh}=require('../server');

test('end-to-end: Google News result -> publisher article -> real article image -> image endpoint',async()=>{
 const realFetch=global.fetch;const realLookup=dns.lookup;
 const id=Buffer.from('AU_yqL-opaque-token-from-live-google-rss').toString('base64url');
 const googleLink=`https://news.google.com/rss/articles/${id}?oc=5`;
 const title='محافظ السويس يبحث تطوير الخدمات الرقمية وتحسين جودة الانترنت';
 const rss=`<rss><channel><item><title><![CDATA[${title} - الدستور]]></title><link>${googleLink.replace(/&/g,'&amp;')}</link><pubDate>Fri, 20 Nov 2026 07:00:00 GMT</pubDate><description>السويس</description></item></channel></rss>`;
 const jpg=Buffer.from([0xff,0xd8,0xff,0xe0,0x12,0x34]);
 const fakeFetch=async(input,options={})=>{
  const url=String(input);
  if(url.startsWith('https://news.google.com/rss/search')){
    const q=new URL(url).searchParams.get('q')||'';
    return new Response(q.includes('site:dostor.org')?rss:'<rss><channel></channel></rss>');
  }
  if(url==='https://news.google.com/rss/articles/'+id)return new Response('<html><div data-n-a-sg="sg-token" data-n-a-ts="1780000000"></div></html>');
  if(url.includes('/_/DotsSplashUi/data/batchexecute'))return new Response(")]}'\n\n"+JSON.stringify([['wrb.fr','Fbv4je',JSON.stringify(['garturlres','https://www.dostor.org/article/123',1])]]));
  if(url==='https://www.dostor.org/article/123')return new Response('<html><head><meta property="og:image" content="https://static.dostor.org/upload/suez-123.jpg"></head><article></article></html>',{headers:{'Content-Type':'text/html'}});
  if(url==='https://static.dostor.org/upload/suez-123.jpg')return new Response(jpg,{headers:{'Content-Type':'image/jpeg'}});
  if(url.startsWith('https://api.gdeltproject.org/'))return new Response('{"articles":[]}');
  return new Response('<rss><channel></channel></rss>');
 };
 global.fetch=fakeFetch;
 dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
 try{
  assert.equal(await runRefresh(),true);
  const until=Date.now()+1200;
  while(state.imagesLoading && Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(state.articles.length,1);
  const a=state.articles[0];
  assert.equal(a.url,'https://www.dostor.org/article/123');
  assert.equal(a.image,'https://static.dostor.org/upload/suez-123.jpg');
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
  const result=await realFetch(`http://127.0.0.1:${server.address().port}/api/image/${a.id}`);
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'image/jpeg');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()),jpg);
 }finally{
  await new Promise(resolve=>server.listening?server.close(resolve):resolve());
  global.fetch=realFetch;dns.lookup=realLookup;
 }
});
