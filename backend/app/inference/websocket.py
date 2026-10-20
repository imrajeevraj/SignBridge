import asyncio
from collections import deque
import hmac
import json
import time

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from .contracts import AuthRequest, InferenceError, MAX_MESSAGE_BYTES, PredictRequest, PROTOCOL


async def receive_json(socket: WebSocket, timeout=30.0):
    message = await asyncio.wait_for(socket.receive(), timeout)
    if message['type'] == 'websocket.disconnect':
        raise WebSocketDisconnect(message.get('code', 1000))
    text = message.get('text')
    if text is None or len(text.encode('utf-8')) > MAX_MESSAGE_BYTES:
        raise InferenceError('PAYLOAD_TOO_LARGE', 'Send bounded JSON text only.')
    try:
        return json.loads(text, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Non-finite JSON')))
    except (ValueError, RecursionError):
        raise InferenceError('INVALID_REQUEST', 'Invalid JSON.') from None


async def inference_socket(socket: WebSocket):
    state = socket.app.state
    if socket.headers.get('origin') not in state.inference_origins or state.inference_connections >= 2:
        await socket.close(code=1008)
        return
    state.inference_connections += 1
    try:
        await socket.accept()
        auth = AuthRequest.model_validate(await receive_json(socket, 5))
        if not hmac.compare_digest(auth.token, state.inference_token):
            await socket.close(code=1008)
            return
        await socket.send_json({'type': 'authenticated', 'protocol': PROTOCOL, 'model': state.registry.info()})
        last_sequence = -1
        last_capture = -1.0
        recent_ids: deque[str] = deque(maxlen=32)
        last_received = -1.0
        while True:
            request_id = None
            try:
                raw = await receive_json(socket)
                request = PredictRequest.model_validate(raw)
                request_id = request.request_id
                now = time.time() * 1000
                if request.sequence_id <= last_sequence or request.captured_at_ms <= last_capture or request.request_id in recent_ids:
                    raise InferenceError('STALE_REQUEST', 'Sequence order or request ID was reused.')
                if now - request.captured_at_ms > 5000 or request.sent_at_ms > now + 1000:
                    raise InferenceError('STALE_REQUEST', 'Sequence is stale or client clock is ahead.')
                if time.monotonic() - last_received < 0.1:
                    raise InferenceError('RATE_LIMIT', 'Too many prediction requests.')
                last_sequence, last_capture = request.sequence_id, request.captured_at_ms
                recent_ids.append(request.request_id)
                last_received = time.monotonic()
                result = await state.inference.predict(request)
                await socket.send_json(result)
            except ValidationError:
                await socket.send_json({'type': 'error', 'protocol': PROTOCOL, 'request_id': request_id,
                                        'code': 'INVALID_REQUEST', 'message': 'Invalid schema, shape, timestamps or numeric features.'})
            except InferenceError as error:
                await socket.send_json({'type': 'error', 'protocol': PROTOCOL, 'request_id': request_id,
                                        'code': error.code, 'message': str(error)})
                if error.code == 'PAYLOAD_TOO_LARGE':
                    await socket.close(code=1009)
                    return
    except (WebSocketDisconnect, RuntimeError):
        pass
    except (TimeoutError, ValidationError, InferenceError):
        await socket.close(code=1008)
    finally:
        state.inference_connections -= 1
