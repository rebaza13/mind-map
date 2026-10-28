import { Component } from 'react'

// A crash anywhere below shows this card instead of a blank white page.
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error('Mindbloom crashed:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="boot crash">
        <div>
          <h2>Something went wrong</h2>
          <p>{String(this.state.error?.message || this.state.error)}</p>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
