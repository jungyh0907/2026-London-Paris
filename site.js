(()=>{
  const root=document.getElementById('document-content');
  if(!root||!window.marked){if(root)root.textContent='문서를 불러오지 못했습니다.';return}
  marked.setOptions({gfm:true});
  const file=document.body.dataset.document==='shopping'?'shopping-list.md':'trip.md';

  // Notion's Markdown export prefixes nested blocks with tabs. Remove those
  // presentation-only indent markers before parsing so paragraphs, lists,
  // headings, and images are rendered as their intended elements, not code.
  function normalize(source){return source.replace(/^\t+/gm,'')}
  function md(source){
    const clean=normalize(source)
      .replace(/<callout\b[^>]*>([\s\S]*?)<\/callout>/gi,(_,body)=>'<aside class="callout">'+marked.parseInline(body.trim())+'</aside>')
      .replace(/<empty-block\s*\/>/gi,'<div class="empty-block"></div>')
      .replace(/<page url="[^"]+">([^<]*)<\/page>/gi,'<a href="shopping.html">$1</a>');
    return marked.parse(clean)
  }
  function draw(source){
    const clean=normalize(source);
    const re=/^(#{1,6})\s+(.+?)\s+\{toggle="true"\}\s*$/gm;
    const sections=[...clean.matchAll(re)];
    if(!sections.length)return md(clean);
    let html=md(clean.slice(0,sections[0].index));
    sections.forEach((match,index)=>{
      const end=index+1<sections.length?sections[index+1].index:clean.length;
      const body=clean.slice(match.index+match[0].length,end).replace(/^\n+/,'');
      const id='toggle-'+index;
      html+='<section class="fold"><div class="fold-title">'+md(match[1]+' '+match[2])+'</div>'
        +'<div class="fold-content" id="'+id+'">'+md(body)+'</div>'
        +'<button class="fold-toggle" type="button" aria-expanded="false" aria-controls="'+id+'">전체 내용 펼쳐보기</button></section>';
    });
    return html
  }

  fetch(file).then(response=>{if(!response.ok)throw new Error('content');return response.text()})
    .then(source=>{
      root.innerHTML=draw(source);
      root.querySelectorAll('table').forEach(table=>{
        const wrap=document.createElement('div');wrap.className='table-scroll';table.before(wrap);wrap.append(table)
      });
      root.querySelectorAll('img').forEach(image=>{
        image.loading='lazy';image.decoding='async';
        const button=document.createElement('button');button.type='button';button.className='image-open';
        button.setAttribute('aria-label','사진 전체화면으로 확대');image.before(button);button.append(image)
      })
    })
    .catch(()=>root.textContent='내용을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.');

  root.addEventListener('click',event=>{
    const button=event.target.closest('.fold-toggle');if(!button)return;
    const fold=button.closest('.fold');
    const open=button.getAttribute('aria-expanded')!=='true';
    fold.classList.toggle('expanded',open);
    button.setAttribute('aria-expanded',String(open));
    button.textContent=open?'접기':'전체 내용 펼쳐보기'
  });

  const dialog=document.querySelector('.viewer'),viewerImage=dialog?.querySelector('img');
  let scale=1,x=0,y=0,pointers=new Map(),startDistance=0,startScale=1,startX=0,startY=0,startCenter={x:0,y:0};
  function paint(){if(viewerImage)viewerImage.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')'}
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
  function openImage(src){viewerImage.src=src;scale=1;x=0;y=0;paint();dialog.showModal()}
  root.addEventListener('click',event=>{
    const button=event.target.closest('.image-open');if(button)openImage(button.querySelector('img').currentSrc||button.querySelector('img').src)
  });
  dialog?.querySelector('.close')?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  viewerImage?.addEventListener('pointerdown',event=>{
    event.preventDefault();viewerImage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){const points=[...pointers.values()];startDistance=distance(...points);startScale=scale;startX=x;startY=y;startCenter=midpoint(...points)}
  });
  viewerImage?.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){
      const points=[...pointers.values()],center=midpoint(...points);
      scale=Math.min(5,Math.max(1,startScale*distance(...points)/Math.max(1,startDistance)));
      x=startX+center.x-startCenter.x;y=startY+center.y-startCenter.y;paint()
    }else if(scale>1){x+=event.movementX;y+=event.movementY;paint()}
  });
  const release=event=>pointers.delete(event.pointerId);
  viewerImage?.addEventListener('pointerup',release);viewerImage?.addEventListener('pointercancel',release);
  viewerImage?.addEventListener('dblclick',()=>{scale=scale===1?2:1;x=0;y=0;paint()})
})();