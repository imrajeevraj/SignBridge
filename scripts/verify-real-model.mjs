// Explicit prerecorded-video acceptance test. Never accesses a physical camera.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
const [modelArg,videoArg,outputArg]=process.argv.slice(2);
if(!outputArg)throw new Error('Usage: node scripts/verify-real-model.mjs REAL_MODEL_DIRECTORY REAL_VIDEO NEW_OUTPUT_DIRECTORY');
const model=path.resolve(modelArg),videoPath=path.resolve(videoArg),output=path.resolve(outputArg);
const metadata=JSON.parse(await readFile(path.join(model,'metadata.json'),'utf8'));
if(metadata.purpose!=='trained')throw new Error('Genuine trained package required; fixtures are forbidden.');
const replayWidth=Number(process.env.SIGNBRIDGE_REPLAY_WIDTH??0);
if(replayWidth!==0&&(!Number.isInteger(replayWidth)||replayWidth<160||replayWidth>1920))throw new Error('Replay width must be 0 (native) or 160..1920.');
const port=Number(process.env.SIGNBRIDGE_PORT??18000);
await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
await mkdir(output,{recursive:false});
const profile=await mkdtemp(path.join(tmpdir(),'signbridge-real-model-'));
let context,backend;let backendLog='';
const observations={kind:'PRERECORDED REAL RESEARCH VIDEO, not physical-camera acceptance',sourceVideo:path.basename(videoPath),
  source_sha256:createHash('sha256').update(await readFile(videoPath)).digest('hex'),
  replayTransform:replayWidth?`Uniform spatial resize to width ${replayWidth}; native 1x playback; distinct decoded frames only`:'Native resolution and 1x playback',
  model:metadata.model_id,checkpoint_sha256:metadata.checkpoint_sha256,requests:[],predictions:[],errors:[],visibleLabel:null,passed:false};
try {
  const extension=path.resolve('extension/dist');
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.SIGNBRIDGE_CHROMIUM_PATH,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--use-fake-device-for-media-stream']});
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const origin=`chrome-extension://${new URL(worker.url()).host}`;
  const token=randomBytes(32).toString('hex');
  const python=path.resolve('backend/.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  backend=spawn(python,['-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port',String(port),'--ws-max-size','262144','--ws-max-queue','1'],
    {env:{...process.env,SIGNBRIDGE_MODEL_DIR:model,SIGNBRIDGE_TOKEN:token,SIGNBRIDGE_EXTENSION_ORIGINS:origin},windowsHide:true,stdio:['ignore','pipe','pipe']});
  backend.stdout.on('data',chunk=>{backendLog+=String(chunk);});backend.stderr.on('data',chunk=>{backendLog+=String(chunk);});
  backend.on('error',error=>{backendLog+=error.message;});
  let ready=false;
  for(let i=0;i<100;i++){
    try{const info=await(await fetch(`http://127.0.0.1:${port}/model/info`)).json();if(info.available){ready=true;break;}}catch{}
    if(backend.exitCode!==null)throw new Error('Owned test backend exited.');
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready)throw new Error('Genuine package did not become MODEL_READY.');
  const page=await context.newPage();
  // Observe real worker results without altering pixels, landmarks or windows.
  await page.addInitScript(()=>{
    window.researchFrameAudit=[];
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      constructor(...args){super(...args);this.addEventListener('message',({data})=>{
        if(data.type==='RESULT'&&window.researchFrameAudit.length<1024)window.researchFrameAudit.push({
          timestampMs:data.frame.timestampMs,processingMs:data.processingMs,handMs:data.handMs,poseMs:data.poseMs,featureMs:data.featureMs,
          featureState:data.featureState,bufferSize:data.bufferSize,windows:data.windows,emitted:!!data.sequence,continuity:data.continuity});
      });}
    };
  });
  page.on('pageerror',error=>observations.errors.push(error.message));
  page.on('websocket',socket=>{
    socket.on('framesent',({payload})=>{try{const value=JSON.parse(String(payload));if(value.type==='predict')observations.requests.push({schema:value.schema_version,shape:value.sequence_shape,sampling_hz:value.sampling_hz??15,features:value.features.length});}catch{}});
    socket.on('framereceived',({payload})=>{try{const value=JSON.parse(String(payload));if(value.type==='prediction')observations.predictions.push(value);if(value.type==='error')observations.errors.push(value);}catch{}});
  });
  await page.goto(`${origin}/webcam.html`);
  await page.getByText('Ready',{exact:true}).waitFor();
  await page.evaluate(()=>{
    const input=document.createElement('input');input.type='file';input.id='research-replay';document.body.append(input);
    navigator.mediaDevices.getUserMedia=async()=>{throw new Error('Replay source has not been initialized.');};
  });
  await page.locator('#research-replay').setInputFiles(videoPath);
  const duration=await page.evaluate(async(replayWidth)=>{
    const file=document.querySelector('#research-replay').files[0];
    const source=document.createElement('video');source.muted=true;source.preload='auto';source.width=160;source.dataset.researchReplay='true';
    document.body.append(source);
    await new Promise((resolve,reject)=>{source.onloadeddata=resolve;source.onerror=()=>reject(new Error('Replay decode failed.'));source.src=URL.createObjectURL(file);});
    navigator.mediaDevices.getUserMedia=async()=>{
      let stream;
      if(replayWidth){
        const canvas=document.createElement('canvas');canvas.width=replayWidth;
        canvas.height=Math.round(source.videoHeight*replayWidth/source.videoWidth);
        const ctx=canvas.getContext('2d');stream=canvas.captureStream(0);
        const track=stream.getVideoTracks()[0];let lastTime=-1;
        const draw=(_now,frame)=>{
          if(track.readyState!=='live')return;
          if(frame.mediaTime>lastTime){lastTime=frame.mediaTime;ctx.drawImage(source,0,0,canvas.width,canvas.height);track.requestFrame();}
          source.requestVideoFrameCallback(draw);
        };
        source.requestVideoFrameCallback(draw);
      }else stream=source.captureStream();
      await source.play();await new Promise(resolve=>source.requestVideoFrameCallback(resolve));source.pause();return stream;
    };
    return source.duration;
  },replayWidth);
  await page.getByRole('button',{name:'Start webcam landmarks'}).click();
  await page.getByRole('button',{name:'Enable local inference'}).waitFor();
  await page.getByLabel('Local backend session token').fill(token);
  // One stable window isolates transport/rendering; confidence is not lowered.
  await page.getByLabel('Stable windows').fill('1');
  await page.getByRole('button',{name:'Enable local inference'}).click({timeout:30000});
  await page.getByLabel('Recognition status').filter({hasText:'Waiting for signer'}).waitFor();
  await page.locator('video[data-research-replay]').evaluate(source=>source.play());
  try{
    await page.waitForFunction(()=>{
      const text=document.querySelector('.recognition-output strong')?.textContent;
      return text && text!=='No accepted sign';
    },undefined,{timeout:Math.ceil((duration+8)*1000)});
    observations.visibleLabel=await page.locator('.recognition-output strong').textContent();
    await page.screenshot({path:path.join(output,'prerecorded-recognition.png'),fullPage:true});
  }catch{observations.failure='No accepted sign became visible during the real clip replay at native speed.';}
  observations.cameraStatus=await page.getByLabel('Camera status').textContent();
  observations.recognitionStatus=await page.getByLabel('Recognition status').textContent();
  observations.diagnostics=await page.getByLabel('Measured landmark diagnostics').textContent();
  observations.buffer=await page.locator('.studio-contract').textContent();
  observations.frameAudit=await page.evaluate(()=>window.researchFrameAudit);
  if(!observations.visibleLabel)await page.screenshot({path:path.join(output,'replay-failure.png'),fullPage:true});
  observations.processedFrames=Number(await page.locator('.video-stage').getAttribute('data-processed-frames'));
  if(await page.getByRole('button',{name:'Stop camera'}).isEnabled())await page.getByRole('button',{name:'Stop camera'}).click();
  observations.cameraReleased=await page.locator('video[aria-label="Local webcam preview"]').evaluate(v=>v.srcObject===null);
  observations.outputCleared=await page.locator('.recognition-output strong').textContent()==='No accepted sign';
  observations.passed=observations.cameraReleased&&observations.outputCleared&&metadata.labels.includes(observations.visibleLabel)
    &&observations.predictions.some(p=>p.accepted&&p.label===observations.visibleLabel)&&observations.requests.length>0
    &&observations.requests.every(r=>r.schema===metadata.feature_schema&&r.features===metadata.shape[0]*metadata.shape[1]&&r.sampling_hz===metadata.sampling_hz);
}catch(error){observations.failure=error.message;}
finally{
  await context?.close();
  if(backend&&backend.exitCode===null){backend.kill();await new Promise(resolve=>{backend.once('exit',resolve);setTimeout(resolve,3000);});}
  await writeFile(path.join(output,'result.json'),JSON.stringify(observations,null,2));
  await writeFile(path.join(output,'backend.log'),backendLog);
  if(path.dirname(profile)!==path.resolve(tmpdir())||!path.basename(profile).startsWith('signbridge-real-model-'))throw new Error('Unexpected owned profile path.');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
console.log(JSON.stringify({...observations,frameAudit:observations.frameAudit?`${observations.frameAudit.length} real frame results saved in result.json`:undefined},null,2));
if(!observations.passed)process.exitCode=1;
