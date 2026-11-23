const $ = id => document.getElementById(id);
const canvas = $('town');
const ctx = canvas.getContext('2d');
const phaseStatus = $('phase');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function art(name,extension='png'){
  const image=new Image();
  image.src='/art/'+name+'.'+extension;
  return image;
}
const streetArt={day:art('street-day'),evening:art('street-evening')};
const districts={
  waterfront:{name:'Waterfront',x:.24,y:.21},
  market:{name:'Market Lane',x:.74,y:.21,art:'street-market'},
  guild:{name:'Guild Row',x:.23,y:.63,art:'street-guild'},
  square:{name:'Town Square',x:.76,y:.60,art:'street-square'},
};
const districtKeys=Object.keys(districts);
const workplaceScenes={
  hospital:{name:'Infirmary',art:'infirmary'},
  office:{name:'Guildhall',art:'guildhall'},
  shop:{name:'Market Shop',art:'market'},
  factory:{name:'Workshop',art:'workshop'},
  realtor:{name:'Land Office',art:'land-office'},
  civic:{name:'Watch Hall',art:'watchhall'},
  school:{name:'Schoolhouse',art:'schoolhouse'},
};
const interiorArt=new Map();
function sceneArt(name,extension){
  if(!interiorArt.has(name))interiorArt.set(name,art(name,extension));
  return interiorArt.get(name);
}
const castArt=art('cast');
const redCoatArt=art('red-coat-walk');
const walkArt=art('resident-walk');
const walkPoses=12, castSize=6, walkCycleLength=.9;
let castSprites=[], redCoatFrames=[];
const ready=image=>image.complete&&image.naturalWidth>0;
const lightModes=['Auto light','Daylight','Evening'];
let lightMode=0;
let scene=null;
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
const draw = (c,x,y,w,h,color) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
const hash = str => [...str].reduce((n,c) => Math.imul(n ^ c.charCodeAt(0),16777619) >>> 0,2166136261);
const title = str => (str || '').replaceAll('_',' ').replace(/\b\w/g,c => c.toUpperCase());
const wholeCrowns = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const fractionalCrowns = new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const money = cents => {
  const formatter=Math.abs(cents)<100?fractionalCrowns:wholeCrowns;
  const amount=formatter.format(cents/100);
  const currency=frame?.presentation?.currency??'crowns';
  return amount+' '+(currency==='crowns'&&Math.abs(Number(amount))===1?'crown':currency);
};
function displayName(group,key){
  const names=frame?.presentation?.[group];
  return names&&Object.hasOwn(names,key)?names[key]:title(key);
}
const moveName = move => displayName('moves',move);
function marketName(market){
  const name=displayName('regimes',market);
  return name?name[0].toUpperCase()+name.slice(1):'Unavailable';
}
function loanName(){
  const name=frame?.presentation?.houseLoan??'house loan';
  return name[0].toUpperCase()+name.slice(1);
}
function label(c,x,y,name,bg='#25252c') {
  c.font='bold 8px monospace'; c.textAlign='center';
  const w=c.measureText(name).width+8;
  draw(c,x-w/2,y-9,w,12,bg); c.fillStyle='#fff9e5'; c.fillText(name,x,y);
}
let frame, liveFrame, selected, view = 'resident', paused=false, speed=1, localProgress=null, lastTime=0, offset=0;
let hits=[], inFlight=false, lastPoll=0;
const streetFitZoom=6.2;
const streetCamera={zoom:streetFitZoom,pan:null};
let following=false;
let interiorOpen=false;
let hover=null, drag=null, liveProgress=0;
let streetMode=true, opened=false, place=null, storyText="";
let activeStreet='waterfront', inspectedStreet='market', inspectorOpen=false, rosterExpanded=false;
let districtSnapshot, districtPanelKey;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const get = () => frame?.sims.find(s => s.id===selected);
const element = (tag,text,className) => { const n=document.createElement(tag); if(text!=null)n.textContent=text; if(className)n.className=className; return n; };
let advancedFor=null;
let replayOpen=false;
let connection='connecting';
const knownMoney=value=>Number.isFinite(value)?money(value):'Unavailable';
const percent=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'Unavailable';
const occupation=sim=>sim.occupation||title(sim.career)||'Occupation unavailable';

function choose(id){
  if(selected!==id){
    if(scene)streetCamera.pan=(canvas.clientWidth*.5-scene.x)/scene.width;
    following=false;
    advancedFor=null;
    replayOpen=false;
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
  following=true;streetCamera.pan=null;
  streetCamera.zoom=Math.max(streetCamera.zoom,3.5);
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
    const name=element('dt',moveName(move)+(move===chosen?' · Sampled':''));
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

const decisionDialog=element('dialog',null,'decision-dialog');
const decisionTitle=element('h2','Recorded decision');
decisionTitle.id='decision-title';
decisionDialog.setAttribute('aria-labelledby',decisionTitle.id);
const decisionClose=element('button','Close');
decisionClose.type='button';
const decisionHeader=element('div',null,'panel-heading');
decisionHeader.append(decisionTitle,decisionClose);
const decisionBody=element('div');
decisionDialog.append(decisionHeader,decisionBody);
document.body.append(decisionDialog);
let decisionRequest, decisionOrigin;

function decisionHash(id,month){
  return '#decision/'+encodeURIComponent(id)+'/'+month;
}

function decisionLink(id,month){
  const link=element('a','View decision','decision-link');
  link.href=decisionHash(id,month);
  link.addEventListener('click',rememberDecisionOrigin);
  return link;
}

function rememberDecisionOrigin(event){
  if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)decisionOrigin=event.currentTarget;
}

function dismissDecision(){
  decisionDialog.close();
  if(decisionOrigin?.getClientRects().length)decisionOrigin.focus({preventScroll:true});
  else canvas.focus({preventScroll:true});
  decisionOrigin=null;
}

function closeDecision(){
  decisionRequest?.abort();
  if(location.hash.startsWith('#decision/'))history.replaceState(history.state,'',location.pathname+location.search);
  dismissDecision();
}

function savedDecisionLink(id,record,name){
  const {month,label,move,draw,probabilities,decision}=record;
  const evidence={name,month,label,move,draw,probabilities,decision:decision&&{
    provider:decision.provider,model:decision.model,valid:decision.valid,
    sampling:decision.sampling,heuristicReplay:decision.heuristicReplay,
  }};
  const bytes=new TextEncoder().encode(JSON.stringify(evidence));
  const saved=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  return new URL(decisionHash(id,month)+'?saved='+saved,location.href).href;
}

function readSavedDecision(encoded,month){
  if(!encoded)return;
  const odds=value=>value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.values(value).every(p=>Number.isFinite(p)&&p>=0&&p<=1);
  const sampling=value=>value===undefined||(typeof value?.move==='string'&&odds(value.odds));
  try{
    const bytes=Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const record=JSON.parse(new TextDecoder().decode(bytes));
    const decision=record.decision;
    if(record.month!==month||typeof record.label!=='string'||typeof record.move!=='string'
      ||(record.name!==undefined&&typeof record.name!=='string')
      ||(record.draw!==undefined&&!Number.isFinite(record.draw))
      ||(record.probabilities!==undefined&&!odds(record.probabilities))
      ||(decision!==undefined&&(!decision||typeof decision.provider!=='string'
        ||(decision.model!==undefined&&typeof decision.model!=='string')
        ||!sampling(decision.sampling)||!sampling(decision.heuristicReplay))))return;
    return {...record,hasProbe:false};
  }catch{
    return;
  }
}

function renderLinkedDecision(record,id,saved=false){
  const name=record.name??frame?.sims.find(sim=>sim.id===id)?.name;
  if(name)decisionTitle.textContent=name+'’s decision';
  const evidence=element('section');
  decisionBody.replaceChildren(element('p',record.label));
  if(saved){
    decisionBody.append(element('p','Saved evidence from a shared link. Live records and probes require a retained month.'));
  }else{
    const copy=element('button','Copy decision link');
    copy.type='button';
    const copyStatus=element('p');
    copyStatus.setAttribute('role','status');
    copy.onclick=async()=>{
      const url=savedDecisionLink(id,record,name);
      try{
        await navigator.clipboard.writeText(url);
        copyStatus.textContent='Decision link copied.';
      }catch{
        const manual=element('input');
        manual.readOnly=true;
        manual.value=url;
        manual.setAttribute('aria-label','Decision link');
        copyStatus.replaceChildren(manual);
        manual.select();
      }
    };
    decisionBody.append(copy,copyStatus);
  }
  decisionBody.append(evidence);
  appendDecisionEvidence(evidence,record,id);
}

async function showLinkedDecision(){
  decisionRequest?.abort();
  if(!location.hash.startsWith('#decision/')){
    if(decisionDialog.open)dismissDecision();
    return;
  }
  const hash=location.hash;
  const match=/^#decision\/([\w-]{1,80})\/([1-9][0-9]{0,8})(?:\?saved=([\w-]{1,16000}))?$/.exec(hash);
  const controller=new AbortController();
  decisionRequest=controller;
  decisionTitle.textContent='Recorded decision';
  const status=element('p',match?'Loading decision…':'This decision link is invalid.');
  status.setAttribute('role','status');
  decisionBody.replaceChildren(status);
  if(!decisionDialog.open)decisionDialog.showModal();
  decisionDialog.scrollTop=0;
  if(!match)return;
  const [,id,month,encoded]=match;
  const saved=readSavedDecision(encoded,Number(month));
  try{
    const response=await fetch('/api/town/history/'+encodeURIComponent(id),{signal:controller.signal});
    if(!response.ok)throw Error();
    const {months}=await response.json();
    if(controller.signal.aborted)return;
    const record=months.find(row=>row.month===Number(month));
    if(!record?.move){
      if(saved){renderLinkedDecision(saved,id,true);return;}
      status.textContent=record?'No decision was recorded for this resident in '+record.label+'.'
        :'This decision is outside the retained timeline or the resident is unavailable.';
      return;
    }
    renderLinkedDecision(record,id);
  }catch{
    if(controller.signal.aborted)return;
    if(saved){renderLinkedDecision(saved,id,true);return;}
    status.textContent='The decision could not be loaded.';
    const retry=element('button','Retry');
    retry.onclick=showLinkedDecision;
    decisionBody.append(retry);
  }
}

decisionClose.onclick=closeDecision;
$('street-decision').addEventListener('click',rememberDecisionOrigin);
decisionDialog.addEventListener('cancel',event=>{event.preventDefault();closeDecision();});
window.addEventListener('hashchange',showLinkedDecision);

function decisionReplay(record,model,heuristic){
  const details=element('details',null,'decision-replay');
  const summary=element('summary','Model vs. heuristic');
  summary.dataset.focusKey=record.month===undefined?'current-replay':'replay-'+record.month;
  details.open=record.month===undefined&&replayOpen;
  const moves=Object.keys(model.odds);
  const oddsChanged=moves.some(move=>Math.abs(model.odds[move]-heuristic.odds[move])>1e-9);
  const takeaway=model.move!==heuristic.move?'The same draw sampled different moves.'
    :oddsChanged?'The odds changed. The same draw sampled the same move.'
    :'Both used the same odds and sampled the same move.';
  const table=element('table',null,'mix-table');
  table.append(element('caption','Sampling odds'));
  const heading=table.createTHead().insertRow();
  for(const name of ['Move','Model','Heuristic']){
    const column=element('th',name);
    column.scope='col';
    heading.append(column);
  }
  const body=table.createTBody();
  for(const move of moves){
    const row=body.insertRow();
    const name=element('th',moveName(move));
    name.scope='row';
    row.append(name);
    for(const sample of [model,heuristic]){
      const odds=sample.odds[move];
      const cell=element('td',percent(odds),sample.move===move?'sampled-odds':null);
      cell.title=String(odds);
      row.append(cell);
    }
  }
  details.append(summary,element('p',takeaway,'replay-result'),statGrid([
    ['Model sampled',moveName(model.move)],
    ['Heuristic would sample',moveName(heuristic.move)],
  ]),element('p','Both use the same resident state, legal moves, discipline adjustment and random draw. Only the model’s sampled move went to the rules check.'),table);
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
    ['Recorded outcome',moveName(record.move)],
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
      details.append(element('p',moveName(sampling.move)+' was sampled. '+range,'draw-interval'));
      const exact=element('details',null,'exact-sampling');
      const summary=element('summary','Exact sampling values');
      summary.dataset.focusKey='exact-sampling-'+(record.month??'current');
      exact.open=!shown.bounds;
      exact.append(summary,element('p','Values are fractions from 0 to 1.'),statGrid([
        ['Draw',String(record.draw)],['Lower bound',String(interval.lower)],['Upper bound',String(interval.upper)],
      ]),moveOdds(sampling.odds,sampling.move,String));
      details.append(exact);
    }
    if(record.decision.valid===false)details.append(element('p','The sampled move failed the rules check, so the outcome was '+moveName('nothing')+'.'));
  }else details.append(element('p','Sampling odds were not recorded for this month. The raw odds alone do not reproduce the pick.'));
  details.append(element('h3','Raw move odds'),moveOdds(record.probabilities));
  if(sampling&&record.decision.heuristicReplay){
    details.append(decisionReplay(record,sampling,record.decision.heuristicReplay));
  }else if(record.decision?.provider==='kev'){
    details.append(element('p','The heuristic replay was not recorded for this decision.'));
  }
  let probe;
  function updateProbe(available){
    if(probe&&Boolean(available)===probe.matches('.counterfactual'))return;
    const next=available?probePanel(residentId,record.month??frame.month,record.month??'current')
      :element('p','Counterfactual inputs are unavailable for this decision.');
    if(probe){
      const hadFocus=probe.contains(document.activeElement);
      probe.replaceWith(next);
      if(hadFocus)details.querySelector(':scope > summary').focus({preventScroll:true});
    }else details.append(next);
    probe=next;
  }
  updateProbe(record.hasProbe);
  return updateProbe;
}

function probePanel(id,month,focusMonth){
  const details=element('details',null,'decision-details counterfactual');
  const summary=element('summary','What changes the odds?');
  summary.dataset.focusKey='probe-'+focusMonth;
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
      if(probe.movesAdded.length)result.append(element('p','New offers · '+probe.movesAdded.map(moveName).join(', ')));
      if(probe.movesRemoved.length)result.append(element('p','Offers removed · '+probe.movesRemoved.map(moveName).join(', ')));
      const odds=element('dl',null,'odds');
      const moves=[...new Set([...Object.keys(probe.base),...Object.keys(probe.variant)])];
      const shift=move=>Math.abs((probe.variant[move]??0)-(probe.base[move]??0));
      moves.sort((a,b)=>shift(b)-shift(a));
      for(const move of moves){
        const before=Object.hasOwn(probe.base,move)?percent(probe.base[move]):'Not offered';
        const after=Object.hasOwn(probe.variant,move)?percent(probe.variant[move]):'Not offered';
        odds.append(element('dt',moveName(move)),element('dd',before+' → '+after));
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
      ['Outcome',moveName(record.move)],['Source',decisionSource(decision)],
      ['Trigger',decision?.reason?title(decision.reason):'Not retained'],
      ['Sampled move',decision?.sampling?.move?moveName(decision.sampling.move):'Not retained'],
      ['Draw',displayDraw(record.draw,drawInterval(decision?.sampling,record.draw)).draw],
    ]));
  }
  const before=prior.decision?.offered, after=row.decision?.offered;
  body.append(element('h3','Available moves'));
  if(before&&after){
    const added=after.filter(move=>!before.includes(move));
    const removed=before.filter(move=>!after.includes(move));
    const names=moves=>moves.map(moveName).join(', ')||'None';
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
      odds.append(element('dt',moveName(move)),element('dd',percent(older[move])+' → '+percent(newer[move])+' ('+change+')'));
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
  const outcome=row.move?moveName(row.move):'No recorded decision';
  heading.append(element('strong',row.label),element('small',outcome));
  const delta=element('span',null,'timeline-change');
  summary.append(heading,delta);
  summary.dataset.focusKey='month-'+row.month;
  const balances=statGrid([['Net worth',knownMoney(row.nw)],['Cash',knownMoney(row.cash)],['Debt',knownMoney(row.debt)]]);
  const comparison=element('div');
  details.append(summary);
  if(row.events?.length){
    const events=element('ul',null,'month-events');
    for(const event of row.events)events.append(element('li',event));
    details.append(element('h4','Life events'),events);
  }else{
    details.append(element('p',row.events?'No life events recorded this month.':'Life events were not retained for this month.'));
  }
  details.append(element('p','Age '+row.age+' · Month-end balances'),balances,comparison);
  if(row.cashFlow){
    const {income,costs,discretionary,debtPayments}=row.cashFlow;
    details.append(element('h4','Selected cash flows'),statGrid([
      ['Income after tax',knownMoney(income)],['Living and running costs',knownMoney(costs)],
      ['Discretionary spending',knownMoney(discretionary)],['Debt payments',knownMoney(debtPayments)],
    ]),element('p','Cash change also reflects purchases, investments, and transfers between accounts.'));
  }else{
    details.append(element('p','Income and outgoings were not retained for this month.'));
  }
  let updateProbe;
  if(row.move&&(row.decision||row.probabilities)){
    details.append(decisionLink(residentId,row.month));
    const evidence=element('details',null,'decision-details past-decision');
    const evidenceSummary=element('summary','Decision evidence');
    evidenceSummary.dataset.focusKey='evidence-'+row.month;
    evidence.append(evidenceSummary);
    evidence.addEventListener('toggle',()=>{
      if(evidence.open&&!updateProbe)updateProbe=appendDecisionEvidence(evidence,row,residentId);
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
  return {item,compare,compareDecision,setProbe(available){
    row.hasProbe=available;
    updateProbe?.(available);
  }};
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
  let shownKey,loading=false;
  const coverageKey=()=>month+':'+(liveFrame?.month??month);
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
      retainedRow.setProbe(row.hasProbe);
      const previous=visible[i+1];
      retainedRow.compare(previous?.month===row.month-1?previous:undefined);
      retainedRow.compareDecision(visible.slice(i+1).find(month=>month.move));
      if(list.children[i]!==retainedRow.item)list.insertBefore(retainedRow.item,list.children[i]??null);
    }
    if(restoreFocus){
      if(list.contains(active)){
        if(document.activeElement!==active)active.focus({preventScroll:true});
        if(wasVisible&&!visibleInPanel(active,panel))active.scrollIntoView({block:'nearest'});
      }else if(!list.contains(document.activeElement))summary.focus();
    }
  }
  async function load(force=false){
    const requested=month,key=coverageKey();
    if(!details.open||loading||(!force&&shownKey===key))return;
    loading=true;
    if(shownKey===undefined)message.textContent='Loading recorded months…';
    try{
      const response=await fetch('/api/town/history/'+encodeURIComponent(sim.id));
      if(!response.ok)throw Error();
      const {months}=await response.json();
      if(key!==coverageKey())return;
      const visible=months.filter(row=>row.month<=requested).reverse();
      message.textContent=visible.length
        ?'Open a month for events and balances. Residents get periodic reviews or a review after a significant event, so some months have no recorded decision.'
        :'No months are available for this resident yet.';
      const initial=shownKey===undefined;
      updateRows(visible);
      if(initial&&document.activeElement===summary&&matchMedia('(max-width: 570px)').matches){
        list.firstElementChild?.scrollIntoView({block:'nearest'});
      }
      shownKey=key;
    }catch{
      if(key===coverageKey())message.textContent=shownKey===undefined
        ?'Timeline unavailable. Close and reopen to retry.'
        :'Refresh unavailable. Showing the last received months.';
    }finally{
      loading=false;
      if(key!==coverageKey())load();
    }
  }
  details.addEventListener('toggle',()=>load(true));
  historyDisclosure={id:sim.id,details,refresh:load,setMonth(next){
    month=next;
    load();
  }};
  return details;
}

function lifetimeTrend(points){
  const chart=element('canvas',null,'lifetime-trend');
  chart.width=256;chart.height=76;
  chart.setAttribute('role','img');
  const first=points[0], last=points.at(-1);
  chart.setAttribute('aria-label','Net worth from '+knownMoney(first.nw)+' in '+first.label+' to '+knownMoney(last.nw)+' in '+last.label);
  const values=points.map(point=>point.nw);
  const low=Math.min(0,...values), high=Math.max(1,...values);
  const brush=chart.getContext('2d');
  const x=month=>6+(chart.width-12)*(month-first.month)/(last.month-first.month);
  const y=nw=>6+(chart.height-12)*(high-nw)/(high-low);
  brush.strokeStyle='#776781';
  brush.beginPath();brush.moveTo(6,y(0));brush.lineTo(chart.width-6,y(0));brush.stroke();
  brush.strokeStyle='#e9ad61';brush.lineWidth=2;
  brush.beginPath();brush.moveTo(x(first.month),y(first.nw));
  for(const point of points.slice(1))brush.lineTo(x(point.month),y(point.nw));
  brush.stroke();
  return chart;
}

function lifetimeView(onLife){
  const body=element('div',null,'lifetime-view');
  let request=0, selectedYear, selectedResident;
  async function load(id,month){
    const token=++request;
    if(selectedResident!==id){selectedResident=id;selectedYear=undefined;}
    const focused=body.contains(document.activeElement);
    body.replaceChildren(element('p','Loading lifetime history…'));
    try{
      const response=await fetch('/api/town/lifetime/'+month+'/'+encodeURIComponent(id));
      if(!response.ok)throw Error();
      const {life}=await response.json();
      if(token!==request)return;
      onLife?.(life);
      if(!life){
        body.replaceChildren(element('p','No lifetime records are available for this resident.'));
        return;
      }
      const years=[...new Set([...life.events,...life.wealth].map(row=>row.year))].sort((a,b)=>b-a);
      const year=element('select');
      year.dataset.focusKey='lifetime-year';
      for(const value of years){
        const option=element('option','Year '+value);
        option.value=String(value);
        year.append(option);
      }
      if(years.includes(selectedYear))year.value=String(selectedYear);
      const label=element('label','Browse by year');
      label.append(year);
      const results=element('div');
      function renderYear(){
        selectedYear=Number(year.value);
        const wealth=life.wealth.filter(row=>row.year===selectedYear).at(-1);
        const events=life.events.filter(row=>row.year===selectedYear);
        results.replaceChildren();
        if(wealth){
          results.append(element('p',wealth.label+' · Age '+wealth.age),
            statGrid([['Net worth',knownMoney(wealth.nw)]]));
        }
        if(events.length){
          const list=element('ul',null,'lifetime-events');
          for(const event of events){
            const row=element('li');
            row.append(element('strong',event.label),element('p',event.text));
            list.append(row);
          }
          results.append(list);
        }else results.append(element('p','No milestones recorded this year.'));
      }
      year.onchange=renderYear;
      body.replaceChildren(element('p',(life.partial?'Available history begins in ':'Recorded from ')+life.from+'.'));
      if(life.wealth.length>1)body.append(element('h4','Net worth over time'),lifetimeTrend(life.wealth));
      body.append(label,results);
      renderYear();
      if(focused&&document.activeElement===document.body)year.focus({preventScroll:true});
    }catch{
      if(token!==request)return;
      onLife?.(null);
      const retry=element('button','Retry lifetime history');
      retry.onclick=()=>load(id,month);
      body.replaceChildren(element('p','Lifetime history is unavailable.'),retry);
    }
  }
  return {body,load};
}

let profileLife, pastResidentsView;
function residentLifetime(sim,month){
  if(profileLife?.id===sim.id){
    profileLife.setMonth(month);
    return profileLife.section;
  }
  const details=element('details',null,'decision-details resident-lifetime');
  const summary=element('summary','Lifetime history');
  summary.dataset.focusKey='lifetime';
  const section=element('div');
  const recent=element('div',null,'recent-milestones');
  const life=lifetimeView(record=>{
    recent.replaceChildren();
    const events=record?.events.slice(-6).reverse();
    if(events?.length){
      const list=element('ul',null,'lifetime-events');
      for(const event of events){
        const row=element('li');
        row.append(element('strong',event.label),element('p',event.text));
        list.append(row);
      }
      recent.append(list);
    }else recent.append(element('p','No dated milestones are available.'));
  });
  details.append(summary,life.body);
  section.append(details,element('h3','Recent milestones'),recent);
  let shownMonth;
  function refresh(){
    if(month!==shownMonth){
      shownMonth=month;
      recent.replaceChildren(element('p','Loading dated milestones…'));
      life.load(sim.id,month);
    }
  }
  details.addEventListener('toggle',refresh);
  profileLife={id:sim.id,section,setMonth(next){month=next;refresh();}};
  refresh();
  return section;
}

function pastResidentsPanel(month){
  if(pastResidentsView?.month===month)return pastResidentsView.details;
  const details=element('details',null,'decision-details past-residents');
  const summary=element('summary','Past residents');
  summary.dataset.focusKey='past-residents';
  const body=element('div');
  details.append(summary,body);
  let loaded=false, loading=false;
  details.addEventListener('toggle',async()=>{
    if(!details.open||loaded||loading)return;
    loading=true;
    body.replaceChildren(element('p','Loading past residents…'));
    try{
      const response=await fetch('/api/town/lifetime/'+month);
      if(!response.ok)throw Error();
      const {residents}=await response.json();
      loaded=true;
      if(!residents.length){
        body.replaceChildren(element('p','No deaths were recorded through this month.'));
        return;
      }
      const search=element('input');
      search.type='search';
      search.dataset.focusKey='past-residents-search';
      const label=element('label','Find a past resident');
      label.append(search);
      const matching=element('p');
      const list=element('ul',null,'list');
      const story=element('details',null,'decision-details');
      const name=element('summary');
      story.hidden=true;
      const life=lifetimeView();
      story.append(name,life.body);
      function showResidents(){
        const query=search.value.trim().toLowerCase();
        const found=residents.filter(resident=>resident.name.toLowerCase().includes(query));
        matching.textContent=found.length>20?'Showing 20 matches. Search by name to narrow the list.':found.length?'':'No matching residents.';
        list.replaceChildren();
        for(const resident of found.slice(0,20)){
          const row=element('li');
          const button=element('button',resident.name+' · '+resident.label+' · Age '+resident.age);
          button.onclick=()=>{
            name.textContent=resident.name+' · Lifetime history';
            story.hidden=false;
            story.open=true;
            life.load(resident.id,month);
            name.focus();
            name.scrollIntoView({block:'nearest'});
          };
          row.append(button);
          list.append(row);
        }
      }
      search.oninput=showResidents;
      body.replaceChildren(label,matching,list,story);
      showResidents();
    }catch{
      body.replaceChildren(element('p','Past residents are unavailable. Close and reopen to retry.'));
    }finally{loading=false;}
  });
  pastResidentsView={month,details};
  return details;
}

function renderPanels(){
  const resident=$('resident'), location=$('place'), sim=get();
  $('district-panel').hidden=streetMode||!inspectorOpen||view!=='street'||place!==null;
  const disclosure=resident.querySelector('details');
  if(disclosure&&disclosure.dataset.residentId===sim?.id){
    advancedFor=disclosure.open?sim.id:null;
    replayOpen=Boolean(disclosure.querySelector('.decision-replay')?.open);
  }
  location.hidden=place===null;
  renderPanel(location, panel=>{
    if(panel.hidden)return;
    panel.append(element('h2',place.name));
    const neighbors=(districtSnapshot?.streets[activeStreet]??[]).filter(({sim,journey})=>
      journey.inside&&place.stops.includes(journey.activity==='work'?(sim.workplace??'shop')
        :journey.activity==='errand'?destinationFor(sim):'home')).map(({sim})=>sim);
    panel.append(element('p',neighbors.length?'Residents here now.':'Nobody is here right now.'));
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
    identity.append(portrait,element('p',sim.age+' · '+occupation(sim)),element('span',displayName('archetypes',sim.arch),'badge'));
    panel.append(identity,statGrid([['Net worth',knownMoney(sim.nw)],['Cash',knownMoney(sim.cash)],['Debt',knownMoney(sim.debt)]]));
    panel.append(element('p','Recorded move · '+(sim.move?moveName(sim.move):'No decision recorded this month')),decisionDetails(sim));
    panel.append(residentHistory(sim,frame.month));
    panel.append(residentLifetime(sim,frame.month));
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
          const name=element('th',moveName(row.move));name.scope='row';
          entry.append(name,element('td',String(row.picked)),
            element('td',group.knownOffers?String(row.offered):'—'),
            element('td',row.offered?row.pickedWhenOffered+'/'+row.offered+' · '+percent(row.pickedWhenOffered/row.offered):'—'));
          tbody.append(entry);
        }
        table.append(head,tbody);
        result.replaceChildren(element('p',group.decisions.toLocaleString()+' decisions · Offer lists saved for '+group.knownOffers.toLocaleString()),
          element('p','Outcomes count final recorded moves, including '+moveName('nothing')+' after a failed rules check.'),
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
    panel.append(element('p','Viewed month · '+frame.label+(connection==='offline'?' · Last received snapshot':'')),statGrid([
      ['Residents',frame.sims.length.toLocaleString()],
      ['Recorded decisions',decisions.length.toLocaleString()],
      ['Market',marketName(frame.market)],
      [loanName()+' rate',percent(frame.rate)],
      [(frame.presentation?.fund??'Guild Fund')+' return',percent(frame.change)],
      ['Configured decider',frame.deciderModel??(frame.decider==='kev'?'Decision model':title(frame.decider)||'Unavailable')],
    ]),decisionMixPanel(frame.month),pastResidentsPanel(frame.month),element('h3','Decision feed'));
    const active=decisions.filter(sim=>sim.move!=='nothing');
    if(!active.length){
      panel.append(element('p',decisions.length?'All residents who decided chose to do nothing.':'No decisions recorded this month.'));
      return;
    }
    const listed=active.slice(0,24);
    panel.append(element('p',`Showing ${listed.length} of ${active.length} recorded moves with an action.`));
    const list=element('ul',null,'list feed');
    for(const sim of listed){
      const item=element('li');
      item.append(residentButton(sim,sim.name+' · '+moveName(sim.move)));
      list.append(item);
    }
    panel.append(list);
  },$('close-world'));
}

function setWorld(open,moveFocus=true){
  $('world').hidden=!open;
  $('toggle').setAttribute('aria-expanded',open);
  for(const id of ['resident','place','district-panel','district-pins'])$(id).inert=open;
  if(open){
    renderWorld();
    mixView?.load();
    $('world').scrollTop=0;
  }
  if(moveFocus)$(open?'close-world':'toggle').focus({preventScroll:true});
}
const workplaceFor=s=>s.working?(workplaceScenes[s.workplace]??workplaceScenes.shop):null;
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
const workDistrict={office:'guild',factory:'guild',shop:'market',hospital:'square',realtor:'square',civic:'square',school:'square'};
const errandDistrict={bakery:'waterfront',bank:'square',realtor:'square',city_hall:'square',car_lot:'market'};
const workDoor={hospital:.14,school:.48,office:.69,factory:.50,shop:.52};
const doors={
  waterfront:[{x:.13,name:'Waterfront cottages',stops:['home']},{x:.523,name:'Maple Bakery',stops:['bakery']}],
  market:[{x:.13,name:'Market Lane homes',stops:['home']},{x:workDoor.shop,name:'Market Shop',stops:['shop']}],
  guild:[{x:.13,name:'Guild Row homes',stops:['home']},{x:workDoor.factory,name:'Workshop',stops:['factory']},{x:workDoor.office,name:'Guildhall',stops:['office']}],
  square:[{x:workDoor.hospital,name:'Infirmary',stops:['hospital']},{x:workDoor.school,name:'Schoolhouse',stops:['school']},{x:.70,name:'Civic Hall',stops:['bank','realtor','city_hall','civic']}],
};
const homeDistrict=sim=>districtKeys[hash(sim.id)%districtKeys.length];
function streetJourney(sim,p){
  const [activity,progress]=routine(sim,p);
  const home=homeDistrict(sim);
  const work=sim.working?(workDistrict[sim.workplace]??'market'):home;
  const stop=destinationFor(sim);
  const errand=errandDistrict[stop]??work;
  const legs={commute:[home,work],outbound:[work,errand],returning:[errand,home]};
  const leg=legs[activity];
  const district=leg?leg[progress<.5?0:1]:activity==='home'?home:activity==='errand'?errand:work;
  const inside=activity==='home'||activity==='work'||(activity==='errand'&&Boolean(stop));
  return {activity,progress,district,inside,leg};
}
function streetActivity(person,activity,p){
  const stop=destinationFor(person);
  const destination=interiors[stop]?.name??'the neighborhood';
  const workplace=workplaceFor(person)?.name;
  const actions={home:p<.5?'At home · A quiet morning':'At home · Winding down',commute:workplace?'Heading to '+workplace:'Heading out',work:'Working at '+workplace,outside:'Out in town',outbound:'Heading to '+destination,errand:'At '+destination,returning:'Heading home'};
  const recorded=(activity==='outbound'||activity==='errand')&&person.move&&person.errand&&stop;
  return {description:actions[activity],move:recorded?person.move:null};
}

const districtPins=new Map();
for(const [id,district] of Object.entries(districts)){
  const button=element('button',null,'district-pin');
  const tip=element('span',null,'district-tip');
  button.type='button';
  button.dataset.district=id;
  tip.setAttribute('aria-hidden','true');
  button.append(tip);
  button.onclick=()=>{
    if(inspectedStreet!==id)rosterExpanded=false;
    inspectedStreet=id;
    inspectorOpen=true;
    if(!$('world').hidden)setWorld(false,false);
    place=null;view='street';
    renderPanels();
  };
  $('district-pins').append(button);
  districtPins.set(id,{button,tip});
}
function updateDistrictPanel(snapshot,p){
  const panel=$('district-panel');
  if(panel.hidden)return;
  const entries=snapshot.streets[inspectedStreet];
  const shown=rosterExpanded?entries:entries.slice(0,6);
  const inside=entries.filter(entry=>entry.journey.inside).length;
  const key=JSON.stringify([snapshot.month,inspectedStreet,entries.length,inside,rosterExpanded,
    shown.map(({sim,journey})=>[sim.id,journey.activity,sim.move,p<.5])]);
  if(key===districtPanelKey)return;
  districtPanelKey=key;
  renderPanel(panel,body=>{
    const title=element('h2',districts[inspectedStreet].name);
    const close=element('button','Close');
    close.dataset.focusKey='district-close';
    close.onclick=()=>{inspectorOpen=false;renderPanels();districtPins.get(inspectedStreet).button.focus();};
    const header=element('div',null,'panel-heading');
    header.append(title,close);
    const enter=element('button','Zoom to street →','district-enter');
    enter.dataset.focusKey='district-enter';
    enter.onclick=()=>{
      activeStreet=inspectedStreet;
      if(!get()||streetJourney(get(),Number($('day').value)).district!==activeStreet)leaveFollow(false);
      streetCamera.pan=null;
      switchMap(true);
      $('overview').focus({preventScroll:true});
    };
    body.append(header,element('p',entries.length+' here now · '+inside+' indoors'),enter,element('h3','Who’s here'));
    if(!entries.length)body.append(element('p','This street is quiet right now.'));
    const list=element('ul',null,'list district-roster');
    for(const {sim,journey} of shown){
      const row=element('li');
      const activity=streetActivity(sim,journey.activity,p);
      const button=residentButton(sim,sim.name);
      button.setAttribute('aria-label','Follow '+sim.name+' · '+activity.description);
      const description=activity.description+(activity.move?' · Recorded move: '+moveName(activity.move):'');
      button.append(element('small',description));
      button.onclick=()=>{
        activeStreet=inspectedStreet;
        switchMap(true);
        choose(sim.id);
        if(!following)toggleFollow();
      };
      row.append(button);list.append(row);
    }
    body.append(list);
    if(entries.length>6){
      const more=element('button',rosterExpanded?'Show fewer':'Show everyone ('+entries.length+')');
      more.dataset.focusKey='district-more';
      more.onclick=()=>{rosterExpanded=!rosterExpanded;updateDistrictPanel(snapshot,p);};
      body.append(more);
    }
  },districtPins.get(inspectedStreet).button);
}
function updateDistrictSnapshot(p,minute){
  if(!districtSnapshot||districtSnapshot.month!==frame.month||districtSnapshot.minute!==minute){
    const streets=Object.fromEntries(districtKeys.map(id=>[id,[]]));
    for(const sim of frame.sims){
      const journey=streetJourney(sim,p);
      streets[journey.district].push({sim,journey});
    }
    districtSnapshot={month:frame.month,minute,streets};
  }
}
function drawDistrictOverview(focus,p,w,h){
  const artwork=sceneArt('town-overview','jpg');
  const mapPins=$('district-pins');
  if(!ready(artwork)){
    mapPins.hidden=true;
    ctx.resetTransform();
    draw(ctx,0,0,w,h,'#171e35');
    return;
  }
  const scale=Math.min(w/artwork.width,h/artwork.height);
  const width=artwork.width*scale,height=artwork.height*scale;
  const x=(w-width)/2,y=(h-height)/2;
  ctx.resetTransform();
  draw(ctx,0,0,w,h,'#171e35');
  ctx.drawImage(artwork,x,y,width,height);
  mapPins.hidden=false;
  const followed=focus&&following?streetJourney(focus,p).district:null;
  for(const [id,{button,tip}] of districtPins){
    const district=districts[id];
    const count=districtSnapshot.streets[id].length;
    const hint=district.name+' · '+count+' here now'+(id===followed?' · Following '+focus.name:'');
    button.style.left=x+width*district.x+'px';
    button.style.top=y+height*district.y+'px';
    button.setAttribute('aria-pressed',String(inspectorOpen&&id===inspectedStreet));
    button.classList.toggle('followed',id===followed);
    if(tip.textContent!==hint){tip.textContent=hint;button.setAttribute('aria-label',hint);}
  }
  updateDistrictPanel(districtSnapshot,p);
}
function startStreet(){
  if(!frame?.sims.length)return;
  sceneArt('cottage');
  const person=get()??frame.sims.find(s=>lookIndex(s.id)===0&&destinationFor(s)==='bakery'&&s.working)??frame.sims.find(s=>lookIndex(s.id)===0)??frame.sims.find(s=>s.errand&&s.working)??frame.sims[0];
  selected=person.id;place=null;view='street';following=true;
  updateCameraControls();renderPanels();
}
const interiors={
  home:{name:'Home',wall:'#dfbd91',trim:'#774935',counter:'Hearth',shelf:'#b68154'},
  bakery:{name:'Maple Bakery',wall:'#e6b998',trim:'#a34835',counter:'Pastries',shelf:'#d99148'},
  bank:{name:'Counting House',wall:'#c2ccb0',trim:'#426952',counter:'Clerk',shelf:'#a7a168'},
  realtor:{name:'Land Office',wall:'#e1cfaa',trim:'#835840',counter:'Listings',shelf:'#b88461'},
  car_lot:{name:'Carriage Yard',wall:'#c1cbd1',trim:'#485970',counter:'Sales desk',shelf:'#7097b2'},
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
  const travel=acrossFloor<1?(leaving?1-acrossFloor:acrossFloor):null;
  const transition=1-clamp(edge/.06,0,1);
  const workplace=workplaceScenes[placeKey];
  const idlePeriod=atHome ? 7200 : workplace ? 4400 : 5600;
  const idleTime=(clock+hash(person.id)%1200)%idlePeriod;
  const lean=workplace ? .055 : placeKey==='bakery' ? -.04 : .025;
  const shift=animated&&travel===null&&idleTime<1000
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
    const stride=walkPhaseFor(person,travel===null?null:travel*Math.hypot(width*(standingX-.16),height*.09),height*.23);
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
  drawPerson(person,120,y,32,walkPhaseFor(person,travel===null?null:travel*31,32),true,leaving?-1:1,shift);
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
function doorwayVisibility(activity,t,working){
  if(activity==='outside')return 1;
  if(activity==='home'||activity==='work'||activity==='errand')return 0;
  const entering=activity!=='outbound'||working;
  const exiting=activity!=='commute'||working;
  return clamp(Math.min(entering?t/.09:1,exiting?(1-t)/.09:1),0,1);
}
function streetPosition(person,p,aspect){
  const journey=streetJourney(person,p);
  const {activity,leg}=journey;
  let {progress}=journey;
  const lane=(hash(person.id)%9)*.008;
  const destination=destinationFor(person);
  const home=homeDistrict(person)==='square'?.045:.13;
  const work=person.working?(workDoor[person.workplace]??.70):.78;
  const errand=destination==='bakery'?.523:destination==='car_lot'?.95:destination?.70:.58;
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
  let distance=null;
  if(walking){
    let [from,fromY,to,toY]=routes[activity];
    if(leg[0]!==leg[1]){
      const exit=districts[leg[1]].x>districts[leg[0]].x?.99:.01;
      if(progress<.5){
        progress*=2;
        to=exit;toY=sidewalk;
      }else{
        progress=(progress-.5)*2;
        from=1-exit;fromY=sidewalk;
      }
    }
    const across=clamp((progress-.16)/.68,0,1);
    x=from+(to-from)*across;
    y=progress<.16?fromY+(sidewalk-fromY)*progress/.16
      :sidewalk+(toY-sidewalk)*clamp((progress-.84)/.16,0,1);
    facing=to<from?-1:1;
    if(progress<.16){
      if(fromY!==sidewalk)distance=Math.abs(y-fromY);
    }else if(progress<=.84||toY!==sidewalk){
      distance=Math.abs(sidewalk-fromY)+Math.abs(x-from)*aspect+Math.abs(y-sidewalk);
    }
  }
  return {x,y,visibility:doorwayVisibility(activity,journey.progress,person.working),facing,distance};
}
function drawPerson(person,x,y,height,walkPhase,focused,facing=1,lean=0){
  const sprite=appearance(person.id);
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
  drawPose(person.id,sprite,height,walkPhase);
  ctx.restore();
}
function drawPose(id,sprite,height,walkPhase){
  if(walkPhase!==null){
    const look=lookIndex(id);
    if(ready(walkArt)){
      const cellWidth=walkArt.naturalWidth/walkPoses,cellHeight=walkArt.naturalHeight/castSize;
      const pose=Math.floor(walkPhase*walkPoses)%walkPoses;
      const width=Math.round(height*cellWidth/cellHeight);
      ctx.drawImage(walkArt,pose*cellWidth,look*cellHeight,cellWidth,cellHeight,-Math.round(width/2),0,width,Math.round(height));
      return;
    }
    if(look===0&&redCoatFrames.length===9){
      sprite=redCoatFrames[Math.floor(walkPhase*8)%8];
    }
  }
  const width=Math.round(height*sprite.width/sprite.height);
  ctx.drawImage(sprite,-Math.round(width/2),0,width,Math.round(height));
}

function drawStreet(focus,p,w,h){
  const district=districts[activeStreet];
  const day=district.art?sceneArt(district.art,'jpg'):streetArt.day;
  const night=district.art?day:streetArt.evening;
  if(!ready(day)){
    ctx.resetTransform();
    draw(ctx,0,0,w,h,'#171e35');
    ctx.fillStyle='#f4dfba';
    ctx.font='600 14px system-ui';
    ctx.textAlign='center';
    ctx.fillText((day.complete?'Street artwork unavailable · ':'Entering ')+district.name,w/2,h/2);
    hits=[];scene=null;
    return true;
  }
  const tone=eveningAmount(p);
  const aspect=day.width/day.height;
  const localFocus=focus&&streetJourney(focus,p).district===activeStreet?focus:null;
  const point=localFocus&&streetPosition(localFocus,p,aspect);
  const scale=Math.max(w/day.width,h/day.height)*streetCamera.zoom/streetFitZoom;
  const width=day.width*scale,height=day.height*scale;
  const target=streetCamera.pan??(following?point?.x:.5)??.5;
  const x=width<=w?(w-width)/2:clamp(w*.5-width*target,w-width,0);
  const y=height<=h?(h-height)/2:clamp(h*.76-height*.77,h-height,0);
  scene={x,y,width,height};
  ctx.resetTransform();ctx.imageSmoothingEnabled=false;
  ctx.drawImage(day,x,y,width,height);
  if(tone>0){
    if(night!==day&&ready(night)){ctx.globalAlpha=tone;ctx.drawImage(night,x,y,width,height);ctx.globalAlpha=1;}
    else{ctx.globalAlpha=tone*.36;draw(ctx,x,y,width,height,'#1b2655');ctx.globalAlpha=1;}
  }
  const looks=new Set(localFocus?[lookIndex(localFocus.id)]:[]);
  const cast=localFocus?[localFocus]:[];
  for(const {sim,journey} of districtSnapshot.streets[activeStreet]){
    const look=lookIndex(sim.id);
    if(journey.inside||looks.has(look)||streetJourney(sim,p).district!==activeStreet)continue;
    cast.push(sim);looks.add(look);
    if(looks.size===6)break;
  }
  const heightOfPerson=clamp(height*.105,43,100);
  hits=cast.map(sim=>{
    const pt=sim===localFocus?point:streetPosition(sim,p,aspect);
    return {sim,sx:x+pt.x*width,sy:y+pt.y*height,distance:pt.distance,facing:pt.facing,height:heightOfPerson,opacity:sim===localFocus?1:pt.visibility};
  }).filter(hit=>hit.opacity>0&&hit.sx>-50&&hit.sx<w+50&&hit.sy>0&&hit.sy<h).sort((a,b)=>a.sy-b.sy);
  const pointed=hover&&nearest(hover.x,hover.y)?.sim;
  for(const {sim,sx,sy,distance,facing,opacity} of hits){
    ctx.globalAlpha=opacity;
    const stride=walkPhaseFor(sim,distance,.105);
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
  if(streetMode&&focus&&following&&!reducedMotion.matches){
    const [activity,progress]=routine(focus,p);
    const hasErrand=Boolean(destinationFor(focus));
    const atDeparture=activity==='commute'||(activity==='outbound'&&focus.working)||(activity==='returning'&&hasErrand);
    const atArrival=activity==='returning'||(activity==='commute'&&focus.working)||(activity==='outbound'&&hasErrand);
    const leg=streetJourney(focus,p).leg;
    const crossing=leg&&leg[0]!==leg[1]?Math.abs(progress-.5):1;
    const edge=Math.min(atDeparture?progress:1,atArrival?1-progress:1,crossing);
    shadeDoorway(w,h,1-clamp(edge/.06,0,1));
  }
  return true;
}
function showStory(person,p){
  const box=$('street-story');
  box.hidden=!person||!streetMode;
  if(box.hidden)return;
  const {district,activity}=streetJourney(person,p);
  const {description,move}=district===activeStreet?streetActivity(person,activity,p):{description:null,move:null};
  const message=description
    ?districts[district].name+' · '+description+(move?' · Recorded move: '+moveName(move):' · Ambient routine')
    :'Currently in '+districts[district].name;
  const key=frame.month+':'+person.id+':'+following+':'+message;
  if(key===storyText)return;
  storyText=key;
  const inspect=$('street-resident');
  inspect.textContent=person.name;
  inspect.setAttribute('aria-label','Open '+person.name+'’s profile');
  inspect.onclick=()=>choose(person.id);
  $('street-follow').textContent=following?'Stop following':'Follow';
  $('street-activity').textContent=message;
  const link=$('street-decision');
  link.hidden=!move;
  if(move)link.href=decisionHash(person.id,frame.month);
}
function walkPhaseFor(sim,distance,height){
  return distance==null||reducedMotion.matches?null
    :distance/(height*walkCycleLength)+(hash(sim.id)%60)/60;
}
$('street-follow').onclick=toggleFollow;
function displayFrame(next){
  const newMonth=next.month!==frame?.month;
  frame=next;
  if(!newMonth)return;
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
    const sharedMonthChanged=next.month!==liveFrame?.month;
    if(sharedMonthChanged)liveProgress=0;
    liveFrame=next;
    const reconnected=connection!=='live';
    connection='live';
    if(!frame||localProgress===null)displayFrame(next);
    if(sharedMonthChanged&&historyDisclosure?.details.isConnected)historyDisclosure.refresh();
    if(reconnected&&!$('world').hidden)renderWorld();
  }catch{
    if(connection!=='offline'){connection='offline';if(!$('world').hidden)renderWorld();}
    phaseStatus.textContent='Reconnecting…';
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
    $('market').textContent=frame.sims.length+' residents · '+marketName(frame.market)+' · '+loanName()+' rate '+percent(frame.rate);
    const period=p<.30?'Morning':p<.48?'Midday':p<.78?'Afternoon':p<1?'Evening'
      :localProgress===null?'Waiting for next month':'End of this day';
    const status=connection==='offline'?'Reconnecting…':(paused?'Paused · ':'')+period;
    if(phaseStatus.textContent!==status)phaseStatus.textContent=status;
    if(Date.now()-lastPoll>(live===1?4000:12000))poll();
    const w=Math.max(1,canvas.clientWidth), h=Math.max(1,canvas.clientHeight);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const focus=get();
    updateDistrictSnapshot(p,minutes);
    if(focus&&following)activeStreet=streetJourney(focus,p).district;
    const streetName=$('street-name');
    streetName.hidden=!streetMode;
    if(streetName.textContent!==districts[activeStreet].name)streetName.textContent=districts[activeStreet].name;
    showStory(focus,p);
    if(!streetMode){
      $('inside').hidden=true;
      drawDistrictOverview(focus,p,w,h);
      requestAnimationFrame(drawFrame);
      return;
    }
    $('district-pins').hidden=true;
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
    drawStreet(focus,p,w,h);
  }
  requestAnimationFrame(drawFrame);
}

const outfits=new Map();
const lookIndex=id=>hash(id+'portrait')%castSize;
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
  let closest=null,distance=9;
  for(const hit of hits){
    const d=Math.hypot(hit.sx-x,hit.sy-hit.height*.46-y);
    if(d<(closest?distance:Math.max(distance,(hit.height??0)*.35))){closest=hit;distance=d;}
  }
  return closest;
}
function leaveFollow(refresh=true){
  if(!following)return;
  if(scene)streetCamera.pan=(canvas.clientWidth*.5-scene.x)/scene.width;
  following=false;
  if(refresh)renderPanels();
}
function updateCameraControls(){
  const fit=streetFitZoom;
  $('zoom-level').value=interiorOpen?'Fit':Number((streetCamera.zoom/fit).toFixed(1))+'×';
  $('zoom-out').disabled=interiorOpen||streetCamera.zoom<=fit;
  $('zoom-in').disabled=interiorOpen||streetCamera.zoom>=maxZoom();
  for(const id of ['zoom-out','zoom-in','zoom-level'])$(id).hidden=!streetMode;
  canvas.setAttribute('aria-label',!streetMode?'Town overview. Use the street pins to explore.'
    :interiorOpen?'Interior scene. Use Step outside to return to the street.'
      :'Town street. Use left and right arrows to pan, and plus or minus to zoom.');
}
const maxZoom=()=>streetFitZoom*2;
function zoom(factor){
  if(interiorOpen||!streetMode)return;
  const old=streetCamera.zoom;
  streetCamera.zoom=clamp(old*factor,streetFitZoom,maxZoom());updateCameraControls();

}
const coords=event=>{
  const r=canvas.getBoundingClientRect();
  return {x:event.clientX-r.left,y:event.clientY-r.top};
};
canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(clamp(-event.deltaY*.002,-.5,.5)));},{passive:false});
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||drag||!streetMode||interiorOpen)return;
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
  if(scene){streetCamera.pan=clamp((streetCamera.pan??(canvas.clientWidth*.5-scene.x)/scene.width)-dx/scene.width,0,1);drag={...point,id:drag.id,moving:true};return;}
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
      const door=py>.46&&py<.74&&doors[activeStreet].find(entry=>Math.abs(entry.x-px)<.055);
      if(door){
        place=door;
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
  scene=null;
  hover=null;
  hits=[];
  interiorOpen=false;
  $('inside').hidden=true;
  $('street').setAttribute('aria-pressed',String(showStreet));
  $('overview').setAttribute('aria-pressed',String(!showStreet));
  updateCameraControls();
  place=null;
  districtPanelKey=undefined;
  renderPanels();
}
$('street').onclick=()=>switchMap(true);
$('overview').onclick=()=>switchMap(false);
canvas.addEventListener('keydown',event=>{
  if(!streetMode||interiorOpen)return;
  if(event.key==='+'||event.key==='=')zoom(1.4);
  else if(event.key==='-')zoom(1/1.4);
  else {
    const delta={ArrowLeft:-1,ArrowRight:1}[event.key];
    if(!delta||!scene)return;
    leaveFollow();
    streetCamera.pan=clamp((streetCamera.pan??(canvas.clientWidth*.5-scene.x)/scene.width)+delta*65/scene.width,0,1);
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
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||decisionDialog.open)return;
  if(!$('world').hidden)setWorld(false);
  else if(document.activeElement.closest('#resident, #place'))document.activeElement.closest('aside').querySelector('[data-focus-key=close]')?.click();
  else if(document.activeElement===canvas)$('overview').click();});
setInterval(()=>{if(Date.now()-lastPoll>12000)poll();},4000);
poll();showLinkedDecision();requestAnimationFrame(drawFrame);
