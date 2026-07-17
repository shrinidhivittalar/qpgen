#!/usr/bin/env python3
"""
Extract per-page text and diagram images from a PDF.
Handles vector drawings AND embedded raster images.
Input:  PDF path (argv[1]) or PDF bytes via stdin
Output: JSON to stdout — [{pageIndex, text, images: [{b64, width, height}]}]
"""
import sys
import json
import base64
import fitz  # PyMuPDF

SCALE   = 2.0   # render diagrams at 2x (144 dpi) for good quality
GAP     = 40    # points — merge drawing elements within this distance
PADDING = 8     # points — padding around each cropped diagram


def merge_rects(rects, gap=GAP):
    """Merge bounding boxes that are within `gap` points of each other."""
    if not rects:
        return []
    rects = sorted([r for r in rects if not r.is_empty], key=lambda r: (r.y0, r.x0))
    if not rects:
        return []
    merged = [rects[0]]
    for r in rects[1:]:
        last = merged[-1]
        expanded = fitz.Rect(last.x0 - gap, last.y0 - gap, last.x1 + gap, last.y1 + gap)
        if expanded.intersects(r):
            merged[-1] = last | r
        else:
            merged.append(r)
    return merged


def render_region(page, rect, scale=SCALE, padding=PADDING):
    """Render a rectangular region of a page as PNG bytes."""
    padded = fitz.Rect(
        rect.x0 - padding, rect.y0 - padding,
        rect.x1 + padding, rect.y1 + padding,
    ) & page.rect  # clip to page bounds
    mat    = fitz.Matrix(scale, scale)
    pixmap = page.get_pixmap(matrix=mat, clip=padded)
    return pixmap.tobytes('png'), pixmap.width, pixmap.height


def extract_page_diagrams(doc, page_num):
    page       = doc[page_num]
    text       = page.get_text('text').strip()
    page_width = page.rect.width

    diagram_rects = []  # list of (y0, fitz.Rect)

    # --- raster images: use their on-page bounding box ---
    seen = set()
    for img in page.get_images(full=True):
        xref = img[0]
        if xref in seen:
            continue
        seen.add(xref)
        try:
            info  = doc.extract_image(xref)
            w, h  = info['width'], info['height']
            if w < 80 or h < 80:
                continue
            rects = page.get_image_rects(xref)
            if rects:
                diagram_rects.append(rects[0])
        except Exception as e:
            print(f'raster xref {xref} p{page_num}: {e}', file=sys.stderr)

    # --- vector drawings: cluster paths into diagram bounding boxes ---
    draw_rects = []
    for d in page.get_drawings():
        r = d['rect']
        if r.is_empty or (r.width < 2 and r.height < 2):  # skip dots only, keep lines
            continue
        if r.width > page_width * 0.85:  # skip full-width borders
            continue
        draw_rects.append(r)

    for cluster in merge_rects(draw_rects):
        if cluster.width < 60 or cluster.height < 40:  # skip stray marks and small labels
            continue
        diagram_rects.append(cluster)

    # merge raster + vector regions that overlap
    all_regions = merge_rects(diagram_rects, gap=20)

    # render each region and sort top-to-bottom
    images = []
    for region in sorted(all_regions, key=lambda r: r.y0):
        try:
            raw, w, h = render_region(page, region)
            images.append({
                'b64':    base64.b64encode(raw).decode(),
                'width':  w,
                'height': h,
            })
        except Exception as e:
            print(f'render region p{page_num}: {e}', file=sys.stderr)

    return {'pageIndex': page_num, 'text': text, 'images': images}


def main():
    if len(sys.argv) > 1:
        try:
            doc = fitz.open(sys.argv[1])
        except Exception as e:
            print(json.dumps({'error': str(e)}), file=sys.stderr)
            sys.exit(1)
    else:
        pdf_bytes = sys.stdin.buffer.read()
        try:
            doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        except Exception as e:
            print(json.dumps({'error': str(e)}), file=sys.stderr)
            sys.exit(1)

    result = [extract_page_diagrams(doc, i) for i in range(len(doc))]
    doc.close()
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
