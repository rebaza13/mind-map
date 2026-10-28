import { useState } from 'react'

const initials = (s = '?') => s.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
const hue = (s = '') => [...s].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360

// Google profile picture when there is one, coloured initials otherwise. `online` adds the live dot.
export default function Avatar({ name = '?', url, size = 26, online, title }) {
  const [bad, setBad] = useState(false)
  const showImg = url && !bad
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }} title={title ?? name}>
      {showImg ? (
        <img className="avatar" src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} style={{ width: size, height: size }} />
      ) : (
        <span className="avatar" style={{ width: size, height: size, background: `hsl(${hue(name)} 70% 90%)`, color: `hsl(${hue(name)} 55% 32%)`, fontSize: size * 0.4 }}>
          {initials(name)}
        </span>
      )}
      {online && <i className="live-dot" />}
    </span>
  )
}
