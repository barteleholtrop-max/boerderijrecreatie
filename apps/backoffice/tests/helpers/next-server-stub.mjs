// Test-only: een minimale vervanger van next/server, zodat de proxy (proxy.ts) zonder Next.js te testen is.
export class NextResponse{
 constructor(body,init={}){this.status=init.status??200;this.headers=new Headers(init.headers);this.body=body}
 static next(o={}){const r=new NextResponse(null);r.kind='next';r.forwarded=o.request?.headers||null;return r}
 static json(b,init={}){const r=new NextResponse(JSON.stringify(b),init);r.kind='json';return r}
 static redirect(u,status=307){const r=new NextResponse(null,{status});r.kind='redirect';r.location=String(u);return r}
}
