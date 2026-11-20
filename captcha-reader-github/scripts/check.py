"""Validate extension assets and first-party JavaScript syntax."""
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"


def check():
    node = shutil.which("node")
    if node is None:
        raise SystemExit("Install Node.js to run JavaScript syntax checks.")
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    required = [
        manifest["background"]["service_worker"],
        manifest["side_panel"]["default_path"],
        "vendor/model.onnx", "vendor/charset.json",
        "vendor/ort.min.js", "vendor/ort-wasm-simd-threaded.wasm",
        "vendor/ort-wasm-simd-threaded.mjs",
        "vendor/glyph/model.json", "vendor/glyph/weights.bin",
    ]
    for relative in required:
        if not (EXTENSION / relative).is_file():
            raise SystemExit(f"Missing extension file: {relative}")
    model = json.loads((EXTENSION / "vendor/glyph/model.json").read_text(encoding="utf-8"))
    size = (EXTENSION / "vendor/glyph/weights.bin").stat().st_size
    for name, spec in model["weights"].items():
        if (spec["offset"] + spec["length"]) * 4 > size:
            raise SystemExit(f"Invalid weight range: {name}")
    for script in sorted(EXTENSION.glob("*.js")):
        subprocess.run([node, "--check", str(script)], check=True)
    print(f"Extension {manifest['version']} passed structure and syntax checks.")
    return manifest


if __name__ == "__main__":
    check()
