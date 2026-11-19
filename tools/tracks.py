"""Downloads a picture of each league track from the Super Mario Wiki and makes the small WebP files the
site uses (public/assets/tracks/<slug>.webp, 640x360, cropped to 16:9 from the centre).

Usage (needs Pillow):  python3 -m venv .venv && .venv/bin/pip install pillow && .venv/bin/python tools/tracks.py
The pictures are the course images in the wiki's "Mario Kart Wii" article, which lists the 32 courses in
the same order as TRACKS in src/lib/constants.js (cup icons in between are skipped). Each image's wiki
page is written to data/track-sources.json.
"""
import io, json, os, re, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "tracks")
UA = {"User-Agent": "kart-league-site/1.0"}
TRACKS = [  # same order as src/lib/constants.js
    "Luigi Circuit", "Moo Moo Meadows", "Mushroom Gorge", "Toad's Factory", "Mario Circuit", "Coconut Mall", "DK Summit",
    "Wario's Gold Mine", "Daisy Circuit", "Koopa Cape", "Maple Treeway", "Grumble Volcano", "Dry Dry Ruins",
    "Moonview Highway", "Bowser's Castle", "Rainbow Road",
    "GCN Peach Beach", "DS Yoshi Falls", "SNES Ghost Valley 2", "N64 Mario Raceway", "N64 Sherbet Land",
    "GBA Shy Guy Beach", "DS Delfino Square", "GCN Waluigi Stadium", "DS Desert Hills", "GBA Bowser Castle 3",
    "N64 DK's Jungle Parkway", "GCN Mario Circuit", "SNES Mario Circuit 3", "DS Peach Gardens", "GCN DK Mountain",
    "N64 Bowser's Castle",
]
W, H = 640, 360


def slug(n):
    return re.sub(r"[^a-z0-9]+", "-", n.lower()).strip("-")


def api(**kw):
    kw["format"] = "json"
    req = urllib.request.Request("https://www.mariowiki.com/api.php?" + urllib.parse.urlencode(kw), headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=60))


images = api(action="parse", page="Mario_Kart_Wii", prop="images")["parse"]["images"]
start = images.index("Luigi_Circuit_MKWii.png")
files = [f for f in images[start:start + 60] if "Cup_Icon" not in f][:len(TRACKS)]
urls = {}
for k in range(0, len(files), 16):
    d = api(action="query", prop="imageinfo", iiprop="url", titles="|".join("File:" + f for f in files[k:k + 16]))
    for p in d["query"]["pages"].values():
        urls[p["title"][5:].replace(" ", "_")] = p["imageinfo"][0]["url"]

os.makedirs(OUT, exist_ok=True)
sources = {}
for track, f in zip(TRACKS, files):
    raw = urllib.request.urlopen(urllib.request.Request(urls[f], headers=UA), timeout=60).read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    # Crop to 16:9 around the centre, then shrink.
    w, h = im.size
    if w / h > W / H:
        nw = round(h * W / H); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w * H / W); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im.resize((W, H), Image.LANCZOS).save(os.path.join(OUT, slug(track) + ".webp"), "WEBP", quality=78, method=6)
    sources[track] = "https://www.mariowiki.com/File:" + urllib.parse.quote(f)
    print(f"{track:26} <- {f}")

json.dump(sources, open(os.path.join(ROOT, "data", "track-sources.json"), "w"), indent=1)
print(f"wrote {len(sources)} tracks to {OUT}")
