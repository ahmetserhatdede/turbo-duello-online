const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const TRACK = 2000;
const ROAD_HALF = 160;
const rooms = new Map();
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};

const server = http.createServer((req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT,'index.html')) {res.writeHead(403); return res.end('Forbidden');}
  fs.readFile(file,(err,data) => {
    if (err) {res.writeHead(404); return res.end('Not found');}
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(data);
  });
});
const wss = new WebSocket.Server({server});
const send = (ws,obj) => {if(ws && ws.readyState === WebSocket.OPEN)ws.send(JSON.stringify(obj));};
const broadcast = (room,obj) => room.players.forEach(p => send(p.ws,obj));
function code() {let c; do {c=String(crypto.randomInt(100000,1000000));} while(rooms.has(c)); return c;}
const cleanName = (n) => String(n || 'Oyuncu').trim().slice(0,16) || 'Oyuncu';
function state(room) {return {type:'state',code:room.code,status:room.status,finishAt:TRACK,players:room.players.map(p=>({id:p.id,name:p.name,x:p.x,d:p.d,speed:p.speed,done:p.done,rank:p.rank})),countdown:room.countdown || 0};}
function leave(ws) {
  const room = ws.room;
  if(!room)return;
  room.players=room.players.filter(p=>p.ws!==ws);
  ws.room=null;
  if (!room.players.length) rooms.delete(room.code);
  else {
    room.status='waiting'; room.countdown=0;
    room.players.forEach(p=>{p.ready=false;p.done=false;p.rank=0;p.speed=0;p.d=0;p.x=p.id===0?-72:72;});
    broadcast(room,{type:'notice',message:'Diğer oyuncu ayrıldı. Yeni bir oyuncu bekleniyor.'});
    broadcast(room,state(room));
  }
}
function player(ws,name,id){return {ws,name:cleanName(name),id,x:id===0?-72:72,d:0,speed:0,done:false,rank:0,keys:{up:false,down:false,left:false,right:false}};}
function begin(room){
  if(room.players.length!==2 || !['waiting','finished'].includes(room.status))return;
  room.players.forEach(p=>{p.x=p.id===0?-72:72;p.d=0;p.speed=0;p.done=false;p.rank=0;});
  room.status='countdown'; room.countdown=3.5;
  broadcast(room,state(room));
}
wss.on('connection',ws=>{
  ws.on('message',raw=>{
    let msg; try {msg=JSON.parse(raw.toString());}catch{return;}
    if(!msg || typeof msg.type!=='string')return;
    if(msg.type==='create'){
      if(ws.room)leave(ws);
      const c=code(),room={code:c,players:[player(ws,msg.name,0)],status:'waiting',countdown:0};
      rooms.set(c,room);ws.room=room; send(ws,{type:'joined',code:c,id:0});broadcast(room,state(room));
    }else if(msg.type==='join'){
      if(ws.room)leave(ws);
      const c=String(msg.code || '').trim(),room=rooms.get(c);
      if(!room){send(ws,{type:'error',message:'Oda bulunamadı. Kodu kontrol et.'});return;}
      if(room.players.length>=2){send(ws,{type:'error',message:'Bu oda dolu.'});return;}
      const p=player(ws,msg.name,1);room.players.push(p);ws.room=room;
      send(ws,{type:'joined',code:c,id:1});broadcast(room,{type:'notice',message:'İki oyuncu hazır! Oda sahibi yarışı başlatabilir.'});broadcast(room,state(room));
    }else if(msg.type==='start'){
      const r=ws.room;
      if(r && r.players[0]?.ws===ws)begin(r);
    }else if(msg.type==='input'){
      const p=ws.room?.players.find(p=>p.ws===ws);
      if(!p)return;
      const k=msg.keys || {};
      p.keys={up:k.up===true,down:k.down===true,left:k.left===true,right:k.right===true};
    }else if(msg.type==='leave')leave(ws);
  });
  ws.on('close',()=>leave(ws));
  ws.on('error',()=>{});
});
let last=Date.now();
setInterval(()=>{
  const now=Date.now(),dt=Math.min(.08,(now-last)/1000);last=now;
  for(const room of rooms.values()){
    if(room.status==='countdown'){
      room.countdown=Math.max(0,room.countdown-dt);
      if(room.countdown===0)room.status='racing';
    }
    if(room.status==='racing'){
      for(const p of room.players){
        if(p.done)continue;
        const k=p.keys;
        const accel=k.up?150:(k.down?-220:-55);
        p.speed=Math.max(0,Math.min(310,p.speed+accel*dt));
        const turn=(k.right?1:0)-(k.left?1:0);
        p.x+=turn*(95+0.38*p.speed)*dt;
        if(Math.abs(p.x)>ROAD_HALF-18){p.x=Math.max(-ROAD_HALF+18,Math.min(ROAD_HALF-18,p.x));p.speed=Math.min(p.speed,95);}
        p.d+=p.speed*dt;
        if(p.d>=TRACK){p.d=TRACK;p.done=true;p.rank=room.players.filter(v=>v.done).length;}
      }
      if(room.players.every(p=>p.done)){room.status='finished';}
    }
    if(room.status!=='waiting')broadcast(room,state(room));
  }
},50);
setInterval(()=>{for(const [c,r] of rooms)if(!r.players.length)rooms.delete(c);},60000);
server.listen(PORT,'0.0.0.0',()=>console.log(`Yaris hazir: http://localhost:${PORT}`));
