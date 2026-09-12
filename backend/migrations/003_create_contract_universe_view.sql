CREATE VIEW app.contract_universe AS
WITH ranked_futures AS (
  SELECT
    symbol,
    token,
    expiry_date,
    row_number() OVER (
      PARTITION BY symbol
      ORDER BY expiry_date ASC, token ASC
    ) AS expiry_rank
  FROM app.contracts
  WHERE market = 'NSEFO'
    AND instrument_type = 'FUTSTK'
)
SELECT
  cash.symbol,
  cash.token AS cash_token,
  future.token AS future_token,
  future.expiry_date AS future_expiry
FROM ranked_futures AS future
INNER JOIN app.contracts AS cash
  ON cash.symbol = future.symbol
  AND cash.market = 'NSECM'
  AND cash.instrument_type = 'EQUITY'
WHERE future.expiry_rank = 1;
