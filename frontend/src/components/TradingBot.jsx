import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../apiConfig'

function TradingBot() {
  const [status, setStatus] = useState({
    status: 'stopped',
    config: null,
    active_positions: {},
    stats: { total_trades: 0, profitable_trades: 0, total_pnl: 0 },
    price_cache: {}
  })
  const [strategies, setStrategies] = useState([])
  const [trades, setTrades] = useState([])
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('control') // control, trades, signals
  
  // Bot configuration
  const [config, setConfig] = useState({
    strategy: 'rsi',
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN'],
    trade_amount: 100,
    max_positions: 5,
    stop_loss_percent: 5,
    take_profit_percent: 10,
    interval_seconds: 60
  })

  const statusRef = useRef(status.status)
  useEffect(() => {
    statusRef.current = status.status
  }, [status.status])

  useEffect(() => {
    fetchStatus()
    fetchStrategies()

    const interval = setInterval(() => {
      fetchStatus()
      if (statusRef.current === 'running') {
        fetchTrades()
        fetchSignals()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const fetchStatus = async () => {
    try {
      const res = await fetch(apiUrl('/api/bot/status'))
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch (e) {
      console.error('Failed to fetch bot status:', e)
    }
  }

  const fetchStrategies = async () => {
    try {
      const res = await fetch(apiUrl('/api/bot/strategies'))
      if (res.ok) {
        const data = await res.json()
        setStrategies(data.strategies)
      }
    } catch (e) {
      console.error('Failed to fetch strategies:', e)
    }
  }

  const fetchTrades = async () => {
    try {
      const res = await fetch(apiUrl('/api/bot/trades?limit=20'))
      if (res.ok) {
        const data = await res.json()
        setTrades(data.trades)
      }
    } catch (e) {
      console.error('Failed to fetch trades:', e)
    }
  }

  const fetchSignals = async () => {
    try {
      const res = await fetch(apiUrl('/api/bot/signals?limit=20'))
      if (res.ok) {
        const data = await res.json()
        setSignals(data.signals)
      }
    } catch (e) {
      console.error('Failed to fetch signals:', e)
    }
  }

  const startBot = async () => {
    setLoading(true)
    try {
      // Configure first
      await fetch(apiUrl('/api/bot/configure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      
      // Then start
      const res = await fetch(apiUrl('/api/bot/start'), { method: 'POST' })
      if (res.ok) {
        await fetchStatus()
        await fetchTrades()
        await fetchSignals()
      }
    } catch (e) {
      console.error('Failed to start bot:', e)
    }
    setLoading(false)
  }

  const stopBot = async () => {
    setLoading(true)
    try {
      await fetch(apiUrl('/api/bot/stop'), { method: 'POST' })
      await fetchStatus()
    } catch (e) {
      console.error('Failed to stop bot:', e)
    }
    setLoading(false)
  }

  const pauseBot = async () => {
    try {
      await fetch(apiUrl('/api/bot/pause'), { method: 'POST' })
      await fetchStatus()
    } catch (e) {
      console.error('Failed to pause bot:', e)
    }
  }

  const resumeBot = async () => {
    try {
      await fetch(apiUrl('/api/bot/resume'), { method: 'POST' })
      await fetchStatus()
    } catch (e) {
      console.error('Failed to resume bot:', e)
    }
  }

  const handleSymbolToggle = (symbol) => {
    setConfig(prev => {
      const symbols = prev.symbols.includes(symbol)
        ? prev.symbols.filter(s => s !== symbol)
        : [...prev.symbols, symbol]
      return { ...prev, symbols }
    })
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return '#10b981'
      case 'paused': return '#f59e0b'
      case 'stopped': return '#ef4444'
      default: return '#6b7280'
    }
  }

  return (
    <div className="bot-panel">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🤖 Trading Bot Portal</h3>
          <div className="bot-status-badge" style={{ 
            backgroundColor: getStatusColor(status.status),
            color: 'white',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: '600',
            textTransform: 'uppercase'
          }}>
            {status.status}
          </div>
        </div>
        
        {/* Bot Stats */}
        <div className="bot-stats-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: '1rem',
          padding: '1rem',
          borderBottom: '1px solid var(--glass-border)'
        }}>
          <div className="stat-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Total Trades
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              {status.stats.total_trades}
            </div>
          </div>
          <div className="stat-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Profitable
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-green)' }}>
              {status.stats.profitable_trades}
            </div>
          </div>
          <div className="stat-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Total P&L
            </div>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: '700', 
              color: status.stats.total_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
            }}>
              {status.stats.total_pnl >= 0 ? '+' : ''}
              ${status.stats.total_pnl.toFixed(2)}
            </div>
          </div>
          <div className="stat-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              Active Positions
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-primary)' }}>
              {Object.keys(status.active_positions).length}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-nav" style={{ 
          display: 'flex', 
          borderBottom: '1px solid var(--glass-border)',
          padding: '0 1rem'
        }}>
          {['control', 'trades', 'signals'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
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
              {tab}
            </button>
          ))}
        </div>

        {/* Control Tab */}
        {activeTab === 'control' && (
          <div className="card-body">
            {/* Control Buttons */}
            <div className="bot-controls" style={{ 
              display: 'flex', 
              gap: '0.75rem', 
              marginBottom: '1.5rem',
              flexWrap: 'wrap'
            }}>
              {status.status === 'stopped' && (
                <button 
                  onClick={startBot} 
                  disabled={loading}
                  className="execute-btn buy"
                  style={{ flex: 1, minWidth: '120px' }}
                >
                  {loading ? 'Starting...' : '▶️ Start Bot'}
                </button>
              )}
              {status.status === 'running' && (
                <>
                  <button 
                    onClick={pauseBot}
                    className="execute-btn"
                    style={{ 
                      flex: 1, 
                      minWidth: '120px',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                    }}
                  >
                    ⏸️ Pause
                  </button>
                  <button 
                    onClick={stopBot}
                    disabled={loading}
                    className="execute-btn sell"
                    style={{ flex: 1, minWidth: '120px' }}
                  >
                    ⏹️ Stop
                  </button>
                </>
              )}
              {status.status === 'paused' && (
                <>
                  <button 
                    onClick={resumeBot}
                    className="execute-btn buy"
                    style={{ flex: 1, minWidth: '120px' }}
                  >
                    ▶️ Resume
                  </button>
                  <button 
                    onClick={stopBot}
                    disabled={loading}
                    className="execute-btn sell"
                    style={{ flex: 1, minWidth: '120px' }}
                  >
                    ⏹️ Stop
                  </button>
                </>
              )}
            </div>

            {/* Strategy Selection */}
            <div className="input-group" style={{ marginBottom: '1rem' }}>
              <label className="input-label">Strategy</label>
              <select 
                className="input-field"
                value={config.strategy}
                onChange={(e) => setConfig({...config, strategy: e.target.value})}
                disabled={status.status === 'running'}
              >
                {strategies.length === 0 ? (
                  <option value="rsi">Loading strategies…</option>
                ) : (
                  strategies.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                )}
              </select>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {strategies.find(s => s.id === config.strategy)?.description}
              </div>
            </div>

            {/* Symbol Selection */}
            <div className="input-group" style={{ marginBottom: '1rem' }}>
              <label className="input-label">Trade Symbols</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                {['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN'].map(symbol => (
                  <button
                    key={symbol}
                    onClick={() => handleSymbolToggle(symbol)}
                    disabled={status.status === 'running'}
                    className={`symbol-btn ${config.symbols.includes(symbol) ? 'active' : ''}`}
                    style={{
                      background: config.symbols.includes(symbol) 
                        ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                        : 'var(--glass-bg)',
                      color: config.symbols.includes(symbol) ? 'white' : 'var(--text-secondary)'
                    }}
                  >
                    {symbol.replace('USDT', '')}
                  </button>
                ))}
              </div>
            </div>

            {/* Settings Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="input-label">Bot tick interval (seconds)</label>
                <input
                  type="number"
                  className="input-field"
                  value={config.interval_seconds}
                  onChange={(e) => setConfig({...config, interval_seconds: parseInt(e.target.value, 10) || 60})}
                  disabled={status.status === 'running'}
                  min={5}
                  max={3600}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Trade Amount ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={config.trade_amount}
                  onChange={(e) => setConfig({...config, trade_amount: parseFloat(e.target.value)})}
                  disabled={status.status === 'running'}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Max Positions</label>
                <input
                  type="number"
                  className="input-field"
                  value={config.max_positions}
                  onChange={(e) => setConfig({...config, max_positions: parseInt(e.target.value)})}
                  disabled={status.status === 'running'}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Stop Loss (%)</label>
                <input
                  type="number"
                  className="input-field"
                  value={config.stop_loss_percent}
                  onChange={(e) => setConfig({...config, stop_loss_percent: parseFloat(e.target.value)})}
                  disabled={status.status === 'running'}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Take Profit (%)</label>
                <input
                  type="number"
                  className="input-field"
                  value={config.take_profit_percent}
                  onChange={(e) => setConfig({...config, take_profit_percent: parseFloat(e.target.value)})}
                  disabled={status.status === 'running'}
                />
              </div>
            </div>

            {/* Active Positions */}
            {Object.keys(status.active_positions).length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Active Positions
                </h4>
                {Object.entries(status.active_positions).map(([symbol, position]) => (
                  <div 
                    key={symbol}
                    className="holding-item"
                    style={{ marginBottom: '0.5rem' }}
                  >
                    <div>
                      <div className="holding-symbol">{symbol.replace('USDT', '')}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Entry: ${position.entry_price.toFixed(2)}
                      </div>
                    </div>
                    <div className="holding-amount">{position.amount.toFixed(6)}</div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="holding-pnl">
                        ${((status.price_cache[symbol] - position.entry_price) * position.amount).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Current: ${status.price_cache[symbol]?.toFixed(2) || '--'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Trades Tab */}
        {activeTab === 'trades' && (
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Recent Bot Trades
            </h4>
            {trades.length > 0 ? (
              <div className="trades-list">
                {trades.map((trade, idx) => (
                  <div key={idx} className="trade-item">
                    <div className="trade-header">
                      <span className={`trade-side ${trade.side}`}>
                        {trade.side.toUpperCase()}
                      </span>
                      <span className="trade-symbol">{trade.symbol.replace('USDT', '')}</span>
                      <span className="trade-strategy" style={{ 
                        fontSize: '0.75rem', 
                        color: 'var(--text-secondary)',
                        background: 'var(--glass-bg)',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '0.25rem'
                      }}>
                        {trade.strategy}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {trade.amount.toFixed(6)} @ ${trade.price.toFixed(2)} | {trade.reason}
                    </div>
                    {trade.pnl !== 0 && (
                      <div className={`trade-pnl ${trade.pnl > 0 ? 'positive' : 'negative'}`}>
                        {trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                      </div>
                    )}
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      {new Date(trade.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">🤖</div>
                <div>No bot trades yet. Start the bot to begin automated trading!</div>
              </div>
            )}
          </div>
        )}

        {/* Signals Tab */}
        {activeTab === 'signals' && (
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Recent Signals
            </h4>
            {signals.length > 0 ? (
              <div className="trades-list">
                {signals.map((signal, idx) => (
                  <div key={idx} className="trade-item">
                    <div className="trade-header">
                      <span className={`trade-side ${signal.side === 'hold' ? 'hold' : signal.side}`}>
                        {String(signal.side).toUpperCase()}
                      </span>
                      <span className="trade-symbol">{signal.symbol.replace('USDT', '')}</span>
                      <span style={{ 
                        fontSize: '0.75rem',
                        color: signal.confidence > 0.7 ? 'var(--accent-green)' : 'var(--text-secondary)'
                      }}>
                        {(signal.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {signal.strategy} | {signal.reason}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      ${signal.price.toFixed(2)} | {new Date(signal.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <div>No signals generated yet. Start the bot to see trading signals!</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TradingBot
