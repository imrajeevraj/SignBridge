# TEST FIXTURES — not live camera data or sign examples

These unchanged JPEGs come from Google's MediaPipe test asset bucket, referenced
by its Apache-2.0 upstream test suite. They are used only by Playwright, never
copied into the extension's public/dist assets. No person is identified and no
gesture is assigned an ASL or ISL meaning.

| File | Source | SHA-256 |
| --- | --- | --- |
| thumb_up.jpg | https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg | 5d673c081ab13b8a1812269ff57047066f9c33c07db5f4178089e8cb3fdc0291 |
| pose.jpg | https://storage.googleapis.com/mediapipe-assets/pose.jpg | c8a830ed683c0276d713dd5aeda28f415f10cd6291972084a40d0d8b934ed62b |

Upstream references:
- https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/hand_landmarker_test.py
- https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/pose_landmarker_test.py
- https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE

The hand test constructs an original-plus-reflection composite in memory to test
both model labels. This is a synthetic two-hand image, not a real two-hand signer
evaluation. Golden vectors in unit tests are explicitly synthetic geometry.
