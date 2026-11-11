# Holding rescreen results

2018-08-09..2026-10-26;2000 sessions;10-session full optimization;max6;v11;commission3bps+slippage2bps.

| Policy | Net % | MaxDD % | Fills | Clears |
|---|---:|---:|---:|---:|
| Baseline | 463.092280 | 10.875317 | 128 | 57 |
| Holding rescreen | 408.631264 | 15.643071 | 132 | 59 |

Extra full screens:149;original winners reused:1293;return difference:-54.461016pp.

Frozen source ending 2026-10-26; Nikkei close proxy; not current browser account; no production adoption.

Identity:9e9fc2eb97a74df1c0d049848007af3ab03220378168ecefe210c433b17dd8c6. Production economic fills,account and complete overlay match;2000 serialized causal daily steps pass;original-date full optimizer winner matches. See output/latest.json for retained artifacts.

## Exit attribution

Additional screened dates with reduce signals:9;increase signals:16. Same-pre-day no-screen probes change the same-day target on5 dates. Direct extra-request clears:2020-09-30. Guards and daily risk handling remain active;not every extra-screen-date fill is caused by screening.

Baseline-only clear dates:2020-10-15, 2021-06-17, 2021-08-16, 2021-11-24, 2022-08-24, 2026-07-02.

Alternative-only clear dates:2020-09-30, 2020-10-30, 2021-06-21, 2021-08-20, 2021-11-26, 2022-08-29, 2024-03-11, 2026-07-03. These date differences describe whole-path divergence;they are not all direct screen effects. Full same-state probes are in exit-diagnostics.json.

## Where the performance difference comes from

First target divergence:2020-09-30;first account-value divergence:2020-09-30. Targets differ on32 days. On11 added dates,the newly selected strategy changes the immediate target compared with checking the previous strategy from identical state.

Causal carried-strategy-only diagnostic:net350.591143%,DD12.617443%,141fills,149extra checks. It uses its own holding dates and performs no full screening.

| Period | Additive advantage pp | Extra screens | Different targets |
|---|---:|---:|---:|
| 2018 | 0.000000 | 5 | 0 |
| 2019 | 0.000000 | 9 | 0 |
| 2020 | -3.753128 | 20 | 15 |
| 2021 | -9.710107 | 16 | 8 |
| 2022 | -2.553580 | 19 | 3 |
| 2023 | -3.910249 | 26 | 0 |
| 2024 | -11.943033 | 14 | 5 |
| 2025 | -11.644666 | 19 | 0 |
| 2026 | -10.946253 | 21 | 1 |
| sessions-1-500 | 0.000000 | 30 | 0 |
| sessions-501-1000 | -16.653512 | 33 | 26 |
| sessions-1001-1500 | -14.286592 | 43 | 5 |
| sessions-1501-2000 | -23.520913 | 43 | 1 |

Largest positive months:2026-07 8.537652pp; 2026-03 2.246950pp; 2025-11 1.764383pp; 2024-09 1.356676pp; 2025-01 1.149936pp.

Largest negative months:2024-03 -6.693918pp; 2025-10 -6.405510pp; 2021-06 -6.315563pp; 2026-05 -5.467486pp; 2026-04 -4.990638pp.

Period contributions are additive cash differences divided by initial cash, not independent period returns. Holding effect includes capital-size compounding; execution/cost residual includes open reconciliation. Same-state probes identify immediate effects only; whole-path differences also include later state/eligibility changes. Full daily,monthly,yearly and500-session accounting is in difference-analysis.json;contributions sum exactly to the final return difference.
