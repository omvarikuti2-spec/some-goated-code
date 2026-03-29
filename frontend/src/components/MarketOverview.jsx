function MarketOverview({ prices, selected, onSelect }) {
  const symbols = [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'GOOGL', name: 'Google' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'AMZN', name: 'Amazon' },
  ]

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Market Overview</h3>
      </div>
      <div className="card-body">
        <div className="market-grid">
          {symbols.map(({ symbol, name }) => {
            const price = prices[symbol] || 0
            const isSelected = selected === symbol
            
            return (
              <div
                key={symbol}
                className={`market-card ${isSelected ? 'active' : ''}`}
                onClick={() => onSelect(symbol)}
              >
                <div className="market-symbol">{symbol}</div>
                <div className="market-name">{name}</div>
                <div className="market-price">
                  ${price > 0 ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--.--'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MarketOverview
