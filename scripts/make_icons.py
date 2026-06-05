#!/usr/bin/env python3
"""Generate PoinTrak app icons (travel-themed map pin on a sky→sea gradient).
Pure stdlib: builds RGBA pixels and encodes PNG via zlib. No external deps."""
import zlib, struct, os

def write_png(path, w, h, px):
    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # RGBA, 8-bit
    stride = w * 4
    raw = bytearray()
    for y in range(h):
        raw.append(0)               # filter type 0
        raw += px[y * stride:(y + 1) * stride]
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + \
          chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)

def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))

def render(S):
    TOP = (0x33, 0x8b, 0xff)   # sky blue
    BOT = (0x10, 0xb9, 0x9a)   # teal/sea
    WHITE = (255, 255, 255)
    cx, cy = S / 2.0, S * 0.405
    r = S * 0.172
    ty = S * 0.755                 # pin tip
    rhole = r * 0.40
    # triangle shoulders (slightly inside the circle for a smooth teardrop)
    ax, ay = cx - r * 0.80, cy + r * 0.45
    bx, by = cx + r * 0.80, cy + r * 0.45

    def sgn(px, py, qx, qy, rx, ry):
        return (px - rx) * (qy - ry) - (qx - rx) * (py - ry)

    ss = 3
    inv = 1.0 / (ss * ss)
    px = bytearray(S * S * 4)
    for y in range(S):
        row = y * S * 4
        for x in range(S):
            wsum = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    fx = x + (sx + 0.5) / ss
                    fy = y + (sy + 0.5) / ss
                    dx, dy = fx - cx, fy - cy
                    inc = dx * dx + dy * dy <= r * r
                    d1 = sgn(fx, fy, ax, ay, bx, by)
                    d2 = sgn(fx, fy, bx, by, cx, ty)
                    d3 = sgn(fx, fy, cx, ty, ax, ay)
                    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
                    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
                    intri = not (has_neg and has_pos)
                    inpin = inc or intri
                    if inpin and dx * dx + dy * dy <= rhole * rhole:
                        inpin = False        # punch the hole
                    if inpin:
                        wsum += 1.0
            cov = wsum * inv
            base = lerp(TOP, BOT, y / float(S - 1))
            col = tuple(int(round(base[i] + (WHITE[i] - base[i]) * cov)) for i in range(3))
            o = row + x * 4
            px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255
    return px

os.makedirs("icons", exist_ok=True)
for size, name in [(512, "icon-512.png"), (192, "icon-192.png"),
                   (180, "apple-touch-icon.png"), (152, "icon-152.png"),
                   (120, "icon-120.png"), (32, "favicon-32.png")]:
    write_png(os.path.join("icons", name), size, size, render(size))
    print("wrote icons/" + name)
