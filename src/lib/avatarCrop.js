// Where a profile picture's square is cut from the original image. Pure functions, tested in
// tests/avatar-crop-lib.test.js; the editor is components/AvatarEditor.jsx.
//   crop: { cx, cy, zoom }: the square's centre as fractions of the image's width and height, and how far
//   it's zoomed in (1 = the largest square that fits, up to MAX_ZOOM).

export const MAX_ZOOM = 4;

// The square in image pixels ({ x, y, side }), kept inside the image, plus the crop it actually is.
export function cropRect(crop, w, h) {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Number(crop && crop.zoom) || 1));
  const side = Math.min(w, h) / zoom;
  const want = (f, len) => (f == null || Number.isNaN(Number(f)) ? 0.5 : Number(f)) * len - side / 2;
  const x = Math.min(w - side, Math.max(0, want(crop && crop.cx, w)));
  const y = Math.min(h - side, Math.max(0, want(crop && crop.cy, h)));
  return { x, y, side, crop: { cx: (x + side / 2) / w, cy: (y + side / 2) / h, zoom } };
}

// The crop after dragging the picture by dx, dy screen pixels in a square preview `stage` pixels wide.
// Dragging right shows more of the left of the image, like moving a photo under a frame.
export function dragCrop(crop, dx, dy, w, h, stage) {
  const r = cropRect(crop, w, h);
  const perPx = r.side / stage;
  return cropRect({ ...r.crop, cx: (r.x + r.side / 2 - dx * perPx) / w, cy: (r.y + r.side / 2 - dy * perPx) / h }, w, h).crop;
}

// The crop at a new zoom, keeping the same centre where it can.
export function zoomCrop(crop, zoom, w, h) {
  return cropRect({ ...crop, zoom }, w, h).crop;
}
