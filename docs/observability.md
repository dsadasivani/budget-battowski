# Operational observability

Budget Battowski emits one privacy-safe structured event for frontend failures. The event contract is vendor-neutral so a remote error service can be connected later by replacing the `OPERATIONAL_TELEMETRY_SINK` provider without changing application failure handling.

## Correlation model

Every deployed build publishes `/release.json` with an allowlisted environment, Git commit, GitHub Actions run ID, and generation timestamp. Firebase Hosting serves this path with `Cache-Control: no-store`, and the application loads it without caching before adding the release identity to later operational events.

Each event also has:

- a browser-session ID shared by events from the same application load;
- a unique correlation ID for the failure;
- a category and severity;
- safe operational context such as workspace ID, collection, operation, transaction group, chunk number, or route path.

The production smoke requires `/release.json` to identify the exact commit being deployed. This prevents a successful smoke of a stale Hosting release from being accepted as evidence for the current workflow run.

## Covered failure boundaries

The central telemetry path covers:

- Angular and browser-global unhandled errors;
- application bootstrap failures;
- lazy-route navigation failures;
- Firebase authentication observation, login, and logout failures;
- Firestore listeners, workspace hydration, profile sync, and writes;
- write-coordinator persistence and version-conflict errors;
- Monthly Review source conflicts.

Known errors are categorized as `authentication`, `firestore`, `firestore-permission`, `route-loading`, `write-coordinator`, `version-conflict`, or `monthly-review-source-conflict`. Unexpected failures use `unhandled`.

## Privacy boundary

Telemetry is an allowlist, not a serialized exception. Events never include raw exception messages, stack traces, emails, financial values, authentication tokens, source IDs, or record IDs. Query strings and URL fragments are removed from routes. Unsafe context values are discarded.

The default sink writes a single `[operational-event]` JSON record to the browser error console. QA regression and production smoke treat browser-console errors as failures, so synthetic-release failures are captured in their retained evidence reports.

This repository does not yet configure a third-party telemetry account or transmit real-user events to a centralized service. Before operational alerting is enabled, select an approved service, define retention and access controls, and replace the sink through Angular dependency injection. Do not weaken the event allowlist when connecting a remote sink.

## Local verification

Run the privacy and classification tests together with the application suite:

```bash
npm test -- --watch=false
```

Release metadata generation is covered by the orchestration tests:

```bash
npm run test:orchestration
```
