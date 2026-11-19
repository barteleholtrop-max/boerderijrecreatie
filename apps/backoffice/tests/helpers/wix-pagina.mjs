// Nagemaakte Wix-blogpagina in de vorm van de echte (voor tests/oude-blogs.test.mjs), zodat de test zonder internet draait.
export const COVER='https://static.wixstatic.com/media/04235c_f098d292d0704a30ab1a0cb1921a0ddc~mv2.jpg/v1/fill/w_1920,h_900,al_c,q_85/04235c_f098d292d0704a30ab1a0cb1921a0ddc~mv2.jpg';
export const page=({title='Onze ideale koe',date='2018-03-11T10:29:27.000Z',body}={})=>`<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":${JSON.stringify(title)},"datePublished":"${date}","image":{"@type":"ImageObject","url":"${COVER}"}}</script>
</head><body><div data-hook="post-title">x</div><div data-id="content-viewer"><style>.a{color:red}</style>${body??`
<div><p dir="auto"><span><strong>Gras zo goedkoop mogelijk omzetten in voedsel. Daar hoort een ideale koe bij, maar hoe vind je die?</strong></span></p></div>
<div><h2 dir="auto"><span aria-hidden="true" id="x"></span><span>Kijken naar de omgeving</span></h2></div>
<div><p><span>Als je op zoek gaat naar de ideale koe &amp; de juiste grond, moet je&nbsp;jezelf vragen stellen.<br>Tweede regel.</span></p></div>
<p></p>
<ul><li><p><span>De geit</span></p></li><li><p><span>De Jersey</span></p></li></ul>
<div><iframe src="https://www.youtube.com/embed/TfT49gaiktg"></iframe></div>
<div><p>Slot.</p></div>`}</div><div data-hook="post-footer"><p>Delen op Facebook</p></div></body></html>`;


// Nagemaakte gewone Wix-pagina (voor tests/verhalen.test.mjs): kop- en voettekst van de site, tekst in <main>, ook in kopstijl.
export const PAGE_PHOTO='https://static.wixstatic.com/media/04235c_'+'d'.repeat(32)+'~mv2.jpg';
export const storyPage=(extra='')=>`<html><head><title>Jerseys | Rianne &amp; Bart (Boer Bart)</title></head><body>
<header id="SITE_HEADER"><p>Menu Home Contact</p></header>
<main id="PAGES_CONTAINER" class="x"><div data-testid="richTextElement"><h1><span>Jerseys</span></h1></div>
<div data-testid="richTextElement"><h2><span>Jerseys</span></h2></div>
<img src="${PAGE_PHOTO}/v1/fill/w_300,h_200/x.jpg">
<div data-testid="richTextElement"><p>Wij melken Jerseys, omdat ze de meeste melk van gras kunnen maken.</p></div>
<div data-testid="richTextElement"><h2><span>Fokkerij</span></h2></div>
<div data-testid="richTextElement"><h4><span>Wij geloven in een koe die op onze grond optimaal presteert. We cre&euml;ren een koe die van gras melk kan maken, met eigen stieren.</span></h4></div>
<ul><li><p>Licht van gewicht</p></li><li><p>Goed karakter</p></li></ul>
<div data-testid="richTextElement"><h2>Bekijk</h2></div>
<div data-testid="richTextElement"><p>${extra}</p></div>
</main>
<footer id="SITE_FOOTER"><p>Schoterweg 26, KvK 87761084</p></footer></body></html>`;
