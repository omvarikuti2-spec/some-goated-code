import { useState, useEffect } from 'react'

const ALL_STOCKS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN']

function TradingPanel({ symbol, price, portfolio, onTrade }) {
  const [side, setSide] = useState('buy')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [tradeMode, setTradeMode] = useState('all') // 'all' or 'single'
  const [maxBuy, setMaxBuy] = useState(0)
  const [maxSell, setMaxSell] = useState(0)

  const cashBalance = portfolio?.account?.balance_usd || 10000
  const holdings = portfolio?.holdings || []
  const currentHolding = holdings.find(h => h.symbol === symbol)
  const holdingAmount = currentHolding?.amount || 0

  useEffect(() => {
    if (price > 0) {
      if (tradeMode === 'all') {
        setMaxBuy(cashBalance / ALL_STOCKS.length / price)
        const totalShares = ALL_STOCKS.reduce((sum, s) => {
          const h = holdings.find(x => x.symbol === s)
          return sum + (h?.amount || 0)
        }, 0)
        setMaxSell(totalShares / ALL_STOCKS.length)
      } else {
        setMaxBuy(cashBalance / price)
        setMaxSell(holdingAmount)
      }
    }
  }, [price, cashBalance, holdingAmount, tradeMode, holdings])

  const total = parseFloat(amount || 0) * price * (tradeMode === 'all' ? ALL_STOCKS.length : 1)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return

    setLoading(true)
    const success = await onTrade(side, parseFloat(amount), tradeMode === 'all' ? ALL_STOCKS : undefined)
    setLoading(false)
    
    if (success) {
      setAmount('')
    }
  }

  const setPercentage = (pct) => {
    const max = side === 'buy' ? maxBuy : maxSell
    setAmount((max * pct).toFixed(6))
  }

  return (
    <div className="trading-panel">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Portfolio Trading</h3>
        </div>
        <div className="card-body">
          {/* Trade Mode Toggle */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="input-label">Trading Mode</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className={`symbol-btn ${tradeMode === 'all' ? 'active' : ''}`}
                onClick={() => setTradeMode('all')}
                style={{
                  flex: 1,
                  background: tradeMode === 'all' ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : 'var(--glass-bg)',
                  color: tradeMode === 'all' ? 'white' : 'var(--text-secondary)',
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                📊 Trade All ({ALL_STOCKS.length} stocks)
              </button>
              <button
                type="button"
                className={`symbol-btn ${tradeMode === 'single' ? 'active' : ''}`}
                onClick={() => setTradeMode('single')}
                style={{
                  flex: 1,
                  background: tradeMode === 'single' ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : 'var(--glass-bg)',
                  color: tradeMode === 'single' ? 'white' : 'var(--text-secondary)',
                  padding: '0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                Single Stock
              </button>
            </div>
          </div>

          {tradeMode === 'single' && (
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(100,200,255,0.05)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Currently trading: <strong>{symbol}</strong>
              </div>
            </div>
          )}

          {tradeMode === 'all' && (
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(100,255,150,0.05)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Will trade all: {ALL_STOCKS.join(', ')}
              </div>
            </div>
          )}

          <div className="balance-display">
            <div className="balance-item">
              <div className="balance-label">Cash Balance</div>
              <div className="balance-value">${cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            {tradeMode === 'single' && (
              <div className="balance-item">
                <div className="balance-label">Holding</div>
                <div className="balance-value">{holdingAmount.toFixed(6)} {symbol}</div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="order-form">
            <div className="side-selector">
              <button
                type="button"
                className={`side-btn buy ${side === 'buy' ? 'active' : ''}`}
                onClick={() => setSide('buy')}
              >
                Buy
              </button>
              <button
                type="button"
                className={`side-btn sell ${side === 'sell' ? 'active' : ''}`}
                onClick={() => setSide('sell')}
                disabled={tradeMode === 'single' ? holdingAmount <= 0 : false}
              >
                Sell
              </button>
            </div>

            <div className="input-group">
              <label className="input-label">Amount per Stock</label>
              <input
                type="number"
                step="0.000001"
                className="input-field"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Max: ${side === 'buy' ? maxBuy.toFixed(6) : maxSell.toFixed(6)}`}
              />
            </div>

            <div className="percentage-buttons">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="symbol-btn"
                  onClick={() => setPercentage(pct)}
                >
                  {pct * 100}%
                </button>
              ))}
            </div>

            <div className="total-display">
              <span className="total-label">Total Cost</span>
              <span className="total-value">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <button
              type="submit"
              className={`execute-btn ${side}`}
              disabled={loading || !amount || parseFloat(amount) <= 0 || (side === 'buy' && total > cashBalance)}
            >
              {loading ? 'Processing...' : `${side.toUpperCase()} ${tradeMode === 'all' ? 'ALL STOCKS' : symbol}`}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Quick Stats</h3>
        </div>
        <div className="card-body">
          <div className="balance-display">
            <div className="balance-item">
              <div className="balance-label">Portfolio Value</div>
              <div className="balance-value">
                ${portfolio?.total_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </div>
            </div>
            <div className="balance-item">
              <div className="balance-label">Total P&L</div>
              <div className="balance-value" style={{ color: (portfolio?.total_pnl || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {(portfolio?.total_pnl || 0) >= 0 ? '+' : ''}
                ${portfolio?.total_pnl?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TradingPanel
