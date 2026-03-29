function Portfolio({ portfolio, prices }) {
  if (!portfolio) return null

  const { holdings, total_value, cash_balance, total_pnl } = portfolio

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Your Portfolio</h3>
      </div>
      <div className="card-body">
        <div className="balance-display" style={{ marginBottom: '1.5rem' }}>
          <div className="balance-item">
            <div className="balance-label">Total Value</div>
            <div className="balance-value">${total_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</div>
          </div>
          <div className="balance-item">
            <div className="balance-label">Cash</div>
            <div className="balance-value">${cash_balance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</div>
          </div>
          <div className="balance-item">
            <div className="balance-label">Crypto Value</div>
            <div className="balance-value">${portfolio?.total_crypto_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</div>
          </div>
          <div className="balance-item">
            <div className="balance-label">Total P&L</div>
            <div className="balance-value" style={{ color: (total_pnl || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {(total_pnl || 0) >= 0 ? '+' : ''}
              ${total_pnl?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
            </div>
          </div>
        </div>

        <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Holdings</h4>
        
        {holdings && holdings.length > 0 ? (
          <div className="holdings-list">
            {holdings.map((holding) => (
              <div key={holding.symbol} className="holding-item">
                <div>
                  <div className="holding-symbol">{holding.symbol.replace('USDT', '')}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Avg: ${holding.avg_buy_price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="holding-amount">
                  {holding.amount?.toFixed(6)}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`holding-pnl ${(holding.pnl || 0) >= 0 ? 'positive' : 'negative'}`}>
                    {(holding.pnl || 0) >= 0 ? '+' : ''}
                    ${holding.pnl?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {(holding.pnl_percent || 0).toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div>No holdings yet. Start trading to build your portfolio!</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Portfolio
