/** Resolve extensionless relative ESM imports to `.ts` for node --test. */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (
      err?.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-zA-Z0-9]+$/.test(specifier)
    ) {
      return await nextResolve(`${specifier}.ts`, context)
    }
    throw err
  }
}