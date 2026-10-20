"""Generate small original bridge icons using only Python's standard library."""
from pathlib import Path
import math
import struct
import zlib

destination = Path(__file__).resolve().parents[1] / "extension" / "public" / "icons"
destination.mkdir(parents=True, exist_ok=True)


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


for size in (16, 32, 48, 128):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            u, v = (x + 0.5) / size, (y + 0.5) / size
            corner_distance = math.hypot(max(abs(u - .5) - .28, 0), max(abs(v - .5) - .28, 0))
            alpha = 255 if corner_distance < .20 else 0
            bridge = (.20 < u < .80 and abs(v - (.57 - .24 * math.sin((u - .20) / .60 * math.pi))) < .035)
            deck = .20 < u < .80 and .64 < v < .70
            pillar = any(abs(u - point) < .026 for point in (.27, .50, .73)) and .42 < v < .66
            color = (230, 240, 255) if bridge or deck or pillar else (int(86 + 20 * u), int(68 + 30 * v), 197)
            rows.extend((*color, alpha))
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(bytes(rows))) + chunk(b"IEND", b"")
    (destination / f"icon-{size}.png").write_bytes(data)
