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
      const button=makeAction(value==='전체'?'전체':value+' '+weekdays[Number(value)-20],'trip-day-chip');
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
        const link=makeAction('상세 보기 ↗','trip-detail-link');
        link.setAttribute('aria-label','11월 '+day+'일 해당 일정 상세 보기');
        row.cells[1].append(link);
        link.addEventListener('click',()=>{
          showDay(day);
          const detail=dayFolds.get(day);
          setFold(detail,true);
          scrollToNode(matchingDetail(day,row));
        });
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
        row.classList.toggle('shopping-bought',input.checked);
        save();refresh();
      });
      row.classList.toggle('shopping-bought',input.checked);
    }
    // Product lists: purchase actions, not itinerary metadata.
    for(const {fold,group} of groups.slice(0,2)){
      const table=fold.querySelector('table');
      if(!table)continue;
      for(const row of [...table.rows].slice(1)){
        const cell=row.cells[0];if(!cell)continue;
        const name=cell.textContent.trim();
        const label=element('label','shopping-check-label');
        const input=document.createElement('input');input.type='checkbox';input.className='shopping-check-input';
        input.setAttribute('aria-label',name+' 구매 완료');
        const text=element('span','shopping-check-name');
        while(cell.firstChild)text.append(cell.firstChild);
        label.append(input,text);cell.append(label);
        register(input,name,row,group);
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
        input.setAttribute('aria-label',name+' 구매 완료');
        label.append(input,element('span','',name));
        grid.append(label);
        register(input,name,label,'outlet');
      }
      panel.append(grid);
      outlet.querySelector('.fold-content')?.prepend(panel);
    }

    const toolbar=element('div','shopping-check-toolbar');
    const header=element('div','shopping-check-head');
    header.append(element('strong','','쇼핑 체크리스트'),element('span','shopping-check-progress'));
    const buttons=element('div','shopping-filter-options');
    buttons.setAttribute('role','group');buttons.setAttribute('aria-label','쇼핑리스트 필터');
    const filters=new Map();
    for(const [value,name] of [['all','전체'],['todo','미구매'],['done','구매 완료']]){
      const button=makeAction(name,'shopping-filter-chip');
      button.dataset.filter=value;
      button.setAttribute('aria-pressed',String(value==='all'));
      buttons.append(button);filters.set(value,button);
    }
    const meter=document.createElement('progress');meter.className='shopping-meter';meter.max=items.length;
    const hint=element('p','shopping-filter-hint','구매한 항목을 체크하면 이 브라우저에 저장됩니다. 다른 기기와 자동 동기화되지 않습니다.');
    toolbar.append(header,meter,buttons,hint);
    const firstHeading=[...root.querySelectorAll('h1')].find(h=>h.textContent.trim().startsWith('1. 런던 Harrods'));
    if(firstHeading){
      const fold=firstHeading.closest('.quick-list-fold');
      (fold||firstHeading).before(toolbar);
    }else root.prepend(toolbar);

    function refresh(){
      const bought=items.filter(item=>item.input.checked).length;
      header.querySelector('.shopping-check-progress').textContent=bought+' / '+items.length+' 완료';
      meter.value=bought;
      for(const item of items){
        item.row.classList.toggle('shopping-filter-hidden',
          filter==='todo'?item.input.checked:filter==='done'?!item.input.checked:false);
        item.row.classList.toggle('shopping-bought',item.input.checked);
      }
      for(const {fold,group} of groups){
        const count=items.filter(item=>item.group===group&&!item.row.classList.contains('shopping-filter-hidden')).length;
        let empty=fold.querySelector('.shopping-empty-message');
        if(!empty){empty=element('p','shopping-empty-message','해당 조건의 쇼핑 항목이 없습니다.');fold.querySelector('.fold-content')?.append(empty);}
        empty.hidden=filter==='all'||count>0;
      }
      filters.forEach((button,value)=>button.setAttribute('aria-pressed',String(value===filter)));
      if(storageOK)hint.textContent='매장의 ‘한눈에 보는 쇼핑 리스트’를 펼쳐 체크하세요. 기록은 현재 브라우저에만 저장됩니다.';
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
