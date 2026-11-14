// Downscales to JPEG and keeps each photo well under the database's size limit. Resolves with base64 (no data: prefix).
export function prepImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const tries = [[1600, 0.82], [1280, 0.75], [1024, 0.7], [800, 0.65]];
      for (let i = 0; i < tries.length; i++) {
        const [px, quality] = tries[i];
        const s = Math.min(1, px / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const b64 = c.toDataURL("image/jpeg", quality).split(",")[1];
        if (b64.length < 900000 || i === tries.length - 1) { resolve(b64); return; }
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

export const PHOTO_FORMAT_ERROR =
  "This browser can't open that photo format. On iPhone, set Settings › Camera › Formats to Most Compatible, or upload a screenshot of it.";
