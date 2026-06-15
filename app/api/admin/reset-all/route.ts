import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST() {
  // Delete in FK order: fragments → notes → events → players → reset teams
  await prisma.noteFragment.deleteMany()
  await prisma.teamNote.deleteMany()
  await prisma.packetLossEvent.deleteMany()
  await prisma.player.deleteMany()
  await prisma.team.updateMany({
    data: { status: 'waiting', round: 0, startedAt: null },
  })

  return NextResponse.json({ ok: true })
}
