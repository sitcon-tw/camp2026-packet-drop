import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  const { teamNumber, slot } = await request.json()

  if (
    !teamNumber ||
    !slot ||
    teamNumber < 1 ||
    teamNumber > 6 ||
    slot < 1 ||
    slot > 6
  ) {
    return NextResponse.json({ error: 'Invalid team or slot' }, { status: 400 })
  }

  // Ensure team exists
  const team = await prisma.team.upsert({
    where: { number: teamNumber },
    create: { number: teamNumber },
    update: {},
  })

  if (team.status !== 'waiting') {
    return NextResponse.json({ error: 'Game already started' }, { status: 409 })
  }

  // Try to take the slot
  try {
    await prisma.player.create({ data: { teamId: team.id, slot } })
  } catch (e: unknown) {
    const err = e as { code?: string }
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Slot already taken' }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({ ok: true, teamNumber, slot })
}
