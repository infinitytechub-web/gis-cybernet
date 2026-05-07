// Cryptographically-secure password generator shared by edge functions.
// Uses crypto.getRandomValues with rejection sampling to avoid modulo bias.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(charset: string): string {
  const max = 256 - (256 % charset.length);
  const buf = new Uint8Array(1);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) return charset[buf[0] % charset.length];
  }
}

export function generateSecurePassword(length = 12): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher–Yates with CSPRNG
  for (let i = chars.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
