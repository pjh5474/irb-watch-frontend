/** The R-BAY boards an admin may register in one step (code, label); all three are ticked by default.
 * Same codes as the server's allowed list (crawlers/rbay.py BOARDS). */
export const RBAY_BOARD_CHOICES = [
  { code: "NOTI", label: "공지" },
  { code: "FORM_BOX", label: "양식함" },
  { code: "REGLA", label: "관련규정" },
] as const;
