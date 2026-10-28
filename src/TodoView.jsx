import { useState } from 'react'
import { childrenMap, progress } from './tree'

export default function TodoView({ nodes, sel, onSelect, onToggle, onAddChild, onRename }) {
  const kids = childrenMap(nodes)
  const roots = kids.get(null) || []
  return (
    <div className="todo">
      {roots.map((r) => (
        <Row key={r.id} n={r} depth={0} kids={kids} nodes={nodes} {...{ sel, onSelect, onToggle, onAddChild, onRename }} />
      ))}
    </div>
  )
}

function Row({ n, depth, kids, nodes, sel, onSelect, onToggle, onAddChild, onRename }) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const c = kids.get(n.id) || []
  const pr = progress(nodes, n.id)
  const submit = (e) => {
    e.preventDefault()
    if (draft.trim()) onAddChild(n.id, draft.trim())
    setDraft('')
  }
  return (
    <div className="trow" style={{ '--c': n.color }}>
      <div className={`trow-head ${sel === n.id ? 'sel' : ''}`} onClick={() => onSelect(n.id)}>
        <button className={`check ${n.done ? 'on' : ''}`} onClick={(e) => (e.stopPropagation(), onToggle(n.id))}>{n.done ? '✓' : ''}</button>
        <span className={n.done ? 'strike' : ''}>{n.title}</span>
        {pr && (
          <span className="pbar"><i style={{ width: `${(pr.done / pr.total) * 100}%` }} /></span>
        )}
        <button className="mini" onClick={(e) => (e.stopPropagation(), setAdding(!adding))}>＋ subtask</button>
      </div>
      {adding && (
        <form onSubmit={submit} className="trow-add">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New subtask, press Enter" />
        </form>
      )}
      {c.length > 0 && (
        <div className="tkids">
          {c.map((k) => <Row key={k.id} n={k} depth={depth + 1} kids={kids} nodes={nodes} {...{ sel, onSelect, onToggle, onAddChild, onRename }} />)}
        </div>
      )}
    </div>
  )
}
