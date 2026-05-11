from PIL import Image, ImageFilter
from pathlib import Path

src = Path(__file__).parent / "logo.jpeg"
out_dir = Path(__file__).parent

img = Image.open(src).convert("RGB")
print(f"Original size: {img.size}")

w, h = img.size
img2x = img.resize((w * 2, h * 2), Image.LANCZOS)
img2x = img2x.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=2))

rgba = img2x.convert("RGBA")
pixels = rgba.load()
W, H = rgba.size

DARK = 70
LIGHT = 235

for y in range(H):
    for x in range(W):
        r, g, b, _ = pixels[x, y]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        if lum >= LIGHT:
            alpha = 0
        elif lum <= DARK:
            alpha = 255
        else:
            alpha = int(255 * (LIGHT - lum) / (LIGHT - DARK))
        pixels[x, y] = (15, 15, 18, alpha)

bbox = rgba.getbbox()
if bbox:
    pad = 60
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(W, bbox[2] + pad)
    bottom = min(H, bbox[3] + pad)
    rgba = rgba.crop((left, top, right, bottom))

png_path = out_dir / "logo.png"
rgba.save(png_path, "PNG", optimize=True)
print(f"Saved transparent PNG: {png_path} ({rgba.size[0]}x{rgba.size[1]})")

white_bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
white_bg.alpha_composite(rgba)
white_bg.convert("RGB").save(out_dir / "logo-on-white.png", "PNG", optimize=True)

black_bg = Image.new("RGBA", rgba.size, (10, 10, 12, 255))
inv = rgba.copy()
inv_pixels = inv.load()
for y in range(inv.size[1]):
    for x in range(inv.size[0]):
        r, g, b, a = inv_pixels[x, y]
        inv_pixels[x, y] = (245, 245, 245, a)
black_bg.alpha_composite(inv)
black_bg.convert("RGB").save(out_dir / "logo-on-black.png", "PNG", optimize=True)

inv_transparent = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
inv_transparent.alpha_composite(inv)
inv_transparent.save(out_dir / "logo-white.png", "PNG", optimize=True)

print("Done.")
