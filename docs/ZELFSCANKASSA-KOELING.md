# Zelfscankassa bij de koeling (eerste project)

Gasten pakken een drankje uit de koeling, scannen het en rekenen zelf af. Het ontwerp (vijf schermen) staat op
https://claude.ai/artifact/Ud7tMeQ46kQAck8WxQqtwU.

## Wat er al is

- **Zelfkassa op een tablet** (`apps/website/zelfkassa.html`): grote toetsen per product, een bon met plus en min, afrekenen
  met een QR-code naar iDEAL op de eigen telefoon, en na het betalen een leeg scherm voor de volgende gast.
- **Zelfscan op de eigen telefoon** (`apps/website/zelfscan.html`).
- **Producten en prijzen** uit Gerechten & prijzen; een product met een streepjescode wordt herkend.
- **QR-stickers** per product (Winkel → Zelfkassa & QR-stickers).
- **Voorraad**: na betaling gaat de verkoop van de voorraad af.

## Wat er nog moet gebeuren (opdrachten voor Claude)

1. **Streepjescode scannen met een losse scanner.** Een USB- of Bluetooth-scanner typt de code als toetsenbord. De zelfkassa
   luistert naar die invoer en zet het product met die streepjescode in het mandje. Onbekende code: een duidelijke melding en
   de knop „Kies zelf”.
2. **Statiegeld.** Per product het statiegeld (geen, € 0,15 of € 0,25) in Gerechten & prijzen, en een aparte regel
   „Statiegeld” op de bon en in de omzet. Statiegeld valt buiten de btw.
3. **Pinnen op een pinautomaat.** Via de Mollie-pinterminal (het terminal-ID komt uit het Mollie-dashboard). Tot die er is:
   alleen de QR-code.
4. **Koelingstand.** Een vaste stand van de zelfkassa voor de tablet bij de koeling: alleen frisdrank, de scanner actief,
   na 60 seconden zonder tik een leeg mandje.
5. **Melding bij bijna op.** Zakt een drankje onder het minimum, dan een melding op het dashboard.

## Nodig

Een tablet met een standaard, een streepjescodescanner, een Mollie-account en de lijst met drankjes en prijzen.
