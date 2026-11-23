'use strict';

// Shared by the browser simulation and the online room server. Distances and
// speeds use metres and seconds. A fork's roads meet the same timing line.
const Race = (() => {
  const HALF = 7.6;
  const cars = [
    {name:'Strada GT', type:'Gran Turismo', color:'#f45c33', light:'#ff9b68', dark:'#a53524', body:'gt', top:252, accel:10.7, steer:10.1},
    {name:'Kuzey RS', type:'Ralli', color:'#69a9e3', light:'#c4e6ff', dark:'#355f8d', body:'rally', top:232, accel:12.0, steer:12.8},
    {name:'Vektor LM', type:'Prototip', color:'#c6e95e', light:'#efffa6', dark:'#738b32', body:'proto', top:271, accel:9.7, steer:9.1},
    {name:'İyon E', type:'Elektrikli', color:'#bc91e5', light:'#ecd3ff', dark:'#75548f', body:'ev', top:245, accel:13.0, steer:10.6}
  ];
  const tracks = [
    {name:'Alp Geçidi', theme:'alpine', length:2040, seed:7, roads:['Orman','Sırt'], gates:[[280,830],[1100,1710]], spread:30, hills:11, bend:1.04},
    {name:'Ege Kıyısı', theme:'coast', length:2340, seed:31, roads:['Sahil','Çarşı','Viyadük'], gates:[[340,987],[1320,2020]], spread:26, hills:5.5, bend:.96},
    {name:'Kızıl Kanyon', theme:'canyon', length:2620, seed:53, roads:['Dere','Kanyon','Sırt','Plato'], gates:[[350,1090],[1440,2250]], spread:25, hills:9.5, bend:1.15},
    {name:'Körfez GP', theme:'coast', length:1560, laps:3, seed:23, roads:['İç hat','Liman'], gates:[[485,810]], spread:14, hills:2,
      knots:[[0,0],[0,120],[50,205],[147,214],[208,154],[226,60],[184,9],[160,-65],[96,-98],[33,-67],[0,-32]]},
    {name:'Çamlık GP', theme:'alpine', length:1740, laps:3, seed:37, roads:['Sırt','Orman'], gates:[[215,570]], spread:14, hills:6,
      knots:[[0,0],[3,98],[-61,160],[-104,216],[-65,254],[15,231],[87,155],[149,141],[172,58],[116,14],[115,-52],[47,-94],[-8,-66]]},
    {name:'Kapadokya GP', theme:'canyon', length:1920, laps:3, seed:59, roads:['Kısa hat','Dış hat'], gates:[[1150,1520]], spread:15, hills:5,
      knots:[[0,0],[0,142],[67,191],[153,181],[195,128],[146,102],[94,85],[105,40],[198,21],[230,-42],[164,-83],[85,-60],[26,-77],[-4,-47]]}
  ];
  const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
  const validIndex = (value, items) => Number.isInteger(value) && value >= 0 && value < items.length ? value : 0;
  const inputs = () => ({up:false,down:false,left:false,right:false,boost:false});
  const trackOf = id => tracks[validIndex(id,tracks)];
  const lapDistance=(t,d)=>t.laps ? ((d%t.length)+t.length)%t.length : d;
  const gateAt=(t,d)=>{const s=lapDistance(t,d);return t.gates.findIndex(([a,b])=>s>=a&&s<b);};
  function upcoming(t,d){
    const next=t.gates.findIndex(([start])=>start>lapDistance(t,d));
    return next<0 && t.laps ? 0 : next;
  }
  function toGate(t,d,gate){
    if(gate<0)return Infinity;
    const delta=t.gates[gate][0]-lapDistance(t,d);
    return delta<0 && t.laps ? delta+t.length : delta;
  }
  const gateLane=(t,index)=>(2*(index+.5)/t.roads.length-1)*HALF;
  const choice=(t,x)=>clamp(Math.floor((x+HALF)/(2*HALF)*t.roads.length),0,t.roads.length-1);
  const total=t=>t.length*(t.laps||1);

  // Resample a closed Catmull–Rom spline at equal physical distances, with
  // the same tangent on both sides of the timing line.
  const loopCache=new Map();
  function buildLoop(t){
    const p=t.knots,n=p.length,dense=[],lengths=[];
    let length=0;
    for(let i=0;i<=n*64;i++){
      const seg=Math.floor(i/64),u=(i%64)/64;
      const a=p[(seg+n-1)%n],b=p[seg%n],c=p[(seg+1)%n],d=p[(seg+2)%n];
      const pos=[0,1].map(j=>.5*(2*b[j]+(-a[j]+c[j])*u+
        (2*a[j]-5*b[j]+4*c[j]-d[j])*u*u+(-a[j]+3*b[j]-3*c[j]+d[j])*u*u*u));
      if(i)length+=Math.hypot(pos[0]-dense[i-1][0],pos[1]-dense[i-1][1]);
      dense.push(pos);lengths.push(length);
    }
    const count=Math.ceil(t.length/1.5),scale=t.length/length,samples=[];
    let j=0;
    for(let i=0;i<count;i++){
      const at=i*length/count;
      while(j<lengths.length-2&&lengths[j+1]<at)j++;
      const f=(at-lengths[j])/(lengths[j+1]-lengths[j]);
      samples.push({x:(dense[j][0]+f*(dense[j+1][0]-dense[j][0]))*scale,
        z:(dense[j][1]+f*(dense[j+1][1]-dense[j][1]))*scale});
    }
    samples.forEach((q,i)=>{
      const a=samples[(i+count-1)%count],b=samples[(i+1)%count],len=Math.hypot(b.x-a.x,b.z-a.z);
      q.tx=(b.x-a.x)/len;q.tz=(b.z-a.z)/len;
    });
    loopCache.set(t,samples);return samples;
  }
  function base(t,d){
    if(t.laps){
      const table=loopCache.get(t)||buildLoop(t),index=lapDistance(t,d)/t.length*table.length;
      const i=Math.floor(index)%table.length,f=index-Math.floor(index),a=table[i],b=table[(i+1)%table.length];
      const tx=a.tx+(b.tx-a.tx)*f,tz=a.tz+(b.tz-a.tz)*f,len=Math.hypot(tx,tz);
      return {x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,tx:tx/len,tz:tz/len};
    }
    const a=d/134+t.seed*.08,b=d/85+t.seed*.32,c=d/63+t.seed*.11;
    const x=t.bend*(42*Math.sin(a)+22*Math.sin(b)+12*Math.sin(c));
    const dx=t.bend*(42/134*Math.cos(a)+22/85*Math.cos(b)+12/63*Math.cos(c)),scale=Math.hypot(1,dx);
    return {x,z:d,tx:dx/scale,tz:1/scale};
  }
  function elevation(t,d){
    if(t.laps){
      const a=d/t.length*Math.PI*2;return t.hills*(Math.sin(a*2+t.seed)+.36*Math.cos(a*3+t.seed*.4));
    }
    return t.hills*(Math.sin(d/133+t.seed*.5)+.46*Math.sin(d/66+t.seed*.21));
  }
  // Road x is the offset from the centreline, measured along its horizontal
  // normal. Both the tyre simulation and the renderer use these coordinates.
  function road(t,d,route=-1,gate=gateAt(t,d)){
    const y=elevation(t,d);
    if(gate<0||route<0)return {x:0,y,width:HALF};
    const [start,end]=t.gates[gate];
    const u=clamp((lapDistance(t,d)-start)/(end-start),0,1),arc=Math.sin(Math.PI*u)**2;
    const spread=1-Math.exp(-arc*7),index=route-(t.roads.length-1)/2;
    const wave=Math.sin(u*2*Math.PI+route*1.55+gate*.8);
    return {x:gateLane(t,route)+index*t.spread*spread+wave*arc*(t.laps?3:7+2*route),
      y:y+(route*(t.laps?.7:2.7)+1.1*Math.sin(u*Math.PI*2+route))*arc,
      width:HALF/t.roads.length+(4.2+route*.48-HALF/t.roads.length)*spread};
  }
  function sample(t,d,route=-1,gate=gateAt(t,d),lateral=0){
    const b=base(t,d),r=road(t,d,route,gate),x=r.x+lateral;
    return {x:b.x+b.tz*x,y:r.y,z:b.z-b.tx*x,b,width:r.width};
  }
  function frame(t,p){
    const a=sample(t,p.d-1.7,p.route,p.gate,p.x),q=sample(t,p.d,p.route,p.gate,p.x),b=sample(t,p.d+1.7,p.route,p.gate,p.x);
    const ax=(b.x-a.x)/3.4,az=(b.z-a.z)/3.4,metric=Math.max(.25,Math.hypot(ax,az));
    const first=Math.atan2(q.x-a.x,q.z-a.z),second=Math.atan2(b.x-q.x,b.z-q.z);
    return {...q,ax,az,metric,yaw:Math.atan2(ax,az),slope:(b.y-a.y)/(3.4*metric),
      curvature:Math.atan2(Math.sin(second-first),Math.cos(second-first))/(1.7*metric)};
  }

  // Bottles are physical track objects; readyAt is race-specific and shared
  // by all drivers. Only the simulation awards a pickup.
  const itemCache=new Map();
  function pickups(t){
    if(itemCache.has(t))return itemCache.get(t);
    const items=[];
    const add=(s,x,route,amount)=>items.push({s,x,route,amount});
    add(48,-3.7,-1,35);add(48,3.7,-1,35);
    for(let s=170,index=0;s<t.length-50;s+=t.laps?131:145,index++){
      if(t.gates.some(([a,b])=>Math.abs(s-a)<25||Math.abs(s-b)<25))continue;
      const gate=gateAt(t,s),lanes=gate<0?1:t.roads.length;
      for(let j=0;j<lanes;j++)add(s,(gate<0?3.3:1.75)*Math.sin(index*2.1+j),gate<0?-1:j,(index+j)%4===2?65:35);
    }
    items.forEach((item,i)=>item.id=i);itemCache.set(t,items);return items;
  }
  function eachPickup(t,from,to,visit){
    if(to<=from)return;
    const items=pickups(t),firstCycle=t.laps?Math.floor(from/t.length):0,last=t.laps?Math.floor(to/t.length):0;
    for(let lap=firstCycle;lap<=last;lap++){
      const offset=t.laps?lap*t.length:0,start=from-offset,end=to-offset;
      let lo=0,hi=items.length;
      while(lo<hi){const mid=(lo+hi)>>1;if(items[mid].s<=start)lo=mid+1;else hi=mid;}
      for(let i=lo;i<items.length && items[i].s<=end;i++)visit(items[i],offset+items[i].s);
    }
  }
  // At the line the single road is partitioned into adjacent lanes. A car
  // keeps its world-space position when it takes a branch or rejoins.
  function driver(id,name,carId,bot=false) {
    const grid=[-3.7,3.7,-1.3,1.3];
    return {id,name:String(name || ('Pilot '+(id+1))).trim().slice(0,16) || 'Pilot',
      car:validIndex(carId,cars),bot,x:grid[id%grid.length],d:(id>=2?-4:0),v:0,
      route:-1,gate:-1,nitro:0,boosting:false,steering:0,heading:0,frontAngle:0,
      completedLaps:0,lapStart:0,bestLap:0,lastLap:0,lastPickupAt:-10,lastPickupGain:0,
      done:false,rank:0,time:0};
  }
  function newRace(track,entries,status='countdown') {
    const t=trackOf(track);
    return {track:validIndex(track,tracks),players:entries.map(p=>driver(p.id,p.name,p.car,p.bot)),
      status,countdown:3,elapsed:0,finishAt:total(t),readyAt:pickups(t).map(()=>0)};
  }
  function order(race) {
    return [...race.players].sort((a,b)=>a.done && b.done ? a.rank-b.rank :
      a.done ? -1 : b.done ? 1 : b.d-a.d || a.id-b.id);
  }
  function botKeys(p,t,race,path){
    const next=upcoming(t,p.d);
    let target=Math.sin(p.d/65+p.id)*.8;
    if(p.gate<0 && toGate(t,p.d,next)<120)target=gateLane(t,(p.id+next+p.completedLaps)%t.roads.length);
    else if(p.nitro<76){
      let best=Infinity;
      eachPickup(t,p.d,p.d+105,(item,at)=>{
        if(item.route!==p.route||race.readyAt[item.id]>race.elapsed)return;
        const score=at-p.d+Math.abs(item.x-p.x)*3;
        if(score<best){best=score;target=item.x;}
      });
    }
    const lateralSpeed=Math.sin(p.heading)*p.v;
    const error=target-p.x-.30*lateralSpeed;
    const cruise=cars[p.car].top/3.6*(.86+.022*p.id);
    const cornerLimit=Math.max(28,Math.sqrt(15/Math.max(.001,Math.abs(path.curvature))));
    const pace=Math.min(cruise,cornerLimit);
    const sprint=p.nitro>0 && (race.finishAt-p.d<220 || (race.elapsed+p.id*2.4)%13<4) && cornerLimit>cruise*.9;
    return {up:p.v<pace||sprint,down:p.v>pace+4,left:error<-.18,right:error>.18,boost:sprint};
  }
  function advance(p,t,keys,dt,path){
    const model=cars[p.car],turn=Number(!!keys.right)-Number(!!keys.left);
    p.steering+=(turn-p.steering)*(1-Math.exp(-dt*(turn?5.5:7.5)));
    const grip=model.steer*.97, wheelbase=2.65;
    // A speed-sensitive single-track steering model. The front axle changes
    // yaw first; the tyres then move the car along that heading.
    const maxHeading=.155+.16/(1+p.v/13);
    const understeer=-clamp(path.curvature*p.v*p.v/(grip*1.7),-1,1)*Math.min(.037,p.v*.0007);
    let target=p.steering*maxHeading+understeer;
    const edge=Math.abs(p.x)-(path.width-.6);
    if(edge>0 && Math.sign(target)===Math.sign(p.x))target*=clamp(1-edge/.9,0,1);
    const v=Math.max(.1,p.v);
    const maxWheel=.50/(1+(p.v/19)**1.45);
    const wheel=Math.atan(wheelbase*(target-p.heading)*4/v);
    p.frontAngle=clamp(wheel,-maxWheel,maxWheel);
    const yawRate=clamp(p.v/wheelbase*Math.tan(p.frontAngle),-grip/v,grip/v);
    p.heading=clamp(p.heading+yawRate*dt,-maxHeading,maxHeading);
    const gravel=Math.abs(p.x)>path.width-.35;
    p.boosting=Boolean(keys.boost && keys.up && !keys.down && p.nitro>0 && p.v>5 && !gravel);
    if(p.boosting)p.nitro=Math.max(0,p.nitro-22*dt);
    const limit=model.top/3.6*(p.boosting?1.2:1)*(gravel?.58:1);
    let accel=keys.down?-23:keys.up?model.accel*(1-.55*Math.min(1,p.v/limit)):-3;
    if(p.boosting)accel+=10;
    if(p.v>limit)accel=Math.min(accel,gravel?-20:-9);
    p.v=clamp(p.v+accel*dt,0,model.top/3.6*1.21);
    const yaw=path.yaw+p.heading,speed=p.v/Math.hypot(1,path.slope);
    const vx=Math.sin(yaw)*speed,vz=Math.cos(yaw)*speed;
    // Resolve the same world-space velocity into course progress and offset.
    // This also works on a branch whose tangent differs from the main road.
    const along=Math.max(.22,path.ax*path.b.tx+path.az*path.b.tz);
    const dd=(vx*path.b.tx+vz*path.b.tz)/along;
    const dx=(vx-dd*path.ax)*path.b.tz-(vz-dd*path.az)*path.b.tx;
    const nextD=p.d+Math.max(0,dd)*dt,nextGate=gateAt(t,nextD);
    p.x=clamp(p.x+dx*dt,-path.width-.55,path.width+.55);
    if(nextGate!==p.gate){
      if(p.route>=0)p.x+=gateLane(t,p.route);
      p.gate=nextGate;p.route=nextGate<0?-1:choice(t,p.x);
      if(p.route>=0)p.x-=gateLane(t,p.route);
    }
    return nextD;
  }
  function step(race,commands,dt){
    if(race.status==='countdown'){
      race.countdown=Math.max(0,race.countdown-dt);
      if(race.countdown<=1e-8){race.countdown=0;race.status='racing';}
      return;
    }
    if(race.status!=='racing')return;
    const t=trackOf(race.track),finishers=[],claims=[];
    const already=race.players.filter(p=>p.done).length;
    for(const p of race.players){
      if(p.done)continue;
      const before=p.d,oldX=p.x,path=frame(t,p);
      const next=advance(p,t,p.bot?botKeys(p,t,race,path):(commands[p.id]||{}),dt,path);
      p.d=Math.min(next,race.finishAt);
      eachPickup(t,before,p.d,(item,at)=>{
        if(item.route!==p.route)return;
        const fraction=(at-before)/(next-before);
        if(Math.abs(oldX+(p.x-oldX)*fraction-item.x)<=1.50)
          claims.push({at:race.elapsed+dt*fraction,p,item});
      });
      const line=(p.completedLaps+1)*t.length;
      if(before<line && next>=line){
        const time=race.elapsed+dt*(line-before)/(next-before);
        p.lastLap=time-p.lapStart;p.bestLap=p.bestLap?Math.min(p.bestLap,p.lastLap):p.lastLap;
        p.lapStart=time;p.completedLaps++;
        if(p.completedLaps===(t.laps||1)){
          p.done=true;p.v=0;p.boosting=false;p.time=time;finishers.push(p);
        }
      }
    }
    claims.sort((a,b)=>a.at-b.at||a.p.id-b.p.id);
    for(const {p,item,at} of claims){
      if(race.readyAt[item.id]>at || p.nitro>=100)continue;
      p.lastPickupGain=Math.min(item.amount,100-p.nitro);
      p.nitro=Math.min(100,p.nitro+item.amount);p.lastPickupAt=at;
      race.readyAt[item.id]=at+7;
    }
    finishers.sort((a,b)=>a.time-b.time||a.id-b.id).forEach((p,i)=>{p.rank=already+i+1;});
    race.elapsed+=dt;
    if(race.players.every(p=>p.done))race.status='finished';
  }
  function formatTime(seconds) {
    const ms=Math.round(seconds*100);
    return Math.floor(ms/6000)+':'+String(Math.floor(ms/100)%60).padStart(2,'0')+'.'+String(ms%100).padStart(2,'0');
  }
  return {cars,tracks,HALF,clamp,inputs,validIndex,trackOf,base,sample,frame,elevation,road,gateAt,gateLane,choice,upcoming,toGate,total,lapDistance,pickups,eachPickup,newRace,order,step,formatTime};
})();
if (typeof module!=='undefined' && module.exports) module.exports=Race;
