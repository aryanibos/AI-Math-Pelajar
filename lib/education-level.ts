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

export function extractEducationLevel(text: string): EducationLevel | null {
  const match = text.match(LEVEL_PREFIX_RE)
  if (!match) return null
  return match[1] as EducationLevel
}

export function hasValidEducationLevelPrefix(text: string): boolean {
  return extractEducationLevel(text) !== null
}

/** Strip client scaffolding; show only the user's soal / keterangan in the UI. */
export function extractUserDisplayText(fullText: string): string {
  const soalIdx = fullText.indexOf(SOAL_SEPARATOR)
  if (soalIdx === -1) return fullText.trim()

  let rest = fullText.slice(soalIdx + SOAL_SEPARATOR.length)
  if (rest.startsWith(IMAGE_SOLVE_PROMPT)) {
    rest = rest.slice(IMAGE_SOLVE_PROMPT.length)
    if (rest.startsWith(KETERANGAN_PREFIX)) {
      return rest.slice(KETERANGAN_PREFIX.length).trim()
    }
    return rest.trim()
  }
  return rest.trim()
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

  const userContent = extractUserDisplayText(rawText)
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
