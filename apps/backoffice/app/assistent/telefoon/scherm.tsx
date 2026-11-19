'use client';
import {Suspense} from 'react';
import {Assistent} from '../weekchat';
// Weekassistent in de app Gesprekken: meteen het weekgesprek van deze week, als WhatsApp-gesprek met spraak.
export default function Page(){return <Suspense fallback={<p className="small">Laden…</p>}><Assistent app/></Suspense>}
