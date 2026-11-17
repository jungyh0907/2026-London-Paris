(()=> {
  'use strict';
  if(!('serviceWorker' in navigator)||!('caches' in window))return;
  const root=document.querySelector('main');
  if(!root)return;
  const box=document.createElement('section');
  box.className='offline-panel';
  box.setAttribute('aria-label','오프라인 여행 자료 저장');
  box.innerHTML='<div class="offline-head"><strong>📥 오프라인 여행 자료</strong><span class="offline-state" role="status">확인 중…</span></div><p>출국 전에 Wi-Fi에서 저장하면 일정·쇼핑리스트·사진을 비행기 모드에서도 볼 수 있습니다.</p><div class="offline-actions"><button type="button" class="offline-save">오프라인 자료 저장 / 업데이트</button></div><div class="offline-progress" hidden><progress max="100" value="0"></progress><small></small></div><p class="offline-hint">저장 완료 후 비행기 모드에서 세 페이지를 직접 열어 확인해 주세요. 외부 사이트 링크와 실시간 날씨 갱신에는 인터넷이 필요합니다.</p>';
  const hero=root.querySelector('.hero');
  hero?.insertAdjacentElement('afterend',box);
  const button=box.querySelector('.offline-save'),state=box.querySelector('.offline-state');
  const progress=box.querySelector('.offline-progress'),bar=box.querySelector('progress'),small=box.querySelector('small');
  const key='london-paris-offline-v1';
  const scope=new URL('./',location.href);
  let pendingId=null;
  function status(txt){state.textContent=txt}
  if(!navigator.onLine)status('현재 오프라인');
  else status(localStorage.getItem(key)?'이 기기에서 저장 이력 있음':'아직 저장하지 않음');
  window.addEventListener('online',()=>status(localStorage.getItem(key)?'저장 이력 있음 · 업데이트 가능':'저장 가능'));
  window.addEventListener('offline',()=>status('오프라인 · 저장된 자료 사용'));
  navigator.serviceWorker.register(new URL('sw.js',scope),{scope:scope.pathname}).catch(()=>status('오프라인 기능 등록 실패'));
  async function sources(){
    const paths=['shopping-list.md','trip.md',...Array.from({length:9},(_,i)=>'details/11-'+String(i+20).padStart(2,'0')+'.md'),'details/paris-restaurants.md'];
    const urls=new Set(['https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js']);
    for(const path of paths){
      try{
        const response=await fetch(new URL(path,scope),{cache:'no-store'});
        if(!response.ok)continue;
        const md=await response.text();
        for(const m of md.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+(?:\([^)]*\)[^\s)]*)*)\)/g))urls.add(m[1].replace(/&amp;/g,'&'));
        // Include image URLs used inside raw HTML image markup.
        for(const m of md.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/g))urls.add(m[1]);
      }catch(e){}
    }
    for(const img of document.images)if(/^https?:/.test(img.src)&&!img.src.startsWith(scope.origin))urls.add(img.src);
    return [...urls];
  }
  navigator.serviceWorker.addEventListener('message',event=>{
    const m=event.data||{};
    if(m.type!=='OFFLINE_PROGRESS'||m.requestId!==pendingId)return;
    bar.max=m.total||1;bar.value=m.saved+m.failed;
    small.textContent=m.saved+' / '+m.total+'개 저장'+(m.failed?' · '+m.failed+'개 실패':'');
    if(!m.done)return;
    button.disabled=false;
    if(m.failed===0){localStorage.setItem(key,new Date().toISOString());status('저장 완료');small.textContent+=' · 비행기 모드로 확인해 주세요.'}
    else{status('일부 파일 저장 실패');small.textContent+=' · 인터넷을 확인하고 다시 저장해 주세요.'}
    pendingId=null;
  });
  button.addEventListener('click',async()=>{
    if(!navigator.onLine){status('인터넷 연결 후 저장해 주세요');return}
    button.disabled=true;progress.hidden=false;bar.value=0;small.textContent='사진 목록 확인 중…';status('저장 중');
    try{
      const registration=await navigator.serviceWorker.ready;
      const worker=registration.active;
      if(!worker)throw Error('worker unavailable');
      const urls=await sources();
      pendingId=String(Date.now());
      worker.postMessage({type:'SAVE_OFFLINE',requestId:pendingId,urls});
    }catch(e){button.disabled=false;pendingId=null;status('저장 실패 · 다시 시도해 주세요')}
  });
})();