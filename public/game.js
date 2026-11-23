'use strict';

const $=id=>document.getElementById(id);
const modeNames={solo:'Tek kişilik',split:'Bölünmüş ekran',online:'Çevrimiçi'};
const hints={
  solo:'Üç bot pilota karşı yarış. Her biri kendi aracını ve rotasını seçer.',
  split:'İki oyuncu, tek klavye. Her oyuncunun kendi aracı, kamerası ve nitrosu var.',
  online:'Bir oda kur veya arkadaşının 6 haneli koduyla katıl. Pisti oda sahibi seçer.'
};
let prefs={mode:'solo',track:0,cars:[0,1],names:['Pilot 1','Pilot 2']};
try {
  const p=JSON.parse(localStorage.getItem('turbo-duello-garaj') || '{}');
  if(Object.hasOwn(modeNames,p.mode))prefs.mode=p.mode;
  prefs.track=Race.validIndex(p.track,Race.tracks);
  for(let i=0;i<2;i++){
    if(Number.isInteger(p.cars?.[i]))prefs.cars[i]=Race.validIndex(p.cars[i],Race.cars);
    if(typeof p.names?.[i]==='string' && p.names[i].trim())prefs.names[i]=p.names[i].slice(0,16);
  }
} catch {}
const save=()=>{try{localStorage.setItem('turbo-duello-garaj',JSON.stringify(prefs));}catch{}};
const keyState=[Race.inputs(),Race.inputs()];
let editSeat=0,mode='',race=null,paused=false,busy=false,disconnected=false;
let socket=null,myId=0,hostId=0,roomCode='',notice='',views=[],previous=null,stateAt=0;
let lastFrame=0,remainder=0,lastHud=0,lastSent='',lastSentAt=0,menuFrame=0,lastOverlay='';
let overClick=null,paintKey='';
function message(text=''){$('error').textContent=text;$('error').hidden=!text;}
function makeButton(text,fn){
  const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=fn;return button;
}
function makeMenu(){
  Race.cars.forEach((car,i)=>{
    const b=makeButton(car.name,()=>{prefs.cars[editSeat]=i;updateMenu();});
    b.style.setProperty('--paint',car.color);b.dataset.car=i;$('cars').append(b);
  });
  Race.tracks.forEach((t,i)=>{
    const b=makeButton('',()=>{prefs.track=i;updateMenu();});b.dataset.track=i;
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
    const box=document.createElement('span');box.className='tracktext';
    const title=document.createElement('strong');title.textContent=t.name;
    const desc=document.createElement('small');desc.textContent=t.laps?t.laps+' tur × '+distance(t.length):distance(t.length)+' · '+t.roads.length+' yol';
    box.append(title,desc);b.append(canvas,box);$('tracks').append(b);
  });
  $('name').value=prefs.names[0];$('name2').value=prefs.names[1];
  for(const [index,id] of ['name','name2'].entries())$(id).oninput=()=>{prefs.names[index]=$(id).value;save();};
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
    if(busy)disconnect();
    prefs.mode=b.dataset.mode;editSeat=0;message();updateMenu();
  });
  document.querySelectorAll('[data-seat]').forEach(b=>b.onclick=()=>{editSeat=Number(b.dataset.seat);updateMenu();});
  updateMenu();
}
function distance(m){return (m/1000).toLocaleString('tr-TR',{maximumFractionDigits:2})+' km';}
function menuArt(){
  if(menuFrame)return;
  menuFrame=requestAnimationFrame(()=>{
    menuFrame=0;if($('menu').hidden)return;
    Scene.garage($('garageArt'),prefs.cars[editSeat]);
    [...$('tracks').querySelectorAll('canvas')].forEach((canvas,i)=>Scene.preview(canvas,i));
  });
}
function updateMenu(){
  const split=prefs.mode==='split',online=prefs.mode==='online',car=Race.cars[prefs.cars[editSeat]],track=Race.trackOf(prefs.track);
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===prefs.mode)));
  document.querySelectorAll('[data-car]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.car)===prefs.cars[editSeat])));
  document.querySelectorAll('[data-track]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.track)===prefs.track)));
  document.querySelectorAll('[data-seat]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.seat)===editSeat)));
  $('secondName').hidden=$('seatSwitch').hidden=!split;$('joinForm').hidden=!online;
  $('nameLabel').textContent=split?'1. oyuncunun adı':'Pilot adı';
  $('carType').textContent=car.type;$('carName').textContent=car.name;$('top').textContent=car.top;$('accel').textContent=car.accel.toLocaleString('tr-TR');
  $('modeInfo').textContent=hints[prefs.mode];$('trackInfo').textContent=track.laps?'Grand Prix · '+track.laps+' tur · '+distance(Race.total(track)):track.roads.length+' alternatif güzergâh';
  $('summary').textContent=split ? Race.cars[prefs.cars[0]].name+' / '+Race.cars[prefs.cars[1]].name+' · '+track.name : car.name+' · '+track.name;
  $('play').firstChild.textContent=online?'Oda oluştur ':'Yarışa başla ';
  save();menuArt();
}
function clearKeys(){
  for(const k of keyState)for(const name of Object.keys(k))k[name]=false;
  sendInput(true);
}
const held=new Set(),touchKeys=new Set();
function release(){held.clear();touchKeys.clear();touches.clear();clearKeys();}
function collectKeys(){
  const has=(...codes)=>codes.some(c=>held.has(c));
  const a=keyState[0],b=keyState[1],split=mode==='split';
  a.up=has('KeyW')||(!split&&has('ArrowUp'))||touchKeys.has('up');
  a.down=has('KeyS')||(!split&&has('ArrowDown'))||touchKeys.has('down');
  a.left=has('KeyA')||(!split&&has('ArrowLeft'))||touchKeys.has('left');
  a.right=has('KeyD')||(!split&&has('ArrowRight'))||touchKeys.has('right');
  a.boost=has('ShiftLeft')||(!split&&has('ShiftRight'))||touchKeys.has('boost');
  b.up=has('ArrowUp');b.down=has('ArrowDown');b.left=has('ArrowLeft');b.right=has('ArrowRight');b.boost=has('Enter','NumpadEnter','ShiftRight');
  sendInput();
}
const drivingKeys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Enter','NumpadEnter'];
window.addEventListener('keydown',e=>{
  if(!mode || $('guide').open || disconnected || !race)return;
  if(e.code==='Escape' && mode!=='online' && !e.repeat){e.preventDefault();togglePause();return;}
  if(!drivingKeys.includes(e.code) || paused || !['countdown','racing'].includes(race.status))return;
  e.preventDefault();held.add(e.code);collectKeys();
});
window.addEventListener('keyup',e=>{if(held.delete(e.code)){e.preventDefault();collectKeys();}});
window.addEventListener('blur',release);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){release();if(mode && mode!=='online' && !paused && ['countdown','racing'].includes(race?.status))togglePause();}
});
const touches=new Map();
for(const b of document.querySelectorAll('[data-key]')){
  b.onpointerdown=e=>{
    e.preventDefault();b.setPointerCapture(e.pointerId);touches.set(e.pointerId,b.dataset.key);touchKeys.add(b.dataset.key);collectKeys();
  };
  const end=e=>{touches.delete(e.pointerId);touchKeys.clear();for(const k of touches.values())touchKeys.add(k);collectKeys();};
  b.onpointerup=b.onpointercancel=b.onlostpointercapture=end;
}
function pilots(){
  const a={id:0,name:prefs.names[0],car:prefs.cars[0]};
  if(mode==='split')return [a,{id:1,name:prefs.names[1],car:prefs.cars[1]}];
  return [a,...['Ada','Bora','Ekin'].map((name,i)=>({id:i+1,name,car:(a.car+i+1)%Race.cars.length,bot:true}))];
}
function startLocal(){
  mode=prefs.mode;myId=0;paused=false;disconnected=false;notice='';previous=null;
  race=Race.newRace(prefs.track,pilots());enterRace();
}
function restart(){
  if(mode==='online'){emit('start');return;}
  release();paused=false;previous=null;race=Race.newRace(prefs.track,pilots());
  remainder=0;lastFrame=performance.now();lastOverlay='';refresh();
}
function timeText(time){return Race.formatTime(time);}
function makeView(id){
  const node=document.createElement('div');node.className='view';
  node.innerHTML='<canvas class="world" aria-label="Pist ve araçlar"></canvas><div class="hudTop"><strong></strong><span></span><small class="lapHud" hidden></small></div><canvas class="map" width="160" height="110" aria-label="Güzergâh haritası"></canvas><div class="dial"><strong>0</strong><small>km/sa</small></div><div class="boost"><small>NİTRO <b class="fuel">0%</b></small><meter min="0" max="100" value="0" aria-label="Nitro seviyesi"></meter><span class="pickupGain" hidden></span></div><div class="routeHint"></div>';
  $('views').append(node);
  return {id,node,canvas:node.querySelector('.world'),name:node.querySelector('.hudTop strong'),place:node.querySelector('.hudTop span'),lap:node.querySelector('.lapHud'),fuel:node.querySelector('.fuel'),gain:node.querySelector('.pickupGain'),speed:node.querySelector('.dial strong'),meter:node.querySelector('meter'),map:node.querySelector('.map'),route:node.querySelector('.routeHint'),routeKey:''};
}
function enterRace(){
  document.activeElement?.blur?.();release();lastOverlay='';paintKey='';remainder=0;lastFrame=performance.now();lastHud=0;
  $('menu').hidden=true;$('game').hidden=false;document.body.classList.add('inrace');
  $('full').hidden=!document.fullscreenEnabled;$('room').hidden=mode!=='online';$('pause').hidden=mode==='online';
  $('raceMode').textContent=modeNames[mode];$('views').classList.toggle('split',mode==='split');
  $('views').replaceChildren();views=mode==='split'?[makeView(0),makeView(1)]:[makeView(myId)];
  $('controlHint').textContent=mode==='split'?'1P · WASD / sol Shift     •     2P · Yön tuşları / Enter':'WASD veya yön tuşları · Shift ile nitro';
  if(mode==='online')$('room').textContent='Oda '+roomCode+' ⧉';
  touchVisibility();message();refresh();
  $('game').scrollIntoView({block:'nearest'});
}
function touchVisibility(){
  $('touch').hidden=mode==='split'||!mode||!(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);
}
function showMenu(){
  release();disconnect();mode='';race=null;previous=null;views=[];paused=false;disconnected=false;notice='';
  $('game').hidden=true;$('menu').hidden=false;$('full').hidden=true;document.body.classList.remove('inrace');
  $('views').replaceChildren();message();updateMenu();
  if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
  window.scrollTo(0,0);
}
function togglePause(){
  if(!race || mode==='online' || !['racing','countdown'].includes(race.status))return;
  release();paused=!paused;remainder=0;lastFrame=performance.now();refresh();
}
function setBusy(value){
  busy=value;$('play').disabled=$('join').disabled=value;
}
function disconnect(){
  const old=socket;socket=null;setBusy(false);
  if(old){if(old.readyState===WebSocket.OPEN)old.send(JSON.stringify({type:'leave'}));old.close();}
  roomCode='';lastSent='';
}
function emit(type,extra={}){
  if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type,...extra}));
}
function sendInput(force=false){
  if(mode!=='online'||!race||!['countdown','racing'].includes(race.status)||socket?.readyState!==WebSocket.OPEN)return;
  const now=performance.now(),serialized=JSON.stringify(keyState[0]);
  if(force||lastSent!==serialized||now-lastSentAt>400){
    emit('input',{keys:keyState[0]});lastSent=serialized;lastSentAt=now;
  }
}
function online(action){
  if(busy)return;
  const code=$('code').value.trim();
  if(action==='join'&&!/^[0-9]{6}$/.test(code)){message('6 haneli oda kodunu gir.');return;}
  disconnect();setBusy(true);message();
  const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);socket=ws;
  const timeout=setTimeout(()=>{if(socket===ws && busy){disconnect();message('Bağlantı zaman aşımına uğradı. Tekrar dene.');}},18000);
  ws.onopen=()=>{if(ws===socket) emit(action,{version:2,name:prefs.names[0],car:prefs.cars[0],track:prefs.track,code});};
  ws.onmessage=e=>{
    if(ws!==socket)return;
    let m;try{m=JSON.parse(e.data);}catch{return;}
    if(m.type==='error'){clearTimeout(timeout);disconnect();message(m.message);return;}
    if(m.type==='notice'){notice=m.message;return;}
    if(m.type==='joined'){myId=m.id;roomCode=m.code;return;}
    if(m.type!=='state')return;
    clearTimeout(timeout);setBusy(false);hostId=m.hostId;
    const fresh=mode!=='online';
    if(fresh){mode='online';paused=false;disconnected=false;notice='';}
    previous=!fresh&&m.status==='racing'&&race?.status==='racing'?race:null;
    race=m;stateAt=performance.now();
    if(race.players.length===2)notice='';
    if(fresh||views[0]?.id!==myId)enterRace();else refresh();
  };
  ws.onerror=()=>{if(socket===ws&&!mode)message('Sunucuya bağlanılamadı. Tekrar dene.');};
  ws.onclose=()=>{
    clearTimeout(timeout);if(ws!==socket)return;setBusy(false);socket=null;
    if(mode==='online'){disconnected=true;release();refresh();}
    else message('Bağlantı kurulamadı. Tekrar dene.');
  };
}
function interpolated(now){
  if(!previous||mode!=='online'||race.status!=='racing')return race;
  const alpha=Race.clamp((now-stateAt)/50,0,1);
  return {...race,players:race.players.map(p=>{
    const old=previous.players.find(v=>v.id===p.id);
    if(!old||old.gate!==p.gate||old.route!==p.route||p.done)return p;
    return {...p,d:old.d+(p.d-old.d)*alpha,x:old.x+(p.x-old.x)*alpha,
      heading:(old.heading||0)+((p.heading||0)-(old.heading||0))*alpha,
      frontAngle:(old.frontAngle||0)+((p.frontAngle||0)-(old.frontAngle||0))*alpha};
  })};
}
function overlay(key,label,title,text,action,fn,back=false,displayResults=false){
  if(key===lastOverlay)return;lastOverlay=key;
  $('overlay').hidden=!key;if(!key)return;
  $('overLabel').textContent=label;$('overTitle').textContent=title;$('overText').textContent=text;
  $('overAction').hidden=!action;$('overAction').textContent=action||'';overClick=fn;$('back').hidden=!back;
  $('results').hidden=!displayResults;
  if(displayResults){
    $('results').replaceChildren();
    Race.order(race).forEach(p=>{
      const li=document.createElement('li'),n=document.createElement('span'),s=document.createElement('b');
      n.textContent=p.rank+'. '+p.name+(p.bot?' · Bot':'');s.textContent=timeText(p.time)+(Race.trackOf(race.track).laps && p.bestLap?' · En iyi '+timeText(p.bestLap):'');
      li.append(n,s);$('results').append(li);
    });
  }
}
function refresh(){
  if(!race)return;
  const track=Race.trackOf(race.track);$('raceTrack').textContent=track.name;
  $('pause').textContent=paused?'Devam et':'Duraklat';
  if(disconnected){overlay('lost','ÇEVRİMİÇİ','Bağlantı kesildi','Yeni bir oda kurabilir veya kodla tekrar katılabilirsin.','Garaja dön',showMenu);return;}
  if(paused){overlay('paused',modeNames[mode],'Yarış duraklatıldı','Hazır olduğunda kaldığın yerden devam et.','Devam et',togglePause,true);return;}
  if(race.status==='waiting'){
    const two=race.players.length===2,host=myId===hostId;
    overlay('wait'+roomCode+two+host+notice,'ODA '+roomCode,two?'İki pilot hazır':'Rakip bekleniyor',two?(host?'İkiniz de hazırsanız startı ver.':'Oda sahibi yarışı başlatacak.'):(notice||'Arkadaşın çevrimiçi modda oda kodunu girerek katılabilir.'),two&&host?'Yarışı başlat':'',()=>emit('start'));return;
  }
  if(race.status==='countdown'){
    const n=Math.max(1,Math.ceil(race.countdown-.00001));
    overlay('count'+n,track.name,''+n,'Start için gazı basılı tut.');return;
  }
  if(race.status==='finished'){
    const win=Race.order(race)[0],can=mode!=='online'||myId===hostId;
    overlay('end'+win.id,track.name,win.name+' kazandı',can?'Yarış sonuçları':'Rövanşı oda sahibi başlatabilir.',can?'Tekrar yarış':'',restart,true,true);return;
  }
  overlay('',null,null,null);
}
const mapCache=new Map();
function mapData(t){
  if(mapCache.has(t))return mapCache.get(t);
  const points=[];
  const add=(start,end,route,gate)=>{
    const part=[],count=Math.max(1,Math.ceil((end-start)/12));
    for(let i=0;i<=count;i++){
      const d=start+(end-start)*i/count,q=Race.sample(t,d,route,gate);
      part.push([q.x,q.z]);
    }
    points.push(part);
  };
  let last=0;
  t.gates.forEach(([start,end],g)=>{add(last,start,-1,-1);for(let k=0;k<t.roads.length;k++)add(start,end,k,g);last=end;});add(last,t.length,-1,-1);
  const all=points.flat(),xs=all.map(p=>p[0]),zs=all.map(p=>p[1]);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs);
  const size=Math.min(140/(xmax-xmin),86/(zmax-zmin));
  const pos=t.laps?(x,z)=>[80+(x-(xmin+xmax)/2)*size,55-(z-(zmin+zmax)/2)*size]:
    (x,z)=>[9+142*(z-zmin)/(zmax-zmin),99-(x-xmin)/(xmax-xmin)*86];
  const result={points:points.map(path=>path.map(([x,z])=>pos(x,z))),pos};mapCache.set(t,result);return result;
}
function minimap(canvas,t,all,self){
  const ctx=canvas.getContext('2d'),map=mapData(t);ctx.clearRect(0,0,160,110);
  ctx.strokeStyle='#bfccc0';ctx.lineWidth=2.7;ctx.lineJoin='round';ctx.lineCap='round';
  for(const path of map.points){ctx.beginPath();ctx.moveTo(...path[0]);for(let j=1;j<path.length;j++)ctx.lineTo(...path[j]);ctx.stroke();}
  for(const p of [...all.filter(p=>p.id!==self),...all.filter(p=>p.id===self)]){
    const position=Race.sample(t,p.d,p.route,p.gate,p.x),[x,y]=map.pos(position.x,position.z);
    ctx.fillStyle=p.id===self?'#d6f66b':'#ff9879';ctx.beginPath();ctx.arc(x,y,p.id===self?4.5:3.4,0,Math.PI*2);ctx.fill();
  }
}
function showRoute(view,t,p){
  const next=Race.upcoming(t,p.d),remaining=Race.toGate(t,p.d,next);
  const approaching=p.gate<0 && remaining<=150;
  const selected=p.gate>=0?p.route:Race.choice(t,p.x);
  const lapFlash=t.laps && p.completedLaps>0 && race.elapsed-p.lapStart<2.8;
  const label=p.done?p.rank+'. sırada bitirdin':lapFlash?(p.completedLaps===t.laps-1?'Son tur':'Tur '+(p.completedLaps+1))+' · '+timeText(p.lastLap):p.gate>=0?t.roads[p.route]+' güzergâhı':approaching?'Yol ayrımı · '+Math.max(0,Math.ceil(remaining/10)*10)+' m':'';
  const key=label+'|'+(approaching?selected:-1);
  if(key===view.routeKey)return;view.routeKey=key;view.route.replaceChildren();
  if(!label)return;
  const title=document.createElement('b');title.textContent=label;view.route.append(title);
  if(approaching){
    const row=document.createElement('div');row.className='routeOptions';
    t.roads.forEach((name,i)=>{const span=document.createElement('span');span.textContent=name;if(i===selected)span.className='active';row.append(span);});
    view.route.append(row);
  }
}
function hud(state){
  const t=Race.trackOf(state.track),sorted=Race.order(state);
  for(const v of views){
    const p=state.players.find(p=>p.id===v.id);if(!p)continue;
    v.name.textContent=p.name+' · '+Race.cars[p.car].name;
    const position=(sorted.findIndex(s=>s.id===p.id)+1)+'/'+state.players.length+' sıra';
    const lap=Math.min(t.laps||1,(p.completedLaps||0)+1);
    v.place.textContent=t.laps?'Tur '+lap+'/'+t.laps+' · '+position:position+' · '+Math.round(Math.max(0,state.finishAt-p.d))+' m';
    v.lap.hidden=!t.laps;
    if(t.laps)v.lap.textContent='Tur '+timeText(p.done?p.lastLap:Math.max(0,state.elapsed-p.lapStart))+(p.bestLap?' · En iyi '+timeText(p.bestLap):'');
    v.speed.textContent=Math.round(p.v*3.6);v.meter.value=p.nitro;v.fuel.textContent=Math.round(p.nitro)+'%';
    const collected=state.elapsed-p.lastPickupAt<1.35 && p.lastPickupGain>0;
    v.gain.hidden=!collected;if(collected)v.gain.textContent='+'+Math.round(p.lastPickupGain)+' nitro';
    v.map.title='Pist krokisi';minimap(v.map,t,state.players,p.id);showRoute(v,t,p);
  }
  $('raceClock').textContent=timeText(state.elapsed);
}
function frame(now){
  requestAnimationFrame(frame);
  if(!mode||!race||document.hidden)return;
  const dt=Math.min(.15,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(mode!=='online'&&!paused){
    remainder+=dt;
    while(remainder>=1/60){Race.step(race,keyState,1/60);remainder-=1/60;}
  }
  if(mode==='online')sendInput();
  if(!lastHud || now-lastHud>80){lastHud=now;hud(race);refresh();}
  const moving=!paused && !disconnected && race.status==='racing';
  const stillKey=[race.track,race.status,paused,disconnected,...race.players.map(p=>p.id+'-'+p.car)].join('|');
  if(moving || paintKey!==stillKey){
    const visibleRace=interpolated(now);
    for(const view of views)Scene.draw(view.canvas,visibleRace,view.id);
    paintKey=stillKey;
  }
}
$('play').onclick=()=>prefs.mode==='online'?online('create'):startLocal();
$('joinForm').onsubmit=e=>{e.preventDefault();online('join');};
$('code').oninput=()=>{$('code').value=$('code').value.replace(/[^0-9]/g,'').slice(0,6);message();};
$('room').onclick=async()=>{
  try{await navigator.clipboard.writeText(roomCode);$('room').textContent='Kopyalandı';setTimeout(()=>{if(mode==='online')$('room').textContent='Oda '+roomCode+' ⧉';},1200);}
  catch{window.prompt('Oda kodu',roomCode);}
};
$('exit').onclick=$('back').onclick=showMenu;$('pause').onclick=togglePause;$('overAction').onclick=()=>overClick?.();
$('help').onclick=()=>{if(mode && mode!=='online'&&!paused)togglePause();$('guide').showModal();};
$('full').onclick=()=>{(document.fullscreenElement?document.exitFullscreen():$('game').requestFullscreen()).catch(()=>{});};
document.addEventListener('fullscreenchange',()=>{$('full').textContent=document.fullscreenElement?'Tam ekrandan çık':'Tam ekran';});
window.addEventListener('resize',()=>{paintKey='';menuArt();touchVisibility();});
makeMenu();
if(window.ResizeObserver)new ResizeObserver(menuArt).observe($('garageArt'));
requestAnimationFrame(frame);
