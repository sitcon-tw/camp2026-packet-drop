import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  _req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const teamNumber = parseInt(params.teamNumber)
  if (isNaN(teamNumber) || teamNumber < 1 || teamNumber > 6) {
    return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
  }

  const team = await prisma.team.upsert({
    where: { number: teamNumber },
    create: { number: teamNumber },
    update: {},
    include: { players: true },
  })

  if (team.status !== 'waiting') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }

  const taken = team.players.map((p: { slot: number }) => p.slot)
  const available = [1, 2, 3, 4, 5, 6].filter((s) => !taken.includes(s))

  if (available.length === 0) {
    return NextResponse.json({ error: 'Team is full' }, { status: 409 })
  }

  // Try each available slot in order — handles concurrent joins
  for (const slot of available) {
    try {
      await prisma.player.create({ data: { teamId: team.id, slot } })
      return NextResponse.json({ slot })
    } catch (e: unknown) {
      const err = e as { code?: string }
      if (err.code === 'P2002') continue  // slot race — try next
      throw e
    }
  }

  return NextResponse.json({ error: 'Team is full' }, { status: 409 })
}
