---
title: Labelling rubric
parent: Training our own decision model
nav_order: 1
---

# Labelling rubric (Claude labels) · v1.3

Each sampled state is labelled with the in-character answer to every question it asks: the **move**, the **invest share** (when asked), the **spend level** (1–10) and **retire** (when asked), plus a one-line reason. The labeller is Claude, in the Claude Code session that runs this study, following these rules in this order.

## 1. Situation first: red flags override personality

A real person, whatever their personality, rarely ignores these:

- **No paycheck** (unemployed, or in school): no investing, no stock trading, no big purchases; spend level ≤ 2 (≤ 3 for spenders and status seekers, who cut less). Keep the cash or pay down expensive debt only if there's a lot of spare cash.
- **Expensive debt** (credit card or past-due bills around 20%+): paying it down beats investing for every personality except, sometimes, a spender who'd rather buy something; spend level drops by 1–2.
- **Cash below the cushion** (v1.2: read carefully): the state shows `cash $X (keeps $Y as a cushion), savings account $Z`. The cushion is usually held in the **savings account**, so the red flag applies **only when cash + savings is below the cushion**. When savings cover it, the sim is safe: investing the spare cash that a move offers ("up to $N available") is **not** a new commitment and is fine. When it truly applies: no new purchases, businesses or loans; "change nothing" or saving is in character.
- **A cash crunch with a rental to sell** (v1.3): cash + savings below the cushion **and** at least one of zero cash, spending above take-home pay, or debt at 8%+ → **sell a rental** when that move is offered. Otherwise a shortfall alone means no new commitments, not a sale.
- **A crash or a recession, with weak jobs:** big purchases and new businesses drop sharply; loss-averse and crowd-following sims cut spending by 1–2 levels and lean toward saving; patient index investors and early retirees keep investing (buying low is in character for them).
- **Empty rentals in town** (a high vacancy share): buying another rental is a poor choice unless the sim is a real-estate investor with plenty of cash, and even then it's less likely.

## 2. Then personality and traits

| Archetype | Typical move | Spend level |
|---|---|---|
| Saver | save cash, pay down debt, change nothing; invests a little | 2–4 |
| Index investor | invest in the index, steadily | 3–4 |
| Stock picker | individual stocks; the index sometimes | 4–5 |
| Real estate investor | rentals (when affordable and the town has tenants), then a home | 4–5 |
| Business owner | start a business when one is offered and affordable; otherwise build cash for one | 4–6 |
| Spender | buy a car, splurge, change nothing; rarely invests | 7–9 |
| Status seeker | a bigger home, a car, visible spending | 6–8 |
| Early retiree | invest heavily, save, pay down debt; very frugal | 1–3 |
| Balanced | a bit of everything; follows the situation | 4–6 |

### When the signature move isn't on offer (rubric v1.1)

The legal moves change every month. When a sim's typical move is missing, these are the in-character fallbacks, **before** reaching for the index fund:

| Archetype | Signature move | If it isn't offered |
|---|---|---|
| Saver | save cash | pay down debt > change nothing. **Savers invest in the index only rarely** (at most one decision in four), never when savings are the habit shown in recent memories |
| Index investor | invest in the index | change nothing (they don't switch to stocks or savings) |
| Stock picker | buy stocks | invest in the index > change nothing |
| Real estate investor | buy a rental | **save cash toward the next down payment** > pay down debt; not the index fund (they think in properties, not stocks) |
| Business owner | start a business | **save cash toward the next venture** > pay down expensive debt; not the index fund |
| Spender | buy a car / splurge | change nothing (spend via the spend level); **a new car on easy terms ($0 down) is in character** unless there are red flags |
| Status seeker | bigger home, car | change nothing; **a car on easy terms is in character** unless there are red flags |
| Early retiree | invest in the index | pay down debt > save cash |
| Balanced | depends on the situation | low risk-taking or a falling market → save cash; otherwise a mix |

### When the signature move *is* on offer: the bar it must clear (v1.3)

Being offered a move doesn't make it a good month for it. Real estate investors and business owners take their deal only when **all** of these hold; otherwise use the fallback above (save toward the next one):

| Archetype | Takes the deal only if |
|---|---|
| Real estate investor (buy a rental) | cash + savings after the down payment still cover the cushion; cash flow after costs is **positive**; town vacancy **under 15%**; jobs **not weak**; home prices **not falling** |
| Business owner (start a business) | no failed business in recent memories; cash + savings after the start-up cost still cover the cushion; year-one failure rate **35% or less**; jobs **not weak**; prefer *on the side* over *quit the job* unless there's plenty of cash |

### Balanced sims: a fixed order (v1.3)

Balanced sims read the situation. Go down this list and take the **first move that is offered**:

1. Red flags (section 1) first, as for everyone.
2. **The index fell 1%+ last month, or jobs are weak** → save cash.
3. **A debt at 6.5% or more** is offered for early payoff (under 25: student loans count too) → pay down debt.
4. Otherwise → invest in the index (invest share 2).
5. None of those offered → change nothing. Never a business with 35%+ year-one failure, never a rental into vacancy.

### Under 25 (v1.3, how it combines)

"Pay student debt" applies when the archetype's signature move **isn't** offered and its fallback would be save or change nothing (savers, index investors, early retirees, balanced). It doesn't override a signature move that *is* offered, and it doesn't apply to spenders, status seekers or business owners (who keep cash for spending or a venture).

Traits move a sim within its type: **high risk-taking** → more stocks and businesses; **high comfort with debt** → happier to borrow for property; **high status seeking** → bigger homes, cars, higher spend; **high patience and discipline** → investing over spending; **high loss aversion** → savings over the market, especially after losses; **follows the crowd** → buys in booms, sells and cuts back in crashes.

## 3. Memories

Recent memories count: a **failed business** or **big stock loss** makes the same move unlikely for a while; a **raise** lifts spending by about one level; **repeated repairs or missed payments** make the sim more careful.

## 4. Life stage

- **Under 25**: build a cushion, pay student debt; few big purchases (cars are the exception for spenders).
- **55+** with retirement offered: retire if it's in character and affordable (early retirees yes; most others not before 62–67 unless clearly wealthy).
- **Retired**: no new businesses or rentals; low risk; spend modestly.

## 5. Mechanics

- **Invest share** (0 = 10%, 1 = 25%, 2 = half, 3 = 75%, 4 = all spare cash): disciplined, patient types go higher; spenders and the cautious go lower. Labelled only when the question is asked.
- **Spend level**: the archetype's range above, moved by situation (red flags, raises, crashes).
- **One label per question** (the single most in-character answer). When two moves are close, prefer the one the situation supports.

## Known limitations

- One labeller (Claude) wrote both this rubric and the golden suite, so a model trained on these labels may do well on the golden suite partly by sharing an author. The study weighs the counterfactual pairs, a held-out test set, agreement with d3, and whole-town behavior accordingly.
- Hard labels hide genuine ties; the d3 soft-label runs are the counterpoint.

## Changelog

- **v1.1** (2026-11-22): added *When the signature move isn't on offer*. The Haiku pilot on batch 0 agreed with Opus on only 57% of moves, and almost every disagreement was Haiku choosing the index fund where the archetype's typical move wasn't offered (savers 0/4, business owners 0/5, real estate 1/4). Real estate without a rental on offer wasn't covered by v1 at all.
- **v1.2** (2026-11-22): clarified the cushion red flag. 83% of sampled states show "cash below the cushion", but in 85% of those the savings account fully covers it. Five Haiku labellers read v1.1's "no new commitments" in opposite ways: batches 10-12 kept investing (18/19 signature moves) while batches 4-9 and 13-15 almost never did (6/66). Same rule, opposite readings. v1.1 Haiku labels are kept as a "noisy labels" experimental arm.
- **v1.3** (2026-11-22): the first trained student (E01) matched gold on 77–92% of moves for six archetypes but **0–15% for balanced, real estate and business** sims. Rubric v1.3 writes down the rules the gold labels already follow: a **fixed decision order for balanced sims** (fits 17 of 18 gold balanced labels; the 18th was corrected), **the bar a rental or business deal must clear**, **when to sell a rental** (cash crunch), and **how the under-25 rule combines** with archetype fallbacks. Both gaps came from Haiku labellers flagging ambiguous states.
