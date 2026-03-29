import { useState } from 'react';
import { DollarSign, TrendingUp, BarChart3, Activity } from 'lucide-react';
import DashboardSidebar from '@/components/trading/DashboardSidebar';
import DashboardHeader from '@/components/trading/DashboardHeader';
import MetricCard from '@/components/trading/MetricCard';
import TradingChart from '@/components/trading/TradingChart';
import EquityCurve from '@/components/trading/EquityCurve';
import PositionsTable from '@/components/trading/PositionsTable';
import StrategyPanel from '@/components/trading/StrategyPanel';
import TradeHistoryTable from '@/components/trading/TradeHistoryTable';
import PerformanceMetrics from '@/components/trading/PerformanceMetrics';
import SettingsPanel from '@/components/trading/SettingsPanel';
import { useTrading } from '@/contexts/TradingContext';
import { mockPerformance } from '@/lib/mock-data';

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { account, isConnected, strategies } = useTrading();

  const portfolioValue = isConnected && account
    ? `$${parseFloat(account.portfolio_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : '$112,847';

  const todayPnl = isConnected && account
    ? `${parseFloat(account.equity) - parseFloat(account.last_equity) >= 0 ? '+' : ''}$${(parseFloat(account.equity) - parseFloat(account.last_equity)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : '+$1,284';

  const runningStrategies = strategies.filter((s) => s.status === 'running').length;

  const renderContent = () => {
    switch (activeTab) {
      case 'settings':
        return <SettingsPanel />;
      case 'charts':
        return <TradingChart />;
      case 'strategies':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <StrategyPanel />
            <PerformanceMetrics />
          </div>
        );
      case 'positions':
        return <PositionsTable />;
      case 'history':
        return <TradeHistoryTable />;
      case 'performance':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2"><EquityCurve /></div>
            <PerformanceMetrics />
          </div>
        );
      case 'risk':
        return (
          <div className="glass rounded-xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Risk Management</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Max Daily Loss', value: '$2,000', desc: 'Auto-stop at -2% daily' },
                { label: 'Position Size Limit', value: '10%', desc: 'Max allocation per trade' },
                { label: 'Stop Loss Default', value: '2%', desc: 'Applied to all new orders' },
                { label: 'Take Profit Default', value: '5%', desc: 'Applied to all new orders' },
                { label: 'Trailing Stop', value: '1.5%', desc: 'Activated after 2% profit' },
                { label: 'Max Open Positions', value: '8', desc: 'Hard limit on concurrent trades' },
              ].map((item) => (
                <div key={item.label} className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-sm font-mono font-semibold text-foreground">{item.value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        );
      default: // dashboard
        return (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Portfolio Value"
                value={portfolioValue}
                change={isConnected && account ? `${parseFloat(account.buying_power).toLocaleString(undefined, { maximumFractionDigits: 0 })} buying power` : '+$12,847.50'}
                changeType="profit"
                icon={DollarSign}
                subtitle={isConnected ? '' : 'total return'}
              />
              <MetricCard
                title="Today's P&L"
                value={todayPnl}
                change={isConnected ? (parseFloat(account?.equity || '0') > parseFloat(account?.last_equity || '0') ? 'profit' : 'loss') : '+1.15%'}
                changeType={todayPnl.startsWith('-') ? 'loss' : 'profit'}
                icon={TrendingUp}
                subtitle="realized"
              />
              <MetricCard
                title="Win Rate"
                value={`${mockPerformance.winRate}%`}
                change={`${mockPerformance.totalTrades} trades`}
                changeType="neutral"
                icon={BarChart3}
              />
              <MetricCard
                title="Active Strategies"
                value={`${runningStrategies} / ${strategies.length}`}
                change={`${runningStrategies} running`}
                changeType="profit"
                icon={Activity}
                subtitle="strategies"
              />
            </div>

            {/* Chart + Strategy */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <TradingChart />
              </div>
              <div className="space-y-5">
                <StrategyPanel />
                <EquityCurve />
              </div>
            </div>

            {/* Positions + Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <PositionsTable />
              </div>
              <PerformanceMetrics />
            </div>

            {/* Trade History */}
            <TradeHistoryTable />
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader />
        <main className="flex-1 p-5 space-y-5 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default Index;
