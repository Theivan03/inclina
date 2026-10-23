# Iconos de Inclina según el diseño: fondo ámbar #FFAE1A, arco e indicador negros #15140F.
# Genera: www/icon-192.png, www/icon-512.png, www/icon-512-maskable.png y las fuentes para
# @capacitor/assets en assets/ (icon-only, icon-foreground, icon-background, splash, splash-dark).
# Uso: python3 tools/make-assets.py  [&& npx capacitor-assets generate --android --ios]
import math, os
from PIL import Image, ImageDraw, ImageFont

AMBER = (255, 174, 26)
INK = (21, 20, 15)
DAY_BG = (244, 242, 236)
NIGHT_BG = (18, 17, 16)
CREAM = (242, 237, 227)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def glyph(d, cx, cy, r, w, color):
    """Arco de 180° con aguja hacia la izquierda y eje redondo, como en el icono del diseño."""
    box = [cx - r, cy - r, cx + r, cy + r]
    d.arc(box, 180, 360, fill=color, width=w)
    a = math.radians(222)
    x2, y2 = cx + r * 0.62 * math.cos(a), cy + r * 0.62 * math.sin(a)
    d.line([(cx, cy), (x2, y2)], fill=color, width=int(w * 0.62))
    hub = w * 0.5
    d.ellipse([cx - hub, cy - hub, cx + hub, cy + hub], fill=color)
    tip = w * 0.31
    d.ellipse([x2 - tip, y2 - tip, x2 + tip, y2 + tip], fill=color)

def icon(size, bg=AMBER, rounded=False, scale=1.0):
    s = size * 4
    im = Image.new("RGBA", (s, s), bg + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    glyph(d, s / 2, s * 0.64, s * 0.37 * scale, int(s * 0.095 * scale), INK)
    if rounded:
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
        im.putalpha(mask)
    return im.resize((size, size), Image.LANCZOS)

def splash(size, dark):
    im = Image.new("RGB", (size, size), NIGHT_BG if dark else DAY_BG)
    d = ImageDraw.Draw(im)
    tile = int(size * 0.17)
    ic = icon(tile, rounded=True)
    im.paste(ic, (size // 2 - tile // 2, int(size * 0.46) - tile // 2), ic)
    try:
        font = ImageFont.truetype(FONT, int(size * 0.04))
        txt = "INCLINA"
        bb = d.textbbox((0, 0), txt, font=font)
        d.text((size / 2 - (bb[2] - bb[0]) / 2 - bb[0], int(size * 0.46) + tile // 2 + size * 0.03), txt, font=font, fill=CREAM if dark else INK)
    except Exception:
        pass
    return im

www = os.path.join(ROOT, "www"); assets = os.path.join(ROOT, "assets")
os.makedirs(assets, exist_ok=True)
icon(192, rounded=False).convert("RGB").save(os.path.join(www, "icon-192.png"))
icon(512, rounded=False).convert("RGB").save(os.path.join(www, "icon-512.png"))
icon(512, rounded=False, scale=0.8).convert("RGB").save(os.path.join(www, "icon-512-maskable.png"))
icon(1024, rounded=False).convert("RGB").save(os.path.join(assets, "icon-only.png"))
icon(1024, bg=None).save(os.path.join(assets, "icon-foreground.png"))
Image.new("RGB", (1024, 1024), AMBER).save(os.path.join(assets, "icon-background.png"))
splash(2732, True).save(os.path.join(assets, "splash-dark.png"))
splash(2732, False).save(os.path.join(assets, "splash.png"))
print("ok")
