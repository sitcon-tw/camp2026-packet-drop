import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(
  req: Request,
  { params }: { params: { teamNumber: string } },
) {
  const { order } = await req.json() // number[] of slot IDs in new position order
  const teamNumber = parseInt(params.teamNumber)

  const team = await prisma.team.findUnique({ where: { number: teamNumber } })
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const note = await prisma.teamNote.findUnique({
    where: { teamId_round: { teamId: team.id, round: team.round } },
  })
  if (!note) return NextResponse.json({ error: 'No note' }, { status: 404 })

  await Promise.all(
    (order as number[]).map((slot, idx) =>
      prisma.noteFragment.updateMany({
        where: { noteId: note.id, slot },
        data: { position: idx },
      }),
    ),
  )

  return NextResponse.json({ ok: true })
}
