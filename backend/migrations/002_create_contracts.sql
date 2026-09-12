CREATE TABLE app.contracts (
  market text NOT NULL CHECK (market IN ('NSECM', 'NSEFO')),
  token bigint NOT NULL,
  instrument_type text NOT NULL CHECK (instrument_type IN ('EQUITY', 'FUTSTK')),
  symbol text NOT NULL,
  expiry_date date,
  contract_name text NOT NULL,
  PRIMARY KEY (market, token),
  CHECK (
    (market = 'NSECM' AND instrument_type = 'EQUITY' AND expiry_date IS NULL)
    OR
    (market = 'NSEFO' AND instrument_type = 'FUTSTK' AND expiry_date IS NOT NULL)
  )
);

CREATE INDEX contracts_symbol_instrument_expiry_idx
  ON app.contracts (symbol, instrument_type, expiry_date);
