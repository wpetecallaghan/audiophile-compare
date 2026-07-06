import { clsx, type ClassValue } from 'clsx'

// Merges conditional class lists into one string. Thin wrapper so call
// sites don't need to know about clsx directly, and so a real class-merge
// tool (e.g. tailwind-merge) can be swapped in later without touching callers.
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
