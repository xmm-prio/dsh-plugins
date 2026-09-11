/**
 * What this plugin is allowed to take from the host's UI primitives.
 *
 * The specifier `@deepseek-ai/dsh-client-ui-primitives` is not a module the
 * browser's loader fetches — it is seeded into `require` from the host's
 * application bundle, so its contents are whatever survived that bundle's
 * tree-shaking on the DSH build the user happens to be running. There is no
 * contract, and a name that is there today can be absent tomorrow without
 * anything in this repo changing.
 *
 * Losing one is not a graceful degradation either: an undefined import used
 * during render throws, the host's slot error boundary unmounts the whole
 * entry, and the archive area flashes and disappears with no message. That
 * happened once, over `fileSizeText` — a byte-count formatter, borrowed for
 * nothing but visual consistency.
 *
 * So the rule is a line, not a judgement call: take components, because
 * nothing else can make a control look native, and never take a function,
 * because a function can be written here. This test is where the rule bites.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const CLIENT = join(import.meta.dirname, '..', 'src', 'client')
const SPECIFIER = '@deepseek-ai/dsh-client-ui-primitives'

/** Every `.ts`/`.tsx` file under the browser half. */
function clientSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return clientSources(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** The names one file imports from the host's primitives, if any. */
function importedNames(source: string): string[] {
  const match = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${SPECIFIER}'`).exec(source)
  if (match === null) return []
  return (match[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
}

describe('what the browser half borrows from the host', () => {
  const imported = clientSources(CLIENT).flatMap((path) => importedNames(readFileSync(path, 'utf8')))

  it('borrows something, or this test is quietly passing for the wrong reason', () => {
    expect(imported.length).toBeGreaterThan(0)
  })

  it('borrows only components, never a function that could be written here', () => {
    // A React component is capitalized by convention and by JSX's own rules,
    // so the casing of the name is exactly the distinction being drawn.
    const helpers = imported.filter((name) => name[0] !== name[0]?.toUpperCase())
    expect(helpers).toEqual([])
  })
})
