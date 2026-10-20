// Explicit offline processing of an authorized local video catalog. No camera API.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { summarizeContinuity } from './extraction-diagnostics.mjs';

const [catalogArg, outputArg, testOption] = process.argv.slice(2);
if (!catalogArg || !outputArg) throw new Error('Usage: node scripts/extract-dataset.mjs catalog.json NEW_OUTPUT_DIRECTORY');
const catalogPath = path.resolve(catalogArg), output = path.resolve(outputArg);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if ((catalog.purpose !== 'real_labeled_data' && !(testOption==='--test-fixture' && catalog.purpose==='test_fixture')) || !['ISL','ASL'].includes(catalog.language) || !catalog.source || !catalog.license || !Array.isArray(catalog.samples) || !catalog.samples.length) throw new Error('A real labeled, licensed video catalog is required.');
const extension = path.resolve('extension/dist');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const extractorHash = sha(await readFile(path.join(extension, 'vision-worker.js')));
const schema = catalog.feature_schema ?? 'signbridge.custom-gru.v1';
if (!['signbridge.custom-gru.v1','signbridge.custom-gru.v2'].includes(schema)) throw new Error('Unsupported extraction schema.');
const samplingHz = catalog.sampling_hz ?? 15;
if (samplingHz !== (schema.endsWith('.v2') ? 30 : 15)) throw new Error('v2 requires explicit sampling_hz:30; v1 remains 15 Hz.');
const preprocessing = `tasks-vision-1.1.1.hand-v1.pose-lite-v1.custom-gru-${schema.endsWith('.v2')?'v2-native30':'v1'}`;
// Fail rather than overwrite any previous extraction.
await mkdir(output, { recursive: false });
const profile = await mkdtemp(path.join(tmpdir(), 'signbridge-offline-extract-'));
let browser;
try {
  browser = await chromium.launchPersistentContext(profile, { channel:'chromium', headless:true,
    executablePath:process.env.SIGNBRIDGE_CHROMIUM_PATH,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`, '--use-fake-device-for-media-stream'] });
  const service = browser.serviceWorkers()[0] ?? await browser.waitForEvent('serviceworker');
  // chrome-extension URL.origin is 'null' in Node; construct from verified worker URL.
  const base = `chrome-extension://${new URL(service.url()).host}`;
  const page = await browser.newPage();
  await page.goto(`${base}/src/offscreen/offscreen.html`);
  await page.evaluate(() => { const input=document.createElement('input'); input.type='file'; input.id='offline-video'; document.body.append(input); });
  const samples=[]; const failures=[]; const diagnostics=[]; const partialDecodes=[]; const seen=new Set();
  // Persist completed clips so a later decoder/process failure cannot discard
  // their manifest. Feature files remain immutable; interrupted reports say so.
  const saveProgress = async (processed, complete = false) => {
    const { samples:ignored, ...metadata }=catalog;
    await writeFile(path.join(output,'manifest.json'),JSON.stringify({...metadata,feature_schema:schema,sampling_hz:samplingHz,preprocessing,extractor_sha256:extractorHash,samples},null,2));
    await writeFile(path.join(output,'extraction-report.json'),JSON.stringify({input_clips:catalog.samples.length,processed_clips:processed,complete,usable_clips:samples.length,failures,partial_decodes:partialDecodes,diagnostics,sampling:`${samplingHz} Hz seek; ${schema.endsWith('.v2')?'distinct decoded PTS':'requested timestamps'}; same worker; no padding/interpolation`},null,2));
  };
  for (let index=0; index<catalog.samples.length; index++) {
    const sample=catalog.samples[index];
    if (!sample.id || seen.has(sample.id) || !catalog.labels.includes(sample.label) || !sample.signer_id || !sample.duplicate_group || !['train','validation','test'].includes(sample.split)) throw new Error('Invalid ID, verified label, signer, duplicate group or split.');
    seen.add(sample.id);
    const video=path.resolve(path.dirname(catalogPath),sample.video_path);
    const sourceHash=sha(await readFile(video));
    if (sample.source_sha256 && sample.source_sha256!==sourceHash) throw new Error(`Source hash mismatch: ${sample.id}`);
    await page.locator('#offline-video').setInputFiles(video);
    let result;
    try { result=await page.evaluate(async ({schema,samplingHz}) => {
      const file=document.querySelector('#offline-video').files[0];
      const video=document.createElement('video'); video.muted=true; video.preload='auto';
      const nativeTimestamps=schema.endsWith('.v2');
      if(nativeTimestamps){video.width=320;document.body.append(video);}
      function presented(action) {return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{video.cancelVideoFrameCallback(id);reject(new Error('Decoded frame presentation timeout.'));},10000);
        const id=video.requestVideoFrameCallback((_now,metadata)=>{clearTimeout(timer);resolve(metadata.mediaTime*1000);});
        video.onerror=()=>{clearTimeout(timer);video.cancelVideoFrameCallback(id);reject(new Error(`Video decoder error ${video.error?.code}: ${video.error?.message}`));};
        action();
      });}
      const url=URL.createObjectURL(file); const worker=new Worker(chrome.runtime.getURL('vision-worker.js'));
      function receive(send) { return new Promise((resolve,reject) => {
        const timer=setTimeout(()=>reject(new Error('Offline worker/decode timeout.')),30000);
        worker.onmessage=({data})=>{clearTimeout(timer); data.type==='ERROR'?reject(new Error(data.message)):resolve(data);};
        worker.onerror=()=>{clearTimeout(timer); reject(new Error('Offline worker failed.'));}; send();
      }); }
      try {
        let decodedTimestamp=0;
        if(nativeTimestamps) decodedTimestamp=await presented(()=>{video.src=url;});
        else await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Video decode timeout.')),30000);video.onloadeddata=()=>{clearTimeout(timer);resolve();}; video.onerror=()=>{clearTimeout(timer);reject(new Error('Unsupported/corrupt video.'));}; video.src=url;});
        if (!Number.isFinite(video.duration) || video.duration>300 || video.duration<=0) throw new Error('Clip duration must be 0..300 seconds.');
        await receive(()=>worker.postMessage({type:'INITIALIZE',diagnostics:true,schema}));
        const windows=[]; const reasons={}; const featureTimes=[]; const frameDiagnostics=[]; const sampling=[];let frames=0,lastDecoded=-1,decodeFailure=null;
        for (let seconds=0;seconds<video.duration;seconds+=1/samplingHz) {
          if (seconds>0) {
            try {
            if(nativeTimestamps) decodedTimestamp=await presented(()=>{video.currentTime=seconds;});
            else await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Seek timeout')),10000);video.onseeked=()=>{clearTimeout(timer);resolve();};video.currentTime=seconds;});
            } catch(error) {
              // Earlier complete windows remain genuine. Stop here: never bridge
              // an undecodable segment or insert a replacement/repeated frame.
              decodeFailure={requestedMs:seconds*1000,lastDecodedMs:lastDecoded,decodedFrames:frames,detail:String(error.message)};
              break;
            }
          }
          const timestampMs=nativeTimestamps?decodedTimestamp:seconds*1000;
          const duplicate=nativeTimestamps && timestampMs<=lastDecoded;
          sampling.push({requestedMs:seconds*1000,decodedMs:nativeTimestamps?timestampMs:null,skippedDuplicate:duplicate});
          if(duplicate) continue;
          lastDecoded=timestampMs;
          const bitmap=await createImageBitmap(video);
          const data=await receive(()=>worker.postMessage({type:'FRAME',bitmap,timestampMs},[bitmap]));
          if(data.type!=='RESULT') throw new Error('Unexpected worker response.');
          frames++; reasons[data.featureState]=(reasons[data.featureState]??0)+1; featureTimes.push(data.featureMs);
          frameDiagnostics.push({...data.diagnostics, seekTimeMs:video.currentTime*1000,
            bufferSize:data.bufferSize,continuity:data.continuity,emitted:!!data.sequence});
          if(data.sequence) windows.push({features:Array.from(data.sequence.values),timestamps:data.sequence.timestamps});
        }
        return {windows,frames,reasons,featureTimes,frameDiagnostics,sampling,decodeFailure,
          video:{durationSeconds:video.duration,width:video.videoWidth,height:video.videoHeight,
            timestampBasis:nativeTimestamps?'requestVideoFrameCallback mediaTime; duplicate decoded PTS skipped':'requested 15 Hz seek time; browser decoded PTS is not exposed by this sampler'}};
      } finally {worker.terminate();video.removeAttribute('src');video.load();video.remove();URL.revokeObjectURL(url);}
    }, {schema,samplingHz}); }
    catch(error){failures.push({id:sample.id,source_sha256:sourceHash,reason:'decode_or_worker_error',detail:String(error.message).slice(0,500)});await saveProgress(index+1);console.log(`${index+1}/${catalog.samples.length}: decoder/worker rejection`);continue;}
    if(result.decodeFailure)partialDecodes.push({id:sample.id,...result.decodeFailure,retained_windows:result.windows.length});
    const diagnostic={id:sample.id,feature_schema:schema,sampling_hz:samplingHz,extractor_sha256:extractorHash,source_sha256:sourceHash,video:result.video,sampling:result.sampling,decodeFailure:result.decodeFailure,
      frames:result.frameDiagnostics,...summarizeContinuity(result.frameDiagnostics)};
    await writeFile(path.join(output,`diagnostics-${index}.json`),JSON.stringify(diagnostic,null,2));
    diagnostics.push({id:sample.id,path:`diagnostics-${index}.json`,longestRun:diagnostic.longestRun,windows:result.windows.length});
    if(!result.windows.length) {failures.push({id:sample.id,reason:'No complete usable 32-frame window',frames:result.frames,reasons:result.reasons});await saveProgress(index+1);console.log(`${index+1}/${catalog.samples.length}: rejected; longest run ${diagnostic.longestRun}`);continue;}
    const filename=`clip-${index}.json`;
    const payload=JSON.stringify({feature_schema:schema,preprocessing,sampling_hz:samplingHz,extractor_sha256:extractorHash,source_sha256:sourceHash,...result});
    await writeFile(path.join(output,filename),payload);
    samples.push({id:sample.id,label:sample.label,signer_id:sample.signer_id,duplicate_group:sample.duplicate_group,split:sample.split,source_sha256:sourceHash,feature_path:filename,feature_sha256:sha(payload)});
    await saveProgress(index+1);
    console.log(`${index+1}/${catalog.samples.length}: ${result.windows.length} usable windows`);
  }
  await saveProgress(catalog.samples.length, true);
  console.log(`Extracted ${samples.length} clips; rejected ${failures.length}. Validate signer/class coverage before training.`);
} finally { await browser?.close();
  if(path.dirname(profile)!==path.resolve(tmpdir())||!path.basename(profile).startsWith('signbridge-offline-extract-'))throw new Error('Unexpected owned profile path.');
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}); }
