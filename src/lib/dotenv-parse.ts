// Parses .env file contents entirely client-side for the import flow.
// Semantics follow dotenv where practical:
// - blank lines and comment lines (#) are ignored; `export KEY=...` is accepted
// - values may be single-quoted (literal), double-quoted (\n, \r, \t, \\, \"
//   escapes), or bare (ends at the first # - inline comments are stripped)
// - quoted values may span multiple lines
// - `$VAR` interpolation is NOT performed - values stay literal
// - duplicate keys resolve last-wins (shell sourcing semantics), with a note
//   added to `skipped` for the shadowed earlier value

export type ParsedEnvEntry = {
  key: string
  value: string
  // 1-based line where the entry starts.
  line: number
}

export type SkippedEnvLine = {
  // 1-based line number.
  line: number
  text: string
  reason: string
}

export type DotenvParseResult = {
  entries: ParsedEnvEntry[]
  skipped: SkippedEnvLine[]
}

const ENTRY_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
const COMMENT_RE = /^\s*#/

function stripCR(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

// Reads a quoted value starting after the opening quote in `rest`, possibly
// continuing across lines. Returns the unescaped value and the index of the
// line where the closing quote was found (anything after it is ignored, like
// dotenv), or null when the value never terminates.
function readQuoted(
  lines: string[],
  startIndex: number,
  rest: string,
  quote: '"' | "'"
): { value: string; endIndex: number } | null {
  let value = ''
  let current = rest
  for (let i = startIndex; ; i++) {
    let j = 0
    while (j < current.length) {
      const ch = current[j]
      if (quote === '"' && ch === '\\' && j + 1 < current.length) {
        const next = current[j + 1]
        if (next === 'n') value += '\n'
        else if (next === 'r') value += '\r'
        else if (next === 't') value += '\t'
        else if (next === '"' || next === '\\') value += next
        else value += ch + next // unknown escape stays literal
        j += 2
        continue
      }
      if (ch === quote) return { value, endIndex: i }
      value += ch
      j++
    }
    if (i + 1 >= lines.length) return null // unterminated
    value += '\n'
    current = lines[i + 1]
  }
}

export function parseDotenv(content: string): DotenvParseResult {
  const lines = content.split('\n').map(stripCR)
  const entries: ParsedEnvEntry[] = []
  const indexByKey = new Map<string, number>()
  const skipped: SkippedEnvLine[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '' || COMMENT_RE.test(raw)) continue

    const m = ENTRY_RE.exec(raw)
    if (!m) {
      skipped.push({ line: i + 1, text: raw.trim(), reason: 'not a KEY=value line' })
      continue
    }

    const key = m[1]
    const rest = m[2]
    const startLine = i + 1

    let value: string
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const parsed = readQuoted(lines, i, rest.slice(1), rest[0] as '"' | "'")
      if (!parsed) {
        skipped.push({ line: startLine, text: raw.trim(), reason: 'unterminated quoted value' })
        continue
      }
      value = parsed.value
      i = parsed.endIndex
    } else {
      // Bare value: ends at the first #, trailing whitespace stripped.
      const commentAt = rest.indexOf('#')
      value = (commentAt === -1 ? rest : rest.slice(0, commentAt)).trimEnd()
    }

    const existingIndex = indexByKey.get(key)
    if (existingIndex !== undefined) {
      skipped.push({ line: entries[existingIndex].line, text: `${key}=…`, reason: 'duplicate key - the later value wins' })
      entries[existingIndex] = { key, value, line: startLine }
    } else {
      indexByKey.set(key, entries.length)
      entries.push({ key, value, line: startLine })
    }
  }

  return { entries, skipped }
}
