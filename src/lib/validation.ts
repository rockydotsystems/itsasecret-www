import { z } from 'zod'

// Display-name style inputs (people, orgs, projects, environments, teams,
// access tokens) are human-readable single-line labels shown in the UI, put in
// email subjects, and printed by the CLI. Shared rules:
//  - trimmed and bounded in length,
//  - no control characters (a newline in an email subject is header
//    injection; \0 and friends break terminal/CSV-ish output),
//  - must contain at least one letter or number, so symbol-only values like
//    "*" or "   " can't be saved as someone's name.
export function hasWordCharacter(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value)
}

export function hasNoControlChars(value: string): boolean {
  return !/\p{Cc}/u.test(value)
}

export function displayName(maxLength = 100): z.ZodString {
  return z.string()
    .trim()
    .min(1, 'Required')
    .max(maxLength)
    .refine(hasNoControlChars, { message: 'No line breaks or control characters' })
    .refine(hasWordCharacter, { message: 'Use at least one letter or number' })
}
