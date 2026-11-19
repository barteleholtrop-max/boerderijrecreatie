#!/usr/bin/env python3
"""Logo en iconen voor het startscherm (startpakket, 19 november 2026).

Een neutraal tijdelijk logo (een schuur in een cirkel, zonder naam) en per app een icoon met dat logo bovenaan en onderaan een
gekleurde balk met de naam van het onderdeel. Vervang het logo door het echte logo van het bedrijf: zet het op
apps/backoffice/public/logo-bron.png (vierkant, minstens 512 bij 512) en draai dit script opnieuw; dan gebruikt elk icoon dat logo.

Gebruik: python3 tools/startscherm-iconen.py
Schrijft: apps/backoffice/public/icons/<naam>-192.png en -512.png, apps/backoffice/public/logo.webp,
          apps/website/beeld/<naam>-192.png en -512.png en apps/website/beeld/logo.webp.
Nodig: Pillow en het lettertype DejaVu Sans Bold.
"""
import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
OFFICE = ROOT / 'apps/backoffice/public'
SITE = ROOT / 'apps/website/beeld'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
GREEN = (46, 94, 62)
CREAM = (247, 245, 236)
BAND_TOP = 359
TEXT_HEIGHT = 50
MAX_TEXT_WIDTH = 440

# naam in de balk, bestandsnaam, kleur van de balk, map
ICONS = [
    ('BACKOFFICE', 'backoffice', (47, 72, 88), OFFICE / 'icons'),
    ('WERKPLEK', 'werkplek', (122, 92, 30), OFFICE / 'icons'),
    ('OPNEMEN', 'opnemen', (107, 58, 91), OFFICE / 'icons'),
    ('GESPREKKEN', 'gesprekken', (38, 61, 48), OFFICE / 'icons'),
    ('KASSA', 'kassa', (181, 84, 44), OFFICE / 'icons'),
    ('BESTELLEN', 'bestellen', (46, 94, 62), SITE),
    ('ZELFSCAN', 'zelfscan', (11, 94, 122), SITE),
    ('ZELFKASSA', 'zelfkassa', (11, 94, 122), SITE),
]


def logo(size: int = 512) -> Image.Image:
    """Het eigen logo als dat er is, anders het neutrale logo: een schuur in een crèmekleurige cirkel."""
    own = OFFICE / 'logo-bron.png'
    if own.exists():
        return Image.open(own).convert('RGBA').resize((size, size), Image.LANCZOS)
    s = 4 * size  # groot tekenen en dan verkleinen, voor gladde randen
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, s - 1, s - 1), fill=GREEN)
    m = s * 0.06
    d.ellipse((m, m, s - m, s - m), fill=CREAM)
    u = s / 100
    # schuur: dak, gevel en deur met kruis
    d.polygon([(22 * u, 46 * u), (50 * u, 22 * u), (78 * u, 46 * u)], fill=GREEN)
    d.rectangle((28 * u, 46 * u, 72 * u, 76 * u), fill=GREEN)
    d.rectangle((41 * u, 54 * u, 59 * u, 76 * u), fill=CREAM)
    w = 2.2 * u
    d.line((41 * u, 54 * u, 59 * u, 76 * u), fill=GREEN, width=int(w))
    d.line((59 * u, 54 * u, 41 * u, 76 * u), fill=GREEN, width=int(w))
    return im.resize((size, size), Image.LANCZOS)


def icon(label: str, colour: tuple[int, int, int]) -> Image.Image:
    im = Image.new('RGB', (512, 512), colour)
    mark = logo(320)
    im.paste(mark, ((512 - 320) // 2, 24), mark)
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
    for label, name, colour, folder in ICONS:
        folder.mkdir(parents=True, exist_ok=True)
        im = icon(label, colour)
        im.save(folder / f'{name}-512.png', optimize=True)
        im.resize((192, 192), Image.LANCZOS).save(folder / f'{name}-192.png', optimize=True)
    mark = logo(256)
    mark.save(OFFICE / 'logo.webp', 'WEBP', quality=90)
    SITE.mkdir(parents=True, exist_ok=True)
    mark.save(SITE / 'logo.webp', 'WEBP', quality=90)


if __name__ == '__main__':
    main()
