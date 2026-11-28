import { register } from "node:module"
import { pathToFileURL } from "node:url"
import { fileURLToPath } from "node:url"
import path from "node:path"

const hook = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "ts-resolve-hook.mjs",
)

register(pathToFileURL(hook).href, import.meta.url)