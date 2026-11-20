// Egyptian mobile number normalization: always "01XXXXXXXXX" (11 digits).

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    if (a >= 0) return String(a);
    return String(EXTENDED_ARABIC_INDIC.indexOf(ch));
  });
}

/**
 * "+20 101 234 5678" -> "01012345678". Accepts +20, 0020, 20 prefixes, spaces,
 * dashes, dots, parentheses and Arabic-Indic digits. Returns null if invalid.
 */
export function normalizeEgyptPhone(input: string): string | null {
  if (typeof input !== "string") return null;
  let s = toAsciiDigits(input.trim()).replace(/[\s\-.()‎‏]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith("0020")) s = "0" + s.slice(4);
  else if (s.startsWith("20") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("1") && s.length === 10) s = "0" + s;
  return /^01\d{9}$/.test(s) ? s : null;
}
