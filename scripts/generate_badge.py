import zlib
import struct
import math
import os

def dist_to_segment(px, py, x1, y1, x2, y2):
    dx = x2 - x1
    dy = y2 - y1
    l2 = dx*dx + dy*dy
    if l2 == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1)*dx + (py - y1)*dy) / l2))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)

def create_checkmark_png(width, height, stroke_width, filename):
    # Proportions matching TaskAlert logo
    # P1 (left start), P2 (bottom point), P3 (top right end)
    p1 = (width * 0.22, height * 0.50)
    p2 = (width * 0.42, height * 0.72)
    p3 = (width * 0.78, height * 0.26)
    
    radius = stroke_width / 2.0
    raw_rows = []
    
    for y in range(height):
        row = [0] # PNG filter type 0 (None)
        for x in range(width):
            # Sample subpixels for high quality supersampling / antialiasing (4x4 grid)
            samples = 0
            for sy in range(4):
                for sx in range(4):
                    sub_x = x + (sx + 0.5) / 4.0
                    sub_y = y + (sy + 0.5) / 4.0
                    
                    d1 = dist_to_segment(sub_x, sub_y, p1[0], p1[1], p2[0], p2[1])
                    d2 = dist_to_segment(sub_x, sub_y, p2[0], p2[1], p3[0], p3[1])
                    min_d = min(d1, d2)
                    
                    if min_d <= radius:
                        samples += 1
            
            alpha = int(round((samples / 16.0) * 255))
            if alpha > 0:
                row.extend([255, 255, 255, alpha]) # Pure white with alpha
            else:
                row.extend([0, 0, 0, 0])
        raw_rows.append(bytes(row))
    
    raw_data = b''.join(raw_rows)
    compressed_data = zlib.compress(raw_data, 9)
    
    def make_chunk(chunk_type, data):
        length = len(data)
        crc = zlib.crc32(chunk_type + data) & 0xffffffff
        return struct.pack('>I', length) + chunk_type + data + struct.pack('>I', crc)
    
    png_signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0) # 8-bit RGBA
    ihdr_chunk = make_chunk(b'IHDR', ihdr_data)
    idat_chunk = make_chunk(b'IDAT', compressed_data)
    iend_chunk = make_chunk(b'IEND', b'')
    
    png_bytes = png_signature + ihdr_chunk + idat_chunk + iend_chunk
    
    with open(filename, 'wb') as f:
        f.write(png_bytes)
    print(f"Generated {filename} ({width}x{height}, {len(png_bytes)} bytes)")

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(base_dir, 'icons')
    os.makedirs(icons_dir, exist_ok=True)
    
    create_checkmark_png(72, 72, stroke_width=11.0, filename=os.path.join(icons_dir, 'badge-72.png'))
    create_checkmark_png(96, 96, stroke_width=14.5, filename=os.path.join(icons_dir, 'badge-96.png'))
    create_checkmark_png(192, 192, stroke_width=29.0, filename=os.path.join(icons_dir, 'badge.png'))
