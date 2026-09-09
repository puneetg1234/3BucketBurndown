# 3BucketBurndown
Financial calculator that simulates the burndown of retirement corpus using 3-bucket strategy.


What happens each year
Every month Bucket 1 redeems enough to hand you that month's spending. All four buckets then compound one month at their weighted gross return. At the year end Bucket 2 refills Bucket 1 back to its target out of its own existing holdings, and Bucket 3 then tops Bucket 2 back up to its own target — targets being the Bucket 1 and Bucket 2 sizes you set, measured in months of the coming year's spending, so each year opens fully funded for the year ahead. If Bucket 2 cannot cover the Bucket 1 refill on its own, Bucket 3 backstops it. Nothing refills Bucket 3.

The emergency fund is funded once at the start and never touched again. It compounds at its own weighted return for the whole tenure and is never redeemed, so no tax is ever charged on it — in reality redeeming it would be taxed, so read its balance as a gross figure. If Bucket 1 empties mid-year the shortfall is pulled early from Bucket 2 and then Bucket 3 — never from the emergency fund.

The fund is filled before Buckets 1 and 2, so a corpus that cannot cover every opening size you asked for leaves the later buckets short — the sidebar warning names which ones. And because it is sealed, a bigger emergency fund shortens how long spending lasts: on the default plan, going from no fund to 24 months of one costs about two years of runway. Every "total corpus" figure here includes it, which is why the table and the CSV also carry a spendable column that leaves it out.

How tax is charged
Tax applies to redemptions, not to paper growth. Each bucket carries a cost basis, and when it redeems, only the gain portion of that redemption is taxed at the bucket's weighted rate. Delivering a given amount of spendable cash therefore means redeeming slightly more than that amount. Early on the gain portion is small and the effective bite is near zero; as unrealised gains build up it climbs toward the bucket's headline rate.

Every balance on this page — chart, table and CSV — is pre-tax. Unrealised gains inside a bucket have not been taxed, so the corpus at the end of the projection is worth less than it reads once you actually redeem it. Gains are tracked per bucket on an average-cost basis rather than per holding, so switching between asset classes inside a single bucket is free here; real rebalancing inside a bucket would be taxed. Losses are not carried forward or set off.

The defaults are the Indian long-term rates: 12.5% on equity, 20% on bonds and gilts, and a 30% slab on ultra-short and liquid holdings. The ₹1.25 lakh a year equity exemption is not modelled — it is worth at most about ₹15,600 a year, which changes nothing material over a long projection. Override any rate in the table above.

Assumption: The opening corpus is assumed to be freshly invested, so it starts with no embedded gains. And hence no taxes as well. If your actual holdings already carry large unrealised gains, real tax in the early years will be higher than shown.
Also, if you are re-structuring your existing portfolio to follow this bucket strategy, consider post-tax final amount as the opening corpus for this calculation.

Inflation
Inflation applies only to the monthly spends, which increases every year. Because Buckets 1 and 2 are defined in months of spending, their refill targets follow it up. Balances by-themselves are never inflation-adjusted.

It's merely a planning template, no advice provided.
Assumption: Returns are assumed to be steady every year; real markets do not provide steady returns. Bucket structure helps mitigate and soften this sequence-of-returns risk.

Send feedback and comments to puneetg123@yahoo.com
