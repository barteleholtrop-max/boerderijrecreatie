import type { NextConfig } from 'next';
// Telefoonstand (./boerbart-test --telefoon): the development server also accepts its own files from the tunnel address.
const tunnelOrigin=process.env.BACKOFFICE_TUNNEL_ORIGIN;
// PGlite (ingebouwde Postgres, met eigen WebAssembly-bestanden) en de Postgres-driver niet bundelen maar als pakket meenemen.
// Online (Cloud Run): de migraties en de beginvulling worden bij de start uit drizzle-pg/ en snapshot/ gelezen; zo komen ze mee in de serverfunctie.
// Beveiligingskoppen op elk antwoord (#289). Geen eigen Content-Security-Policy hier: losse routes (bonnen, pdf's, foto's)
// zetten hun eigen, strengere CSP en die mag niet botsen. Inbedden in een frame van een andere site mag niet (klikkapen);
// HSTS geldt alleen via https (online) en wordt lokaal over http door de browser genegeerd. Referrer-Policy no-referrer:
// deze kop gaat vóór die van een losse route, en ledenlinks, offertes en bonnen dragen een geheime code in het adres.
export const SECURITY_HEADERS=[
 {key:'X-Frame-Options',value:'DENY'},
 {key:'X-Content-Type-Options',value:'nosniff'},
 {key:'Referrer-Policy',value:'no-referrer'},
 {key:'Strict-Transport-Security',value:'max-age=31536000'},
];
const config:NextConfig={poweredByHeader:false,async headers(){return [{source:'/:path*',headers:SECURITY_HEADERS}]},output:'standalone',serverExternalPackages:['@electric-sql/pglite','postgres'],outputFileTracingIncludes:{'/**':['./drizzle-pg/**/*','./snapshot/**/*']},...(tunnelOrigin?{allowedDevOrigins:[new URL(tunnelOrigin).hostname]}:{})};
export default config;
