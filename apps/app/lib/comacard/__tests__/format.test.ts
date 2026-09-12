import { groupAccountNumber } from "../format";

test("groups the twelve-digit account number into fours", () => {
  expect(groupAccountNumber("483920174655")).toBe("4839 2017 4655");
});

test("regroups a value that already carries separators rather than doubling them", () => {
  expect(groupAccountNumber("4839 2017 4655")).toBe("4839 2017 4655");
});

test("leaves a short remainder in its own group", () => {
  expect(groupAccountNumber("48392017465")).toBe("4839 2017 465");
});
