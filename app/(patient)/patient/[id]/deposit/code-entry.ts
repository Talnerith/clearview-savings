// Pure helpers for the deposit wizard's code step. The deposit code's
// alphabet (no I/L/O/0/1) matches lib/deposit-codes; the entry field accepts
// anything and normalizes down to it.

export const CODE_LENGTH = 8;

const ALPHABET_FILTER = /[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g;

// Uppercase, drop everything outside the code alphabet (including the
// printed group space), cap at 8 chars. What the form submits.
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(ALPHABET_FILTER, "").slice(0, CODE_LENGTH);
}

// The code is printed on the check in two 4-char groups ("ABCD 2345", M9).
// Mirror that in the input: state holds the raw 8 chars, the field displays
// the grouped form so what the patient types matches what the check shows.
export function chunkCode(raw: string): string {
  return raw.length > 4 ? `${raw.slice(0, 4)} ${raw.slice(4)}` : raw;
}
