import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PAGES } from "../lib/pages";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Comacard docs", template: "%s · Comacard docs" },
  description: "A card whose limit is earned rather than deposited.",
};

/**
 * One column of navigation and one of prose.
 *
 * The sidebar is the whole of `PAGES` because there are eight documents. A search box and a
 * collapsing tree are the right answer at eighty and noise at eight, so neither is here.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-10 px-5 py-8 lg:flex-row lg:gap-12 lg:px-8 lg:py-14">
          <aside className="shrink-0 lg:w-[220px]">
            <div className="lg:sticky lg:top-14">
              <Link
                href="/"
                className="mb-6 flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.02em] text-ink no-underline"
              >
                <span
                  aria-hidden
                  className="grid h-[26px] w-[26px] place-items-center rounded-[8px] bg-ink text-[8px] font-black leading-[1.05] text-white"
                >
                  CO
                  <br />
                  MA
                </span>
                Comacard
              </Link>

              <nav aria-label="Documentation">
                <ul className="m-0 flex list-none flex-col gap-px p-0">
                  {PAGES.map((page) => (
                    <li key={page.slug}>
                      <Link
                        href={`/${page.slug}`}
                        className="-mx-2.5 block rounded-lg px-2.5 py-[7px] text-[13.5px] text-muted no-underline transition-colors hover:bg-[rgba(17,19,22,.05)] hover:text-ink"
                      >
                        {page.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="mt-7 flex flex-col gap-px border-t border-line pt-5">
                {[
                  ["Open the app", "https://app.comacard.xyz"],
                  ["comacard.xyz", "https://comacard.xyz"],
                  ["GitHub", "https://github.com/comacard/comacard"],
                ].map(([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="-mx-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] text-muted no-underline transition-colors hover:bg-[rgba(17,19,22,.05)] hover:text-ink"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
