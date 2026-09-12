import path from 'node:path';

import type { Logger } from 'pino';
import type { PoolClient } from 'pg';

import type { AppConfig } from './config.js';
import { parseContractFile, type ContractRecord } from './contracts.js';
import type { Database } from './database.js';

const INSERT_BATCH_SIZE = 500;

export type ContractImportSummary = {
  cashContracts: number;
  futureContracts: number;
  totalContracts: number;
};

export async function importContracts(
  database: Database,
  config: Pick<
    AppConfig,
    'DATA_DIR' | 'NSE_CM_CONTRACT_FILE' | 'NSE_FO_CONTRACT_FILE'
  >,
  logger: Logger,
): Promise<ContractImportSummary> {
  const [cashContracts, futureContracts] = await Promise.all([
    parseContractFile({
      filePath: path.join(config.DATA_DIR, config.NSE_CM_CONTRACT_FILE),
      market: 'NSECM',
    }),
    parseContractFile({
      filePath: path.join(config.DATA_DIR, config.NSE_FO_CONTRACT_FILE),
      market: 'NSEFO',
    }),
  ]);

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "DELETE FROM app.contracts WHERE market IN ('NSECM', 'NSEFO')",
    );
    await insertContracts(client, cashContracts);
    await insertContracts(client, futureContracts);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const summary = {
    cashContracts: cashContracts.length,
    futureContracts: futureContracts.length,
    totalContracts: cashContracts.length + futureContracts.length,
  };
  logger.info(summary, 'contract import complete');
  return summary;
}

async function insertContracts(
  client: PoolClient,
  contracts: ContractRecord[],
): Promise<void> {
  for (let offset = 0; offset < contracts.length; offset += INSERT_BATCH_SIZE) {
    const batch = contracts.slice(offset, offset + INSERT_BATCH_SIZE);
    const values: (string | number | null)[] = [];
    const placeholders = batch.map((contract, index) => {
      const base = index * 6;
      values.push(
        contract.market,
        contract.token,
        contract.instrumentType,
        contract.symbol,
        contract.expiryDate,
        contract.contractName,
      );
      return `($${String(base + 1)}, $${String(base + 2)}, $${String(base + 3)}, $${String(base + 4)}, $${String(base + 5)}, $${String(base + 6)})`;
    });
    await client.query(
      `INSERT INTO app.contracts
        (market, token, instrument_type, symbol, expiry_date, contract_name)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
}
