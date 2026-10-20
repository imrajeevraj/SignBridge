import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecognitionPanel, type RecognitionHandle } from '../src/components/RecognitionPanel';
import { FakeSocket, frame, model } from './inference-fixtures';

afterEach(()=>vi.unstubAllGlobals());
it('keeps inference disabled without a model and starts no camera or socket',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({...model,state:'MODEL_NOT_INSTALLED',available:false,labels:[],vocabulary_size:0}))));
  vi.stubGlobal('WebSocket',FakeSocket);const before=FakeSocket.instances.length;
  render(<RecognitionPanel capturing={false}/>);await screen.findByText('Not Installed');
  expect((screen.getByRole('button',{name:'Enable local inference'}) as HTMLButtonElement).disabled).toBe(true);
  expect(FakeSocket.instances).toHaveLength(before);expect(screen.getByText('No accepted sign')).toBeTruthy();
});
it('renders only accepted TEST FIXTURE responses and clears on stop',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(model))));vi.stubGlobal('WebSocket',FakeSocket);
  const ref=createRef<RecognitionHandle>();render(<RecognitionPanel ref={ref} capturing/>);await screen.findByText('Ready');
  fireEvent.change(screen.getByLabelText('Local backend session token'),{target:{value:'TEST_FIXTURE_'+'x'.repeat(40)}});
  fireEvent.change(screen.getByLabelText('Stable windows'),{target:{value:'1'}});
  fireEvent.click(screen.getByRole('button',{name:'Enable local inference'}));
  expect((screen.getByRole('button',{name:'Disable inference'}) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByLabelText('Stable windows') as HTMLInputElement).disabled).toBe(true);
  const socket=FakeSocket.instances.at(-1)!;
  act(()=>{socket.authenticate();ref.current!.frame(frame());socket.respond();});
  expect(screen.getAllByText('TEST FIXTURE A')).toHaveLength(2);
  expect((screen.getByLabelText('Local backend session token') as HTMLInputElement).value).toBe('');
  expect(localStorage.length).toBe(0);
  act(()=>{ref.current!.frame(frame());socket.respond({accepted:false,label:null,reason:'UNKNOWN',confidence:.2});});
  expect(screen.getByText('No accepted sign')).toBeTruthy();
  act(()=>ref.current!.stop());expect(socket.closed).toBe(true);expect(screen.getByText('Recognition history is empty.')).toBeTruthy();
  expect((screen.getByRole('button',{name:'Disable inference'}) as HTMLButtonElement).disabled).toBe(true);
});
it('shows loading and a backend failure without automatic retry',async()=>{
  let reject!:(error:Error)=>void;
  const fetcher=vi.fn(()=>new Promise((_resolve,fail)=>{reject=fail;}));vi.stubGlobal('fetch',fetcher);
  render(<RecognitionPanel capturing={false}/>);expect(screen.getByText('Loading')).toBeTruthy();
  await act(async()=>reject(new Error('TEST FIXTURE disconnected')));
  expect(screen.getByText('Backend disconnected')).toBeTruthy();expect(fetcher).toHaveBeenCalledTimes(1);
});
