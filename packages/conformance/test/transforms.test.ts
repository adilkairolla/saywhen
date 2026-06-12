import { describe, expect, test } from "vitest";
import { dropLastCharOfLongestWord, MUST_PASS_TRANSFORMS, swapInLongestWord } from "../src/transforms.js";

describe("typo transforms are deterministic and target the longest alphabetic word", () => {
  test("swapInLongestWord", () => {
    expect(swapInLongestWord("next friday + 2 weeks")).toBe("next firday + 2 weeks");
    expect(swapInLongestWord("this weekend")).toBe("this wekeend");
    expect(swapInLongestWord("next week")).toBeNull(); // longest word < 5 chars → skip
  });
  test("dropLastCharOfLongestWord", () => {
    expect(dropLastCharOfLongestWord("the 21st of march")).toBe("the 21st of marc");
    expect(dropLastCharOfLongestWord("in 2 weeks")).toBe("in 2 week");
    expect(dropLastCharOfLongestWord("next week")).toBeNull();
  });
  test("must-pass transforms preserve token text", () => {
    const t = Object.fromEntries(MUST_PASS_TRANSFORMS);
    expect(t["uppercase"]!("next friday")).toBe("NEXT FRIDAY");
    expect(t["extra-spaces"]!("next friday")).toBe("next  friday");
    expect(t["padded"]!("next friday")).toBe("  next friday ");
  });
});
