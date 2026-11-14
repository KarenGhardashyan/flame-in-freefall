import {clamp, interpolate, filmModel, rodModel, rodBoundary, filmDefaults, rodDefaults} from './models.js';
const $ = (id) => document.getElementById(id);
const report = 'https://ntrs.nasa.gov/api/citations/20210011385/downloads/TM-20210011385.pdf';
const filmSpread = [[11,2.30],[12,2.27],[13,2.22],[14,2.23],[16,2.17],[17,2.18],[18,2.23],[19,2.22],[21,2.24],[22,2.23],[23,2.28],[24,2.25],[25,2.23],[26,2.26],[27,2.32],[28,1.91],[29,1.21],[30,.47],[31,0]];
const radiometer = [0.77,1.25,1.39,1.10,.89,.86,.89,.93,.96,.98,1.00,1.01,1.02,1.02,1.03,1.01,1.01,1.00,1.00,1.00,null,.98,.97,.97,.95,.95,.92,.84,.68,.49,.39,.25,.23,.21,.19,.18].flatMap((v,t) => v === null ? [] : [[t,v]]);
const flowProgram = [[0,3],[27,3],[28,1.5],[29,1.1],[35,1.1]];
const tip = [[0,5],[1,13],[3,10],[5,20],[10,36],[15,53],[20,70],[25,86],[27,90],[32,96],[35,95],[39,94]];
const base = [[0,4],[1,0],[3,0],[5,1],[10,9],[15,19],[20,30],[25,47],[27,52],[32,67],[35,77],[39,86]];
const scenario = {
  liveFilm:{page:34,citation:'§2.2.6–2.2.7 · Figures 2.11–2.12'},
  film: {duration:35, start:18, fuel:'PMMA (acrylic)', geometry:'100 µm film', direction:'Opposed', oxygen:'Near ambient', page:32, citation:'§2.2.5 · Figures 2.8–2.10', note:'Ventilation falls from 3.0 to 1.1 cm/s near the end of this test. The visible flame shrinks, turns blue, and disappears around 30 s.'},
  rod: {page:83,citation:'§6.1.4.4 · Figure 6.9 & Eq. 6.1'},
  fabric: {duration:39,start:20, fuel:'SIBAL fabric', geometry:'22 mm wide strip', direction:'Concurrent', oxygen:'21 vol%', page:105, citation:'§7.2 · Figure 7.2', note:'At 10 cm/s, the flame grows, spreads with the ventilation, and decays as it approaches the end of the sample.'}
};
const frames = {film:[27,28,29,30],fabric:[.52,1.03,3.62,5.69,10.86,20.17,24.83,36.20]};
let currentFrame;
const channels = {
  film: [['spread','Spread rate'],['radiometer','Radiometer'],['flow','Flow profile']],
  fabric: [['tip','Flame tip / base'],['length','Flame length']],
  rod: [['boundary','Flammability boundary']],
  liveFilm: [['filmModel','Model spread rate']]
};
const data = {
  spread:{points:filmSpread,max:3,label:'Spread rate (mm/s)',caption:'Fig. 2.8 · Approximate leading-edge points read from the NASA plot. Values before 11 s are omitted.'},
  radiometer:{points:radiometer,max:1.5,label:'Radiometer reading',caption:'Fig. 2.10 · Approximate readings from the NASA plot. Residual signal persists after visible extinction.'},
  flow:{points:flowProgram,max:4,label:'Ventilation (cm/s)',caption:'Fig. 2.9 · Flow annotations at 27–30 s. The hold before 27 s and interpolation between observations are illustrative.'},
  tip:{points:tip,second:base,max:110,label:'Position (mm)',caption:'Fig. 7.2 · Approximate curves read from the NASA plot. Cyan is the flame tip and amber is the flame base.'},
  length:{points:tip.map(([t,v],i)=>[t,v-base[i][1]]),max:50,label:'Flame length (mm)',caption:'Fig. 7.2 · Flame length calculated from the approximate tip and base positions.'}
};
let mode='liveFilm', time=0, playing=false, phaseClock=0, last=0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const isLive = () => mode === 'rod' || mode === 'liveFilm';
const controls = {
  liveFilm:{defaults:filmDefaults,active:true,power:.85,warm:.9,travel:0,paused:false,clock:0},
  rod:{defaults:rodDefaults,active:true,power:.82,warm:.58,travel:0,paused:false,clock:0}
};
function liveValues(){
  if(mode==='liveFilm'){
    const flow=+$('filmFlow').value, oxygen=+$('filmO2').value, thickness=+$('filmThickness').value;
    return {flow,oxygen,thickness,...filmModel(flow,oxygen,thickness)};
  }
  const flow=+$('flow').value, oxygen=+$('o2').value, radius=+$('radius').value;
  return {flow,oxygen,radius,...rodModel(flow,oxygen,radius)};
}
function liveCondition(){
  const v=liveValues(), state=controls[mode];
  const thin=mode==='liveFilm';
  const dead=v.margin<=0;
  const near=v.margin<=(thin ? .55 : .25);
  const loss=thin||v.branch==='quench'?'Quenching':'Blowoff';
  if(v.outside) return {label:'Outside fit',status:'off',power:0,warm:0,...v};
  if(dead) return {label:state.power>.045?loss:'Extinguished',status:state.power>.045?'warning':'off',power:0,warm:0,...v};
  if(!state.active) return {label:'Ready to ignite',status:'off',power:0,warm:0,...v};
  if(thin&&state.travel>=100) return {label:'Sample consumed',status:'off',power:0,warm:0,...v};
  const oxygenLevel=thin?(v.oxygen-16)/5:clamp((v.oxygen-13.5)/6);
  const marginLevel=clamp(v.margin/(thin?3.5:2.3));
  const power=.25+.74*Math.sqrt(marginLevel)*(.7+.3*oxygenLevel);
  const warm=clamp((.12+.88*oxygenLevel)*marginLevel);
  return {label:near?'Near extinction':'Sustained flame',status:near?'warning':'stable',power,warm,...v};
}
function tickLive(dt){
  const state=controls[mode], outcome=liveCondition();
  if(outcome.outside){
    state.power=0;
    state.warm=0;
    return;
  }
  if(outcome.margin<=0) state.active=false;
  if(state.paused){
    state.power=outcome.power;
    state.warm=outcome.warm;
    return;
  }
  state.clock+=dt;
  const easing=1-Math.exp(-dt*(outcome.label==='Blowoff'?5.8:3.3));
  state.power+=(outcome.power-state.power)*easing;
  state.warm+=(outcome.warm-state.warm)*easing;
  if(mode==='liveFilm'&&state.active) state.travel=Math.min(100,state.travel+outcome.spread*dt);
}
function setMetric(index,label,value,unit=''){
  $('label'+index).textContent=label;
  const node=$('value'+index);
  node.textContent=value;
  if(unit && value!=='—'){
    const span=document.createElement('span');
    span.textContent=unit;
    node.append(span);
  }
}
function condition(){
  if(isLive()){
    const result=liveCondition(), state=controls[mode];
    const power=result.outside||state.power<.025?0:state.power;
    return [result.label,result.status,power,state.warm,result.flow];
  }
  if(mode==='film'){
    const flow=interpolate(flowProgram,time);
    if(time>=30) return ['Extinguished','off',0,0,flow];
    if(time>=27) return ['Radiative cooling','warning',1-.23*(time-27),clamp(1-.64*(time-27)),flow];
    if(time<3) return ['Ignition','warning',.66+.1*time,.78,flow];
    return ['Steady spread','stable',1,1,flow];
  }
  const length=interpolate(data.length.points,time);
  const power=clamp(length/39);
  if(time>=39) return ['End of replay','off',0,0,10];
  const label=time<3.6?'Ignition':time<19?'Growth':time<27?'Steady spread':'Decay';
  return [label,time<3.6||time>=27?'warning':'stable',Math.max(.2,power),.8,10];
}
function update(){
  const [label,status]=condition();
  if($('phase').textContent!==label) $('phase').textContent=label;
  $('phase').dataset.state=status;
  if(isLive()){
    const v=liveValues(), state=controls[mode];
    $('scope-o2').textContent=v.oxygen.toFixed(1)+'%';
    $('scope-flow').textContent=v.flow.toFixed(1)+' cm/s';
    $('ignite').disabled=v.margin<=0||Boolean(v.outside);
    $('hold').textContent=state.paused?'Resume animation':'Pause animation';
    $('hold').setAttribute('aria-pressed',String(state.paused));
    if(mode==='liveFilm'){
      $('filmO2-out').textContent=v.oxygen.toFixed(1)+' vol%';
      $('filmFlow-out').textContent=v.flow.toFixed(1)+' cm/s';
      $('film-note').textContent=v.margin<=0?'Below the estimated low-flow cutoff. Raise oxygen or airflow, then ignite again.': 'At this oxygen level the estimated low-flow cutoff is '+v.threshold.toFixed(2)+' cm/s. Lower oxygen raises that cutoff.';
      setMetric(1,'MODEL SPREAD RATE',v.spread.toFixed(2),'mm/s');
      setMetric(2,'LOW-FLOW CUTOFF',v.threshold.toFixed(2),'cm/s');
      setMetric(3,'FRONT ADVANCE',state.travel.toFixed(1),'mm');
    }else{
      $('flow-out').textContent=v.flow.toFixed(1)+' cm/s';
      $('o2-out').textContent=v.oxygen.toFixed(1)+' vol%';
      $('rod-note').textContent=v.outside
        ? 'Outside the displayed fit. Reduce flow or select a larger rod.'
        : v.margin<=0
          ? (v.branch==='quench'
            ? 'Low-flow branch: radiative losses can cool the flame to extinction.'
            : 'High-stretch branch: the flame can detach at the rod tip.')
          : 'This point is above the fitted oxygen boundary. Approach the curve to see the flame weaken.';
      setMetric(1,'STRETCH RATE',v.a.toFixed(1),'s⁻¹');
      setMetric(2,'BOUNDARY OXYGEN',v.outside?'—':v.threshold.toFixed(2),'vol%');
      setMetric(3,'OXYGEN MARGIN',v.outside?'—':(v.margin>=0?'+':'')+v.margin.toFixed(2),'pp');
    }
  }else{
    updateFrame();
    $('time').value=time;
    $('clock').textContent=time.toFixed(1)+' / '+scenario[mode].duration+' s';
    if(mode==='film'){
      const spread=interpolate(filmSpread,time);
      setMetric(1,'FLOW PROFILE',interpolate(flowProgram,time).toFixed(1),'cm/s');
      setMetric(2,'SPREAD RATE',spread?.toFixed(2)??'—','mm/s');
      setMetric(3,'RADIOMETER SIGNAL',interpolate(radiometer,time).toFixed(2));
    }else{
      setMetric(1,'FLAME TIP',interpolate(tip,time).toFixed(1),'mm');
      setMetric(2,'FLAME BASE',interpolate(base,time).toFixed(1),'mm');
      setMetric(3,'FLAME LENGTH',interpolate(data.length.points,time).toFixed(1),'mm');
    }
  }
  drawPlot();
}
function updateFrame(){
  const times=frames[mode];
  const index=Math.max(0,times.findLastIndex(t=>t<=time));
  const stamp=times[index];
  const filename=mode+'-'+index;
  const img=$('frame-image');
  if(img.dataset.filename!==filename){
    img.dataset.filename=filename;
    img.src='media/'+filename+'.webp';
    img.alt='NASA experiment frame at '+stamp+' seconds';
  }
  currentFrame=stamp;
  $('frame-time').textContent=stamp+' s';
  $('frame-caption').textContent=(mode==='film'?'Fig. 2.9':'Fig. 7.2')+(time<times[0]?' · First published frame':' · Latest published frame at this time');
}
$('frame').addEventListener('click',()=>{
  time=currentFrame;
  playing=false;
  playLabel();
  update();
});
function choose(next){
  mode=next;
  const info=scenario[mode];
  time=info.start??0;
  playing=false;
  for(const button of document.querySelectorAll('[data-case]')){
    const selected=button.dataset.case===mode;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',selected);
  }
  const live=isLive(), rod=mode==='rod';
  $('rod-settings').hidden=!rod;
  $('film-settings').hidden=mode!=='liveFilm';
  $('replay-settings').hidden=live;
  $('live-actions').hidden=!live;
  $('scope-values').hidden=!live;
  $('scrub').hidden=live;
  $('clock').hidden=live;
  $('play').hidden=live;
  $('speed').parentElement.hidden=live;
  $('control-type').textContent=live?'LIVE SIMULATION':'EXPERIMENT REPLAY';
  $('control-title').textContent=live?'Chamber controls':'Test conditions';
  $('telemetry-title').textContent=rod?'Flammability map':live?'Spread rate by airflow':'Experiment telemetry';
  $('channel').parentElement.hidden=live;
  $('orientation').textContent=mode==='film'||mode==='liveFilm'?'TOP VIEW':'SIDE VIEW';
  $('case-source').textContent=info.citation;
  $('case-source').href=report+'#page='+info.page;
  if(!live){
    for(const id of ['fuel','geometry','direction','oxygen']) $(id).textContent=info[id];
    $('replay-note').textContent=info.note;
    $('time').max=info.duration;
    $('time-end').textContent=info.duration+' s';
  }
  $('channel').replaceChildren(...channels[mode].map(([value,label])=>new Option(label,value)));
  playLabel();
  update();
}
function playLabel(){
  $('play').textContent=playing?'Pause replay':'Play replay';
}
$('play').addEventListener('click',()=>{
  if(time>=scenario[mode].duration) time=0;
  playing=!playing;
  playLabel();
  update();
});
$('reset').addEventListener('click',()=>{
  if(isLive()){
    const state=controls[mode];
    for(const [id,value] of Object.entries(state.defaults)) $(id).value=value;
    Object.assign(state,{active:true,power:.82,warm:.74,travel:0,paused:false,clock:0});
  }else time=0;
  playing=false;
  playLabel();
  update();
});
$('time').addEventListener('input',()=>{
  time=+$('time').value;
  playing=false;
  playLabel();
  update();
});
for(const button of document.querySelectorAll('[data-case]')) button.addEventListener('click',()=>choose(button.dataset.case));
for(const id of ['flow','o2','radius','filmO2','filmFlow','filmThickness','channel']) $(id).addEventListener('input',update);
for(const button of document.querySelectorAll('[data-preset]')){
  button.addEventListener('click',()=>{
    const [flow,o2]=({stable:[3,14.5],quench:[.2,15],blowoff:[29,14.5]})[button.dataset.preset];
    $('radius').value=0.476;
    $('flow').value=flow;
    $('o2').value=o2;
    reignite();
  });
}
for(const button of document.querySelectorAll('[data-film-preset]')){
  button.addEventListener('click',()=>{
    const [oxygen,flow]=({air:[21,5],low:[16,5],limit:[16,3.7]})[button.dataset.filmPreset];
    $('filmO2').value=oxygen;
    $('filmFlow').value=flow;
    $('filmThickness').value=100;
    controls.liveFilm.travel=0;
    reignite();
  });
}
function reignite(){
  const v=liveValues(), state=controls[mode];
  if(v.margin>0&&!v.outside){
    state.active=true;
    if(state.travel>=100) state.travel=0;
  }
  update();
}
$('ignite').addEventListener('click',reignite);
$('hold').addEventListener('click',()=>{
  controls[mode].paused=!controls[mode].paused;
  update();
});
function surface(canvas){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  const dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
    canvas.width=Math.round(w*dpr);
    canvas.height=Math.round(h*dpr);
  }
  const c=canvas.getContext('2d');
  c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,w,h);
  return {c,w,h};
}
function path(c,points,x,y){
  c.beginPath();
  points.forEach(([a,b],i)=>i?c.lineTo(x(a),y(b)):c.moveTo(x(a),y(b)));
}
const boundary=Array.from({length:301},(_,i)=>[i/2,rodBoundary(i/2)]);
function drawPlot(){
  const {c,w,h}=surface($('plot'));
  if(w<120||h<120) return;
  const item=data[$('channel').value];
  const rod=mode==='rod';
  const liveFilm=mode==='liveFilm';
  const maxX=rod?150:liveFilm?20:scenario[mode].duration;
  const minY=rod?12:0, maxY=rod?21:liveFilm?3.2:item.max;
  const left=47,right=w-15,top=31,bottom=h-38;
  const x=(v)=>left+v/maxX*(right-left), y=(v)=>bottom-(v-minY)/(maxY-minY)*(bottom-top);
  c.font='11px ui-monospace, monospace';
  c.fillStyle='#b4c3d3';
  c.fillText(rod?'Oxygen (vol%)':liveFilm?'Spread rate (mm/s)':item.label,left,18);
  c.textAlign='right';
  for(let i=0;i<=4;i++){
    const v=minY+(maxY-minY)*i/4;
    c.strokeStyle='#2b3949';
    path(c,[[0,v],[maxX,v]],x,y);c.stroke();
    c.fillText(+v.toFixed(2),left-7,y(v)+4);
  }
  c.textAlign='center';
  const ticks=rod?[0,30,60,90,120,150]:Array.from({length:Math.floor(maxX/5)+1},(_,i)=>i*5);
  for(const v of ticks){
    c.strokeStyle='#253242';
    path(c,[[v,minY],[v,maxY]],x,y);c.stroke();
    c.fillText(v,x(v),bottom+16);
  }
  c.fillText(rod?'Normalized stretch rate (s⁻¹)':liveFilm?'Opposed airflow (cm/s)':'Time (s)',(left+right)/2,h-5);
  c.save();
  c.beginPath();c.rect(left-1,top-1,right-left+2,bottom-top+2);c.clip();
  if(rod){
    path(c,boundary,x,y);
    c.lineTo(right,top);c.lineTo(left,top);c.closePath();
    c.fillStyle='#75e8fa18';c.fill();
    c.strokeStyle='#79e6f5';c.lineWidth=2;
    path(c,boundary,x,y);c.stroke();
    const {a,oxygen,outside}=liveValues();
    if(!outside) dot(c,x(a),y(oxygen),5,'#ffad78');
    $('plot-caption').textContent='Fig. 6.9 · Cyan curve: empirical boundary (Eq. 6.1). Amber point: current conditions. Shading: above the fit.';
  }else if(liveFilm){
    const {flow,oxygen,thickness,threshold,spread}=liveValues();
    c.fillStyle='#f4997021'; c.fillRect(left,top,x(threshold)-left,bottom-top);
    const references=[[16,'#8a9fe8'],[21,'#829aab']].filter(([reference])=>reference!==oxygen);
    for(const [reference,color] of [...references,[oxygen,'#78e7f4']]){
      const points=Array.from({length:101},(_,i)=>[i/5,filmModel(i/5,reference,thickness).spread]);
      c.setLineDash(reference===oxygen?[]:[4,4]);
      c.lineWidth=reference===oxygen?2.4:1;
      c.strokeStyle=color;
      path(c,points,x,y);c.stroke();
    }
    c.setLineDash([]);
    dot(c,x(flow),y(spread),4.5,'#ffad78');
    $('plot-caption').textContent='Fig. 2.12 · Cyan: model at current O₂ and thickness. Amber: current airflow. Dashed: 16% and 21% O₂ references. Shading: below the current cutoff.';
  }else{
    c.strokeStyle='#7adce9';c.lineWidth=2.3;
    path(c,item.points,x,y);c.stroke();
    for(const [t,v] of item.points) dot(c,x(t),y(v),2.1,'#87e4ef');
    if(item.second){
      c.strokeStyle='#ffad78';
      path(c,item.second,x,y);c.stroke();
      const bv=interpolate(item.second,time);
      if(bv!==null) dot(c,x(time),y(bv),4,'#ffad78');
    }
    c.setLineDash([4,4]);
    c.strokeStyle='#ecf7ff9c';
    path(c,[[time,minY],[time,maxY]],x,y);c.stroke();
    c.setLineDash([]);
    const v=interpolate(item.points,time);
    if(v!==null) dot(c,x(time),y(v),4.5,'#eaffff');
    $('plot-caption').textContent=item.caption;
  }
  c.restore();
}
function dot(c,x,y,r,color){
  c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
}
function glow(c,x,y,sx,sy,stops){
  c.save();c.translate(x,y);c.scale(Math.max(sx,1),Math.max(sy,1));
  const g=c.createRadialGradient(0,0,0,0,0,1);
  stops.forEach(([n,color])=>g.addColorStop(n,color));
  c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();
}
function flame(c,x,y,size,power,warm,direction,clock,stretch=1,pulse=0){
  if(power<=0) return;
  const flicker=1+.028*Math.sin(clock*5.4)+.015*Math.cos(clock*9.1)+pulse*Math.sin(clock*2*Math.PI*1.1);
  const length=size*(.4+.65*power)*flicker*stretch, height=size*(.28+.48*power)*flicker;
  c.save();c.translate(x,y);c.scale(direction,1);
  c.globalCompositeOperation='screen';
  c.globalAlpha=Math.min(1,power+.2);
  glow(c,-length*.14,0,length*1.34,height*.99,[[0,'#144c9f75'],[.58,'#2255b256'],[1,'#193a8900']]);
  const trace=()=>{
    c.beginPath();
    c.moveTo(-length*.91,-height*.22);
    c.bezierCurveTo(-length*.46,-height*.45,-length*.22,-height*.78,length*.12,-height*.68);
    c.bezierCurveTo(length*.56,-height*.69,length*.84,-height*.34,length*.83,0);
    c.bezierCurveTo(length*.83,height*.34,length*.56,height*.69,length*.12,height*.68);
    c.bezierCurveTo(-length*.22,height*.78,-length*.58,height*.36,-length*.84,height*.13);
    c.quadraticCurveTo(-length*1.04,0,-length*.91,-height*.22);
  };
  c.save();trace();c.clip();
  glow(c,length*.24,0,length*.67,height*.77,[[0,'#2872c659'],[.63,'#368de559'],[.85,'#388afc30'],[1,'#378bfd00']]);
  if(warm>.01){
    c.globalAlpha=warm*power;
    glow(c,-length*.21,0,length*.99,height*.57,[[0,'#ff921ac4'],[.39,'#ff70268f'],[.7,'#e642284d'],[1,'#b0241900']]);
    glow(c,length*.08,-height*.02,length*.44,height*.45,[[0,'#ffdb8df7'],[.31,'#ffac4ad9'],[.72,'#ff813d64'],[1,'#ff6a2c00']]);
    glow(c,-length*.51,height*.08,length*.71,height*.21,[[0,'#fc6b3aa0'],[.55,'#fc441c68'],[1,'#f52b1a00']]);
  }
  c.restore();
  const edge=c.createLinearGradient(-length,0,length,0);
  edge.addColorStop(0,'#204d9800');
  edge.addColorStop(.50,'#386eac5c');
  edge.addColorStop(.87,'#5bb6f4b5');
  edge.addColorStop(1,'#84cfff9c');
  trace();c.shadowBlur=12;c.shadowColor='#38a9ff';c.strokeStyle=edge;c.lineWidth=1.4;c.stroke();
  c.restore();
}
function chamber(){
  const {c,w,h}=surface($('flame'));
  if(!w||!h) return;
  const [, ,power,warm,flow]=condition();
  const live=isLive(), model=live?liveCondition():null;
  const clock=reduced.matches?0:live?controls[mode].clock:phaseClock;
  const left=w*.057,right=w*.943, mid=h*.52, top=h*.17,bottom=h*.83;
  const dir=mode==='fabric'?-1:1;
  const bg=c.createRadialGradient(w*.55,mid,0,w*.55,mid,w*.65);
  bg.addColorStop(0,'#182639');bg.addColorStop(.62,'#0c1520');bg.addColorStop(1,'#070b11');
  c.fillStyle=bg;c.fillRect(0,0,w,h);
  c.lineWidth=1;
  c.fillStyle='#101821';c.fillRect(left,top,right-left,bottom-top);
  c.strokeStyle='#627b9090';c.strokeRect(left,top,right-left,bottom-top);
  const frameWidth=right-left;
  for(const edge of [left,right]){
    c.fillStyle='#1b2e3e';c.fillRect(edge-5,top-5,10,bottom-top+10);
    for(const yy of [top+7,bottom-7]) dot(c,edge,yy,2.1,'#83a0ae');
  }
  c.strokeStyle='#4f759c44';
  c.setLineDash([4,6]);c.beginPath();c.moveTo(left,mid);c.lineTo(right,mid);c.stroke();c.setLineDash([]);
  c.fillStyle='#182e3e';c.fillRect(left+frameWidth*.22,bottom,frameWidth*.56,3);
  c.strokeStyle='#2e435759';
  for(let x=left+16;x<right;x+=23){
    c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.stroke();
  }
  for(let y=top+18;y<bottom;y+=19){
    c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();
  }
  const breadth=right-left;
  for(let i=0;i<44;i++){
    const lane=(i*37%89)/89;
    if(lane>.39&&lane<.61) continue;
    const x=left+((i*.61803+clock*(.015+flow*.004)*dir)%1+1)%1*breadth;
    const y=top+(bottom-top)*lane;
    const len=3+Math.min(13,flow*1.1);
    if(flow<=.02) continue;
    c.strokeStyle=i%5===0?'#7bd8ff96':'#6aa5c450';
    c.beginPath();c.moveTo(x,y);c.lineTo(clamp(x+dir*len,left,right),y);c.stroke();
  }
  const xStart=left+breadth*.116, xEnd=right-breadth*.116;
  const unit=xEnd-xStart;
  const thickness=mode==='rod'?27*model.radius/.476:mode==='liveFilm'?6+model.thickness/55:mode==='fabric'?9:7;
  const front=mode==='liveFilm'?xEnd-unit*(.22+.73*controls[mode].travel/100):mode==='film'?xEnd-unit*(.14+.61*clamp(time/30)):mode==='rod'?xStart+unit*.47:xEnd-unit*clamp(interpolate(tip,time)/100);
  const sampleLeft=mode==='rod'?front+3:xStart;
  const sample=c.createLinearGradient(0,mid-thickness,0,mid+thickness);
  sample.addColorStop(0,'#b7c5cc');sample.addColorStop(.38,'#607b92');sample.addColorStop(1,'#293b4b');
  c.fillStyle=sample;c.fillRect(sampleLeft,mid-thickness/2,xEnd-sampleLeft,thickness);
  if(mode!=='rod'){
    const burned=mode==='fabric'?xEnd-unit*clamp(interpolate(base,time)/100):front;
    c.fillStyle='#392c32';c.fillRect(burned,mid-thickness/2,xEnd-burned,thickness);
  }
  const flameSize=Math.min(breadth*.265,h*.43);
  const stretch=live ? .60+.57*clamp(flow/(mode==='rod'?14:8)) : 1;
  const blowoff=mode==='rod'&&model.label==='Blowoff';
  const shift=blowoff?(1-power)*flameSize*.75:0;
  const pulse=mode==='rod'&&model.status==='warning'&&model.branch==='quench' ? .055 : 0;
  if(mode==='fabric'&&power>0){
    // Figure 7.2 tracks a downstream tip and an upstream base.
    const flameLength=interpolate(data.length.points,time)*unit/100;
    const center=front+flameLength*.47;
    flame(c,center,mid,Math.max(4,flameLength*.58),power,warm,-1,clock);
  }else{
    flame(c,front+shift,mid,flameSize,power,warm,-1,clock,stretch,pulse);
  }
  if(power>0&&!blowoff) glow(c,front,mid,flameSize*.18,thickness*2.2,[[0,'#f0dcaa99'],[1,'#f5983200']]);
  c.fillStyle='#a8bfd1';c.font=(w<430?'9':'10')+'px ui-monospace,monospace';
  c.fillText(flow<=.02?'NO FORCED FLOW':dir===1?'VENTILATION →':'← VENTILATION',left+9,top+14);
  const sampleLabel=mode==='rod'?'PMMA ROD':mode==='fabric'?'SIBAL FABRIC':'PMMA FILM';
  c.fillText(sampleLabel,right-c.measureText(sampleLabel).width-9,bottom-7);
  if(power>0){
    c.strokeStyle='#8bb1c37a';c.setLineDash([3,3]);
    c.beginPath();c.moveTo(front,mid+h*.09);c.lineTo(front,mid+h*.19);c.stroke();
    c.setLineDash([]);
    const label=mode==='rod'?'ROD TIP':'FLAME FRONT';
    c.fillText(label,clamp(front-c.measureText(label).width/2,left+3,right-80),mid+h*.19+11);
  }
}
const figures=[
  ['thin-model','Oxygen and film spread rate','Figure 2.12 · NASA computation',34],
  ['slab-geometry','How oxygen changes the burn pattern','Figure 5.4 · PMMA slab',67],
  ['quench','Radiative extinction','Figure 2.9 · PMMA film',32],
  ['rods','Flame shape near extinction','Figure 6.3 · PMMA rods',78],
  ['concurrent','Concurrent spread','Figure 7.2 · SIBAL fabric',105],
  ['blowoff','Local blowoff sequence','Figure 6.8 · PMMA rods',82],
  ['oscillation','Oscillations near quenching','Figure 6.6 · Radiometer',80],
  ['map','Flammability boundary','Figure 6.9 · PMMA rods',83],
  ['geometries','Sample geometries','Figure 1.2 · BASS–II',13],
  ['slab','Flame under decreasing flow','Figure 5.3 · PMMA slab',66],
  ['fabric','Fabric quenching sequence','Figure 7.5 · SIBAL fabric',107],
  ['heat','Heat release rate field','Figure 5.7 · NASA simulation',69],
  ['spread','Measured spread rate','Figure 2.8 · PMMA film',31],
  ['radiometer','Extinction radiometer signal','Figure 2.10 · PMMA film',32]
];
const dialog=$('figure-dialog');
dialog.setAttribute('aria-labelledby','figure-title');
for(const [file,title,sub,page] of figures){
  const button=document.createElement('button');
  button.className='figure';
  const img=new Image();
  img.src='media/'+file+'.webp';img.loading='lazy';img.alt='';
  const name=document.createElement('strong'), info=document.createElement('small');
  name.textContent=title;info.textContent=sub;
  button.append(img,name,info);
  button.addEventListener('click',()=>{
    $('figure-title').textContent=title;
    $('figure-image').src=img.src;
    $('figure-image').alt=title+' — '+sub;
    $('figure-source').href=report+'#page='+page;
    dialog.showModal();
  });
  $('gallery').append(button);
}
choose('liveFilm');
new ResizeObserver(drawPlot).observe($('plot'));
let lastDraw=0, lastMetrics=0;
function animate(stamp){
  const dt=last?Math.min((stamp-last)/1000,.15):0;
  last=stamp;
  phaseClock+=dt;
  if(isLive()) tickLive(dt);
  if(isLive()&&stamp-lastMetrics>180){
    const [label,status]=condition();
    if($('phase').textContent!==label) $('phase').textContent=label;
    $('phase').dataset.state=status;
    if(mode==='liveFilm') setMetric(3,'FRONT ADVANCE',controls[mode].travel.toFixed(1),'mm');
    lastMetrics=stamp;
  }
  if(playing){
    time=Math.min(time+dt*+$('speed').value,scenario[mode].duration);
    if(time>=scenario[mode].duration){playing=false;playLabel();update();}
  }
  if(stamp-lastDraw>30){
    if(playing) update();
    chamber();
    lastDraw=stamp;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
