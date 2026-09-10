import { motion } from "framer-motion";
import { BlurIn } from "./BlurIn";
import { CurvedDivider } from "./CurvedDivider";

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P";

/**
 * The middle card is deliberately shorter. With `lg:items-end` on the row, that
 * is what staggers the tops on desktop while every card still ends on the same
 * baseline.
 */
const CARDS: {
  minHeight: string;
  video: string;
  overlay: string;
  stat: string;
  description: string;
  descriptionWidth: string;
}[] = [
  {
    minHeight: "min-h-[450px]",
    video: `${CDN}/hf_20260405_143605_bc7bd6c0-9c68-49ff-a9d3-073a10759fa4.mp4`,
    overlay: "bg-[rgba(206,223,235,0.25)]",
    stat: "1.25x",
    description: "What you can spend against what you put in, once the card knows you",
    descriptionWidth: "max-w-[377px]",
  },
  {
    minHeight: "min-h-[350px]",
    video: `${CDN}/hf_20260405_145119_f4ec4d9f-3ecd-4116-baa3-26e8cf2df976.mp4`,
    overlay: "bg-[rgba(247,236,233,0.6)]",
    stat: "30 days",
    description: "To pay it back. No interest, no fee you find out about later",
    descriptionWidth: "max-w-[351px]",
  },
  {
    minHeight: "min-h-[450px]",
    video: `${CDN}/hf_20260405_140728_ae719193-f10b-4105-82fc-c989610b3aa6.mp4`,
    overlay: "bg-[rgba(218,218,218,0.2)]",
    stat: "0",
    description: "Times you have to sell your crypto to pay for something",
    descriptionWidth: "max-w-[351px]",
  },
];

const row = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.2 } },
};

const card = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

export function InsightsSection({ id }: { id?: string }) {
  return (
    <div id={id} className="scroll-mt-24 rounded-t-[32px] bg-white md:rounded-t-[56px]">
      <div className="flex flex-col gap-[90px] px-6 py-20 md:px-12 lg:px-[60px]">
        <div className="flex max-w-[517px] flex-col gap-10">
          <BlurIn>
            <h2 className="font-helvetica-neue text-4xl font-medium leading-[1] tracking-[-0.03em] text-[#00041F] md:text-5xl lg:text-6xl lg:leading-[60px]">
              The short version
            </h2>
          </BlurIn>
          <p className="font-helvetica-neue max-w-[361px] text-base text-[#49484F] md:text-lg lg:text-xl">
            Three numbers worth knowing before you sign up
          </p>
        </div>

        <motion.div
          className="flex flex-col items-stretch gap-5 lg:flex-row lg:items-end"
          variants={row}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {CARDS.map((entry) => (
            <motion.div
              key={entry.stat}
              variants={card}
              className={`relative flex flex-1 flex-col justify-end overflow-hidden rounded-[40px] p-10 ${entry.minHeight}`}
            >
              {/* muted is set through the ref too: React does not always reflect
                the prop as an attribute, and an unmuted video cannot autoplay. */}
              <video
                ref={(el) => {
                  if (el) el.muted = true;
                }}
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              >
                <source src={entry.video} type="video/mp4" />
              </video>
              <div className={`absolute inset-0 ${entry.overlay}`} />

              <div className="relative z-10 flex max-w-[388px] flex-col gap-5">
                <span className="font-helvetica-neue text-5xl font-medium leading-[1] text-[#00041F] md:text-[60px] md:leading-[60px]">
                  {entry.stat}
                </span>
                <p
                  className={`font-helvetica-neue text-lg text-[#49484F] opacity-80 md:text-[22px] ${entry.descriptionWidth}`}
                >
                  {entry.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <CurvedDivider fill="#F4F0ED" />
    </div>
  );
}
