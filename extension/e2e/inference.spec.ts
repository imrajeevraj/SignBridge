import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('MV3 local WebSocket CSP, explicit authorization, no-model response and studio controls',async()=>{
  const profile=await mkdtemp(path.join(tmpdir(),'signbridge-inference-test-'));
  const extension=path.resolve('dist');
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.SIGNBRIDGE_CHROMIUM_PATH,
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--use-fake-device-for-media-stream']});
  try {
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/webcam.html`);
    await expect(page.getByText('Not Installed',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Enable local inference'})).toBeDisabled();
    expect(await page.locator('video').evaluate((video:HTMLVideoElement)=>video.srcObject)).toBeNull();
    const result=await page.evaluate(async({port,token})=>{
      return new Promise<{auth:unknown;error:unknown}>((resolve,reject)=>{
        const socket=new WebSocket(`ws://127.0.0.1:${port}/ws/infer`);let auth:unknown;
        const timer=setTimeout(()=>{socket.close();reject(new Error('WebSocket smoke timeout'));},5000);
        socket.onerror=()=>{clearTimeout(timer);reject(new Error('Local socket blocked or unavailable'));};
        socket.onopen=()=>socket.send(JSON.stringify({type:'authenticate',protocol:'signbridge.inference.v1',token}));
        socket.onmessage=({data})=>{
          const value=JSON.parse(String(data)) as {type:string};
          if(value.type==='authenticated'){
            auth=value;const features=Array<number>(5152).fill(0);for(let i=0;i<32;i++)features[i*161+159]=1;
            socket.send(JSON.stringify({type:'predict',protocol:'signbridge.inference.v1',request_id:'test-fixture',model_id:'missing',sequence_id:1,
              schema_version:'signbridge.custom-gru.v1',sequence_shape:[32,161],captured_at_ms:Date.now(),sent_at_ms:Date.now(),features}));
          }else{clearTimeout(timer);socket.close();resolve({auth,error:value});}
        };
      });
    },{port:process.env.SIGNBRIDGE_PORT??'8000',token:process.env.SIGNBRIDGE_TOKEN!});
    expect(result.auth).toMatchObject({type:'authenticated',model:{state:'MODEL_NOT_INSTALLED',available:false}});
    expect(result.error).toMatchObject({type:'error',code:'MODEL_NOT_READY',request_id:'test-fixture'});
    await expect(page.getByText('No accepted sign',{exact:true})).toBeVisible();
  }finally{
    await context.close();
    if(path.dirname(profile)!==path.resolve(tmpdir())||!path.basename(profile).startsWith('signbridge-inference-test-'))throw new Error('Unexpected profile path');
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
