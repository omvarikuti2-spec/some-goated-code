import { useState, useEffect, useCallback, useRef } from 'react'
import PriceChart from './components/PriceChart'
import TradingPanel from './components/TradingPanel'
import Portfolio from './components/Portfolio'
import MarketOverview from './components/MarketOverview'
import TradeHistory from './components/TradeHistory'
import TradingBot from './components/TradingBot'
import AdminDashboard from './components/AdminDashboard'
import AlpacaSettings from './components/AlpacaSettings'
import { apiUrl, wsUrl } from './apiConfig'

function App() {
  const [prices, setPrices] = useState({})
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL')
  const [portfolio, setPortfolio] = useState(null)
  const [trades, setTrades] = useState([])
  const [connected, setConnected] = useState(false)
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('manual') // 'manual', 'bot', 'admin', or 'settings'
  const wsRef = useRef(null)

  // Fetch portfolio data
  const fetchPortfolio = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/portfolio/1'))
      if (response.ok) {
        const data = await response.json()
        setPortfolio(data)
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error)
    }
  }, [])

  // Fetch trade history
  const fetchTrades = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/trades/1'))
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades)
      }
    } catch (error) {
      console.error('Error fetching trades:', error)
    }
  }, [])

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Execute trade
  const executeTrade = async (side, amount, symbols) => {
    try {
      const tradingSymbols = symbols || [selectedSymbol]
      const promises = tradingSymbols.map(sym => 
        fetch(apiUrl('/api/trade'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: 1,
            symbol: sym,
            side,
            amount
          })
        })
      )

      const responses = await Promise.all(promises)
      const results = await Promise.all(responses.map(r => r.json()))

      if (responses.every(r => r.ok)) {
        const avgPrice = (results.reduce((sum, r) => sum + r.price, 0) / results.length).toFixed(2)
        showToast(`✓ ${side.toUpperCase()} ${tradingSymbols.length} stocks @ avg $${avgPrice}`)
        fetchPortfolio()
        fetchTrades()
        return true
      } else {
        const error = results.find(r => r.detail)
        showToast(`✗ ${error?.detail || 'Trade failed'}`, 'error')
        return false
      }
    } catch (error) {
      showToast(`✗ ${error.message}`, 'error')
      return false
    }
  }

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(wsUrl('/ws'))
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        ws.send(JSON.stringify({ action: 'subscribe', symbol: selectedSymbol }))
      }

      ws.onclose = () => {
        setConnected(false)
        setTimeout(connect, 3000)
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'price_update') {
          setPrices(prev => ({ ...prev, [data.symbol]: data.price }))
        } else if (data.type === 'initial') {
          setPrices(data.prices)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    }

    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [selectedSymbol])

  // Initial data fetch
  useEffect(() => {
    fetchPortfolio()
    fetchTrades()
    
    const interval = setInterval(() => {
      fetchPortfolio()
    }, 5000)

    return () => clearInterval(interval)
  }, [fetchPortfolio, fetchTrades])

  const currentPrice = prices[selectedSymbol] || 0

  return (
    <div className="app">
      <header className="header">
        <div className="logo">Crypto Paper Trader</div>
        <div className="connection-status">
          <span className={`status-dot ${connected ? '' : 'disconnected'}`}></span>
          {connected ? 'Live' : 'Connecting...'}
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="main-tabs" style={{ 
        display: 'flex', 
        padding: '0.75rem 1.5rem 0',
        borderBottom: '1px solid var(--glass-border)',
        gap: '0.5rem'
      }}>
        <button
          onClick={() => setActiveTab('manual')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'manual' ? 'var(--glass-bg)' : 'transparent',
            border: '1px solid var(--glass-border)',
            borderBottom: activeTab === 'manual' ? 'none' : '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
            color: activeTab === 'manual' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          📊 Manual Trading
        </button>
        <button
          onClick={() => setActiveTab('bot')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'bot' ? 'var(--glass-bg)' : 'transparent',
            border: '1px solid var(--glass-border)',
            borderBottom: activeTab === 'bot' ? 'none' : '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
            color: activeTab === 'bot' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          🤖 Trading Bot
        </button>
        <button
          onClick={() => setActiveTab('admin')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'admin' ? 'var(--glass-bg)' : 'transparent',
            border: '1px solid var(--glass-border)',
            borderBottom: activeTab === 'admin' ? 'none' : '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
            color: activeTab === 'admin' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          🏦 API Service
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'settings' ? 'var(--glass-bg)' : 'transparent',
            border: '1px solid var(--glass-border)',
            borderBottom: activeTab === 'settings' ? 'none' : '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
            color: activeTab === 'settings' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          ⚙️ Settings
        </button>
      </div>

      <main className="main-content">
        {activeTab === 'manual' && (
          <>
            <div className="chart-section">
              <MarketOverview 
                prices={prices}
                selected={selectedSymbol}
                onSelect={setSelectedSymbol}
              />
              
              <div className="card">
                <div className="card-header">
                  <div className="price-display">
                    <span className="current-price">
                      ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="price-change positive">{selectedSymbol}</span>
                  </div>
                </div>
                <div className="card-body">
                  <PriceChart symbol={selectedSymbol} />
                </div>
              </div>

              <Portfolio portfolio={portfolio} prices={prices} />
              
              <TradeHistory trades={trades} />
            </div>

            <TradingPanel 
              symbol={selectedSymbol}
              price={currentPrice}
              portfolio={portfolio}
              onTrade={executeTrade}
            />
          </>
        )}

        {activeTab === 'bot' && (
          <TradingBot />
        )}

        {activeTab === 'admin' && (
          <AdminDashboard />
        )}

        {activeTab === 'settings' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>⚙️ Settings</h2>
            <AlpacaSettings />
          </div>
        )}
      </main>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default App
