---
title: Labelling rubric
parent: Training our own decision model
nav_order: 1
---

# Labelling rubric (Claude labels) · v1.8

Each sampled state is labelled with the in-character answer to every question it asks: the **move**, the **invest share** (when asked), the **spend level** (1–10) and **retire** (when asked), plus a one-line reason. The labeller is Claude, in the Claude Code session that runs this study, following these rules in this order.

## 1. Situation first: red flags override personality

A real person, whatever their personality, rarely ignores these:

- **No paycheck** (unemployed, or in school): no investing, no stock trading, no big purchases; spend level ≤ 2 (≤ 3 for spenders and status seekers, who cut less). Keep the cash or pay down expensive debt only if there's a lot of spare cash.
- **Expensive debt** (credit card or past-due bills around 20%+): paying it down beats investing for every personality except, sometimes, a spender who'd rather buy something; spend level drops by 1–2.
- **Cash below the cushion** (v1.2: read carefully): the state shows `cash $X (keeps $Y as a cushion), savings account $Z`. The cushion is usually held in the **savings account**, so the red flag applies **only when cash + savings is below the cushion**. When savings cover it, the sim is safe: investing the spare cash that a move offers ("up to $N available") is **not** a new commitment and is fine. When it truly applies: no new purchases, businesses or loans; "change nothing" or saving is in character.
- **A cash crunch with a rental to sell** (v1.5 wording): sell a rental, when that move is offered, if **A** or **B** holds:
  - **A.** cash + savings is below the cushion, **and** at least one of: cash under $1k, spending above take-home pay, or any debt at 8% or more **with a balance of $500 or more** (business loans and cards count; v1.8);
  - **B.** cash under $1k **and** spending above take-home pay **and** savings under **2×** the cushion (v1.6: a sim with deep savings draws on them instead of selling).
  A debt at 8%+ on its own, with the cushion covered, is **not** a crunch. A shortfall on its own is not a crunch either: it blocks new commitments but doesn't force a sale.
- **A purchase must leave the cushion covered** (v1.4): before choosing any move with a down payment or start-up cost (home, car, rental, business), subtract it: if cash + savings would then be **below the cushion**, wait (change nothing or the fallback). A $0-down car passes this check.
- **A crash or a recession, with weak jobs:** big purchases and new businesses drop sharply; loss-averse and crowd-following sims cut spending by 1–2 levels and lean toward saving; patient index investors and early retirees keep investing (buying low is in character for them).
- **Empty rentals in town** (a high vacancy share): buying another rental is a poor choice unless the sim is a real-estate investor with plenty of cash, and even then it's less likely.

### Numbers behind the words (v1.5)

| Term in this rubric | Means exactly |
|---|---|
| no paycheck | the who line says **unemployed** (even "for 0 months": just laid off) or in school |
| expensive debt | any debt at **20%+** with a balance of **$500 or more**; it blocks **every** purchase, including $0-down cars |
| below the cushion | cash + savings account **<** the cushion; it blocks **every** purchase, including $0-down cars |
| a falling month | the index fell **1.0% or more** last month (−1.0% counts) |
| a crash month | the index fell **5.0% or more** |
| a thin cushion | cash + savings **< 1.5×** the cushion |
| low income | earning **under $60k/yr** |
| lots of spare cash | the move offers **$25k or more** ("up to $N available") |
| crowd-following | "follows the crowd **high**" in traits |
| no savings line | savings account = **$0** |
| no investing (no paycheck) | main move is not index or stocks **and** invest share = **0** |

**A failed business in recent memories** is the sim's own, whether or not it owns a business now (v1.8). **Spend stays inside the archetype's range** after the clamp, with two exceptions: the no-paycheck cap, and **a red flag may take spend 1 below the range (2 below in a cash crunch)**: the gold labels do this in real crises.

**Boundaries are inclusive** (v1.7): a debt at exactly 6.5% counts as 6.5%+; an index move of exactly −1.0% is a falling month; cash + savings *equal to* the cushion covers it.

**Fallback lists** (v1.7): go down the archetype's fallback list and take the **first move that is offered**; "pay down debt" in a fallback list means any debt offered for payoff, whatever its rate. If nothing on the list is offered, change nothing.

**Stock pickers in a crash:** a crowd-following picker saves cash; any other picker keeps trading. (The crash's spend −1 applies once; there's no extra cut.)

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
| Saver | save cash; **but a debt offered for early payoff at 6.5%+, or any student loan, comes first** (v1.4: savers hate debt) | pay down debt > change nothing. **Savers invest in the index only rarely** (at most one decision in four), never when savings are the habit shown in recent memories |
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
3. **A debt at 6.5% or more** is offered for early payoff → pay down debt. **Under 25, a student loan counts at any rate** (v1.7: a 5.5% student loan qualifies). Step 2 still comes first.
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

### Default answers by archetype (v1.4, measured from the gold labels)

Start from the default, apply **every** adjustment that holds (**each counts separately**: a crash and weak jobs are −2; a raise and $150k+ income are +2), then **clamp the result** (a **no-paycheck cap beats the range**: an unemployed sim spends at most 2, or 3 for spenders and status seekers, even if the archetype's range starts higher; the floor is 1) to the archetype's range. When the main move isn't an investment, use the "otherwise" invest share. Start from the default, then adjust: **spend −1** for a red flag, weak jobs, a crash month (index −5% or worse), a business that just failed, or **a bankruptcy or missed payments in recent memories** (v1.8); **spend +1** for a raise in recent memories or income of $150k+. Stay inside the archetype's range.

| Archetype | Spend level (default, range) | Invest share when the move is index/stocks | Invest share otherwise |
|---|---|---|---|
| Saver | 3 (2–3) | 2 | 2 |
| Index investor | 4 (3–4) | 4 (3 for low income or a thin cushion) | 0 |
| Early retiree | 2 (2–3) | 4 (always; the thin-cushion and low-income exception is for index investors only) | 3 |
| Stock picker | 5 (4–5) | 3 (2 in a falling month) | 2 |
| Real estate investor | 4 (4–5) | 2 | 2 (3 with lots of spare cash) |
| Business owner | 5 (4–5) | 3 | 3 |
| Spender | 7 (6–8) | 0 | 0 |
| Status seeker | 6 (5–7) | 1 | 1 |
| Balanced | 4 (4–5) | 2 | 2 |


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
- **v1.4** (2026-11-22): Haiku under v1.3 matched gold on **94% of moves (120 test states)**, up from 78%, but only **42% of invest shares and 51% of spend levels exactly**: v1.3 gave ranges, not answers. v1.4 adds a **default spend level and invest share per archetype** (the gold labels' modes) with explicit ±1 adjustments, and fixes the recurring move misses: **savers pay down 6.5%+ or student debt before saving** (3 of 7 misses), **a purchase must leave the cushion covered** after its down payment, and the **cash crunch also triggers on zero cash with spending above take-home**. One gold label changed to follow the purchase check (logged).
- **v1.5** (2026-11-22): wave 1 under v1.4 (960 states, 8 Haiku agents) raised the same questions again and again: what counts as a thin cushion, low income, a falling month or lots of spare cash; whether a $0-down car beats a 24% card; whether a crowd-following picker trades in a crash; whether "unemployed for 0 months" means no paycheck. Two labellers bought a $0-down car with a 24% card outstanding, and v1.4's cash-crunch sentence read literally as "any 8% debt triggers a sale". v1.5 puts a **number behind every soft term**, says expensive debt and a short cushion block **every** purchase, splits the crunch into two plain conditions, and says how to combine and clamp spend adjustments. A rule checker (`research/finetune/check-labels.cjs`) now flags labels that break the hard rules.
- **v1.6** (2026-11-22): wave 2 (960 more states). Rule B sold a rental for a sim with $0 cash but **$254k** of savings; the one gold state behind rule B had savings barely over the cushion, so **B now needs savings under 2× the cushion**. Spend adjustments are explicitly **cumulative** (labellers split between "−1 per cause" and "−1 total"; as code, the two readings match gold spend on 61% vs 59% of states, so either is defensible, but one must be chosen). No savings line means $0; no paycheck means invest share 0.
- **v1.7** (2026-11-22): wave 3 (960 extra states). Labellers split on **under-25 balanced sims with a 5.5% student loan** (one invested, two paid it down): the rule now says outright that a student loan counts at any rate under 25. Also: boundaries are inclusive; fallback lists take the first offered move; the no-paycheck spend cap beats the archetype range; the thin-cushion invest exception is for index investors only; a crowd-following picker's crash cut isn't doubled.
- **v1.8** (2026-11-22): wave 4 (1,047 extra states). Crunch rule A's 8%+ debt gets the same **$500 balance floor** as expensive debt (a $125 card forced a sale); a failed business in memories counts as the sim's own; spend stays in the archetype range except under the no-paycheck cap or a red flag (1 below; 2 in a cash crunch), because the first strict version of the check flagged 8 *gold* labels, all crisis states. Checker rules R9 (under-25 real estate investors keep saving; the under-25 rule excludes them) and R10 (spend outside the range) added.
