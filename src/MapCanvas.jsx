import { useEffect, useMemo, useRef, useState } from 'react'
import { NODE_H, descendants, nodeW, progress } from './tree'

export default function MapCanvas({ nodes, pos, sel, onSelect, onMove, onAddChild, onToggle }) {
  const wrap = useRef(null)
  const [view, setView] = useState({ x: 80, y: 0, k: 1 })
  const [drag, setDrag] = useState(null) // {ids, dx, dy}
  const gesture = useRef(null)

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  function at(id) {
    const p = pos.get(id) || { x: 0, y: 0 }
    return drag?.ids.has(id) ? { x: p.x + drag.dx, y: p.y + drag.dy } : p
  }

  function fit() {
    const el = wrap.current
    if (!el || !nodes.length) return
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const n of nodes) {
      const p = pos.get(n.id)
      if (!p) continue
      x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y)
      x2 = Math.max(x2, p.x + nodeW(n)); y2 = Math.max(y2, p.y + NODE_H)
    }
    const k = Math.min(1.2, (el.clientWidth - 120) / (x2 - x1 || 1), (el.clientHeight - 160) / (y2 - y1 || 1))
    setView({ k, x: (el.clientWidth - (x2 - x1) * k) / 2 - x1 * k, y: (el.clientHeight - (y2 - y1) * k) / 2 - y1 * k })
  }

  const firstId = nodes[0]?.id
  useEffect(fit, [firstId]) // refit when switching maps

  function onWheel(e) {
    const r = wrap.current.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    const k = Math.min(2.5, Math.max(0.25, view.k * (e.deltaY < 0 ? 1.1 : 0.9)))
    setView({ k, x: mx - ((mx - view.x) / view.k) * k, y: my - ((my - view.y) / view.k) * k })
  }

  function down(e, node) {
    e.stopPropagation()
    wrap.current.setPointerCapture(e.pointerId)
    gesture.current = node
      ? { type: 'node', node, sx: e.clientX, sy: e.clientY, moved: false }
      : { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
  }

  function move(e) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy
    if (g.type === 'pan') return (g.moved ||= Math.hypot(dx, dy) > 4), setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }))
    if (!g.moved && Math.hypot(dx, dy) < 5) return
    g.moved = true
    setDrag({ ids: new Set([g.node.id, ...descendants(nodes, g.node.id)]), dx: dx / view.k, dy: dy / view.k })
  }

  function up() {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.type === 'pan') return g.moved || onSelect(null)
    if (!g.moved) return onSelect(g.node.id)
    if (drag) onMove([...drag.ids].map((id) => ({ id, x: pos.get(id).x + drag.dx, y: pos.get(id).y + drag.dy })))
    setDrag(null)
  }

  return (
    <div className="canvas" ref={wrap} onWheel={onWheel} onPointerDown={(e) => down(e, null)} onPointerMove={move} onPointerUp={up}>
      <div className="canvas-inner" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="links">
          {nodes.filter((n) => n.parent_id && byId.has(n.parent_id)).map((n) => {
            const p = byId.get(n.parent_id)
            const a = at(p.id), b = at(n.id)
            const x1 = a.x + nodeW(p), y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2
            const c = Math.max(40, (x2 - x1) / 2)
            return <path key={n.id} d={`M${x1} ${y1} C${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`} stroke={n.color} className={n.done ? 'done' : ''} />
          })}
        </svg>
        {nodes.map((n) => {
          const p = at(n.id)
          const pr = progress(nodes, n.id)
          return (
            <div
              key={n.id}
              className={`node ${sel === n.id ? 'sel' : ''} ${n.done ? 'done' : ''} ${!n.parent_id ? 'root' : ''}`}
              style={{ left: p.x, top: p.y, width: nodeW(n), height: NODE_H, '--c': n.color }}
              onPointerDown={(e) => down(e, n)}
            >
              <button className="tick" title="Mark done" onPointerDown={(e) => e.stopPropagation()} onClick={() => onToggle(n.id)}>
                {n.done ? '✓' : ''}
              </button>
              <span className="label">{n.title}</span>
              {pr && <em>{pr.done}/{pr.total}</em>}
              {sel === n.id && (
                <button className="plus" title="Add subtask" onPointerDown={(e) => e.stopPropagation()} onClick={() => onAddChild(n.id)}>+</button>
              )}
            </div>
          )
        })}
      </div>
      <div className="zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => setView((v) => ({ ...v, k: Math.min(2.5, v.k * 1.2) }))}>＋</button>
        <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.2) }))}>－</button>
        <button onClick={fit}>Fit</button>
      </div>
    </div>
  )
}
