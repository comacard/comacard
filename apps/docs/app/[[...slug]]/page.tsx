import { marked } from "marked";
import { notFound } from "next/navigation";
import { PAGES, pageBySlug, readPage } from "../../lib/pages";
import { Mermaid } from "../Mermaid";

/** Every page is known at build time, so all of them are static. */
export function generateStaticParams() {
  return PAGES.map((p) => ({ slug: p.slug === "" ? [] : [p.slug] }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const page = pageBySlug((await params).slug?.[0] ?? "");
  if (!page) return {};
  return { title: page.title, description: page.blurb };
}

/**
 * One document, read from the file it already lives in.
 *
 * `marked` runs here rather than in the browser: the markdown is known at build time and shipping a
 * parser to every reader to re-derive HTML that cannot change is work nobody needs to do twice.
 *
 * `dangerouslySetInnerHTML` is the honest name for what this does, and the input is worth naming
 * too. It is not user content. It is markdown from this repository, rendered at build time from
 * files that go through review, so the trust boundary is the same one that protects the code.
 */
export default async function DocPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const slug = (await params).slug?.[0] ?? "";
  const page = pageBySlug(slug);
  if (!page) notFound();

  const html = await marked.parse(readPage(page), { gfm: true, async: true });

  return (
    <article>
      <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-faint">
        {page.title}
      </p>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: build-time markdown from this repository, not user input */}
      <div className="doc" dangerouslySetInnerHTML={{ __html: html }} />
      <Mermaid />

      <p className="mt-14 border-t border-line pt-5 text-[12.5px] text-faint">
        This page is{" "}
        <a
          href={`https://github.com/comacard/comacard/blob/main/${page.source}`}
          target="_blank"
          rel="noreferrer"
          className="text-muted underline decoration-faint underline-offset-[3px] hover:text-ink"
        >
          {page.source}
        </a>{" "}
        in the repository. It is read from there, not copied, so the two cannot disagree.
      </p>
    </article>
  );
}
