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
    {name:'Kızıl Kanyon', theme:'canyon', length:2620, seed:53, roads:['Dere','Kanyon','Sırt','Plato'], gates:[[350,1090],[1440,2250]], spread:25, hills:9.5, bend:1.15}
  ];
  const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
  const validIndex = (value, items) => Number.isInteger(value) && value >= 0 && value < items.length ? value : 0;
  const inputs = () => ({up:false,down:false,left:false,right:false,boost:false});
  const trackOf = id => tracks[validIndex(id,tracks)];
  const gateAt = (t,z) => t.gates.findIndex(([start,end]) => z >= start && z < end);
  const upcoming = (t,z) => t.gates.findIndex(([start]) => start > z);
  const gateLane = (t,index) => (2 * (index+.5) / t.roads.length - 1) * HALF;
  const choice = (t,x) => clamp(Math.floor((x+HALF)/(2*HALF)*t.roads.length),0,t.roads.length-1);

  function center(t,z) {
    return t.bend*(42*Math.sin(z/134+t.seed*.08)+22*Math.sin(z/85+t.seed*.32)+12*Math.sin(z/63+t.seed*.11));
  }
  function elevation(t,z) {
    return t.hills*(Math.sin(z/133+t.seed*.5)+.46*Math.sin(z/66+t.seed*.21));
  }
  function road(t,z,route=-1,gate=gateAt(t,z)) {
    const x=center(t,z), y=elevation(t,z);
    if (gate < 0 || route < 0) return {x,y,width:HALF};
    const [start,end]=t.gates[gate];
    const u=clamp((z-start)/(end-start),0,1);
    const arc=Math.sin(Math.PI*u)**2;
    const spread=1-Math.exp(-arc*7);
    const lane=gateLane(t,route);
    const index=route-(t.roads.length-1)/2;
    const wave=Math.sin(u*2*Math.PI+route*1.55+gate*.8);
    return {
      x:x+lane+index*t.spread*spread+wave*arc*(7+2*route),
      y:y+(route*2.7+1.1*Math.sin(u*Math.PI*2+route))*arc,
      width:HALF/t.roads.length+(4.2+route*.48-HALF/t.roads.length)*spread
    };
  }
  // At the line the single road is partitioned into adjacent lanes. A car
  // keeps its world-space position when it takes a branch or rejoins.
  function driver(id,name,carId,bot=false) {
    const grid=[-3.7,3.7,-1.3,1.3];
    return {id,name:String(name || ('Pilot '+(id+1))).trim().slice(0,16) || 'Pilot',
      car:validIndex(carId,cars),bot,x:grid[id%grid.length],d:(id>=2?-4:0),v:0,
      route:-1,gate:-1,nitro:100,boosting:false,boostLock:false,steering:0,
      done:false,rank:0,time:0};
  }
  function newRace(track,entries,status='countdown') {
    return {track:validIndex(track,tracks),players:entries.map(p=>driver(p.id,p.name,p.car,p.bot)),
      status,countdown:3,elapsed:0,finishAt:trackOf(track).length};
  }
  function order(race) {
    return [...race.players].sort((a,b)=>a.done && b.done ? a.rank-b.rank :
      a.done ? -1 : b.done ? 1 : b.d-a.d || a.id-b.id);
  }
  function botKeys(p,t,race) {
    const next=upcoming(t,p.d);
    let target=Math.sin(p.d/65+p.id)*1.1;
    if (p.gate < 0 && next>=0 && t.gates[next][0]-p.d<120)
      target=gateLane(t,(p.id+next)%t.roads.length);
    const error=target-p.x;
    const cruise=cars[p.car].top/3.6*(.86+.022*p.id);
    const sprint=p.d>t.length-230 || ((race.elapsed+p.id*2.4)%17<4 && p.d>90);
    return {up:p.v<cruise || sprint,down:false,left:error<-.20,right:error>.20,boost:sprint && p.nitro>3};
  }
  function advance(p,t,keys,dt) {
    const model=cars[p.car], here=road(t,p.d,p.route,p.gate);
    const ahead=road(t,p.d+2,p.route,p.gate), behind=road(t,p.d-2,p.route,p.gate);
    const curvature=(ahead.x+behind.x-2*here.x)/4;
    const steering=Number(!!keys.right)-Number(!!keys.left);
    p.steering+=(steering-p.steering)*Math.min(1,dt*9);
    p.x+=(p.steering*model.steer*Math.min(1,p.v/8)-clamp(curvature*p.v*p.v*.20,-3.8,3.8))*dt;
    p.x=clamp(p.x,-here.width-1,here.width+1);
    const gravel=Math.abs(p.x)>here.width-.35;
    if (!keys.boost && p.nitro>=10) p.boostLock=false;
    p.boosting=!!(keys.boost && keys.up && !keys.down && !p.boostLock && p.nitro>0 && p.v>5 && !gravel);
    p.nitro=clamp(p.nitro+(p.boosting?-22:6)*dt,0,100);
    if (p.nitro===0) p.boostLock=true;
    const limit=model.top/3.6*(p.boosting?1.20:1)*(gravel?.57:1);
    let accel=keys.down?-23:keys.up?model.accel*(1-.55*Math.min(1,p.v/limit)):-3;
    if (p.boosting) accel+=10;
    if (p.v>limit) accel=Math.min(accel,gravel?-20:-9);
    p.v=clamp(p.v+accel*dt,0,model.top/3.6*1.21);
    const factor=Math.hypot(1,(ahead.x-behind.x)/4,(ahead.y-behind.y)/4);
    const distance=p.v*dt/factor;
    const nextD=p.d+distance, nextGate=gateAt(t,nextD);
    if (nextGate!==p.gate) {
      if (p.route>=0) p.x+=gateLane(t,p.route);
      p.gate=nextGate;
      p.route=nextGate<0 ? -1 : choice(t,p.x);
      if (p.route>=0) p.x-=gateLane(t,p.route);
    }
    if (nextD>=t.length) {
      const fraction=(t.length-p.d)/(distance||1);
      p.d=t.length;p.v=0;p.done=true;p.boosting=false;
      return dt*clamp(fraction,0,1);
    }
    p.d=nextD;
    return null;
  }
  function step(race,commands,dt) {
    if(race.status==='countdown') {
      race.countdown=Math.max(0,race.countdown-dt);
      if (race.countdown<=1e-8) {race.countdown=0;race.status='racing';}
      return;
    }
    if(race.status!=='racing') return;
    const t=trackOf(race.track), finishers=[];
    const already=race.players.filter(p=>p.done).length;
    for (const p of race.players) {
      if(p.done) continue;
      const fraction=advance(p,t,p.bot?botKeys(p,t,race):(commands[p.id]||{}),dt);
      if(fraction!==null) {p.time=race.elapsed+fraction;finishers.push(p);}
    }
    finishers.sort((a,b)=>a.time-b.time || a.id-b.id).forEach((p,i)=>{p.rank=already+i+1;});
    race.elapsed+=dt;
    if(race.players.every(p=>p.done)) race.status='finished';
  }
  function formatTime(seconds) {
    const ms=Math.round(seconds*100);
    return Math.floor(ms/6000)+':'+String(Math.floor(ms/100)%60).padStart(2,'0')+'.'+String(ms%100).padStart(2,'0');
  }
  return {cars,tracks,HALF,clamp,inputs,validIndex,trackOf,center,elevation,road,gateAt,gateLane,choice,upcoming,newRace,order,step,formatTime};
})();
if (typeof module!=='undefined' && module.exports) module.exports=Race;
