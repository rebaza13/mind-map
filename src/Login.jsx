import { useState } from 'react'
import { supabase, markLogin, OWNER_EMAIL, OWNER_HANDLE } from './supabase'

export default function Login() {
  const [id, setId] = useState(OWNER_HANDLE)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const handle = id.trim().toLowerCase()
    if (handle !== OWNER_HANDLE && handle !== OWNER_EMAIL) return setErr('This garden is private.')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password: pw })
    setBusy(false)
    if (error) return setErr('Wrong password.')
    markLogin()
  }

  return (
    <div className="login">
      <div className="aurora" />
      <svg className="login-web" viewBox="0 0 400 400" aria-hidden>
        <g stroke="currentColor" fill="none" strokeWidth="1.4">
          <path d="M200 200 C 120 160, 90 110, 60 70" />
          <path d="M200 200 C 280 150, 310 110, 350 80" />
          <path d="M200 200 C 140 260, 100 300, 70 340" />
          <path d="M200 200 C 270 270, 310 300, 340 330" />
        </g>
        <circle cx="200" cy="200" r="14" fill="#7c5cff" />
        <circle cx="60" cy="70" r="8" fill="#38e1c6" />
        <circle cx="350" cy="80" r="8" fill="#ff7ab8" />
        <circle cx="70" cy="340" r="8" fill="#ffc857" />
        <circle cx="340" cy="330" r="8" fill="#6bb6ff" />
      </svg>
      <form className="login-card" onSubmit={submit}>
        <h1>Mind<span>bloom</span></h1>
        <p>Your ideas, growing.</p>
        <label>
          Who goes there
          <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoFocus />
        </label>
        {err && <div className="err">{err}</div>}
        <button disabled={busy || !pw}>{busy ? 'Opening…' : 'Enter'}</button>
        <small>Stays signed in for 7 days.</small>
      </form>
    </div>
  )
}
