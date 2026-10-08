// Turns user input into a safe ILIKE "contains" pattern (escapes %, _ and \).
export const containsPattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
export const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals
