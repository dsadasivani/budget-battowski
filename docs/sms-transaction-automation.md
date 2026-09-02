# SMS transaction automation

## Architecture

Budget Battowski keeps its existing Angular → Firebase Authentication → Firestore Web SDK → Firestore Rules architecture. The `api` Firebase Cloud Function is used only where an external Android device or a secret requires a trusted boundary.

```text
Android SMS → MacroDroid → Hosting /api rewrite → v2 api Function
  → device authentication → parser registry → deduplication
  → budgetWorkspaces/{workspaceId}/smsTransactions
  → Angular review → explicit Submit → expenses
```

Incoming SMS messages never create expenses directly. Accept and Discard are staged on the SMS transaction, and Submit finalizes only staged rows. Processed and discarded records remain as history.

The function runs in `asia-south1` with 256 MiB, generation-1 CPU allocation, zero minimum instances, and a bounded maximum instance count for low-cost sporadic traffic. Firebase Hosting routes `/api/**` to `api` before the Angular fallback.

## Security model

- Pairing-session creation requires a verified Firebase ID token and server-side workspace membership.
- MacroDroid never sends a trusted UID or workspace ID. Identity comes only from the authenticated device record.
- A device credential has the form `bb_dev_<public-id>.<random-secret>`. Firestore stores only the SHA-256 secret hash.
- Secret comparison is constant-time. Revoked and paused devices are rejected.
- Pairing codes are random, hashed, single-use, expire after ten minutes, and are protected by Firestore-backed rate limits.
- The ingestion endpoint enforces strict JSON types, a 2,000-character message limit, and rejects identity fields in the payload.
- Raw SMS text, authorization headers, device secrets, OTPs, and full account numbers are never logged.
- `budgetIngestionDevices`, `budgetPairingSessions`, `budgetSmsEventReceipts`, and `budgetApiRateLimits` have no client access. Device-list responses are explicitly sanitized and never include `tokenHash`.
- SMS records are workspace-scoped. Rules keep `ownerUid` immutable, restrict editable fields, and prohibit client deletion.
- An SMS-derived expense must reference an existing same-owner SMS transaction in the same workspace. Its provenance fields cannot later be changed.

GCP/Firebase provides encryption at rest. Raw messages are currently stored in `smsTransactions`; their optional field is intentionally separate from normalized metadata so a future retention process can remove raw text without deleting audit history.

## Collections

| Path                                                               | Access                   | Purpose                                                            |
| ------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------ |
| `budgetIngestionDevices/{deviceId}`                                | Admin SDK only           | Hashed credential, workspace binding, state, and health timestamps |
| `budgetPairingSessions/{id}`                                       | Admin SDK only           | Hashed short-lived, single-use pairing code                        |
| `budgetSmsEventReceipts/{hash}`                                    | Admin SDK only           | `deviceId + eventId` idempotency receipt                           |
| `budgetApiRateLimits/{hash}`                                       | Admin SDK only           | Short rate-limit windows                                           |
| `budgetWorkspaces/{workspaceId}/smsTransactions/{id}`              | Workspace members        | Normalized review and audit record; optional raw SMS               |
| `budgetWorkspaces/{workspaceId}/smsTransactionFingerprints/{hash}` | Admin SDK only           | Cross-source-ready normalized financial fingerprint                |
| `budgetWorkspaces/{workspaceId}/expenses/{id}`                     | Existing workspace rules | Existing-format expense with optional SMS provenance               |

No migration is needed. Existing expenses without `source` are treated conceptually as manual.

## API contract

All production URLs use `https://budget-battowski.web.app/api`; QA uses `https://budget-battowski-qa.web.app/api`.

### Create pairing session

`POST /v1/integrations/sms/pairing-sessions`

Authorization: Firebase ID token. Body: `{ "workspaceId": "..." }`.

Returns a six-digit `pairingCode` and ISO `expiresAt`. The plain code is returned only to the authenticated caller and is not stored.

### Pair device

`POST /v1/integrations/sms/pair`

```json
{
  "pairingCode": "482719",
  "deviceName": "Samsung Galaxy S23",
  "connectorVersion": "1.0"
}
```

The success response contains only `deviceId` and `deviceToken`. MacroDroid must persist the token immediately; it cannot be recovered from Budget Battowski.

### Ingest SMS

`POST /v1/ingestion/sms`, with `Authorization: Bearer <deviceToken>`.

```json
{
  "eventId": "stable-event-id",
  "sender": "VM-HDFCBK",
  "message": "Rs.450 debited from HDFC A/C XX1234 via UPI to ZOMATO",
  "receivedAt": "2026-09-01T07:42:00+05:30",
  "connectorVersion": "1.0"
}
```

Responses are `202` for received, duplicate, or safely ignored messages; `400` for invalid input; `401` for an invalid token; `403` for paused/revoked devices; and `429` for rate limiting. Duplicate delivery is successful from the connector's perspective.

### Device management

- `GET /v1/integrations/sms/devices?workspaceId=...` with a Firebase ID token returns sanitized device metadata.
- `PATCH /v1/integrations/sms/devices/{deviceId}` with a Firebase ID token and `workspaceId` supports `deviceName` and `status` (`active`, `paused`, or `revoked`). Revocation is permanent because the secret is discarded.
- `POST /v1/integrations/sms/heartbeat` with a device token updates `lastSeenAt`. Every few hours is sufficient.

## Parser and matching

The registry tries HDFC, ICICI, Axis, SBI, and then a generic bank parser. A parser extracts type, amount, account suffix, merchant, reference, payment hint, bank, date, and confidence when available. OTP, verification, and obvious promotion text is rejected before parsing. Confidence is a review hint only.

Account matching uses the device owner UID, normalized bank name, and last four digits. It assigns an account only when exactly one active account matches. A payment mode is assigned only when exactly one linked mode matches the UPI/card/banking hint. Available balances are not used to mutate account balances.

Category suggestions are reusable deterministic merchant rules which resolve to an existing expense category by name. The user still confirms the category.

Deduplication first uses a SHA-256 receipt for `deviceId + eventId`, then a normalized financial fingerprint containing workspace, owner, account suffix, amount, type, reference, hourly window, and merchant. Both writes occur in the same Firestore transaction as the SMS transaction.

## Review and submission workflow

`/sms-transactions` provides Pending, Processed, and Discarded views; search; date, bank, paid-via, category, attention, and decision filters; desktop rows; mobile cards; expandable editing; bulk selection; bulk category/payment/notes; staged Accept/Discard; and Accept Ready.

Accepted rows require a debit/withdrawal type, transaction date, positive amount, merchant, category, owner, and payment mode. Discarded rows need no enrichment.

Submit uses one Firestore transaction per decision. Accepted expense IDs are deterministic (`sms_<smsTransactionId>`), so double submit cannot create a second expense. The transaction creates the existing `ExpenseEntry`, updates the SMS status and bidirectional IDs, or leaves an already-finalized row unchanged. Independent transactions allow partial success to be reported without duplicating successful rows.

## Universal MacroDroid connector

The repository intentionally documents a build-and-export blueprint instead of committing hand-authored `.macro` JSON. MacroDroid's serialized class fields are app-version-specific; exporting from the supported app version is the reliable way to produce an importable file. The resulting export is universal because it contains only public Hosting URLs and empty local variables—never a user token, UID, or workspace ID.

The in-app guide is also available at `public/macrodroid/sms-connector-setup.html`.

### Variables

Create persistent macro-local variables:

| Name                   | Type       | Initial value |
| ---------------------- | ---------- | ------------- |
| `bb_device_token`      | String     | empty         |
| `bb_device_id`         | String     | empty         |
| `bb_connected`         | Boolean    | false         |
| `bb_connector_version` | String     | `1.0`         |
| `bb_last_success`      | String     | empty         |
| `bb_pending`           | Dictionary | empty         |
| `bb_request`           | Dictionary | empty         |
| `bb_response`          | String     | empty         |
| `bb_http_status`       | Integer    | `0`           |
| `bb_retry_count`       | Integer    | `0`           |

Macro-local variables persist across device reboot. Keep them excluded from MacroDroid logs where the installed version provides that option.

### Triggers in the one macro

1. **Macro Enabled**: run pairing/test setup.
2. **SMS Received → Any Number → Any Content**: capture sender and message. Optionally enable **Monitor Inbox** only as an additional resilience mode; do not depend on historical replay.
3. **Regular Interval → 15 minutes**: drain queued events when connectivity returns.
4. **Regular Interval → 3 hours**: heartbeat.

The SMS trigger needs `RECEIVE_SMS`; Monitor Inbox additionally needs inbox access. It does not capture RCS/chat messages.

### Pairing action block

1. If `bb_device_token` is not empty, call heartbeat. If it returns 200, set `bb_connected = true` and stop this branch.
2. Prompt for the six-digit pairing code and device display name.
3. Populate `bb_request` with `pairingCode`, `deviceName`, and `connectorVersion`.
4. Add **HTTP Request**: POST to `https://budget-battowski.web.app/api/v1/integrations/sms/pair`, content type `application/json`, content body `{lvjson=bb_request}`. Save response to `bb_response` and status to `bb_http_status`.
5. On status 200, use **JSON Parse** from `bb_response` to a temporary dictionary. Copy `deviceToken` and `deviceId` into their persistent variables, clear the response dictionary, call heartbeat, and show a success notification.
6. On 400/410/429, show the returned error and leave the token empty. Never write the response or entered code to the system log.

Use the QA Hosting domain while validating the exported connector, then switch the public URL to production before distribution.

### SMS queue and send action block

1. Apply only lightweight candidate filtering. Include debit/credit/payment/UPI/ATM/POS/refund/transfer/currency terms; exclude OTP, verification, and obvious marketing terms. Server validation remains authoritative.
2. Generate `eventId` once (for example `md_<epoch-milliseconds>_<random-integer>`). Never regenerate it during retry.
3. Before any network request, add a `bb_pending[eventId]` dictionary entry containing `eventId`, sender magic text, message magic text, ISO received time, and connector version.
4. Call the drain action block. For each pending entry, populate `bb_request` and POST to `https://budget-battowski.web.app/api/v1/ingestion/sms` with:
   - `Authorization`: `Bearer {lv=bb_device_token}`
   - `Content-Type`: `application/json`
   - Body: `{lvjson=bb_request}`
   - Response/status saved to temporary variables
5. On 200, 202, or 409, remove that event from `bb_pending` and set `bb_last_success`.
6. On 400, quarantine/remove the invalid event and notify once; retry cannot repair it.
7. On 401 or 403, set `bb_connected = false`, stop draining, and ask the user to reconnect. Do not retry indefinitely.
8. On 429, timeout, network failure, or 5xx, keep the event. Stop the current drain after five attempts. The 15-minute trigger provides bounded backoff without a long-running loop.

Use a macro setting that prevents simultaneous invocations, or guard the drain block with a Boolean `bb_draining`, so an interval retry and an SMS trigger cannot drain the same dictionary concurrently. Server idempotency remains the final safety boundary.

### Heartbeat and export

The three-hour branch POSTs to `/api/v1/integrations/sms/heartbeat` with the device Authorization header. A successful heartbeat updates `bb_last_success`. A failure leaves the last success unchanged.

After QA validation:

1. Clear `bb_device_token`, `bb_device_id`, `bb_connected`, `bb_pending`, all response variables, and any test SMS text.
2. Confirm the macro contains the production Hosting domain only and contains no UID, workspace ID, pairing code, Authorization value, personal sender, or personal message.
3. In MacroDroid, open the macro menu and choose **Share/Export Macro** (the exact label varies by app release).
4. Save as `budget-battowski-sms-connector-v1.0.macro`.
5. Import it on a clean test device, enter a fresh QA pairing code, test offline retry, duplicate delivery, pause, revoke, and heartbeat, then clear it again before release.

MacroDroid officially documents the [SMS Received trigger](https://www.macrodroidforum.com/wiki/index.php/Trigger%3A_SMS_Received), [HTTP Request action](https://macrodroidforum.com/wiki/index.php/Action%3A_HTTP_Request), and [JSON Parse action](https://macrodroidforum.com/wiki/index.php/Action%3A_JSON_Parse).

## Operations and known limitations

- MacroDroid can retry an SMS it received while offline. It cannot guarantee recovery if Android force-stopped MacroDroid or the SMS trigger never fired.
- RCS/chat messages are not SMS and are not captured by the SMS trigger.
- Heartbeat indicates recent connector activity, not completeness. The UI warns after eight hours and never claims that all transactions were captured.
- Credits, refunds, and transfers remain reviewable but cannot become expenses in P0.
- No income creation, transfer reconciliation, historical inbox scan, email ingestion, notification ingestion, AI parsing, or bank API integration is included.
- Revoked device tokens cannot reconnect. Generate a new pairing code to create a new credential.
- Raw SMS retention is not automated in P0.

## Deployment and QA

CI installs and tests both dependency trees, builds Angular and Functions, runs Angular and Firestore-rule tests, configures one-day Artifact Registry cleanup for the Asia-South1 Functions repository, and deploys `firestore:rules,functions,hosting`. `develop` targets QA and `master` targets production through the existing Workload Identity authentication; no service-account JSON secret is added. The deployment identity therefore needs `artifactregistry.repositories.update` and `artifactregistry.versions.delete` in addition to the existing Firebase deployment permissions.

QA acceptance should cover pairing expiry/single use, wrong and paused/revoked tokens, ingestion payload limits, every representative parser, duplicate event IDs, offline replay, workspace isolation, all filters and bulk actions, invalid accepted rows, mixed submit, double submit, audit links, responsive cards, keyboard navigation, AXE, heartbeat, and stale warnings.
