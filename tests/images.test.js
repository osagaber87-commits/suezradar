const test=require('node:test');
const assert=require('node:assert/strict');
const {Response}=globalThis;
const {getMetaImg,decodeGoogleNewsUrl,parseGoogleNewsResponse,isPhotoUrl,assertRemotePublic,downloadPublisherImage,imageMime}=require('../news-images');
const {SOURCES,parseRss}=require('../server');

test('pulls picture from RSS media:thumbnail and content:encoded even with relative URL',()=>{
 const xml=`<rss><channel><item><title>محافظ السويس يعلن مشروعات جديدة</title><link>https://www.youm7.com/story/567</link><pubDate>Fri, 20 Nov 2026 07:00:00 GMT</pubDate><media:thumbnail url="https://images.youm7.com/photo.jpg"/><description>خبر عن السويس</description></item></channel></rss>`;
 const result=parseRss(xml,SOURCES.find(s=>s.id==='youm7'));
 assert.equal(result[0].image,'https://images.youm7.com/photo.jpg');
});
test('extracts picture from JSON-LD NewsArticle, never Organization logo',()=>{
 const html=`<script type="application/ld+json">{"@graph":[{"@type":"Organization","image":"/logo.png"},{"@type":"NewsArticle","image":{"url":"/2026/suez-photo.jpg"}}]}</script>`;
 assert.equal(getMetaImg(html,'https://example.org/news/123'),'https://example.org/2026/suez-photo.jpg');
});
test('extracts article picture when article meta and JSON-LD are missing',()=>{
 const html='<header><img src="/logo.png" /></header><article><figure><img data-src="https://cdn.example.org/real-suez.jpg" src="data:image/gif;base64,AA==" /></figure></article>';
 assert.equal(getMetaImg(html,'https://example.org/a'),'https://cdn.example.org/real-suez.jpg');
});
test('never assigns article URL as image when HTML/RSS image tag is blank',()=>{
 assert.equal(isPhotoUrl('','https://example.org/news'),'');
 assert.equal(getMetaImg('<meta property="og:image" content=""><article><img src=""></article>','https://example.org/news'),'');
});
test('handles wrapped Google News batchexecute format',()=>{
 const body=")]}'\n\n"+JSON.stringify([['wrb.fr','Fbv4je',JSON.stringify(['garturlres','https://www.dostor.org/123',1]),null,null,null],['di',16]]);
 assert.equal(parseGoogleNewsResponse(body),'https://www.dostor.org/123');
});
test('decodes current Google News article via signed request (mocked network)',async()=>{
 const id=Buffer.from('AU_yqL-opaque-id-1234567891011121314').toString('base64url');
 let calls=0;
 const fetcher=async(url,options)=>{
  ++calls;
  if(calls===1){assert.match(url,/news\.google\.com\/rss\/articles/);return new Response('<html><div data-n-a-sg="signed_example" data-n-a-ts="1780000000"></div></html>');}
  assert.equal(options.method,'POST');
  assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded;charset=UTF-8');
  const outer=JSON.parse(new URLSearchParams(options.body).get('f.req'));
  assert.deepEqual(outer[0][0].slice(2),[null,'generic'],'Google RPC envelope needs null and generic');
  const inner=JSON.parse(outer[0][0][1]);
  assert.equal(inner[2],id);
  assert.equal(inner[3],1780000000);
  return new Response(")]}'\n\n"+JSON.stringify([['wrb.fr','Fbv4je',JSON.stringify(['garturlres','https://www.dostor.org/567',1])]]));
 };
 const result=await decodeGoogleNewsUrl('https://news.google.com/rss/articles/'+id+'?oc=5',{fetcher});
 assert.equal(result,'https://www.dostor.org/567');assert.equal(calls,2);
});
test('image proxy rejects loopback/private and oversized/non-image content',async()=>{
 const bad=async()=>[{address:'127.0.0.1',family:4}];
 await assert.rejects(()=>assertRemotePublic('http://news-images.example.org/a.jpg',{lookup:bad}),/Non-public/);
 await assert.rejects(()=>assertRemotePublic('http://127.0.0.1/private.jpg'),/blocked/);
 const publicLookup=async()=>[{address:'8.8.8.8',family:4}];
 const badFetcher=async()=>new Response('<html>forbidden</html>',{headers:{'Content-Type':'text/html'}});
 await assert.rejects(()=>downloadPublisherImage('https://images.youm7.com/p.jpg','https://www.youm7.com/a',{fetcher:badFetcher,lookup:publicLookup}),/Not a photo/);
});
test('image proxy accepts actual JPEG content and sets correct content type',async()=>{
 const bytes=Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3]);
 const fetcher=async(url,opt)=>{assert.equal(opt.headers.Referer,'https://www.youm7.com/story/1');return new Response(bytes,{headers:{'Content-Type':'image/jpeg'}});};
 const result=await downloadPublisherImage('https://cdn.youm7.com/photo.jpg','https://www.youm7.com/story/1',{fetcher,lookup:async()=>[{address:'8.8.8.8',family:4}]});
 assert.equal(result.mime,'image/jpeg');assert.ok(bytes.equals(result.data));assert.equal(imageMime(bytes),'image/jpeg');
});
