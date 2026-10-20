import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebcamSession, type SessionDependencies } from '../src/vision/session';
import type { VisionResponse } from '../src/vision/protocol';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup() {
  const track = new EventTarget() as MediaStreamTrack;
  track.stop = vi.fn();
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const video = { play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), srcObject: null, readyState: 4, currentTime: 1 } as unknown as HTMLVideoElement;
  const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  const release = vi.fn(); let callback: FrameRequestCallback = () => {};
  const deps: SessionDependencies = {
    getMedia: vi.fn().mockResolvedValue(stream), worker: vi.fn(() => worker), bitmap: vi.fn().mockResolvedValue(bitmap),
    lease: vi.fn().mockResolvedValue(release), requestFrame: vi.fn((next) => { callback = next; return 1; }), cancelFrame: vi.fn(),
    requestVideoFrame: vi.fn((next) => { callback = timestamp => next(timestamp, video.currentTime); return 2; }), cancelVideoFrame: vi.fn(),
  };
  const hooks = { state: vi.fn(), frame: vi.fn(), clear: vi.fn() };
  const session = new WebcamSession(video, hooks, deps);
  const message = (data: VisionResponse) => worker.onmessage?.call(worker, { data } as MessageEvent<VisionResponse>);
  const start = async () => { const promise = session.start(); await flush(); message({ type: 'READY' }); await promise; };
  return { session, deps, hooks, stream, track, video, worker, bitmap, release, message, start, tick: (time: number) => callback(time) };
}
afterEach(() => vi.useRealTimers());
describe('webcam ownership and cancellation', () => {
  it('initializes an explicitly selected v2 worker only after Start', async () => {
    const s=setup();const pending=s.session.start('signbridge.custom-gru.v2');await flush();
    expect(s.worker.postMessage).toHaveBeenCalledWith({type:'INITIALIZE',schema:'signbridge.custom-gru.v2'});
    s.message({type:'READY'});await pending;s.session.stop();expect(s.worker.terminate).toHaveBeenCalledOnce();
  });
  it('v2 counts distinct decoded frames and caps a faster source without padding', async () => {
    const s=setup();const pending=s.session.start('signbridge.custom-gru.v2');await flush();s.message({type:'READY'});await pending;
    s.tick(100);await flush();expect(s.deps.bitmap).toHaveBeenCalledTimes(1);
    s.message({type:'RESULT',frame:{timestampMs:100,imageWidth:640,imageHeight:480,leftHand:null,rightHand:null,pose:null},processingMs:1,bufferSize:0,windows:0,featureState:'no_hands'});
    s.tick(200);expect(s.deps.bitmap).toHaveBeenCalledTimes(1);
    s.video.currentTime+=1/60;s.tick(217);expect(s.deps.bitmap).toHaveBeenCalledTimes(1);
    s.video.currentTime+=1/60;s.tick(234);await flush();expect(s.deps.bitmap).toHaveBeenCalledTimes(2);
    s.session.stop();expect(s.deps.cancelVideoFrame).toHaveBeenCalled();expect(s.track.stop).toHaveBeenCalledOnce();
  });
  it('starts only on demand, prevents double start, and releases every resource on Stop', async () => {
    const s = setup(); expect(s.deps.getMedia).not.toHaveBeenCalled();
    await s.start(); await s.session.start(); expect(s.deps.getMedia).toHaveBeenCalledTimes(1);
    expect(s.hooks.state).toHaveBeenLastCalledWith('running', expect.any(String));
    s.session.stop(); s.session.stop();
    expect(s.track.stop).toHaveBeenCalledTimes(1); expect(s.worker.terminate).toHaveBeenCalledTimes(1);
    expect(s.release).toHaveBeenCalledTimes(1); expect(s.video.srcObject).toBeNull();
    expect(s.deps.cancelFrame).toHaveBeenCalled(); expect(s.hooks.clear).toHaveBeenCalled();
    await s.start(); expect(s.deps.getMedia).toHaveBeenCalledTimes(2); s.session.stop();
  });
  it('stops a late stream after permission was cancelled', async () => {
    const s = setup(); let resolve!: (stream: MediaStream) => void;
    vi.mocked(s.deps.getMedia).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = s.session.start(); await flush(); s.session.stop(); resolve(s.stream); await pending;
    expect(s.track.stop).toHaveBeenCalledTimes(1); expect(s.deps.worker).not.toHaveBeenCalled(); expect(s.release).toHaveBeenCalledTimes(1);
  });
  it('releases a late camera lease without requesting a camera', async () => {
    const s = setup(); let resolve!: (release: () => void) => void;
    vi.mocked(s.deps.lease).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = s.session.start(); s.session.stop(); resolve(s.release); await pending;
    expect(s.release).toHaveBeenCalledOnce(); expect(s.deps.getMedia).not.toHaveBeenCalled();
  });
  it('shows permission denial and releases the exclusive lease', async () => {
    const s = setup(); vi.mocked(s.deps.getMedia).mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    await s.session.start(); expect(s.hooks.state).toHaveBeenLastCalledWith('error', expect.stringContaining('permission was denied'));
    expect(s.release).toHaveBeenCalledOnce(); expect(s.deps.worker).not.toHaveBeenCalled();
  });
  it('cancels model initialization and handles disconnected tracks', async () => {
    const s = setup(); const pending = s.session.start(); await flush(); s.session.stop(); await pending;
    s.message({ type: 'READY' }); expect(s.hooks.state).toHaveBeenLastCalledWith('stopped', expect.any(String));
    await s.start(); s.track.dispatchEvent(new Event('ended'));
    expect(s.hooks.state).toHaveBeenLastCalledWith('error', expect.stringContaining('disconnected'));
    expect(s.video.srcObject).toBeNull();
  });
  it('bounds in-flight frames and closes a bitmap that arrives after Stop', async () => {
    const s = setup(); let resolve!: (bitmap: ImageBitmap) => void;
    vi.mocked(s.deps.bitmap).mockImplementation(() => new Promise((done) => { resolve = done; }));
    await s.start(); s.tick(100); s.video.currentTime = 2; s.tick(200);
    expect(s.deps.bitmap).toHaveBeenCalledTimes(1);
    s.session.stop(); resolve(s.bitmap); await flush(); expect(s.bitmap.close).toHaveBeenCalledOnce();
    expect(s.worker.postMessage).toHaveBeenCalledTimes(1);
  });
  it('releases capture if a frame stalls or model initialization times out', async () => {
    vi.useFakeTimers(); const s = setup(); await s.start(); s.tick(100); await flush();
    await vi.advanceTimersByTimeAsync(10_001);
    expect(s.hooks.state).toHaveBeenLastCalledWith('error', expect.stringContaining('stopped responding'));
    expect(s.track.stop).toHaveBeenCalledOnce();
    const other = setup(); const pending = other.session.start(); await flush();
    await vi.advanceTimersByTimeAsync(30_001); await pending;
    expect(other.track.stop).toHaveBeenCalledOnce(); expect(other.release).toHaveBeenCalledOnce();
  });
  it('closes a bitmap when transfer fails', async () => {
    const s = setup(); await s.start(); vi.mocked(s.worker.postMessage).mockImplementation(() => { throw new Error('transfer failed'); });
    s.tick(100); await flush(); expect(s.bitmap.close).toHaveBeenCalledOnce(); expect(s.track.stop).toHaveBeenCalledOnce();
  });
});
