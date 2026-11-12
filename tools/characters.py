"""Turns the full-size character images in data/character pngs/ into the small WebP files the site uses.

Usage (needs Pillow):  python3 -m venv .venv && .venv/bin/pip install pillow && .venv/bin/python tools/characters.py
To add a character: drop its image into data/character pngs/, add "filename": "Roster Name" to NAMES below,
run this script, and add the roster name to CHAR_ART in app.js.
"""
import os, re, sys, json
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "character pngs")
OUT = os.path.join(ROOT, "assets", "characters")
NAMES = {  # file -> roster name used by the site
  "848px-Babypeachsimple.png": "Baby Peach", "1280px-MPDS_Diddy_Kong_Artwork.png": "Diddy Kong", "MPDSYoshi.png": "Yoshi",
  "800px-DDR_Mario_Alternate_Artwork.webp": "Mario", "731px-Baby_Luigi_MSS_artwork.webp": "Baby Luigi",
  "1414px-Donkey_Kong_-_DK_Jungle_Climber.png": "Donkey Kong", "KoopaBasic.png": "Koopa Troopa",
  "1195px-Bowser_-_Super_Mario_Galaxy.webp": "Bowser", "736px-Baby_Daisy_-_Mario_Kart_Wii.png": "Baby Daisy",
  "734px-Toad_Artwork_-_Mario_Party_6.webp": "Toad", "Waluigibasic.png": "Waluigi", "1280px-Wario_Artwork_-_Mario_Party_7.png": "Wario",
  "Boowiiking.png": "King Boo", "751px-BabyMarioSluggers.png": "Baby Mario", "588px-DDR_Luigi_Artwork.png": "Luigi",
  "794px-Birdo_Artwork_-_Mario_Party_7.png": "Birdo", "1024px-Dry_Bones_Artwork_-_Mario_Party_7.png": "Dry Bones",
  "1024px-Princess_Peach_Hair_Flip_Artwork.png": "Peach", "772px-SMG_BowserJr.webp": "Bowser Jr.",
}
def slug(n): return re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")
done, missing_files = {}, []
for f, name in NAMES.items():
    p = os.path.join(SRC, f)
    if not os.path.exists(p): missing_files.append(f); continue
    im = Image.open(p).convert("RGBA")
    if Image.open(p).mode != "RGBA":
        # Solid background: clear the near-white area connected to the edges.
        from PIL import ImageDraw
        for xy in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]:
            if im.getpixel(xy)[3] and min(im.getpixel(xy)[:3]) > 235:
                ImageDraw.floodfill(im, xy, (255, 255, 255, 0), thresh=40)
    bbox = im.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox() or (0, 0, im.width, im.height)
    im = im.crop(bbox); w, h = im.size
    # full figure, fit in 320x320, bottom-centred
    full = im.copy(); full.thumbnail((320, 320), Image.LANCZOS)
    canvas = Image.new("RGBA", (320, 320), (0, 0, 0, 0)); canvas.paste(full, ((320 - full.width) // 2, 320 - full.height), full)
    canvas.save(os.path.join(OUT, slug(name) + ".webp"), "WEBP", quality=82, method=6)
    # portrait: a square from the top of the figure (head and shoulders on tall art, whole body on wide art)
    side = min(w, h); x0 = (w - side) // 2
    face = im.crop((x0, 0, x0 + side, side)).resize((128, 128), Image.LANCZOS)
    face.save(os.path.join(OUT, slug(name) + "-face.webp"), "WEBP", quality=85, method=6)
    done[name] = slug(name)
extra = sorted(set(os.listdir(SRC)) - set(NAMES))
print(json.dumps(done)); print("unmapped files:", extra, "| missing:", missing_files)
