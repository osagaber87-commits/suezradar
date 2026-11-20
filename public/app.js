(()=>{
'use strict';
const $=id=>document.getElementById(id);
const DEMO=new URLSearchParams(location.search).get('demo')==='1';
const DEMO_ARTICLES=[
 {id:'demo1',title:'محافظة السويس تواصل أعمال التشجير وتنفيذ المبادرة الرئاسية لزراعة 100 مليون شجرة',sourceId:'masry',sourceName:'المصري اليوم',publicationDate:'2026-11-09T17:56:00Z',description:'متابعة أعمال العناية بالأشجار والحدائق العامة في عدد من أحياء المحافظة.',image:null,url:'https://www.almasryalyoum.com/news/details/4405970',category:'suez'},
 {id:'demo2',title:'محافظ السويس يستجيب لاستغاثة سيدة ويوجه الأجهزة التنفيذية بتلبية مطالبها',sourceId:'shorouk',sourceName:'الشروق',publicationDate:'2026-11-07T19:33:00Z',description:'متابعة مطالب المواطنين وفحص الشكاوى بالتنسيق مع الجهات المختصة.',image:null,url:'https://www.shorouknews.com/news/view.aspx?cdate=07112026&id=884f7f96-e858-4b51-9ea0-867b0b5f84d6',category:'governor'},
 {id:'demo3',title:'محافظ السويس يشيد بجهود القيادات التنفيذية: العمل الجماعي أساس المرحلة',sourceId:'youm7',sourceName:'اليوم السابع',publicationDate:'2026-11-05T15:17:00Z',description:'اجتماع موسع مع القيادات التنفيذية لبحث ملفات العمل وتعزيز التنسيق بين الجهات المختلفة.',image:null,url:'https://www.youm7.com/story/2026/11/5/محافظ-السويس-يشيد-بجهود-القيادات-التنفيذية-العمل-الجماعى-أساس-المرحلة/7607453',category:'governor'},
 {id:'demo4',title:'محافظ السويس: فرع دار الإفتاء إضافة مهمة لخدمة أبناء القناة',sourceId:'akhbar',sourceName:'أخبار اليوم',publicationDate:'2026-11-04T16:09:00Z',description:'متابعة خدمات فرع دار الإفتاء المصرية بالسويس ودوره في خدمة أهالي المحافظة.',image:null,url:'https://akhbarelyom.com/news/newdetails/4902082/1',category:'governor'},
 {id:'demo5',title:'أمين البحوث الإسلامية ومحافظ السويس يبحثان سبل تعزيز التعاون المشترك في نشر الوعي',sourceId:'watan',sourceName:'الوطن',publicationDate:'2026-10-28T12:05:00Z',description:'لقاء لبحث مجالات التعاون لنشر الوعي المجتمعي على هامش فعاليات جامعة السويس.',image:null,url:'https://www.elwatannews.com/news/details/8385948',category:'governor'},
 {id:'demo6',title:'محافظ السويس يستقبل نقيب الصحفيين ويتفقان على تنظيم دورات تدريبية',sourceId:'masrawy',sourceName:'مصراوي',publicationDate:'2026-10-27T21:39:00Z',description:'لقاء لمناقشة مجالات التعاون وتنظيم ورش تدريبية للصحفيين.',image:null,url:'https://www.masrawy.com/news/news_regions/details/2026/10/27/3069708',category:'governor'},
 {id:'demo7',title:'محافظ السويس يتفقد الأسواق ومخازن الأنابيب للتأكد من توافر السلع وضبط الأسعار',sourceId:'ahram',sourceName:'بوابة الأهرام',publicationDate:'2026-03-11T09:00:00Z',description:'جولة ميدانية على الأسواق والمخابز ومخازن أسطوانات البوتاجاز.',image:'https://gate.ahram.org.eg/Media/News/2026/3/11/2026-639088470623616590-361.jpeg',url:'https://gate.ahram.org.eg/News/5576414.aspx',category:'governor'}
];
const DEMO_SOURCES=[
 ['ahram','بوابة الأهرام'],['youm7','اليوم السابع'],['watan','الوطن'],['masry','المصري اليوم'],['masrawy','مصراوي'],['akhbar','أخبار اليوم'],['masrel','مصر اليوم'],['mesrelyoum','جريدة مصر اليوم'],['veto','فيتو'],['shorouk','الشروق'],['sada','صدى البلد'],['cairo24','القاهرة 24'],['dostor','الدستور'],['fagr','الفجر'],['wafd','الوفد'],['gomhuria','الجمهورية أونلاين'],['bawaba','البوابة نيوز'],['mal','جريدة المال']
].map(([id,name])=>({id,name,status:'ok',count:DEMO_ARTICLES.filter(a=>a.sourceId===id).length}));
let articles=[],sources=[],topic='all',source='all',period='all',search='',limit=12,updating=false,lastUpdated=null,lastError=null,imagesLoading=false,imagesChecked=0,imagesToCheck=0;
let favorites={};try{favorites=JSON.parse(localStorage.getItem('suezRadarFavorites')||'{}')||{}}catch{favorites={}}
let toastTimer=null;
let photoOnly=false;
let deferredInstallPrompt=null;
const fmtDate=new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Cairo'});
const fmtTime=new Intl.DateTimeFormat('ar-EG',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Africa/Cairo'});
const dateShort=new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'short',timeZone:'Africa/Cairo'});
function escapeHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normalize(v){return String(v||'').toLowerCase().replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه');}
function safeUrl(v){try{const url=new URL(v);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}}
function timeAgo(dt){if(!dt)return 'وقت النشر غير متاح';const ms=Date.now()-new Date(dt).getTime();if(!Number.isFinite(ms))return 'وقت النشر غير متاح';const m=Math.floor(ms/60000);if(m<0)return fmtDate.format(new Date(dt));if(m<1)return 'منذ أقل من دقيقة';if(m<60)return `منذ ${m} دقيقة`;const h=Math.floor(m/60);if(h<24)return `منذ ${h} ساعة`;const d=Math.floor(h/24);if(d<=7)return `منذ ${d} يوم`;return dateShort.format(new Date(dt));}
function showToast(text){const n=$('toast');n.textContent=text;n.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove('show'),3200);}
function stored(){try{localStorage.setItem('suezRadarFavorites',JSON.stringify(favorites))}catch{showToast('تعذر حفظ الأخبار في هذا المتصفح')}}
function setTopic(value){topic=value;limit=12;document.querySelectorAll('.topic-tab').forEach(b=>{const on=b.dataset.topic===value;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});render();}
function allSaved(){return Object.values(favorites).filter(v=>v&&v.url&&v.title);}
function filtered(){let base=topic==='saved'?allSaved():articles;
  return base.filter(a=>{
    if(topic==='suez'&&a.category!=='suez')return false;
    if(topic==='governor'&&a.category!=='governor')return false;
    if(source!=='all'&&a.sourceId!==source)return false;
    if(photoOnly&&!safeUrl(a.image))return false;
    if(period!=='all'){if(!a.publicationDate||Date.now()-Date.parse(a.publicationDate)>Number(period)*86400000)return false;}
    if(search&&!normalize(`${a.title} ${a.description||''} ${a.sourceName||''}`).includes(normalize(search)))return false;
    return true;
  }).sort((a,b)=>(Date.parse(b.publicationDate)||0)-(Date.parse(a.publicationDate)||0));
}
function cardMarkup(a){
 const isSaved=!!favorites[a.id];const url=safeUrl(a.url)||'#';
 const originalImage=safeUrl(a.image);
 const hasPhoto=!!originalImage;
 const img=hasPhoto && !DEMO && /^[a-f0-9]{16}$/.test(a.id)?`/api/image/${a.id}`:(originalImage||'/assets/placeholder.svg');
 const stage=img.startsWith('/api/image/')?'proxy':(hasPhoto?'direct':'fallback');
 const note=!hasPhoto?`<span class="image-note ${a.imagePending?'image-pending':''}">${a.imagePending?'جارٍ البحث عن صورة الخبر':'تعذّر استخراج صورة الخبر'}</span>`:'';
 const when=a.publicationDate?`${fmtDate.format(new Date(a.publicationDate))} · ${fmtTime.format(new Date(a.publicationDate))}`:'تاريخ غير متاح';
 return `<article class="news-card" data-story="${escapeHtml(a.id)}">
  <a class="news-image ${a.imagePending?'image-is-loading':''}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="افتح الخبر من ${escapeHtml(a.sourceName||'المصدر')}"><img src="${escapeHtml(img)}" data-stage="${stage}" data-original-image="${escapeHtml(originalImage)}" alt="${escapeHtml(hasPhoto?'الصورة الأصلية المنشورة مع الخبر لدى المصدر':'صورة مؤقتة في انتظار صورة الخبر')}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />${note}</a>
  <div class="news-content"><div class="card-head"><span class="source-chip"><span class="source-mark">${escapeHtml((a.sourceName||'م').slice(0,1))}</span>${escapeHtml(a.sourceName||'مصدر إخباري')}</span><span class="category-chip ${a.category==='governor'?'gov':''}">${a.category==='governor'?'أخبار المحافظ':'أخبار السويس'}</span></div>
   <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="card-title">${escapeHtml(a.title)}</a>
   <p class="card-description">${escapeHtml(a.description||'طالع تفاصيل هذا الخبر على الموقع الإخباري الأصلي.')}</p>
   <div class="card-bottom"><div class="date-meta" title="${escapeHtml(when)}"><span>${escapeHtml(timeAgo(a.publicationDate))}</span><span class="time-dot"></span><span>${escapeHtml(a.publicationDate?fmtTime.format(new Date(a.publicationDate)):'—')}</span></div><div class="card-actions"><button type="button" class="save-btn ${isSaved?'saved':''}" data-save="${escapeHtml(a.id)}" title="${isSaved?'إزالة من المحفوظات':'حفظ الخبر'}" aria-label="${isSaved?'إزالة من المحفوظات':'حفظ الخبر'}"><svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.5h12v16l-6-4-6 4z"/></svg></button><a class="article-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">قراءة الخبر <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m14 5-7 7 7 7"/></svg></a></div></div>
  </div></article>`;
}
// Keyed DOM updates: preserve already-downloading <img> nodes across 12-second polls.
// Replacing newsList.innerHTML on every poll previously interrupted slow image downloads.
function renderCards(items){
 const list=$('newsList');
 const existing=new Map([...list.children].filter(n=>n.dataset?.story).map(n=>[n.dataset.story,n]));
 const nodes=items.map(a=>{
  const signature=JSON.stringify([a.title,a.description,a.url,a.image,a.imagePending,a.publicationDate,!!favorites[a.id]]);
  const current=existing.get(String(a.id));
  if(current && current.dataset.signature===signature)return current;
  const template=document.createElement('template');
  template.innerHTML=cardMarkup(a);
  const card=template.content.firstElementChild;
  card.dataset.signature=signature;
  return card;
 });
 if(nodes.length!==list.children.length || nodes.some((node,i)=>list.children[i]!==node))list.replaceChildren(...nodes);
}
function render(){
  const list=filtered(),total=articles.length;
  $('heroTotal').textContent=total.toLocaleString('ar-EG');$('statTotal').textContent=total.toLocaleString('ar-EG');$('allCount').textContent=total.toLocaleString('ar-EG');$('savedCount').textContent=Object.keys(favorites).length.toLocaleString('ar-EG');
  $('statSources').textContent=sources.length.toLocaleString('ar-EG');$('heroSourceCount').textContent=`الرصد من ${sources.length.toLocaleString('ar-EG')} مصدرًا إخباريًا`;
  $('resultCount').textContent=`${list.length.toLocaleString('ar-EG')} خبر مطابق للبحث`;
  $('lastUpdated').textContent=lastUpdated?fmtTime.format(new Date(lastUpdated)):'لم يتم بعد';
  $('connectionStatus').textContent=DEMO?'معاينة تجريبية':updating?'جارٍ تحديث المصادر':lastError?'بعض المصادر غير متاحة':'المتابعة نشطة';
  $('connectionStatus').className=updating||lastError?'status-wait':'';
  $('refreshInfo').textContent=updating?'جارٍ تجميع الأخبار...':imagesLoading?`جارٍ تحميل الصور ${imagesChecked.toLocaleString('ar-EG')} / ${imagesToCheck.toLocaleString('ar-EG')}`:lastUpdated?`آخر تحديث ${fmtTime.format(new Date(lastUpdated))}`:'لم يكتمل أول تحديث';
  $('refreshBtn').disabled=DEMO||updating;$('refreshBtn').classList.toggle('spinning',updating);
  let warning='';if(DEMO)warning='هذه معاينة للتصميم باستخدام أخبار منشورة سابقًا، وليست بيانات حية. شغّل الموقع من دون ?demo=1 لجلب النتائج تلقائيًا.';
  else if(lastError)warning=lastError;
  $('alertBox').hidden=!warning;$('alertBox').textContent=warning;$('alertBox').classList.toggle('demo',DEMO);
  const show=list.slice(0,limit);
  if(show.length){renderCards(show);}
  else if(updating&&!lastUpdated){$('newsList').innerHTML='<div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-copy"><div></div><div></div><div></div><div></div></div></div><div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-copy"><div></div><div></div><div></div><div></div></div></div>';}
  else{$('newsList').innerHTML=`<div class="empty-state"><div class="empty-illustration">⌕</div><h3>${topic==='saved'?'لا توجد أخبار محفوظة':'لم نجد أخبارًا مطابقة'}</h3><p>${!articles.length&&!DEMO?'لم تصل نتائج من خدمات الأخبار حتى الآن. راجع اتصال خادم الموقع بالإنترنت أو أعد المحاولة.':'جرّب تغيير المصدر أو فترة البحث أو الكلمات المستخدمة للحصول على نتائج أخرى.'}</p></div>`;}
  $('loadMore').hidden=list.length<=limit;
}
function renderSources(){
  const selected=$('sourceSelect').value;
  $('sourceSelect').innerHTML='<option value="all">كل المصادر الإخبارية</option>'+sources.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  $('sourceSelect').value=sources.some(s=>s.id===selected)?selected:'all';
  $('sourceList').innerHTML=sources.map(s=>`<button type="button" class="source-item" data-source="${escapeHtml(s.id)}" aria-label="عرض أخبار ${escapeHtml(s.name)}"><span class="source-mini-logo">${escapeHtml(s.name.slice(0,1))}</span><span class="source-label">${escapeHtml(s.name)}</span><span class="source-state"><i class="${escapeHtml(s.status||'waiting')}"></i>${(s.count||0).toLocaleString('ar-EG')}</span></button>`).join('');
}
async function loadNews(){
 if(DEMO){articles=DEMO_ARTICLES;sources=DEMO_SOURCES;updating=false;lastUpdated='2026-11-09T20:00:00Z';renderSources();render();return;}
 try{
  const res=await fetch('/api/news',{cache:'no-store'});if(!res.ok)throw new Error('فشل اتصال الخادم');
  const data=await res.json();articles=Array.isArray(data.articles)?data.articles:[];sources=Array.isArray(data.sources)?data.sources:[];
  updating=!!data.updating;lastUpdated=data.lastUpdated;lastError=data.error;
  imagesLoading=!!data.imagesLoading;imagesChecked=data.imagesChecked||0;imagesToCheck=data.imagesToCheck||0;
  // Update previously saved headlines with newly resolved article photos/links.
  let changed=false;
  for(const a of articles){if(favorites[a.id] && (favorites[a.id].image!==a.image || favorites[a.id].url!==a.url)){
    favorites[a.id]={...favorites[a.id],...a};changed=true;
  }}
  if(changed){try{localStorage.setItem('suezRadarFavorites',JSON.stringify(favorites));}catch{}}
  if(sources.length)renderSources();render();
 }catch(e){updating=false;lastError='تعذّر الاتصال بالخادم. شغّل المشروع باستخدام npm start وافتح رابط الخادم، وليس ملف HTML مباشرة.';render();}
}
async function manualRefresh(){if(DEMO){showToast('أنت في وضع معاينة التصميم. افتح الصفحة الرئيسية لرؤية البيانات الحية.');return;}
 const btn=$('refreshBtn');btn.disabled=true;btn.classList.add('spinning');
 try{const res=await fetch('/api/refresh',{method:'POST'});const data=await res.json();showToast(data.started?'بدأ تحديث المصادر الإخبارية.':'التحديث جارٍ بالفعل أو تم منذ قليل.');updating=data.started||data.reason==='updating';render();setTimeout(loadNews,2500);}catch{showToast('تعذر بدء التحديث. حاول مرة أخرى.');btn.disabled=false;btn.classList.remove('spinning');}
}
function init(){
 $('todayDate').textContent=new Intl.DateTimeFormat('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Cairo'}).format(new Date());
 $('year').textContent=new Date().getFullYear();
 document.querySelectorAll('.topic-tab').forEach(b=>b.addEventListener('click',()=>setTopic(b.dataset.topic)));
 $('sourceSelect').addEventListener('change',e=>{source=e.target.value;limit=12;render();});
 $('periodSelect').addEventListener('change',e=>{period=e.target.value;limit=12;render();});
 $('searchInput').addEventListener('input',e=>{search=e.target.value.trim();limit=12;render();});
 $('refreshBtn').addEventListener('click',manualRefresh);
 $('loadMore').addEventListener('click',()=>{limit+=12;render();});
 $('newsList').addEventListener('click',e=>{
  const button=e.target.closest('[data-save]');if(!button)return;
  const id=button.dataset.save;const a=articles.find(x=>x.id===id)||favorites[id];if(!a)return;
  if(favorites[id]){delete favorites[id];showToast('تمت إزالة الخبر من المحفوظات');}
  else{favorites[id]=a;showToast('تم حفظ الخبر في المحفوظات');}
  stored();render();
 });
 $('newsList').addEventListener('error',e=>{
  if(e.target.tagName!=='IMG')return;
  const img=e.target;
  if(img.dataset.stage==='proxy' && safeUrl(img.dataset.originalImage)){
    // Some publishers allow direct loading even if our server was blocked.
    img.dataset.stage='direct';img.src=img.dataset.originalImage;return;
  }
  if(img.dataset.stage==='fallback')return;
  img.dataset.stage='fallback';img.src='/assets/placeholder.svg';
  const parent=img.closest('.news-image');
  if(parent&&!parent.querySelector('.image-note')){
    const span=document.createElement('span');span.className='image-note';span.textContent='تعذّر تحميل صورة الناشر';parent.appendChild(span);
  }
 },true);
 $('sourceList').addEventListener('click',e=>{const b=e.target.closest('[data-source]');if(!b)return;source=b.dataset.source;$('sourceSelect').value=source;setTopic('all');document.querySelector('#latest').scrollIntoView({behavior:'smooth'});showToast(`تصفية الأخبار: ${sources.find(s=>s.id===source)?.name||'المصدر'}`);});
 loadNews();if(!DEMO)setInterval(loadNews,12000);
}
init();
})();
