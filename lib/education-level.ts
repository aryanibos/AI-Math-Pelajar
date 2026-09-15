export const EDUCATION_LEVELS = ["SD", "SMP", "SMA/SMK", "S1"] as const

export type EducationLevel = (typeof EDUCATION_LEVELS)[number]

export const LEVEL_DESCRIPTIONS: Record<EducationLevel, string> = {
  SD: "Matematika dasar: penjumlahan, pengurangan, perkalian, pembagian, pecahan, geometri dasar",
  SMP: "Aljabar dasar, geometri, statistika, persamaan linear, teorema Pythagoras",
  "SMA/SMK": "Trigonometri, logaritma, limit, turunan, integral, matriks, vektor",
  S1: "Kalkulus lanjut, aljabar linear, persamaan diferensial, statistika matematika",
}

export const SOAL_SEPARATOR = "\n\nSoal:\n"
export const IMAGE_SOLVE_PROMPT =
  "Lihat dan analisis gambar soal matematika berikut, lalu selesaikan dengan langkah-langkah yang jelas:"
export const KETERANGAN_PREFIX = "\n\nKeterangan tambahan: "

const LEVEL_PREFIX_RE = /^\[Tingkat: (SD|SMP|SMA\/SMK|S1)\]/
const EMBEDDED_LEVEL_TAG_RE = /\[Tingkat: (?:SD|SMP|SMA\/SMK|S1)\]/g
/** Zero-width / BOM / soft-hyphen / Hangul filler (U+3164) that bypass `.trim()` empty-soal checks. */
const INVISIBLE_CHAR_RE = /[\u200B-\u200D\uFEFF\u00AD\u2060\u180E\u3164]/g

export function stripInvisibleChars(text: string): string {
  return text.replace(INVISIBLE_CHAR_RE, "")
}

export function extractEducationLevel(text: string): EducationLevel | null {
  const match = text.match(LEVEL_PREFIX_RE)
  if (!match) return null
  return match[1] as EducationLevel
}

export function hasValidEducationLevelPrefix(text: string): boolean {
  return extractEducationLevel(text) !== null
}

/** True when user soal text embeds API prompt markers (not SOAL_SEPARATOR — multi-part soal may use it). */
export function containsForbiddenSoalMarkers(text: string): boolean {
  return text.includes(IMAGE_SOLVE_PROMPT) || text.includes(KETERANGAN_PREFIX)
}

/** Strip embedded level tags from soal body (canonical prefix already sets level). */
export function stripEmbeddedLevelTags(text: string): string {
  // Collapse horizontal whitespace only — preserve paragraph breaks in multi-part soal.
  return text.replace(EMBEDDED_LEVEL_TAG_RE, "").replace(/[ \t]{2,}/g, " ").trim()
}

/** Remove scaffolding markers a user may embed inside their soal text. */
export function stripEmbeddedScaffolding(text: string): string {
  let cleaned = text
  // Do not strip SOAL_SEPARATOR — legitimate multi-part soal may contain "\n\nSoal:\n".
  cleaned = cleaned.replaceAll(IMAGE_SOLVE_PROMPT, "")
  cleaned = cleaned.replaceAll(KETERANGAN_PREFIX, "\n")
  return stripInvisibleChars(cleaned).replace(/\n{3,}/g, "\n\n").trim()
}

/** Extract user soal / keterangan without stripping embedded markers (for validation). */
export function extractRawUserDisplayText(fullText: string): string {
  const soalIdx = fullText.indexOf(SOAL_SEPARATOR)
  if (soalIdx === -1) return fullText

  let rest = fullText.slice(soalIdx + SOAL_SEPARATOR.length)
  if (rest.startsWith(IMAGE_SOLVE_PROMPT)) {
    rest = rest.slice(IMAGE_SOLVE_PROMPT.length)
    if (rest.startsWith(KETERANGAN_PREFIX)) {
      return rest.slice(KETERANGAN_PREFIX.length)
    }
    return rest
  }
  return rest
}

/** Strip client scaffolding; show only the user's soal / keterangan in the UI. */
export function extractUserDisplayText(fullText: string): string {
  return stripEmbeddedScaffolding(extractRawUserDisplayText(fullText))
}

export function buildContextPrefix(level: EducationLevel): string {
  return `[Tingkat: ${level}] ${LEVEL_DESCRIPTIONS[level]}${SOAL_SEPARATOR}`
}

/**
 * Rebuild user text from validated parts so injected content between the level
 * tag and Soal: cannot reach the model. Returns null when content is invalid.
 */
export function rebuildSanitizedUserText(
  rawText: string,
  hasImage: boolean,
): string | null {
  const level = extractEducationLevel(rawText)
  if (!level) return null

  const rawUserContent = extractRawUserDisplayText(rawText)
  if (containsForbiddenSoalMarkers(rawUserContent)) return null
  const userContent = stripEmbeddedLevelTags(
    stripEmbeddedScaffolding(rawUserContent),
  )
  const prefix = buildContextPrefix(level)

  if (hasImage) {
    const keterangan = userContent
      ? `${KETERANGAN_PREFIX}${userContent}`
      : ""
    return `${prefix}${IMAGE_SOLVE_PROMPT}${keterangan}`
  }

  if (!userContent) return null
  return `${prefix}\n${userContent}`
}
