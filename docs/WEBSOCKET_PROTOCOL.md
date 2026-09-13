# WebSocket Protocol

## Endpoint and encoding

Clients connect to `ws://<host>:<port>/ws` by default. `WEBSOCKET_PATH` can change the path. Messages are UTF-8 JSON objects sent by the server; protocol version `1` does not define client-to-server application messages.

Every server message contains:

- `type`: `snapshot`, `delta`, or `status`.
- `version`: integer `1`.
- `sequence`: a non-negative integer representing the latest published data revision.

Only a published delta increments `sequence`. Status messages carry the latest data sequence without incrementing it. A snapshot is authoritative at its included sequence; clients should replace all local rows with it and then accept only deltas whose sequence is greater than the locally applied sequence.

## Market row

Snapshot and delta rows use this exact shape:

```json
{
  "symbol": "ABC",
  "stockLtp": 123.45,
  "futureLtp": 125.67,
  "buySpread": 2.22,
  "sellSpread": -2.45
}
```

All four numeric fields are rupee values converted from internal integer paise. An unavailable value is JSON `null`. The five frontend columns map directly to `symbol`, `stockLtp`, `futureLtp`, `buySpread`, and `sellSpread`.

## Snapshot

The server sends a full snapshot immediately after every successful connection, before that client's current status message:

```json
{
  "type": "snapshot",
  "version": 1,
  "sequence": 0,
  "rows": []
}
```

`rows` always contains all 228 symbol rows, including `NSETEST` symbols and rows whose prices are all `null`. A client must replace its entire local table with the snapshot. During a reconnect, the snapshot may already include state accumulated since the last published delta; a following delta can therefore repeat values and remains safe to apply by symbol.

## Delta

While replay is running, changed symbols are coalesced by symbol and published at most once per one-second interval:

```json
{
  "type": "delta",
  "version": 1,
  "sequence": 1,
  "rows": []
}
```

`rows` contains one or more complete market rows. Clients apply them as upserts keyed by `symbol`. A client should ignore a delta whose sequence is less than or equal to its locally applied sequence. If a sequence gap is observed, the client should reconnect to obtain a fresh authoritative snapshot.

When replay finishes, the server immediately flushes any changes remaining since the last interval before publishing `complete`. This final flush does not wait for the next timer tick.

## Status

Status messages use this shape:

```json
{
  "type": "status",
  "version": 1,
  "sequence": 0,
  "status": "waiting",
  "error": null
}
```

`status` is one of:

- `waiting`: no client has started the global replay yet.
- `running`: the single global replay is processing files.
- `complete`: both workers completed and all final changes were flushed.
- `error`: replay stopped because of an error.

`error` is `null` except for `error` status, where it contains a safe diagnostic message. A newly connected client receives the current status after its snapshot. The first client connection transitions the one global replay from `waiting` to `running`; later connections never start another replay. Completion and error states remain available to new clients along with the retained snapshot.
