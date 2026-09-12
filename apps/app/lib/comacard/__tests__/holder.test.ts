import { compactHolder } from "../holder";

test("keeps a name that already fits", () => {
  expect(compactHolder("Axel Atarubby")).toBe("Axel Atarubby");
});

test("collapses middle names to initials rather than cutting the surname off", () => {
  // The real case: CSS truncation gave "Axel Urwawuska At…", losing the one part of a name that
  // identifies anybody.
  expect(compactHolder("Axel Urwawuska Atarubby")).toBe("Axel U. Atarubby");
});

test("falls back to an initial for the given name when initials are not enough", () => {
  expect(compactHolder("Bartholomew Fitzwilliam Cholmondeley")).toBe("B. Cholmondeley");
});

test("keeps the family name when nothing else fits", () => {
  expect(compactHolder("Maximilian Vandersteenwinckelberg")).toBe("Vandersteenwinckelberg");
});

test("leaves a single long name to the ellipsis, since there is nothing to abbreviate", () => {
  expect(compactHolder("Vandersteenwinckelberg")).toBe("Vandersteenwinckelberg");
});

test("survives the blank name an unissued card carries", () => {
  expect(compactHolder("")).toBe("");
  expect(compactHolder("   ")).toBe("");
});
