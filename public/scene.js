'use strict';

const Scene = (() => {
  const clamp=Race.clamp, TAU=2*Math.PI, spacing=9;
  const palettes={
    alpine:{sky:['#6598bb','#ccdcdf','#f6dfbd'],ridges:['#a9bec9','#77929f','#516f70'],grass:['#798859','#7f8d5e'],sand:'#aaa28a',fog:'#b6c8c8',rock:'#858783',sun:.76},
    coast:{sky:['#498fbb','#b8e4ea','#fff0ca'],ridges:['#adcbd3','#88adbb','#608e98'],grass:['#a6a779','#aeae7e'],sand:'#d4bd91',fog:'#ccdddc',rock:'#a4937d',sun:.24},
    canyon:{sky:['#737f9b','#d9a999','#ffd2a2'],ridges:['#cea599','#b68171','#986856'],grass:['#b77d5b','#bb815d'],sand:'#d8a37b',fog:'#dab69d',rock:'#aa6e51',sun:.76}
  };
  const hash=n=>{const s=Math.sin(n*91.721+18.33)*43758.5453;return s-Math.floor(s);};
  function polygon(ctx,points,color) {
    if(points.length<3)return;
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();ctx.fill();
  }
  function line(ctx,a,b,color,width=1) {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
  }
  function ellipse(ctx,x,y,rx,ry,color) {
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();
  }
  function fit(canvas,maxWidth=1280) {
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return false;
    const scale=Math.min(window.devicePixelRatio||1,1.5,maxWidth/rect.width);
    const w=Math.max(2,Math.round(rect.width*scale)),h=Math.max(2,Math.round(rect.height*scale));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    return true;
  }

  // Rings describe cross sections of each body. Wheels, brakes, glazing and
  // paint are actual model faces, so the same car can be viewed from either end.
  function buildCar(car) {
    const mesh=[];
    function face(points,color){mesh.push({points,color});}
    function box(x,y,z,dx,dy,dz,top,side,front=side){
      const a=x-dx/2,b=x+dx/2,c=z-dz/2,d=z+dz/2,h=y+dy;
      face([[a,h,c],[b,h,c],[b,h,d],[a,h,d]],top);
      for(const xx of [a,b])face([[xx,y,c],[xx,y,d],[xx,h,d],[xx,h,c]],side);
      for(const zz of [c,d])face([[a,y,zz],[b,y,zz],[b,h,zz],[a,h,zz]],front);
    }
    const rally=car.body==='rally',proto=car.body==='proto',ev=car.body==='ev';
    const L=rally?2.0:proto?2.52:2.3,B=proto?1.09:1.0, roof=rally?1.52:proto?1.02:1.27;
    const dark='#202a32',carbon='#172027',glass='#293d4b',rim='#b5c1c3';
    const sections=[[-L,B*.85,.57],[-L*.76,B,proto?.68:.79],[-L*.23,B,.81],[L*.36,B,.74],[L*.78,B*.97,.69],[L,B*.85,proto?.40:.54]];
    for(let i=0;i<sections.length-1;i++){
      const [za,wa,ha]=sections[i],[zb,wb,hb]=sections[i+1];
      face([[-wa*.86,ha,za],[wa*.86,ha,za],[wb*.86,hb,zb],[-wb*.86,hb,zb]],car.color);
      for(const s of [-1,1]){
        face([[s*wa*.86,ha,za],[s*wb*.86,hb,zb],[s*wb,hb-.12,zb],[s*wa,ha-.12,za]],s===1?car.light:car.color);
        face([[s*wa,ha-.12,za],[s*wb,hb-.12,zb],[s*wb*.98,.30,zb],[s*wa*.98,.30,za]],s===1?car.color:car.dark);
        face([[s*wa*.98,.30,za],[s*wb*.98,.30,zb],[s*wb*.92,.22,zb],[s*wa*.92,.22,za]],carbon);
      }
    }
    for(const zz of [-L,L])box(0,.24,zz,B*1.72,.26,.07,car.dark,car.dark,car.dark);
    const back=rally?-L*.85:proto?-1.35:-1.49, front=proto?.94:1.22;
    const rz=rally?-.99:proto?-.43:-.54, fz=rally?.29:proto?.19:.26;
    function windowPoint(side,y,z,w){return [side*w,y,z];}
    for(const s of [-1,1]){
      face([windowPoint(s,.78,back,.84),windowPoint(s,roof,rz,.65),windowPoint(s,roof,fz,.63),windowPoint(s,.73,front,.85)],car.dark);
      face([windowPoint(s,.81,back+.12,.845),windowPoint(s,roof-.07,rz+.05,.685),windowPoint(s,roof-.07,fz-.06,.67),windowPoint(s,.79,front-.15,.85)],glass);
      const post=(rz+fz)/2;
      face([[s*.68,roof-.06,post],[s*.68,roof-.06,post+.045],[s*.85,.80,post+.15],[s*.85,.80,post+.08]],'#131e26');
      box(s*.99,.75,.57,.23,.12,.27,car.light,car.dark);
      box(s*1.01,.25,-.05,.07,.09,L*1.4,carbon,carbon);
    }
    face([[-.84,.78,back],[.84,.78,back],[.65,roof,rz],[-.65,roof,rz]],'#304550');
    face([[-.65,roof,rz],[.65,roof,rz],[.63,roof,fz],[-.63,roof,fz]],ev?'#253841':car.light);
    face([[-.63,roof,fz],[.63,roof,fz],[.85,.74,front],[-.85,.74,front]],'#425f6e');
    face([[-.59,roof-.02,fz+.025],[.61,roof-.02,fz+.025],[.73,.97,front*.58],[-.7,.97,front*.58]],'#66808a');
    // Body creases, intake, splitters, registration plate and light signatures.
    for(const s of [-1,1]){
      face([[s*.40,.69,L*.70],[s*.82,.67,L*.78],[s*.84,.53,L*.99],[s*.63,.55,L*.98]],'#c6e7e2');
      box(s*.64,.42,-L-.035,.40,.073,.045,'#ffac83','#cc4936','#ff6045');
      face([[s*.17,.73,L*.55],[s*.20,.71,L*.62],[s*.30,.56,L*.95]],car.dark);
    }
    box(0,.32,L+.03,B*1.18,.115,.035,dark,carbon);
    for(let k=-2;k<=2;k++)box(k*.17,.325,L+.055,.035,.102,.026,'#515a60','#4c5356');
    box(0,.25,-L-.045,.37,.11,.026,'#c4cece','#afb8b8','#d1d9d6');
    box(0,.18,L-.02,B*1.84,.065,.26,'#34414a',carbon);
    if(!ev){
      for(const s of [-1,1]) box(s*.57,.58,-L*.83,.06,proto?.44:.20,.10,dark,dark);
      box(0,proto?1.02:.78,-L*.87,B*(proto?2.13:1.68),.07,.34,'#485258',carbon);
    }
    if(rally){box(0,roof+.015,-.24,.55,.1,.35,'#3e4b52',dark);}
    if(proto) {
      box(0,.79,-1.4,.11,.25,.84,car.light,car.dark);
      face([[-.18,.742,1.12],[.18,.742,1.12],[.14,.52,L*.92],[-.14,.52,L*.92]],'#253139');
    }
    for(const s of [-1,1])for(const z of [-L*.62,L*.60]){
      const radius=rally?.40:.37,cy=radius+.026,cx=s*B*.985,firstFace=mesh.length;
      const circle=(i,r,x)=>[x,cy+r*Math.cos(i*TAU/14),z+r*Math.sin(i*TAU/14)];
      const outer=cx+s*.11,inner=cx-s*.14;
      for(let j=0;j<14;j++)face([circle(j,radius,outer),circle(j+1,radius,outer),circle(j+1,radius,inner),circle(j,radius,inner)],'#21252a');
      face(Array.from({length:14},(_,i)=>circle(i,radius,outer+s*.003)),'#161b20');
      face(Array.from({length:14},(_,i)=>circle(i,radius*.73,outer+s*.008)),rim);
      face(Array.from({length:14},(_,i)=>circle(i,radius*.62,outer+s*.013)),'#344049');
      for(let j=0;j<7;j++)face([circle(j*2,.075,outer+s*.019),circle(j*2+1,radius*.61,outer+s*.019),circle(j*2+1.48,radius*.61,outer+s*.019)],'#c2cacc');
      if(z>0)for(let i=firstFace;i<mesh.length;i++)mesh[i].axle=[cx,z];
    }
    return mesh;
  }
  const meshes=Race.cars.map(buildCar);
  function paintCar(ctx,id,transform,boost=false,wheel=0){
    const mesh=meshes[id], faces=[];
    for(const part of mesh){
      const pts=part.axle && Math.abs(wheel)>.002 ? part.points.map(([x,y,z])=>{
        const [ax,az]=part.axle,dx=x-ax,dz=z-az,c=Math.cos(wheel),s=Math.sin(wheel);
        return transform([ax+dx*c+dz*s,y,az+dz*c-dx*s]);
      }):part.points.map(transform);
      if(pts.some(p=>p[2]<.4))continue;
      faces.push({pts,color:part.color,depth:pts.reduce((sum,p)=>sum+p[2],0)/pts.length});
    }
    if(boost){
      for(const s of [-1,1]){
        const a=transform([s*.63,.32,-2.08]),b=transform([s*.33,.32,-2.08]),c=transform([s*.49,.28,-3.2]);
        faces.push({pts:[a,b,c],color:'#87e7ff',depth:c[2]});
      }
    }
    faces.sort((a,b)=>b.depth-a.depth);
    for(const f of faces)polygon(ctx,f.pts,f.color);
  }
  // The stationary showroom can afford a per-pixel depth buffer. Intersecting
  // wheel arches, tires and trim stay correctly occluded in the close-up.
  function showroomBody(ctx,id,project){
    const w=ctx.canvas.width,h=ctx.canvas.height;
    const image=ctx.getImageData(0,0,w,h),depth=new Float32Array(w*h).fill(Infinity);
    for(const face of meshes[id]){
      const points=face.points.map(project),rgb=parseInt(face.color.slice(1),16);
      const col=[rgb>>16,(rgb>>8)&255,rgb&255];
      const glazing=['#425f6e','#66808a','#293d4b','#304550'].includes(face.color);
      for(let j=1;j<points.length-1;j++){
        const [a,b,c]=[points[0],points[j],points[j+1]];
        const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
        if(Math.abs(det)<.001)continue;
        const left=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),right=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0])));
        const top=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),bottom=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
        for(let y=top;y<=bottom;y++){
          const reflection=glazing?Math.max(0,1-Math.abs(y/h-.486)*13)*.35:0;
          const shade=.93+.09*(1-y/h)+reflection;
          for(let x=left;x<=right;x++){
            const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/det;
            const v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/det;
            if(u<0||v<0||u+v>1)continue;
            const z=u*a[2]+v*b[2]+(1-u-v)*c[2],idx=y*w+x;
            if(z>depth[idx])continue;
            depth[idx]=z;
            for(let k=0;k<3;k++)image.data[idx*4+k]=col[k]*shade+reflection*32;
          }
        }
      }
    }
    ctx.putImageData(image,0,0);
  }
  function garage(canvas,id){
    if(!fit(canvas))return;
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const wall=ctx.createLinearGradient(0,0,0,h);
    wall.addColorStop(0,'#202c31');wall.addColorStop(.6,'#324046');wall.addColorStop(.61,'#263036');wall.addColorStop(1,'#111a20');
    ctx.fillStyle=wall;ctx.fillRect(0,0,w,h);
    const glow=ctx.createRadialGradient(w*.62,h*.38,0,w*.62,h*.38,w*.52);
    glow.addColorStop(0,'#95b5b83b');glow.addColorStop(1,'#6a7e8200');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    for(let i=0;i<8;i++){
      const x=w*(i-.5)/7;line(ctx,[x,h*.60],[x,0],'#101d2238',w*.003);
      line(ctx,[x,h*.61],[w*.5+(x-w*.5)*2.4,h],'#82909127',1);
    }
    for(const y of [.64,.71,.84])line(ctx,[0,h*y],[w,h*y],'#99acad18',1);
    ctx.save();ctx.shadowBlur=w*.021;ctx.shadowColor='#edfff3';
    for(let i=0;i<3;i++)polygon(ctx,[[w*(.08+i*.31),h*.19],[w*(.27+i*.31),h*.14],[w*(.28+i*.31),h*.153],[w*(.09+i*.31),h*.203]],'#c2d4d0');
    ctx.restore();
    const scale=Math.min(w*.178,h*.32),cx=w*.53,cy=h*.70;
    ellipse(ctx,cx,cy+scale*.22,scale*2.3,scale*.43,'#0b12174a');
    ellipse(ctx,cx,cy+scale*.14,scale*1.97,scale*.37,'#080e12a6');
    const transform=([x,y,z])=>[cx+(x*.78-z*.63)*scale,cy+((x*.63+z*.78)*.22-y*.98)*scale,10-x*.63-z*.78-y*.22];
    const footprint=[[-1.16,0,-2.30],[.95,0,-2.46],[1.21,0,-1.33],[1.21,0,1.56],[.86,0,2.30],[-.97,0,2.26],[-1.12,0,1.4]];
    polygon(ctx,footprint.map(transform),'#080e15bc');
    showroomBody(ctx,id,transform);
  }

  // Cache track cross-sections. Junction edges are exact samples, including
  // where the four narrow approach lanes widen into separate roads.
  const geometry=new Map();
  function getGeometry(t) {
    if(geometry.has(t))return geometry.get(t);
    const cuts=new Set([-90,t.length]),lines=t.laps?[0,t.length]:[t.length],signs=[];
    const shifts=t.laps?[-t.length,0,t.length]:[0];
    for(const shift of shifts)for(const [start,end] of t.gates){
      for(const d of [start+shift,end+shift])if(d>-90&&d<t.length+650)cuts.add(d);
      signs.push(shift+start-35);
    }
    for(const d of lines){cuts.add(d);cuts.add(d+1.4);}
    for(let z=-90;z<t.length+650;z+=spacing)cuts.add(z);
    const zs=[...cuts].sort((a,b)=>a-b),bands=[];
    for(let i=0;i<zs.length-1;i++){
      const a=zs[i],b=zs[i+1],g=Race.gateAt(t,(a+b)/2),paths=[];
      for(let r=0;r<(g<0?1:t.roads.length);r++){
        const branch=g<0?-1:r;
        paths.push([Race.road(t,a,branch,g),Race.road(t,b,branch,g)]);
      }
      bands.push({a,b,paths,g,index:Math.floor(a/spacing),ya:Race.elevation(t,a),yb:Race.elevation(t,b),
        line:lines.find(d=>d>=a&&d<b),forkSign:signs.find(d=>d>=a&&d<b)});
    }
    geometry.set(t,bands);return bands;
  }
  function camera(t,p,w,h) {
    const path=Race.frame(t,p),ahead=Race.sample(t,p.d+10,p.route,p.gate,p.x);
    const aheadYaw=Math.atan2(ahead.x-path.x,ahead.z-path.z);
    const delta=Math.atan2(Math.sin(aheadYaw-path.yaw),Math.cos(aheadYaw-path.yaw));
    const yaw=path.yaw+clamp(delta,-.12,.12)*.35+(p.heading||0)*.34;
    const sin=Math.sin(yaw),cos=Math.cos(yaw),back=9.6;
    const cx=path.x-sin*back,cz=path.z-cos*back,cy=path.y+3.35-path.slope*back;
    const slope=clamp(path.slope,-.25,.25)-.030,focal=Math.min(w*.91,h*1.48),horizon=h*.35;
    const rawWorld=(x,y,z)=>[(x-cx)*cos-(z-cz)*sin,y-cy,(x-cx)*sin+(z-cz)*cos];
    const axes=new Map();
    // Road meshes and bottles use the track normal. Car bodies use true
    // world-space coordinates so camera and body rotate about the same axle.
    return {backD:p.d-back,yaw,focal,horizon,slope,rawWorld,
      raw(offset,y,d){
        let b=axes.get(d);
        if(!b){b=Race.base(t,d);axes.set(d,b);}
        return rawWorld(b.x+b.tz*offset,y,b.z-b.tx*offset);
      },
      screen(q){return [w*.5+q[0]*focal/q[2],horizon-(q[1]/q[2]-slope)*focal,q[2]];}
    };
  }
  function clip(ctx,cam,world,color,seal=false) {
    let pts=world.map(p=>cam.raw(...p));
    if(pts.some(p=>p[2]<.8)){
      const cut=[];
      for(let i=0;i<pts.length;i++){
        const a=pts[(i+pts.length-1)%pts.length],b=pts[i];
        if((a[2]<.8)!==(b[2]<.8)){
          const t=(.8-a[2])/(b[2]-a[2]);cut.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),.8]);
        }
        if(b[2]>=.8)cut.push(b);
      }
      pts=cut;
    }
    if(pts.length<3)return;
    polygon(ctx,pts.map(cam.screen),color);
    if(seal){ctx.strokeStyle=color;ctx.lineWidth=.85;ctx.stroke();}
  }
  function sky(ctx,w,h,t,cam){
    const p=palettes[t.theme],base=cam.horizon+cam.slope*cam.focal;
    const grad=ctx.createLinearGradient(0,0,0,Math.max(h*.43,base+h*.12));
    grad.addColorStop(0,p.sky[0]);grad.addColorStop(.68,p.sky[1]);grad.addColorStop(1,p.sky[2]);
    ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    const sun=w*p.sun-Math.sin(cam.yaw)*w*.19,sy=h*.14+cam.slope*h*.17;
    const glow=ctx.createRadialGradient(sun,sy,0,sun,sy,h*.20);
    glow.addColorStop(0,'#fff6d9');glow.addColorStop(.12,'#ffefca');glow.addColorStop(.21,'#fbdfaa8a');glow.addColorStop(1,'#fff0ca00');
    ctx.fillStyle=glow;ctx.fillRect(sun-h*.21,sy-h*.21,h*.42,h*.42);
    for(let layer=0;layer<3;layer++){
      const stepX=w/64,offset=Math.sin(cam.yaw)*.9+Math.cos(cam.yaw)*.32+t.seed*.16+layer*2.3;
      const peak=x=>{
        const n=x/w*8+offset;
        let shape=.52+.27*Math.sin(n*1.13)+.14*Math.sin(n*3.7)+.07*Math.sin(n*11.6);
        if(t.theme==='canyon')shape=Math.min(.72,shape*1.17)+.025*Math.sin(n*21);
        const height=t.theme==='alpine'?.26:t.theme==='coast'?.095:.20;
        return base+h*.08+layer*h*.014-shape*h*height*(1.27-layer*.17);
      };
      let points=[[-stepX,h]];
      for(let i=-1;i<66;i++)points.push([i*stepX,peak(i*stepX)]);
      points.push([w+stepX,h]);polygon(ctx,points,p.ridges[layer]);
      for(let i=-1;i<65;i+=3){
        const x=i*stepX,y=peak(x),ny=peak(x+stepX);
        polygon(ctx,[[x,y],[x+stepX,ny],[x+stepX*3,ny+h*.052],[x+stepX*1.4,ny+h*.023]],
          t.theme==='alpine'&&layer===0?'#dce3df':'#ffffff12');
      }
    }
    const ground=ctx.createLinearGradient(0,base-3,0,h);
    ground.addColorStop(0,p.grass[1]);ground.addColorStop(1,p.grass[0]);
    ctx.fillStyle=ground;ctx.fillRect(0,base,w,h-base);
  }
  function floor(ctx,cam,band,t){
    const {a,b,ya,yb,paths,index}=band,p=palettes[t.theme],l0=paths[0][0].x-paths[0][0].width,l1=paths[0][1].x-paths[0][1].width;
    const edge0=paths[paths.length-1][0],edge1=paths[paths.length-1][1];
    const left= t.laps?18:32,right=t.laps?18:32;
    const grass=p.grass[Math.abs(index)%2];
    clip(ctx,cam,[[l0-left,ya-.18,a],[l1-left,yb-.18,b],[edge1.x+edge1.width+right,yb-.18,b],[edge0.x+edge0.width+right,ya-.18,a]],grass,true);
    if(t.theme==='coast'){
      const x0=l0-14+3*Math.sin(a/45),x1=l1-14+3*Math.sin(b/45);
      clip(ctx,cam,[[x0,ya-.14,a],[x1,yb-.14,b],[l1-left,yb-.14,b],[l0-left,ya-.14,a]],p.sand);
      clip(ctx,cam,[[x0-5,ya-.10,a],[x1-5,yb-.10,b],[l1-left,yb-.10,b],[l0-left,ya-.10,a]],index%4?'#538f9b':'#57939e');
      if(index%3!==0)clip(ctx,cam,[[x0-5,ya-.08,a],[x1-5,yb-.08,b],[x1-5.5,yb-.08,b],[x0-5.4,ya-.08,a]],'#bbd5cf');
    }
  }
  function ribbon(ctx,cam,band,ra,rb,leftA,rightA,leftB,rightB,color,lift=0,seal=false) {
    clip(ctx,cam,[[ra.x+leftA,ra.y+lift,band.a],[rb.x+leftB,rb.y+lift,band.b],[rb.x+rightB,rb.y+lift,band.b],[ra.x+rightA,ra.y+lift,band.a]],color,seal);
  }
  function roads(ctx,cam,band,t) {
    const {index,g,paths}=band;
    for(let route=0;route<paths.length;route++){
      const [a,b]=paths[route], aw=a.width,bw=b.width;
      const strip=(al,ar,bl,br,color,height,seal)=>ribbon(ctx,cam,band,a,b,al,ar,bl,br,color,height,seal);
      const separated=g<0 || aw>3.8;
      if(separated)strip(-aw-.68,aw+.68,-bw-.68,bw+.68,palettes[t.theme].sand);
      const asphalt=t.theme==='canyon'&&g>=0&&route===0?'#665f59':t.theme==='coast'?'#525a5b':'#515559';
      strip(-aw,aw,-bw,bw,asphalt,.016,true);
      for(const side of [-1,1]){
        strip(side*(aw-.24),side*(aw-.12),side*(bw-.24),side*(bw-.12),'#e8e6d8',.026);
        if(separated && (t.laps || (index%14+14)%14<6))
          strip(side*aw,side*(aw+(t.laps?.75:.31)),side*bw,side*(bw+(t.laps?.75:.31)),index%2?'#e7e0cc':'#b85243',.035);
      }
      if(!t.laps && index%2===0 && (g<0||aw>3.5))strip(-.065,.065,-.065,.065,'#dedbc9',.028);
      if(t.laps && band.line!==undefined){
        for(let col=0;col<20;col++)strip(-aw+2*aw*col/20,-aw+2*aw*(col+1)/20,-bw+2*bw*col/20,-bw+2*bw*(col+1)/20,col%2?'#ece9dd':'#263033',.03);
      }
      const grid=Race.lapDistance(t,band.a);
      if(t.laps && grid>t.length-70 && index%2===0){
        const lane=index%4===0?-3.3:3.3;
        strip(lane-.94,lane-.84,lane-.94,lane-.84,'#d9dcca',.035);
        strip(lane+.84,lane+.94,lane+.84,lane+.94,'#d9dcca',.035);
      }
      if(separated && g>=0 && route===paths.length-1 && t.theme!=='alpine'){
        const edge=a.x+aw+.42,end=b.x+bw+.42;
        clip(ctx,cam,[[edge,a.y+.48,band.a],[end,b.y+.48,band.b],[end,b.y+.77,band.b],[edge,a.y+.77,band.a]],'#a7a9a0');
      }
    }
  }
  function prop(ctx,cam,t,x,y,z,kind,seed) {
    const q=cam.raw(x,y,z);
    if(q[2]<2)return;
    const [px,py]=cam.screen(q),scale=cam.focal/q[2];
    if(px<-scale*10||px>ctx.canvas.width+scale*10)return;
    const h=(5.8+hash(seed)*5.3)*scale;
    if(kind==='pine'){
      ctx.fillStyle='#544c3c';ctx.fillRect(px-h*.032,py-h*.52,h*.064,h*.52);
      for(let i=0;i<3;i++){
        const top=py-h*(1-i*.21),base=top+h*.46,spread=h*(.13+i*.028);
        polygon(ctx,[[px,top],[px+spread,base],[px+spread*.12,base+h*.035],[px-spread,base]],['#38594e','#365449','#304f43'][i]);
        polygon(ctx,[[px,top],[px-spread,base],[px-spread*.3,base-h*.032]],'#5c7560');
      }
    } else if(kind==='palm'){
      polygon(ctx,[[px-h*.036,py],[px+h*.044,py],[px+h*.105,py-h*.78],[px+h*.06,py-h*.82]],'#837257');
      for(let k=0;k<7;k++){
        const u=(k-3)/3, tip=px+h*(u*.52+.08),top=py-h*.80;
        polygon(ctx,[[px+h*.08,top],[px+h*(.08+u*.31),top-h*(.24-.08*Math.abs(u))],[tip,top+h*(.09+.16*Math.abs(u))],[px+h*(.08+u*.28),top-h*.058]],k%2?'#4d7257':'#375f52');
      }
    } else if(kind==='house'){
      const w=h*.92;
      polygon(ctx,[[px-w,py],[px-w,py-h*.39],[px,py-h*.48],[px+w*.55,py-h*.32],[px+w*.55,py]],'#e4d6b8');
      polygon(ctx,[[px-w*1.04,py-h*.39],[px-w*.68,py-h*.58],[px,py-h*.62],[px+w*.61,py-h*.33],[px,py-h*.44]],'#b36e54');
      ctx.fillStyle='#49646b';
      for(let i=0;i<3;i++)ctx.fillRect(px-w*.78+i*w*.33,py-h*.29,w*.15,h*.17);
    } else if(kind==='cactus'){
      ctx.strokeStyle='#516951';ctx.lineWidth=Math.max(.7,h*.064);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px,py-h*.69);ctx.moveTo(px,py-h*.27);ctx.lineTo(px-h*.14,py-h*.35);ctx.lineTo(px-h*.14,py-h*.48);ctx.moveTo(px,py-h*.40);ctx.lineTo(px+h*.12,py-h*.47);ctx.lineTo(px+h*.12,py-h*.61);ctx.stroke();ctx.lineCap='butt';
    } else {
      const w=h*.52;
      polygon(ctx,[[px-w,py],[px-w*.83,py-h*.30],[px-w*.46,py-h*.34],[px-w*.39,py-h*.62],[px+w*.38,py-h*.59],[px+w*.55,py-h*.29],[px+w,py]],'#a46c4e');
      polygon(ctx,[[px-w*.39,py-h*.62],[px+w*.38,py-h*.59],[px+w*.46,py-h*.43],[px-w*.45,py-h*.45]],'#c08b65');
      polygon(ctx,[[px+w*.38,py-h*.59],[px+w*.55,py-h*.29],[px+w,py],[px+w*.30,py]],'#8e5844');
    }
  }
  function decorations(ctx,cam,band,t){
    const {b,paths,index,yb}=band;
    if(index%2!==0 || band.b-band.a<6)return;
    for(const side of [-1,1]){
      const seed=index+t.seed*3+side*14,edge=(side<0?paths[0]:paths[paths.length-1])[1];
      const x=edge.x+side*(edge.width+4+hash(seed+3)*12);
      if(t.theme==='coast'&&side<0&&index%6!==0)continue;
      const kind=t.theme==='alpine'?'pine':t.theme==='coast'?(index%6===0&&side>0?'house':'palm'):(index%6===0?'rock':'cactus');
      prop(ctx,cam,t,x,yb,b,kind,seed);
    }
    if(paths.length>1 && index%4===0) {
      const left=paths[0][1],right=paths[1][1];
      if(right.x-left.x>left.width+right.width+8)
        prop(ctx,cam,t,(left.x+right.x)/2,yb,b,t.theme==='alpine'?'pine':t.theme==='coast'?'palm':'rock',index+17);
    }
  }
  function gantry(ctx,cam,t,z,finish){
    const r=Race.road(t,z),left=r.x-Race.HALF-.4,right=r.x+Race.HALF+.4;
    const slab=(x1,x2,y1,y2,color)=>clip(ctx,cam,[[x1,r.y+y1,z],[x2,r.y+y1,z],[x2,r.y+y2,z],[x1,r.y+y2,z]],color);
    slab(left-.18,left+.18,0,5.9,'#465153');slab(right-.18,right+.18,0,5.9,'#465153');
    slab(left-.30,right+.30,4.95,5.9,finish?'#1f2a2c':'#324039');
    if(finish){
      for(let i=0;i<24;i++)for(let row=0;row<2;row++)if((i+row)%2===0)
        slab(left+i*(right-left)/24,left+(i+1)*(right-left)/24,4.98+row*.44,5.42+row*.44,'#e8eadb');
    } else {
      const n=t.roads.length;
      for(let i=0;i<n;i++){
        const x=r.x+Race.gateLane(t,i), offset=(i-(n-1)/2)*.30;
        clip(ctx,cam,[[x-.22,r.y+5.68,z],[x+.22,r.y+5.68,z],[x+.23+offset,r.y+5.41,z],[x+.45+offset,r.y+5.41,z],[x+offset,r.y+5.09,z],[x-.45+offset,r.y+5.41,z],[x-.22+offset,r.y+5.41,z]],'#d6ee69');
      }
    }
  }
  function bottle(ctx,cam,t,item,d,elapsed){
    const r=Race.road(t,d,item.route),q=cam.raw(r.x+item.x,r.y,d);
    if(q[2]<1.4)return;
    const [x,y]=cam.screen(q),scale=cam.focal/q[2],h=1.35*scale,w=.48*scale;
    if(x<-w||x>ctx.canvas.width+w)return;
    const top=y-h*(1.16+.075*Math.sin(elapsed*2.9+item.id));
    const gold=item.amount>35,light=gold?'#ffe587':'#9bffff',paint=gold?'#ffb030':'#29cfed',dark=gold?'#a55f14':'#087aa6';
    ellipse(ctx,x,y,w*1.2,h*.11,'#20323188');
    ellipse(ctx,x,top+h*.55,w*1.45,h*.64,gold?'#ffbf393a':'#20e6ff39');
    polygon(ctx,[[x-w*.73,top+h*.30],[x-w*.38,top+h*.18],[x+w*.38,top+h*.18],[x+w*.78,top+h*.31],[x+w*.78,top+h*.89],[x+w*.47,top+h],[x-w*.5,top+h],[x-w*.73,top+h*.88]],paint);
    polygon(ctx,[[x+w*.30,top+h*.23],[x+w*.78,top+h*.31],[x+w*.78,top+h*.88],[x+w*.40,top+h],[x+w*.30,top+h*.91]],dark);
    ctx.fillStyle=light;ctx.fillRect(x-w*.38,top+h*.06,w*.76,h*.14);
    polygon(ctx,[[x+w*.16,top+h*.32],[x-w*.42,top+h*.62],[x-w*.03,top+h*.63],[x-w*.19,top+h*.90],[x+w*.45,top+h*.53],[x+w*.04,top+h*.53]],'#f6ffed');
  }
  function carOnTrack(ctx,cam,t,p){
    const path=Race.frame(t,p),angle=path.yaw+(p.heading||0),c=Math.cos(angle),s=Math.sin(angle);
    const roll=-clamp((p.steering||0)*p.v*.00045,-.025,.025);
    const project=([x,y,z])=>cam.screen(cam.rawWorld(path.x+(x-y*roll)*c+z*s,
      path.y+y+x*roll+z*path.slope,path.z+z*c-(x-y*roll)*s));
    const shadow=[[-1.02,.02,-2.36],[1.24,.02,-2.30],[1.39,.02,1.75],[1,.02,2.30],[-.89,.02,2.27],[-1.13,.02,1.58]].map(project);
    if(shadow.some(q=>q[2]<.8))return;
    polygon(ctx,shadow,'#1b232a78');
    paintCar(ctx,p.car,project,p.boosting,p.frontAngle||0);
  }
  function draw(canvas,state,driverId){
    if(!fit(canvas))return;
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const t=Race.trackOf(state.track),driver=state.players.find(p=>p.id===driverId);
    if(!driver)return;
    const me=t.laps?{...driver,d:Race.lapDistance(t,driver.d)}:driver;
    const cam=camera(t,me,w,h);sky(ctx,w,h,t,cam);
    const bands=getGeometry(t),distance=t.laps?265:450;
    const cars=state.players.map(p=>{
      if(!t.laps)return p;
      const delta=p.d-driver.d;
      return {...p,d:me.d+delta-Math.round(delta/t.length)*t.length};
    }).sort((a,b)=>b.d-a.d);
    const items=[];
    Race.eachPickup(t,cam.backD,cam.backD+distance+spacing,(item,d)=>{
      if((state.readyAt?.[item.id]||0)<=(state.elapsed||0))items.push({item,d});
    });
    let low=0,high=bands.length;
    while(low<high){const mid=(low+high)>>1;if(bands[mid].a<cam.backD+distance)low=mid+1;else high=mid;}
    let k=items.length-1;
    for(let i=Math.min(low,bands.length-1);i>=0 && bands[i].b>=cam.backD-8;i--){
      const band=bands[i];floor(ctx,cam,band,t);roads(ctx,cam,band,t);decorations(ctx,cam,band,t);
      if(band.forkSign!==undefined)gantry(ctx,cam,t,band.forkSign,false);
      if(band.line!==undefined)gantry(ctx,cam,t,band.line,true);
      while(k>=0 && items[k].d>=band.a){const entry=items[k--];bottle(ctx,cam,t,entry.item,entry.d,state.elapsed||0);}
      for(const p of cars)if(p.d>=band.a&&p.d<band.b&&p.d>cam.backD+20)carOnTrack(ctx,cam,t,p);
    }
    for(const p of cars)if(p.d>cam.backD+2.7 && p.d<=cam.backD+20)carOnTrack(ctx,cam,t,p);
  }
  function preview(canvas,id){
    const t=Race.trackOf(id),r=Race.newRace(id,[{id:0,car:id%Race.cars.length}]);
    const p=r.players[0];p.d=t.laps? t.length-48:t.gates[0][0]-42;p.x=0;
    draw(canvas,r,0);
  }
  return {draw,garage,preview};
})();
