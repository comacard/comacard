"use client";
import Image from "next/image";
import { DigitSwap } from "../motion/digit-swap";

/**
 * The face of the Comacard, drawn for the beUI card-folder sleeve.
 *
 * The concentric contours start off-card on purpose, so only their curves are in frame; that is
 * the beUI reference's trick and it is what stops a flat black rectangle from reading as a
 * placeholder. Everything else follows a real card's furniture: chip top-left, number across the
 * middle, holder and expiry along the bottom, scheme mark bottom-right.
 */
// Fewer and fainter than the beUI reference on purpose. Its card is 384px wide; this one renders
// around 306px on a phone, and at that scale 18 contours 24 units apart collapse into a haze that
// turns the near-black gradient a flat grey. Twelve at 34 units apart keep the curves readable.
const CONTOUR_RADII = Array.from({ length: 12 }, (_, index) => 78 + index * 34);

const MASKED_NUMBER = "•••• •••• •••• ••••";

/** Groups digits into the 4-4-4-4 a card is read in. A partial or empty number masks the rest,
 *  which is what an unissued card renders as: no invented digits, ever. */
function formatNumber(raw: string | undefined, reveal: boolean): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 16) return MASKED_NUMBER;
  const groups = digits.match(/.{1,4}/g) ?? [];
  return reveal ? groups.join(" ") : `•••• •••• •••• ${groups[3]}`;
}

export function CardArtwork({
  holder,
  number,
  expiry,
  detailsVisible,
}: {
  holder: string;
  number?: string;
  expiry?: string;
  detailsVisible: boolean;
}) {
  const value = formatNumber(number, detailsVisible);
  const issued = value !== MASKED_NUMBER;

  return (
    <span className="relative block h-full w-full overflow-hidden bg-[linear-gradient(135deg,#2b2d2b_0%,#17181a_46%,#0b0c0d_100%)] text-white">
      <svg aria-hidden="true" viewBox="0 0 640 404" className="absolute inset-0 h-full w-full">
        <title>Card texture</title>
        {CONTOUR_RADII.map((radius, index) => (
          <circle
            key={radius}
            cx="-20"
            cy="-28"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15 - index * 0.008}
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgb(255_255_255/0.12),transparent_34%)]" />

      {/* Chip. Same contact pattern as the beUI reference, in Comacard's warmer metal. */}
      <span className="absolute left-[7%] top-[13%] h-[19%] w-[12.5%] overflow-hidden rounded-[18%] border border-black/30 bg-[linear-gradient(135deg,#f0ece2_0%,#b6b2a8_45%,#e2ded2_100%)]">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/30" />
        <span className="absolute inset-x-0 top-1/3 h-px bg-black/30" />
        <span className="absolute inset-x-0 bottom-1/3 h-px bg-black/30" />
        <span className="absolute left-0 top-1/2 h-[34%] w-[28%] -translate-y-1/2 rounded-r-[35%] border border-l-0 border-black/30" />
        <span className="absolute right-0 top-1/2 h-[34%] w-[28%] -translate-y-1/2 rounded-l-[35%] border border-r-0 border-black/30" />
      </span>

      <span className="absolute right-[6%] top-[11%] flex items-center gap-1.5">
        <Image
          src="/brand/comacard-logo.png"
          alt=""
          width={1024}
          height={1024}
          className="h-[22px] w-[22px] rounded-[7px]"
        />
        <span className="text-[11px] font-semibold tracking-[-0.02em] text-white/85">Comacard</span>
      </span>

      <span className="absolute left-[7%] top-[37%] block">
        <DigitSwap
          value={value}
          animationKey={detailsVisible ? "revealed" : "masked"}
          direction={detailsVisible ? "up" : "down"}
          suffixLength={4}
          glyphClassName={issued && detailsVisible ? "text-white/90" : "text-white/60"}
          suffixClassName="text-white/90"
          className="font-mono text-[13px] tracking-[0.12em]"
        />
      </span>

      <span className="absolute bottom-[7%] left-[7%] flex items-end gap-5">
        <span className="flex flex-col gap-1">
          <span className="text-[7px] font-medium uppercase tracking-[0.18em] text-white/40">
            Cardholder
          </span>
          <span className="max-w-[150px] truncate text-[11px] font-medium uppercase tracking-[0.1em] text-white/90">
            {holder}
          </span>
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-[7px] font-medium uppercase tracking-[0.18em] text-white/40">
            Expires
          </span>
          <span className="text-[11px] font-medium tabular-nums text-white/90">
            {expiry && expiry.trim() ? expiry : "••/••"}
          </span>
        </span>
      </span>

      <span className="absolute bottom-[7%] right-[6%] text-[19px] font-semibold italic tracking-[-0.02em] text-white/95">
        VISA
      </span>
    </span>
  );
}
