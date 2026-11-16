/** ILIKE pattern that contains `term` literally. '%' '_' and '\' are escaped (PostgreSQL's default). */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
