import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useInViewAnimation } from "../hooks/useInViewAnimation";

const PEXELS = "https://images.pexels.com/photos";
const CROP = "?auto=compress&cs=tinysrgb&w=200&h=200&dpr=2";

/**
 * Placeholder testimonials. The names are the standard stand-ins (Doe, Roe,
 * Major) and the companies are the standard fictional ones, so nothing here
 * reads as a real person vouching for the product. Swap in real quotes and real
 * names together, or not at all.
 */
const QUOTES: {
  quote: string;
  author: string;
  role: string;
  company: string;
  avatar: string;
}[] = [
  {
    quote:
      "I had been holding this coin for three years. Last week I paid for groceries with it and I still own every single one.",
    author: "Alice Sugar",
    role: "Product Designer",
    company: "Acme",
    avatar: `${PEXELS}/774909/pexels-photo-774909.jpeg${CROP}`,
  },
  {
    quote:
      "The limit started small and it annoyed me. Three months later it is bigger than what I put in. I get it now.",
    author: "John Doe",
    role: "Engineer",
    company: "Northwind",
    avatar: `${PEXELS}/220453/pexels-photo-220453.jpeg${CROP}`,
  },
  {
    quote:
      "One check when I signed up. Nobody has asked me for a document since, and I have used it every week.",
    author: "Jane Roe",
    role: "Operations",
    company: "Contoso",
    avatar: `${PEXELS}/415829/pexels-photo-415829.jpeg${CROP}`,
  },
  {
    quote:
      "Thirty days, no interest, and the amount I owe is the amount I owed. That is the whole deal and I like that.",
    author: "Richard Roe",
    role: "Analyst",
    company: "Initech",
    avatar: `${PEXELS}/1681010/pexels-photo-1681010.jpeg${CROP}`,
  },
  {
    quote:
      "The cashback comes back as money I can spend. That is more than I can say for the points on my old card.",
    author: "Mary Major",
    role: "Founder",
    company: "Globex",
    avatar: `${PEXELS}/733872/pexels-photo-733872.jpeg${CROP}`,
  },
];

/** Tripled so the track can wrap without a visible jump. Keys are assigned
 *  here rather than from the render index, which would not be stable. */
const CAROUSEL = [0, 1, 2].flatMap((copy) =>
  QUOTES.map((entry, position) => ({ ...entry, key: `${copy}-${position}` })),
);

const GAP = 24;
const DESKTOP_CARD = 427.5;

export function QuoteCarousel({ id }: { id?: string }) {
  const { ref, isInView } = useInViewAnimation<HTMLElement>();
  // Position is an index, not pixels. It starts on the middle copy so stepping
  // either way always has a real card to move onto.
  const [index, setIndex] = useState(QUOTES.length);
  const [isPaused, setIsPaused] = useState(false);
  // Turned off for one frame while the track jumps between identical copies.
  const [animate, setAnimate] = useState(true);
  // Measured after mount: this page is prerendered, so `window` is not there yet.
  const [cardWidth, setCardWidth] = useState(DESKTOP_CARD);

  useEffect(() => {
    const measure = () =>
      setCardWidth(window.innerWidth < 768 ? window.innerWidth - 48 : DESKTOP_CARD);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const cardWithGap = cardWidth + GAP;
  const step = useCallback((direction: 1 | -1) => setIndex((current) => current + direction), []);

  /**
   * Runs when the slide has finished moving, never mid-flight. If the track has
   * walked off the middle copy, put it back on the equivalent card with the
   * transition off. The copies are identical, so nothing moves on screen.
   */
  const normalise = useCallback(() => {
    setIndex((current) => {
      const wrapped =
        QUOTES.length +
        ((((current - QUOTES.length) % QUOTES.length) + QUOTES.length) % QUOTES.length);
      if (wrapped !== current) setAnimate(false);
      return wrapped;
    });
  }, []);

  // Re-arm the transition a frame after a snap. Depending on `animate` alone is
  // what matters: keying this on the index would let the effect cancel its own
  // frame the moment the index changed, and the transition would never return.
  useEffect(() => {
    if (animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setInterval(() => step(1), 3000);
    return () => window.clearInterval(timer);
  }, [isPaused, step]);

  const reveal = (delay: string) => ({
    className: isInView ? "animate-fade-in-up" : "opacity-0",
    style: { animationDelay: isInView ? delay : "0s" },
  });

  const heading = reveal("0.1s");
  const badge = reveal("0.2s");
  const track = reveal("0.3s");
  const controls = reveal("0.4s");

  return (
    <section ref={ref} id={id} className="w-full scroll-mt-24 bg-white py-20">
      <div className="mx-auto max-w-[1260px] px-6">
        <div className="w-full">
          <div className="mb-14 flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-0">
            <h2
              className={`flex-1 text-[32px] font-normal leading-[1.1] tracking-tight text-[#0D212C] md:text-[40px] lg:text-[44px] ${heading.className}`}
              style={heading.style}
            >
              What <span style={{ fontFamily: "'PP Mondwest', serif" }}>cardholders</span> say
            </h2>

            <div
              className={`flex flex-col items-start gap-2 md:items-end ${badge.className}`}
              style={badge.style}
            >
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((star) => (
                  <Star key={star} className="h-5 w-5 fill-black text-black" />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-semibold text-[#0D212C]">Early access</span>
                <span className="text-base text-[#273C46]">5/5</span>
              </div>
            </div>
          </div>

          <section
            aria-label="What cardholders say"
            className={`relative -mx-6 overflow-hidden py-6 md:mx-0 ${track.className}`}
            style={track.style}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
          >
            <div
              className="flex gap-6 pl-6 md:pl-0"
              onTransitionEnd={normalise}
              style={{
                transform: `translateX(-${index * cardWithGap}px)`,
                transition: animate ? "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
              }}
            >
              {CAROUSEL.map((entry, position) => {
                // Cards leaving on the left fade and shrink rather than clipping.
                const relative = (position - index) * cardWithGap;
                let opacity = 1;
                let scale = 1;
                if (relative < -cardWidth / 2) {
                  const exit = Math.min(1, Math.abs(relative) / cardWidth);
                  opacity = Math.max(0, 1 - exit * 2);
                  scale = Math.max(0.85, 1 - exit * 0.15);
                }

                return (
                  <article
                    key={entry.key}
                    className="flex flex-shrink-0 flex-col justify-between rounded-[32px] bg-white px-6 py-8 shadow-[0_4px_16px_rgba(0,0,0,0.08)] md:rounded-[40px] md:pb-[2.63rem] md:pl-10 md:pr-24 md:pt-[2.36rem]"
                    style={{
                      width: `${cardWidth}px`,
                      opacity,
                      transform: `scale(${scale})`,
                      transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      className="mb-6 h-8 w-8 text-[#0D212C]"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                    </svg>

                    <p className="mb-8 text-base leading-relaxed text-[#0D212C]">{entry.quote}</p>

                    <div className="flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.avatar}
                        alt=""
                        aria-hidden
                        className="h-12 w-12 rounded-full object-cover"
                      />
                      <div>
                        <p className="text-sm font-semibold text-[#0D212C]">{entry.author}</p>
                        <p className="flex items-center gap-1 text-sm text-[#273C46]">
                          <span className="text-xs">↳</span>
                          <span>
                            {entry.role}, {entry.company}
                          </span>
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <div className={`mt-8 flex gap-4 ${controls.className}`} style={controls.style}>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => step(-1)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[#0D212C]/20 transition-colors hover:bg-[#0D212C]/5"
            >
              <ChevronLeft className="h-5 w-5 text-[#0D212C]" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => step(1)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[#0D212C]/20 transition-colors hover:bg-[#0D212C]/5"
            >
              <ChevronRight className="h-5 w-5 text-[#0D212C]" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
