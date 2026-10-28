import { useMemo, useState } from 'react'
import Icon from './Icon'
import Avatar from './Avatar'
import { childrenMap, progress } from './tree'

const PRI = { high: '#ff5a6e', med: '#ffb020', low: '#2fc4a2' }
const today = () => new Date().toISOString().slice(0, 10)
const fmt = (d) => new Date(d + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function TodoView({ nodes, sel, onSelect, onToggle, onAddChild, onPatch, members = [], viewers = {} }) {
  const [who, setWho] = useState('')
  const kids = useMemo(() => childrenMap(nodes), [nodes])
  const root = (kids.get(null) || [])[0]
  const branches = root ? kids.get(root.id) || [] : []
  const tasks = nodes.filter((n) => n.parent_id)
  const done = tasks.filter((n) => n.done).length
  const assigned = members.filter((m) => nodes.some((n) => n.assignee_id === m.user_id))

  // With a person filter on, show only their tasks plus the parents that lead to them.
  const show = useMemo(() => {
    if (!who) return null
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const ids = new Set()
    for (const n of nodes) if (n.assignee_id === who) for (let c = n; c; c = byId.get(c.parent_id)) ids.add(c.id)
    return ids
  }, [who, nodes])

  const ctx = { kids, nodes, sel, onSelect, onToggle, onAddChild, onPatch, members, viewers, show }

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
          {assigned.map((m) => (
            <button key={m.user_id} className={who === m.user_id ? 'on' : ''} onClick={() => setWho(who === m.user_id ? '' : m.user_id)}>
              <Avatar name={m.name || m.email} url={m.avatar_url} size={22} /> {(m.name || m.email).split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="cards">
        {branches.filter((b) => !show || show.has(b.id)).map((b) => <Card key={b.id} b={b} {...ctx} />)}
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

function Card({ b, kids, nodes, onAddChild, onSelect, ...rest }) {
  const [draft, setDraft] = useState('')
  const pr = progress(nodes, b.id)
  const items = kids.get(b.id) || []
  const { show } = rest
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
        {items.filter((t) => !show || show.has(t.id)).map((t) => <Task key={t.id} n={t} {...{ kids, nodes, onSelect, ...rest }} />)}
      </div>
      <form onSubmit={submit} className="card-add">
        <Icon name="plus" size={16} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task…" />
      </form>
    </section>
  )
}

function Task({ n, kids, nodes, onToggle, onSelect, sel, onPatch, members, viewers, show }) {
  const [picking, setPicking] = useState(false)
  const c = (kids.get(n.id) || []).filter((k) => !show || show.has(k.id))
  const overdue = n.due && !n.done && n.due < today()
  const owner = members.find((m) => m.user_id === n.assignee_id)
  const watching = viewers[n.id] || []
  const assign = (uid) => { setPicking(false); onPatch(n.id, { assignee_id: uid, assignee: '' }) }
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
        {watching.length > 0 && (
          <span className="watchers" title="Looking at this right now">
            {watching.map((u) => <Avatar key={u.id} name={u.name} url={u.avatar} size={20} />)}
          </span>
        )}
        <div className="assign-wrap">
          <button className={`assignee ${owner || n.assignee ? '' : 'empty'}`} title={owner?.name || n.assignee || 'Assign someone'} onClick={(e) => (e.stopPropagation(), setPicking(!picking))}>
            {owner ? <Avatar name={owner.name || owner.email} url={owner.avatar_url} size={28} /> : n.assignee ? <Avatar name={n.assignee} size={28} /> : <Icon name="plus" size={14} />}
          </button>
          {picking && (
            <>
              <div className="backdrop" onClick={(e) => (e.stopPropagation(), setPicking(false))} />
              <div className="picker" onClick={(e) => e.stopPropagation()}>
                {members.map((m) => (
                  <button key={m.user_id} className={m.user_id === n.assignee_id ? 'on' : ''} onClick={() => assign(m.user_id)}>
                    <Avatar name={m.name || m.email} url={m.avatar_url} size={24} /> {m.name || m.email}
                  </button>
                ))}
                {(n.assignee_id || n.assignee) && <button className="none" onClick={() => assign(null)}>Unassign</button>}
              </div>
            </>
          )}
        </div>
      </div>
      {c.length > 0 && (
        <div className="subtasks">
          {c.map((k) => <Task key={k.id} n={k} {...{ kids, nodes, onToggle, onSelect, sel, onPatch, members, viewers, show }} />)}
        </div>
      )}
    </div>
  )
}
