import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType } from 'lightweight-charts'
import { apiUrl } from '../apiConfig'

function PriceChart({ symbol }) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const candlestickSeriesRef = useRef(null)
  const [data, setData] = useState([])

  // Fetch candlestick data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(apiUrl(`/api/klines/${symbol}?interval=1m&limit=100`))
        if (response.ok) {
          const result = await response.json()
          const formatted = result.data.map(d => ({
            time: d.timestamp / 1000,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
          }))
          setData(formatted)
        }
      } catch (error) {
        console.error('Error fetching chart data:', error)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [symbol])

  // Create and update chart
  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return

    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#242f3e' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: '#2d3748' },
          horzLines: { color: '#2d3748' },
        },
        rightPriceScale: {
          borderColor: '#2d3748',
        },
        timeScale: {
          borderColor: '#2d3748',
          timeVisible: true,
          secondsVisible: false,
        },
      })

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00d084',
        downColor: '#ff4757',
        borderUpColor: '#00d084',
        borderDownColor: '#ff4757',
        wickUpColor: '#00d084',
        wickDownColor: '#ff4757',
      })

      chartRef.current = chart
      candlestickSeriesRef.current = candlestickSeries
    }

    candlestickSeriesRef.current.setData(data)
    chartRef.current.timeScale().fitContent()

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [data])

  return (
    <div ref={chartContainerRef} className="chart-container" />
  )
}

export default PriceChart
