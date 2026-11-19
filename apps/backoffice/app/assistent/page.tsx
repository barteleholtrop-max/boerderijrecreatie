'use client';
import {Suspense} from 'react';
import {Assistent} from './weekchat';
// useSearchParams needs a Suspense boundary for the static build.
export default function Page(){return <Suspense fallback={<div className="card empty">Laden…</div>}><Assistent/></Suspense>}
