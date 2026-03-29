import { useState, useEffect } from 'react'
import { apiUrl } from '../apiConfig'

function AlpacaSettings() {
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://paper-api.alpaca.markets')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      const res = await fetch(apiUrl('/api/alpaca/status'))
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        if (!data.connected) {
          // Try to auto-detect
          const detectRes = await fetch(apiUrl('/api/alpaca/detect'))
          if (detectRes.ok) {
            const detectData = await detectRes.json()
            if (detectData.detected) {
              setMessage({ type: 'info', text: 'Alpaca environment detected! Click "Save" to enable.' })
              setShowForm(true)
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch Alpaca status:', e)
    }
  }

  const handleDetect = async () => {
    try {
      const res = await fetch(apiUrl('/api/alpaca/detect'))
      if (res.ok) {
        const data = await res.json()
        if (data.detected) {
          setMessage({ type: 'success', text: `Auto-detected! API Key: ${data.api_key_hint}` })
          setBaseUrl(data.base_url)
          setShowForm(true)
        } else {
          setMessage({ type: 'error', text: 'No Alpaca credentials detected in environment.' })
        }
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Detection failed: ' + e.message })
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!apiKey || !secretKey) {
      setMessage({ type: 'error', text: 'API Key and Secret Key are required.' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/alpaca/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          secret_key: secretKey,
          base_url: baseUrl,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: `✓ Credentials saved: ${data.api_key_hint}` })
        setShowForm(false)
        setApiKey('')
        setSecretKey('')
        setTimeout(fetchStatus, 1000)
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Save failed.' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Save error: ' + e.message })
    }
    setLoading(false)
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header">
        <h3 className="card-title">🦙 Alpaca Connection</h3>
      </div>
      <div className="card-body">
        {status && (
          <div style={{ marginBottom: '1rem' }}>
            {status.connected ? (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                <div style={{ color: 'var(--accent-green)', fontWeight: '600' }}>✓ Connected</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Source: {status.source} | API Key: {status.api_key} | URL: {status.base_url}
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                <div style={{ color: 'var(--accent-red)', fontWeight: '600' }}>✗ Not Connected</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Save your Alpaca credentials to enable trading.
                </div>
              </div>
            )}
          </div>
        )}

        {message && (
          <div
            style={{
              background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' :
                         message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' :
                         'rgba(59, 130, 246, 0.1)',
              color: message.type === 'success' ? 'var(--accent-green)' :
                     message.type === 'error' ? 'var(--accent-red)' :
                     'var(--accent-primary)',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}
          >
            {message.text}
          </div>
        )}

        {!showForm ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleDetect}
              className="execute-btn buy"
              style={{ flex: 1, minWidth: '150px' }}
            >
              🔍 Auto-Detect
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="execute-btn"
              style={{ flex: 1, minWidth: '150px', background: 'var(--glass-bg)', color: 'var(--text-primary)' }}
            >
              ✏️ Enter Manually
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="input-group" style={{ marginBottom: '0.75rem' }}>
              <label className="input-label">API Key ID</label>
              <input
                type="password"
                className="input-field"
                placeholder="APCA_API_KEY_ID or APCA..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="input-group" style={{ marginBottom: '0.75rem' }}>
              <label className="input-label">Secret Key</label>
              <input
                type="password"
                className="input-field"
                placeholder="APCA_API_SECRET_KEY or sk_..."
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
            </div>

            <div className="input-group" style={{ marginBottom: '0.75rem' }}>
              <label className="input-label">Base URL</label>
              <input
                type="text"
                className="input-field"
                placeholder="https://paper-api.alpaca.markets"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Use paper-api for paper trading, api.alpaca.markets for live (requires funded account)
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="execute-btn buy" disabled={loading} style={{ flex: 1 }}>
                {loading ? 'Saving...' : '💾 Save & Connect'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="execute-btn"
                style={{ flex: 1, background: 'var(--glass-bg)', color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default AlpacaSettings
