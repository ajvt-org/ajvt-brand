#!/usr/bin/env python3
"""Lay a transparent corner frame over photographs and videos.

The frames are overlays: the picture keeps its own pixels and the frame goes on
top. A frame is never stretched to a shape it was not drawn for, so when a
picture's proportions don't match any frame, the *picture* is centre-cropped to
the nearest shape first. That is the rule the frame pack's own README sets out,
and it is the one thing in here worth not changing.

Frames are discovered by reading each PNG, not by trusting its name, so a shape
can be added, dropped or resized in templates/social/frames/ and this keeps
working with no change here. The frames themselves are built by
tools/build-frames.mjs into logos/dist/frames/<entity>/.

Usage:
  frame-media.py --frames DIR --input DIR --output DIR [options]

Videos need ffmpeg on PATH. Photographs need only Pillow.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}


@dataclass
class Frame:
    path: Path
    w: int
    h: int

    @property
    def name(self) -> str:
        return self.path.stem

    @property
    def aspect(self) -> float:
        return self.w / self.h


@dataclass
class Result:
    src: Path
    dst: Path | None = None
    frame: str | None = None
    kind: str = ""
    src_size: tuple[int, int] | None = None
    out_size: tuple[int, int] | None = None
    cropped: tuple[int, int] = (0, 0)
    rotation: int = 0
    status: str = "ok"
    detail: str = ""


# ---------------------------------------------------------------- frames

def load_frames(frames_dir: Path, frame_id: str | None) -> list[Frame]:
    if not frames_dir.is_dir():
        sys.exit(f"--frames is not a directory: {frames_dir}")

    frames: list[Frame] = []
    flat: list[str] = []
    for png in sorted(frames_dir.rglob("*.png")):
        if frame_id and not png.stem.startswith(frame_id):
            continue
        try:
            with Image.open(png) as im:
                w, h = im.size
                has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
        except Exception as exc:
            print(f"  ! skipping unreadable frame {png.name}: {exc}", file=sys.stderr)
            continue
        if not has_alpha:
            flat.append(png.name)
            continue
        frames.append(Frame(png, w, h))

    if flat:
        print(
            f"  ! ignored {len(flat)} frame(s) with no transparency: {', '.join(flat)}\n"
            f"    A frame must have an alpha channel or it would hide the photograph.",
            file=sys.stderr,
        )
    if not frames:
        sys.exit(f"No usable transparent PNG frames found in {frames_dir}")
    return frames


def pick_frame(frames: list[Frame], w: int, h: int) -> tuple[Frame, float]:
    """Nearest frame by aspect, compared in log space so that being 10% too tall
    and 10% too wide count the same."""
    aspect = w / h
    best = min(frames, key=lambda f: abs(math.log(f.aspect / aspect)))
    drift = abs(math.log(best.aspect / aspect))
    return best, math.expm1(drift)  # ~= relative difference


def crop_box(w: int, h: int, target: float, even: bool = False) -> tuple[int, int, int, int]:
    """Centre-crop rectangle of `w`x`h` matching aspect `target`."""
    if w / h > target:
        cw, ch = round(h * target), h
    else:
        cw, ch = w, round(w / target)
    cw, ch = min(cw, w), min(ch, h)
    if even:
        cw, ch = cw - (cw % 2), ch - (ch % 2)
    x, y = (w - cw) // 2, (h - ch) // 2
    if even:
        x, y = x - (x % 2), y - (y % 2)
    return x, y, cw, ch


# ---------------------------------------------------------------- images

def do_image(src: Path, dst: Path, frames: list[Frame], args) -> Result:
    r = Result(src=src, kind="image")
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)      # honour a phone's rotation flag
        im = im.convert("RGB")
        w, h = im.size
        r.src_size = (w, h)

        frame, drift = pick_frame(frames, w, h)
        r.frame = frame.name
        if drift > args.max_drift:
            r.status, r.detail = "skipped", (
                f"nearest frame {frame.name} is {drift:.1%} off this shape "
                f"({w}x{h}); over the {args.max_drift:.0%} limit"
            )
            return r

        x, y, cw, ch = crop_box(w, h, frame.aspect)
        r.cropped = (w - cw, h - ch)
        if (cw, ch) != (w, h):
            im = im.crop((x, y, x + cw, y + ch))
        r.out_size = (cw, ch)

        if args.dry_run:
            r.dst = dst
            return r

        with Image.open(frame.path) as fr:
            fr = fr.convert("RGBA")
            # The frame is far larger than the photo, so this only ever scales down.
            if fr.size != (cw, ch):
                fr = fr.resize((cw, ch), Image.LANCZOS)
            im = im.convert("RGBA")
            im.alpha_composite(fr)

        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.suffix.lower() in (".jpg", ".jpeg"):
            im.convert("RGB").save(
                dst, "JPEG", quality=args.jpeg_quality, subsampling=0, optimize=True
            )
        else:
            im.save(dst)
    r.dst = dst
    return r


# ---------------------------------------------------------------- videos

def probe_video(src: Path) -> tuple[int, int, int]:
    """Stored size of the video, plus any rotation its display matrix asks for.

    The stored size is the one that matters here, because the frames are read
    with -noautorotate; see do_video for why."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height:side_data=rotation",
         "-of", "json", str(src)],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip().splitlines()[-1] if out.stderr.strip() else "ffprobe failed")
    streams = json.loads(out.stdout).get("streams") or []
    if not streams:
        raise RuntimeError("no video stream")
    rotation = 0
    for side in streams[0].get("side_data_list") or []:
        if "rotation" in side:
            rotation = int(side["rotation"]) % 360
            break
    return int(streams[0]["width"]), int(streams[0]["height"]), rotation


def do_video(src: Path, dst: Path, frames: list[Frame], args) -> Result:
    r = Result(src=src, kind="video")
    w, h, rotation = probe_video(src)
    r.src_size = (w, h)
    r.rotation = rotation

    frame, drift = pick_frame(frames, w, h)
    r.frame = frame.name
    if drift > args.max_drift:
        r.status, r.detail = "skipped", (
            f"nearest frame {frame.name} is {drift:.1%} off this shape "
            f"({w}x{h}); over the {args.max_drift:.0%} limit"
        )
        return r

    x, y, cw, ch = crop_box(w, h, frame.aspect, even=True)   # h264 needs even dimensions
    r.cropped, r.out_size = (w - cw, h - ch), (cw, ch)
    if args.dry_run:
        r.dst = dst
        return r

    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        # Take the frames exactly as stored and ignore the display matrix.
        # Clips off WhatsApp regularly carry a 90 degree rotation flag that is
        # simply wrong: the stored frames are already the right way up, and
        # honouring the flag lays the picture on its side. Ignoring it also
        # keeps the filter graph's idea of the size the same as probe_video's,
        # which is what the crop below is built from.
        #
        # This overrides the flag to 0 rather than using -noautorotate, because
        # -noautorotate only stops ffmpeg turning the picture on the way in; it
        # still copies the flag to the output, and the player turns it instead.
        "-display_rotation:v:0", "0",
        "-i", str(src), "-i", str(frame.path),
        "-filter_complex",
        f"[0:v]crop={cw}:{ch}:{x}:{y}[v];"
        f"[1:v]scale={cw}:{ch}[f];"
        f"[v][f]overlay=0:0:format=auto,format=yuv420p[o]",
        "-map", "[o]", "-map", "0:a?",      # '?' so silent clips don't fail
        "-c:a", "copy",
        "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
        "-movflags", "+faststart",
        str(dst),
    ]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        r.status = "failed"
        r.detail = (out.stderr.strip().splitlines() or ["ffmpeg failed"])[-1]
        return r
    r.dst = dst
    return r


# ---------------------------------------------------------------- driver

def collect(inp: Path, recursive: bool) -> list[Path]:
    if inp.is_file():
        return [inp]
    it = inp.rglob("*") if recursive else inp.glob("*")
    keep = IMAGE_EXT | VIDEO_EXT
    return sorted(p for p in it if p.is_file() and p.suffix.lower() in keep)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Lay a transparent frame over photographs and videos.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "example:\n"
            "  tools/frame-media.py --frames logos/dist/frames/mayor-cup-2026 \\\n"
            "                       --input whatsapp --output whatsapp-framed --recursive\n"
        ),
    )
    ap.add_argument("--frames", type=Path, required=True, help="directory of transparent frame PNGs")
    ap.add_argument("--input", type=Path, required=True, help="file, or directory of media")
    ap.add_argument("--output", type=Path, required=True, help="where framed copies are written")
    ap.add_argument("--frame-id", help="only use frames whose name starts with this (e.g. 'corner')")
    ap.add_argument("--recursive", action="store_true", help="descend into sub-directories")
    ap.add_argument("--images-only", action="store_true")
    ap.add_argument("--videos-only", action="store_true")
    ap.add_argument("--jpeg-quality", type=int, default=92)
    ap.add_argument("--crf", type=int, default=20, help="video quality, lower is better (default 20)")
    ap.add_argument("--preset", default="medium", help="x264 preset")
    ap.add_argument("--max-drift", type=float, default=0.15, metavar="F",
                    help="skip media more than this far from any frame's shape (default 0.15)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--overwrite", action="store_true", help="redo files already in --output")
    ap.add_argument("--dry-run", action="store_true", help="report the plan, write nothing")
    ap.add_argument("--report", type=Path, help="write a JSON report here")
    args = ap.parse_args()

    if not args.input.exists():
        sys.exit(f"--input does not exist: {args.input}")

    frames = load_frames(args.frames, args.frame_id)
    print(f"{len(frames)} frame(s):")
    for f in sorted(frames, key=lambda f: f.aspect):
        print(f"  {f.name:<20} {f.w}x{f.h}  aspect {f.aspect:.3f}")

    media = collect(args.input, args.recursive)
    if args.images_only:
        media = [m for m in media if m.suffix.lower() in IMAGE_EXT]
    if args.videos_only:
        media = [m for m in media if m.suffix.lower() in VIDEO_EXT]
    if not media:
        sys.exit(f"No media found under {args.input}" + ("" if args.recursive else " (try --recursive)"))

    wants_video = any(m.suffix.lower() in VIDEO_EXT for m in media)
    have_ffmpeg = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))
    if wants_video and not have_ffmpeg and not args.dry_run:
        n = sum(1 for m in media if m.suffix.lower() in VIDEO_EXT)
        print(f"\n  ! ffmpeg/ffprobe not on PATH — the {n} video(s) will be skipped.\n"
              f"    Install with:  sudo apt install ffmpeg\n", file=sys.stderr)

    base = args.input if args.input.is_dir() else args.input.parent
    jobs = []
    for m in media:
        dst = args.output / m.relative_to(base)
        if dst.exists() and not args.overwrite and not args.dry_run:
            jobs.append((m, dst, True))
        else:
            jobs.append((m, dst, False))

    print(f"\n{len(media)} file(s) -> {args.output}" + ("   [dry run]" if args.dry_run else ""))

    def run(job) -> Result:
        src, dst, skip = job
        if skip:
            return Result(src=src, dst=dst, kind="", status="exists",
                          detail="already in output; --overwrite to redo")
        try:
            if src.suffix.lower() in VIDEO_EXT:
                if not have_ffmpeg:
                    if args.dry_run:
                        return Result(src=src, dst=dst, kind="video", status="needs-ffmpeg")
                    return Result(src=src, dst=dst, kind="video", status="skipped",
                                  detail="ffmpeg not installed")
                return do_video(src, dst, frames, args)
            return do_image(src, dst, frames, args)
        except Exception as exc:
            return Result(src=src, kind="", status="failed", detail=f"{type(exc).__name__}: {exc}")

    results: list[Result] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for i, r in enumerate(pool.map(run, jobs), 1):
            results.append(r)
            mark = {"ok": "+", "skipped": "-", "exists": "=", "failed": "!", "needs-ffmpeg": "?"}.get(r.status, "?")
            extra = ""
            if r.status == "ok" and any(r.cropped):
                extra = f"  (cropped {r.cropped[0]}x{r.cropped[1]}px to fit {r.frame})"
            elif r.detail:
                extra = f"  {r.detail}"
            if r.status == "ok" and r.rotation:
                extra += (f"  [ignored a {r.rotation}deg rotation flag; "
                          f"check this one is the right way up]")
            print(f"  [{i}/{len(jobs)}] {mark} {r.src.name}"
                  + (f" -> {r.frame}" if r.frame else "") + extra)

    tally: dict[str, int] = {}
    for r in results:
        tally[r.status] = tally.get(r.status, 0) + 1
    print("\n" + "  ".join(f"{k}: {v}" for k, v in sorted(tally.items())))

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(
            {"frames": [{"name": f.name, "w": f.w, "h": f.h} for f in frames],
             "results": [{**r.__dict__, "src": str(r.src), "dst": str(r.dst) if r.dst else None}
                         for r in results]},
            indent=1))
        print(f"report: {args.report}")

    return 1 if tally.get("failed") else 0


if __name__ == "__main__":
    sys.exit(main())
