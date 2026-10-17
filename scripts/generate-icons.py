"""Regenerate ADPAI's simple opaque lettermark; requires Pillow and DejaVu Sans."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
target = root / "assets/icons"
target.mkdir(parents=True, exist_ok=True)
image = Image.new("RGB", (1024, 1024), "#0b1220")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("DejaVuSans-Bold.ttf", 600)
draw.text((512, 488), "A", fill="white", font=font, anchor="mm")
draw.rounded_rectangle((357, 794, 667, 824), radius=15, fill="#4169e1")
for name, size in [("icon-192", 192), ("icon-512", 512), ("apple-touch-icon", 180), ("app-1024", 1024)]:
    image.resize((size, size), Image.Resampling.LANCZOS).save(target / f"{name}.png")
print("Generated ADPAI icons")

# Platform resources are tracked; regeneration does not require the mobile
# toolchains and never overwrites source/platform configuration.
android = root / "android/app/src/main/res"
if android.is_dir():
    for density, size, foreground in [("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216), ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432)]:
        folder = android / f"mipmap-{density}"
        for name in ["ic_launcher", "ic_launcher_round"]:
            image.resize((size, size), Image.Resampling.LANCZOS).save(folder / f"{name}.png")
        image.resize((foreground, foreground), Image.Resampling.LANCZOS).save(folder / "ic_launcher_foreground.png")
    for splash in android.glob("drawable*/splash.png"):
        with Image.open(splash) as old:
            size = old.size
        canvas = Image.new("RGB", size, "#f7f8fb")
        side = max(24, min(size) // 3)
        canvas.paste(image.resize((side, side), Image.Resampling.LANCZOS), ((size[0] - side) // 2, (size[1] - side) // 2))
        canvas.save(splash)
ios = root / "ios/App/App/Assets.xcassets"
if ios.is_dir():
    image.save(ios / "AppIcon.appiconset/AppIcon-512@2x.png")
    for splash in (ios / "Splash.imageset").glob("*.png"):
        canvas = Image.new("RGB", (2732, 2732), "#f7f8fb")
        canvas.paste(image.resize((420, 420), Image.Resampling.LANCZOS), (1156, 1156))
        canvas.save(splash)
