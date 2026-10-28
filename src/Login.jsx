import { useState } from 'react'
import { supabase, markLogin, OWNER_EMAIL, OWNER_HANDLE } from './supabase'

export default function Login() {
  const [showPw, setShowPw] = useState(false)
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function google() {
    setErr('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setErr(error.message)
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const handle = id.trim().toLowerCase()
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: handle === OWNER_HANDLE ? OWNER_EMAIL : handle, password: pw })
    setBusy(false)
    if (error) return setErr('Wrong email or password.')
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

        <button type="button" className="google-btn" onClick={google}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.5 17.6 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
            <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.4 0-11.7-4-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Continue with Google
        </button>

        {showPw ? (
          <>
            <label>
              Email or username
              <input value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus />
            </label>
            <label>
              Password
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            </label>
            <button disabled={busy || !pw || !id}>{busy ? 'Opening…' : 'Sign in'}</button>
          </>
        ) : (
          <button type="button" className="link-btn" onClick={() => setShowPw(true)}>Use a password instead</button>
        )}
        {err && <div className="err">{err}</div>}
        <small>Stays signed in for 7 days.</small>
      </form>
    </div>
  )
}
