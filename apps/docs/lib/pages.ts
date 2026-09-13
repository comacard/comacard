import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The table of contents, and the one place a document's source is named.
 *
 * **Every page reads a file that already exists somewhere else in this repository.** Nothing is
 * copied in. A documentation site that keeps its own copy of `TRUST.md` is a site that will one day
 * disagree with `TRUST.md`, and the reader has no way to tell which of the two is current. This
 * repository has paid for that shape of mistake often enough to have written it down.
 *
 * The cost of the rule is that these documents were written for a repository rather than for a
 * website: they open with a heading, they link to each other by relative path, and they assume the
 * reader can see the tree around them. `rewriteLinks` handles the paths. The rest is a deliberate
 * trade, because the alternative is prose that drifts.
 */

export type Page = {
  /** URL segment. The empty string is the index. */
  slug: string;
  /** What the sidebar calls it. Not always the document's own first heading. */
  title: string;
  /** One line under the title, and the page's meta description. */
  blurb: string;
  /** Path from the repository root. The document is read from here and nowhere else. */
  source: string;
};

/*
  `CLAUDE.md` is deliberately not here, and it is the one document somebody will keep trying to add.

  It carries the best explanation in this repository of the two carriers and the three numbering
  systems, which is exactly why it is tempting. It also carries instructions written for whoever is
  working on the code: who owns which directory, by GitHub handle, and how the team wants prose
  written. That is an internal document that happens to contain good architecture writing, not a
  public one. Publishing it would put working arrangements on a website for the sake of two good
  sections.

  If those sections are wanted here, the answer is a document written for a reader, not a link to
  this one.
*/
export const PAGES: Page[] = [
  {
    slug: "",
    title: "Overview",
    blurb: "What Comacard is, what is deployed, and where to try it",
    source: "README.md",
  },
  {
    slug: "screens",
    title: "What it looks like",
    blurb: "The product as it actually renders, captured from the deployed app",
    /*
      The one page whose source is not a document that already existed, and the reason is the
      medium rather than an exception to the rule. It is mostly images, and images have to live
      under `apps/docs/public` because Vercel uploads this directory alone. Prose that points at
      them belongs beside them.
    */
    source: "apps/docs/content/screens.md",
  },
  {
    slug: "contracts",
    title: "Contracts",
    blurb: "The Foundry project: what each contract owns and what it refuses",
    source: "contracts/README.md",
  },
  {
    slug: "trust",
    title: "What you are trusting",
    blurb: "Where this product is trustless, where it is not, and who holds each key",
    source: "contracts/TRUST.md",
  },
  {
    slug: "proof",
    title: "Proof it works",
    blurb: "A full cycle against the deployed contracts, every transaction hash",
    source: "docs/e2e-testnet-run.md",
  },
  {
    slug: "demo",
    title: "Demo runbook",
    blurb: "The sequence, the commands, and the waits you cannot shorten",
    source: "DEMO.md",
  },
  {
    slug: "indexer",
    title: "Indexer",
    blurb: "Both chains behind one GraphQL endpoint, and how its URL moves",
    source: "apps/indexer/README.md",
  },
  {
    slug: "worker",
    title: "Worker",
    blurb: "The daemon that proves locks and relays messages",
    source: "apps/worker/README.md",
  },
];

/**
 * The repository root, found by walking up until the documents are there.
 *
 * Not `import.meta.dirname`, which is undefined once Turbopack has bundled this and takes every
 * page down with `The "path" argument must be of type string`. Not a fixed `../../..` from the
 * working directory either: that is `apps/docs` under `next dev` and can differ under a build.
 *
 * Walking up and checking for two files that must both exist is the version with no assumption in
 * it. It throws with a readable message rather than letting `readFileSync` fail eight times with
 * eight different paths.
 */
const ROOT = findRoot();

function findRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "README.md")) && existsSync(join(dir, "contracts", "TRUST.md"))) {
      return dir;
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`docs: no repository root above ${process.cwd()}`);
}

export function pageBySlug(slug: string): Page | undefined {
  return PAGES.find((p) => p.slug === slug);
}

/**
 * Read a page's markdown, with the links rewritten for a website.
 *
 * The sources link to each other the way files do, `[TRUST.md](contracts/TRUST.md)`, which resolves
 * to nothing here. Any link whose target is a document in `PAGES` becomes that page's route; every
 * other repository-relative link becomes a GitHub link, so a reference to a file this site does not
 * publish still goes somewhere real instead of 404ing.
 */
export function readPage(page: Page): string {
  const raw = readFileSync(join(ROOT, page.source), "utf8");
  return rewriteLinks(raw, page.source);
}

const REPO = "https://github.com/comacard/comacard/blob/main";

export function rewriteLinks(markdown: string, from: string): string {
  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  return markdown.replace(/\]\(([^)\s]+)\)/g, (whole, target: string) => {
    /*
      Already pointing where they should: external links, anchors, and anything site-absolute.

      The leading slash matters and was missing at first. The pattern here matches image syntax as
      well as links, so `![a screen](/screens/home.jpg)` was being read as a repository path and
      rewritten into a GitHub blob URL, which renders as a broken image rather than an error. A
      target that starts with `/` is a route on this site and needs no help.
    */
    if (/^(https?:|mailto:|#|\/)/.test(target)) return whole;
    const resolved = normalise(dir ? `${dir}/${target}` : target);
    const hit = PAGES.find((p) => p.source === resolved);
    if (hit) return `](/${hit.slug})`;
    return `](${REPO}/${resolved})`;
  });
}

/** Collapse `a/b/../c` to `a/c`, which is what a relative link between two documents produces. */
function normalise(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}
