import {spawn} from 'node:child_process';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port=9368;
const profile=mkdtempSync(join(tmpdir(),'coach-design-cdp-'));
const browser=spawn(edge,['--headless','--no-sandbox','--disable-gpu','--hide-scrollbars','--no-first-run','--disable-extensions',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sections=['hero','recognition','requests','meaning','course','personal','business','money','formats','approach','about','questions','closing'];
let ws;
try{
  let ready=false;
  for(let i=0;i<60;i++){
    try{ready=(await fetch(`http://127.0.0.1:${port}/json/version`)).ok;if(ready)break}catch{}
    await delay(250);
  }
  if(!ready)throw new Error('Edge CDP did not start');
  const target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let nextId=0;
  const pending=new Map();
  const errors=[];
  ws.onmessage=({data})=>{
    const message=JSON.parse(data);
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(!message.id)return;
    const item=pending.get(message.id);if(!item)return;pending.delete(message.id);
    if(message.error)item.reject(new Error(message.error.message));else item.resolve(message.result);
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');await send('CSS.enable');
  const url=pathToFileURL(resolve('design-preview/soft-direction.html')).href;
  for(const [width,height] of [[1440,900],[1440,720],[768,900],[390,900],[320,900]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await send('Page.navigate',{url});await delay(650);
    await send('Runtime.evaluate',{expression:'Promise.all([document.fonts.ready,...[...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>null)})])',awaitPromise:true});
    const metrics=await send('Runtime.evaluate',{expression:`JSON.stringify({width:innerWidth,viewportHeight:innerHeight,courseBook:(()=>{const e=document.querySelector('.course__art img');const s=getComputedStyle(e),r=e.getBoundingClientRect();return {asset:e.getAttribute('src'),naturalSize:[e.naturalWidth,e.naturalHeight],fit:s.objectFit,width:r.width,height:r.height,fitsViewport:r.height<=innerHeight&&r.width<=innerWidth}})(),scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,bodyFont:getComputedStyle(document.body).fontSize,cardFont:getComputedStyle(document.querySelector('.request-card p')).fontSize,handFont:getComputedStyle(document.querySelector('.hero__hand')).fontFamily,bodyFamily:getComputedStyle(document.body).fontFamily,approachTypeStyles:[...new Set([...document.querySelectorAll('.approach h2,.approach h3,.approach p,.approach li>span')].map(e=>{const s=getComputedStyle(e);return [s.fontFamily,s.fontSize,s.fontWeight,s.fontStyle].join('|')}))],badImages:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src')),overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left< -1).filter(e=>!e.closest('.course__art,.hero,.closing')).slice(0,15).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width})),sections:[...document.querySelectorAll('main>section')].map(e=>({class:e.className,y:Math.round(e.getBoundingClientRect().top+scrollY),height:Math.round(e.getBoundingClientRect().height)}))})`,returnByValue:true});
    process.stdout.write(metrics.result.value+'\n');
    if(width===1440&&height===900){
      const doc=await send('DOM.getDocument');
      for(const selector of ['.hero__hand','.recognition__hand','.approach__statement','.hero__lead']){
        const {nodeId}=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});
        process.stdout.write(JSON.stringify({selector,...await send('CSS.getPlatformFontsForNode',{nodeId})})+'\n');
      }
    }
    
    const label=height===720?'desktop-short':width===1440?'desktop':width===768?'tablet':width===390?'mobile':'small-mobile';
    for(const section of width===320||width===768||height===720?['course','approach']:sections){
      const bounds=await send('Runtime.evaluate',{expression:`(()=>{const r=document.querySelector('.${section}').getBoundingClientRect();return {y:Math.floor(r.top+scrollY),height:Math.ceil(r.height)}})()`,returnByValue:true});
      const data=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip:{x:0,y:bounds.result.value.y,width,height:bounds.result.value.height,scale:1}});
      writeFileSync(resolve(`design-preview/soft-${label}-${section}.png`),Buffer.from(data.data,'base64'));
    }
    if(width===320||width===768||height===720)continue;
    const full=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});
    writeFileSync(resolve(`design-preview/soft-${label}.png`),Buffer.from(full.data,'base64'));
  }
  process.stdout.write(JSON.stringify({runtimeErrors:errors})+'\n');
}finally{ws?.close();browser.kill()}
