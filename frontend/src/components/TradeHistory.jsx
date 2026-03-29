function TradeHistory({ trades }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Recent Trades</h3>
      </div>
      <div className="card-body">
        {trades && trades.length > 0 ? (
          <div className="trades-list">
            {trades.slice(0, 20).map((trade) => (
              <div key={trade.id} className="trade-item">
                <span className={`trade-side ${trade.side}`}>
                  {trade.side}
                </span>
                <div className="trade-details">
                  {trade.amount.toFixed(6)} {trade.symbol.replace('USDT', '')}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  @{formatTime(trade.timestamp)}
                </div>
                <span className="trade-value">
                  ${trade.total_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div>No trades yet. Start trading to see your history!</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TradeHistory
