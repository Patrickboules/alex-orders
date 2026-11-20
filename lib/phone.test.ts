import { describe, expect, it } from "vitest";
import { normalizeEgyptPhone } from "./phone";

describe("normalizeEgyptPhone", () => {
  it("accepts local and international forms", () => {
    expect(normalizeEgyptPhone("01012345678")).toBe("01012345678");
    expect(normalizeEgyptPhone("+20 101 234 5678")).toBe("01012345678");
    expect(normalizeEgyptPhone("+201012345678")).toBe("01012345678");
    expect(normalizeEgyptPhone("00201012345678")).toBe("01012345678");
    expect(normalizeEgyptPhone("201012345678")).toBe("01012345678");
    expect(normalizeEgyptPhone("010-1234-5678")).toBe("01012345678");
    expect(normalizeEgyptPhone(" (010) 1234 5678 ")).toBe("01012345678");
    expect(normalizeEgyptPhone("1012345678")).toBe("01012345678");
    expect(normalizeEgyptPhone("٠١٠١٢٣٤٥٦٧٨")).toBe("01012345678");
  });
  it("rejects invalid numbers", () => {
    expect(normalizeEgyptPhone("")).toBeNull();
    expect(normalizeEgyptPhone("0101234567")).toBeNull(); // too short
    expect(normalizeEgyptPhone("010123456789")).toBeNull(); // too long
    expect(normalizeEgyptPhone("02012345678")).toBeNull(); // not mobile
    expect(normalizeEgyptPhone("+44 7911 123456")).toBeNull();
    expect(normalizeEgyptPhone("01O12345678")).toBeNull();
    expect(normalizeEgyptPhone("abc")).toBeNull();
  });
});
