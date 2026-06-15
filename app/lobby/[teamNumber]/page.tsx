'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

type TeamState = {
  number: number
  status: string
  round: number
  players: { slot: number }[]
}

export default function LobbyPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const teamNumber = parseInt(params.teamNumber as string)
  const mySlot = parseInt(searchParams.get('slot') ?? '0')

  const [team, setTeam] = useState<TeamState | null>(null)
  const [starting, setStarting] = useState(false)
  const [forceConfirm, setForceConfirm] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const fetchingRef = useRef(false)
  const prevJsonRef = useRef('')

  async function fetchState() {
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      const res = await fetch(`/api/team/${teamNumber}/state`)
      const data = await res.json()
      const json = JSON.stringify(data.team)
      if (json !== prevJsonRef.current) {
        prevJsonRef.current = json
        setTeam(data.team)
      }
      if (data.team?.status === 'playing') {
        router.replace(`/game/${teamNumber}?slot=${mySlot}`)
      }
    } finally {
      fetchingRef.current = false
    }
  }

  useEffect(() => {
    fetchState()
    pollRef.current = setInterval(fetchState, 2000)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamNumber])

  async function handleStart() {
    setStarting(true)
    setForceConfirm(false)
    await fetch(`/api/team/${teamNumber}/start`, { method: 'POST' })
    router.replace(`/game/${teamNumber}?slot=${mySlot}`)
  }

  const takenSlots = team?.players.map((p) => p.slot) ?? []
  const allFilled = takenSlots.length >= 6

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="border-b border-net-wire px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            Group {teamNumber}
          </span>
          <div className="w-px h-3 bg-net-wire" />
          <span className="text-[10px] font-mono text-slate-500">Seat #{mySlot}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-net-green" />
          <span className="text-[10px] font-mono text-slate-600 uppercase">Lobby</span>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">
        <div className="w-full max-w-[320px]">
          <div className="mb-6">
            <h1 className="text-xl font-black text-white mb-1">第 {teamNumber} 組候場</h1>
            <p className="text-sm text-slate-500">
              {allFilled
                ? '所有成員已就位'
                : `等待 ${6 - takenSlots.length} 位組員加入…`}
            </p>
          </div>

          {/* Port panel */}
          <div className="bg-net-surface border border-net-wire rounded-lg overflow-hidden mb-4">
            <div className="flex items-center justify-between px-3 py-2 border-b border-net-wire bg-net-raised">
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
                Port Status
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {takenSlots.length}/6
              </span>
            </div>
            <div className="flex gap-2 px-3 py-3">
              {[1, 2, 3, 4, 5, 6].map((s) => {
                const taken = takenSlots.includes(s)
                const isMe = s === mySlot
                return (
                  <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                    <div
                      className={`w-full h-8 rounded border flex items-center justify-center
                        ${isMe
                          ? 'border-net-cyan bg-net-cyan/10'
                          : taken
                            ? 'border-net-green/40 bg-net-green/5'
                            : 'border-net-wire/60'
                        }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full transition-colors
                          ${isMe ? 'bg-net-cyan' : taken ? 'bg-net-green' : 'bg-net-wire'}`}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold
                        ${isMe ? 'text-net-cyan' : taken ? 'text-net-green' : 'text-slate-700'}`}
                    >
                      {s}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Connected list */}
          {takenSlots.length > 0 && (
            <div className="mb-5">
              <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-2">
                Connected
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6].filter((s) => takenSlots.includes(s)).map((s) => (
                  <span
                    key={s}
                    className={`text-[11px] font-mono px-2 py-1 rounded border
                      ${s === mySlot
                        ? 'border-net-cyan/40 bg-net-cyan/5 text-net-cyan'
                        : 'border-net-green/30 bg-net-green/5 text-net-green'
                      }`}
                  >
                    Slot {s}{s === mySlot ? ' (you)' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action */}
          {allFilled ? (
            <button
              onClick={handleStart}
              disabled={starting}
              className="w-full h-11 bg-net-green text-net-bg font-bold rounded-lg text-sm
                hover:bg-emerald-400 transition-colors duration-150 disabled:opacity-50"
            >
              {starting ? '開始中…' : '▶ 開始遊戲'}
            </button>
          ) : forceConfirm ? (
            <div className="border border-net-orange/40 bg-net-orange/5 rounded-lg p-4 animate-fade-in">
              <div className="text-[10px] font-mono font-bold text-net-orange uppercase tracking-widest mb-1">
                Confirm force start?
              </div>
              <div className="text-xs text-slate-500 mb-4">
                目前 {takenSlots.length}/6 人就位，空座位無法補入。
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="flex-1 h-9 bg-net-orange text-net-bg font-bold text-xs rounded-md
                    hover:bg-amber-400 transition-colors duration-150 disabled:opacity-50"
                >
                  {starting ? '…' : '確認強制開始'}
                </button>
                <button
                  onClick={() => setForceConfirm(false)}
                  className="flex-1 h-9 border border-net-wire text-slate-500 text-xs font-bold rounded-md
                    hover:border-slate-500 hover:text-slate-300 transition-colors duration-150"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setForceConfirm(true)}
              className="w-full h-11 border border-net-wire text-slate-500 font-bold rounded-lg text-sm
                hover:border-net-orange hover:text-net-orange transition-colors duration-150"
            >
              強制開始（人未到齊）
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-3 text-center text-[10px] font-mono text-slate-700">
        Auto-refresh · 2s
      </div>
    </div>
  )
}
