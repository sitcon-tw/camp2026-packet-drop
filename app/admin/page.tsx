'use client'
import { useEffect, useRef, useState } from 'react'

type TeamSummary = {
  number: number
  status: string
  round: number
  players: { slot: number }[]
}

const STATUS: Record<string, { label: string; color: string }> = {
  waiting:  { label: 'Waiting',     color: 'text-slate-500 bg-net-wire/20' },
  playing:  { label: 'In Progress', color: 'text-net-green bg-net-green/10' },
  finished: { label: 'Finished',    color: 'text-net-yellow bg-net-yellow/10' },
}

export default function AdminPage() {
  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [resetAllConfirm, setResetAllConfirm] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  async function fetchAll() {
    const results = await Promise.all(
      [1, 2, 3, 4, 5, 6].map(n =>
        fetch(`/api/team/${n}/state`).then(r => r.json()).then(d => d.team as TeamSummary),
      ),
    )
    setTeams(results.filter(Boolean))
  }

  useEffect(() => {
    fetchAll()
    pollRef.current = setInterval(fetchAll, 3000)
    return () => clearInterval(pollRef.current)
  }, [])

  async function doAction(key: string, fn: () => Promise<void>) {
    setBusy(p => ({ ...p, [key]: true }))
    await fn()
    await fetchAll()
    setBusy(p => ({ ...p, [key]: false }))
  }

  async function handleResetAll() {
    setResetAllConfirm(false)
    setBusy(p => ({ ...p, resetAll: true }))
    await fetch('/api/admin/reset-all', { method: 'POST' })
    await fetchAll()
    setBusy(p => ({ ...p, resetAll: false }))
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-net-wire px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-net-red" />
          <span className="text-sm font-black text-white">Admin Panel</span>
        </div>
        <span className="text-[10px] text-slate-600">Camp 2026 · 3s refresh</span>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-5">

        {/* ── Reset All ── */}
        <div className="bg-net-surface border border-net-wire rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-net-wire bg-net-raised">
            <div>
              <div className="text-sm font-bold text-white">Reset All Groups</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Clear all players, notes, and events — set every group back to waiting / round 0
              </div>
            </div>
          </div>
          <div className="px-4 py-3">
            {resetAllConfirm ? (
              <div className="flex flex-col gap-2 animate-fade-in">
                <p className="text-xs text-net-red">
                  This wipes ALL data for all 6 groups. Cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleResetAll}
                    disabled={busy.resetAll}
                    className="flex-1 h-9 bg-net-red text-white font-bold text-xs rounded-md
                      hover:bg-red-500 transition-colors disabled:opacity-50"
                  >
                    {busy.resetAll ? 'Resetting…' : 'Yes, reset everything'}
                  </button>
                  <button
                    onClick={() => setResetAllConfirm(false)}
                    className="flex-1 h-9 border border-net-wire text-slate-400 text-xs font-bold rounded-md
                      hover:border-slate-500 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setResetAllConfirm(true)}
                disabled={busy.resetAll}
                className="w-full h-9 border border-net-red/50 text-net-red text-xs font-bold rounded-md
                  hover:bg-net-red/10 transition-colors disabled:opacity-50"
              >
                Reset All Groups
              </button>
            )}
          </div>
        </div>

        {/* ── Per-team rows ── */}
        <div className="flex flex-col gap-2">
          <div className="text-[10px] text-slate-600 uppercase tracking-widest px-1">Groups</div>
          {teams.map(team => {
            const st = STATUS[team.status] ?? STATUS.waiting
            const isPlaying = team.status === 'playing'
            return (
              <div key={team.number} className="bg-net-surface border border-net-wire rounded-lg px-3 py-3">
                <div className="flex items-center gap-3">
                  {/* Name + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-bold text-white">Group {team.number}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.color}`}>
                        {isPlaying ? `Rnd ${team.round}/3` : st.label}
                      </span>
                    </div>
                    {/* Slot indicators */}
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5, 6].map(s => (
                        <div key={s} className={`flex-1 h-1 rounded-full
                          ${team.players.some(p => p.slot === s) ? 'bg-net-green' : 'bg-net-wire'}`} />
                      ))}
                    </div>
                  </div>

                  {/* Player count */}
                  <span className="text-[11px] text-slate-600 shrink-0">{team.players.length}/6</span>

                  {/* Actions */}
                  <div className="flex gap-1.5 shrink-0">
                    {team.status === 'waiting' && (
                      <button
                        onClick={() => doAction(`${team.number}-start`, () =>
                          fetch(`/api/team/${team.number}/start`, { method: 'POST' }).then(() => {}),
                        )}
                        disabled={busy[`${team.number}-start`]}
                        className="h-7 px-2.5 bg-net-green text-net-bg text-[11px] font-bold rounded-md
                          hover:bg-emerald-400 transition-colors disabled:opacity-40"
                      >
                        Start
                      </button>
                    )}
                    {isPlaying && (
                      <>
                        <button
                          onClick={() => doAction(`${team.number}-loss`, () =>
                            fetch(`/api/admin/${team.number}/trigger-loss`, { method: 'POST' }).then(() => {}),
                          )}
                          disabled={busy[`${team.number}-loss`]}
                          className="h-7 px-2 border border-net-red/50 text-net-red text-[11px] font-bold rounded-md
                            hover:bg-net-red/10 transition-colors disabled:opacity-40"
                        >
                          Loss
                        </button>
                        <button
                          onClick={() => doAction(`${team.number}-next`, () =>
                            fetch(`/api/admin/${team.number}/next-round`, { method: 'POST' }).then(() => {}),
                          )}
                          disabled={busy[`${team.number}-next`]}
                          className="h-7 px-2 border border-net-cyan/50 text-net-cyan text-[11px] font-bold rounded-md
                            hover:bg-net-cyan/10 transition-colors disabled:opacity-40"
                        >
                          Next
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => doAction(`${team.number}-reset`, () =>
                        fetch(`/api/admin/${team.number}/reset`, { method: 'POST' }).then(() => {}),
                      )}
                      disabled={busy[`${team.number}-reset`]}
                      className="h-7 px-2 border border-net-wire text-slate-600 text-[11px] font-bold rounded-md
                        hover:border-net-red/50 hover:text-net-red transition-colors disabled:opacity-40"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
