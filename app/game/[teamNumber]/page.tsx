'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import FragmentCard from '@/components/FragmentCard'
import SortableNotes from '@/components/SortableNotes'
import AckBanner from '@/components/AckBanner'
import type { GameStateData } from '@/lib/types'

const TEAM_COLORS: Record<number, string> = {
  1: 'text-net-cyan',
  2: 'text-emerald-400',
  3: 'text-violet-400',
  4: 'text-amber-400',
  5: 'text-rose-400',
  6: 'text-sky-400',
}

function GamePageInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const teamNumber = parseInt(params.teamNumber as string)
  const mySlot = parseInt(searchParams.get('slot') ?? '0')

  const [gameState, setGameState] = useState<GameStateData | null>(null)
  const [importing, setImporting] = useState(false)
  const [acking, setAcking] = useState(false)
  const [answerInput, setAnswerInput] = useState('')
  const [submittingAnswer, setSubmittingAnswer] = useState(false)
  const [retransmitting, setRetransmitting] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const fetchingRef = useRef(false)
  const prevJsonRef = useRef('')
  const retransmittingRef = useRef(false)
  const prevAckRef = useRef<{ id: number | null; round: number }>({ id: null, round: 0 })

  const fetchState = useCallback(async () => {
    if (retransmittingRef.current || fetchingRef.current) return
    fetchingRef.current = true
    try {
      const res = await fetch(`/api/game/${teamNumber}/state?slot=${mySlot}`)
      if (!res.ok) return
      const data: GameStateData = await res.json()
      const json = JSON.stringify(data)
      if (json !== prevJsonRef.current) {
        prevJsonRef.current = json

        // Detect ACK resolution: event was active, now resolved, same round
        const prevAck = prevAckRef.current
        const currAckId = data.activeAck?.id ?? null
        const currRound = data.team.round
        prevAckRef.current = { id: currAckId, round: currRound }

        if (prevAck.id !== null && currAckId === null && prevAck.round === currRound) {
          retransmittingRef.current = true
          setRetransmitting(true)
          setTimeout(() => {
            retransmittingRef.current = false
            setRetransmitting(false)
          }, 3000)
        }

        setGameState(data)
      }
    } finally {
      fetchingRef.current = false
    }
  }, [teamNumber, mySlot])

  useEffect(() => {
    setAnswerInput('')
  }, [gameState?.team.round])

  useEffect(() => {
    fetchState()
    pollRef.current = setInterval(fetchState, 2000)
    return () => clearInterval(pollRef.current)
  }, [fetchState])

  async function handleImport() {
    setImporting(true)
    await fetch(`/api/game/${teamNumber}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: mySlot }),
    })
    prevJsonRef.current = ''
    await fetchState()
    setImporting(false)
  }

  async function handleSort(newOrder: number[]) {
    fetch(`/api/game/${teamNumber}/sort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: newOrder }),
    })
  }

  async function handleAck() {
    setAcking(true)
    await fetch(`/api/game/${teamNumber}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: mySlot }),
    })
    prevJsonRef.current = ''
    await fetchState()
    setAcking(false)
  }

  async function handleAnswer() {
    if (!answerInput.trim()) return
    setSubmittingAnswer(true)
    await fetch(`/api/game/${teamNumber}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: answerInput }),
    })
    setSubmittingAnswer(false)
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[11px] font-mono text-slate-600 animate-pulse uppercase tracking-widest">
          Connecting…
        </div>
      </div>
    )
  }

  const { team, myFragment, notes, activeAck } = gameState
  const myAcked = activeAck?.ackSlots.includes(mySlot) ?? false
  const hasImported = notes.fragments.some((f) => f.slot === mySlot)
  const color = TEAM_COLORS[team.number] ?? 'text-net-cyan'

  if (team.status === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center animate-fade-in max-w-xs">
          <div className="w-12 h-12 rounded-full bg-net-green/10 border border-net-green/30
            flex items-center justify-center mx-auto mb-5">
            <div className="w-4 h-4 rounded-full bg-net-green" />
          </div>
          <div className="text-net-green font-black text-xl mb-1">遊戲完成</div>
          <p className="text-slate-500 text-sm mb-6">感謝參與 TCP 封包掉包體驗活動</p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-5 py-2.5 border border-net-wire text-slate-400 rounded-lg text-sm
              hover:border-net-cyan hover:text-net-cyan transition-colors duration-150"
          >
            返回首頁
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen flex flex-col ${activeAck ? 'pb-28' : 'pb-6'}`}>

      {/* 3-second retransmission freeze overlay */}
      {retransmitting && (
        <div className="fixed inset-0 z-50 bg-net-bg/95 flex flex-col items-center justify-center gap-4 animate-fade-in">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-net-cyan"
                style={{ animationDelay: `${i * 0.12}s`, animation: 'pulse 0.6s ease-in-out infinite' }}
              />
            ))}
          </div>
          <div className="text-center">
            <div className="text-lg font-black text-net-cyan tracking-wide">Retransmitting…</div>
            <div className="text-[11px] font-mono text-slate-500 mt-1">封包重傳中，請稍候</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-net-bg border-b border-net-wire">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`font-black text-sm ${color}`}>GRP {team.number}</span>
            <span className="text-net-wire text-xs">|</span>
            <span className="text-[11px] font-mono text-slate-500">SEAT #{mySlot}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-mono text-slate-600">RND {team.round}/3</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((r) => (
                <div
                  key={r}
                  className={`w-1.5 h-1.5 rounded-full
                    ${r < team.round ? 'bg-net-green' : r === team.round ? 'bg-net-cyan' : 'bg-net-wire'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 flex flex-col gap-4">
        {/* My packet */}
        {myFragment && (
          <section>
            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-2">
              My Packet
            </div>
            <FragmentCard
              slot={mySlot}
              content={myFragment.content}
              isCorrupted={myFragment.isCorrupted}
              onImport={handleImport}
              importing={importing}
              hasImported={hasImported}
            />
          </section>
        )}

        {/* Shared notes divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-net-wire" />
          <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest shrink-0">
            Shared Notes ({notes.fragments.length}/{team.players.length})
          </span>
          <div className="flex-1 h-px bg-net-wire" />
        </div>

        {/* Drag-sort notes */}
        <section>
          <div className="text-[10px] font-mono text-slate-700 mb-2 text-right">
            Hold &amp; drag to reorder
          </div>
          <SortableNotes fragments={notes.fragments} onSort={handleSort} />
        </section>

        {/* Answer */}
        {notes.fragments.length > 0 && (
          <div className="rounded-lg border border-net-wire overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-net-wire bg-net-raised">
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                Team Answer
              </span>
              {notes.answer && (
                <span className="text-[10px] font-mono text-net-green">● Submitted</span>
              )}
            </div>
            <div className="p-3">
              {notes.answer ? (
                <div className="text-sm font-mono text-net-yellow break-all">
                  {notes.answer}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="輸入答案…"
                    aria-label="Answer"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAnswer()}
                    className="flex-1 h-9 bg-black/40 border border-net-wire rounded-md px-3 text-sm text-slate-200
                      placeholder-slate-700 focus:outline-none focus:border-net-yellow"
                  />
                  <button
                    type="button"
                    onClick={handleAnswer}
                    disabled={!answerInput.trim() || submittingAnswer}
                    className="h-9 px-4 bg-net-yellow text-net-bg font-bold text-xs rounded-md
                      hover:bg-yellow-300 active:scale-95 transition-all duration-150
                      disabled:opacity-40 shrink-0 uppercase tracking-wide"
                  >
                    {submittingAnswer ? '…' : 'Submit'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {activeAck && (
        <AckBanner
          ackSlots={activeAck.ackSlots}
          playerCount={activeAck.playerCount}
          mySlot={mySlot}
          myAcked={myAcked}
          onAck={handleAck}
          acking={acking}
        />
      )}
    </div>
  )
}

export default function GamePage() {
  return (
    <Suspense>
      <GamePageInner />
    </Suspense>
  )
}
