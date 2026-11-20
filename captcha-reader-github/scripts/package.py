"""Create a distributable ZIP after validating the extension."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from check import EXTENSION, ROOT, check


def main():
    manifest = check()
    destination = ROOT / "dist"
    destination.mkdir(exist_ok=True)
    archive = destination / f"captcha-reader-v{manifest['version']}.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as output:
        for source in sorted(EXTENSION.rglob("*")):
            if source.is_file():
                output.write(source, Path("captcha-reader") / source.relative_to(EXTENSION))
    with ZipFile(archive) as output:
        bad_file = output.testzip()
        if bad_file:
            raise SystemExit(f"Archive verification failed: {bad_file}")
    print(archive)


if __name__ == "__main__":
    main()
