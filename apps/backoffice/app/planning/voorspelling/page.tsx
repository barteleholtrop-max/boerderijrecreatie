// De voorspelling daggasten staat sinds 16 november 2026 (wens eigenaar, nieuwe indeling stap 3) in Agenda & reserveringen →
// Bezoekersverwachting (app/planning/voorspelling-beheer.tsx). Dit adres stuurt daarheen door.
import {redirect} from 'next/navigation';
export default function Voorspelling(){redirect('/planning?tab=verwachting')}
