import { useState } from 'react'
import { Button } from './button'

// Renders a recovery phrase as a numbered grid with a copy-to-clipboard
// button. Numbers make "word 14" verifiable when the user checks their
// paper copy against the screen.
export function RecoveryPhraseDisplay({ phrase }: { phrase: string }) {
  const [copied, setCopied] = useState(false)
  const words = phrase.split(' ')

  async function copy() {
    try {
      await navigator.clipboard.writeText(phrase)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard permission denied; the words are still on screen to
      // transcribe by hand, which is the recommended path anyway.
    }
  }

  return (
    <div>
      <ol className="recovery-phrase-grid">
        {words.map((w, i) => (
          <li key={i} className="recovery-phrase-word">
            <span className="recovery-phrase-num">{i + 1}</span>
            <span className="recovery-phrase-text">{w}</span>
          </li>
        ))}
      </ol>
      <div style={{ marginTop: '16px' }}>
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy to clipboard'}
        </Button>
      </div>
    </div>
  )
}
