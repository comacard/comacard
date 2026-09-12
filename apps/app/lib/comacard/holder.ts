/**
 * Fitting a real name into the space a card gives it.
 *
 * The name is OCR'd off an identity document, so it arrives at whatever length the document says
 * and cannot be shortened by asking the holder to type something else. "Axel Urwawuska Atarubby"
 * is 23 characters and the folder's name slot holds about 18, which is how the card ended up
 * reading "Axel Urwawuska At…" — a truncation that cuts mid-word and loses the surname, the one
 * part of a name that identifies anybody.
 *
 * So this abbreviates the way an embossing machine does rather than the way CSS does: the given
 * name and the family name are kept whole and everything between them collapses to initials. Both
 * ends of the name survive, which is what makes the result still recognisable as the holder.
 *
 * CSS truncation stays as the last resort for a single name longer than the slot, because there is
 * nothing left to abbreviate at that point.
 */

/** Roughly what the folder's name slot holds before the number starts losing room. */
export const HOLDER_SLOT_CHARS = 18;

export function compactHolder(name: string, maxChars: number = HOLDER_SLOT_CHARS): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  const full = parts.join(" ");
  if (full.length <= maxChars) return full;
  // One word and no room: nothing to abbreviate, so let the ellipsis handle it.
  if (parts.length === 1) return full;

  const first = parts[0] as string;
  const last = parts[parts.length - 1] as string;

  // Middle names to initials first. "Axel Urwawuska Atarubby" → "Axel U. Atarubby".
  const middles = parts.slice(1, -1).map((part) => `${(part[0] as string).toUpperCase()}.`);
  const withInitials = [first, ...middles, last].join(" ");
  if (withInitials.length <= maxChars) return withInitials;

  // Still over: the family name is the half worth keeping whole.
  const firstInitial = `${(first[0] as string).toUpperCase()}. ${last}`;
  if (firstInitial.length <= maxChars) return firstInitial;

  return last;
}
