type Props = {
  ackSlots: number[]
  playerCount: number
  mySlot: number
  myAcked: boolean
  onAck: () => void
  acking: boolean
}

export default function AckBanner({
  ackSlots,
  playerCount,
  mySlot,
  myAcked,
  onAck,
  acking,
}: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-net-surface border-t border-net-red/50">
      <div className="max-w-2xl mx-auto px-4 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-mono font-bold text-net-red uppercase tracking-widest">
              Packet Loss Detected
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              Retransmission required · {ackSlots.length}/{playerCount} acknowledged
            </div>
          </div>
          <button
            type="button"
            onClick={onAck}
            disabled={myAcked || acking}
            className={`px-5 py-2.5 font-bold text-xs rounded-md uppercase tracking-wide
              transition-colors duration-150 active:scale-95
              ${myAcked
                ? 'bg-net-green/10 border border-net-green/40 text-net-green cursor-default'
                : 'bg-net-red text-white hover:bg-red-500'
              }
              disabled:opacity-60`}
          >
            {myAcked ? '✓ ACK Sent' : acking ? '…' : 'Send ACK'}
          </button>
        </div>

        {/* Per-slot progress */}
        <div className="flex gap-2">
          {Array.from({ length: playerCount }, (_, i) => i + 1).map((s) => {
            const acked = ackSlots.includes(s)
            const isMe = s === mySlot
            return (
              <div key={s} className="flex-1 text-center">
                <div
                  className={`h-[3px] rounded-full mb-1 transition-colors duration-300
                    ${acked ? 'bg-net-green' : 'bg-net-wire'}`}
                />
                <span
                  className={`text-[9px] font-mono font-bold
                    ${isMe
                      ? acked ? 'text-net-green' : 'text-white'
                      : acked ? 'text-net-green' : 'text-slate-700'
                    }`}
                >
                  {s}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
