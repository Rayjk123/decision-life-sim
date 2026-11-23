const $ = id => document.getElementById(id);
const canvas = $('town');
const ctx = canvas.getContext('2d');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const map = document.createElement('canvas');
map.width = 840;
map.height = 600;
function art(name){
  const image=new Image();
  image.src='/art/'+name+'.png';
  return image;
}
const streetArt={day:art('street-day'),evening:art('street-evening')};
const workplaceScenes={
  hospital:{name:'Infirmary',block:2,art:'infirmary'},
  office:{name:'Guildhall',block:3,art:'guildhall'},
  shop:{name:'Market Shop',block:4,art:'market'},
  factory:{name:'Workshop',block:5,art:'workshop'},
  realtor:{name:'Land Office',block:10,art:'land-office'},
  civic:{name:'Watch Hall',block:15,art:'watchhall'},
  school:{name:'Schoolhouse',block:19,art:'schoolhouse'},
};
const interiorArt=new Map();
function sceneArt(name){
  if(!interiorArt.has(name))interiorArt.set(name,art(name));
  return interiorArt.get(name);
}
const castArt=art('cast');
const redCoatArt=art('red-coat-walk');
let castSprites=[], redCoatFrames=[];
const ready=image=>image.complete&&image.naturalWidth>0;
const lightModes=['Auto light','Daylight','Evening'];
let lightMode=0;
let scene=null, streetPan=null;
$('light').onclick=()=>{
  lightMode=(lightMode+1)%lightModes.length;
  const button=$('light');
  button.textContent=lightModes[lightMode];
  button.setAttribute('aria-label','Lighting mode: '+lightModes[lightMode]);
};
function eveningAmount(p){
  if(lightMode)return lightMode===2?1:0;
  return Math.max(0,Math.min(1,(p-.68)/.14));
}
const g = map.getContext('2d');
const blocks = ['homes','homes','INFIRMARY','GUILDHALL','SHOPS','WORKSHOP','homes','homes','BANK','SHOPS','LAND OFFICE','SHOPS','homes','homes','SHOPS','CITY HALL','CAR LOT','SHOPS','homes','SCHOOLHOUSE','SHOPS','TOWN PARK','TOWN PARK','WAREHOUSE','homes','homes','SHOPS','SHOPS','SHOPS','homes'];
const civic = { bank: 8, realtor: 10, city_hall: 15, car_lot: 16 };
const shops = ['CAFE','BAKERY','BARBER','DELI','PHARMACY','BOOKS','PIZZA','FLORIST','MARKET'];
const colors = ['#a74937','#38678e','#755091','#c2883d','#35766b'];
const draw = (c,x,y,w,h,color) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
const hash = str => [...str].reduce((n,c) => Math.imul(n ^ c.charCodeAt(0),16777619) >>> 0,2166136261);
const title = str => (str || '').replaceAll('_',' ').replace(/\b\w/g,c => c.toUpperCase());
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100);
function label(c,x,y,name,bg='#25252c') {
  c.font='bold 8px monospace'; c.textAlign='center';
  const w=c.measureText(name).width+8;
  draw(c,x-w/2,y-9,w,12,bg); c.fillStyle='#fff9e5'; c.fillText(name,x,y);
}
function building(x,y,w,h,roof,brand) {
  draw(g,x+3,y+4,w,h,'#546b50'); draw(g,x,y,w,h,'#dfb28c');
  draw(g,x-2,y-3,w+4,10,roof);
  for(let row=0;row<3;row++){
    draw(g,x-1,y-2+row*3,w+2,1,'#201e344c');
    for(let col=x+row*3;col<x+w-2;col+=7)draw(g,col,y-1+row*3,1,2,'#f3b98255');
  } draw(g,x-2,y+5,w+4,3,'#4c4d49');
  for(let wx=x+4;wx<x+w-5;wx+=9) {
    draw(g,wx,y+12,5,6,'#6d8195'); draw(g,wx,y+13,4,1,'#e8b77d');draw(g,wx+2,y+13,1,5,'#26283e');
  }
  draw(g,x+w/2-3,y+h-9,6,9,'#655048');
  if(brand) label(g,x+w/2,y-1,brand);
}
draw(g,0,0,840,600,'#3e465d');
for(let y=0;y<600;y+=120)for(let x=0;x<840;x+=9){
  draw(g,x,y+3,8,1,'#596079');draw(g,x+3,y+11,6,1,'#282f49');
}
for(let x=0;x<840;x+=140) for(let y=0;y<600;y+=12) draw(g,x+6,y,2,6,'#b08a70');
for(let y=0;y<600;y+=120) for(let x=0;x<840;x+=14) draw(g,x,y+6,7,2,'#b08a70');
for(const [i,b] of blocks.entries()){
  const x=i%6*140+15,y=Math.floor(i/6)*120+15;
  draw(g,x,y,125,105,'#84737a'); draw(g,x+4,y+4,117,97,'#707857');
  if(b==='homes'){
    for(let j=0;j<6;j++){
      const px=x+9+j%3*37,py=y+12+Math.floor(j/3)*42;
      building(px,py,26,25,colors[(i+j)%colors.length]);
      draw(g,px+19,py+27,11,5,'#bdd8b6'); draw(g,px-4,py+24,6,8,'#4b783a');
    }
  }else if(b==='TOWN PARK'){
    draw(g,x+55,y+7,8,92,'#d8c29a');draw(g,x+5,y+48,115,8,'#d8c29a');
    draw(g,x+74,y+61,39,23,'#5aadc1');draw(g,x+80,y+66,29,12,'#77c9cf');
    for(let j=0;j<8;j++)draw(g,x+12+j%4*26,y+15+Math.floor(j/4)*22,9,9,'#945247');
    label(g,x+62,y+95,b);
  }else{
    if(b!=='SHOPS') building(x+10,y+16,105,36,colors[i%colors.length],b);
    for(let j=0;j<(b==='SHOPS'?6:3);j++)building(x+9+j%3*39,y+(b==='SHOPS'?20+Math.floor(j/3)*44:65),28,25,colors[(i+j)%colors.length],shops[(i+j)%shops.length]);
  }
  for(const [tx,ty] of [[x+8,y+92],[x+118,y+10]]){
    draw(g,tx,ty+3,2,6,'#543647');draw(g,tx-4,ty,10,5,'#773b4d');
    draw(g,tx-2,ty-3,7,7,'#a05051');draw(g,tx-1,ty-3,3,3,'#c87455');
  }
}
let frame, liveFrame, selected, view = 'resident', paused=false, speed=1, localProgress=null, lastTime=0, offset=0;
let hits=[], transform={scale:1,x:0,y:0}, inFlight=false, lastPoll=0;
const streetFitZoom=6.2;
const streetCamera={x:420,y:300,zoom:streetFitZoom};
const overviewCamera={x:420,y:300,zoom:1};
let camera=streetCamera;
let following=false;
let interiorOpen=false;
let hover=null, drag=null, liveProgress=0, snapFollow=false;
let streetMode=true, opened=false, place=null, storyText="";
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const get = () => frame?.sims.find(s => s.id===selected);
const element = (tag,text,className) => { const n=document.createElement(tag); if(text!=null)n.textContent=text; if(className)n.className=className; return n; };
let advancedFor=null;
let connection='connecting';
const knownMoney=value=>Number.isFinite(value)?money(value):'Unavailable';
const percent=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'Unavailable';
const occupation=sim=>sim.occupation||title(sim.career)||'Occupation unavailable';

function choose(id){
  if(selected!==id){
    if(scene)streetPan=(canvas.clientWidth*.5-scene.x)/scene.width;
    following=false;
    snapFollow=false;
    advancedFor=null;
  }
  selected=id;view='resident';place=null;
  if(!$('world').hidden)setWorld(false,false);
  renderPanels();
  $('resident-title')?.focus();
}

function followButton(){
  const button=element('button','Follow','follow');
  button.dataset.focusKey='follow';
  button.setAttribute('aria-pressed',following);
  button.onclick=toggleFollow;
  return button;
}
function toggleFollow(){
  if(!get())return;
  if(following){leaveFollow();return;}
  following=true;snapFollow=true;streetPan=null;
  camera.zoom=Math.max(camera.zoom,3.5);
  updateCameraControls();
  renderPanels();
}

function statGrid(entries){
  const stats=element('dl',null,'stats');
  for(const [label,value] of entries){
    const cell=element('div');
    cell.append(element('dt',label),element('dd',value));
    stats.append(cell);
  }
  return stats;
}

function residentButton(sim,text){
  const button=element('button',text);
  button.dataset.focusKey=sim.id;
  button.onclick=()=>choose(sim.id);
  return button;
}

function visibleInPanel(control,panel){
  const box=control.getBoundingClientRect(), bounds=panel.getBoundingClientRect();
  return box.height>0&&box.top>=Math.max(0,bounds.top)-1&&box.bottom<=Math.min(innerHeight,bounds.bottom)+1;
}

function renderPanel(panel,render,fallback){
  const scroll=panel.scrollTop;
  const active=panel.contains(document.activeElement)?document.activeElement:null;
  const key=active?.dataset.focusKey;
  const sectionKey=active?.closest('.decision-details')?.querySelector(':scope > summary')?.dataset.focusKey;
  const wasVisible=active&&visibleInPanel(active,panel);
  panel.replaceChildren();
  render(panel);
  panel.scrollTop=scroll;
  if(key){
    const controls=[...panel.querySelectorAll('[data-focus-key]')];
    const target=controls.find(node=>node.dataset.focusKey===key);
    const section=controls.find(node=>node.dataset.focusKey===sectionKey);
    const next=target??section;
    (next??fallback)?.focus({preventScroll:true});
    if(next&&(wasVisible||!target)&&!visibleInPanel(next,panel))next.scrollIntoView({block:'nearest'});
  }
}

function decisionSource(decision){
  if(!decision?.provider)return 'Source was not recorded';
  if(decision.provider==='heuristic-fallback')return 'Heuristic fallback';
  if(decision.provider==='heuristic')return 'Heuristic';
  if(decision.provider==='kev')return decision.model??'Decision model';
  return decision.model??title(decision.provider.replaceAll('-',' '));
}

function moveOdds(odds,chosen,format=percent){
  const entries=Object.entries(odds??{}).filter(([,p])=>Number.isFinite(p));
  if(!entries.length)return element('p','No odds recorded for this month.');
  const list=element('dl',null,'odds');
  for(const [move,p] of entries){
    const name=element('dt',title(move)+(move===chosen?' · Sampled':''));
    const value=element('dd',format(p));
    value.title=String(p);
    if(move===chosen){name.className='sampled-odds';value.className='sampled-odds';}
    list.append(name,value);
  }
  return list;
}

function drawInterval(sampling,draw){
  if(!sampling||!Number.isFinite(draw))return null;
  const moves=Object.entries(sampling.odds);
  let lower=0;
  for(const [i,[move,odds]] of moves.entries()){
    const upper=i===moves.length-1?1:lower+odds;
    if(move===sampling.move)return lower<=draw&&draw<upper?{lower,upper}:null;
    lower=upper;
  }
  return null;
}

function displayDraw(draw,interval){
  if(!Number.isFinite(draw))return {draw:'Unavailable'};
  let digits=4;
  const round=n=>Number((100*n).toFixed(digits));
  if(interval){
    while(digits<12&&round(draw)>=round(interval.upper))digits++;
  }
  const format=n=>round(n)+'%';
  const bounds=interval&&round(draw)<round(interval.upper)
    ?[format(interval.lower),format(interval.upper)]:null;
  return {draw:format(draw),bounds};
}

function decisionDetails(sim){
  const details=element('details',null,'decision-details');
  const summary=element('summary','Advanced decision details');
  summary.dataset.focusKey='advanced';
  details.dataset.residentId=sim.id;
  details.open=advancedFor===sim.id;
  details.append(summary,element('p',frame.label));
  appendDecisionEvidence(details,sim);
  return details;
}

function appendDecisionEvidence(details,record,residentId=record.id){
  if(!record.move){
    details.append(element('p','No decision recorded for this month.'));
    return;
  }
  const sampling=record.decision?.sampling;
  const interval=drawInterval(sampling,record.draw);
  const shown=displayDraw(record.draw,interval);
  details.append(statGrid([
    ['Recorded outcome',title(record.move)],
    ['Decision source',decisionSource(record.decision)],
    ['Random draw',shown.draw],
  ]),element('h3','Sampling odds'));
  if(sampling){
    details.append(element('p','The engine adjusts the raw odds for discipline, then compares the draw with the running total in the order shown.'),
      moveOdds(sampling.odds,sampling.move));
    if(interval){
      const range=shown.bounds
        ?'Its draw interval runs from '+shown.bounds[0]+' up to, but excluding, '+shown.bounds[1]+'.'
        :'The draw was very close to a boundary. See the exact values below.';
      details.append(element('p',title(sampling.move)+' was sampled. '+range,'draw-interval'));
      const exact=element('details',null,'exact-sampling');
      const summary=element('summary','Exact sampling values');
      summary.dataset.focusKey='exact-sampling-'+(record.month??frame.month);
      exact.open=!shown.bounds;
      exact.append(summary,element('p','Values are fractions from 0 to 1.'),statGrid([
        ['Draw',String(record.draw)],['Lower bound',String(interval.lower)],['Upper bound',String(interval.upper)],
      ]),moveOdds(sampling.odds,sampling.move,String));
      details.append(exact);
    }
    if(record.decision.valid===false)details.append(element('p','The sampled move failed the rules check, so the outcome was Do nothing.'));
  }else details.append(element('p','Sampling odds were not recorded for this month. The raw odds alone do not reproduce the pick.'));
  details.append(element('h3','Raw move odds'),moveOdds(record.probabilities));
  if(record.hasProbe)details.append(probePanel(residentId,record.month??frame.month));
  else details.append(element('p','Counterfactual inputs were not retained for this decision.'));
}

function probePanel(id,month){
  const details=element('details',null,'decision-details counterfactual');
  const summary=element('summary','What changes the odds?');
  summary.dataset.focusKey='probe-'+month;
  const button=element('button','Try twice the coin');
  const result=element('div',null,'probe-result');
  result.setAttribute('aria-live','polite');
  details.append(summary,element('p','Change the coin on hand before this decision. The comparison recomputes available moves and raw odds.'),button,result);
  button.onclick=async()=>{
    button.disabled=true;
    result.replaceChildren(element('p','Calculating comparison…'));
    try{
      const response=await fetch('/api/town/probe/'+encodeURIComponent(id)+'/'+month);
      if(!response.ok)throw Error();
      const probe=await response.json();
      if(probe.status!=='ready'){
        const message=probe.status==='busy'?'The decision model is busy. Try again in a few seconds.'
          :probe.status==='source-unavailable'?'The recorded decision source is unavailable for comparison.'
          :'The inputs for this comparison are no longer available.';
        result.replaceChildren(element('p',message));
        return;
      }
      result.replaceChildren(element('p',probe.label+' · '+decisionSource(probe)),statGrid([
        ['Recorded coin',knownMoney(probe.beforeCoin)],['With twice the coin',knownMoney(probe.afterCoin)],
      ]));
      if(probe.movesAdded.length)result.append(element('p','New offers · '+probe.movesAdded.map(title).join(', ')));
      if(probe.movesRemoved.length)result.append(element('p','Offers removed · '+probe.movesRemoved.map(title).join(', ')));
      const odds=element('dl',null,'odds');
      const moves=[...new Set([...Object.keys(probe.base),...Object.keys(probe.variant)])];
      const shift=move=>Math.abs((probe.variant[move]??0)-(probe.base[move]??0));
      moves.sort((a,b)=>shift(b)-shift(a));
      for(const move of moves){
        const before=Object.hasOwn(probe.base,move)?percent(probe.base[move]):'Not offered';
        const after=Object.hasOwn(probe.variant,move)?percent(probe.variant[move]):'Not offered';
        odds.append(element('dt',title(move)),element('dd',before+' → '+after));
      }
      result.append(element('h3','Recorded → variant raw odds'),odds);
      result.append(element('p','This comparison does not execute a move or change the town.'));
    }catch{
      result.replaceChildren(element('p','Comparison unavailable. Try again.'));
    }finally{
      button.disabled=false;
    }
  };
  return details;
}

function balanceChange(current,previous){
  if(!Number.isFinite(current)||!Number.isFinite(previous))return 'Change unavailable';
  const change=current-previous;
  return change===0?'No change':(change>0?'+':'−')+money(Math.abs(change));
}

function decisionComparison(row,prior){
  const body=document.createDocumentFragment();
  if(!prior){
    body.append(element('p','No earlier decision remains in this resident’s timeline.'));
    return body;
  }
  for(const record of [prior,row]){
    const decision=record.decision;
    body.append(element('h3',record.label),statGrid([
      ['Outcome',title(record.move)],['Source',decisionSource(decision)],
      ['Trigger',decision?.reason?title(decision.reason):'Not retained'],
      ['Sampled move',decision?.sampling?.move?title(decision.sampling.move):'Not retained'],
      ['Draw',displayDraw(record.draw,drawInterval(decision?.sampling,record.draw)).draw],
    ]));
  }
  const before=prior.decision?.offered, after=row.decision?.offered;
  body.append(element('h3','Available moves'));
  if(before&&after){
    const added=after.filter(move=>!before.includes(move));
    const removed=before.filter(move=>!after.includes(move));
    const names=moves=>moves.map(title).join(', ')||'None';
    body.append(statGrid([['Added',names(added)],['Removed',names(removed)]]));
  }else body.append(element('p','The offered moves were not retained for both decisions.'));

  const older=prior.probabilities??{}, newer=row.probabilities??{};
  const common=Object.keys(newer).filter(move=>Object.hasOwn(older,move)&&Number.isFinite(newer[move])&&Number.isFinite(older[move]));
  body.append(element('h3','Raw odds for shared moves'));
  if(common.length){
    const odds=element('dl',null,'odds');
    for(const move of common){
      const delta=Number(((newer[move]-older[move])*100).toFixed(1));
      const change=(delta>0?'+':'')+delta.toFixed(1)+' pp';
      odds.append(element('dt',title(move)),element('dd',percent(older[move])+' → '+percent(newer[move])+' ('+change+')'));
    }
    body.append(odds);
  }else body.append(element('p','No comparable raw odds were retained.'));

  const oldContext=prior.decision?.context, newContext=row.decision?.context;
  body.append(element('h3','Before the decisions'));
  if(oldContext&&newContext){
    const labels={money:'Reserve and portfolio',monthly:'Monthly finances',warnings:'Warnings',market:'Market'};
    const changes=Object.entries(labels).filter(([key])=>oldContext[key]!==newContext[key]);
    if(changes.length){
      for(const [key,label] of changes){
        body.append(element('h4',label),statGrid([['Earlier',oldContext[key]??'None recorded'],['Later',newContext[key]??'None recorded']]));
      }
      body.append(element('p','These are differences in the recorded inputs. Several facts can change between decisions.'));
    }else body.append(element('p','The retained inputs match.'));
  }else body.append(element('p','Pre-decision inputs were not retained for both decisions.'));
  return body;
}

function timelineRow(row,residentId){
  const item=element('li');
  const details=element('details');
  const summary=element('summary');
  const heading=element('span',null,'timeline-heading');
  const outcome=row.move?title(row.move):'No recorded move';
  heading.append(element('strong',row.label),element('small',outcome));
  const delta=element('span',null,'timeline-change');
  summary.append(heading,delta);
  summary.dataset.focusKey='month-'+row.month;
  const balances=statGrid([['Net worth',knownMoney(row.nw)],['Cash',knownMoney(row.cash)],['Debt',knownMoney(row.debt)]]);
  const comparison=element('div');
  details.append(summary,element('p','Age '+row.age+' · Month-end balances'),balances,comparison);
  if(row.move&&(row.decision||row.probabilities)){
    const evidence=element('details',null,'decision-details past-decision');
    const evidenceSummary=element('summary','Decision evidence');
    evidenceSummary.dataset.focusKey='evidence-'+row.month;
    evidence.append(evidenceSummary);
    evidence.addEventListener('toggle',()=>{
      if(evidence.open&&evidence.childElementCount===1)appendDecisionEvidence(evidence,row,residentId);
    });
    details.append(evidence);
  }else if(row.move){
    details.append(element('p','Only the outcome was retained for this decision.'));
  }
  let compareWith;
  if(row.move){
    compareWith=element('details',null,'decision-details past-decision');
    const compareSummary=element('summary','Compare with previous decision');
    compareSummary.dataset.focusKey='compare-'+row.month;
    compareWith.append(compareSummary,element('div'));
    details.append(compareWith);
  }
  item.append(details);
  let comparedMonth=null;
  function compare(previous){
    if(comparedMonth===previous?.month)return;
    comparedMonth=previous?.month;
    const change=row.nw-previous?.nw;
    delta.textContent=previous?balanceChange(row.nw,previous.nw):'No comparison';
    delta.dataset.direction=change>0?'up':change<0?'down':'flat';
    summary.setAttribute('aria-label',row.label+' · '+outcome+' · Net worth change: '+delta.textContent);
    comparison.replaceChildren(previous?statGrid([
      ['Cash change',balanceChange(row.cash,previous.cash)],['Debt change',balanceChange(row.debt,previous.debt)],
    ]):element('p','No preceding month was recorded for comparison.'));
  }
  let previousDecision, previousDecisionMonth=null;
  function renderComparison(){
    if(compareWith?.open)compareWith.lastElementChild.replaceChildren(decisionComparison(row,previousDecision));
  }
  compareWith?.addEventListener('toggle',renderComparison);
  function compareDecision(previous){
    if(!compareWith||previousDecisionMonth===previous?.month)return;
    previousDecisionMonth=previous?.month;
    previousDecision=previous;
    renderComparison();
  }
  return {item,compare,compareDecision};
}

let historyDisclosure;
function residentHistory(sim,month){
  if(historyDisclosure?.id===sim.id){
    historyDisclosure.setMonth(month);
    return historyDisclosure.details;
  }
  const details=element('details',null,'decision-details resident-history');
  const summary=element('summary','Monthly timeline');
  summary.dataset.focusKey='timeline';
  const message=element('p');
  const list=element('ol',null,'timeline');
  const rows=new Map();
  details.append(summary,message,list);
  let shownMonth,loading=false;
  function updateRows(visible){
    const active=document.activeElement;
    const restoreFocus=list.contains(active);
    const panel=details.closest('#resident');
    const wasVisible=restoreFocus&&panel&&visibleInPanel(active,panel);
    const retained=new Set(visible.map(row=>row.month));
    for(const [id,row] of rows){
      if(!retained.has(id)){row.item.remove();rows.delete(id);}
    }
    for(const [i,row] of visible.entries()){
      if(!rows.has(row.month))rows.set(row.month,timelineRow(row,sim.id));
      const retainedRow=rows.get(row.month);
      const previous=visible[i+1];
      retainedRow.compare(previous?.month===row.month-1?previous:undefined);
      retainedRow.compareDecision(visible.slice(i+1).find(month=>month.move));
      if(list.children[i]!==retainedRow.item)list.insertBefore(retainedRow.item,list.children[i]??null);
    }
    if(restoreFocus){
      if(list.contains(active)){
        if(document.activeElement!==active)active.focus({preventScroll:true});
        if(wasVisible&&!visibleInPanel(active,panel))active.scrollIntoView({block:'nearest'});
      }else summary.focus();
    }
  }
  async function load(){
    if(!details.open||loading||shownMonth===month)return;
    const requested=month;
    loading=true;
    if(shownMonth===undefined)message.textContent='Loading recorded months…';
    try{
      const response=await fetch('/api/town/history/'+encodeURIComponent(sim.id));
      if(!response.ok)throw Error();
      const {months}=await response.json();
      if(requested!==month)return;
      const visible=months.filter(row=>row.month<=requested).reverse();
      message.textContent=visible.length
        ?'Net worth change by month. Open a row for month-end balances.'
        :'No months are available for this resident yet.';
      const initial=shownMonth===undefined;
      updateRows(visible);
      if(initial&&document.activeElement===summary&&matchMedia('(max-width: 570px)').matches){
        list.firstElementChild?.scrollIntoView({block:'nearest'});
      }
      shownMonth=requested;
    }catch{
      if(requested===month)message.textContent='Timeline unavailable. Close and reopen to retry.';
    }finally{
      loading=false;
      if(requested!==month)load();
    }
  }
  details.addEventListener('toggle',load);
  historyDisclosure={id:sim.id,details,setMonth(next){
    if(month===next)return;
    month=next;
    load();
  }};
  return details;
}

function renderPanels(){
  const resident=$('resident'), location=$('place'), sim=get();
  const disclosure=resident.querySelector('details');
  if(disclosure&&disclosure.dataset.residentId===sim?.id)advancedFor=disclosure.open?sim.id:null;
  location.hidden=place===null;
  renderPanel(location, panel=>{
    if(panel.hidden)return;
    const name=blocks[place]==='homes'?'Residential block':title(blocks[place].toLowerCase());
    panel.append(element('h2',name));
    const neighbors=frame.sims.filter(s=>homeBlock(s)===place||workBlock(s)===place||civic[destinationFor(s)]===place);
    panel.append(element('p',neighbors.length?'Residents who live, work, or have errands here this month.':'No residents assigned here this month.'));
    const list=element('div',null,'list');
    for(const s of neighbors.slice(0,10))list.append(residentButton(s,s.name+' · '+occupation(s)));
    const close=element('button','Close place');
    close.dataset.focusKey='close';
    close.onclick=()=>{place=null;renderPanels();canvas.focus();};
    panel.append(list,close);
  },canvas);
  resident.hidden=view==='street'||place!==null||(view!=='ranking'&&!sim);
  resident.dataset.mode=view==='ranking'?'ranking':'profile';
  $('ranking').setAttribute('aria-expanded',view==='ranking'&&!resident.hidden);
  renderPanel(resident,panel=>{
    if(panel.hidden)return;
    const heading=element('h2',view==='ranking'?'Leaderboard':sim.name);
    heading.id='resident-title';
    heading.tabIndex=-1;
    heading.dataset.focusKey='heading';
    const close=element('button','Close');
    close.dataset.focusKey='close';
    close.onclick=()=>{
      if(view==='ranking'){view='resident';renderPanels();$('ranking').focus();return;}
      view='street';
      renderPanels();
      (streetMode?$('street-resident'):canvas).focus();
    };
    const header=element('div',null,'panel-heading');
    const actions=element('div',null,'resident-actions');
    if(view!=='ranking')actions.append(followButton());
    actions.append(close);
    header.append(heading,actions);
    panel.append(header);
    if(view==='ranking'){
      panel.append(element('p','Current residents ranked by net worth.'));
      const ranked=(frame?.sims??[]).filter(s=>Number.isFinite(s.nw)).sort((a,b)=>b.nw-a.nw||a.name.localeCompare(b.name));
      if(!ranked.length){
        panel.append(element('p',frame?'No resident rankings available.':'Waiting for the shared world.'));
        return;
      }
      const list=element('ol',null,'list rankings');
      let rank=0;
      for(const [index,s] of ranked.entries()){
        if(index===0||s.nw!==ranked[index-1].nw)rank=index+1;
        const row=element('li');
        row.value=rank;
        row.append(residentButton(s,s.name+' · '+occupation(s)+' · '+knownMoney(s.nw)));
        list.append(row);
      }
      panel.append(list);
      return;
    }
    const portrait=element('canvas',null,'portrait');
    portrait.width=24;portrait.height=32;portrait.setAttribute('aria-hidden','true');
    const sprite=appearance(sim.id);
    const portraitScale=Math.min(24/sprite.width,32/sprite.height);
    const portraitBrush=portrait.getContext('2d');portraitBrush.imageSmoothingEnabled=false;
    portraitBrush.drawImage(sprite,(24-sprite.width*portraitScale)/2,32-sprite.height*portraitScale,sprite.width*portraitScale,sprite.height*portraitScale);
    const identity=element('div',null,'resident-identity');
    identity.append(portrait,element('p',sim.age+' · '+occupation(sim)),element('span',title(sim.arch),'badge'));
    panel.append(identity,statGrid([['Net worth',knownMoney(sim.nw)],['Cash',knownMoney(sim.cash)],['Debt',knownMoney(sim.debt)]]));
    panel.append(element('p','Recorded move · '+(sim.move?title(sim.move):'No decision recorded this month')),decisionDetails(sim));
    panel.append(residentHistory(sim,frame.month));
    panel.append(element('h3','Recent life events'));
    const memories=sim.memories??[];
    if(memories.length){
      const list=element('ul');
      for(const event of memories)list.append(element('li',event));
      panel.append(list);
    }else panel.append(element('p','No recent life events.'));
    if(sim.persona)panel.append(element('h3','Personality'),element('p',sim.persona));
  },$('ranking'));
}

let mixView, selectedMixGroup;
function decisionMixPanel(month){
  if(mixView?.month===month)return mixView.details;
  const wasOpen=mixView?.details.open;
  const details=element('details',null,'decision-details decision-mix');
  mixView={month,details,load};
  const summary=element('summary','Decision mix by personality');
  summary.dataset.focusKey='decision-mix';
  const status=element('p',null,'mix-status');
  status.setAttribute('aria-live','polite');
  const body=element('div');
  details.append(summary,status,body);
  let loading=false;
  async function load(){
    if(!details.open||loading)return;
    loading=true;
    status.textContent=body.childElementCount?'Refreshing retained months…':'Loading recorded decisions…';
    try{
      const response=await fetch('/api/town/mix/'+month);
      if(!response.ok)throw Error();
      const {months,decisions,missingArchetype,groups}=await response.json();
      const focus=body.contains(document.activeElement);
      status.textContent='';
      body.replaceChildren();
      if(months.length){
        const start=months[0].label,end=months.at(-1).label;
        body.append(element('p',(start===end?start:start+' to '+end)+' · '+decisions.toLocaleString()+' decisions'));
      }
      if(missingArchetype)body.append(element('p',missingArchetype.toLocaleString()+' older decisions lack personality labels and are excluded from the breakdown.'));
      if(!groups.length){
        body.append(element('p','No decisions with a recorded personality are available for these months.'));
        if(focus)summary.focus();
        return;
      }
      const select=element('select');
      select.dataset.focusKey='decision-mix-group';
      const label=element('label','Personality and decision source');
      label.append(select);
      const result=element('div');
      groups.sort((a,b)=>a.label.localeCompare(b.label)||decisionSource(a).localeCompare(decisionSource(b)));
      for(const group of groups){
        const option=element('option',group.label+' · '+decisionSource(group));
        option.value=JSON.stringify([group.arch,group.provider,group.model]);
        option.selected=option.value===selectedMixGroup;
        select.append(option);
      }
      body.append(label,result);
      function showGroup(){
        const group=groups[select.selectedIndex];
        selectedMixGroup=select.value;
        const table=element('table',null,'mix-table');
        const header=element('tr');
        for(const name of ['Move','Outcomes','Offers','Outcome when offered']){
          const cell=element('th',name);cell.scope='col';header.append(cell);
        }
        const head=element('thead');head.append(header);
        const tbody=element('tbody');
        for(const row of group.moves){
          const entry=element('tr');
          const name=element('th',title(row.move));name.scope='row';
          entry.append(name,element('td',String(row.picked)),
            element('td',group.knownOffers?String(row.offered):'—'),
            element('td',row.offered?row.pickedWhenOffered+'/'+row.offered+' · '+percent(row.pickedWhenOffered/row.offered):'—'));
          tbody.append(entry);
        }
        table.append(head,tbody);
        result.replaceChildren(element('p',group.decisions.toLocaleString()+' decisions · Offer lists saved for '+group.knownOffers.toLocaleString()),
          element('p','Outcomes count final recorded moves, including Do nothing after a failed rules check.'),
          element('p','Offers count decisions with a saved list where the move was available. The rate uses only those offers. Move variants are grouped.'),table);
      }
      select.addEventListener('change',showGroup);
      showGroup();
      if(focus)select.focus({preventScroll:true});
    }catch{
      status.textContent=body.childElementCount
        ?'Refresh unavailable. Showing the last received mix.'
        :'Decision mix unavailable. Close and reopen to retry.';
    }finally{loading=false;}
  }
  details.addEventListener('toggle',load);
  details.open=Boolean(wasOpen);
  return details;
}

function renderWorld(){
  const live=$('world-live');
  renderPanel(live,panel=>{
    if(!frame){
      panel.append(element('p',connection==='offline'?'Reconnecting to the shared world…':'Waiting for the shared world…'));
      return;
    }
    const decisions=frame.sims.filter(sim=>sim.move);
    panel.append(element('p',frame.label+(connection==='offline'?' · Last received snapshot':'')),statGrid([
      ['Residents',frame.sims.length.toLocaleString()],
      ['Recorded decisions',decisions.length.toLocaleString()],
      ['Market',title(frame.market)||'Unavailable'],
      ['Mortgage rate',percent(frame.rate)],
      ['Last index return',percent(frame.change)],
      ['World decider',title(frame.decider)||'Unavailable'],
    ]),decisionMixPanel(frame.month),element('h3','Current decision feed'));
    const active=decisions.filter(sim=>sim.move!=='nothing');
    if(!active.length){
      panel.append(element('p',decisions.length?'All recorded decisions were Nothing.':'No decisions recorded this month.'));
      return;
    }
    const listed=active.slice(0,24);
    panel.append(element('p',`Showing ${listed.length} of ${active.length} recorded moves with an action.`));
    const list=element('ul',null,'list feed');
    for(const sim of listed){
      const item=element('li');
      item.append(residentButton(sim,sim.name+' · '+title(sim.move)));
      list.append(item);
    }
    panel.append(list);
  },$('close-world'));
}

function setWorld(open,moveFocus=true){
  $('world').hidden=!open;
  $('toggle').setAttribute('aria-expanded',open);
  for(const id of ['resident','place'])$(id).inert=open;
  if(open){
    renderWorld();
    mixView?.load();
    $('world').scrollTop=0;
  }
  if(moveFocus)$(open?'close-world':'toggle').focus({preventScroll:true});
}
function lot(index, slot=0){
  return [index%6*140+21+slot%13*8,Math.floor(index/6)*120+19+Math.floor(slot/13)*5];
}
const homes=blocks.flatMap((b,i)=>b==='homes'?[i]:[]);
const homeBlock=s=>homes[hash(s.id)%homes.length];
const workplaceFor=s=>s.working?(workplaceScenes[s.workplace]??workplaceScenes.shop):null;
const workBlock=s=>workplaceFor(s)?.block;
function routine(s,t){
  const h=hash(s.id), stagger=(h%101)/100;
  const morning=.04+stagger*.20, arriving=morning+.09+(h%7)/100;
  const midday=Math.max(arriving+.03,.35+((h>>>8)%100)/480), errandDone=midday+.09;
  const evening=Math.max(errandDone+.015,.64+((h>>>16)%100)/470), end=Math.min(.98,evening+.13);
  if(t<morning)return ['home',t/morning];
  if(t<arriving)return ['commute',(t-morning)/(arriving-morning)];
  if(t<midday)return [s.working?'work':'outside',(t-arriving)/(midday-arriving)];
  if(t<errandDone)return ['outbound',(t-midday)/(errandDone-midday)];
  if(t<evening)return ['errand',(t-errandDone)/(evening-errandDone)];
  if(t<end)return ['returning',(t-evening)/(end-evening)];
  return ['home',(t-end)/(1-end)];
}
function position(s,t){
  const h=hash(s.id), slot=(h>>>10)%39;
  const home=lot(homeBlock(s),slot);
  const work=lot(workBlock(s)??[21,22,14,20][(h>>>6)%4],slot);
  const destination=destinationFor(s);
  const errand=lot(destination==='bakery'?4:civic[destination]??[4,11,21,22][(h>>>12)%4],slot);
  function walk(a,b,p){
    if(a===b)return a;
    // Walk the two local streets and the connecting avenue.
    const q=[[a[0],a[1]],[a[0],a[1]-10],[a[0]-a[0]%140+7,a[1]-10],[a[0]-a[0]%140+7,b[1]-10],[b[0],b[1]-10],b];
    const lengths=q.slice(1).map((v,i)=>Math.abs(v[0]-q[i][0])+Math.abs(v[1]-q[i][1]));
    let left=p*lengths.reduce((x,y)=>x+y,0);
    for(let i=0;i<lengths.length;i++){if(lengths[i]&&left<lengths[i]){const f=left/lengths[i];return [q[i][0]+(q[i+1][0]-q[i][0])*f,q[i][1]+(q[i+1][1]-q[i][1])*f];}left-=lengths[i];}
    return b;
  }
  const [activity,progress]=routine(s,t);
  if(activity==='commute')return walk(home,work,progress);
  if(activity==='outbound')return walk(work,errand,progress);
  if(activity==='returning')return walk(errand,home,progress);
  if(activity==='home')return home;
  return activity==='errand'?errand:work;
}
function startStreet(){
  if(!frame?.sims.length)return;
  sceneArt('cottage');
  const person=get()??frame.sims.find(s=>lookIndex(s.id)===0&&destinationFor(s)==='bakery'&&s.working)??frame.sims.find(s=>lookIndex(s.id)===0)??frame.sims.find(s=>s.errand&&s.working)??frame.sims[0];
  selected=person.id;place=null;view='street';following=true;
  snapFollow=true;updateCameraControls();renderPanels();
}
const interiors={
  home:{name:'Home',wall:'#dfbd91',trim:'#774935',counter:'Hearth',shelf:'#b68154'},
  bakery:{name:'Maple Bakery',wall:'#e6b998',trim:'#a34835',counter:'Pastries',shelf:'#d99148'},
  bank:{name:'Hollow Bank',wall:'#c2ccb0',trim:'#426952',counter:'Teller',shelf:'#a7a168'},
  realtor:{name:'Land Office',wall:'#e1cfaa',trim:'#835840',counter:'Listings',shelf:'#b88461'},
  car_lot:{name:'Auto Showroom',wall:'#c1cbd1',trim:'#485970',counter:'Sales desk',shelf:'#7097b2'},
  city_hall:{name:'City Hall',wall:'#d9c7ab',trim:'#765b49',counter:'Permits',shelf:'#a7885e'},
};
let outsideStop=null;

function destinationFor(s){
  if(s.errand==='brokerage')return 'bank';
  if(s.errand in interiors)return s.errand;
  return !s.errand&&(hash(s.id)>>>12)%4===0?'bakery':null;
}
function drawInterior(placeKey,person,progress,w,h,p,animated){
  const atHome=placeKey==='home';
  const morning=p<.5;
  const edge=!animated?1:atHome?(morning?1-progress:progress):Math.min(progress,1-progress);
  const acrossFloor=clamp(edge/.16,0,1);
  const leaving=acrossFloor<1&&(atHome?morning:progress>.5);
  const clock=p*frame.duration;
  const stride=acrossFloor<1?clock*Math.PI/240:null;
  const transition=1-clamp(edge/.06,0,1);
  const workplace=workplaceScenes[placeKey];
  const idlePeriod=atHome ? 7200 : workplace ? 4400 : 5600;
  const idleTime=(clock+hash(person.id)%1200)%idlePeriod;
  const lean=workplace ? .055 : placeKey==='bakery' ? -.04 : .025;
  const shift=animated&&stride===null&&idleTime<1000
    ?Math.sin(idleTime/1000*Math.PI)**2*lean:0;
  const imageName=workplace?'work-'+workplace.art
    :{home:eveningAmount(p)<.5?'cottage-day':'cottage',bakery:'bakery',realtor:'work-land-office'}[placeKey];
  const variant=imageName&&sceneArt(imageName);
  const artwork=atHome&&!ready(variant)?sceneArt('cottage'):variant;
  if(artwork&&ready(artwork)){
    ctx.resetTransform();draw(ctx,0,0,w,h,'#171e35');
    const fit=Math.min(w/artwork.width,h/artwork.height);
    // On tall screens, use more of the canvas and keep the resident in frame.
    const scale=w<h?Math.max(fit,Math.min(h*.78/artwork.height,w*1.52/artwork.width)):fit;
    const width=artwork.width*scale,height=artwork.height*scale;
    const standingX=atHome ? .67 : .51;
    const residentX=.16+(standingX-.16)*acrossFloor;
    const x=width>w?clamp(w/2-width*residentX,w-width,0):(w-width)/2;
    const y=(h-height)/2;
    ctx.imageSmoothingEnabled=false;ctx.drawImage(artwork,x,y,width,height);
    if(!atHome&&eveningAmount(p)<1){
      ctx.globalAlpha=.12*(1-eveningAmount(p));draw(ctx,x,y,width,height,'#ffd7a1');ctx.globalAlpha=1;
    }
    if(atHome&&animated)drawHearth(x,y,width,height,clock);
    drawPerson(person,x+width*residentX,y+height*(.89-.09*acrossFloor),height*.23,stride,true,leaving?-1:1,shift);
    shadeDoorway(w,h,transition);
    hits=[];scene=null;
    return;
  }
  const room=workplace?{name:workplace.name,wall:'#dfbd91',trim:'#774935',shelf:'#b68154',counter:'Work bench'}:interiors[placeKey];
  const scale=Math.min(w/242,h/170);
  ctx.resetTransform();draw(ctx,0,0,w,h,'#1c243b');
  ctx.setTransform(scale,0,0,scale,(w-240*scale)/2,(h-168*scale)/2);
  ctx.imageSmoothingEnabled=false;
  draw(ctx,6,26,228,132,'#242729');
  draw(ctx,10,29,220,53,room.wall);
  for(let row=0;row<6;row++)for(let col=0;col<20;col++){
    draw(ctx,10+col*11,82+row*12,11,12,(row+col)%2?'#c4a480':'#d1b28d');
  }
  draw(ctx,10,77,220,5,room.trim);
  draw(ctx,10,28,220,4,'#3e3048');
  draw(ctx,10,151,220,3,'#5d4550');
  for(const x of [20,176]){
    draw(ctx,x,39,42,30,room.trim);draw(ctx,x+3,42,36,24,'#fedeb1');
    draw(ctx,x+20,42,2,24,room.trim);draw(ctx,x+3,53,36,2,room.trim);
  }
  draw(ctx,70,45,100,25,'#625047');
  for(let n=0;n<8;n++){
    const x=74+n*12;
    draw(ctx,x,49,8,6,room.shelf);draw(ctx,x+1,50,5,2,'#efd2a1');
    draw(ctx,x,60,8,5,n%2?'#c1a769':'#b87d51');
  }
  draw(ctx,65,83,110,19,room.trim);draw(ctx,65,80,110,7,'#f0d2ac');
  label(ctx,120,95,room.counter);
  draw(ctx,97,143,46,11,room.trim);draw(ctx,110,152,20,7,'#eed9b2');
  for(const x of [32,192]){
    draw(ctx,x,111,19,16,room.trim);draw(ctx,x-2,107,23,7,'#e6c39b');
    draw(ctx,x+7,105,4,4,room.shelf);
  }
  const y=140-31*acrossFloor;
  draw(ctx,113,y+1,14,3,'#fbd15a');
  drawPerson(person,120,y,32,stride,true,leaving?-1:1,shift);
  label(ctx,120,y-17,person.name);
  label(ctx,120,39,room.name,room.trim);
  ctx.resetTransform();
  shadeDoorway(w,h,transition);
  hits=[];scene=null;
}
function drawHearth(x,y,w,h,clock){
  const size=Math.max(1,Math.round(h*.004));
  for(let i=0;i<3;i++){
    const rise=((clock+i*480)%1600)/1600;
    ctx.globalAlpha=.6*Math.sin(rise*Math.PI);
    const left=x+w*(.827+i*.009+rise*.008);
    const top=y+h*(.585-rise*.085);
    draw(ctx,Math.round(left),Math.round(top),size,size,'#ffd082');
  }
  ctx.globalAlpha=1;
}
function shadeDoorway(w,h,amount){
  if(amount<=0)return;
  ctx.globalAlpha=amount;
  draw(ctx,0,0,w,h,'#171e35');
  ctx.globalAlpha=1;
}
// Reserve one neighbor per illustrated look. A new snapshot refreshes their
// finances and routines while keeping their place in this neighborhood.
let neighbors=[];
function refreshNeighbors(sims){
  const byId=new Map(sims.map(sim=>[sim.id,sim]));
  neighbors=neighbors.map(previous=>byId.get(previous.id)).filter(Boolean);
  const looks=new Set(neighbors.map(sim=>lookIndex(sim.id)));
  for(const sim of sims){
    const look=lookIndex(sim.id);
    if(!looks.has(look)){neighbors.push(sim);looks.add(look);}
    if(looks.size===6)break;
  }
}
function streetCast(focus){
  if(!focus)return neighbors;
  const look=lookIndex(focus.id);
  return [...neighbors.filter(sim=>lookIndex(sim.id)!==look),focus];
}
function doorwayVisibility(activity,t,working){
  if(activity==='outside')return 1;
  if(activity==='home'||activity==='work'||activity==='errand')return 0;
  const entering=activity!=='outbound'||working;
  const exiting=activity!=='commute'||working;
  return clamp(Math.min(entering?t/.09:1,exiting?(1-t)/.09:1),0,1);
}
function streetPosition(person,p){
  const [activity,progress]=routine(person,p);
  const lane=(hash(person.id)%9)*.008;
  const destination=destinationFor(person);
  const home=.13, work=person.working?.665:.78;
  // Civic buildings are across the bridge. Only the bakery is on this block.
  const errand=destination==='bakery' ? .523 : destination ? .88 : .58;
  const sidewalk=.77+lane, threshold=.681;
  const workY=person.working?threshold:sidewalk;
  const errandY=destination?threshold:sidewalk;
  const routes={
    commute:[home,threshold,work,workY],
    outbound:[work,workY,errand,errandY],
    returning:[errand,errandY,home,threshold],
  };
  const walking=activity in routes;
  let x={home,work,outside:work,errand}[activity];
  let y={home:threshold,work:workY,outside:workY,errand:errandY}[activity];
  let facing=1;
  if(walking){
    const [from,fromY,to,toY]=routes[activity];
    const across=clamp((progress-.16)/.68,0,1);
    x=from+(to-from)*across;
    y=progress<.16?fromY+(sidewalk-fromY)*progress/.16
      :sidewalk+(toY-sidewalk)*clamp((progress-.84)/.16,0,1);
    facing=to<from?-1:1;
  }
  return {x,y,visibility:doorwayVisibility(activity,progress,person.working),facing,walking};
}
function drawPerson(person,x,y,height,phase,focused,facing=1,lean=0){
  const cycle=lookIndex(person.id)===0&&redCoatFrames.length===9;
  const frameIndex=phase===null?8:Math.floor(phase*8/(Math.PI*4))%8;
  const sprite=cycle?redCoatFrames[frameIndex]:appearance(person.id);
  const width=height*sprite.width/sprite.height;
  const alpha=ctx.globalAlpha;
  ctx.globalAlpha=alpha*.32;
  draw(ctx,Math.round(x-width*.36),Math.round(y-2),width*.72,Math.max(2,height*.07),'#161528');
  ctx.globalAlpha=alpha;
  if(focused)draw(ctx,Math.round(x-width*.42),Math.round(y+1),width*.84,Math.max(2,height*.045),'#f5ba67');
  ctx.save();
  ctx.translate(Math.round(x),Math.round(y-height));
  ctx.scale(facing,1);
  if(lean)ctx.transform(1,0,-lean,1,lean*height,0);
  if(cycle||phase===null||height<24){
    ctx.drawImage(sprite,-Math.round(width/2),0,Math.round(width),Math.round(height));
  }else{
    drawStride(sprite,Math.round(width),Math.round(height),phase);
  }
  ctx.restore();
}

function drawStride(sprite,width,height,phase){
  const ankleBand=Math.floor(sprite.height*.74);
  const split=Math.floor(sprite.width/2);
  const seam=Math.round(height*ankleBand/sprite.height);
  const left=-Math.round(width/2);
  const sway=Math.sin(phase);
  const halves=[[0,split,left,-sway],[split,sprite.width-split,0,sway]];
  for(const [sourceX,sourceWidth,x,step] of halves){
    ctx.save();
    ctx.translate(x,seam-1);
    // Pivot at the seam. Only the raised foot shortens, keeping the opposite
    // shoe on the ground and the torso steady.
    ctx.transform(1,0,step*.23,1,0,0);
    const lift=Math.max(0,step)*height*.065;
    const half=Math.round(width*sourceWidth/sprite.width);
    ctx.drawImage(sprite,sourceX,ankleBand,sourceWidth,sprite.height-ankleBand,0,0,half,height-seam+1-lift);
    ctx.restore();
  }
  ctx.drawImage(sprite,0,0,sprite.width,ankleBand, left,0,width,seam);
}

function drawStreet(focus,p,w,h){
  const day=ready(streetArt.day)?streetArt.day:streetArt.evening;
  const night=ready(streetArt.evening)?streetArt.evening:day;
  if(!ready(day))return false;
  const tone=eveningAmount(p);
  const point=focus&&streetPosition(focus,p);
  const scale=Math.max(w/day.width,h/day.height)*Math.max(1,camera.zoom/streetFitZoom);
  const width=day.width*scale,height=day.height*scale;
  const target=streetPan??(following?point?.x:.5)??.5;
  const x=clamp(w*.5-width*target,Math.min(0,w-width),0);
  const y=clamp(h*.76-height*.77,Math.min(0,h-height),0);
  scene={x,y,width,height};
  ctx.resetTransform();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(day,x,y,width,height);
  if(night!==day&&tone>0){ctx.globalAlpha=tone;ctx.drawImage(night,x,y,width,height);ctx.globalAlpha=1;}
  const cast=streetCast(focus);
  const heightOfPerson=clamp(height*.105,43,100);
  hits=cast.map(sim=>{
    const pt=streetPosition(sim,p);
    return {sim,sx:x+pt.x*width,sy:y+pt.y*height,walking:pt.walking,facing:pt.facing,height:heightOfPerson,opacity:sim===focus?1:pt.visibility};
  }).filter(hit=>hit.opacity>0&&hit.sx>-50&&hit.sx<w+50&&hit.sy>0&&hit.sy<h).sort((a,b)=>a.sy-b.sy);
  const pointed=hover&&nearest(hover.x,hover.y)?.sim;
  for(const {sim,sx,sy,walking,facing,opacity} of hits){
    ctx.globalAlpha=opacity;
    const stride=walking?(p*frame.duration+hash(sim.id)%480)*Math.PI/240:null;
    drawPerson(sim,sx,sy,heightOfPerson,stride,sim===focus,facing);
    if(sim===focus||sim===pointed){
      ctx.font='600 13px system-ui';ctx.textAlign='center';
      const tag=ctx.measureText(sim.name).width+18;
      const left=clamp(sx-tag/2,4,Math.max(4,w-tag-4));
      draw(ctx,left,sy-heightOfPerson-25,tag,20,'#171e35');
      ctx.fillStyle='#ffe1ae';ctx.fillText(sim.name,left+tag/2,sy-heightOfPerson-11);
    }
  }
  ctx.globalAlpha=1;
  if(focus&&following&&!reducedMotion.matches){
    const [activity,progress]=routine(focus,p);
    const hasErrand=Boolean(destinationFor(focus));
    const atDeparture=activity==='commute'||(activity==='outbound'&&focus.working)||(activity==='returning'&&hasErrand);
    const atArrival=activity==='returning'||(activity==='commute'&&focus.working)||(activity==='outbound'&&hasErrand);
    const edge=Math.min(atDeparture?progress:1,atArrival?1-progress:1);
    shadeDoorway(w,h,1-clamp(edge/.06,0,1));
  }
  return true;
}
function showStory(person,p){
  const box=$('street-story');
  box.hidden=!streetMode||!person;
  if(box.hidden)return;
  const [activity]=routine(person,p);
  const stop=destinationFor(person);
  const destination=interiors[stop]?.name??'the neighborhood';
  const workplace=workplaceFor(person)?.name;
  const actions={home:p<.5?'At home · A quiet morning':'At home · Winding down',commute:workplace?'Heading to '+workplace:'Heading out',work:'Working at '+workplace,outside:'Out in town',outbound:'Heading to '+destination,errand:'At '+destination,returning:'Heading home'};
  const errandActivity=activity==='outbound'||activity==='errand';
  const recordedErrand=errandActivity&&person.move&&person.errand&&stop;
  const message=recordedErrand?actions[activity]+' · Recorded move: '+title(person.move):'Ambient routine · '+actions[activity];
  const key=person.id+':'+following+':'+message;
  if(key===storyText)return;
  storyText=key;
  const inspect=$('street-resident');
  inspect.textContent=person.name;
  inspect.setAttribute('aria-label','Open '+person.name+'’s profile');
  inspect.onclick=()=>choose(person.id);
  $('street-follow').textContent=following?'Stop following':'Follow';
  $('street-activity').textContent=message;
}
$('street-follow').onclick=toggleFollow;
function displayFrame(next){
  const newMonth=next.month!==frame?.month;
  frame=next;
  if(!newMonth)return;
  refreshNeighbors(next.sims);
  if(selected&&!get()){leaveFollow(false);selected=null;advancedFor=null;}
  const living=new Set(next.sims.map(sim=>sim.id));
  for(const id of outfits.keys())if(!living.has(id))outfits.delete(id);
  if(!opened&&next.sims.length){
    opened=true;
    if(view==='resident'&&streetMode)startStreet();
    else renderPanels();
  }else renderPanels();
  if(!$('world').hidden)renderWorld();
}
async function poll(){
  if(inFlight||document.hidden)return;
  inFlight=true;lastPoll=Date.now();
  try{
    const res=await fetch('/api/town');if(!res.ok)throw Error();
    const next=await res.json();
    offset=next.serverTime-Date.now();
    if(next.month!==liveFrame?.month)liveProgress=0;
    liveFrame=next;
    const reconnected=connection!=='live';
    connection='live';
    if(!frame||localProgress===null)displayFrame(next);
    if(reconnected&&!$('world').hidden)renderWorld();
  }catch{
    if(connection!=='offline'){connection='offline';if(!$('world').hidden)renderWorld();}
    $('phase').textContent='Reconnecting to shared world…';
  }
  finally{inFlight=false;}
}
function drawFrame(time){
  const elapsed=Math.max(0,time-lastTime);lastTime=time;
  if(frame){
    const live=liveProgress=Math.max(liveProgress,clamp((Date.now()+offset-liveFrame.startedAt)/liveFrame.duration,0,1));
    if(!paused&&!document.hidden&&localProgress!==null){
      if(localProgress>=1&&frame.month!==liveFrame.month){
        localProgress=0;
        displayFrame(liveFrame);
      }else localProgress=Math.min(1,localProgress+elapsed*speed/frame.duration);
    }
    const p=localProgress??live;
    const minutes=Math.floor(6*60+p*16*60);
    $('date').textContent=frame.label+' · '+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
    $('day').value=p;
    $('market').textContent=frame.sims.length+' residents · '+title(frame.market)+' · Mortgages '+(frame.rate*100).toFixed(1)+'%';
    const period=p<.30?'Morning':p<.48?'Midday':p<.78?'Afternoon':p<1?'Evening'
      :localProgress===null?'Waiting for next month':'End of this day';
    $('phase').textContent=(paused?'Paused locally · ':'')+'Town · '+period;
    if(Date.now()-lastPoll>(live===1?4000:12000))poll();
    const w=Math.max(1,canvas.clientWidth), h=Math.max(1,canvas.clientHeight);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const focus=get(), focusPoint=focus&&position(focus,p);
    showStory(focus,p);
    const [activity,progress]=focus?routine(focus,p):[];
    const destination=activity==='home'?'home':activity==='work'?(workplaceScenes[focus.workplace]?focus.workplace:'shop')
      :activity==='errand'?destinationFor(focus):null;
    const visit=activity==='home'?(p<.5?'morning':'evening'):activity;
    const stopId=destination&&streetMode&&following?frame.month+':'+focus.id+':'+visit+':'+destination:null;
    const inside=$('inside');
    inside.hidden=!stopId;
    const viewingInterior=Boolean(stopId&&outsideStop!==stopId);
    if(viewingInterior!==interiorOpen){
      interiorOpen=viewingInterior;
      updateCameraControls();
    }
    if(stopId){
      inside.textContent=interiorOpen?'Step outside':'Go inside';
      inside.onclick=()=>{outsideStop=interiorOpen?stopId:null;};
    }
    if(interiorOpen){
      drawInterior(destination,focus,progress,w,canvas.height,p,!reducedMotion.matches);
      requestAnimationFrame(drawFrame);
      return;
    }
    if(streetMode&&drawStreet(focus,p,w,h)){
      requestAnimationFrame(drawFrame);
      return;
    }
    scene=null;
    const scale=Math.min(w/840,h/600)*camera.zoom;
    if(following&&focusPoint){
      const blend=snapFollow?1:1-Math.exp(-Math.min(elapsed,100)/105);
      camera.x+=(focusPoint[0]-camera.x)*blend;
      camera.y+=(focusPoint[1]-camera.y)*blend;
      snapFollow=false;
    }
    const center=(size,extent,target)=>extent<=size?(size-extent)/2:clamp(target,size-extent,0);
    const x=center(w,840*scale,w/2-camera.x*scale),y=center(h,600*scale,h/2-camera.y*scale);
    transform={scale,x,y};
    camera.x=(w/2-x)/scale;camera.y=(h/2-y)/scale;
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
    ctx.setTransform(scale,0,0,scale,x,y);ctx.imageSmoothingEnabled=false;ctx.drawImage(map,0,0);
    ctx.globalAlpha=eveningAmount(p)*.34;draw(ctx,0,0,840,600,'#19234e');ctx.globalAlpha=1;
    const visible=[];
    for(const sim of streetMode?streetCast(focus):frame.sims){
      const [px,py]=sim===focus?focusPoint:position(sim,p);
      const sx=px*scale+x,sy=py*scale+y;
      if(sx<-15||sx>w+15||sy<-15||sy>h+20)continue;
      visible.push({sim,px,py,sx,sy});
    }
    visible.sort((a,b)=>a.py-b.py);
    // Keep the street readable when many residents share the same destinations.
    const shown=visible;
    if(streetMode&&focus&&!shown.some(({sim})=>sim===focus)){
      const resident=visible.find(({sim})=>sim===focus);
      if(resident)shown.push(resident);
    }
    hits=shown;
    const pointed=hover&&nearest(hover.x,hover.y);
    for(const {sim,px,py} of shown){
      if(sim===focus)draw(ctx,px-5,py-11,11,13,'#fbd15a');
      ctx.drawImage(appearance(sim.id),Math.round(px)-6,Math.round(py)-13,12,16);
    }
    ctx.resetTransform();
    const occupied=[];
    const wanted=shown.filter(({sim})=>sim===focus||sim===pointed?.sim);
    if(camera.zoom>=1.8)wanted.push(...shown.filter(({sim})=>sim!==focus&&sim!==pointed?.sim).sort((a,b)=>a.sim.id.localeCompare(b.sim.id)));
    ctx.font='600 12px system-ui';ctx.textAlign='center';
    for(const {sim,sx,sy} of wanted){
      const width=ctx.measureText(sim.name).width+12;
      const left=clamp(sx-width/2,2,Math.max(2,w-width-2));
      const top=clamp(sy-12*scale-20,2,h-20);
      if(occupied.some(box=>left<box.right&&left+width>box.left&&top<box.bottom&&top+18>box.top))continue;
      occupied.push({left,right:left+width,top,bottom:top+18});
      draw(ctx,left,top,width,18,sim===focus?'#ffd568':'#20232dee');
      ctx.fillStyle=sim===focus?'#282413':'#fff';
      ctx.fillText(sim.name,left+width/2,top+13);
    }
  }
  requestAnimationFrame(drawFrame);
}

const outfits=new Map();
const lookIndex=id=>hash(id+'portrait')%6;
function readAtlas(image,columns,rows){
  const atlas=element('canvas');
  atlas.width=image.naturalWidth;atlas.height=image.naturalHeight;
  const brush=atlas.getContext('2d');
  brush.drawImage(image,0,0);
  const {data}=brush.getImageData(0,0,atlas.width,atlas.height);
  const bounds=[];
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const left=Math.floor(col*atlas.width/columns),right=Math.floor((col+1)*atlas.width/columns);
    const top=Math.floor(row*atlas.height/rows),bottom=Math.floor((row+1)*atlas.height/rows);
    let x1=right,x2=left,y1=bottom,y2=top;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      if(data[(y*atlas.width+x)*4+3]<32)continue;
      x1=Math.min(x,x1);x2=Math.max(x,x2);y1=Math.min(y,y1);y2=Math.max(y,y2);
    }
    if(x1>=x2||y1>=y2)return [];
    bounds.push({x:x1,y:y1,width:x2-x1+1,height:y2-y1+1});
  }
  return bounds.map(({x,y,width,height})=>{
    const sprite=element('canvas');
    sprite.width=width;sprite.height=height;
    sprite.getContext('2d').drawImage(atlas,x,y,width,height,0,0,width,height);
    return sprite;
  });
}
function loadCast(){
  castSprites=readAtlas(castArt,3,2);
  if(castSprites.length)outfits.clear();
  if(frame)renderPanels();
}
function loadRedCoat(){
  const poses=readAtlas(redCoatArt,3,3);
  if(poses.length!==9)return;
  const width=Math.max(...poses.map(pose=>pose.width));
  const height=Math.max(...poses.map(pose=>pose.height));
  // Use the same canvas dimensions and foot baseline across all poses.
  redCoatFrames=poses.map(pose=>{
    const sprite=element('canvas');
    sprite.width=width;sprite.height=height;
    sprite.getContext('2d').drawImage(pose,Math.round((width-pose.width)/2),height-pose.height);
    return sprite;
  });
  if(frame)renderPanels();
}
castArt.addEventListener('load',loadCast);
redCoatArt.addEventListener('load',loadRedCoat);
if(ready(castArt))loadCast();
if(ready(redCoatArt))loadRedCoat();
function appearance(id){
  if(lookIndex(id)===0&&redCoatFrames.length===9)return redCoatFrames[8];
  if(castSprites.length)return castSprites[lookIndex(id)];
  if(outfits.has(id))return outfits.get(id);
  const seed=hash(id), variant=salt=>hash(id+salt);
  const complexions=[['#ffd8ad','#d99575'],['#e8ae7f','#a96553'],['#bd8668','#784b44'],['#975f4b','#623944'],['#744634','#472e3a']];
  const [skin,shade]=complexions[seed%complexions.length];
  const hair=['#271f34','#503331','#8d4431','#d99a51','#c2bab5'][variant('hair')%5];
  const coats=[['#9d4045','#d46b58'],['#56657b','#7992ae'],['#566241','#849057'],['#8f6342','#d49a5e'],['#634d76','#9b7097'],['#345b67','#4f927d']];
  const [coat,trim]=coats[variant('coat')%coats.length];
  const ink='#211d31', fabric='#37415b', gold='#dfa663';
  const sprite=element('canvas');sprite.width=24;sprite.height=32;
  const brush=sprite.getContext('2d');
  const pixel=(x,y,w,h,color)=>draw(brush,x,y,w,h,color);
  const accessory=variant('accessory')%5;
  const tall=variant('height')%3;
  brush.translate(0,tall);
  // Pixel clusters for the coat, boots and sleeves.
  pixel(6,13,12,12,ink);pixel(5,15,14,8,ink);
  pixel(7,14,10,10,coat);pixel(7,15,2,7,trim);pixel(10,15,4,2,trim);
  pixel(9,18,6,4,coat);pixel(16,16,2,6,trim);
  pixel(5,22,3,3,shade);pixel(17,22,2,3,skin);
  pixel(8,24,3,5-tall,fabric);pixel(13,24,3,5-tall,fabric);
  pixel(6,29-tall,6,2,ink);pixel(13,29-tall,5,2,ink);
  // Layered head, hair and face shading.
  pixel(8,3,9,11,ink);pixel(7,5,11,7,hair);pixel(8,4,8,3,hair);
  pixel(9,7,7,6,skin);pixel(10,12,5,2,shade);pixel(15,8,2,4,shade);
  pixel(10,8,4,1,skin);pixel(10,9,1,2,ink);pixel(14,9,1,2,ink);
  pixel(12,12,2,1,shade);
  if(accessory===0){pixel(7,3,11,4,coat);pixel(10,2,6,1,trim);pixel(6,6,14,1,ink);}
  if(accessory===1){pixel(7,7,2,7,hair);pixel(16,7,2,6,hair);}
  if(accessory===2){pixel(9,9,8,1,ink);pixel(12,9,1,1,skin);}
  if(accessory===3){pixel(8,14,9,2,gold);pixel(14,16,2,4,gold);}
  if(accessory===4){pixel(16,17,1,6,gold);pixel(17,20,4,5,ink);pixel(18,20,3,4,'#bf8846');}
  outfits.set(id,sprite);
  return sprite;
}

function nearest(x,y){
  let closest=null,distance=Math.max(9,transform.scale*6);
  for(const hit of hits){
    const d=Math.hypot(hit.sx-x,hit.sy-(hit.height?hit.height*.46:transform.scale*5)-y);
    if(d<(closest?distance:Math.max(distance,(hit.height??0)*.35))){closest=hit;distance=d;}
  }
  return closest;
}
function leaveFollow(refresh=true){
  if(!following)return;
  if(scene)streetPan=(canvas.clientWidth*.5-scene.x)/scene.width;
  following=false;snapFollow=false;
  if(refresh)renderPanels();
}
function updateCameraControls(){
  const fit=streetMode?streetFitZoom:1;
  $('zoom-level').value=interiorOpen?'Fit':Number((camera.zoom/fit).toFixed(1))+'×';
  $('zoom-out').disabled=interiorOpen||camera.zoom<=fit;
  $('zoom-in').disabled=interiorOpen||camera.zoom>=maxZoom();
}
const maxZoom=()=>streetMode?streetFitZoom*2:8;
function zoom(factor,point){
  if(interiorOpen)return;
  const old=camera.zoom;
  camera.zoom=clamp(old*factor,streetMode?streetFitZoom:1,maxZoom());updateCameraControls();
  if(!point||following||scene)return;
  const {x,y,scale}=transform;
  const next=scale*camera.zoom/old;
  camera.x=(point.x-x)/scale-(point.x-canvas.clientWidth/2)/next;
  camera.y=(point.y-y)/scale-(point.y-canvas.clientHeight/2)/next;
}
const coords=event=>{
  const r=canvas.getBoundingClientRect();
  return {x:event.clientX-r.left,y:event.clientY-r.top};
};
canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(clamp(-event.deltaY*.002,-.5,.5)),coords(event));},{passive:false});
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||drag)return;
  drag={...coords(event),id:event.pointerId,moving:false};
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
  const point=coords(event);
  if(!drag){hover=point;return;}
  if(drag.id!==event.pointerId)return;
  const dx=point.x-drag.x,dy=point.y-drag.y;
  if(!drag.moving&&Math.hypot(dx,dy)<5)return;
  if(!drag.moving&&event.pointerType==='touch'&&Math.abs(dy)>Math.abs(dx))return;
  leaveFollow();hover=null;canvas.classList.add('dragging');
  if(scene){streetPan=clamp((streetPan??(canvas.clientWidth*.5-scene.x)/scene.width)-dx/scene.width,0,1);drag={...point,id:drag.id,moving:true};return;}
  camera.x-=dx/transform.scale;camera.y-=dy/transform.scale;
  drag={...point,id:drag.id,moving:true};
});
canvas.addEventListener('pointerleave',()=>{hover=null;});
function endDrag(event){
  if(drag?.id!==event.pointerId)return;
  if(!drag.moving&&event.type==='pointerup'&&($('inside').hidden||$('inside').textContent==='Go inside')){
    const {x,y}=coords(event),hit=nearest(x,y);
    if(hit)choose(hit.sim.id);
    else if(scene){
      const px=(x-scene.x)/scene.width,py=(y-scene.y)/scene.height;
      if(py>.28&&py<.78){
        place=px<.34?0:px<.68?4:3;
        leaveFollow();renderPanels();
      }
    }else{
      const px=(x-transform.x)/transform.scale,py=(y-transform.y)/transform.scale;
      if(px>=0&&px<840&&py>=0&&py<600&&px%140>15&&py%120>15){
        place=Math.floor(py/120)*6+Math.floor(px/140);
        leaveFollow();renderPanels();
      }
    }
  }
  drag=null;canvas.classList.remove('dragging');
}
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,endDrag);
$('zoom-in').onclick=()=>zoom(1.4);
$('zoom-out').onclick=()=>zoom(1/1.4);
function switchMap(showStreet){
  if(streetMode===showStreet)return;
  streetMode=showStreet;
  camera=showStreet?streetCamera:overviewCamera;
  scene=null;
  hover=null;
  hits=[];
  interiorOpen=false;
  $('inside').hidden=true;
  $('street').setAttribute('aria-pressed',String(showStreet));
  $('overview').setAttribute('aria-pressed',String(!showStreet));
  updateCameraControls();
  if(place!==null){
    place=null;
    renderPanels();
  }
}
$('street').onclick=()=>switchMap(true);
$('overview').onclick=()=>switchMap(false);
canvas.addEventListener('keydown',event=>{
  if(event.key==='+'||event.key==='=')zoom(1.4);
  else if(event.key==='-')zoom(1/1.4);
  else {
    const delta={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[event.key];
    if(!delta)return;
    leaveFollow();
    if(scene){streetPan=clamp((streetPan??(canvas.clientWidth*.5-scene.x)/scene.width)+delta[0]*65/scene.width,0,1);event.preventDefault();return;}
    camera.x+=delta[0]*65/transform.scale;camera.y+=delta[1]*65/transform.scale;
  }
  event.preventDefault();
});
$('ranking').onclick=()=>{
  if(!$('world').hidden)setWorld(false,false);
  place=null;view=view==='ranking'?'resident':'ranking';renderPanels();
  if(view==='ranking')$('resident-title')?.focus();
};
$('toggle').onclick=()=>setWorld($('world').hidden);
$('close-world').onclick=()=>setWorld(false);
const speedButtons=document.querySelectorAll('[data-speed]');
function updatePlaybackControls(){
  $('pause').textContent=paused?'Resume':'Pause';
  $('pause').setAttribute('aria-pressed',paused);
  for(const button of speedButtons)button.setAttribute('aria-pressed',Number(button.dataset.speed)===speed);
  $('live').disabled=localProgress===null;
  $('live').textContent=localProgress===null?'Live':'Go live';
}
function keepLocalTime(){
  localProgress??=$('day').value;
  lastTime=performance.now();
}
$('pause').onclick=()=>{
  if(!frame)return;
  keepLocalTime();
  paused=!paused;
  updatePlaybackControls();
};
for(const button of speedButtons)button.onclick=()=>{
  const next=Number(button.dataset.speed);
  if(!frame||next===speed)return;
  keepLocalTime();
  speed=next;
  updatePlaybackControls();
};
$('live').onclick=()=>{
  if(!liveFrame)return;
  localProgress=null;
  paused=false;
  speed=1;
  displayFrame(liveFrame);
  // The action becomes disabled while live, so keep keyboard focus in the controls.
  if(document.activeElement===$('live'))$('pause').focus({preventScroll:true});
  updatePlaybackControls();
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastTime=performance.now();poll();}});
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;
  if(!$('world').hidden)setWorld(false);
  else if(document.activeElement.closest('#resident, #place'))document.activeElement.closest('aside').querySelector('[data-focus-key=close]')?.click();
  else if(document.activeElement===canvas)$('overview').click();});
setInterval(()=>{if(Date.now()-lastPoll>12000)poll();},4000);
poll();requestAnimationFrame(drawFrame);
