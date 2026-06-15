type Props = {
  slot: number
  content: string
  isCorrupted: boolean
  onImport: () => void
  importing: boolean
  hasImported: boolean
}

export default function FragmentCard({
  slot,
  content,
  isCorrupted,
  onImport,
  importing,
  hasImported,
}: Props) {
  return (
    <div
      className={`rounded-lg border overflow-hidden
        ${isCorrupted ? 'border-net-red/50' : 'border-net-wire'}`}
    >
      {/* Header bar */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b text-[10px] font-mono
          ${isCorrupted
            ? 'border-net-red/30 bg-red-950/40'
            : 'border-net-wire bg-net-raised'
          }`}
      >
        <span className="text-slate-500 uppercase tracking-wider">Slot #{slot}</span>
        <span className={isCorrupted ? 'text-net-red' : 'text-net-green'}>
          {isCorrupted ? '⚠ CORRUPTED' : '● CLEAN'}
        </span>
      </div>

      {/* Content */}
      <div className={`px-4 py-3 ${isCorrupted ? 'bg-red-950/10' : 'bg-net-surface'}`}>
        <pre
          className={`whitespace-pre-wrap text-sm leading-relaxed select-all
            ${isCorrupted ? 'text-net-red/60 font-mono' : 'text-slate-200'}`}
        >
          {content}
        </pre>
      </div>

      {/* Footer action */}
      <div className={`px-3 py-2.5 border-t ${isCorrupted ? 'border-net-red/20' : 'border-net-wire'}`}>
        {hasImported && !isCorrupted ? (
          <div className="text-[11px] font-mono text-net-green text-center py-0.5">
            ✓ Imported to shared notes
          </div>
        ) : (
          <button
            onClick={onImport}
            disabled={importing}
            className={`w-full py-2.5 font-bold text-xs rounded-md uppercase tracking-wide
              transition-colors duration-150 active:scale-95
              ${isCorrupted
                ? 'bg-transparent border border-net-red/40 text-net-red hover:bg-net-red/10'
                : 'bg-net-cyan text-white hover:bg-blue-500'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {importing ? 'Importing…' : isCorrupted ? 'Import (Corrupted)' : 'Import to Shared Notes'}
          </button>
        )}
      </div>
    </div>
  )
}
