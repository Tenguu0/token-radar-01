# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Tenguu0/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Tenguu0/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — every pre-token protocol ranked by what its token would be worth, with a concrete farm plan for each one. It reads a sealed DefiLlama snapshot (758 protocols), covers all 40 watchlist protocols plus all 138 early pre-token protocols below the $50M floor (178 rows), and scores each one only from the snapshot's own figures: TVL, 7-day growth, age with no token, and chain breadth. No protocol name is special-cased. Wrapped, staked and bridged products of tokens that already trade are kept out of the board, the same rule the watchlist uses. The dashboard is a fully offline static page: sortable/filterable board, per-protocol detail view with the model's breakdown, a live-token view kept apart at market values, and a model sandbox that re-ranks the board live.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Requires Node.js 22.18 or later, standard library only — nothing is installed. Then open `out/dashboard/index.html` in a browser (it reads `out/data.js`, no network).

## The model (radar-2)

```
implied = TVL × 0.25 × (1 + clamp(7d, −60, 120)% × 0.5)
        × (0.6 + min(age, 1095)/1095 × 0.4)
        × (1 + 0.05 × min(chains−1, 4))
        × (0.9 if 7d < −30% else 1)
```

Size is the anchor, growth rewards momentum, maturity rewards a long run with no token (pent-up launch value), breadth rewards a multi-chain footprint, and a hard TVL bleed is discounted 10%. Farm plans are generated from each protocol's own category, chains, TVL and age, with the cost and time of every step. Implied value is this radar's claim, never a promise: it does not predict whether or when a token launches.

---

<sub>Entered on [make.fun](https://make.fun/?ref=zesty-condor-68&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
