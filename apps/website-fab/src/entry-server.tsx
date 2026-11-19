import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { HelmetProvider, type HelmetServerState } from "react-helmet-async";
import { App } from "./App";
export { routes, paths } from "./routes";
export { site, hours, faq, prices } from "./content/site";
export const siteUrl = __SITE_URL__;
export const indexable = __INDEXABLE__;

export function render(url: string) {
  const helmetContext: { helmet?: HelmetServerState } = {};
  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </HelmetProvider>,
  );
  const h = helmetContext.helmet!;
  const tags = [h.title.toString(), h.meta.toString(), h.link.toString(), h.script.toString()].join("\n    ");
  return { html, head: { tags, htmlAttributes: h.htmlAttributes.toString() } };
}
