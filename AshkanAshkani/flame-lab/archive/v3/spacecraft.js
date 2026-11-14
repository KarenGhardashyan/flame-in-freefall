import {clamp, interpolate} from './models.js';

const get = id => document.getElementById(id);
const flights = {
  first: {
    name:'Saffire–I', oxygen:21.7, airflow:20, rate:1.8, duration:420,
    front:[[0,0],[20,135],[40,188],[80,258],[120,325],[160,391],[200,455],[240,525],[280,602],[320,684],[360,767],[400,855],[420,891]],
    caption:'Saffire–I · Approximate front positions read from NASA’s concurrent pyrolysis curve. The 1.8 mm/s reference rate describes sustained spread.'
  },
  third: {
    name:'Saffire–III', oxygen:21.2, airflow:25, rate:2.3, duration:320,
    front:[[0,0],[320,736]],
    caption:'Saffire–III · Estimated front position based on the reported comparative spread rate of about 2.3 mm/s.'
  }
};

let flight=flights.first;
let time=120;
let cutoff=null;
let playing=false;
let lastStamp=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');

function state(){
  const stop=cutoff??flight.duration;
  const stopped=time>=stop;
  const front=interpolate(flight.front,Math.min(time,stop));
  const warming=.44+.56*clamp(Math.min(time,stop)/20);
  const cooling=cutoff!==null&&stopped?clamp(1-(time-stop)/2.5):0;
  const power=warming*(stopped?cooling:1);
  const ventilationOff=stopped&&(cutoff!==null||flight===flights.first);
  const phase=stopped
    ? (cooling>0?'Airflow cutoff':ventilationOff?'Flame extinguished':'End of flight run')
    : time<12?'Ignition':'Concurrent spread';
  return {stop,stopped,front,power,phase,flow:ventilationOff?0:flight.airflow};
}

function render(){
  const view=state();
  get('ship-flow').textContent=view.flow.toFixed(0);
  get('ship-position').textContent=view.front.toFixed(0);
  get('ship-rate').textContent=flight.rate.toFixed(1);
  get('ship-clock').textContent=Math.round(time)+' / '+flight.duration+' s';
  get('ship-time').value=Math.round(time);
  if(get('ship-phase').textContent!==view.phase) get('ship-phase').textContent=view.phase;
  get('ship-phase').dataset.state=view.phase==='Airflow cutoff'||time<12&&!view.stopped?'warning':view.stopped?'off':'stable';
  get('ship-vent-indicator').textContent=view.flow?'AIRFLOW →':'AIRFLOW OFF';
  get('ship-play').textContent=playing?'Pause':'Play';
  get('ship-model-label').textContent=cutoff!==null?'HYPOTHETICAL AIRFLOW CUTOFF':'FLIGHT RECONSTRUCTION';
  get('ship-air-note').textContent=cutoff!==null?'Hypothetical cutoff at '+Math.round(cutoff)+' s. The modeled front stops advancing.':flight===flights.first?'NASA switched off the airflow at the end of this run.':'End of the reported 320-second run.';
  get('ship-chart-caption').textContent=flight.caption+(cutoff!==null?' Amber dashed line: front held after the hypothetical cutoff.':'');
  drawDuct(view);
  drawPlot(view);
}

function selectFlight(key){
  flight=flights[key];
  time=120;
  cutoff=null;
  playing=false;
  for(const button of document.querySelectorAll('[data-mission]')) button.setAttribute('aria-pressed',String(button.dataset.mission===key));
  get('ship-cut').checked=false;
  get('ship-time').max=flight.duration;
  get('ship-oxygen').textContent=flight.oxygen.toFixed(1)+' vol%';
  get('mission-label').textContent=flight.name;
  get('ship-end').textContent=flight.duration+' s';
  render();
}

for(const button of document.querySelectorAll('[data-mission]')) button.addEventListener('click',()=>selectFlight(button.dataset.mission));
get('ship-cut').addEventListener('change', event=>{
  cutoff=event.target.checked?Math.min(Math.floor(time),flight.duration-1):null;
  render();
});
get('ship-time').addEventListener('input', event=>{
  time=+event.target.value;
  playing=false;
  render();
});
get('ship-play').addEventListener('click',()=>{
  if(time>=flight.duration) time=0;
  playing=!playing;
  render();
});
get('ship-reset').addEventListener('click',()=>{
  time=0;
  cutoff=null;
  playing=false;
  get('ship-cut').checked=false;
  render();
});

function canvas(id){
  const node=get(id), w=node.clientWidth,h=node.clientHeight;
  const dpr=Math.min(2,devicePixelRatio||1);
  const width=Math.round(w*dpr),height=Math.round(h*dpr);
  if(node.width!==width||node.height!==height){
    node.width=width;
    node.height=height;
  }
  const ctx=node.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  return {ctx,w,h};
}
function flameGlow(ctx,x,y,rx,ry,warm){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(rx,ry);
  const glow=ctx.createRadialGradient(0,0,0,0,0,1);
  glow.addColorStop(0,warm?'#ffe3a6d9':'#9bdbffa3');
  glow.addColorStop(.26,warm?'#ff9d60ac':'#438ff57c');
  glow.addColorStop(.62,warm?'#f44a254d':'#265fe933');
  glow.addColorStop(1,'#0b152000');
  ctx.fillStyle=glow;
  ctx.fillRect(-1,-1,2,2);
  ctx.restore();
}
function drawDuct({front,power,flow}){
  const {ctx,w,h}=canvas('ship-canvas');
  if(w<10||h<10) return;
  const left=w*.073,right=w*.93,top=h*.21,bottom=h*.81;
  const center=(top+bottom)/2;
  const start=left+(right-left)*.10,end=right-(right-left)*.085;
  const sampleHeight=Math.min((bottom-top)*.59,(end-start)*.432);
  const upper=center-sampleHeight/2, lower=center+sampleHeight/2;
  const zoneStart=front/940*(end-start)+start;
  const bg=ctx.createLinearGradient(0,top,0,bottom);
  bg.addColorStop(0,'#213241');
  bg.addColorStop(.5,'#101821');
  bg.addColorStop(1,'#1b2b37');
  ctx.fillStyle=bg;ctx.fillRect(left,top,right-left,bottom-top);
  ctx.strokeStyle='#5a728595';ctx.strokeRect(left,top,right-left,bottom-top);
  ctx.fillStyle='#344857';ctx.fillRect(left,top,6,bottom-top);ctx.fillRect(right-6,top,6,bottom-top);
  ctx.strokeStyle='#5d798b54';
  for(const wall of [top+10,bottom-10]){
    ctx.beginPath();ctx.moveTo(left,wall);ctx.lineTo(right,wall);ctx.stroke();
  }
  const speedTime=reduced.matches?0:time;
  if(flow>0){
    for(let i=0;i<28;i++){
      const lane=i%2===0?upper-12-(i%4)*2:lower+12+(i%4)*2;
      const x=left+9+((i*.369+speedTime*.009*(flow/20))%1)*(right-left-27);
      ctx.strokeStyle=i%5===0?'#8dd7f58c':'#6090ac50';
      ctx.beginPath();ctx.moveTo(x,lane);ctx.lineTo(x+6+flow*.31,lane);ctx.stroke();
    }
  }
  const cloth=ctx.createLinearGradient(0,upper,0,lower);
  cloth.addColorStop(0,'#6f766b');cloth.addColorStop(.5,'#a3997b');cloth.addColorStop(1,'#666c65');
  ctx.fillStyle=cloth;ctx.fillRect(start,upper,end-start,sampleHeight);
  ctx.save();
  ctx.beginPath();ctx.rect(start,upper,end-start,sampleHeight);ctx.clip();
  ctx.strokeStyle='#c8c5ab30';ctx.lineWidth=.7;
  for(let y=upper+2;y<lower;y+=4){
    ctx.beginPath();ctx.moveTo(start,y);ctx.lineTo(end,y);ctx.stroke();
  }
  for(let x=start+2;x<end;x+=5){
    ctx.beginPath();ctx.moveTo(x,upper);ctx.lineTo(x,lower);ctx.stroke();
  }
  function edgeAt(fraction){
    const amplitude=clamp(front/160)*(end-start)*.046;
    return zoneStart+amplitude*(Math.sin(fraction*7)-.55*Math.cos(fraction*14));
  }
  ctx.fillStyle='#1b2023';
  ctx.beginPath();ctx.moveTo(start,upper);
  for(let i=0;i<=22;i++) ctx.lineTo(edgeAt(i/22),upper+sampleHeight*i/22);
  ctx.lineTo(start,lower);ctx.closePath();ctx.fill();
  if(power>0){
    ctx.globalCompositeOperation='screen';
    const flutter=reduced.matches?0:Math.sin(time*2*Math.PI*(time<90?1.4:.75))*(time<90?.10:.035);
    ctx.globalAlpha=clamp(power+flutter);
    for(let i=0;i<=21;i++){
      const fraction=i/21,y=upper+sampleHeight*fraction;
      const extent=12+Math.max(0,Math.sin(i*2.1+speedTime*.3))*11;
      const x=edgeAt(fraction);
      flameGlow(ctx,x-3,y,Math.max(8,extent*.55),sampleHeight*.08,false);
      flameGlow(ctx,x+4,y,extent,sampleHeight*.12,true);
      ctx.fillStyle=i%4?'#e88854':'#fce8c9';
      ctx.fillRect(x-13-(i*7%15),y-1,2,2);
    }
  }
  ctx.restore();
  ctx.strokeStyle='#d3d3bc4d';ctx.strokeRect(start,upper,end-start,sampleHeight);
  ctx.font=(w<460?'9':'10')+'px ui-monospace, monospace';ctx.fillStyle='#bedaeb';
  ctx.fillText(flow>0?'DUCT INLET  →':'FORCED FLOW OFF',left+12,top-8);
  ctx.textAlign='right';ctx.fillText('SIBAL · 940 mm',end,bottom+14);ctx.textAlign='left';
  const marker=clamp(zoneStart,start,end);
  ctx.strokeStyle='#ffe1acb1';ctx.setLineDash([3,3]);ctx.beginPath();
  ctx.moveTo(marker,lower+4);ctx.lineTo(marker,bottom-4);ctx.stroke();ctx.setLineDash([]);
}
function drawPlot({front,stop}){
  const {ctx,w,h}=canvas('ship-plot');
  if(w<120||h<120) return;
  const left=49,right=w-20,top=28,bottom=h-35;
  const x=value=>left+(right-left)*value/flight.duration;
  const y=value=>bottom-(bottom-top)*value/1000;
  ctx.font='11px ui-monospace, monospace';
  ctx.fillStyle='#b1c2d5';ctx.fillText('Front position (mm)',left,15);
  ctx.strokeStyle='#2b3d4f';ctx.textAlign='right';
  for(let mm=0;mm<=1000;mm+=250){
    ctx.beginPath();ctx.moveTo(left,y(mm));ctx.lineTo(right,y(mm));ctx.stroke();
    ctx.fillText(mm,left-7,y(mm)+4);
  }
  ctx.textAlign='center';
  for(let t=0;t<=flight.duration;t+=flight===flights.first?105:80){
    ctx.beginPath();ctx.moveTo(x(t),top);ctx.lineTo(x(t),bottom);ctx.stroke();
    ctx.fillText(t,x(t),bottom+15);
  }
  ctx.fillText('Experiment time (s)',(left+right)/2,h-3);
  ctx.strokeStyle='#83e5f6';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(x(0),y(0));
  for(const [t,v] of flight.front){
    if(t>stop) break;
    ctx.lineTo(x(t),y(v));
  }
  const end=interpolate(flight.front,stop);
  ctx.lineTo(x(stop),y(end));ctx.stroke();
  if(cutoff!==null){
    ctx.strokeStyle='#ffb084';ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(x(stop),y(end));ctx.lineTo(right,y(end));ctx.stroke();
  }
  ctx.setLineDash([3,4]);ctx.strokeStyle='#c4cdd6';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x(time),top);ctx.lineTo(x(time),bottom);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#ffb084';ctx.beginPath();ctx.arc(x(time),y(front),4,0,Math.PI*2);ctx.fill();
}
function tick(stamp){
  const dt=lastStamp?Math.min(.10,(stamp-lastStamp)/1000):0;
  lastStamp=stamp;
  if(playing){
    time=Math.min(flight.duration,time+dt*Number(get('ship-speed').value));
    if(time>=flight.duration) playing=false;
    render();
  }
  requestAnimationFrame(tick);
}

selectFlight('first');
const resize=new ResizeObserver(render);
resize.observe(get('ship-canvas'));
resize.observe(get('ship-plot'));
requestAnimationFrame(tick);
