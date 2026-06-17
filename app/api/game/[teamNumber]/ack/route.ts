import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const { slot } = await req.json()
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({
    where: { number: teamNumber },
    include: { players: true },
  })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const allSlots = team.players.map((p: { slot: number }) => p.slot)

  // Atomic read-modify-write inside a transaction to prevent concurrent ACKs from overwriting each other
  const result = await prisma.$transaction(async (tx) => {
    const activeEvent = await tx.packetLossEvent.findFirst({
      where: { teamId: team.id, round: team.round, resolvedAt: null },
    })
    if (!activeEvent) return { error: 'No active event' }

    const ackSlots: number[] = JSON.parse(activeEvent.ackSlots)
    if (!ackSlots.includes(slot)) ackSlots.push(slot)

    const allAcked = allSlots.length > 0 && allSlots.every((s: number) => ackSlots.includes(s))

    await tx.packetLossEvent.update({
      where: { id: activeEvent.id },
      data: {
        ackSlots: JSON.stringify(ackSlots),
        ...(allAcked ? { resolvedAt: new Date() } : {}),
      },
    })

    return { ok: true, allAcked, ackSlots, totalPlayers: allSlots.length }
  })

  if ('error' in result) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
