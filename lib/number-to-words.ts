// Convert an integer-cent amount into the form a personal check uses on the
// "amount in words" line. e.g. 12550 -> "One hundred twenty-five and 50/100".
//
// Handles 0 .. 999_999_999_99 cents (just under one trillion dollars), which
// covers any plausible therapeutic-deposit value. Throws on negative input.

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

const SCALES = ["", "Thousand", "Million", "Billion"];

function chunkToWords(n: number): string {
  // 0..999
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} Hundred`);
  }
  if (rest === 0) {
    // nothing to append
  } else if (rest < 20) {
    parts.push(ONES[rest]!);
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    if (ones === 0) {
      parts.push(TENS[tens]!);
    } else {
      parts.push(`${TENS[tens]}-${ONES[ones]}`);
    }
  }
  return parts.join(" ");
}

export function dollarsToWords(dollars: number): string {
  if (dollars < 0) throw new Error("dollarsToWords: negative input");
  if (dollars === 0) return "Zero";

  const chunks: string[] = [];
  let remaining = dollars;
  let scaleIndex = 0;
  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const chunkWords = chunkToWords(chunk);
      const scale = SCALES[scaleIndex];
      chunks.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
    if (scaleIndex >= SCALES.length && remaining > 0) {
      throw new Error("dollarsToWords: amount too large");
    }
  }
  return chunks.join(" ");
}

// "One hundred twenty-five and 50/100"
export function centsToCheckWords(cents: number): string {
  if (cents < 0) throw new Error("centsToCheckWords: negative input");
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  const fraction = String(remainder).padStart(2, "0");
  return `${dollarsToWords(dollars)} and ${fraction}/100`;
}
