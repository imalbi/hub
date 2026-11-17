/** A text without case and accents, for matching: the query "chimica" finds "Chímica". */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
