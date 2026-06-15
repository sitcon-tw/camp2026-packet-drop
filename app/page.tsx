'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Phase = 'group_input' | 'waiting'

export default function Page() {
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>('group_input')
  const [groupInput, setGroupInput] = useState('')
  const [group, setGroup] = useState<number | null>(null)
  const [mySlot, setMySlot] = useState<number | null>(null)
  const [lobbyPlayers, setLobbyPlayers] = useState<number[]>([])
  const [starting, setStarting] = useState(false)
  const [forceConfirm, setForceConfirm] = useState(false)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const fetchingRef = useRef(false)
  const prevJsonRef = useRef('')

  useEffect(() => { inputRef.current?.focus() }, [])

  const pollLobby = useCallback(async () => {
    if (!group || fetchingRef.current) return
    fetchingRef.current = true
    try {
      const res = await fetch(`/api/team/${group}/state`)
      const data = await res.json()
      const json = JSON.stringify(data.team)
      if (json !== prevJsonRef.current) {
        prevJsonRef.current = json
        setLobbyPlayers(data.team?.players?.map((p: { slot: number }) => p.slot) ?? [])
      }
      if (data.team?.status === 'playing') {
        router.replace(`/game/${group}?slot=${mySlot}`)
      }
    } finally {
      fetchingRef.current = false
    }
  }, [group, mySlot, router])

  useEffect(() => {
    if (phase !== 'waiting') return
    pollLobby()
    pollRef.current = setInterval(pollLobby, 2000)
    return () => clearInterval(pollRef.current)
  }, [phase, pollLobby])

  async function handleJoin() {
    const n = parseInt(groupInput)
    if (isNaN(n) || n < 1 || n > 6) { setError('請輸入 1 到 6'); return }
    setError(''); setJoining(true)
    const res = await fetch(`/api/team/${n}/auto-join`, { method: 'POST' })
    const data = await res.json()
    setJoining(false)
    if (!res.ok) {
      setError(
        data.error === 'Game already started' ? '遊戲已開始，無法加入' :
        data.error === 'Team is full' ? '這組已滿，請換一組' : '發生錯誤，請重試',
      )
      return
    }
    setGroup(n)
    setMySlot(data.slot)
    setLobbyPlayers([data.slot])
    setPhase('waiting')
  }

  async function handleStart() {
    if (!group || !mySlot) return
    setStarting(true); setForceConfirm(false)
    await fetch(`/api/team/${group}/start`, { method: 'POST' })
    router.replace(`/game/${group}?slot=${mySlot}`)
  }

  const allFilled = lobbyPlayers.length >= 6

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10">

      {/* Brand */}
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-end gap-[3px] mb-4" aria-hidden>
          {[8, 11, 15, 19].map((h, i) => (
            <div key={i} className="w-[5px] rounded-sm bg-net-cyan" style={{ height: h, opacity: 0.25 + i * 0.22 }} />
          ))}
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white mb-1">封包掉包遊戲</h1>
        <p className="text-[10px] text-slate-600 tracking-widest uppercase">TCP Network Sim · Camp 2026</p>
      </div>

      <div className="w-full max-w-[300px] flex flex-col gap-5">

        {/* ── PHASE: group_input ── */}
        {phase === 'group_input' && (
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Group</div>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="number" min={1} max={6} placeholder="1 – 6"
                aria-label="Group number"
                value={groupInput}
                onChange={e => { setGroupInput(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                className="flex-1 h-10 bg-net-raised border border-net-wire rounded-md px-3
                  text-white text-sm placeholder-slate-700 focus:outline-none focus:border-net-cyan
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                  [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining || !groupInput}
                className="h-10 px-4 bg-net-cyan text-white font-bold rounded-md text-sm
                  hover:bg-blue-500 transition-colors disabled:opacity-40"
              >
                {joining ? '…' : '加入'}
              </button>
            </div>
            {error && <p className="text-net-red text-xs mt-2 animate-shake">{error}</p>}
          </div>
        )}

        {/* ── PHASE: waiting ── */}
        {phase === 'waiting' && group !== null && mySlot !== null && (
          <div className="flex flex-col gap-4 animate-fade-in">

            {/* Status bar */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-600 uppercase tracking-widest">Group {group}</span>
              <div className="w-px h-3 bg-net-wire" />
              <span className="text-[10px] text-slate-600 uppercase tracking-widest">Seat #{mySlot}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-net-green" />
                <span className="text-[10px] text-slate-600 uppercase">Waiting</span>
              </div>
            </div>

            {/* Port panel */}
            <div className="bg-net-surface border border-net-wire rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-net-wire bg-net-raised">
                <span className="text-[10px] text-slate-600 uppercase tracking-widest">Port Status</span>
                <span className="text-[10px] text-slate-500">{lobbyPlayers.length}/6</span>
              </div>
              <div className="flex gap-2 px-3 py-3">
                {[1, 2, 3, 4, 5, 6].map(s => {
                  const joined = lobbyPlayers.includes(s)
                  const isMe = s === mySlot
                  return (
                    <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className={`w-full h-8 rounded border flex items-center justify-center
                        ${isMe
                          ? 'border-net-cyan bg-net-cyan/10'
                          : joined
                            ? 'border-net-green/40 bg-net-green/5'
                            : 'border-net-wire/60'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full
                          ${isMe ? 'bg-net-cyan' : joined ? 'bg-net-green' : 'bg-net-wire'}`} />
                      </div>
                      <span className={`text-[10px] font-bold
                        ${isMe ? 'text-net-cyan' : joined ? 'text-net-green' : 'text-slate-700'}`}>
                        {s}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Connected chips */}
            {lobbyPlayers.length > 0 && (
              <div>
                <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Connected</div>
                <div className="flex flex-wrap gap-1.5">
                  {lobbyPlayers.toSorted((a, b) => a - b).map(s => (
                    <span key={s} className={`text-[11px] px-2 py-1 rounded border
                      ${s === mySlot
                        ? 'border-net-cyan/40 bg-net-cyan/5 text-net-cyan'
                        : 'border-net-green/30 bg-net-green/5 text-net-green'
                      }`}>
                      Slot {s}{s === mySlot ? ' (you)' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Start / force-start */}
            {allFilled ? (
              <button
                type="button"
                onClick={handleStart} disabled={starting}
                className="w-full h-11 bg-net-green text-net-bg font-bold rounded-lg text-sm
                  hover:bg-emerald-400 transition-colors disabled:opacity-50"
              >
                {starting ? '開始中…' : '▶ 開始遊戲'}
              </button>
            ) : forceConfirm ? (
              <div className="border border-net-orange/40 bg-net-orange/5 rounded-lg p-4 animate-fade-in">
                <div className="text-[10px] font-bold text-net-orange uppercase tracking-widest mb-1">
                  Confirm force start?
                </div>
                <div className="text-xs text-slate-500 mb-4">
                  目前 {lobbyPlayers.length}/6 人就位，空座位無法補入。
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleStart} disabled={starting}
                    className="flex-1 h-9 bg-net-orange text-net-bg font-bold text-xs rounded-md
                      hover:bg-amber-400 transition-colors disabled:opacity-50"
                  >
                    {starting ? '…' : '確認強制開始'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForceConfirm(false)}
                    className="flex-1 h-9 border border-net-wire text-slate-500 text-xs font-bold rounded-md
                      hover:border-slate-500 hover:text-slate-300 transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setForceConfirm(true)}
                className="w-full h-11 border border-net-wire text-slate-500 font-bold rounded-lg text-sm
                  hover:border-net-orange hover:text-net-orange transition-colors"
              >
                強制開始（人未到齊）
              </button>
            )}

            <p className="text-center text-[10px] text-slate-700">Auto-refresh · 2s</p>
          </div>
        )}

      </div>
    </main>
  )
}
