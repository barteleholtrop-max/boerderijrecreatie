#!/usr/bin/env python3
"""Iconen voor het startscherm van de telefoon of tablet (wens eigenaar 9 november 2026: „Kun je in het blokje zetten welk
onderdeel het is?"). Elk icoon: het Boer Bart-logo bovenaan en onderaan een gekleurde balk met de naam van het onderdeel, in
dezelfde stijl als LEDEN en KASSA (#317). Het logo wordt overgenomen uit public/icons/leden-512.png.

Gebruik: python3 tools/startscherm-iconen.py   (schrijft apps/backoffice/public/icons/<naam>-192.png en -512.png)
Nodig: Pillow en het lettertype DejaVu Sans Bold.
"""
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
ICONS = ROOT / 'apps/backoffice/public/icons'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
BAND_TOP = 359          # waar de balk begint in leden-512.png en kassa-512.png
TEXT_HEIGHT = 50         # hoogte van de hoofdletters in de bestaande iconen
MAX_TEXT_WIDTH = 440

# naam in de balk, bestandsnaam, kleur van de balk
ONDERDELEN = [
    ('BACKOFFICE', 'backoffice', (47, 72, 88)),   # blauwgrijs
    ('WERKPLEK', 'werkplek', (122, 92, 30)),      # okerbruin
    ('OPNEMEN', 'opnemen', (107, 58, 91)),        # aubergine
    ('GESPREKKEN', 'gesprekken', (38, 61, 48)),   # donkergroen (app Gesprekken, 10 november 2026)
]


def icon(label: str, colour: tuple[int, int, int]) -> Image.Image:
    base = Image.open(ICONS / 'leden-512.png').convert('RGB')
    im = Image.new('RGB', (512, 512), colour)
    im.paste(base.crop((0, 0, 512, BAND_TOP)), (0, 0))
    draw = ImageDraw.Draw(im)
    size = 120
    while size > 10:
        font = ImageFont.truetype(FONT, size)
        left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
        if bottom - top <= TEXT_HEIGHT and right - left <= MAX_TEXT_WIDTH:
            break
        size -= 1
    left, top, right, bottom = draw.textbbox((0, 0), label, font=font)
    x = (512 - (right - left)) / 2 - left
    y = BAND_TOP + (512 - BAND_TOP - (bottom - top)) / 2 - top
    draw.text((x, y), label, font=font, fill=(255, 255, 255))
    return im


def main() -> None:
    for label, name, colour in ONDERDELEN:
        big = icon(label, colour)
        big.save(ICONS / f'{name}-512.png', optimize=True)
        big.resize((192, 192), Image.LANCZOS).save(ICONS / f'{name}-192.png', optimize=True)
        print('geschreven', name)


if __name__ == '__main__':
    main()
