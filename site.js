(()=>{
  const root=document.getElementById('document-content');
  if(!root||!window.marked){if(root)root.textContent='문서를 불러오지 못했습니다.';return}
  marked.setOptions({gfm:true});
  const file=document.body.dataset.document==='shopping'?'shopping-list.md':'trip.md';

  // Allow standard CMS Markdown files with YAML frontmatter.
  function normalize(source){return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').replace(/^\t+/gm,'')}
  function strong(source){return source.replace(/\*\*([^\n]*?)\*\*/g,'<strong>$1</strong>')}
  // Treat tilde (~) in time ranges as text, not a GFM strikethrough delimiter.
  function escapeTildes(source){return source.replace(/\\?~/g,match=>match==='\\~'?match:'\\~')}
  function inline(source){return marked.parseInline(strong(escapeTildes(source))).trim()}
  function md(source){
    let clean=escapeTildes(normalize(source));
    // The CSV table renderer uses Markdown emphasis and links inside each cell.
    // Render the cell's inline emphasis and links instead of exposing markers.
    clean=clean.replace(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi,(_,tag,attrs,body)=>'<'+tag+attrs+'>'+inline(body)+'</'+tag+'>');
    clean=strong(clean);
    // Keep Markdown headings and rules outside neighboring raw HTML blocks.
    clean=clean.replace(/<\/(table|aside|div)>\s*(?=\S)/gi,'</$1>\n\n');
    return marked.parse(clean)
  }

  // Pages CMS edits each JSON row with separate labeled fields.
  function tableHTML(rows,path){
    if(!Array.isArray(rows))throw new Error('Invalid table data');
    const shopping=path.startsWith('tables/shopping-');
    const keys=shopping?['product','details','price']:['time','activity','transport'];
    const labels=shopping
      ?['제품','핵심 포인트',path.endsWith('02.json')?'라파예트 가격':'위치 / 현재 공식 가격 예시']
      :['시간','일정','이동'];
    const header='<tr>'+labels.map(text=>'<td>'+text+'</td>').join('')+'</tr>';
    const body=rows.map(row=>{
      const shade=row.shaded?' class="row-shaded"':'';
      return '<tr'+shade+'>'+keys.map(key=>{
        const cell=typeof row[key]==='string'?row[key]:'';
        return '<td>'+cell.replace(/\r?\n/g,'<br>')+'</td>';
      }).join('')+'</tr>';
    }).join('\n');
    return '\n\n<table>\n'+header+'\n'+body+'\n</table>\n\n';
  }
  async function hydrateTables(source){
    const pattern=/\[표[^\]\n]*\]\((tables\/(?:trip|shopping)-\d{2}\.json)\)/g;
    const paths=[...new Set([...source.matchAll(pattern)].map(match=>match[1]))];
    const entries=await Promise.all(paths.map(async path=>{
      const response=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('Cannot load table: '+path);
      return [path,tableHTML(await response.json(),path)];
    }));
    const tableMap=new Map(entries);
    return source.replace(pattern,(_,path)=>tableMap.get(path));
  }

  // Reassemble small, visually editable day documents into the original travel page.
  async function hydrateDetails(source){
    if(document.body.dataset.document!=='trip')return source;
    const pattern=/\[상세 내용\]\((details\/(?:11-\d{2}|paris-restaurants)\.md)\)/g;
    const files=[...new Set([...source.matchAll(pattern)].map(match=>match[1]))];
    const entries=await Promise.all(files.map(async path=>{
      const response=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('Cannot load detail: '+path);
      const raw=await response.text();
      return [path,normalize(raw).trim()];
    }));
    const bodyMap=new Map(entries);
    return source.replace(pattern,(_,path)=>'\n\n'+bodyMap.get(path)+'\n\n');
  }

  function isFoldHeading(title,level){
    if(document.body.dataset.document==='trip')
      return level===2&&(
        title==='1) 런던 일정표' ||
        title==='2) 파리 일정표' ||
        /^\d{2}\/\d{2}\b/.test(title) ||
        title.startsWith('참고: 파리 숙소')
      );
    return level===1&&/^[12]-[1-4]\./.test(title)
  }

  function draw(source){
    const clean=normalize(source);
    const headingRe=/^(#{1,6})\s+(.+?)\s*$/gm;
    const headings=[...clean.matchAll(headingRe)].map(match=>({
      index:match.index,end:match.index+match[0].length,level:match[1].length,
      title:match[2],
      toggle:isFoldHeading(match[2],match[1].length),
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
      const titleOnly=document.body.dataset.document==='trip'&&section.level===2&&((section.title.length>=6&&section.title[2]==='/'&&section.title[5]===' ')||section.title.includes('파리 숙소 근처 한식/중식당')||section.title==='1) 런던 일정표'||section.title==='2) 파리 일정표');
      const separator=document.body.dataset.document==='trip'&&section.title.startsWith('11/24 화 — 런던 → 파리')?'<hr class="country-separator">':'';
      html+=separator+'<section class="fold'+(titleOnly?' title-only-fold':'')+'"><div class="fold-title"><div class="fold-heading">'+md(section.marks+' '+section.title)+'</div>'
        +'<button class="fold-toggle fold-toggle-top" type="button" aria-expanded="false" aria-controls="'+id+'">펼쳐보기</button></div>'
        +'<div class="fold-content" id="'+id+'">'+md(body)+'</div>'
        +'<button class="fold-toggle fold-toggle-bottom" type="button" aria-expanded="false" aria-controls="'+id+'">전체 내용 펼쳐보기</button></section>';
      cursor=end;position=boundary
    }
    html+=md(clean.slice(cursor));
    return html
  }

  function addLastUpdated(){
    fetch('last-updated.txt?ts='+Date.now(),{cache:'no-store'})
      .then(response=>response.ok?response.text():'')
      .then(stamp=>{
        stamp=stamp.trim();
        if(!stamp)return;
        const updated=document.createElement('div');
        updated.className='last-updated';
        updated.textContent='Last updated: '+stamp;
        root.prepend(updated)
      })
      .catch(()=>{})
  }

  fetch(file+'?ts='+Date.now(),{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('content');return response.text()})
    .then(hydrateTables)
    .then(hydrateDetails)
    .then(source=>{
      root.innerHTML=draw(source);
      // Undo accidental GFM strike elements while keeping their text and formatting.
      // Literal time/price ranges such as 13:30~14:30 must remain ordinary text.
      root.querySelectorAll('del,s,strike').forEach(el=>el.replaceWith(...el.childNodes));
      addLastUpdated();
      if(document.body.dataset.document==='trip'){
        [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].forEach(heading=>{
          if(heading.textContent.trim()==='2. 날짜별 상세 일정')heading.classList.add('section-gap-heading')
        })
      }
      if(document.body.dataset.document==='shopping'){
        let quickIndex=0;
        [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].forEach(heading=>{
          if(!['1. 런던 Harrods 백화점','2. 파리 Lafayette 백화점'].includes(heading.textContent.trim()))return;
          let sibling=heading.nextElementSibling;
          while(sibling&&!sibling.matches('table')&&!/^H[1-6]$/.test(sibling.tagName)){
            const nested=sibling.querySelector?.('table');
            if(nested){sibling=nested;break}
            sibling=sibling.nextElementSibling
          }
          if(!sibling?.matches('table'))return;
          const table=sibling,id='quick-list-'+quickIndex++,fold=document.createElement('section');
          fold.className='fold quick-list-fold';
          const title=document.createElement('div');title.className='fold-title';
          const headingWrap=document.createElement('div');headingWrap.className='fold-heading';
          const top=document.createElement('button');top.className='fold-toggle fold-toggle-top';top.type='button';
          top.setAttribute('aria-expanded','false');top.setAttribute('aria-controls',id);top.textContent='펼쳐보기';
          title.append(headingWrap,top);
          const content=document.createElement('div');content.className='fold-content';content.id=id;content.append(table);
          const bottom=document.createElement('button');bottom.className='fold-toggle fold-toggle-bottom';bottom.type='button';
          bottom.setAttribute('aria-expanded','false');bottom.setAttribute('aria-controls',id);bottom.textContent='전체 내용 펼쳐보기';
          heading.parentNode.insertBefore(fold,heading);
          headingWrap.append(heading);
          fold.append(title,content,bottom)
        })
      }
      root.querySelectorAll('table').forEach(table=>{
        const rows=[...table.rows],labels=rows[0]?[...rows[0].cells].map(cell=>cell.textContent.trim()):[];
        rows[0]?.classList.add('table-label-row');
        rows.slice(1).forEach(row=>[...row.cells].forEach((cell,index)=>cell.dataset.label=labels[index]||''));
        if(document.body.dataset.document==='trip'&&labels[0]==='시간'&&labels[1]==='일정'&&labels[2]==='이동')table.classList.add('itinerary-table');
        const wrap=document.createElement('div');wrap.className='table-scroll'+(table.classList.contains('itinerary-table')?' itinerary-scroll':'');table.before(wrap);wrap.append(table)
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
    if(!open&&button.classList.contains('fold-toggle-bottom')){
      fold.scrollIntoView({block:'start',behavior:'smooth'});
    }
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