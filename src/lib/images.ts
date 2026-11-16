/** Image files the document page shows (the server's services/downloads.is_shown_image). */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

export function isShownImage(filename: string, hashOnlyReason: string | null): boolean {
  const name = filename.toLowerCase();
  return hashOnlyReason === "inline_image" || IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}
