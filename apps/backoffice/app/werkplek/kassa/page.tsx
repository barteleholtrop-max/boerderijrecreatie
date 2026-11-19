'use client';
// Kassa als eigen werkplekscherm (besluit eigenaar 4 november 2026): zelfde kassa als /kassa, maar zonder backofficemenu
// en zonder links naar de backoffice. Wisselen naar kok, barista, winkel en opnemen gaat via de balk bovenaan.
import {CashRegister} from '../../kassa/register';
export default function KioskKassa(){return <CashRegister kiosk/>}
