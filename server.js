'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const WebSocket=require('ws');
const Race=require('./public/race');
const root=path.join(__dirname,'public');
const rooms=new Map();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  let url;
  try {url=new URL(req.url,'http://localhost');} catch {res.writeHead(400).end();return;}
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  });
});
const sockets=new WebSocket.Server({server,maxPayload:4096});
function send(ws,data){
  if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function sync(room) {
  const r=room.race;
  for(const s of room.seats){
    if(s.ws.version===2) {
      send(s.ws,{type:'state',code:room.code,hostId:room.seats[0].id,...r});
    } else {
      send(s.ws,{type:'state',code:room.code,status:r.status,countdown:r.countdown,finishAt:r.finishAt,
        players:r.players.map(p=>({...p,x:p.x/Race.HALF*160,speed:p.v*3.6}))});
    }
  }
}
function reset(room,status) {
  room.inputs={};
  room.race=Race.newRace(room.track,room.seats,status);
  sync(room);
}
function join(room,ws,name,car){
  const id=room.seats.length;
  room.seats.push({ws,id,name,car:Race.validIndex(car,Race.cars)});
  ws.room=room;ws.driverId=id;
  send(ws,{type:'joined',id,code:room.code});
  reset(room,'waiting');
}
function leave(ws){
  const room=ws.room;
  if(!room)return;
  ws.room=null;
  room.seats=room.seats.filter(s=>s.ws!==ws);
  if(!room.seats.length){rooms.delete(room.code);return;}
  const host=room.seats[0];
  if(host.id!==0){
    host.id=0;host.ws.driverId=0;
    send(host.ws,{type:'joined',id:0,code:room.code});
  }
  send(host.ws,{type:'notice',message:'Rakibin ayrıldı. Oda yeni bir oyuncuya açık.'});
  reset(room,'waiting');
}
sockets.on('connection',ws=>{
  ws.on('message',raw=>{
    let m;
    try {m=JSON.parse(raw.toString());} catch {return;}
    if(!m || typeof m.type!=='string')return;
    if(m.type==='create' || m.type==='join'){
      const name=typeof m.name==='string'?m.name.trim().slice(0,16):'Pilot';
      let room;
      if(m.type==='create'){
        let code;
        do {code=String(crypto.randomInt(100000,1000000));} while(rooms.has(code));
        room={code,track:Race.validIndex(m.track,Race.tracks),seats:[],inputs:{}};
        rooms.set(code,room);
      } else {
        room=rooms.get(String(m.code || '').trim());
        if(!room || room.seats.length>=2){
          send(ws,{type:'error',message:room?'Bu oda dolu.':'Oda bulunamadı. Kodu kontrol et.'});return;
        }
        if(ws.room===room)return;
      }
      leave(ws);ws.version=m.version;
      join(room,ws,name,m.car);
    } else if(m.type==='leave') leave(ws);
    else if(m.type==='start'){
      const room=ws.room;
      if(room?.seats[0].ws===ws && room.seats.length===2 && ['waiting','finished'].includes(room.race.status)) reset(room,'countdown');
    } else if(m.type==='input' && ws.room && m.keys) {
      const keys=Race.inputs();
      for(const key of Object.keys(keys)) keys[key]=m.keys[key]===true;
      ws.room.inputs[ws.driverId]=keys;ws.inputTime=Date.now();
    }
  });
  ws.on('close',()=>leave(ws));
  ws.on('error',()=>{});
});
let previous=performance.now(),accumulator=0;
setInterval(()=>{
  const now=performance.now();
  accumulator+=Math.min(.2,(now-previous)/1000);previous=now;
  const ticks=Math.floor(accumulator*60);
  accumulator-=ticks/60;
  for(const room of rooms.values()){
    if(!['countdown','racing'].includes(room.race.status)) continue;
    for(const seat of room.seats)
      if(Date.now()-seat.ws.inputTime>1800) delete room.inputs[seat.id];
    for(let i=0;i<ticks;i++) Race.step(room.race,room.inputs,1/60);
    sync(room);
  }
},50);
const port=Number(process.env.PORT||3000);
server.listen(port,'0.0.0.0',()=>console.log('Turbo Düello · port '+port));
