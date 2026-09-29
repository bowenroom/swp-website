#!/usr/bin/env python3
"""Generate the 5 scroll-world keyframes via the lionpilot image API.

The 5 keyframes are consecutive camera positions along ONE continuous flight:
  K0 wide establishing  ->  K1 road incident  ->  K2 sensing  ->  K3 fusion  ->  K4 decision
Only VIDEO generations are budget-limited (10); images use a separate API.
"""
import base64, json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

BASE = "https://cli.lionpilot.tech/v1"
KEY = os.environ.get("IMG_KEY", "")
if not KEY:
    raise SystemExit("set IMG_KEY in the environment; never hardcode the API key")
MODEL = os.environ.get("IMG_MODEL", "gpt-image-2.5")
HERE = os.path.dirname(os.path.abspath(__file__))
KF = os.path.join(HERE, "keyframes")
os.makedirs(KF, exist_ok=True)

# ---------------------------------------------------------------- style preamble
# Byte-identical across all 5 frames. This is what makes the world cohesive.
STYLE = (
    "Soft matte clay 3D render of a miniature tilt-shift diorama world, handcrafted "
    "toy-model aesthetic, rounded organic shapes, slightly imperfect handmade surfaces. "
    "Isometric three-quarter view, gentle telephoto tilt-shift lens: miniature depth of "
    "field, the far edges of the world softly blurred, a crisp mid-ground focal plane. "
    "Materials read as polymer clay and matte painted resin: velvety diffuse surfaces, no "
    "gloss, no specular hotspots. Soft warm studio light from a high three-quarter angle, "
    "long soft-edged shadows, gentle ambient occlusion in creases. The world floats as a "
    "small rounded landmass over an infinite flat warm ivory cream void #F2EBD9 with a soft "
    "contact shadow beneath it. Restrained low-saturation palette: warm ivory cream #F2EBD9, "
    "muted indigo #4A5578, dusty lavender #9B8AC4, soft sage green #A8C0A0, pale terracotta "
    "#D9A98C, soft ochre gold #C89B5A, warm charcoal #3A3A3A. Small warm-gold accents mark "
    "the active or important elements only. "
    "Absolutely no text, no letters, no numbers, no logos, no watermarks, no signage, no "
    "user interface overlays. Wide landscape composition, 16:9."
)

WORLD = (
    "One continuous miniature world: a single gently curving two-lane highway with pale "
    "lane markings and a low guardrail threading across a rounded floating island of soft "
    "green hills, rounded toy-like trees, grey rock outcrops, a small blue river with a short "
    "waterfall and a little arched bridge. Small rounded stylized cars in muted colours travel "
    "on the road. Unmanned quadcopter drones are simple rounded toy-like four-rotor craft with "
    "no cockpit, no pilot, no human figure aboard. "
)

FRAMES = {
    "k0-establish": (
        "CAMERA POSITION 0 of 5, the opening establishing shot. The camera is very high and "
        "far away, looking down at a steep three-quarter angle, so the entire landmass is small "
        "in the middle of a vast empty ivory cream void with generous negative space all "
        "around it. The whole road, river, bridge, forest and mountains are visible at once, "
        "read as a single miniature object about to be approached. Nothing is happening yet; "
        "this is the calm wide view before the descent begins. "
    ),
    "k1-road": (
        "CAMERA POSITION 1 of 5. The camera has descended and flown in close to just above "
        "road level, low and near the asphalt, looking along the highway. The road surface, the "
        "guardrail, the grass verge and the grey rocks read large and detailed in the foreground. "
        "In the middle distance a small white car is stopped on the shoulder with two tiny "
        "traffic cones beside it, while two other cars pass on the open lanes. One unmanned "
        "quadcopter drone hovers above the incident with a small sensor pod underneath it. The "
        "background hills and trees fall away into soft tilt-shift blur. "
    ),
    "k2-sensing": (
        "CAMERA POSITION 2 of 5. The camera glides along the road to a new stretch and hovers at "
        "mid height, about level with the trees, looking diagonally down the highway. Three "
        "unmanned quadcopter drones hover in a loose formation above the road, each projecting a "
        "soft translucent pale blue sensing cone down onto the asphalt; the cones overlap and "
        "brighten where they cross. A small four wheeled ground robot with a sensor mast sits on "
        "the shoulder. Two cars travel through the overlapping light. The foreground guardrail "
        "and grass are softly out of focus at the bottom edge. "
    ),
    "k3-fusion": (
        "CAMERA POSITION 3 of 5. The camera has moved further along and now looks down at a "
        "gentle angle onto a wide open stretch of road and the valley beside it. Hovering above "
        "the ground is a loose ring of small physical clay evidence fragments: flat tiles of road "
        "texture, contour tiles of terrain, tiny model cars, a small clay cloud form, a chip of "
        "asphalt, a fallen branch. The fragments stream inward through the air toward one softly "
        "glowing pale indigo point above the road, converging like a diagram made of real little "
        "objects. Warm gold highlights on a few of the fragments. One small drone watches from "
        "the upper corner. "
    ),
    "k4-decision": (
        "CAMERA POSITION 4 of 5, the final shot. The camera is low and wide, looking along a "
        "busy interchange section of the highway with mountains, a waterfall and dense forest "
        "behind. Four small rounded clay agents hover high in a diamond formation, linked to each "
        "other by thin glowing warm gold arcs; one soft gold beam descends from the lowest agent "
        "to the roadway below. Underneath, traffic is flowing freely and evenly, cars well "
        "spaced and moving in both directions, cones gone, the road clear. The gold arcs and the "
        "beam are the brightest elements in the frame. "
    ),
}


def build_prompt(subject):
    return STYLE + " " + WORLD + " " + subject


def post_images(payload, timeout=300, retries=3):
    last = None
    for a in range(retries):
        req = urllib.request.Request(
            BASE + "/images/generations",
            data=json.dumps(payload).encode(),
            headers={"Authorization": "Bearer " + KEY,
                     "Content-Type": "application/json",
                     "Accept": "application/json"},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            return e.code, body
        except Exception as e:
            last = e
            time.sleep(5 * (a + 1))
    raise last


def save(data_item, dest):
    if data_item.get("b64_json"):
        with open(dest, "wb") as f:
            f.write(base64.b64decode(data_item["b64_json"]))
        return os.path.getsize(dest)
    url = data_item.get("url")
    if url:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
            f.write(r.read())
        return os.path.getsize(dest)
    raise RuntimeError("no image payload: " + json.dumps(data_item)[:300])


def gen(name, subject, size):
    dest = os.path.join(KF, name + ".png")
    if os.path.exists(dest) and os.path.getsize(dest) > 20000:
        return name + " SKIP (exists)"
    payload = {"model": MODEL, "prompt": build_prompt(subject), "size": size, "n": 1}
    st, out = post_images(payload)
    if st != 200:
        return "%s FAIL http=%s %s" % (name, st, str(out)[:400])
    items = out.get("data") or []
    if not items:
        return "%s FAIL empty: %s" % (name, json.dumps(out)[:300])
    n = save(items[0], dest)
    return "%s ok %d bytes" % (name, n)


if __name__ == "__main__":
    only = sys.argv[1:] or list(FRAMES)
    size = os.environ.get("IMG_SIZE", "1536x1024")
    with ThreadPoolExecutor(max_workers=3) as ex:
        for msg in ex.map(lambda n: gen(n, FRAMES[n], size), only):
            print(msg, flush=True)
