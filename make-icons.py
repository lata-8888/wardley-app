#!/usr/bin/env python3
"""Erzeugt alle App-Icons aus assets/logo.png.

Aufruf (im Projektordner):  python3 scripts/make-icons.py
Benötigt Pillow:            pip install pillow

Ergebnis in icons/:
  icon-192.png, icon-512.png   Standard-Icons (weisser Hintergrund, kleiner Rand)
  icon-maskable-512.png        für adaptive Android-Icons (Inhalt in der Safe Zone)
  apple-touch-icon.png         iOS-Homescreen (180x180, deckend)
  favicon-48.png               Browser-Tab (transparenter Hintergrund)
"""
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'logo.png')
OUT = os.path.join(ROOT, 'icons')
LOGO_RGB = (2, 132, 199)  # Farbe im Logo (#0284C7)

if not os.path.exists(SRC):
    sys.exit('assets/logo.png fehlt')
os.makedirs(OUT, exist_ok=True)

src = Image.open(SRC).convert('RGB')
# Inhalt freistellen: alles, was nicht (fast) weiss ist
box = src.convert('L').point(lambda v: 255 if v < 245 else 0).getbbox()
logo = src.crop(box)
side = max(logo.size)
sq = Image.new('RGB', (side, side), (255, 255, 255))
sq.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2))


def on_white(size, fraction):
    """Logo mittig auf weisser Fläche, belegt 'fraction' der Kantenlänge."""
    inner = round(size * fraction)
    canvas = Image.new('RGB', (size, size), (255, 255, 255))
    canvas.paste(sq.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2, (size - inner) // 2))
    return canvas


def transparent(size, fraction):
    """Einfarbiges Logo mit weichen Kanten auf transparentem Grund (Alpha aus dem Rot-Kanal)."""
    inner = round(size * fraction)
    big = sq.resize((inner * 4, inner * 4), Image.LANCZOS)
    r = big.split()[0]
    alpha = r.point(lambda v: max(0, min(255, round((255 - v) * 255 / (255 - LOGO_RGB[0])))))
    layer = Image.new('RGBA', big.size, LOGO_RGB + (0,))
    layer.putalpha(alpha)
    layer = layer.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(layer, ((size - inner) // 2, (size - inner) // 2), layer)
    return canvas


# Maskable: Das Logo hat eine eckige Ecke links unten. Damit sie auch bei runder Maske
# (Safe Zone = Kreis mit 80 % Durchmesser) sichtbar bleibt, belegt es nur 56 % der Kante.
on_white(192, 0.88).save(os.path.join(OUT, 'icon-192.png'), optimize=True)
on_white(512, 0.88).save(os.path.join(OUT, 'icon-512.png'), optimize=True)
on_white(512, 0.56).save(os.path.join(OUT, 'icon-maskable-512.png'), optimize=True)
on_white(180, 0.84).save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)
transparent(48, 0.96).save(os.path.join(OUT, 'favicon-48.png'), optimize=True)
print('Icons erzeugt in', os.path.normpath(OUT))
