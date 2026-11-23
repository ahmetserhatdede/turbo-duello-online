const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d');
let ws=null,me=0,roomCode='',snapshot=null,notice='',connected=false;
let previousState=null,stateTime=0;
const keys={up:false,down:false,left:false,right:false};
function connect(){return new Promise((resolve,reject)=>{
  if(ws?.readyState===1)return resolve(ws);
  const protocol=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${protocol}://${location.host}`);
  ws.addEventListener('open',()=>{connected=true;resolve(ws)},{once:true});
  ws.addEventListener('error',()=>reject(new Error('Sunucuya bağlanılamadı.')),{once:true});
  ws.addEventListener('close',()=>{connected=false;$('status').textContent='Bağlantı kesildi';$('overlay').hidden=false;$('overlay').innerHTML='<h2>Bağlantı kesildi</h2><p>Sayfayı yenileyerek tekrar bağlan.</p>';});
  ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data)}catch{return}onMessage(m)});
})}
function emit(type,extra={}){if(ws?.readyState===1)ws.send(JSON.stringify({type,...extra}))}
$('create').onclick=async()=>{try{await connect();emit('create',{name:$('name').value})}catch(e){$('error').textContent=e.message}};
$('join').onclick=async()=>{const code=$('code').value.trim();if(!/^\d{6}$/.test(code)){$('error').textContent='6 haneli oda kodunu yaz.';return}try{await connect();emit('join',{code,name:$('name').value})}catch(e){$('error').textContent=e.message}};
$('code').addEventListener('keydown',e=>{if(e.key==='Enter')$('join').click()});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);$('copy').textContent='KOPYALANDI';setTimeout(()=>$('copy').textContent='KOPYALA',1500)}catch{prompt('Oda kodu:',roomCode)}};
$('leave').onclick=()=>{emit('leave');location.reload()};
$('start').onclick=()=>emit('start');
function onMessage(m){
 if(m.type==='error'){$('error').textContent=m.message;return}
 if(m.type==='joined'){me=m.id;roomCode=m.code;$('roomCode').textContent=m.code;$('lobby').hidden=true;$('game').hidden=false;return}
 if(m.type==='notice'){notice=m.message;return}
 if(m.type==='state'){
   previousState=snapshot;stateTime=performance.now();snapshot=m;
   const a=m.players[0],b=m.players[1];
   $('p0').textContent=a?.name || 'Oyuncu 1';$('p1').textContent=b?.name || 'Rakip bekleniyor';
   $('s0').textContent=`${Math.floor(a?.d||0)} m`;$('s1').textContent=`${Math.floor(b?.d||0)} m`;
   const overlay=$('overlay'),start=$('start');
   overlay.hidden=m.status==='racing';start.hidden=true;
   if(m.status==='waiting'){
     $('status').textContent=m.players.length===1?'Rakip bekleniyor': 'Başlamaya hazır';
     overlay.querySelector('h2').textContent=m.players.length===1?'Rakibin bekleniyor...':'İki oyuncu hazır!';
     overlay.querySelector('p').textContent=m.players.length===1?'Oda kodunu arkadaşına gönder':(me===0?'Yarışı başlatmak için butona bas.':'Oda sahibi yarışı başlatacak.');
     start.hidden=!(m.players.length===2&&me===0);
   }else if(m.status==='countdown'){
     $('status').textContent='Yarış başlıyor';overlay.querySelector('h2').textContent=String(Math.max(1,Math.ceil(m.countdown-0.5)));
     overlay.querySelector('p').textContent='Hazır, gaz!';
   }else if(m.status==='racing'){$('status').textContent=`🏎️ ${Math.floor(m.players.find(p=>p.id===me)?.speed||0)} km/sa`}
   else if(m.status==='finished'){
     const winner=m.players.find(p=>p.rank===1);
     $('status').textContent='Yarış bitti';overlay.querySelector('h2').textContent=winner?.id===me?'🏆 KAZANDIN!':'🏁 YARIŞ BİTTİ';
     overlay.querySelector('p').textContent=`Kazanan: ${winner?.name||'Oyuncu'}`;start.hidden=me!==0;start.textContent='🔁 TEKRAR YARIŞ';
   }
 }
}
const controlMap={w:'up',ArrowUp:'up',s:'down',ArrowDown:'down',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right'};
window.addEventListener('keydown',e=>{const k=controlMap[e.key]||controlMap[e.key.toLowerCase?.()];if(k&&document.activeElement.tagName!=='INPUT'){keys[k]=true;e.preventDefault()}});
window.addEventListener('keyup',e=>{const k=controlMap[e.key]||controlMap[e.key.toLowerCase?.()];if(k){keys[k]=false;e.preventDefault()}});
window.addEventListener('blur',()=>{for(const k of Object.keys(keys))keys[k]=false});
document.querySelectorAll('[data-key]').forEach(b=>{const k=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();keys[k]=true;b.setPointerCapture(e.pointerId)});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys[k]=false)});
setInterval(()=>{if(snapshot?.status==='racing')emit('input',{keys})},50);
// Perspective camera and deterministic scenery shared by both drivers.
canvas.width=960;
canvas.height=540;
const W=canvas.width,H=canvas.height, horizon=166, focal=560, step=8;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const center=z=>36*Math.sin(z/125)+20*Math.sin(z/69);
const altitude=z=>5*Math.sin(z/96)+1.8*Math.sin(z/46);
const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)};
let camX=0,camY=0,camZ=0,yaw=0,pitch=0;
function project(x,y,z){
 const depth=Math.max(0.5,z-camZ),scale=focal/depth;
 return [W/2+(x-camX-depth*yaw)*scale,horizon-(y-camY-depth*pitch)*scale];
}
function roadPoint(z,offset,height=0){return project(center(z)+offset,altitude(z)+height,z)}
function face(points,color){
 ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);
 for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
 ctx.closePath();ctx.fill();
}
function strip(z,end,left,right,color,height=0){
 face([roadPoint(z,left,height),roadPoint(end,left,height),roadPoint(end,right,height),roadPoint(z,right,height)],color);
}
const sky=ctx.createLinearGradient(0,0,0,230);
sky.addColorStop(0,'#5494be');sky.addColorStop(.64,'#b7d6df');sky.addColorStop(1,'#ffe5bf');
function landscape(){
 ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 const sun=690-yaw*150;
 const glow=ctx.createRadialGradient(sun,70,4,sun,70,87);
 glow.addColorStop(0,'#fff9dc');glow.addColorStop(.14,'#fff4d5');glow.addColorStop(.2,'#ffedc38c');glow.addColorStop(1,'#ffedc300');
 ctx.fillStyle=glow;ctx.fillRect(sun-88,-18,176,176);
 for(let layer=0;layer<3;layer++){
  const offset=yaw*(95+layer*70)+camZ*(.012+layer*.009);
  const ridge=x=>{const n=x+offset;return 121+layer*29+31*Math.sin(n/99+layer*2)+15*Math.sin(n/38+layer)+7*Math.sin(n/14)+2*Math.sin(n/6)};
  const colors=['#99b5c6','#7e9eac','#608786'];
  let points=[[-4,H]];
  for(let x=-4;x<=W+4;x+=4)points.push([x,ridge(x)]);
  points.push([W+4,H]);face(points,colors[layer]);
  for(let i=-3;i<27;i++){
   const x=i*47-offset%47,y=ridge(x);
   face([[x,y],[x+9,ridge(x+9)],[x+37,y+37],[x+21,y+22]],['#aec3cb','#8eacb6','#719390'][layer]);
  }
 }
}
function tree(z,offset,seed){
 const h=5+8*random(seed), radius=h*(.16+.07*random(seed+3));
 const [x,y]=roadPoint(z,offset),scale=focal/(z-camZ),w=radius*scale,t=h*scale;
 ctx.fillStyle='#514b3a';ctx.fillRect(x-w*.10,y-t*.43,w*.20,t*.43);
 for(let k=0;k<3;k++){
  const top=y-t*(1-k*.18),base=top+t*.50,spread=w*(.63+k*.18);
  face([[x,top],[x+spread,base],[x,base+t*.04],[x-spread,base]],['#36584d','#365c4f','#315649'][k]);
  face([[x,top],[x-spread,base],[x-w*.14,base-t*.07]],'#527260');
 }
}
function car(p){
 const z=p.d,x=(p.x/160)*6.8;
 const pt=(a,b,c)=>roadPoint(z+c,x+a,b);
 const quad=(a,b,c,d,col)=>face([pt(...a),pt(...b),pt(...c),pt(...d)],col);
 const body=p.id===0?'#267fc0':'#df632a',light=p.id===0?'#71c4ed':'#ffae61';
 quad([-1.15,.04,-2.3],[1.3,.04,-2.3],[1.55,.04,2.1],[-1,.04,2.1],'#232c2fa8');
 for(const side of [-1,1]){
  const a=side*.87,b=side*1.07;
  for(const axle of [-1.35,1.35])quad([a,.09,axle-.38],[b,.09,axle-.38],[b,.64,axle+.38],[a,.64,axle+.38],'#20232a');
 }
 quad([-.98,.66,-2],[.98,.66,-2],[.95,.69,1.85],[-.95,.69,1.85],light);
 quad([-.98,.66,-2],[-.95,.69,1.85],[-.98,.23,1.72],[-1,.27,-1.95],body);
 quad([.98,.66,-2],[.95,.69,1.85],[.98,.23,1.72],[1,.27,-1.95],body);
 quad([-.84,.68,-1.29],[.84,.68,-1.29],[.66,1.27,-.37],[-.66,1.27,-.37],'#314c5a');
 quad([-.66,1.27,-.37],[.66,1.27,-.37],[.61,1.23,.62],[-.61,1.23,.62],light);
 for(const s of [-1,1])quad([s*.84,.68,-1.29],[s*.66,1.27,-.37],[s*.61,1.23,.62],[s*.84,.68,1.3],'#253e4b');
 quad([-.98,.66,-2],[.98,.66,-2],[.9,.25,-2],[-.9,.25,-2],body);
 quad([-.88,.36,-2.02],[.88,.36,-2.02],[.76,.21,-2.02],[-.76,.21,-2.02],'#262d32');
 for(const s of [-1,1])quad([s*.93,.63,-2.03],[s*.44,.61,-2.03],[s*.47,.51,-2.03],[s*.89,.51,-2.03],'#ff5150');
 quad([-.99,.84,-1.91],[.99,.84,-1.91],[.99,.84,-1.62],[-.99,.84,-1.62],'#283139');
}
function render(){
 requestAnimationFrame(render);
 if(!snapshot||$('game').hidden)return;
 const blend=clamp((performance.now()-stateTime)/50,0,1);
 const players=snapshot.players.map(p=>{
  const prev=previousState?.players.find(v=>v.id===p.id);
  if(!prev||snapshot.status!=='racing'||prev.d>p.d)return p;
  return {...p,d:prev.d+(p.d-prev.d)*blend,x:prev.x+(p.x-prev.x)*blend};
 }).sort((a,b)=>b.d-a.d);
 const self=players.find(p=>p.id===me);
 if(!self)return;
 const z=self.d;
 camZ=z-10;camX=center(camZ)+self.x/160*5.4;camY=altitude(camZ)+3.35;
 yaw=(center(z+25)-center(camZ))/35;
 pitch=(altitude(z+26)-altitude(camZ))/36-.035;
 landscape();
 const first=Math.floor(camZ/step)*step,finish=snapshot.finishAt;
 for(let start=first+step*68;start>=first;start-=step){
  const near=Math.max(start,camZ+1),far=start+step;
  if(far<=near)continue;
  const i=Math.floor(start/step),alt=Math.abs(i%2);
  strip(near,far,-700,700,alt?'#8c9964':'#909d68');
  strip(near,far,-8.2,8.2,'#b1ab93');
  strip(near,far,-7.1,7.1,alt?'#575d60':'#595f62');
  for(const side of [-1,1]){
   strip(near,far,side*6.83,side*6.94,'#eee8d8');
   if(Math.abs(center(start+36)-2*center(start)+center(start-36))>4)
    strip(near,far,side*7.08,side*7.52,alt?'#bd6957':'#dfd7c4');
   if(i%2===0 && far-camZ>3)tree(far,side*(12+random(i+side)*15),i+side);
   if(i%3===0)strip(near,far,side*8.8,side*8.98,'#888f85',.73);
   // Continuous galvanized rail with regularly spaced supports.
   const edge=side*9;
   face([roadPoint(near,edge,.54),roadPoint(far,edge,.54),roadPoint(far,edge,.78),roadPoint(near,edge,.78)],'#a1a9a6');
   if(start>camZ+2)face([roadPoint(start,edge,0),roadPoint(start,edge+.11,0),roadPoint(start,edge+.11,.55),roadPoint(start,edge,.55)],'#636d68');
  }
  if(alt)strip(near,far,-.07,.07,'#e6dfca');
  if(finish>=start&&finish<far&&finish>camZ+1){
   for(let row=0;row<2;row++)for(let col=0;col<20;col++)
    strip(finish+row*.68,finish+(row+1)*.68,-6.8+col*.68,-6.8+(col+1)*.68,(col+row)%2?'#273038':'#f1efe6');
  }
  for(const p of players)
   if(p.d>=start&&p.d<far&&p.d>camZ+24)car(p);
 }
 for(const p of players)if(p.d>camZ+3&&p.d<=camZ+24)car(p);
 ctx.fillStyle='#13202cd9';ctx.fillRect(20,18,155,37);
 ctx.fillStyle='#f3f6f4';ctx.font='bold 18px system-ui';ctx.fillText('BİTİŞ  '+Math.max(0,Math.round(finish-z))+' m',31,44);
}
render();
