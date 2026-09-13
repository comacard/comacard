"use client";
import { useEffect } from "react";

/**
 * Turns the ` ```mermaid ` fences in a rendered document into diagrams.
 *
 * `marked` runs at build time and leaves those fences as `<pre><code class="language-mermaid">`,
 * which is right for every reader that is not a browser. Here, once the page is on screen, the
 * library is fetched from a CDN by a module script and each fence is replaced by the SVG it
 * describes. A script tag rather than a dynamic import, because the bundler would otherwise try
 * to resolve the URL at build time. Only pages that carry a fence pay for the download, and a
 * diagram that fails to render stays as its readable source rather than a blank space.
 */
const SCRIPT = `
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
mermaid.initialize({ startOnLoad: false, theme: "neutral", fontFamily: "inherit" });
const fences = Array.from(document.querySelectorAll("pre > code.language-mermaid"));
await Promise.all(fences.map(async (code, i) => {
  const pre = code.parentElement;
  if (!pre) return;
  const source = code.textContent ?? "";
  try {
    const { svg } = await mermaid.render("doc-diagram-" + i, source);
    const figure = document.createElement("figure");
    figure.className = "diagram";
    figure.setAttribute("data-source", source);
    figure.innerHTML = svg;
    pre.replaceWith(figure);
  } catch {}
}));
`;

export function Mermaid() {
  useEffect(() => {
    if (!document.querySelector("pre > code.language-mermaid")) return;
    const script = document.createElement("script");
    script.type = "module";
    script.textContent = SCRIPT;
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);
  return null;
}
