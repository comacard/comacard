"use client";
import { useState } from "react";
import { useCardSecrets } from "../../hooks/useCardSecrets";
import type { ComacardAccount } from "../../lib/comacard/api";
import { compactHolder } from "../../lib/comacard/holder";
import { CardFolder } from "../motion/card-folder";
import { CardArtwork } from "./CardArtwork";

/**
 * The card in its folder, with nothing around it. Home and /card both render this, so the card
 * cannot drift into two different cards.
 *
 * The folder is deliberately NOT `disabled` while the card is unissued: that prop drops the whole
 * component to `opacity-50`, which turns the black card a washed grey and reads as a rendering bug
 * rather than as an empty wallet. The masked digits already say there is nothing to reveal.
 *
 * Nothing here is ever fabricated. Until `card.number` arrives from the backend the folder shows
 * its masked state, because a card is a claim about a real identity and a plausible-looking
 * placeholder is the one thing this must not show.
 *
 * **The reveal needs a second request.** `GET /account/:wallet` carries the number already masked
 * and no CVV at all, so the eye toggle on its own has nothing to unmask: it reveals the same dots
 * it was already showing. `useCardSecrets` fetches the full card from `/account/:wallet/card`, and
 * only once the holder asks, which keeps the PAN out of memory until then. Until it lands the
 * folder stays masked rather than flashing a half-filled number.
 */
export function CardFolderPanel({
  account,
  className = "",
}: {
  account: ComacardAccount | null;
  className?: string;
}) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  // Blank until a card exists. "Comacard holder" was a placeholder standing where a real name goes,
  // and a placeholder on a card reads as a card that has been issued to nobody. The folder's own
  // masked digits already say the card is not real yet; a second stand-in only adds noise.
  const issued = Boolean(account?.card.number);
  const fullHolder = account?.card.holder ?? "";
  // Abbreviated for the folder's name slot, which is narrower than a document name. The full name
  // still goes to the card face and to the accessible label, so nothing is hidden from a reader
  // who needs it.
  const holder = compactHolder(fullHolder);

  const { card: secrets } = useCardSecrets(detailsVisible && issued);
  // Masked until the real digits are in hand. `CardFolder` re-masks anything that is not 16 digits,
  // so handing it the masked string keeps the dots rather than rendering a half-filled number.
  const revealed = detailsVisible && secrets !== null;
  const pan = revealed ? secrets.number : (account?.card.number ?? "");
  const cvv = revealed ? secrets.cvv : "•••";
  const expiry = secrets?.expiry ?? account?.card.expiry ?? "••/••";

  return (
    <div className={`flex justify-center ${className}`}>
      <CardFolder
        title={holder}
        // The default label is built from `title`, which is empty before issuance.
        ariaLabel={
          issued
            ? `Your card, ${fullHolder}, ending in ${pan.replace(/\D/g, "").slice(-4)}`
            : "Your card, not issued yet"
        }
        cardNumber={pan}
        expiry={expiry}
        cvv={cvv}
        detailsVisible={revealed}
        onDetailsVisibleChange={setDetailsVisible}
        className="w-full max-w-[340px]"
        card={
          <CardArtwork holder={fullHolder} number={pan} expiry={expiry} detailsVisible={revealed} />
        }
      />
    </div>
  );
}
