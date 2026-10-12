/* Interactive views are layered on top of the original CMS Markdown and JSON.
   This file never edits itinerary content or commits shopping check marks to GitHub. */
(()=>{
  'use strict';
  const root=document.getElementById('document-content');
  if(!root)return;
  const trip=document.body.dataset.document==='trip';

  function element(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function topButton(fold){return fold?.querySelector('.fold-toggle-top')}
  function setFold(fold,open){
    if(!fold)return;
    if(fold.classList.contains('expanded')!==open)topButton(fold)?.click();
  }
  function scrollToNode(node){
    if(node)node.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function dayFromTitle(text){
    const match=text.trim().match(/^(?:11\/)?(2[0-8])(?=\s+[월화수목금토일](?:\s|:|$))/);
    return match?match[1]:null;
  }
  function makeAction(label,cssClass){
    const button=element('button',cssClass,label);
    button.type='button';
    return button;
  }

  function initTrip(){
    const folds=[...root.querySelectorAll('section.fold')];
    const cityFolds=folds.filter(f=>/^[12]\)\s+(?:런던|파리)\s+일정표/.test(f.querySelector('.fold-heading')?.textContent.trim()||''));
    const dayFolds=new Map();
    const auxiliaryFolds=[];
    for(const fold of folds){
      if(cityFolds.includes(fold))continue;
      const day=dayFromTitle(fold.querySelector('.fold-heading')?.textContent||'');
      if(day)dayFolds.set(day,fold);
      else auxiliaryFolds.push(fold);
    }
    if(cityFolds.length!==2||dayFolds.size!==9)return;

    // Identify each day's original heading/table nodes without modifying their content.
    const schedules=new Map();
    for(const fold of cityFolds){
      const content=fold.querySelector('.fold-content');
      let current=null;
      for(const child of [...content.children]){
        if(child.matches('h3')){
          const day=dayFromTitle(child.textContent);
          if(day){
            current=day;
            schedules.set(day,{fold,heading:child,nodes:[],table:null});
          }
        }
        if(current){
          const info=schedules.get(current);
          info.nodes.push(child);
          child.dataset.itineraryDay=current;
          if(child.matches('.table-scroll')&&child.querySelector('table.itinerary-table'))
            info.table=child.querySelector('table.itinerary-table');
        }
      }
    }
    if(schedules.size!==9||[...schedules.values()].some(info=>!info.table))return;

    const toolbar=element('div','trip-day-switcher');
    const title=element('div','trip-day-switcher-title','날짜별 일정 보기');
    const options=element('div','trip-day-options');
    options.setAttribute('role','group');
    options.setAttribute('aria-label','날짜 선택');
    toolbar.append(title,options);
    const values=['전체',...Array.from({length:9},(_,i)=>String(20+i))];
    const weekdays=['금','토','일','월','화','수','목','금','토'];
    const chips=new Map();
    for(const value of values){
      const button=makeAction('','trip-day-chip');
      if(value==='전체'){
        button.append(element('span','trip-day-chip-date','전체'));
      }else{
        button.append(
          element('span','trip-day-chip-date',value+' '+weekdays[Number(value)-20]),
          element('span','trip-day-chip-city',Number(value)<=23?'런던':'파리')
        );
        button.setAttribute('aria-label','11월 '+value+'일 '+weekdays[Number(value)-20]+'요일, '+(Number(value)<=23?'런던':'파리'));
      }
      button.setAttribute('aria-pressed',String(value==='전체'));
      button.dataset.day=value;
      options.append(button);
      chips.set(value,button);
    }
    const tip=element('p','trip-day-tip','날짜를 선택하면 해당 날짜의 일정표와 상세 일정만 표시합니다.');
    toolbar.append(tip);
    const heading=[...root.querySelectorAll('h1')].find(h=>h.textContent.trim()==='1. 전체 일정표');
    if(heading)heading.before(toolbar);
    else root.prepend(toolbar);
    let selected='전체';
    let savedStates=null;

    function showDay(day){
      if(day!== '전체'&&!schedules.has(day))return;
      if(selected==='전체'&&day!=='전체'){
        savedStates=new Map([...cityFolds,...dayFolds.values(),...auxiliaryFolds].map(f=>[f,f.classList.contains('expanded')]));
      }
      selected=day;
      for(const [value,button] of chips)button.setAttribute('aria-pressed',String(value===day));
      for(const fold of cityFolds){
        const visible=day==='전체'||schedules.get(day)?.fold===fold;
        fold.classList.toggle('trip-day-hidden',!visible);
        if(day!=='전체'&&visible)setFold(fold,true);
      }
      for(const [date,info] of schedules){
        for(const node of info.nodes)node.classList.toggle('trip-day-hidden',day!=='전체'&&date!==day);
      }
      for(const [date,fold] of dayFolds){
        fold.classList.toggle('trip-day-hidden',day!=='전체'&&date!==day);
        if(day!=='전체'&&date===day)setFold(fold,false);
      }
      auxiliaryFolds.forEach(f=>f.classList.toggle('trip-day-hidden',day!=='전체'));
      if(day==='전체'&&savedStates){
        savedStates.forEach((wasOpen,fold)=>setFold(fold,wasOpen));
        savedStates=null;
      }
      tip.textContent=day==='전체'?'전체 일정 표시 중 · 날짜를 눌러 하루만 보실 수 있습니다.':
        '11월 '+day+'일 일정 표시 중 · 일정 항목의 ‘상세 보기’를 누르면 해당 설명으로 이동합니다.';
    }
    options.addEventListener('click',event=>{
      const button=event.target.closest('button[data-day]');
      if(!button)return;
      showDay(button.dataset.day);
    });

    // Map timetable rows to their matching detail section where a reliable
    // heading/time match exists; otherwise fall back to the day's section.
    function matchingDetail(day,row){
      const fold=dayFolds.get(day),content=fold?.querySelector('.fold-content');
      if(!content)return fold;
      const headings=[...content.querySelectorAll('h3,h4')];
      const start=row.cells[0]?.textContent.match(/\d{2}:\d{2}/)?.[0]||'';
      const activity=row.cells[1]?.textContent||'';
      const tokens=(activity.match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(w=>w.length>=3);
      let best=null,score=0;
      for(const heading of headings){
        const text=heading.textContent||'';
        const sameTime=start&&text.includes(start);
        const common=tokens.filter(token=>text.toLocaleLowerCase().includes(token.toLocaleLowerCase())).length;
        const points=(sameTime?5:0)+Math.min(4,common*2);
        if((common>0||sameTime)&&points>score){best=heading;score=points;}
      }
      return score>=5?best:fold;
    }

    for(const [day,info] of schedules){
      for(const row of [...info.table.rows].slice(1)){
        if(row.cells.length<3)continue;
        const cell=row.cells[1];
        const activity=makeAction('','trip-activity-link');
        activity.setAttribute('aria-label','11월 '+day+'일 '+cell.textContent.trim().replace(/\s+/g,' ')+' 상세 일정 보기');
        // Keep every word and all formatting exactly as it appeared in the table.
        while(cell.firstChild)activity.append(cell.firstChild);
        cell.append(activity);
        cell.classList.add('itinerary-activity-cell');
        const openDetails=()=>{
          showDay(day);
          const detail=dayFolds.get(day);
          setFold(detail,true);
          scrollToNode(matchingDetail(day,row));
        };
        // Both the original text and the surrounding schedule cell are tappable.
        activity.addEventListener('click',event=>{
          event.stopPropagation();
          openDetails();
        });
        cell.addEventListener('click',openDetails);
      }
    }

    // Provide return navigation in every dated detail fold, top and bottom.
    for(const [day,fold] of dayFolds){
      const content=fold.querySelector('.fold-content');
      for(const placement of ['top','bottom']){
        const bar=element('div','trip-return-bar trip-return-'+placement);
        const link=makeAction('↑ 11월 '+day+'일 일정표로 돌아가기','trip-back-link');
        link.addEventListener('click',()=>{
          showDay(day);
          setFold(schedules.get(day).fold,true);
          scrollToNode(schedules.get(day).heading);
        });
        bar.append(link);
        if(placement==='top')content.prepend(bar);else content.append(bar);
      }
    }

    // Keep a compact return action on screen while any expanded daily detail is
    // being read. The original top and bottom return links remain unchanged.
    const floating=makeAction('↑ 일정표로 돌아가기','trip-floating-return');
    floating.hidden=true;
    floating.setAttribute('aria-label','현재 날짜의 일정표로 돌아가기');
    document.body.append(floating);
    let visibleDay=null;
    function updateFloating(){
      const anchor=window.innerHeight*0.68;
      const minBottom=Math.min(110,window.innerHeight*0.2);
      let match=null,closest=Infinity;
      for(const [day,fold] of dayFolds){
        if(!fold.classList.contains('expanded')||fold.classList.contains('trip-day-hidden'))continue;
        const content=fold.querySelector('.fold-content');
        const rect=content?.getBoundingClientRect();
        if(!rect||rect.top>anchor||rect.bottom<minBottom)continue;
        const distance=Math.abs(rect.top-anchor);
        if(distance<closest){closest=distance;match=day;}
      }
      visibleDay=match;
      floating.hidden=!match||!!document.querySelector('dialog[open]');
      if(match){
        floating.textContent='↑ 11/'+match+' 일정표로';
        floating.setAttribute('aria-label','11월 '+match+'일 일정표로 돌아가기');
      }
    }
    floating.addEventListener('click',()=>{
      if(!visibleDay)return;
      const day=visibleDay;
      showDay(day);
      setFold(schedules.get(day).fold,true);
      floating.hidden=true;
      scrollToNode(schedules.get(day).heading);
    });
    window.addEventListener('scroll',updateFloating,{passive:true});
    window.addEventListener('resize',updateFloating);
    root.addEventListener('click',event=>{
      if(event.target.closest('.fold-toggle,.trip-activity-link,.trip-back-link'))
        requestAnimationFrame(updateFloating);
    });
    updateFloating();
  }

  function initShopping(){
    const quick=[...root.querySelectorAll('.quick-list-fold')];
    if(quick.length<3)return;
    const groups=[
      {fold:quick.find(f=>f.querySelector('.fold-heading')?.textContent.includes('런던 Harrods')),group:'harrods'},
      {fold:quick.find(f=>f.querySelector('.fold-heading')?.textContent.includes('파리 Lafayette')),group:'lafayette'},
      {fold:quick.find(f=>f.querySelector('.fold-heading')?.textContent.includes('La Vallée Village')),group:'outlet'}
    ];
    if(groups.some(g=>!g.fold))return;

    // Preserve all existing checked products as interested products.
    const key='london-paris-shopping-checks-v1';
    let saved={};
    let storageOK=true;
    try{saved=JSON.parse(localStorage.getItem(key)||'{}');if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};}
    catch(error){saved={};storageOK=false;}
    const items=[];
    const idFor=(group,name)=>group+':'+name.trim().replace(/\s+/g,' ').toLocaleLowerCase();
    const save=()=>{
      try{localStorage.setItem(key,JSON.stringify(saved));}
      catch(error){storageOK=false;hint.textContent='이 브라우저에서 저장할 수 없습니다. 체크 상태가 새로고침 후 유지되지 않을 수 있습니다.';}
    };
    let filter='all';
    function register(input,label,row,group){
      const id=idFor(group,label);
      input.checked=!!saved[id];
      items.push({id,input,row,group});
      input.addEventListener('change',()=>{
        if(input.checked)saved[id]=true;
        else delete saved[id];
        row.classList.toggle('shopping-interested',input.checked);
        save();refresh();
      });
      row.classList.toggle('shopping-interested',input.checked);
    }
    // Explicit product-to-detail targets keep similar products (including nested
    // Clément Faugier and Bordier descriptions) pointing to their own sections.
    const productTargets={
      harrods:{
        'Harrods 가방':['1-1.','해러즈 가방'],
        'Harrods 테디베어':['1-1.','해러즈 테디베어'],
        '머그, 찻잔, 접시, 티세트':['1-1.','해러즈 접시'],
        '키링, 파우치, 마그넷 등 소형 굿즈':['1-1.','키링, 파우치'],
        'Jellycat 인형 (Harrods 4층)':['1-1.','Jellycat Airlines'],
        'Harrods 자체 차':['1-2.','해러즈 자체 차'],
        'Harrods 비스킷 틴':['1-2.','해러즈 비스킷 틴'],
        'Harrods 초콜릿':['1-2.','초콜릿'],
        'Harrods 커피':['1-2.','해러즈 커피']
      },
      lafayette:{
        "La Maison d'Armorine 솔티드 카라멜":['2-1.','라 메종 다모린'],
        'Angelina 밤 잼':['2-1.','앙젤리나'],
        'Clément Faugier 밤 잼':['2-1.','Clément Faugier'],
        'La Mère Poulard 쿠키':['2-1.','라 메르 풀라르'],
        'Confiture Parisienne 잼':['2-1.','콩피튀르 파리지엔느'],
        'Les Abeilles de Malescot 트러플 꿀':['2-1.','레 자베이 드 말레스코'],
        'A L’Olivier 트러플 오일':['2-2.','아 롤리비에'],
        'Artisan de la Truffe 트러플 소금':['2-2.','아티장 드 라 트뤼프'],
        'Bordier Butter':['2-2.','보르디에 버터'],
        'Edmond Fallot 머스타드':['2-2.','에드몽 팔로'],
        'SÒSU 트러플 마요네즈':['2-2.','소수'],
        'Jellycat 인형':['2-4.','갤러리 라파예트 오스만 — 일반 쇼핑']
      }
    };
    const sectionFolds=new Map();
    for(const fold of root.querySelectorAll('section.fold:not(.quick-list-fold)')){
      const title=fold.querySelector('.fold-heading')?.textContent.trim()||'';
      const section=title.match(/^([12]-[1-4]\.)/);
      if(section)sectionFolds.set(section[1],fold);
    }
    const linkTargets=new Map();
    for(const group of ['harrods','lafayette']){
      for(const [product,[section,title]] of Object.entries(productTargets[group])){
        const fold=sectionFolds.get(section);
        let heading=[...(fold?.querySelectorAll('.fold-content h2,.fold-content h3')||[])]
          .find(node=>node.textContent.includes(title));
        if(group==='lafayette'&&product==='Jellycat 인형'&&fold){
          const jellycatInfo=[...fold.querySelectorAll('.fold-content li')]
            .find(node=>node.textContent.includes('키즈, 토이')&&node.textContent.includes('Jellycat'));
          if(jellycatInfo)heading=jellycatInfo;
        }
        if(fold&&heading)linkTargets.set(group+'|'+product,{fold,heading,group});
      }
    }
    function openProduct(group,name){
      const target=linkTargets.get(group+'|'+name);
      if(!target)return;
      setFold(target.fold,true);
      scrollToNode(target.heading);
    }
    // Product lists: interest flags, not purchase records or itinerary metadata.
    for(const {fold,group} of groups.slice(0,2)){
      const table=fold.querySelector('table');
      if(!table)continue;
      for(const row of [...table.rows].slice(1)){
        const cell=row.cells[0];if(!cell)continue;
        const name=cell.textContent.trim();
        const label=element('div','shopping-check-label');
        const input=document.createElement('input');input.type='checkbox';input.className='shopping-check-input';
        input.setAttribute('aria-label',name+' 관심상품');
        const productName=makeAction('','shopping-product-link shopping-check-name');
        productName.setAttribute('aria-label',name+' 상세 설명으로 이동');
        while(cell.firstChild)productName.append(cell.firstChild);
        label.append(input,productName);cell.append(label);
        register(input,name,row,group);
        if(linkTargets.has(group+'|'+name)){
          productName.addEventListener('click',()=>openProduct(group,name));
        }else{
          // Fall back to ordinary text rather than offer a broken navigation action.
          productName.replaceWith(element('span','shopping-check-name',name));
        }
      }
    }
    // The outlet summary contains visit logistics, not products. Extract
    // individual interest brands from its "주요 쇼핑" row instead.
    const outlet=groups[2].fold;
    const outletRow=[...outlet.querySelectorAll('table tr')].find(row=>row.cells[0]?.textContent.trim()==='주요 쇼핑');
    if(outletRow){
      const brands=(outletRow.cells[1]?.textContent||'').split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
      const panel=element('section','shopping-brand-panel');
      panel.append(element('h3','','라발레 관심 브랜드 체크'));
      const grid=element('div','shopping-brand-grid');
      for(const name of brands){
        const label=element('label','shopping-brand-check');
        const input=document.createElement('input');input.type='checkbox';input.className='shopping-check-input';
        input.setAttribute('aria-label',name+' 관심상품');
        label.append(input,element('span','',name));
        grid.append(label);
        register(input,name,label,'outlet');
      }
      panel.append(grid);
      outlet.querySelector('.fold-content')?.prepend(panel);
    }

    const toolbar=element('div','shopping-check-toolbar');
    const header=element('div','shopping-check-head');
    header.append(element('strong','','관심상품 체크리스트'),element('span','shopping-check-progress'));
    const buttons=element('div','shopping-filter-options');
    buttons.setAttribute('role','group');buttons.setAttribute('aria-label','쇼핑리스트 필터');
    const filters=new Map();
    for(const [value,name] of [['all','전체'],['interest','관심'],['no-interest','미관심']]){
      const button=makeAction(name,'shopping-filter-chip');
      button.dataset.filter=value;
      button.setAttribute('aria-pressed',String(value==='all'));
      buttons.append(button);filters.set(value,button);
    }
    const meter=document.createElement('progress');meter.className='shopping-meter';meter.max=items.length;
    const hint=element('p','shopping-filter-hint','관심 있는 상품을 체크하세요. 기존 체크 기록은 유지되며 다른 기기와 자동 동기화되지 않습니다.');
    toolbar.append(header,meter,buttons,hint);
    const firstHeading=[...root.querySelectorAll('h1')].find(h=>h.textContent.trim().startsWith('1. 런던 Harrods'));
    if(firstHeading){
      const fold=firstHeading.closest('.quick-list-fold');
      (fold||firstHeading).before(toolbar);
    }else root.prepend(toolbar);

    function refresh(){
      const interested=items.filter(item=>item.input.checked).length;
      header.querySelector('.shopping-check-progress').textContent='관심 '+interested+' / '+items.length;
      meter.value=interested;
      for(const item of items){
        item.row.classList.toggle('shopping-filter-hidden',
          filter==='no-interest'?item.input.checked:filter==='interest'?!item.input.checked:false);
        item.row.classList.toggle('shopping-interested',item.input.checked);
      }
      for(const {fold,group} of groups){
        const count=items.filter(item=>item.group===group&&!item.row.classList.contains('shopping-filter-hidden')).length;
        let empty=fold.querySelector('.shopping-empty-message');
        if(!empty){empty=element('p','shopping-empty-message','해당 조건의 쇼핑 항목이 없습니다.');fold.querySelector('.fold-content')?.append(empty);}
        empty.hidden=filter==='all'||count>0;
      }
      filters.forEach((button,value)=>button.setAttribute('aria-pressed',String(value===filter)));
      if(storageOK)hint.textContent='‘한눈에 보는 쇼핑 리스트’에서 관심상품을 체크하세요. 기록은 현재 브라우저에만 저장됩니다.';
    }
    buttons.addEventListener('click',event=>{
      const button=event.target.closest('button[data-filter]');
      if(!button)return;
      filter=button.dataset.filter;
      refresh();
      // Open the existing summary lists when a filtered view is requested.
      if(filter!=='all')groups.forEach(({fold})=>setFold(fold,true));
    });
    refresh();

    // A persistent return button is displayed while reading either department
    // store's expanded descriptions, even when far down the page.
    const floating=makeAction('↑ 체크리스트로 돌아가기','trip-floating-return shopping-floating-return');
    floating.hidden=true;
    document.body.append(floating);
    const relevantSections=[
      ['1-1.','harrods'],['1-2.','harrods'],
      ['2-1.','lafayette'],['2-2.','lafayette'],['2-3.','lafayette'],['2-4.','lafayette']
    ].map(([section,group])=>({fold:sectionFolds.get(section),group})).filter(x=>x.fold);
    let activeGroup=null;
    function updateShoppingReturn(){
      const anchor=window.innerHeight*.68;
      const minBottom=Math.min(110,window.innerHeight*.2);
      let current=null,closest=Infinity;
      for(const {fold,group} of relevantSections){
        if(!fold.classList.contains('expanded'))continue;
        const rect=fold.querySelector('.fold-content')?.getBoundingClientRect();
        if(!rect||rect.top>anchor||rect.bottom<minBottom)continue;
        const distance=Math.abs(rect.top-anchor);
        if(distance<closest){closest=distance;current=group;}
      }
      activeGroup=current;
      floating.hidden=!current||!!document.querySelector('dialog[open]');
      if(current){
        const label=current==='harrods'?'해러즈':'라파예트';
        floating.textContent='↑ '+label+' 체크리스트로';
        floating.setAttribute('aria-label',label+' 관심상품 체크리스트로 돌아가기');
      }
    }
    floating.addEventListener('click',()=>{
      if(!activeGroup)return;
      const group=groups.find(x=>x.group===activeGroup);
      if(!group)return;
      setFold(group.fold,true);
      floating.hidden=true;
      scrollToNode(group.fold.querySelector('.fold-title')||group.fold);
    });
    window.addEventListener('scroll',updateShoppingReturn,{passive:true});
    window.addEventListener('resize',updateShoppingReturn);
    root.addEventListener('click',event=>{
      if(event.target.closest('.fold-toggle,.shopping-product-link'))
        requestAnimationFrame(updateShoppingReturn);
    });
    updateShoppingReturn();
  }

  // The original website hydrates Markdown, detail pages and JSON asynchronously.
  // A one-time observer starts these controls after the original DOM is complete.
  const observer=new MutationObserver(()=>{
    const ready=trip?
      root.querySelectorAll('.itinerary-table').length===9&&root.querySelectorAll('section.fold').length>=11:
      root.querySelectorAll('.quick-list-fold').length>=3&&root.querySelectorAll('.quick-list-fold .table-scroll').length>=3;
    if(!ready)return;
    observer.disconnect();
    try{if(trip)initTrip();else initShopping();}
    catch(error){console.error('Interactive controls could not be initialized',error);}
  });
  observer.observe(root,{childList:true,subtree:true});
})();
