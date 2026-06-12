/**
 * Engine-wide input normalization. Runs ONCE before locale tokenization;
 * every span in tokens/corrections refers to the string this returns.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-") // hyphens/dashes/minus → "-"
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"');
}
