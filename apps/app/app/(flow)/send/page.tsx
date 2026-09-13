import { SendPicker } from "../../../components/send/SendPicker";

/**
 * Where the credit goes, asked before how much. `/send/me` is the draw on its own; `/send/to` is the
 * draw plus a transfer.
 */
export default function SendPage() {
  return <SendPicker />;
}
