'use client'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export type NoteFragData = {
  slot: number
  content: string
  isCorrupted: boolean
  position: number
}

function DragDots() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="3"  r="1.4"/>
      <circle cx="7" cy="3"  r="1.4"/>
      <circle cx="3" cy="8"  r="1.4"/>
      <circle cx="7" cy="8"  r="1.4"/>
      <circle cx="3" cy="13" r="1.4"/>
      <circle cx="7" cy="13" r="1.4"/>
    </svg>
  )
}

function SortableFragment({ frag }: { frag: NoteFragData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: frag.slot })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: 'relative' as const,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 px-3 py-3 transition-colors duration-100
        ${frag.isCorrupted ? 'border-l-2 border-net-red/60' : 'border-l-2 border-transparent'}
        ${isDragging ? 'bg-net-raised' : 'hover:bg-net-raised/40'}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 mt-0.5 text-slate-700 hover:text-slate-500 cursor-grab
          active:cursor-grabbing touch-none select-none transition-colors"
        aria-label="drag to reorder"
      >
        <DragDots />
      </button>

      {/* Slot badge */}
      <span
        className={`shrink-0 mt-[1px] text-[10px] font-mono font-bold px-1.5 py-0.5 rounded
          ${frag.isCorrupted
            ? 'bg-net-red/10 text-net-red/80'
            : 'bg-net-wire/60 text-slate-400'
          }`}
      >
        #{frag.slot}
      </span>

      {/* Content */}
      <pre
        className={`flex-1 text-sm leading-relaxed whitespace-pre-wrap min-w-0
          ${frag.isCorrupted ? 'text-net-red/55 font-mono' : 'text-slate-200'}`}
      >
        {frag.content}
      </pre>

      {frag.isCorrupted && (
        <span className="shrink-0 text-[9px] font-mono text-net-red/50 mt-0.5 uppercase">
          ERR
        </span>
      )}
    </div>
  )
}

type Props = {
  fragments: NoteFragData[]
  onSort: (newOrder: number[]) => void
}

export default function SortableNotes({ fragments, onSort }: Props) {
  const sorted = [...fragments].sort((a, b) => a.position - b.position)

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sorted.findIndex((f) => f.slot === active.id)
    const newIndex = sorted.findIndex((f) => f.slot === over.id)
    const reordered = arrayMove(sorted, oldIndex, newIndex)
    onSort(reordered.map((f) => f.slot))
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-net-wire/60 px-5 py-8 text-center">
        <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-1">
          No fragments yet
        </div>
        <div className="text-xs text-slate-700">
          按上方「Import to Shared Notes」加入你的封包
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-net-wire bg-net-surface overflow-hidden divide-y divide-net-wire/50">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sorted.map((f) => f.slot)} strategy={verticalListSortingStrategy}>
          {sorted.map((frag) => (
            <SortableFragment key={frag.slot} frag={frag} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
