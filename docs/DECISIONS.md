# Decisions

## D-001: Independent product implementation

Use TradingView only as a product reference. Do not redistribute its library
files or copy protected Pine scripts.

## D-002: Provider adapter boundary

Use Eastmoney for the credential-free prototype and keep its formats isolated
behind `lib/market/`.

## D-003: Next-bar-open fills

Signals are generated from completed bars and executed at the next bar open.
This avoids same-bar close look-ahead. Commission and slippage apply on both
entry and exit.

## D-004: Client-side first-version screening

Run 18 candidates in the browser for immediate feedback. Revisit this decision
when jobs become durable, multi-user, or materially CPU-intensive.

