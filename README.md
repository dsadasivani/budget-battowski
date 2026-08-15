# Budget Battowski

Angular 22 + Angular Material expense tracker with Firebase persistence.

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:4200/`.

On this Windows machine, use `npm.cmd` if PowerShell blocks the `npm.ps1` shim:

```bash
npm.cmd start
```

## Firebase Setup

1. Create a Firebase project.
2. Enable **Firestore Database**.
3. Enable **Authentication > Sign-in method > Google**.
4. Copy your Firebase web app config into `src/environments/environment.ts`.
5. Deploy the included Firestore rules:

```bash
firebase deploy --only firestore:rules
```

The app stores data under:

```text
budgetWorkspaces/{workspaceId}
budgetWorkspaces/{workspaceId}/paymentAccounts
budgetWorkspaces/{workspaceId}/paymentModes
budgetWorkspaces/{workspaceId}/categories
budgetWorkspaces/{workspaceId}/incomes
budgetWorkspaces/{workspaceId}/templates
budgetWorkspaces/{workspaceId}/expenses
budgetWorkspaces/{workspaceId}/investments
budgetWorkspaces/{workspaceId}/loans
budgetWorkspaces/{workspaceId}/categoryRemapOperations
```

Category remap operations are internal retry metadata. Interrupted remaps resume when the workspace is opened and can also be retried from the Workspace page.

## Checks

```bash
npm run build
npm test -- --watch=false
npm run test:rules
```

`test:rules` starts an isolated Firestore emulator on port `8085`, loads `firestore.rules`, runs the authorization suite, and then shuts the emulator down. Java is required by the Firestore emulator.
