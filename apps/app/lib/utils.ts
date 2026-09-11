// Vendored from beUI (https://beui.dev/components/blocks/card-folder), MIT.
// Kept close to upstream so it can be re-synced; Comacard styling lives in
// components/card/, not here.
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}