import { describe, expect, it } from 'vitest'
import { parseDotenv } from './dotenv-parse'

function entriesByKey(content: string): Record<string, string> {
  const result = parseDotenv(content)
  return Object.fromEntries(result.entries.map((e) => [e.key, e.value]))
}

describe('parseDotenv', () => {
  it('parses basic KEY=value lines', () => {
    expect(entriesByKey('A=1\nB=two')).toEqual({ A: '1', B: 'two' })
  })

  it('ignores blank lines and comment lines', () => {
    const result = parseDotenv('# top\n\n   \nA=1\n  # indented comment\n')
    expect(result.entries).toEqual([{ key: 'A', value: '1', line: 4 }])
    expect(result.skipped).toEqual([])
  })

  it('accepts the export prefix and spaces around =', () => {
    expect(entriesByKey('export A = 1\nB=  two  ')).toEqual({ A: '1', B: 'two' })
  })

  it('handles CRLF line endings', () => {
    expect(entriesByKey('A=1\r\nB="two"\r\n')).toEqual({ A: '1', B: 'two' })
  })

  it('parses empty values', () => {
    expect(entriesByKey('A=\nB=   \nC=x')).toEqual({ A: '', B: '', C: 'x' })
  })

  it('keeps spaces inside bare values, trimmed at the ends', () => {
    expect(entriesByKey('GREETING=hello world')).toEqual({ GREETING: 'hello world' })
  })

  it('strips inline comments from bare values', () => {
    expect(entriesByKey('A=1 # a comment')).toEqual({ A: '1' })
    expect(entriesByKey('B=a#b')).toEqual({ B: 'a' })
  })

  it('parses double-quoted values with escapes', () => {
    expect(entriesByKey('A="line1\\nline2\\ttabbed \\\\ \\"quoted\\""')).toEqual({
      A: 'line1\nline2\ttabbed \\ "quoted"',
    })
  })

  it('keeps # inside quoted values', () => {
    expect(entriesByKey('A="a#b" # comment\nB=\'c#d\'')).toEqual({ A: 'a#b', B: 'c#d' })
  })

  it('parses single-quoted values literally (no escapes)', () => {
    expect(entriesByKey("A='not\\nnewline'")).toEqual({ A: 'not\\nnewline' })
  })

  it('supports multiline double-quoted values', () => {
    const content = 'KEY="-----BEGIN-----\nabc123\n-----END-----"\nOTHER="after"'
    expect(entriesByKey(content)).toEqual({
      KEY: '-----BEGIN-----\nabc123\n-----END-----',
      OTHER: 'after',
    })
  })

  it('supports multiline single-quoted values', () => {
    expect(entriesByKey("KEY='one\ntwo'")).toEqual({ KEY: 'one\ntwo' })
  })

  it('keeps unknown escapes literal in double quotes', () => {
    expect(entriesByKey('A="a\\qb"')).toEqual({ A: 'a\\qb' })
  })

  it('does not expand $ variables', () => {
    expect(entriesByKey('A=one\nB=$A/two\nC="${A}/three"')).toEqual({ B: '$A/two', A: 'one', C: '${A}/three' })
  })

  it('resolves duplicate keys last-wins and notes the shadowed line', () => {
    const result = parseDotenv('A=1\nB=x\nA=2\n')
    expect(result.entries).toEqual([
      { key: 'A', value: '2', line: 3 },
      { key: 'B', value: 'x', line: 2 },
    ])
    expect(result.skipped).toEqual([{ line: 1, text: 'A=…', reason: 'duplicate key - the later value wins' }])
  })

  it('records its starting line number for each entry', () => {
    const result = parseDotenv('A=1\n\n# c\nB="multi\nline"\nC=3')
    expect(result.entries).toEqual([
      { key: 'A', value: '1', line: 1 },
      { key: 'B', value: 'multi\nline', line: 4 },
      { key: 'C', value: '3', line: 6 },
    ])
  })

  it('skips non KEY=value lines and unterminated quotes', () => {
    const result = parseDotenv('garbage\n1BAD=x\nGOOD=ok\nBROKEN="never closed')
    expect(result.entries).toEqual([{ key: 'GOOD', value: 'ok', line: 3 }])
    expect(result.skipped).toEqual([
      { line: 1, text: 'garbage', reason: 'not a KEY=value line' },
      { line: 2, text: '1BAD=x', reason: 'not a KEY=value line' },
      { line: 4, text: 'BROKEN="never closed', reason: 'unterminated quoted value' },
    ])
  })

  it('ignores trailing content after a closing quote', () => {
    expect(entriesByKey('A="quoted" trailing junk')).toEqual({ A: 'quoted' })
  })
})
