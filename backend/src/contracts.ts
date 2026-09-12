import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

export type ContractMarket = 'NSECM' | 'NSEFO';

export type ContractRecord = {
  market: ContractMarket;
  token: number;
  instrumentType: 'EQUITY' | 'FUTSTK';
  symbol: string;
  expiryDate: string | null;
  contractName: string;
};

export type ParseContractFileOptions = {
  filePath: string;
  market: ContractMarket;
};

export class ContractParseError extends Error {
  public constructor(
    public readonly file: string,
    public readonly line: number,
    message: string,
  ) {
    super(`${file}:${String(line)}: ${message}`);
    this.name = 'ContractParseError';
  }
}

const FIELD_COUNT = 14;

export async function parseContractFile({
  filePath,
  market,
}: ParseContractFileOptions): Promise<ContractRecord[]> {
  const file = path.basename(filePath);
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const records: ContractRecord[] = [];
  const seenTokens = new Set<number>();
  let lineNumber = 0;

  try {
    for await (const line of lines) {
      lineNumber += 1;
      const fields = line.trim().split(/\s+/u);
      if (fields.length !== FIELD_COUNT || fields[0] === '') {
        throw new ContractParseError(
          file,
          lineNumber,
          `expected ${String(FIELD_COUNT)} whitespace-delimited fields, received ${String(line.trim() === '' ? 0 : fields.length)}`,
        );
      }

      const [
        tokenText,
        ,
        instrumentType,
        symbol,
        expiryText,
        ,
        ,
        ,
        ,
        ,
        ,
        ,
        ,
        contractName,
      ] = fields;
      if (
        tokenText === undefined ||
        instrumentType === undefined ||
        symbol === undefined ||
        expiryText === undefined ||
        contractName === undefined
      ) {
        throw new ContractParseError(
          file,
          lineNumber,
          'required contract fields are missing',
        );
      }

      const token = parseInteger(tokenText, 'token', file, lineNumber);
      const expiry = parseInteger(expiryText, 'expiryDate', file, lineNumber);
      const selectedInstrumentType =
        market === 'NSECM' && instrumentType === 'EQUITY'
          ? 'EQUITY'
          : market === 'NSEFO' && instrumentType === 'FUTSTK'
            ? 'FUTSTK'
            : undefined;
      if (selectedInstrumentType === undefined) continue;

      if (token <= 0) {
        throw new ContractParseError(
          file,
          lineNumber,
          'selected token must be positive',
        );
      }

      if (seenTokens.has(token)) {
        throw new ContractParseError(
          file,
          lineNumber,
          `duplicate selected token ${String(token)}`,
        );
      }
      seenTokens.add(token);

      if (symbol.length === 0 || contractName.length === 0) {
        throw new ContractParseError(
          file,
          lineNumber,
          'symbol and contractName must be non-empty',
        );
      }

      records.push({
        market,
        token,
        instrumentType: selectedInstrumentType,
        symbol,
        expiryDate: parseExpiry(market, expiry, file, lineNumber),
        contractName,
      });
    }
  } catch (error) {
    if (error instanceof ContractParseError) throw error;
    throw new Error(
      `${file}:${String(Math.max(lineNumber, 1))}: unable to read contract file`,
      {
        cause: error,
      },
    );
  } finally {
    lines.close();
    input.destroy();
  }

  return records;
}

function parseInteger(
  value: string,
  field: string,
  file: string,
  line: number,
): number {
  if (!/^-?\d+$/u.test(value)) {
    throw new ContractParseError(file, line, `${field} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ContractParseError(
      file,
      line,
      `${field} is outside the safe integer range`,
    );
  }
  return parsed;
}

function parseExpiry(
  market: ContractMarket,
  epochSeconds: number,
  file: string,
  line: number,
): string | null {
  if (market === 'NSECM') {
    if (epochSeconds !== -1) {
      throw new ContractParseError(
        file,
        line,
        'NSECM EQUITY expiryDate must be -1',
      );
    }
    return null;
  }

  if (epochSeconds <= 0) {
    throw new ContractParseError(
      file,
      line,
      'NSEFO FUTSTK expiryDate must be positive epoch seconds',
    );
  }
  const date = new Date(epochSeconds * 1_000);
  if (Number.isNaN(date.valueOf())) {
    throw new ContractParseError(
      file,
      line,
      'NSEFO FUTSTK expiryDate is invalid',
    );
  }
  return date.toISOString().slice(0, 10);
}
