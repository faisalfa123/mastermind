#!/usr/bin/env python3
"""Generates the pixel-art PWA icons (stdlib only)."""
import struct, zlib
PAL = {'.': (26, 28, 44), 'o': (244, 244, 244), 'b': (65, 166, 246), 'c': (115, 239, 247),
       'y': (255, 205, 117), 'r': (177, 62, 83), 'g': (167, 240, 112), 'k': (51, 60, 87)}
ART = [  # 16x16 robot guardian
 "................",
 ".......yy.......",
 ".......yy.......",
 "....kkkkkkkk....",
 "...kbbbbbbbbk...",
 "..kbbbbbbbbbbk..",
 "..kboobbbboobk..",
 "..kbocobbocobk..",
 "..kboobbbboobk..",
 "..kbbbbbbbbbbk..",
 "..kbbrrrrrrbbk..",
 "...kbbbbbbbbk...",
 "....kkkkkkkk....",
 "...kgggggggk....",
 "...kgggggggk....",
 "....kkkkkkk.....",
]
def png(path, size, pad):
    cell = (size - 2 * pad) // 16
    off = (size - cell * 16) // 2
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            gx, gy = (x - off) // cell, (y - off) // cell
            c = PAL[ART[gy][gx]] if 0 <= gx < 16 and 0 <= gy < 16 and x >= off and y >= off else PAL['.']
            row += bytes(c)
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
png('web/icon-192.png', 192, 0)
png('web/icon-512.png', 512, 0)
png('web/icon-maskable-512.png', 512, 72)  # safe zone for maskable
png('web/favicon.png', 64, 0)
