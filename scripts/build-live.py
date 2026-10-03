"""Prepare the agreed visual preview as a standalone static folder."""

from pathlib import Path
import re
import shutil

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design-preview"
OUTPUT = ROOT / "live"
ASSETS = OUTPUT / "assets"
FONTS = OUTPUT / "fonts"


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    FONTS.mkdir(parents=True, exist_ok=True)
    html = (SOURCE / "soft-direction.html").read_text(encoding="utf-8")
    css = (SOURCE / "soft-direction.css").read_text(encoding="utf-8")

    image_sources = {
        match: (SOURCE / match).resolve()
        for match in re.findall(r'src="([^\"]+\.png)"', html)
    }
    source_bytes = 0
    published_bytes = 0
    for reference, source in image_sources.items():
        if not source.is_relative_to(ROOT):
            raise ValueError(f"Image outside project: {reference}")
        destination = ASSETS / (source.stem + ".webp")
        with Image.open(source) as original:
            image = original.convert("RGBA" if "A" in original.getbands() else "RGB")
            image.save(destination, "WEBP", quality=92 if source.stem == "course-book" else 85, method=6)
        html = html.replace(reference, "assets/" + destination.name)
        source_bytes += source.stat().st_size
        published_bytes += destination.stat().st_size

    fonts_source = ROOT / "homepage-design-assets" / "fonts"
    for source in fonts_source.iterdir():
        if source.is_file():
            shutil.copyfile(source, FONTS / source.name)
    css = css.replace("../homepage-design-assets/fonts/", "fonts/")
    html = html.replace('href="soft-direction.css"', 'href="style.css"')
    html = html.replace(
        "Виктория Ярмолинская — мягкое визуальное направление",
        "Виктория Ярмолинская — визуальный макет сайта",
    )
    html = html.replace(
        '  <link rel="stylesheet" href="style.css">',
        '  <link rel="preload" as="image" href="assets/hero.webp" fetchpriority="high">\n'
        '  <link rel="stylesheet" href="style.css">',
    )
    html = html.replace('class="hero__photo"', 'class="hero__photo" fetchpriority="high"')
    (OUTPUT / "index.html").write_text(html, encoding="utf-8", newline="\n")
    (OUTPUT / "style.css").write_text(css, encoding="utf-8", newline="\n")
    (OUTPUT / ".nojekyll").write_text("", encoding="utf-8")
    print(f"live/: {len(image_sources)} images; {source_bytes:,} -> {published_bytes:,} bytes")


if __name__ == "__main__":
    main()
