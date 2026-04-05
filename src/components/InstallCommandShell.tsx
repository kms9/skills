import { useEffect, useRef, useState } from 'react'

type InstallCommandShellProps = {
  command: string
  copyLabel?: string
  copiedLabel?: string
  copyAriaLabel?: string
  copiedAriaLabel?: string
}

export function InstallCommandShell({
  command,
  copyLabel = '复制',
  copiedLabel = '已复制',
  copyAriaLabel = '复制安装命令',
  copiedAriaLabel = '命令已复制',
}: InstallCommandShellProps) {
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        resetTimerRef.current = null
      }, 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="install-command-shell">
      <button
        type="button"
        className={copied ? 'install-copy-button is-copied' : 'install-copy-button'}
        onClick={handleCopy}
        aria-label={copied ? copiedAriaLabel : copyAriaLabel}
      >
        {copied ? copiedLabel : copyLabel}
      </button>
      <div className="hero-install-code mono install-command-code">{command}</div>
    </div>
  )
}
