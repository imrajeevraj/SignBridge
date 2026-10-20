import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeContinuity } from './extraction-diagnostics.mjs';
const frames = n => Array.from({length:n}, (_,i)=>({timestampMs:i*1000/15,usable:true,reason:'ready',emitted:i>=31&&(i-31)%8===0}));
test('enumerates rejected candidates and distinguishes stride suppression',()=>{
  const f=frames(50);f[20].usable=false;f[20].reason='no_hands';
  const d=summarizeContinuity(f);
  assert.equal(d.longestRun,29);assert.equal(d.candidates.length,19);
  assert.ok(d.candidates.every(c=>c.rejected.some(r=>r.index===20&&r.reason==='no_hands')));
  const valid=summarizeContinuity(frames(40));
  assert.equal(valid.candidates[0].outcome,'emitted');assert.equal(valid.candidates[1].outcome,'valid_not_stride_boundary');
});
test('distinguishes insufficient frames, timestamp gaps and non-increasing time',()=>{
  assert.equal(summarizeContinuity(frames(27)).insufficientTotalFrames,true);
  const f=frames(40);for(let i=20;i<f.length;i++)f[i].timestampMs+=300;
  const d=summarizeContinuity(f);assert.equal(d.longestRun,20);
  assert.equal(d.resets[0].reason,'gap_over_250ms');
  f[22].timestampMs=f[21].timestampMs;
  assert.ok(summarizeContinuity(f).resets.some(r=>r.reason==='non_increasing_timestamp'));
});
