// Converts an ISO 3166-1 alpha-2 code to its flag emoji via regional indicator symbols.
export function countryFlagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, char => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
