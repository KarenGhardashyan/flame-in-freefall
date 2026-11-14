const $ = (id) => document.getElementById(id);
const report = 'https://ntrs.nasa.gov/api/citations/20210011385/downloads/TM-20210011385.pdf';
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const filmSpread = [[11,2.30],[12,2.27],[13,2.22],[14,2.23],[16,2.17],[17,2.18],[18,2.23],[19,2.22],[21,2.24],[22,2.23],[23,2.28],[24,2.25],[25,2.23],[26,2.26],[27,2.32],[28,1.91],[29,1.21],[30,.47],[31,0]];
const radiometer = [0.77,1.25,1.39,1.10,.89,.86,.89,.93,.96,.98,1.00,1.01,1.02,1.02,1.03,1.01,1.01,1.00,1.00,1.00,null,.98,.97,.97,.95,.95,.92,.84,.68,.49,.39,.25,.23,.21,.19,.18].flatMap((v,t) => v === null ? [] : [[t,v]]);
const flowProgram = [[0,3],[27,3],[28,1.5],[29,1.1],[35,1.1]];
const tip = [[0,5],[1,13],[3,10],[5,20],[10,36],[15,53],[20,70],[25,86],[27,90],[32,96],[35,95],[39,94]];
const base = [[0,4],[1,0],[3,0],[5,1],[10,9],[15,19],[20,30],[25,47],[27,52],[32,67],[35,77],[39,86]];
const scenario = {
  film: {duration:35, start:18, fuel:'PMMA (acrylic)', geometry:'100 µm film', direction:'Opposed', oxygen:'Near ambient', page:32, citation:'§2.2.5 · Figures 2.8–2.10', note:'Ventilation falls from 3.0 to 1.1 cm/s near the end of this test. The visible flame shrinks, turns blue, and disappears around 30 s.'},
  rod: {page:83,citation:'§6.1.4.4 · Figure 6.9 & Eq. 6.1'},
  fabric: {duration:39,start:20, fuel:'SIBAL fabric', geometry:'22 mm wide strip', direction:'Concurrent', oxygen:'21 vol%', page:105, citation:'§7.2 · Figure 7.2', note:'At 10 cm/s, the flame grows, spreads with the ventilation, and decays as it approaches the end of the sample.'}
};
const frames = {film:[27,28,29,30],fabric:[.52,1.03,3.62,5.69,10.86,20.17,24.83,36.20]};
let currentFrame;
const channels = {
  film: [['spread','Spread rate'],['radiometer','Radiometer'],['flow','Flow profile']],
  fabric: [['tip','Flame tip / base'],['length','Flame length']],
  rod: [['boundary','Flammability boundary']]
};
const data = {
  spread:{points:filmSpread,max:3,label:'Spread rate (mm/s)',caption:'Fig. 2.8 · Approximate leading-edge points read from the NASA plot. Values before 11 s are omitted.'},
  radiometer:{points:radiometer,max:1.5,label:'Radiometer reading',caption:'Fig. 2.10 · Approximate readings from the NASA plot. Residual signal persists after visible extinction.'},
  flow:{points:flowProgram,max:4,label:'Ventilation (cm/s)',caption:'Fig. 2.9 · Flow annotations at 27–30 s. The hold before 27 s and interpolation between observations are illustrative.'},
  tip:{points:tip,second:base,max:110,label:'Position (mm)',caption:'Fig. 7.2 · Approximate curves read from the NASA plot. Cyan is the flame tip and amber is the flame base.'},
  length:{points:tip.map(([t,v],i)=>[t,v-base[i][1]]),max:50,label:'Flame length (mm)',caption:'Fig. 7.2 · Flame length calculated from the approximate tip and base positions.'}
};
function interpolate(points,t){
  if(t < points[0][0] || t > points.at(-1)[0]) return null;
  for(let i=1;i<points.length;i++){
    const [end,b]=points[i];
    if(t<=end){
      const [start,a]=points[i-1];
      return a+(b-a)*(t-start)/(end-start);
    }
  }
  return points.at(-1)[1];
}
const limit = (a) => 6*Math.exp(-.5*a)+.0167*a+13.4;
const area = (a) => a < 10.4 ? 'quench' : 'blowoff';
const startValues = {flow:3,o2:14.5,radius:.476};
let mode='film', time=scenario.film.start, playing=false, phaseClock=0, last=0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function rodValues(){
  const U=+$('flow').value, oxygen=+$('o2').value, r=+$('radius').value;
  const a=1.5*U/r*Math.sqrt(r/.318);
  const threshold=limit(a), margin=oxygen-threshold;
  return {U,oxygen,a,threshold,margin,outside:a>150};
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
  if(mode==='rod'){
    const rod=rodValues();
    if(rod.outside) return ['Outside fit','off',0,0,rod.U];
    if(rod.margin<-.2) return [area(rod.a)==='quench'?'Quench region':'Blowoff region','off',0,0,rod.U];
    if(Math.abs(rod.margin)<=.2) return ['Near boundary','warning',.43,.04,rod.U];
    return ['Above boundary','stable',clamp(.55+rod.margin*.14),clamp(rod.margin/4),rod.U];
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
  $('phase').textContent=label;
  $('phase').dataset.state=status;
  if(mode==='rod'){
    const {U,oxygen,a,threshold,margin,outside}=rodValues();
    $('flow-out').textContent=U.toFixed(1)+' cm/s';
    $('o2-out').textContent=oxygen.toFixed(1)+' vol%';
    $('rod-note').textContent=outside?'This point lies beyond the displayed 150 s⁻¹ fit range. Reduce flow or select a larger rod.': Math.abs(margin)<=.2?'Small changes in flow or oxygen can change the outcome near the empirical boundary.':margin>0?'This point is above the fitted oxygen boundary.':area(a)==='quench'?'Below the low-flow branch, heat losses can quench the flame.':'Below the high-stretch branch, a flame can detach at the rod tip.';
    setMetric(1,'STRETCH RATE',a.toFixed(1),'s⁻¹');
    setMetric(2,'BOUNDARY OXYGEN',outside?'—':threshold.toFixed(2),'vol%');
    setMetric(3,'OXYGEN MARGIN',outside?'—':(margin>=0?'+':'')+margin.toFixed(2),'pp');
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
  const rod=mode==='rod';
  $('rod-settings').hidden=!rod;
  $('replay-settings').hidden=rod;
  $('scrub').hidden=rod;
  $('clock').hidden=rod;
  $('play').hidden=rod;
  $('speed').parentElement.hidden=rod;
  $('control-type').textContent=rod?'PARAMETER EXPLORER':'EXPERIMENT REPLAY';
  $('control-title').textContent=rod?'Set conditions':'Test conditions';
  $('telemetry-title').textContent=rod?'Flammability map':'Experiment telemetry';
  $('channel').parentElement.hidden=rod;
  $('orientation').textContent=mode==='film'?'TOP VIEW':'SIDE VIEW';
  $('case-source').textContent=info.citation;
  $('case-source').href=report+'#page='+info.page;
  if(!rod){
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
  if(mode==='rod') Object.entries(startValues).forEach(([id,value])=>{$(id).value=value;});
  else time=0;
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
for(const id of ['flow','o2','radius','channel']) $(id).addEventListener('input',update);
for(const button of document.querySelectorAll('[data-preset]')){
  button.addEventListener('click',()=>{
    const [flow,o2]=({stable:[3,14.5],quench:[.2,15],blowoff:[29,14.5]})[button.dataset.preset];
    $('radius').value=.476;
    $('flow').value=flow;
    $('o2').value=o2;
    update();
  });
}
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
const boundary=Array.from({length:151},(_,a)=>[a,limit(a)]);
function drawPlot(){
  const {c,w,h}=surface($('plot'));
  if(w<120||h<120) return;
  const item=data[$('channel').value];
  const rod=mode==='rod';
  const maxX=rod?150:scenario[mode].duration, minY=rod?12:0, maxY=rod?21:item.max;
  const left=47,right=w-15,top=31,bottom=h-38;
  const x=(v)=>left+v/maxX*(right-left), y=(v)=>bottom-(v-minY)/(maxY-minY)*(bottom-top);
  c.font='11px ui-monospace, monospace';
  c.fillStyle='#b4c3d3';
  c.fillText(rod?'Oxygen (vol%)':item.label,left,18);
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
  c.fillText(rod?'Normalized stretch rate (s⁻¹)':'Time (s)',(left+right)/2,h-5);
  c.save();
  c.beginPath();c.rect(left-1,top-1,right-left+2,bottom-top+2);c.clip();
  if(rod){
    path(c,boundary,x,y);
    c.lineTo(right,top);c.lineTo(left,top);c.closePath();
    c.fillStyle='#75e8fa18';c.fill();
    c.strokeStyle='#79e6f5';c.lineWidth=2;
    path(c,boundary,x,y);c.stroke();
    const {a,oxygen,outside}=rodValues();
    if(!outside) dot(c,x(a),y(oxygen),5,'#ffad78');
    $('plot-caption').textContent='Fig. 6.9 · Cyan curve: empirical boundary (Eq. 6.1). Amber point: current conditions. Shading: above the fit.';
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
function flame(c,x,y,size,power,warm,direction,clock){
  if(power<=0) return;
  const flicker=1+.026*Math.sin(clock*5.4)+.014*Math.cos(clock*9.1);
  const length=size*(.72+.33*power)*flicker, height=size*(.40+.36*power);
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
    c.bezierCurveTo(-length*.22,height*.78,-length*.46,height*.45,-length*.91,height*.22);
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
  trace();c.strokeStyle=edge;c.lineWidth=1.65;c.stroke();
  c.restore();
}
function chamber(){
  const {c,w,h}=surface($('flame'));
  if(!w||!h) return;
  const [, ,power,warm,flow]=condition();
  const clock=reduced.matches?0:phaseClock;
  const left=w*.105,right=w*.895, mid=h*.53, top=h*.20,bottom=h*.81;
  const dir=mode==='fabric'?-1:1;
  const bg=c.createRadialGradient(w*.55,mid,0,w*.55,mid,w*.65);
  bg.addColorStop(0,'#142436');bg.addColorStop(.62,'#0b1421');bg.addColorStop(1,'#080c14');
  c.fillStyle=bg;c.fillRect(0,0,w,h);
  c.lineWidth=1;
  c.strokeStyle='#3e55657a';c.strokeRect(left,top,right-left,bottom-top);
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
  const thickness=mode==='rod'?19*Number($('radius').value)/.476:mode==='fabric'?9:7;
  const front=mode==='film'?xEnd-unit*(.14+.61*clamp(time/30)):mode==='rod'?xStart+unit*.47:xEnd-unit*clamp(interpolate(tip,time)/100);
  const sampleLeft=mode==='rod'?front+3:xStart;
  const sample=c.createLinearGradient(0,mid-thickness,0,mid+thickness);
  sample.addColorStop(0,'#b7c5cc');sample.addColorStop(.38,'#607b92');sample.addColorStop(1,'#293b4b');
  c.fillStyle=sample;c.fillRect(sampleLeft,mid-thickness/2,xEnd-sampleLeft,thickness);
  if(mode!=='rod'){
    const burned=mode==='fabric'?xEnd-unit*clamp(interpolate(base,time)/100):front;
    c.fillStyle='#392c32';c.fillRect(burned,mid-thickness/2,xEnd-burned,thickness);
  }
  const flameSize=Math.min(breadth*.27,h*.46);
  flame(c,front,mid,flameSize, power,warm,mode==='rod'||mode==='film'?-1:1,clock);
  if(power>0) glow(c,front,mid,flameSize*.18,thickness*2.2,[[0,'#f0dcaa99'],[1,'#f5983200']]);
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
choose('film');
new ResizeObserver(drawPlot).observe($('plot'));
let lastDraw=0;
function animate(stamp){
  const dt=last?Math.min((stamp-last)/1000,.15):0;
  last=stamp;
  phaseClock+=dt;
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
