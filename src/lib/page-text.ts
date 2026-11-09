// The stored page text of a post is one run-on line: board name, date, title, then items
// separated by " - " and " @ ". For reading, break it into lines. Display only: the stored
// text and the diff logic are untouched (both sides of a diff are formatted the same way, so
// the comparison stays correct). A heuristic: an ordinary " - " inside a sentence also breaks.
export function formatPageText(text: string): string {
  return text
    .replace(/^(.{0,30}?\d{4}-\d{2}-\d{2}) (?=\S)/, "$1\n") // after the first date near the start
    .replace(/(?<=\S) - /g, "\n- ")
    .replace(/(?<=\S) @ /g, "\n@ ");
}
