import asyncio
from concurrent.futures import ThreadPoolExecutor
import time
from .contracts import InferenceError, ModelState, PredictRequest, PROTOCOL
from .registry import ModelRegistry


class InferenceService:
    def __init__(self, registry: ModelRegistry, timeout=3.0):
        self.registry = registry
        self.timeout = timeout
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='signbridge-infer')
        self.pending = None

    async def predict(self, request: PredictRequest):
        adapter = self.registry.adapter
        if self.registry.state != ModelState.READY or adapter is None:
            raise InferenceError('MODEL_NOT_READY', self.registry.message)
        if request.model_id != adapter.metadata.model_id:
            raise InferenceError('UNKNOWN_MODEL', 'Requested model is not selected.')
        if request.schema_version != adapter.metadata.feature_schema or request.sequence_shape != adapter.metadata.shape or request.sampling_hz != adapter.metadata.sampling_hz:
            raise InferenceError('SCHEMA_MISMATCH', 'Feature contract does not match the selected model.')
        if self.pending is not None and not self.pending.done():
            raise InferenceError('BUSY', 'One inference is already in progress; no request was queued.')
        # Never classify absent hands, even if a direct client bypasses the studio.
        if any(request.features[start+159] + request.features[start+160] == 0 for start in range(0, len(request.features), request.sequence_shape[1])):
            return self.response(request, None, None, False, 'NO_SIGN', 0.0)
        started = time.perf_counter()
        self.pending = asyncio.get_running_loop().run_in_executor(self.executor, adapter.predict, request.features)
        try:
            label, confidence = await asyncio.wait_for(asyncio.shield(self.pending), timeout=self.timeout)
        except TimeoutError:
            # Keep the busy slot until actual work ends. Timing out a thread does
            # not cancel CPU execution and must not create a hidden backlog.
            raise InferenceError('INFERENCE_TIMEOUT', 'Inference exceeded the time limit.') from None
        except Exception:
            self.registry.state = ModelState.ERROR
            self.registry.message = 'Model execution failed; restart backend after checking its package.'
            raise InferenceError('MODEL_ERROR', self.registry.message) from None
        neutral = label == adapter.metadata.neutral_label
        accepted = not neutral and confidence >= adapter.metadata.confidence_threshold
        return self.response(request, label if accepted else None, confidence, accepted,
                             'ACCEPTED' if accepted else 'NO_SIGN' if neutral else 'UNKNOWN',
                             (time.perf_counter() - started) * 1000)

    @staticmethod
    def response(request, label, confidence, accepted, reason, latency):
        return {'type': 'prediction', 'protocol': PROTOCOL, 'request_id': request.request_id,
            'sequence_id': request.sequence_id, 'model_id': request.model_id, 'label': label,
            'confidence': confidence, 'accepted': accepted, 'reason': reason, 'latency_ms': latency,
            'captured_at_ms': request.captured_at_ms}

    async def close(self):
        if self.pending is not None:
            try:
                await asyncio.shield(self.pending)
            except Exception:
                pass
        self.executor.shutdown(wait=False, cancel_futures=True)
        self.registry.close()
