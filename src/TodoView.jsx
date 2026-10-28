import { useMemo, useState } from 'react'
import Icon from './Icon'
import { childrenMap, progress } from './tree'

const PRI = { high: '#ff5a6e', med: '#ffb020', low: '#2fc4a2' }
const initials = (s) => s.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const hue = (s) => [...s].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360
const today = () => new Date().toISOString().slice(0, 10)
const fmt = (d) => new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function Avatar({ name, size = 26 }) {
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, background: `hsl(${hue(name)} 70% 90%)`, color: `hsl(${hue(name)} 55% 32%)`, fontSize: size * 0.4 }}>
      {initials(name)}
    </span>
  )
}

export default function TodoView({ nodes, sel, onSelect, onToggle, onAddChild, onPatch }) {
  const [who, setWho] = useState('')
  const kids = useMemo(() => childrenMap(nodes), [nodes])
  const root = (kids.get(null) || [])[0]
  const branches = root ? kids.get(root.id) || [] : []
  const people = [...new Set(nodes.map((n) => n.assignee).filter(Boolean))].sort()
  const tasks = nodes.filter((n) => n.parent_id)
  const done = tasks.filter((n) => n.done).length

  // With a person filter on, show only their tasks plus the parents that lead to them.
  const show = useMemo(() => {
    if (!who) return null
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const ids = new Set()
    for (const n of nodes) if (n.assignee === who) for (let c = n; c; c = byId.get(c.parent_id)) ids.add(c.id)
    return ids
  }, [who, nodes])

  const ctx = { kids, nodes, sel, onSelect, onToggle, onAddChild, onPatch, people, show }

  return (
    <div className="todo">
      <div className="todo-hero">
        <div>
          <h1>{root?.title || 'Your tasks'}</h1>
          <p>{done} of {tasks.length} tasks done</p>
          <div className="hero-bar"><i style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="who-filter">
          <button className={!who ? 'on' : ''} onClick={() => setWho('')}>Everyone</button>
          {people.map((p) => (
            <button key={p} className={who === p ? 'on' : ''} onClick={() => setWho(who === p ? '' : p)}><Avatar name={p} size={20} /> {p}</button>
          ))}
        </div>
      </div>

      <div className="cards">
        {branches.filter((b) => !show || show.has(b.id)).map((b) => (
          <Card key={b.id} b={b} {...ctx} />
        ))}
        {!branches.length && <p className="muted">Nothing here yet. Add ideas on the map or in the bar below.</p>}
      </div>
    </div>
  )
}

function Ring({ done, total, color }) {
  const r = 17, c = 2 * Math.PI * r, p = total ? done / total : 0
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="ring">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(60,40,140,.12)" strokeWidth="5" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{Math.round(p * 100)}%</text>
    </svg>
  )
}

function Card({ b, kids, nodes, onAddChild, onToggle, onSelect, sel, onPatch, people, show }) {
  const [draft, setDraft] = useState('')
  const pr = progress(nodes, b.id)
  const items = kids.get(b.id) || []
  const submit = (e) => {
    e.preventDefault()
    if (draft.trim()) onAddChild(b.id, draft.trim())
    setDraft('')
  }
  return (
    <section className="card" style={{ '--c': b.color }}>
      <header onClick={() => onSelect(b.id)}>
        <div>
          <h2>{b.title}</h2>
          <small>{pr ? `${pr.done}/${pr.total} done` : 'No tasks yet'}</small>
        </div>
        <Ring done={pr?.done || 0} total={pr?.total || 0} color={b.color} />
      </header>
      <div className="card-body">
        {items.filter((t) => !show || show.has(t.id)).map((t) => (
          <Task key={t.id} n={t} {...{ kids, nodes, onToggle, onSelect, sel, onPatch, people, show }} />
        ))}
      </div>
      <form onSubmit={submit} className="card-add">
        <Icon name="plus" size={16} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task…" />
      </form>
    </section>
  )
}

function Task({ n, kids, nodes, onToggle, onSelect, sel, onPatch, people, show }) {
  const [editing, setEditing] = useState(false)
  const c = (kids.get(n.id) || []).filter((k) => !show || show.has(k.id))
  const overdue = n.due && !n.done && n.due < today()
  const finish = (v) => { setEditing(false); if (v.trim() !== (n.assignee || '')) onPatch(n.id, { assignee: v.trim() }) }
  return (
    <div className="task-wrap">
      <div className={`task ${n.done ? 'done' : ''} ${sel === n.id ? 'sel' : ''}`} style={{ '--c': n.color }} onClick={() => onSelect(n.id)}>
        <button className="tcheck" onClick={(e) => (e.stopPropagation(), onToggle(n.id))}>{n.done && <Icon name="check" size={13} />}</button>
        <div className="task-main">
          <span className="task-title">{n.title}</span>
          <div className="meta">
            {n.priority && <span className="pri" style={{ background: PRI[n.priority] }} title={`${n.priority} priority`} />}
            {n.due && <span className={`due ${overdue ? 'late' : ''}`}>{fmt(n.due)}</span>}
          </div>
        </div>
        {editing ? (
          <>
            <input className="assign-in" list={`ppl-${n.id}`} autoFocus defaultValue={n.assignee} placeholder="Who?" onClick={(e) => e.stopPropagation()}
              onBlur={(e) => finish(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
            <datalist id={`ppl-${n.id}`}>{people.map((p) => <option key={p} value={p} />)}</datalist>
          </>
        ) : (
          <button className={`assignee ${n.assignee ? '' : 'empty'}`} title={n.assignee || 'Assign someone'} onClick={(e) => (e.stopPropagation(), setEditing(true))}>
            {n.assignee ? <Avatar name={n.assignee} /> : <Icon name="plus" size={14} />}
          </button>
        )}
      </div>
      {c.length > 0 && (
        <div className="subtasks">
          {c.map((k) => <Task key={k.id} n={k} {...{ kids, nodes, onToggle, onSelect, sel, onPatch, people, show }} />)}
        </div>
      )}
    </div>
  )
}
