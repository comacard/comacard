import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-card border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.03),0_14px_34px_-22px_rgba(17,19,22,.16)]",
        className,
      )}
      {...props}
    />
  );
}
