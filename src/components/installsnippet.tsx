import { useState } from 'react'
import { CopyIcon } from '~/components/secretrow'

const INSTALL_CMD = 'curl -fsSL https://itsasecret.dev/install.sh | sh'

export function InstallSnippet() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(INSTALL_CMD)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="install-snippet">
      <span className="term-prompt">$ </span>
      <code className="install-snippet-cmd">{INSTALL_CMD}</code>
      <button
        type="button"
        className="secret-action"
        onClick={() => void handleCopy()}
        title="Copy install command"
      >
        {copied ? <span className="term-ok">✓</span> : CopyIcon}
      </button>
    </div>
  )
}
