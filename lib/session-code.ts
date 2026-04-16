import { customAlphabet } from "nanoid";

/** 5-char codes; avoid ambiguous 0/O, 1/I */
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const gen = customAlphabet(alphabet, 5);

export function generateSessionCode(): string {
  return gen();
}
