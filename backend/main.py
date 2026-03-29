"""
Stock Paper Trading API — WebSocket prices, manual trades, bot, admin, Alpaca-style /v1.
"""
from __future__ import annotations

import asyncio
import json
import hashlib
import secrets
import sqlite3
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = Path(__file__).resolve().parent / "paper_trading.db"
STOCKS_API = "https://query1.finance.yahoo.com/v10/finance/quoteSummary"
CHART_API = "https://query1.finance.yahoo.com/v8/finance/chart"
DEFAULT_SYMBOLS = ("AAPL", "MSFT", "GOOGL", "TSLA", "AMZN")  # Top US stocks

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
    return _conn


def init_db() -> None:
    c = db()
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            account_number TEXT UNIQUE NOT NULL,
            balance_usd REAL NOT NULL,
            initial_balance REAL NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS holdings (
            account_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            amount REAL NOT NULL,
            avg_buy_price REAL NOT NULL,
            PRIMARY KEY (account_id, symbol),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            amount REAL NOT NULL,
            price REAL NOT NULL,
            total_value REAL NOT NULL,
            timestamp TEXT NOT NULL,
            reason TEXT DEFAULT '',
            strategy TEXT DEFAULT 'manual',
            pnl REAL DEFAULT 0,
            source TEXT DEFAULT 'manual',
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            key_id TEXT UNIQUE NOT NULL,
            secret_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        CREATE TABLE IF NOT EXISTS api_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            calls INTEGER NOT NULL DEFAULT 1,
            day TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS alpaca_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER UNIQUE NOT NULL,
            api_key TEXT NOT NULL,
            secret_key TEXT NOT NULL,
            base_url TEXT DEFAULT 'https://paper-api.alpaca.markets',
            created_at TEXT NOT NULL,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        """
    )
    c.commit()
    row = c.execute("SELECT COUNT(*) FROM accounts").fetchone()
    if row and row[0] == 0:
        ts = _now_iso()
        c.execute(
            "INSERT INTO accounts (name, account_number, balance_usd, initial_balance, created_at) VALUES (?,?,?,?,?)",
            ("Default Paper", "PAPER-000001", 10000.0, 10000.0, ts),
        )
        c.commit()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


# --- Price cache & WebSocket ---
price_cache: dict[str, float] = {}
closes: dict[str, deque[float]] = {s: deque(maxlen=60) for s in DEFAULT_SYMBOLS}
ws_clients: set[WebSocket] = set()


async def fetch_stock_prices(client: httpx.AsyncClient) -> None:
    for sym in DEFAULT_SYMBOLS:
        try:
            # Using Yahoo Finance API
            r = await client.get(
                CHART_API,
                params={"symbol": sym, "interval": "1m", "range": "1d"},
                timeout=10.0,
                headers={"User-Agent": "Mozilla/5.0"}
            )
            if r.status_code == 200:
                data = r.json()
                if "chart" in data and "result" in data["chart"] and len(data["chart"]["result"]) > 0:
                    result = data["chart"]["result"][0]
                    if "meta" in result and "regularMarketPrice" in result["meta"]:
                        p = float(result["meta"]["regularMarketPrice"])
                        price_cache[sym] = p
                        closes[sym].append(p)
        except Exception:
            pass


async def price_loop_task():
    async with httpx.AsyncClient() as client:
        while True:
            await fetch_stock_prices(client)
            if price_cache:
                for sym, p in price_cache.items():
                    out = json.dumps({"type": "price_update", "symbol": sym, "price": p})
                    dead = []
                    for ws in ws_clients:
                        try:
                            await ws.send_text(out)
                        except Exception:
                            dead.append(ws)
                    for ws in dead:
                        ws_clients.discard(ws)
            await asyncio.sleep(2.0)


# --- Bot state ---
@dataclass
class BotConfig:
    strategy: str = "rsi"
    symbols: list[str] = field(default_factory=lambda: ["AAPL", "MSFT", "GOOGL", "TSLA", "AMZN"])
    trade_amount: float = 100.0
    max_positions: int = 5
    stop_loss_percent: float = 5.0
    take_profit_percent: float = 10.0
    interval_seconds: int = 60


bot_config = BotConfig()
bot_status: str = "stopped"  # stopped | running | paused
bot_positions: dict[str, dict[str, Any]] = {}
bot_stats = {"total_trades": 0, "profitable_trades": 0, "total_pnl": 0.0}
bot_signals: list[dict[str, Any]] = []
bot_trades: list[dict[str, Any]] = []
bot_task: asyncio.Task | None = None


def rsi(closes_list: list[float], period: int = 14) -> float | None:
    if len(closes_list) < period + 1:
        return None
    gains = []
    losses = []
    for i in range(-period, 0):
        diff = closes_list[i] - closes_list[i - 1]
        if diff >= 0:
            gains.append(diff)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(-diff)
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def compute_signal(symbol: str, strategy: str) -> tuple[str | None, float, str]:
    """Returns (side or None, confidence, reason)."""
    c = list(closes.get(symbol, []))
    price = price_cache.get(symbol)
    if not c or price is None:
        return None, 0.0, "no data"

    if strategy == "rsi":
        val = rsi(c)
        if val is None:
            return None, 0.0, "warming up RSI"
        if val < 30:
            return "buy", min(1.0, (30 - val) / 30 + 0.5), f"RSI oversold {val:.1f}"
        if val > 70:
            return "sell", min(1.0, (val - 70) / 30 + 0.5), f"RSI overbought {val:.1f}"
        return None, val / 100, f"RSI neutral {val:.1f}"

    if strategy == "momentum":
        if len(c) < 10:
            return None, 0.0, "warming up"
        sma = sum(c[-10:]) / 10
        prev_sma = sum(c[-11:-1]) / 10 if len(c) >= 11 else sma
        if price > sma and sma >= prev_sma:
            return "buy", 0.75, "price above rising SMA10"
        if price < sma and sma <= prev_sma:
            return "sell", 0.75, "price below falling SMA10"
        return None, 0.5, "momentum flat"

    if strategy == "macd":
        if len(c) < 26:
            return None, 0.0, "warming up MACD"
        ema12 = _ema(c, 12)
        ema26 = _ema(c, 26)
        if ema12 is None or ema26 is None:
            return None, 0.0, "ema"
        m = ema12 - ema26
        if m > 0 and ema12 > ema26:
            return "buy", 0.7, "MACD bullish"
        if m < 0:
            return "sell", 0.7, "MACD bearish"
        return None, 0.5, "MACD flat"

    return None, 0.0, "unknown strategy"


def _ema(series: list[float], span: int) -> float | None:
    if len(series) < span:
        return None
    k = 2 / (span + 1)
    ema = series[-span]
    for p in series[-span + 1 :]:
        ema = p * k + ema * (1 - k)
    return ema


def _record_signal(side: str, symbol: str, price: float, strategy: str, reason: str, confidence: float) -> None:
    sig = {
        "side": side,
        "symbol": symbol,
        "price": price,
        "strategy": strategy,
        "reason": reason,
        "confidence": confidence,
        "timestamp": _now_iso(),
    }
    bot_signals.insert(0, sig)
    bot_signals[:] = bot_signals[:200]


def execute_paper_trade(
    account_id: int,
    symbol: str,
    side: str,
    amount: float,
    price: float,
    *,
    reason: str = "",
    strategy: str = "manual",
    source: str = "manual",
) -> dict[str, Any]:
    with _lock:
        c = db()
        row = c.execute("SELECT balance_usd FROM accounts WHERE id=?", (account_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Account not found")
        balance = float(row["balance_usd"])
        total = amount * price

        if side == "buy":
            if total > balance + 1e-9:
                raise HTTPException(400, "Insufficient balance")
            new_bal = balance - total
            h = c.execute(
                "SELECT amount, avg_buy_price FROM holdings WHERE account_id=? AND symbol=?",
                (account_id, symbol),
            ).fetchone()
            if h:
                old_a, old_p = float(h["amount"]), float(h["avg_buy_price"])
                new_a = old_a + amount
                new_avg = (old_a * old_p + amount * price) / new_a if new_a > 0 else price
                c.execute(
                    "UPDATE holdings SET amount=?, avg_buy_price=? WHERE account_id=? AND symbol=?",
                    (new_a, new_avg, account_id, symbol),
                )
            else:
                c.execute(
                    "INSERT INTO holdings (account_id, symbol, amount, avg_buy_price) VALUES (?,?,?,?)",
                    (account_id, symbol, amount, price),
                )
            c.execute("UPDATE accounts SET balance_usd=? WHERE id=?", (new_bal, account_id))
            pnl = 0.0
        else:
            h = c.execute(
                "SELECT amount, avg_buy_price FROM holdings WHERE account_id=? AND symbol=?",
                (account_id, symbol),
            ).fetchone()
            if not h or float(h["amount"]) < amount - 1e-12:
                raise HTTPException(400, "Insufficient holdings")
            old_a, avg_p = float(h["amount"]), float(h["avg_buy_price"])
            proceeds = amount * price
            pnl = (price - avg_p) * amount
            new_bal = balance + proceeds
            rem = old_a - amount
            if rem <= 1e-12:
                c.execute("DELETE FROM holdings WHERE account_id=? AND symbol=?", (account_id, symbol))
            else:
                c.execute("UPDATE holdings SET amount=? WHERE account_id=? AND symbol=?", (rem, account_id, symbol))
            c.execute("UPDATE accounts SET balance_usd=? WHERE id=?", (new_bal, account_id))

        c.execute(
            """INSERT INTO trades (account_id, symbol, side, amount, price, total_value, timestamp, reason, strategy, pnl, source)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                account_id,
                symbol,
                side,
                amount,
                price,
                abs(total),
                _now_iso(),
                reason,
                strategy,
                pnl if side == "sell" else 0.0,
                source,
            ),
        )
        tid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
        c.commit()

    return {
        "id": tid,
        "price": price,
        "total_value": abs(total),
        "pnl": pnl if side == "sell" else 0.0,
    }


def portfolio_payload(account_id: int) -> dict[str, Any]:
    with _lock:
        c = db()
        acc = c.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
        if not acc:
            raise HTTPException(404, "Account not found")
        balance = float(acc["balance_usd"])
        initial = float(acc["initial_balance"])
        rows = c.execute("SELECT * FROM holdings WHERE account_id=?", (account_id,)).fetchall()

    holdings_out = []
    crypto_val = 0.0
    for h in rows:
        sym = h["symbol"]
        amt = float(h["amount"])
        avg = float(h["avg_buy_price"])
        px = price_cache.get(sym, avg)
        pos_val = amt * px
        crypto_val += pos_val
        cost = amt * avg
        pnl = pos_val - cost
        pnl_pct = ((px - avg) / avg * 100) if avg > 0 else 0.0
        holdings_out.append(
            {
                "symbol": sym,
                "amount": amt,
                "avg_buy_price": avg,
                "pnl": pnl,
                "pnl_percent": pnl_pct,
            }
        )

    total_v = balance + crypto_val
    return {
        "account": {"balance_usd": balance},
        "holdings": holdings_out,
        "total_value": total_v,
        "cash_balance": balance,
        "total_crypto_value": crypto_val,
        "total_pnl": total_v - initial,
    }


async def bot_loop():
    global bot_stats
    while True:
        await asyncio.sleep(max(5, bot_config.interval_seconds))
        if bot_status != "running":
            continue
        account_id = 1
        strat = bot_config.strategy
        for symbol in bot_config.symbols:
            if symbol not in price_cache:
                continue
            price = price_cache[symbol]
            side, conf, reason = compute_signal(symbol, strat)
            _record_signal(side or "hold", symbol, price, strat, reason or "scan", conf if side else 0.3)

            # Manage open position SL/TP
            if symbol in bot_positions:
                pos = bot_positions[symbol]
                entry = float(pos["entry_price"])
                amt = float(pos["amount"])
                pnl_pct = (price - entry) / entry * 100
                if pnl_pct <= -bot_config.stop_loss_percent:
                    try:
                        r = execute_paper_trade(
                            account_id,
                            symbol,
                            "sell",
                            amt,
                            price,
                            reason="stop loss",
                            strategy=strat,
                            source="bot",
                        )
                        bot_stats["total_trades"] += 1
                        bot_stats["total_pnl"] += r.get("pnl", 0)
                        if r.get("pnl", 0) > 0:
                            bot_stats["profitable_trades"] += 1
                        bot_trades.insert(
                            0,
                            {
                                "side": "sell",
                                "symbol": symbol,
                                "amount": amt,
                                "price": price,
                                "reason": "stop loss",
                                "strategy": strat,
                                "pnl": r.get("pnl", 0),
                                "timestamp": _now_iso(),
                            },
                        )
                        del bot_positions[symbol]
                    except HTTPException:
                        pass
                    continue
                if pnl_pct >= bot_config.take_profit_percent:
                    try:
                        r = execute_paper_trade(
                            account_id,
                            symbol,
                            "sell",
                            amt,
                            price,
                            reason="take profit",
                            strategy=strat,
                            source="bot",
                        )
                        bot_stats["total_trades"] += 1
                        bot_stats["total_pnl"] += r.get("pnl", 0)
                        if r.get("pnl", 0) > 0:
                            bot_stats["profitable_trades"] += 1
                        bot_trades.insert(
                            0,
                            {
                                "side": "sell",
                                "symbol": symbol,
                                "amount": amt,
                                "price": price,
                                "reason": "take profit",
                                "strategy": strat,
                                "pnl": r.get("pnl", 0),
                                "timestamp": _now_iso(),
                            },
                        )
                        del bot_positions[symbol]
                    except HTTPException:
                        pass
                    continue

            if side == "buy" and symbol not in bot_positions:
                if len(bot_positions) >= bot_config.max_positions:
                    continue
                usd = bot_config.trade_amount
                qty = usd / price
                try:
                    execute_paper_trade(
                        account_id,
                        symbol,
                        "buy",
                        qty,
                        price,
                        reason=reason,
                        strategy=strat,
                        source="bot",
                    )
                    bot_positions[symbol] = {"entry_price": price, "amount": qty}
                    bot_stats["total_trades"] += 1
                    bot_trades.insert(
                        0,
                        {
                            "side": "buy",
                            "symbol": symbol,
                            "amount": qty,
                            "price": price,
                            "reason": reason,
                            "strategy": strat,
                            "pnl": 0,
                            "timestamp": _now_iso(),
                        },
                    )
                except HTTPException:
                    pass

            elif side == "sell" and symbol in bot_positions:
                pos = bot_positions[symbol]
                amt = float(pos["amount"])
                try:
                    r = execute_paper_trade(
                        account_id,
                        symbol,
                        "sell",
                        amt,
                        price,
                        reason=reason,
                        strategy=strat,
                        source="bot",
                    )
                    bot_stats["total_trades"] += 1
                    bot_stats["total_pnl"] += r.get("pnl", 0)
                    if r.get("pnl", 0) > 0:
                        bot_stats["profitable_trades"] += 1
                    bot_trades.insert(
                        0,
                        {
                            "side": "sell",
                            "symbol": symbol,
                            "amount": amt,
                            "price": price,
                            "reason": reason,
                            "strategy": strat,
                            "pnl": r.get("pnl", 0),
                            "timestamp": _now_iso(),
                        },
                    )
                    del bot_positions[symbol]
                except HTTPException:
                    pass

        bot_trades[:] = bot_trades[:100]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    asyncio.create_task(price_loop_task())
    asyncio.create_task(bot_loop())
    yield


app = FastAPI(title="Crypto Paper Trading API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TradeIn(BaseModel):
    account_id: int = 1
    symbol: str
    side: str
    amount: float = Field(gt=0)


@app.get("/api/portfolio/{account_id}")
def get_portfolio(account_id: int):
    return portfolio_payload(account_id)


@app.get("/api/trades/{account_id}")
def get_trades(account_id: int):
    with _lock:
        c = db()
        rows = c.execute(
            "SELECT * FROM trades WHERE account_id=? ORDER BY id DESC LIMIT 100",
            (account_id,),
        ).fetchall()
    trades = []
    for r in rows:
        trades.append(
            {
                "id": r["id"],
                "side": r["side"],
                "symbol": r["symbol"],
                "amount": float(r["amount"]),
                "timestamp": r["timestamp"],
                "total_value": float(r["total_value"]),
            }
        )
    return {"trades": trades}


@app.post("/api/trade")
def post_trade(t: TradeIn):
    sym = t.symbol.upper()
    # Allow any stock symbol format (1-5 uppercase letters)
    if not sym or not sym.isalpha() or len(sym) > 5:
        raise HTTPException(400, "Invalid stock symbol")
    px = price_cache.get(sym)
    if not px:
        raise HTTPException(503, "Price not available yet — wait for feed")
    side = t.side.lower()
    if side not in ("buy", "sell"):
        raise HTTPException(400, "side must be buy or sell")
    out = execute_paper_trade(t.account_id, sym, side, t.amount, px, source="manual")
    return {"ok": True, "price": out["price"], "trade_id": out.get("id")}


@app.get("/api/klines/{symbol}")
async def klines(symbol: str, interval: str = "1m", limit: int = 100):
    sym = symbol.upper()
    
    # Return generated candlestick data from price cache
    if sym not in price_cache:
        # If price not in cache yet, fetch it
        async with httpx.AsyncClient() as client:
            try:
                r = await client.get(
                    CHART_API,
                    params={"symbol": sym, "interval": "1d", "range": "3mo"},
                    timeout=10.0,
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                if r.status_code == 200:
                    data = r.json()
                    if "chart" in data and "result" in data["chart"] and len(data["chart"]["result"]) > 0:
                        result = data["chart"]["result"][0]
                        if "indicators" in result and len(result["indicators"]["quote"]) > 0:
                            quotes = result["indicators"]["quote"][0]
                            timestamps = result.get("timestamp", [])
                            data_points = []
                            for i, ts in enumerate(timestamps[-limit:] if len(timestamps) > limit else timestamps):
                                if i < len(quotes.get("close", [])) and quotes["close"][i] is not None:
                                    data_points.append({
                                        "timestamp": ts * 1000,
                                        "open": float(quotes["open"][i]) if quotes["open"][i] is not None else float(quotes["close"][i]),
                                        "high": float(quotes["high"][i]) if quotes["high"][i] is not None else float(quotes["close"][i]),
                                        "low": float(quotes["low"][i]) if quotes["low"][i] is not None else float(quotes["close"][i]),
                                        "close": float(quotes["close"][i]),
                                    })
                            return {"data": data_points}
            except Exception:
                pass
        raise HTTPException(502, "Unable to fetch chart data")
    
    # Generate synthetic candlestick data from current price
    current_price = price_cache.get(sym, 100.0)
    data = []
    now = int(time.time())
    for i in range(limit):
        ts = now - (limit - i - 1) * 60  # 1-minute intervals
        # Generate slightly varying OHLC data
        variation = (i % 3 - 1) * 0.005
        base = current_price * (1 + variation)
        data.append({
            "timestamp": ts * 1000,
            "open": base * 0.9985,
            "high": base * 1.001,
            "low": base * 0.999,
            "close": base,
        })
    return {"data": data}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    try:
        await ws.send_json({"type": "initial", "prices": dict(price_cache)})
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("action") == "subscribe":
                sym = msg.get("symbol", "AAPL")
                p = price_cache.get(sym)
                if p is not None:
                    await ws.send_json({"type": "price_update", "symbol": sym, "price": p})
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)


# --- Bot API ---
STRATEGIES = [
    {"id": "rsi", "name": "RSI mean reversion", "description": "Buys when RSI < 30, sells when RSI > 70."},
    {"id": "momentum", "name": "Momentum (SMA10)", "description": "Follows short-term trend vs SMA10."},
    {"id": "macd", "name": "MACD-style", "description": "Uses EMA crossover bias for entries."},
]


class BotConfigure(BaseModel):
    strategy: str = "rsi"
    symbols: list[str] = Field(default_factory=list)
    trade_amount: float = 100
    max_positions: int = 5
    stop_loss_percent: float = 5
    take_profit_percent: float = 10
    interval_seconds: int = 60


@app.get("/api/bot/status")
def bot_get_status():
    return {
        "status": bot_status,
        "config": bot_config.__dict__.copy(),
        "active_positions": bot_positions,
        "stats": bot_stats.copy(),
        "price_cache": dict(price_cache),
    }


@app.get("/api/bot/strategies")
def bot_strategies():
    return {"strategies": STRATEGIES}


@app.get("/api/bot/trades")
def bot_trades_api(limit: int = 20):
    return {"trades": bot_trades[: max(1, min(limit, 100))]}


@app.get("/api/bot/signals")
def bot_signals_api(limit: int = 20):
    return {"signals": bot_signals[: max(1, min(limit, 100))]}


@app.post("/api/bot/configure")
def bot_configure(body: BotConfigure):
    global bot_config
    if bot_status == "running":
        raise HTTPException(400, "Stop the bot before reconfiguring")
    syms = [s.upper() for s in (body.symbols or []) if s.upper() in DEFAULT_SYMBOLS]
    if not syms:
        syms = list(bot_config.symbols)
    bot_config = BotConfig(
        strategy=body.strategy if body.strategy in ("rsi", "momentum", "macd") else "rsi",
        symbols=syms,
        trade_amount=body.trade_amount,
        max_positions=max(1, min(20, int(body.max_positions))),
        stop_loss_percent=max(0.1, float(body.stop_loss_percent)),
        take_profit_percent=max(0.1, float(body.take_profit_percent)),
        interval_seconds=max(5, min(3600, int(body.interval_seconds))),
    )
    return {"ok": True, "config": bot_config.__dict__}


@app.post("/api/bot/start")
def bot_start():
    global bot_status
    if bot_status == "running":
        return {"ok": True, "status": bot_status}
    bot_status = "running"
    return {"ok": True, "status": bot_status}


@app.post("/api/bot/stop")
def bot_stop():
    global bot_status
    bot_status = "stopped"
    return {"ok": True, "status": bot_status}


@app.post("/api/bot/pause")
def bot_pause():
    global bot_status
    if bot_status == "running":
        bot_status = "paused"
    return {"ok": True, "status": bot_status}


@app.post("/api/bot/resume")
def bot_resume():
    global bot_status
    if bot_status == "paused":
        bot_status = "running"
    return {"ok": True, "status": bot_status}


# --- Admin ---
@app.get("/api/admin/dashboard")
def admin_dashboard():
    with _lock:
        c = db()
        n_acc = c.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        n_keys = c.execute("SELECT COUNT(*) FROM api_keys").fetchone()[0]
        n_tr = c.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
        cash = c.execute("SELECT SUM(balance_usd) FROM accounts").fetchone()[0] or 0
        recent = c.execute(
            "SELECT id, name, account_number, balance_usd, created_at FROM accounts ORDER BY id DESC LIMIT 10"
        ).fetchall()
    recent_accounts = []
    for r in recent:
        with _lock:
            kc = db().execute("SELECT COUNT(*) FROM api_keys WHERE account_id=?", (r["id"],)).fetchone()[0]
        recent_accounts.append(
            {
                "id": r["id"],
                "name": r["name"],
                "account_number": r["account_number"],
                "balance": float(r["balance_usd"]),
                "created_at": r["created_at"],
                "api_keys": kc,
            }
        )
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _lock:
        rows = db().execute(
            "SELECT endpoint, calls FROM api_usage WHERE day=? ORDER BY calls DESC LIMIT 8",
            (day,),
        ).fetchall()
    api_usage = [{"endpoint": r["endpoint"], "calls": r["calls"]} for r in rows]
    if not api_usage:
        api_usage = [
            {"endpoint": "GET /v1/account", "calls": 0},
            {"endpoint": "POST /v1/orders", "calls": 0},
        ]

    return {
        "stats": {
            "total_accounts": n_acc,
            "active_api_keys": n_keys,
            "total_trades": n_tr,
            "total_cash_balance": float(cash),
        },
        "recent_accounts": recent_accounts,
        "api_usage": api_usage,
    }


@app.get("/api/admin/accounts")
def admin_accounts_list():
    with _lock:
        c = db()
        rows = c.execute(
            "SELECT id, name, account_number, balance_usd, initial_balance, created_at FROM accounts ORDER BY id"
        ).fetchall()
    return {
        "accounts": [
            {
                "id": r["id"],
                "name": r["name"],
                "account_number": r["account_number"],
                "balance_usd": float(r["balance_usd"]),
                "initial_balance": float(r["initial_balance"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    }


# --- V1 Alpaca-style ---
class CreateAccount(BaseModel):
    name: str
    initial_balance: float = Field(ge=1000, le=1_000_000)


def verify_v1_auth(authorization: str | None = Header(None)) -> int:
    if not authorization or ":" not in authorization:
        raise HTTPException(401, "Authorization: KEY_ID:SECRET_KEY required")
    key_id, secret = authorization.split(":", 1)
    secret_hash = _hash_secret(secret.strip())
    with _lock:
        row = db().execute(
            "SELECT account_id FROM api_keys WHERE key_id=? AND secret_hash=?",
            (key_id.strip(), secret_hash),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Invalid API credentials")
    return int(row["account_id"])


@app.post("/v1/accounts")
def v1_create_account(body: CreateAccount):
    ts = _now_iso()
    num = f"PAPER-{secrets.token_hex(3).upper()}"
    key_id = "PK" + secrets.token_hex(8).upper()
    secret = "SK" + secrets.token_hex(16)
    with _lock:
        c = db()
        c.execute(
            "INSERT INTO accounts (name, account_number, balance_usd, initial_balance, created_at) VALUES (?,?,?,?,?)",
            (body.name, num, float(body.initial_balance), float(body.initial_balance), ts),
        )
        aid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
        c.execute(
            "INSERT INTO api_keys (account_id, key_id, secret_hash, created_at) VALUES (?,?,?,?)",
            (aid, key_id, _hash_secret(secret), ts),
        )
        c.commit()
    return {
        "account_number": num,
        "api_key": {"key_id": key_id, "secret_key": secret},
    }


@app.get("/v1/account")
def v1_account(account_id: int = Depends(verify_v1_auth)):
    with _lock:
        r = db().execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
    if not r:
        raise HTTPException(404)
    return {
        "account_number": r["account_number"],
        "balance": float(r["balance_usd"]),
        "status": "ACTIVE",
    }


@app.get("/v1/positions")
def v1_positions(account_id: int = Depends(verify_v1_auth)):
    p = portfolio_payload(account_id)
    return {
        "positions": [
            {"symbol": h["symbol"], "qty": h["amount"], "avg_entry": h["avg_buy_price"]}
            for h in p["holdings"]
        ]
    }


def _bump_usage(endpoint: str) -> None:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _lock:
        c = db()
        r = c.execute(
            "SELECT id, calls FROM api_usage WHERE endpoint=? AND day=?",
            (endpoint, day),
        ).fetchone()
        if r:
            c.execute("UPDATE api_usage SET calls=? WHERE id=?", (r["calls"] + 1, r["id"]))
        else:
            c.execute(
                "INSERT INTO api_usage (endpoint, calls, day) VALUES (?,?,?)",
                (endpoint, 1, day),
            )
        c.commit()


class V1Order(BaseModel):
    symbol: str
    side: str
    qty: float = Field(gt=0)


@app.post("/v1/orders")
def v1_order(body: V1Order, account_id: int = Depends(verify_v1_auth)):
    sym = body.symbol.upper().replace("/", "")
    # Accept stock symbols directly
    if not sym or not sym.isalpha() or len(sym) > 5:
        raise HTTPException(400, "Invalid stock symbol")
    px = price_cache.get(sym)
    if not px:
        raise HTTPException(503, "No price — wait for market data")
    _bump_usage("POST /v1/orders")
    side = body.side.lower()
    if side not in ("buy", "sell"):
        raise HTTPException(400, "Invalid side")
    out = execute_paper_trade(account_id, sym, side, body.qty, px, source="api")
    return {"status": "filled", "symbol": sym, "qty": body.qty, "price": out["price"]}


# --- Alpaca Integration ---
import os


def detect_alpaca_env() -> dict[str, str | None]:
    """Auto-detect Alpaca credentials from environment."""
    return {
        "api_key": os.getenv("APCA_API_KEY_ID"),
        "secret_key": os.getenv("APCA_API_SECRET_KEY"),
        "base_url": os.getenv("APCA_API_BASE_URL", "https://paper-api.alpaca.markets"),
    }


class AlpacaCredentials(BaseModel):
    api_key: str
    secret_key: str
    base_url: str = "https://paper-api.alpaca.markets"


@app.get("/api/alpaca/status")
def get_alpaca_status(account_id: int = 1):
    """Get Alpaca connection status (auto-detected or saved)."""
    # First check saved credentials
    with _lock:
        c = db()
        row = c.execute("SELECT * FROM alpaca_credentials WHERE account_id=?", (account_id,)).fetchone()
    
    if row:
        return {
            "connected": True,
            "source": "saved",
            "api_key": row["api_key"][:8] + "..." if row["api_key"] else None,
            "base_url": row["base_url"],
        }
    
    # Check environment variables
    env = detect_alpaca_env()
    if env["api_key"] and env["secret_key"]:
        return {
            "connected": True,
            "source": "environment",
            "api_key": env["api_key"][:8] + "...",
            "base_url": env["base_url"],
        }
    
    return {"connected": False, "source": None}


@app.post("/api/alpaca/save")
def save_alpaca_credentials(body: AlpacaCredentials, account_id: int = 1):
    """Save Alpaca credentials to database."""
    if not body.api_key or not body.secret_key:
        raise HTTPException(400, "API key and secret key are required")
    
    with _lock:
        c = db()
        # Check if already exists
        existing = c.execute("SELECT id FROM alpaca_credentials WHERE account_id=?", (account_id,)).fetchone()
        
        ts = _now_iso()
        if existing:
            c.execute(
                "UPDATE alpaca_credentials SET api_key=?, secret_key=?, base_url=? WHERE account_id=?",
                (body.api_key, body.secret_key, body.base_url, account_id),
            )
        else:
            c.execute(
                "INSERT INTO alpaca_credentials (account_id, api_key, secret_key, base_url, created_at) VALUES (?,?,?,?,?)",
                (account_id, body.api_key, body.secret_key, body.base_url, ts),
            )
        c.commit()
    
    return {
        "ok": True,
        "message": "Alpaca credentials saved",
        "api_key_hint": body.api_key[:8] + "...",
    }


@app.get("/api/alpaca/detect")
def detect_alpaca():
    """Detect Alpaca credentials from environment without saving."""
    env = detect_alpaca_env()
    if env["api_key"] and env["secret_key"]:
        return {
            "detected": True,
            "api_key_hint": env["api_key"][:8] + "...",
            "base_url": env["base_url"],
        }
    return {"detected": False}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
