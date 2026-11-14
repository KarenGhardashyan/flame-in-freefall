import {clamp, interpolate} from './models.js';

const get = id => document.getElementById(id);
const flights = {
  first: {
    name:'Saffire I', oxygen:21.7, airflow:20, rate:1.8, duration:420,
    front:[[0,0],[20,135],[40,188],[80,258],[120,325],[160,391],[200,455],[240,525],[280,602],[320,684],[360,767],[400,855],[420,891]],
    caption:'Front positions are approximate readings from NASA’s graph. The reference rate of 1.8 mm/s describes sustained spread.',
    ending:'NASA turned off airflow at 420 s. About 10% of the fuel remained.',
    source:'https://ntrs.nasa.gov/api/citations/20170008805/downloads/20170008805.pdf#page=16'
  },
  third: {
    name:'Saffire III', oxygen:21.2, airflow:25, rate:2.3, duration:320,
    front:[[0,0],[320,736]],
    caption:'Estimated position = 2.3 mm/s × time. The line uses a constant reference rate.',
    ending:'The replay ends at the reported 320 s. The exact final front position is unavailable in this source.',
    source:'https://ntrs.nasa.gov/api/citations/20180005168/downloads/20180005168.pdf#page=16'
  },
  sixth: {
    name:'Saffire VI-3', oxygen:30.3, pressure:54.6, airflow:20, duration:783,
    // Slide 17, 10-period moving average, approximate points from the plot.
    // Time is shifted to the reported ignition at 637 s.
    heat:[[0,0],[25,410],[55,610],[115,910],[165,1180],[215,1440],[265,1730],[315,2000],
      [365,2370],[415,2730],[460,2990],[480,3080],[492,700],[514,2900],[545,2390],
      [575,1900],[610,1700],[660,1490],[710,1380],[758,1320],[783,0]],
    caption:'Approximate heat-release trend from NASA’s slide 17, with ignition set to 0 s. The brief dip at the flow change reflects the oxygen sampling transient.',
    ending:'NASA reduced airflow at 483 s and stopped it at 783 s after ignition. The sketch shows relative heat release at a fixed location.',
    source:'https://ntrs.nasa.gov/api/citations/20240007488/downloads/Saffire%20ICES%202024%20Saffire%20presentation072124small.pdf#page=17'
  }
};
let flight=flights.first;
let time=0;
let hasPlayed=false;
let cutoff=null;
let playing=false;
let lastStamp=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');

function state(){
  const stop=cutoff??flight.duration;
  const stopped=time>=stop;
  const heat=flight.heat ? interpolate(flight.heat,time) : null;
  const front=flight.front ? interpolate(flight.front,Math.min(time,stop)) : null;
  const cooling=cutoff!==null&&stopped ? clamp(1-(time-stop)/2.5) : 0;
  const warming=.44+.56*clamp(Math.min(time,stop)/20);
  const power=heat!==null ? clamp(heat/3100) : warming*(stopped?(flight===flights.third&&cutoff===null?1:cooling):1);
  const ventilationOff=stopped&&(cutoff!==null||flight!==flights.third);
  const stageFlow=flight.heat&&time>=483?5:flight.airflow;
  let phase=time<12?'Ignition':flight.heat?'Burn in progress':'Flame spreading';
  if(flight.heat&&time>=483) phase='Airflow reduced';
  if(stopped) {
    phase=cooling>0?'Airflow cutoff':flight.heat?'Airflow ended':ventilationOff?'Flame out':'End of replay';
  }
  return {stop,stopped,front,heat,power,phase,flow:ventilationOff?0:stageFlow};
}

function render(){
  if(get('spacecraft-view').hidden) return;
  const view=state();
  get('ship-flow').textContent=view.flow.toFixed(0);
  get('ship-rate').textContent=flight.heat ? '3.08' : flight.rate.toFixed(1);
  get('ship-position').textContent=flight.heat ? (view.heat/1000).toFixed(2) : (view.front/10).toFixed(1);
  get('ship-clock').textContent=Math.round(time)+' / '+flight.duration+' s';
  get('ship-time').value=Math.round(time);
  if(get('ship-phase').textContent!==view.phase) get('ship-phase').textContent=view.phase;
  get('ship-phase').dataset.state=view.phase==='Airflow cutoff'||view.phase==='Airflow reduced'||time<12&&!view.stopped?'warning':view.stopped?'off':'stable';
  get('ship-vent-indicator').textContent=view.flow?'Airflow →':'Airflow off';
  get('ship-play').textContent=playing?'Pause':view.stopped&&cutoff===null?'Replay':'Play';
  get('ship-model-label').textContent=cutoff!==null?'What-if scenario':flight===flights.third?'Estimated position':'From NASA’s plot';
  get('ship-air-note').textContent=cutoff!==null?'Airflow cut at '+cutoff+' s. The model holds the front at this position.':'Stop airflow at the current time to try a what-if scenario.';
  get('ship-chart-caption').textContent=flight.caption+(cutoff!==null?' Dashed line: estimated position after early cutoff.':'');
  drawDuct(view);
  drawPlot(view);
}

function selectFlight(key){
  flight=flights[key];
  time=120;
  cutoff=null;
  playing=false;
  hasPlayed=false;
  get('ship-mission').value=key;
  get('mission-label').textContent=flight.name;
  get('ship-cut').hidden=Boolean(flight.heat);
  get('ship-milestones').hidden=!flight.heat;
  get('ship-cut').setAttribute('aria-pressed','false');
  get('ship-cut').textContent='Try an early airflow cutoff';
  get('ship-air-note').hidden=Boolean(flight.heat);
  get('ship-time').max=flight.duration;
  get('ship-oxygen').textContent=flight.oxygen.toFixed(1)+'%';
  get('ship-pressure-row').hidden=!flight.pressure;
  get('ship-pressure').textContent=flight.pressure ? flight.pressure.toFixed(1)+' kPa' : '';
  get('ship-sample').textContent=flight.heat?'Two-sided acrylic · 18 cm':'SIBAL fabric · 40.6 × 94 cm';
  get('ship-label2').textContent=flight.heat?'Reported peak heat release':'Reference spread rate';
  get('ship-unit2').textContent=flight.heat?'kW':'mm/s';
  get('ship-label3').textContent=flight.heat?'Estimated heat release':'Estimated front position';
  get('ship-unit3').textContent=flight.heat?'kW':'cm';
  get('ship-graph-title').textContent=flight.heat?'Heat release over time':'Front position over time';
  get('ship-plot').setAttribute('aria-label', flight.heat ? 'Graph of estimated heat release and airflow changes' : 'Graph of estimated front position over time');
  get('ship-view-title').textContent=flight.heat?'Heat release in the duct':'Combustion duct';
  get('ship-legend').textContent=flight.heat?'Flame symbol shows relative heat release':'Schematic flame and remaining sample';
  get('ship-end-note').textContent=flight.ending;
  get('ship-end').textContent=flight.duration+' s';
  get('ship-source').href=flight.source;
  render();
}

get('ship-mission').addEventListener('change',event=>selectFlight(event.target.value));
get('ship-cut').addEventListener('click',()=>{
  cutoff=cutoff===null?Math.min(Math.floor(time),flight.duration-1):null;
  hasPlayed=true;
  const active=cutoff!==null;
  get('ship-cut').setAttribute('aria-pressed',String(active));
  get('ship-cut').textContent=active?'Clear early airflow cutoff':'Try an early airflow cutoff';
  render();
});
function seek(next){
  time=next;
  hasPlayed=true;
  playing=false;
  render();
}
get('ship-time').addEventListener('input', event=>seek(+event.target.value));
for(const button of document.querySelectorAll('[data-ship-time]')){
  button.addEventListener('click',()=>seek(+button.dataset.shipTime));
}
get('ship-play').addEventListener('click',()=>{
  if(!playing&&(!hasPlayed||time>=flight.duration)) time=0;
  hasPlayed=true;
  playing=!playing;
  render();
});
get('ship-reset').addEventListener('click',()=>{
  time=0;
  cutoff=null;
  playing=false;
  hasPlayed=true;
  get('ship-cut').setAttribute('aria-pressed','false');
  get('ship-cut').textContent='Try an early airflow cutoff';
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
  const samplePosition=front===null ? .40 : clamp(front/940);
  const zoneStart=samplePosition*(end-start)+start;
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
  cloth.addColorStop(0,flight.heat?'#37556a':'#6f766b');
  cloth.addColorStop(.5,flight.heat?'#7a9da9':'#a3997b');
  cloth.addColorStop(1,flight.heat?'#354e62':'#666c65');
  ctx.fillStyle=cloth;ctx.fillRect(start,upper,end-start,sampleHeight);
  ctx.save();
  ctx.beginPath();ctx.rect(start,upper,end-start,sampleHeight);ctx.clip();
  ctx.strokeStyle='#c8c5ab30';ctx.lineWidth=.7;
  for(let y=upper+2;!flight.heat&&y<lower;y+=4){
    ctx.beginPath();ctx.moveTo(start,y);ctx.lineTo(end,y);ctx.stroke();
  }
  for(let x=start+2;!flight.heat&&x<end;x+=5){
    ctx.beginPath();ctx.moveTo(x,upper);ctx.lineTo(x,lower);ctx.stroke();
  }
  function edgeAt(fraction){
    const amplitude=clamp(front/160)*(end-start)*.046;
    return clamp(zoneStart+amplitude*(Math.sin(fraction*7)-.55*Math.cos(fraction*14)),start,end);
  }
  if(!flight.heat){
    ctx.fillStyle='#1b2023';
    ctx.beginPath();ctx.moveTo(start,upper);
    for(let i=0;i<=22;i++) ctx.lineTo(edgeAt(i/22),upper+sampleHeight*i/22);
    ctx.lineTo(start,lower);ctx.closePath();ctx.fill();
  }
  if(power>0){
    ctx.globalCompositeOperation='screen';
    const flutter=reduced.matches||flight!==flights.first ? 0 : Math.sin(time*2*Math.PI*(time<90?1.4:.75))*(time<90?.10:.035);
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
  ctx.textAlign='right';ctx.fillText(flight.heat?'PMMA · 180 mm':'SIBAL · 940 mm',end,bottom+14);ctx.textAlign='left';
  if(front!==null){
    const marker=clamp(zoneStart,start,end);
    ctx.strokeStyle='#ffe1acb1';ctx.setLineDash([3,3]);ctx.beginPath();
    ctx.moveTo(marker,lower+4);ctx.lineTo(marker,bottom-4);ctx.stroke();ctx.setLineDash([]);
  }
}
function drawPlot({front,heat,stop}){
  const {ctx,w,h}=canvas('ship-plot');
  if(w<120||h<120) return;
  const left=49,right=w-20,top=28,bottom=h-35;
  const x=value=>left+(right-left)*value/flight.duration;
  const max=flight.heat?4000:1000;
  const y=value=>bottom-(bottom-top)*value/max;
  ctx.font='11px ui-monospace, monospace';
  ctx.textAlign='left';
  ctx.fillStyle='#534b40';ctx.fillText(flight.heat?'Heat release (kW)':'Front position (cm)',left,15);
  ctx.strokeStyle='#ded8cc';ctx.textAlign='right';
  for(let value=0;value<=max;value+=max/4){
    ctx.beginPath();ctx.moveTo(left,y(value));ctx.lineTo(right,y(value));ctx.stroke();
    ctx.fillText(value/(flight.heat?1000:10),left-7,y(value)+4);
  }
  ctx.textAlign='center';
  for(const t of flight.heat?[0,200,400,600,783]:Array.from({length:5},(_,i)=>i*flight.duration/4)){
    ctx.beginPath();ctx.moveTo(x(t),top);ctx.lineTo(x(t),bottom);ctx.stroke();
    ctx.fillText(t,x(t),bottom+15);
  }
  ctx.fillText('Experiment time (s)',(left+right)/2,h-3);
  ctx.strokeStyle='#087782';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(x(0),y(0));
  const values=flight.heat??flight.front;
  for(const [t,v] of values){
    if(t>stop) break;
    ctx.lineTo(x(t),y(v));
  }
  const end=interpolate(values,stop);
  ctx.lineTo(x(stop),y(end));ctx.stroke();
  if(cutoff!==null){
    ctx.strokeStyle='#a5441d';ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(x(stop),y(end));ctx.lineTo(right,y(end));ctx.stroke();
  }
  if(flight.heat){
    ctx.strokeStyle='#a5441d';ctx.setLineDash([3,4]);
    ctx.beginPath();ctx.moveTo(x(483),top);ctx.lineTo(x(483),bottom);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='#a5441d';
    ctx.fillText('Airflow reduced',x(483),top-5);
  }
  ctx.setLineDash([3,4]);ctx.strokeStyle='#9e9485';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x(time),top);ctx.lineTo(x(time),bottom);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#a5441d';ctx.beginPath();ctx.arc(x(time),y(heat??front),4,0,Math.PI*2);ctx.fill();
}
function tick(stamp){
  const dt=lastStamp?Math.min(.10,(stamp-lastStamp)/1000):0;
  lastStamp=stamp;
  if(playing&&!get('spacecraft-view').hidden){
    time=Math.min(flight.duration,time+dt*Number(get('ship-speed').value));
    if(time>=flight.duration) playing=false;
    render();
  }
  requestAnimationFrame(tick);
}

document.addEventListener('lab-viewchange',()=>{
  playing=false;
  render();
});
selectFlight('first');
const resize=new ResizeObserver(render);
resize.observe(get('ship-canvas'));
resize.observe(get('ship-plot'));
requestAnimationFrame(tick);
