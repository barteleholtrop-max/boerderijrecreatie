import { StrictMode } from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "@fontsource/young-serif/latin-400.css";
import "@fontsource-variable/figtree/wght.css";
import "./styles/global.css";
import { App } from "./App";

const root = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
// Vite's development shell contains an HTML comment, not rendered React content.
if (root.children.length) hydrateRoot(root, tree);
else createRoot(root).render(tree);
