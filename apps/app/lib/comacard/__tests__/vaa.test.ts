import { base64ToHex, CREDITCOIN_WORMHOLE_ID, emitterAddress, fetchSignedVaa } from "../vaa";

/**
 * The chain id and the emitter are the two things that make this silently return nothing.
 *
 * Both produce a 404 for a message that exists, which reads as "the guardians have not signed yet"
 * and never stops being that. So both are pinned here against figures read off the deployed
 * contracts rather than against the implementation.
 */

test("Creditcoin is Wormhole 59, which breaks the 10000-block pattern", () => {
  // I wrote 10009 first, extrapolating from Base at 10004. That is the same mistake that put Fuji
  // at 10006 and shipped. `HUB_CHAIN_ID()` on the live BSC Testnet ReleaseRelay
  // (0x740B0c07c3291FECF5e852F86652Ffbb575A2378) returns 59, read on 13 September 2026.
  expect(CREDITCOIN_WORMHOLE_ID).toBe(59);
  expect(CREDITCOIN_WORMHOLE_ID).not.toBe(10009);
});

test("an emitter is 32 bytes, lower case, no prefix", () => {
  // The deployed hub on Creditcoin. The relay compares this against `vaaData.emitterAddress`, so a
  // missing pad or a kept prefix is a message the relay refuses to recognise.
  expect(emitterAddress("0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f")).toBe(
    "0000000000000000000000009d77f5e1d5afe5258ca16f808dc5ba1e9f68437f",
  );
  expect(emitterAddress("0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f")).toHaveLength(64);
});

test("an address already without a prefix is not mangled", () => {
  const bare = "9d77f5e1d5afe5258ca16f808dc5ba1e9f68437f";
  expect(emitterAddress(bare)).toBe(`${"0".repeat(24)}${bare}`);
});

test("base64 becomes hex without Buffer, which the browser does not have", () => {
  // "AQID" is 0x01 0x02 0x03. The worker uses Buffer for this; here it would either fail or drag a
  // polyfill in to move a few hundred bytes.
  expect(base64ToHex("AQID")).toBe("0x010203");
});

test("a byte under 0x10 keeps its leading zero", () => {
  // Without the pad, 0x0a serialises as "a" and every byte after it shifts by one nibble, which
  // produces a VAA the relay rejects as malformed rather than one it rejects as unknown.
  expect(base64ToHex("AAoA")).toBe("0x000a00");
});

test("an unsigned message is null rather than an error", () => {
  // "Not signed yet" is the normal state for the first thirty seconds. A caller polling for that
  // should not have to write a try/catch to express patience.
  const fetchMock = vi.fn(async () => new Response("", { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);

  return expect(
    fetchSignedVaa(59, "0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f", 8n),
  ).resolves.toBeNull();
});

test("asks the right URL: chain, padded emitter, sequence", async () => {
  const fetchMock = vi.fn(async () => Response.json({ vaaBytes: "AQID" }));
  vi.stubGlobal("fetch", fetchMock);

  const vaa = await fetchSignedVaa(59, "0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f", 8n);

  expect(vaa).toBe("0x010203");
  const [url] = fetchMock.mock.calls[0] as unknown as [string];
  expect(url).toContain("/v1/signed_vaa/59/");
  expect(url).toContain("0000000000000000000000009d77f5e1d5afe5258ca16f808dc5ba1e9f68437f");
  expect(url).toMatch(/\/8$/);
});

test("a network failure is null, not a thrown error in a polling loop", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );

  await expect(
    fetchSignedVaa(59, "0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f", 8n),
  ).resolves.toBeNull();
});
