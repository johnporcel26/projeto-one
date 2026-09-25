# Auth, sessions and player isolation

## Authority boundary

The HTTP API authenticates accounts and the WebSocket gateway authorizes the
game connection. The client never supplies a trusted `accountId` or `playerId`:
the server resolves the player solely from the authenticated socket's active
runtime session.

`SessionManager` is the only online registry. It indexes active sessions by
session id, account id and player id, and refuses all frames from a session
that is no longer `ACTIVE`.

## Account and token lifecycle

- An account has exactly one durable player row.
- Usernames and emails are unique case-insensitively.
- Passwords use salted Node `scrypt` hashes and constant-time verification.
- Session tokens are 256-bit opaque random values. SQLite stores only their
  SHA-256 hash, never the bearer token itself.
- Tokens expire after seven days. Login invalidates the account's prior active
  token; logout marks the current token as logged out.
- Login and registration are rate-limited per remote address. API bodies are
  bounded and malformed requests are rejected safely.

## Duplicate login and disconnects

When the same account opens a new login or WebSocket connection, the server:

1. persists the prior active player state;
2. marks its runtime session `REPLACED`;
3. sends `sessionReplaced` and closes the old socket;
4. ignores every old-socket game frame, including market frames; and
5. creates the replacement session from the durable player row.

Logout has a distinct `LOGGED_OUT` state. A transport close is treated as a
`DISCONNECTED` session and persists state, leaving reconnect policy explicit
for a future reconnect-token implementation.

## Isolation and maps

Every `GameSession` owns its PlayerDomain, analyzer, enemies, auto-hunt state,
cooldowns and combat feedback. Hunts/maps are therefore **INSTANCED** in this
alpha runtime. The marketplace is global, while inventories, wallets, escrow,
VIP, discoveries and automation settings remain player-owned.

## Offline marketplace settlement

The marketplace can hydrate an offline participant from the player repository.
The next critical market persistence write includes buyer state, changed offline
seller/bidder state, listing/offer state, ledger entries and pending sale
notifications in one SQLite `BEGIN IMMEDIATE` transaction. Sale notifications
are stored until that player next connects, then delivered once.

## Validation and tests

The server validates WebSocket intent shapes and bounded identifiers before
dispatch. The auth/isolation tests use disposable SQLite databases and actual
server processes/WebSockets to cover unauthorized upgrade rejection, spoofed
fields, two-account isolation, duplicate login replacement, old-socket market
rejection, five concurrent sessions and offline seller settlement.
