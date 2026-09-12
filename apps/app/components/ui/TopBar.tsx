"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import { useWallet } from "../../hooks/useWallet";
import { Identicon } from "../account/Identicon";

export function TopBar({
  onAvatarClick,
  account,
}: {
  onAvatarClick?: () => void;
  account?: ReactNode;
}) {
  const { address } = useWallet();
  return (
    <header className="relative z-50 flex items-center justify-between gap-4 h-[46px] mb-[18px]">
      <span className="inline-flex items-center gap-[9px]">
        <Image
          src="/brand/comacard-logo.png"
          alt=""
          width={1024}
          height={1024}
          className="w-[28px] h-[28px] rounded-[9px]"
          priority
        />
        <span className="text-[17px] font-bold tracking-[-0.02em]">Comacard</span>
      </span>
      {account ?? (
        <button
          type="button"
          aria-label="Account"
          onClick={onAvatarClick}
          className="grid place-items-center w-[42px] h-[42px] rounded-full overflow-hidden p-0 border border-white bg-card cursor-pointer shadow-[0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.22)]"
        >
          <Identicon address={address ?? ""} size={42} />
        </button>
      )}
    </header>
  );
}
