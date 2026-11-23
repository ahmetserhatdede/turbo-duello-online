const $=id=>document.getElementById(id);
const canvas=$('canvas'),ctx=canvas.getContext('2d');
let ws=null,me=0,roomCode='',snapshot=null,notice='',connected=false;
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
   snapshot=m;
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
function draw(){
 requestAnimationFrame(draw);
 const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
 ctx.fillStyle='#24513b';ctx.fillRect(0,0,w,h);
 const roadX=65,roadW=390;ctx.fillStyle='#2d3039';ctx.fillRect(roadX,0,roadW,h);
 ctx.fillStyle='#bbbfc8';ctx.fillRect(roadX,0,7,h);ctx.fillRect(roadX+roadW-7,0,7,h);
 const ps=snapshot?.players||[],self=ps.find(p=>p.id===me),anchor=self?.d||0;
 const offset=(anchor*3.2)%90;
 ctx.fillStyle='#ede4b6';for(let y=-90+offset;y<h+90;y+=90){ctx.fillRect(w/2-4,y,8,47);ctx.fillRect(w/2-100,y,4,40);ctx.fillRect(w/2+96,y,4,40)}
 // The world moves beneath the cars; draw the finish line when it approaches.
 const finishY=h-140-(2000-anchor)*3.2;
 if(finishY>-30&&finishY<h+30){for(let x=roadX;x<roadX+roadW;x+=20){for(let j=0;j<2;j++){ctx.fillStyle=((x-roadX)/20+j)%2?'#111':'#fff';ctx.fillRect(x,finishY+j*18,20,18)}}}
 for(const p of ps){
   const y=h-140-(p.d-anchor)*3.2;
   if(y< -80||y>h+80)continue;
   const x=w/2+p.x;
   ctx.save();ctx.translate(x,y);
   ctx.fillStyle='#0007';ctx.fillRect(-18,-31,42,75);
   ctx.fillStyle=p.id===0?'#46afff':'#ff9a46';
   rounded(-19,-33,38,66,8);ctx.fill();
   ctx.fillStyle='#1c3144';rounded(-14,-18,28,20,5);ctx.fill();
   ctx.fillStyle='#9ddbef';rounded(-12,13,24,13,3);ctx.fill();
   ctx.fillStyle='#fffac4';ctx.fillRect(-16,-30,8,6);ctx.fillRect(8,-30,8,6);
   ctx.fillStyle='#ff3b52';ctx.fillRect(-15,26,7,5);ctx.fillRect(8,26,7,5);
   ctx.textAlign='center';ctx.font='bold 13px Arial';ctx.fillStyle='#fff';ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText(p.name,0,-44);ctx.restore();
 }
 ctx.fillStyle='#07121bbd';rounded(12,10,122,32,8);ctx.fill();ctx.fillStyle='#e2f4fa';ctx.font='bold 13px Arial';ctx.fillText(`BİTİŞ: ${Math.max(0,Math.round(2000-(self?.d||0)))} m`,22,31);
}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
draw();
