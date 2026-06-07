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
budgetWorkspaces/{userEmail}/categories
budgetWorkspaces/{userEmail}/incomes
budgetWorkspaces/{userEmail}/templates
budgetWorkspaces/{userEmail}/expenses
budgetWorkspaces/{userEmail}/loans
```

## Checks

```bash
npm run build
npm test -- --watch=false
```
