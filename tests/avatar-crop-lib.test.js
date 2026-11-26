import { describe, expect, it } from "vitest";
import { MAX_ZOOM, cropRect, dragCrop, zoomCrop } from "../src/lib/avatarCrop.js";

describe("profile picture crop", () => {
  it("starts as the largest centred square", () => {
    expect(cropRect(null, 800, 600)).toMatchObject({ x: 100, y: 0, side: 600, crop: { cx: 0.5, cy: 0.5, zoom: 1 } });
  });

  it("never lets the square leave the image", () => {
    const r = cropRect({ cx: 0, cy: 1, zoom: 2 }, 800, 600);
    expect(r).toMatchObject({ x: 0, y: 300, side: 300 });
    expect(cropRect({ zoom: 99 }, 800, 600).crop.zoom).toBe(MAX_ZOOM);
    expect(cropRect({ zoom: 0.2 }, 800, 600).crop.zoom).toBe(1);
  });

  it("moves the picture with the drag, in image pixels", () => {
    // 600px square shown in a 300px stage: 1 screen px = 2 image px. Dragging 50px right moves the
    // square 100px left in the image.
    const c = dragCrop({ cx: 0.5, cy: 0.5, zoom: 1 }, 50, 0, 800, 600, 300);
    expect(cropRect(c, 800, 600).x).toBeCloseTo(0);
    // Can't drag past the edge.
    expect(cropRect(dragCrop(c, 500, 0, 800, 600, 300), 800, 600).x).toBe(0);
  });

  it("zooms around the same centre", () => {
    const c = zoomCrop({ cx: 0.3, cy: 0.5, zoom: 1 }, 2, 800, 600);
    expect(c.zoom).toBe(2);
    expect(c.cx).toBeCloseTo(0.3);
  });
});
