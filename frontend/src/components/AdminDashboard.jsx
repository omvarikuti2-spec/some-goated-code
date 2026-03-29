import { useState, useEffect } from 'react'
import { apiUrl } from '../apiConfig'

function AdminDashboard() {
  const [dashboard, setDashboard] = useState({
    stats: {
      total_accounts: 0,
      active_api_keys: 0,
      total_trades: 0,
      total_cash_balance: 0
    },
    recent_accounts: [],
    api_usage: []
  })
  const [accounts, setAccounts] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [newAccount, setNewAccount] = useState({ name: '', initial_balance: 10000 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchDashboard()
    fetchAccounts()
    const interval = setInterval(() => {
      fetchDashboard()
      fetchAccounts()
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const fetchDashboard = async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/dashboard'))
      if (res.ok) {
        const data = await res.json()
        setDashboard(data)
      }
    } catch (e) {
      console.error('Failed to fetch dashboard:', e)
    }
  }

  const fetchAccounts = async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/accounts'))
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts || [])
      }
    } catch (e) {
      console.error('Failed to fetch accounts:', e)
    }
  }

  const createAccount = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/v1/accounts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount)
      })
      
      if (res.ok) {
        const data = await res.json()
        const kid = data.api_key?.key_id
        const sec = data.api_key?.secret_key
        alert(`Account created!\n\nAccount Number: ${data.account_number}\nAPI Key: ${kid}\nSecret: ${sec}\n\nSave the secret — it is only shown once.`)
        setNewAccount({ name: '', initial_balance: 10000 })
        fetchDashboard()
      } else {
        const err = await res.json()
        alert('Error: ' + (err.detail || 'Failed to create account'))
      }
    } catch (e) {
      alert('Error: ' + e.message)
    }
    setLoading(false)
  }

  return (
    <div className="admin-dashboard">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🏦 Crypto Trading API Service</h3>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Alpaca-style API for Crypto
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-nav" style={{ 
          display: 'flex', 
          borderBottom: '1px solid var(--glass-border)',
          padding: '0 1rem'
        }}>
          {['overview', 'accounts', 'api-docs', 'create'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="tab-btn"
              style={{
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                color: activeTab === tab ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--accent-primary)' : 'transparent'}`,
                cursor: 'pointer',
                fontWeight: '600',
                textTransform: 'capitalize'
              }}
            >
              {tab === 'api-docs' ? 'API Docs' : tab}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="card-body">
            {/* Stats Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <div className="stat-card" style={{ 
                background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.2) 0%, rgba(108, 92, 231, 0.05) 100%)',
                padding: '1.5rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px solid rgba(108, 92, 231, 0.3)'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--accent-primary)' }}>
                  {dashboard.stats.total_accounts}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Total Accounts
                </div>
              </div>
              
              <div className="stat-card" style={{ 
                background: 'linear-gradient(135deg, rgba(0, 206, 201, 0.2) 0%, rgba(0, 206, 201, 0.05) 100%)',
                padding: '1.5rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px solid rgba(0, 206, 201, 0.3)'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--accent-teal)' }}>
                  {dashboard.stats.active_api_keys}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Active API Keys
                </div>
              </div>
              
              <div className="stat-card" style={{ 
                background: 'linear-gradient(135deg, rgba(253, 121, 168, 0.2) 0%, rgba(253, 121, 168, 0.05) 100%)',
                padding: '1.5rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px solid rgba(253, 121, 168, 0.3)'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--accent-secondary)' }}>
                  {dashboard.stats.total_trades}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Total Trades
                </div>
              </div>
              
              <div className="stat-card" style={{ 
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)',
                padding: '1.5rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--accent-green)' }}>
                  ${dashboard.stats.total_cash_balance?.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Total Cash
                </div>
              </div>
            </div>

            {/* Recent Accounts */}
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Recent Accounts
            </h4>
            {dashboard.recent_accounts.length > 0 ? (
              <div className="accounts-list">
                {dashboard.recent_accounts.map(account => (
                  <div key={account.id} className="holding-item" style={{ marginBottom: '0.5rem' }}>
                    <div>
                      <div className="holding-symbol">{account.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {account.account_number} • {account.api_keys} API keys
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600' }}>
                        ${account.balance?.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(account.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">👤</div>
                <div>No accounts yet. Create one to get started!</div>
              </div>
            )}

            {/* API Usage */}
            {dashboard.api_usage.length > 0 && (
              <>
                <h4 style={{ margin: '1.5rem 0 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Top API Endpoints (24h)
                </h4>
                <div className="api-usage-list">
                  {dashboard.api_usage.map((usage, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '0.5rem 0',
                      borderBottom: idx < dashboard.api_usage.length - 1 ? '1px solid var(--glass-border)' : 'none'
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                        {usage.endpoint}
                      </span>
                      <span style={{ 
                        background: 'var(--glass-bg)', 
                        padding: '0.125rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem'
                      }}>
                        {usage.calls} calls
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              All paper accounts
            </h4>
            {accounts.length > 0 ? (
              <div className="accounts-list">
                {accounts.map((account) => (
                  <div key={account.id} className="holding-item" style={{ marginBottom: '0.5rem' }}>
                    <div>
                      <div className="holding-symbol">{account.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {account.account_number} · id {account.id}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600' }}>
                        ${account.balance_usd?.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        opened {new Date(account.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">🔐</div>
                <div>No accounts loaded. Create one in the Create tab or wait for the API.</div>
              </div>
            )}
          </div>
        )}

        {/* API Docs Tab */}
        {activeTab === 'api-docs' && (
          <div className="card-body">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                🔑 Authentication
              </h4>
              <div style={{ 
                background: 'var(--glass-bg)', 
                padding: '1rem', 
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.5rem',
                overflow: 'auto'
              }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  Header: Authorization: KEY_ID:SECRET_KEY
                </div>
                <code style={{ color: 'var(--accent-green)' }}>
                  curl -H "Authorization: PK123...:SK456..." /v1/account
                </code>
              </div>

              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                📚 Endpoints
              </h4>
              
              {[
                { method: 'POST', path: '/v1/accounts', desc: 'Create new paper account' },
                { method: 'GET', path: '/v1/account', desc: 'Get account details' },
                { method: 'GET', path: '/v1/positions', desc: 'Get open positions' },
                { method: 'POST', path: '/v1/orders', desc: 'Create order' },
                { method: 'GET', path: '/v1/orders', desc: 'List orders' },
                { method: 'DELETE', path: '/v1/orders/{id}', desc: 'Cancel order' },
                { method: 'GET', path: '/v1/account/activities', desc: 'Get activities' },
                { method: 'GET', path: '/v1/api-keys', desc: 'List API keys' }
              ].map((ep, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  gap: '1rem',
                  padding: '0.75rem 0',
                  borderBottom: '1px solid var(--glass-border)',
                  alignItems: 'center'
                }}>
                  <span style={{ 
                    color: ep.method === 'GET' ? 'var(--accent-blue)' : 
                           ep.method === 'POST' ? 'var(--accent-green)' : 'var(--accent-red)',
                    fontWeight: '600',
                    minWidth: '60px'
                  }}>
                    {ep.method}
                  </span>
                  <code style={{ color: 'var(--text-primary)' }}>{ep.path}</code>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                    {ep.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Account Tab */}
        {activeTab === 'create' && (
          <div className="card-body">
            <form onSubmit={createAccount}>
              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Account Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                  placeholder="My Trading Account"
                  required
                />
              </div>

              <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                <label className="input-label">Initial Balance ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={newAccount.initial_balance}
                  onChange={(e) => setNewAccount({...newAccount, initial_balance: parseFloat(e.target.value)})}
                  min="1000"
                  max="1000000"
                  step="1000"
                  required
                />
              </div>

              <button
                type="submit"
                className="execute-btn buy"
                disabled={loading || !newAccount.name}
                style={{ width: '100%' }}
              >
                {loading ? 'Creating...' : '➕ Create Paper Account'}
              </button>

              <div style={{ 
                marginTop: '1rem',
                padding: '1rem',
                background: 'rgba(253, 121, 168, 0.1)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(253, 121, 168, 0.3)',
                fontSize: '0.875rem'
              }}>
                <strong>⚠️ Important:</strong> After creation, you'll receive an API key and secret. 
                <strong>Save the secret immediately</strong> - it's only shown once!
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard
