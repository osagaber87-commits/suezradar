const test=require('node:test');
const assert=require('node:assert/strict');
const {server,state}=require('../server');

test('live news API publishes image status and only serves images associated with stories',async()=>{
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const news=await fetch(base+'/api/news');assert.equal(news.status,200);
  const data=await news.json();
  assert.ok(Array.isArray(data.articles));assert.equal(typeof data.imagesLoading,'boolean');
  assert.equal(typeof data.imagesChecked,'number');
  assert.ok(data.sources.length>=18);
  const image=await fetch(base+'/api/image/0000000000000000');
  assert.equal(image.status,404);
  const html=await fetch(base+'/');assert.equal(html.status,200);
  assert.match(await html.text(),/رادار السويس/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
