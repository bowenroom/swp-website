#!/usr/bin/env python3
"""Scroll-world video chain via the rb.coolhs.com API (preset: tail_frame).

Why this shape: `tail_frame` accepts a START image and an END image. So the four
shots are chained by construction --

    shot1 = f(K0 -> K1)
    shot2 = f(K1 -> K2)     <- starts on K1, the same still shot1 ends on
    shot3 = f(K2 -> K3)
    shot4 = f(K3 -> K4)

Each seam is therefore the *same image* on both sides, which is the strongest
form of frame-locking available: no connector clips are needed, so the whole
4-shot chain costs 4 generations instead of 7, leaving 6 of the 10 chances
spare for re-rolls.
"""
import json, os, sys, time, urllib.request, urllib.error, uuid, mimetypes

BASE = "https://rb.coolhs.com"
CARD = os.environ.get("RB_CARD", "")
if not CARD:
    raise SystemExit("set RB_CARD in the environment; never hardcode the card key")
HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, "frames")
SHOTS = os.path.join(HERE, "shots")
LOGS = os.path.join(HERE, "logs")
for d in (SHOTS, LOGS):
    os.makedirs(d, exist_ok=True)

W, H = 1344, 768
SECONDS = 8

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")

# Shared style tail -- identical in every prompt so the four clips read as one film.
STYLE = (
    "Soft matte clay 3D miniature tilt-shift diorama world, handcrafted toy-model "
    "aesthetic, rounded organic polymer-clay shapes, matte velvety surfaces, soft warm "
    "studio light, long soft shadows, miniature depth of field with softly blurred far "
    "edges. Restrained low-saturation palette: warm ivory cream background, muted indigo, "
    "dusty lavender, soft sage green, pale terracotta, warm ochre gold accents, warm "
    "charcoal. The same continuous floating island world throughout: a curving two-lane "
    "highway with pale lane markings and a low guardrail, soft green hills, rounded toy "
    "trees, grey rock outcrops, a blue river with a short waterfall and a little arched "
    "bridge, small rounded stylized cars in muted colours, and unmanned rounded toy "
    "quadcopter drones with no cockpit, no pilot, no human figure aboard."
)

# (name, start_keyframe, end_keyframe, camera move, focal point, settle direction)
CHAIN = [
    ("s1-approach", "k0-establish", "k1-road",
     "The camera begins very high and far away above the small floating island, then "
     "descends in one smooth continuous swoop, growing steadily larger as it falls, "
     "steeply tilting from a top-down three-quarter view down toward the horizon as it "
     "approaches, and gliding forward until it is low and close over the highway, near "
     "road level.",
     "the stretch of highway where a small white car is stopped on the shoulder beside "
     "two tiny traffic cones, while other cars pass on the open lanes and a single "
     "unmanned drone hovers above the incident with a small sensor pod beneath it",
     "low over the asphalt, looking along the road in the direction of travel, still "
     "moving gently forward"),

    ("s2-sensing", "k1-road", "k2-sensing",
     "The camera continues forward along the highway and rises from road level to about "
     "tree height, drifting to one side and angling down at the road, the guardrail and "
     "the grass verge sweeping past close to the lens in the foreground.",
     "a new stretch of highway where three unmanned quadcopter drones hover in a loose "
     "formation, each projecting a soft translucent pale blue sensing cone down onto the "
     "asphalt, the cones overlapping and brightening where they cross, while a small "
     "four wheeled ground robot with a sensor mast sits on the shoulder and two cars pass "
     "through the overlapping light",
     "holding that mid height, still gliding forward above the road"),

    ("s3-fusion", "k2-sensing", "k3-fusion",
     "The camera keeps travelling forward and climbs higher while turning to look down at "
     "a gentle angle onto a wide open stretch of road and the valley beside it, the "
     "landmass tilting slightly as the perspective swings from low and level to "
     "elevated and looking down.",
     "a loose ring of small physical clay evidence fragments floating above the ground -- "
     "flat tiles of road texture, contour tiles of terrain, tiny model cars, a small clay "
     "cloud form, a chip of asphalt, a fallen branch -- streaming inward through the air "
     "toward one softly glowing pale indigo point above the road, converging like a "
     "diagram made of real little objects, with warm gold highlights on a few fragments "
     "and one small drone watching from the upper corner",
     "easing into a slower, steadier forward drift at that elevated angle"),

    ("s4-decision", "k3-fusion", "k4-decision",
     "The camera pulls back and rises away from the close valley view, opening out to a "
     "wider elevated view over a busy interchange section of the highway with mountains, "
     "a waterfall and dense forest behind it, the whole scene settling into a calm "
     "composed final vista.",
     "four small rounded clay agents hovering high in a diamond formation, linked to each "
     "other by thin glowing warm gold arcs, with one soft gold beam descending from the "
     "lowest agent to the roadway below, while underneath traffic flows freely and evenly, "
     "cars well spaced and moving in both directions, the cones gone and the road clear",
     "a gentle almost-still drift, coming to rest on the final composed view"),
]


def build_prompt(move, focal, settle):
    return (
        "Single continuous cinematic camera move, one take, no cuts, no transitions. "
        + move
        + " Throughout, keep the camera gliding toward " + focal + ". "
        + "In the final second, the movement settles and calms into " + settle + ". "
        + STYLE
        + " Smooth, graceful, slow motion, gentle natural parallax, steady smooth motion, "
        "no camera shake. No text, no captions, no letters, no numbers, no logos, no "
        "watermarks, no user interface overlays. 16:9 landscape."
    )


def _req(url, data=None, headers=None, method=None, timeout=120, retries=5):
    h = {"Authorization": "Bearer " + CARD, "Accept": "application/json",
         "User-Agent": UA}
    if headers:
        h.update(headers)
    last = None
    for a in range(retries):
        req = urllib.request.Request(url, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except Exception as e:
            last = e
            time.sleep(4 * (a + 1))
    raise last


def jget(url, **kw):
    st, body = _req(url, **kw)
    try:
        return st, json.loads(body.decode())
    except Exception:
        return st, body.decode(errors="replace")


def upload(path):
    boundary = "----rb" + uuid.uuid4().hex
    fn = os.path.basename(path)
    ct = mimetypes.guess_type(fn)[0] or "image/png"
    with open(path, "rb") as f:
        data = f.read()
    body = (("--%s\r\n" % boundary).encode()
            + ('Content-Disposition: form-data; name="files"; filename="%s"\r\n' % fn).encode()
            + ("Content-Type: %s\r\n\r\n" % ct).encode()
            + data + ("\r\n--%s--\r\n" % boundary).encode())
    st, out = jget(BASE + "/api/v1/uploads", data=body,
                   headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    if st != 200:
        raise RuntimeError("upload %s failed %s %s" % (fn, st, str(out)[:400]))
    return out["items"][0]["ref"]


def submit(prompt, start_png, end_png, tag):
    refs = []
    for p in (start_png, end_png):
        refs.append(upload(p))
    payload = {"preset": "tail_frame", "prompt": prompt, "images": refs,
               "width": W, "height": H, "seconds": SECONDS,
               "sampler_steps": 20, "interpolate": True}
    st, out = jget(BASE + "/api/v1/jobs", data=json.dumps(payload).encode(),
                   headers={"Content-Type": "application/json"})
    if st != 200:
        raise RuntimeError("submit %s failed %s %s" % (tag, st, str(out)[:500]))
    job = out["job"]
    with open(os.path.join(LOGS, tag + ".json"), "w") as f:
        json.dump(job, f, ensure_ascii=False, indent=2)
    return job["id"]


def wait_for(job_id, tag, poll=6, cap=60 * 40):
    t0 = time.time()
    while time.time() - t0 < cap:
        st, out = jget(BASE + "/api/v1/jobs/" + job_id)
        job = out.get("job", {}) if isinstance(out, dict) else {}
        s = job.get("status")
        print("  %s %s" % (tag, s), flush=True)
        if s == "done":
            return job
        if s in ("failed", "cancelled"):
            raise RuntimeError("%s %s: %s" % (tag, s, job.get("error")))
        time.sleep(poll)
    raise TimeoutError(tag + " timed out")


def download(job_id, dest):
    st, body = _req(BASE + "/api/v1/jobs/" + job_id + "/video", timeout=600)
    if st != 200:
        raise RuntimeError("download failed %s %s" % (st, body[:300]))
    with open(dest, "wb") as f:
        f.write(body)
    return os.path.getsize(dest)


def run(tag, start, end, move, focal, settle):
    dest = os.path.join(SHOTS, tag + ".mp4")
    if os.path.exists(dest) and os.path.getsize(dest) > 100000:
        return tag + " SKIP (exists)"
    prompt = build_prompt(move, focal, settle)
    with open(os.path.join(LOGS, tag + ".prompt.txt"), "w") as f:
        f.write(prompt)
    # Resume support: if a previous run already submitted this tag, reuse that job
    # instead of spending another credit. Never re-submit a tag that has a live job.
    jid = resume_job(tag)
    if jid is None:
        jid = str(submit(prompt, os.path.join(FRAMES, start + ".png"),
                          os.path.join(FRAMES, end + ".png"), tag))
        print(tag + " submitted job=" + jid, flush=True)
    else:
        print(tag + " resumed job=" + jid, flush=True)
    job = wait_for(jid, tag)
    n = download(jid, dest)
    return "%s ok job=%s %d bytes" % (tag, jid, n)


def resume_job(tag):
    """Return the id of an existing unfinished/completed job for `tag`, else None."""
    logf = os.path.join(LOGS, tag + ".json")
    if not os.path.exists(logf):
        return None
    try:
        with open(logf) as f:
            jid = str(json.load(f).get("id"))
    except Exception:
        return None
    st, out = jget(BASE + "/api/v1/jobs/" + jid)
    if st == 200 and isinstance(out, dict) and out.get("job"):
        s = out["job"].get("status")
        if s in ("pending", "running"):
            return jid
        if s == "done":
            return jid
    return None


if __name__ == "__main__":
    want = sys.argv[1:]
    for tag, a, b, move, focal, settle in CHAIN:
        if want and tag not in want:
            continue
        try:
            print(run(tag, a, b, move, focal, settle), flush=True)
        except Exception as e:
            print("%s FAIL %s" % (tag, e), flush=True)
