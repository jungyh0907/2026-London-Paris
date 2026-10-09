(()=>{
  const root=document.getElementById('document-content');
  if(!root||!window.marked){if(root)root.textContent='문서를 불러오지 못했습니다.';return}
  marked.setOptions({gfm:true});
  const file=document.body.dataset.document==='shopping'?'shopping-list.md':'trip.md';

  // Notion's Markdown export prefixes nested blocks with tabs. Strip these
  // export indentation markers for rendering; the source Markdown stays intact.
  function normalize(source){return source.replace(/^\t+/gm,'')}
  function strong(source){return source.replace(/\*\*([^\n]*?)\*\*/g,'<strong>$1</strong>')}
  function inline(source){return marked.parseInline(strong(source)).trim()}
  function md(source){
    let clean=normalize(source)
      .replace(/<callout\b[^>]*>([\s\S]*?)<\/callout>/gi,(_,body)=>'<aside class="callout">'+inline(body.trim())+'</aside>')
      .replace(/<empty-block\s*\/>/gi,'<div class="empty-block"></div>\n\n')
      .replace(/<page url="[^"]+">([^<]*)<\/page>/gi,'<a href="shopping.html">$1</a>');
    // Notion exports tables as HTML with Markdown still embedded in each cell.
    // Render the cell's inline emphasis and links instead of exposing markers.
    clean=clean.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi,(_,tag,attrs,body)=>'<'+tag+attrs+'>'+inline(body)+'</'+tag+'>');
    clean=strong(clean);
    // Keep Markdown headings and rules outside neighboring raw HTML blocks.
    clean=clean.replace(/<\/(table|aside|div)>\s*(?=\S)/gi,'</$1>\n\n');
    return marked.parse(clean)
  }
  function draw(source){
    const clean=normalize(source);
    const headingRe=/^(#{1,6})\s+(.+?)\s*$/gm;
    const headings=[...clean.matchAll(headingRe)].map(match=>({
      index:match.index,end:match.index+match[0].length,level:match[1].length,
      title:match[2].replace(/\s+\{toggle="true"\}$/,''),
      toggle:/\s+\{toggle="true"\}$/.test(match[2]),
      marks:match[1]
    }));
    let html='',cursor=0,position=0;
    while(position<headings.length){
      const start=headings.findIndex((heading,index)=>index>=position&&heading.toggle);
      if(start<0)break;
      const section=headings[start];
      html+=md(clean.slice(cursor,section.index));
      let boundary=start+1;
      while(boundary<headings.length){
        const next=headings[boundary];
        if(next.toggle||next.level<=section.level)break;
        boundary++
      }
      const end=boundary<headings.length?headings[boundary].index:clean.length;
      const body=clean.slice(section.end,end).replace(/^\n+/,'');
      const id='toggle-'+start;
      html+='<section class="fold"><div class="fold-title"><div class="fold-heading">'+md(section.marks+' '+section.title)+'</div>'
        +'<button class="fold-toggle fold-toggle-top" type="button" aria-expanded="false" aria-controls="'+id+'">펼쳐보기</button></div>'
        +'<div class="fold-content" id="'+id+'">'+md(body)+'</div>'
        +'<button class="fold-toggle fold-toggle-bottom" type="button" aria-expanded="false" aria-controls="'+id+'">전체 내용 펼쳐보기</button></section>';
      cursor=end;position=boundary
    }
    html+=md(clean.slice(cursor));
    return html
  }

  fetch(file).then(response=>{if(!response.ok)throw new Error('content');return response.text()})
    .then(source=>{
      root.innerHTML=draw(source);
      root.querySelectorAll('table').forEach(table=>{
        const rows=[...table.rows],labels=rows[0]?[...rows[0].cells].map(cell=>cell.textContent.trim()):[];
        rows[0]?.classList.add('table-label-row');
        rows.slice(1).forEach(row=>[...row.cells].forEach((cell,index)=>cell.dataset.label=labels[index]||''));
        if(document.body.dataset.document==='trip'&&labels[0]==='시간'&&labels[1]==='일정'&&labels[2]==='이동')table.classList.add('itinerary-table');
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
    const fold=button.closest('.fold'),open=button.getAttribute('aria-expanded')!=='true';
    fold.classList.toggle('expanded',open);
    fold.querySelectorAll('.fold-toggle').forEach(toggle=>{
      toggle.setAttribute('aria-expanded',String(open));
      toggle.textContent=open?'접기':(toggle.classList.contains('fold-toggle-top')?'펼쳐보기':'전체 내용 펼쳐보기')
    })
  });

  const dialog=document.querySelector('.viewer'),viewerImage=dialog?.querySelector('img');
  let scale=1,x=0,y=0,pointers=new Map(),startDistance=0,startScale=1,startX=0,startY=0,startCenter={x:0,y:0};
  function paint(){if(viewerImage)viewerImage.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')'}
  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
  function openImage(src){viewerImage.src=src;scale=1;x=0;y=0;paint();dialog.showModal()}
  root.addEventListener('click',event=>{
    const button=event.target.closest('.image-open');if(button){const image=button.querySelector('img');openImage(image.currentSrc||image.src)}
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