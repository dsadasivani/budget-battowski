# Budget Battowski — Functional Requirements

## 1. Document purpose

This document captures the functional scope and expected user experience for Budget Battowski. It is intended to serve as a shared reference for product planning, UX design, implementation, testing, and future enhancements.

Unless explicitly marked as an assumption, recommendation, or open question, the statements in this document are product requirements.

## 2. Product overview

Budget Battowski is a multi-workspace personal and shared finance application. It allows users to record and organize:

- Income
- One-time and recurring expenses
- Investments
- Loans
- Budgets by category
- Payment accounts
- Payment modes

The application presents financial data in the context of both a selected month and a selected workspace member. Recurring financial commitments are projected into future months, with recurring expenses and investments requiring review before they become confirmed data. Fixed loan EMIs are confirmed automatically.

## 3. Core concepts

### 3.1 User

A user is a registered person who can create workspaces and participate in workspaces created by other users.

### 3.2 Workspace

A workspace is the top-level container for the financial data managed by a user or group of users.

- A user can create multiple workspaces.
- The user who creates a workspace becomes its owner.
- The owner can add other registered Budget Battowski users to the workspace.
- Added users become workspace members.
- Financial data displayed in the application is scoped to the active workspace.

### 3.3 Workspace roles

The initially defined roles are:

| Role   | Definition                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Owner  | The user who created the workspace. Can invite or remove members and rename, delete, or archive the workspace.                   |
| Member | An existing application user who was added to the workspace. Has the same access to all other application features as the owner. |

Only owners can manage workspace membership or rename, delete, or archive a workspace. Apart from these administrative actions, owners and members have the same feature access. Existing registered users are found and invited by email address.

The implementation stores the user-facing **Member** role using the internal value `editor`. `editor` is not a separate product role and does not imply restricted financial-record editing.

### 3.4 Month context

Month is a global data-display factor throughout the application.

- The default selected month must always be the current calendar month.
- The user must be able to navigate both backward to previous months and forward to future months.
- All month-sensitive screens must display data for the selected month.
- Changing the selected month must update the relevant financial data across the application.

### 3.5 Workspace member context

Workspace member is the second global data-display factor.

- The member association represents the record owner.
- When a record is created, the application must implicitly record the signed-in creator as its owner rather than requiring manual owner entry in the normal flow.
- The user must be able to select one member of the active workspace.
- The user must also be able to select an **All members** option.
- When one member is selected, the application must show records owned by that member.
- When **All members** is selected, the application must show aggregated or combined data for all members in the active workspace.
- Changing the member selection must update the relevant financial data across the application.

### 3.6 Global data scope

Unless a screen is inherently workspace-wide, displayed data is determined by three pieces of context:

1. Active workspace
2. Selected month
3. Selected workspace member, or **All members**

## 4. Categories and budgeting

### 4.1 Categories

Categories classify financial records. A category can represent one of multiple financial types, including:

- Income
- Expense
- Investment

Additional category types may be introduced later, but are outside the currently defined scope.

### 4.2 Category management

Users must be able to create categories and assign each category its appropriate type. Categories should then be available when creating records of that type.

Examples:

- An expense category such as Groceries or Rent
- An income category such as Salary or Freelance
- An investment category such as Mutual Funds or Fixed Deposits

### 4.3 Budget assignment

Budgeting is performed while creating or configuring a category.

- A user can specify a budget for each expense category.
- Income and investment categories do not have budgets.
- The budget belongs to the category, rather than to an individual expense transaction.
- A category budget is monthly and repeats automatically every month.
- When a budget is changed, the new amount applies to the month in which the change becomes effective and to all future months.
- A budget change must not alter the category budget for previous months.
- Category budgets are used to compare planned spending with actual spending.
- Onboarding must encourage the user to assign budgets to expense categories.
- Onboarding must also suggest creating income and, where relevant, investment categories.

Budget rollover is not part of the confirmed behavior. Each month's applicable budget is the effective category budget for that month.

## 5. Income

### 5.1 Income records

Users must be able to create income records to track money received or expected.

An income record must support:

- A source or name
- An amount
- A cadence
- An income category
- A month
- Optional notes
- Optional start and end dates
- An implicitly recorded member owner

These fields reflect the current implementation. Income is not currently linked to a payment mode or payment account.

### 5.2 Supported income frequencies

Income supports two cadences in the current version:

- Monthly
- One-time

Additional income cadences are intentionally deferred for a future version.

### 5.3 Future application

- Recurring income records must be applied automatically to future applicable months based on their cadence.
- One-time income must apply only to its scheduled date or month.
- Income records do not require monthly review.
- Applicable income must therefore appear in the relevant month without an approval step.

## 6. Payment accounts

### 6.1 Purpose

Payment accounts represent the user's active financial accounts used for regular expenses. They make it possible to report spending by bank account and to connect an account to one or more payment modes.

### 6.2 Account creation

Users must be able to create all of their active payment accounts.

Creating a payment account must include:

- Selecting a bank
- Entering the last four digits of the account number

The application must not require or expose a full account number based on the current requirement.

### 6.3 Account usage

- Payment accounts are stored within the workspace and are owned by the member who created them.
- The creating member must be recorded implicitly on the account.
- When a specific member filter is active, only accounts owned by that member are shown. **All members** shows accounts belonging to all workspace members.
- A payment account can be linked to payment modes.
- A payment account can be associated with a loan to identify the account from which its payment is debited.
- The account association must allow the user to track spending by bank account.

## 7. Payment modes

### 7.1 Purpose

Payment modes identify how a transaction was paid. Users can create multiple modes and, where applicable, connect them to a payment account.

### 7.2 Supported payment modes

Payment-mode types are predefined rather than freely named by users. The predefined types are:

- UPI
- Credit card
- Debit card
- Net banking
- Cash

Wallet is not a supported payment-mode type. Cash is the default payment mode and is global to the workspace rather than owned separately by each member.

### 7.3 Linking accounts and modes

- Non-Cash payment modes are stored within the workspace and are permanently owned by the member who created them.
- The creating member must be recorded implicitly on a non-Cash mode.
- When a specific member filter is active, that member's modes and the workspace-global Cash mode are shown. **All members** shows all member-owned modes plus Cash.
- An applicable payment mode can link to no more than one payment account. Credit card modes do not use payment-account mapping.
- Multiple payment modes can link to the same payment account.
- A member-owned payment mode can link only to a payment account owned by that same member.
- When a financial record is created or updated, it can select only a payment mode owned by the record's permanent owner, except that every member may select workspace-global Cash.
- Historical records retain and display their saved account/mode references even if an old record contains a cross-member link; such a link cannot be newly created or reassigned during an update.
- Account-linked modes enable reporting both by payment mode and by bank account.
- Cash does not inherently require a linked payment account.

### 7.4 Reporting outcomes

The system must make it possible to determine:

- The amount spent using each payment mode
- The amount spent through each linked bank account

## 8. Loans

### 8.1 Loan records

Users must be able to record their existing loans.

A loan must support:

- Lender
- Loan type
- Principal amount
- Outstanding amount
- Annual interest rate
- EMI amount
- Start date
- End date
- Notes
- The payment mode used for the EMI and its linked payment account, where applicable
- An implicitly recorded member owner

These fields reflect the current implementation. Start and end dates determine the active loan period and its projected payment schedule. Loan cadence is always monthly; the user is not offered a cadence selector.

### 8.2 Future projections and confirmation

- Loan-related payments must be available in future applicable months.
- Loan EMIs are fixed monthly obligations and do not participate in monthly review.
- An applicable EMI is materialized automatically and is immediately treated as confirmed financial data.
- Users cannot change or skip an individual monthly EMI through review. Changes must be made on the loan source and apply only from the operation date forward.

## 9. Investments

### 9.1 Investment records

Users must be able to record and track their investments.

Investments may be:

- One-time
- Recurring

Investment records must be associated with the relevant workspace member and investment category.

The supported investment cadences are:

- Weekly
- Monthly
- Quarterly
- Half-yearly
- Annual
- One-time

An investment currently captures its name, amount, category, frequency, applicable date or start date, optional end date, notes, payment mode, linked payment account, and implicit member owner.

### 9.2 Current scope limitation

The application does **not** currently track:

- Profits
- Interest earned
- Gains or losses
- Current market value or investment performance

Tracking investment returns and performance is explicitly parked for a future phase.

### 9.3 Future projections and review

- Recurring investments must be available in future applicable months.
- A recurring investment generated for the current month must remain pending until it is handled through monthly review.
- During monthly review, the user can accept it unchanged, change its current-month amount, or delete it for the current month.
- Only accepted or modified-and-approved investment entries are reflected in the current month's confirmed financial data.
- A one-time investment applies only to its selected date or month.
- A one-time investment entered for a future date must participate in monthly review when its applicable month is reviewed.
- A one-time investment entered for the current date/month or a past date/month does not require monthly review and is reflected immediately.
- Investment payments must be linked to a payment mode and, through an account-backed mode, its payment account. Credit card modes do not require an account mapping.

## 10. Expenses

### 10.1 One-time expenses

A one-time expense represents a single transaction.

- Users must be able to record a one-time expense.
- It applies only to the date or month in which it is recorded.
- It should be assigned to an expense category.
- It should be associated with the applicable workspace member.
- It should be associated with a payment mode and, through that mode where applicable, a payment account.

The source requirements do not state that manually entered one-time expenses require monthly review; this document therefore treats them as immediately reflected in the selected month's data.

### 10.2 Recurring expenses

A recurring expense represents a repeating financial obligation. Examples include:

- House rent
- Electricity bill
- Maid salary

Users must be able to create recurring expenses with enough scheduling information to generate entries in future applicable months.

Each generated current-month entry must go through monthly review before it is included in confirmed current-month data.

The supported expense frequencies are:

- Weekly
- Monthly
- Quarterly
- Half-yearly
- Annual
- One-time

### 10.3 Expense tracking dimensions

Where applicable, an expense should be attributable to:

- Workspace
- Workspace member
- Month or transaction date
- Expense category
- Payment mode
- Payment account through the linked payment mode
- Origin: one-time manual entry, recurring expense, loan, or investment

These dimensions support member-level, category-level, payment-mode, and bank-account reporting.

### 10.4 Current financial record fields

The following table records the current implementation baseline for financial-record fields. System identifiers, audit history, creation timestamps, skipped months, and generated-source identifiers are maintained internally where applicable.

| Record            | User-facing fields                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Income            | Source, amount, cadence, income category, month, notes, start date, end date                                      |
| One-time expense  | Name, date/month, expense category, amount, note, payment mode                                                    |
| Recurring expense | Name, expense category, amount, frequency, start date, end date, payment mode                                     |
| Investment        | Name, amount, investment category, frequency, date, start date, end date, notes, payment mode                     |
| Loan              | Lender, loan type, principal, outstanding amount, annual rate, EMI, start date, end date, notes, EMI payment mode |

The signed-in member owner is recorded implicitly for every record. An account-backed payment mode provides the payment-account relationship. Attachments are not part of the current record model.

## 11. Future projections and monthly review

### 11.1 Projection sources

The following records must generate or provide entries for future applicable months:

- Loans
- Recurring investments
- Recurring expenses
- Recurring income

One-time records must appear only in their applicable month.

Recurring records currently support an end date. Pause/resume controls and additional exception types are not part of the current scope. The following boundary rules apply when generating or aggregating occurrences:

- Loan occurrences are monthly by default and have no user-selectable cadence.
- A loan's start-date day is its nominal monthly EMI day. If that day does not exist in a month, the EMI occurs on that month's last valid calendar day. The nominal day is preserved, so a day-31 loan returns to day 31 in the next month that has it.
- A clamped occurrence must still fall on or after the loan start date and on or before its exact end date.

### 11.2 Review requirement by source

| Source                                 | Projected into future months   | Monthly review required     |
| -------------------------------------- | ------------------------------ | --------------------------- |
| Recurring income                       | Yes                            | No                          |
| One-time income                        | No                             | No                          |
| Loan payment                           | Yes                            | No; automatically confirmed |
| Recurring investment                   | Yes                            | Yes                         |
| Future-dated one-time investment       | Scheduled for its future month | Yes                         |
| Current/past-dated one-time investment | No                             | No                          |
| Recurring expense                      | Yes                            | Yes                         |
| One-time expense                       | No                             | No                          |

### 11.3 Monthly review purpose

Monthly review allows users to verify financial entries generated from recurring investments, future-dated one-time investments, and recurring expenses. These generated entries are proposals until the user reviews them. Loan EMIs are excluded because they are fixed and automatically confirmed.

Monthly review is performed once for the entire workspace, not separately for each member. The review must include applicable pending records for all workspace members while retaining each record's member ownership.

### 11.4 Monthly review actions

For each generated current-month entry, the user must be able to:

1. **Accept as is** — approve the generated entry without changing its amount.
2. **Modify and accept** — change only the amount for the current month and approve the adjusted entry. No other fields are editable within monthly review.
3. **Delete for the current month** — remove or skip the generated entry for the current month.

Changing or deleting a generated entry during monthly review applies only to that month's instance. Deleting means **skip this month**; it does not delete the recurring source or affect future projections. Changing an amount must not alter the underlying recurring definition or future projections.

### 11.5 Review state and current-month totals

The following conceptual states are recommended to make the requirement testable:

| State                 | Meaning                                               | Included in confirmed current-month data |
| --------------------- | ----------------------------------------------------- | ---------------------------------------- |
| Pending review        | Generated but not reviewed                            | No                                       |
| Accepted              | Reviewed and accepted unchanged                       | Yes                                      |
| Modified and accepted | Reviewed, amount changed for this month, and accepted | Yes                                      |
| Deleted or skipped    | Removed for this month                                | No                                       |

Only approved entries may be reflected in the applicable month's confirmed totals, budgets, reports, dashboards, and other finalized views. Pending entries remain visible in the monthly-review queue but must not be treated as accepted expenses or included in dashboards.

Monthly review is available only for the current and future months. Once a month is in the past, any still-unreviewed recurring expense or investment occurrence is materialized automatically according to its source definition and treated as confirmed. Past months therefore do not retain an actionable pending queue.

### 11.6 Income exception

Income is explicitly excluded from monthly review. Recurring income must be applied automatically to each applicable month.

### 11.7 Editing and deleting recurring sources

Recurring-source changes use the date on which the user makes the change as their effective date.

- Editing a recurring income, expense, investment, or loan must affect only occurrences dated on or after the update date.
- Future pending entries dated on or after the update date must update automatically to match the changed recurring source.
- Past entries that have already been converted into expenses or otherwise accepted as financial records are historical records and must not change.
- Deleting a recurring source stops occurrences from the deletion date forward.
- Future pending entries dated on or after the deletion date must be removed because their source is no longer active.
- Historical approved entries generated by a deleted recurring source must remain unchanged.
- Deleting a recurring source must not cascade into or remove its linked category, payment mode, or payment account.

The following recurring-source identity fields are intentionally immutable in the current edit workflow: recurring-expense name and category; income source and cadence; investment name; and loan lender and loan type. To change one of these identity fields, the user must end or delete the old source and create a new source. Editable amount, schedule, end-date, notes, and payment fields continue to use the effective-date behavior above where the relevant editor exposes them.

Removing shared configuration must not leave broken references. Categories are retired through archival. When a category is in use, the user is shown usage counts and value impact and must either cancel or map all linked records to another same-type category; a replacement category can be created in that flow. Payment accounts and payment modes that are referenced by financial records are retained rather than hard-deleted.

A unified archive/history screen for all retired categories and ended financial sources is not required. Archived payment configuration retains its existing restore view, while ended or archived source discoverability may remain feature-specific.

## 12. New-user onboarding flow

### 12.1 Goal

When a new user enters the application, the product must teach the intended setup journey by guiding the user through screens in a prescribed order. The onboarding experience should explain why each step matters and allow the user to complete the associated setup task.

### 12.2 Required sequence

1. **Payment accounts**
   - Navigate the user to Payment Accounts.
   - Use the deterministic Payment Accounts destination `/payment-modes?tab=accounts` while accounts remain a tab of the combined payment setup screen.
   - Prompt the user to add all active accounts used for regular expenses.
   - Each account is created by selecting a bank and entering the account's last four digits.

2. **Payment modes**
   - Navigate the user to Payment Modes.
   - Help the user create relevant modes such as UPI, credit card, debit card, and net banking.
   - Link modes to the payment accounts created in the previous step.
   - Make clear that Cash is available as the default mode.

3. **Categories and budgets**
   - Navigate the user to Categories.
   - Help the user create expense categories.
   - Prompt the user to assign a budget to each expense category.
   - Suggest creating income categories.
   - Suggest creating investment categories when relevant.

4. **Income setup**
   - Navigate the user to the Income screen.
   - Help the user add one or more income records.
   - Allow the user to choose monthly or one-time cadence.

5. **Loans, if applicable**
   - Ask whether the user has existing loans.
   - If applicable, navigate to Loans and help the user add them.
   - If not applicable, allow the user to skip the step.

6. **Investments, if applicable**
   - Ask whether the user has existing investments.
   - If applicable, navigate to Investments and help the user add one-time or recurring investments.
   - If not applicable, allow the user to skip the step.

7. **Monthly expenses**
   - Navigate the user to Monthly Expenses.
   - Encourage the user to add their expenses.
   - Explain the distinction between one-time and recurring expenses.

### 12.3 Onboarding lifecycle

Onboarding is performed once per user, not once per workspace. Creating another workspace must not automatically restart the full new-user onboarding journey.

- Every onboarding step can be skipped.
- A step is complete only when the user explicitly marks it as complete.
- Skipping a step must not implicitly mark it as complete.
- The application must persist onboarding progress.
- The user can exit onboarding at any time and relaunch it later.
- When onboarding is relaunched, it must resume from the user's last incomplete step.
- A user can return to a previously skipped step and explicitly complete it later.

## 13. Functional relationships

The primary relationships are:

```text
User
  ├─ owns or joins one or more Workspaces
  └─ is an Owner or Member within each Workspace

Workspace
  ├─ contains Members
  ├─ contains Categories and category Budgets
  ├─ contains Payment Accounts and Payment Modes
  └─ contains member-associated financial records
       ├─ Income
       ├─ Expenses
       ├─ Loans
       └─ Investments

Payment Account
  ├─ can be linked to Payment Modes
  └─ can be selected as a Loan debit account

Recurring definitions
  ├─ generate future monthly entries
  └─ require Monthly Review, except Income
```

## 14. Baseline business rules

1. Every financial record belongs to one active workspace.
2. Financial records must be attributable to a workspace member so that member filtering works.
3. All applicable screens must respect the active workspace, selected month, and selected member scope.
4. The default month is the current month, and navigation supports both previous and future months.
5. **All members** combines data across the active workspace's members.
6. Record ownership is assigned implicitly to the signed-in member who creates the record.
7. Only owners manage members and rename, delete, or archive workspaces; all other feature access is the same for owners and members.
8. Budgets are available only for expense categories, repeat monthly, and use effective dating so changes affect the selected month and future months without rewriting history.
9. Cash is the default workspace-global payment mode and is visible regardless of the selected member.
10. A payment account is identified to the user by its bank and last four account digits.
11. Payment accounts and non-Cash modes are workspace records with a permanent member owner and respect the member filter; Cash is workspace-global.
12. A payment mode links to at most one account, while an account can have multiple linked modes.
13. Member-owned accounts, modes, and financial records may be linked only when their permanent owner is the same; workspace-global Cash is the exception.
14. Payment-mode and payment-account associations must support spending analysis by both dimensions.
15. Recurring income is automatically applied to future applicable months and does not require review.
16. Entries requiring review do not affect confirmed totals or dashboards until approved.
17. Monthly review occurs once per workspace and permits amount changes only; unreviewed items are auto-confirmed once their month is in the past.
18. A review-time modification or skip affects only the applicable generated instance.
19. Recurring-source changes automatically update future pending entries from the update date without changing converted historical entries.
20. Deleting a recurring source stops future occurrences while preserving approved historical entries and all configuration references.
21. Removing categories, payment accounts, or payment modes must not break references on existing records.
22. Investment performance, profit, and interest tracking are out of scope for the current version.
23. Every onboarding step is skippable and is complete only after the user explicitly marks it complete.
24. Onboarding progress persists so the user can exit, relaunch, and resume from the last incomplete step.

### 14.1 Dashboard and analysis

The Dashboard is a supported product capability, not an implementation-only preview. It must use only confirmed materialized expenses plus fixed loan EMI occurrences; pending review items are excluded. Within the active workspace, month, and member scope, it supports:

- income, expense, investment, budget, and balance summaries;
- savings rate, expense burn, available runway, and debt-to-income indicators;
- budget utilization and category comparisons;
- expense trends and income trends;
- member allocation when **All members** is selected;
- spending breakdowns by payment mode and linked bank account; and
- rule-based observations and suggestions derived from the displayed data.

These insights are informational and do not constitute financial advice or automated financial planning.

### 14.2 Planning and bulk maintenance

The Planning screen and its timeline are supported capabilities for inspecting and maintaining recurring definitions and future financial activity. The bulk editor supports spreadsheet-style entry and maintenance across its applicable records, including filtering, sorting, validation suggestions, deletion markers, and record audit panels. It must preserve permanent record ownership when a different workspace member edits a record.

Income has its own focused add/edit editor even though income data can also participate in planning views. The focused editor supports monthly and one-time income, income category, amount, effective dates, and notes. For an existing income record, its source, cadence, and permanent owner are immutable identity fields.

### 14.3 Import and export

The Import & Export feature supports:

- downloadable XLSX import templates populated with current category master data;
- CSV and XLSX imports for the supported financial and configuration record types;
- per-row validation, status, comments, and processed-result downloads;
- implicit assignment of imported financial records to the authenticated importer, with explicit owner assignment prohibited; and
- a versioned JSON export of the complete active workspace, including workspace membership, payment accounts, payment modes, categories, income sources, recurring expense definitions, materialized expenses, investments, loans, permanent ownership fields, and stored audit trails.

An export is a portable data snapshot. Internal synchronization timestamps and completed operational retry records are not part of the functional export contract.

### 14.4 Authentication, profiles, and fallback operation

Firebase-backed operation supports authenticated user sessions and registered-user lookup by email when inviting a workspace member. User profiles store display identity and the once-per-user onboarding lifecycle.

When Firebase is intentionally not configured, the application supports a local fallback workspace so the core experience can be demonstrated and tested without a remote account. This local bootstrap behavior is not a legacy-data migration facility and does not imply that production legacy records exist.

### 14.5 Payment presentation metadata

Payment modes may retain supported provider metadata for UPI and supported card-brand metadata for credit and debit cards. This metadata is used for recognizable labels and icons and does not change the predefined payment-mode types or same-owner linkage rules.

### 14.6 Responsive, archive, and protected configuration behavior

- The application supports responsive desktop and mobile navigation.
- Mobile workflows may use accessible bottom sheets instead of desktop dialogs while preserving the same validation and outcome.
- Archived payment accounts and modes remain available in their archive/restore views and on historical records.
- The Loan EMI expense category is protected system configuration. It is used for materialized loan EMI expenses and cannot be removed through ordinary category maintenance.
- Category remapping first persists resumable operation metadata, then processes categories, expenses, recurring expense definitions, incomes, and investments in idempotent stages. Interrupted operations remain retryable, resume automatically when the workspace is opened, and can be retried manually from the workspace screen.

## 15. Acceptance criteria summary

The initial functional scope is satisfied when a user can:

- Create more than one workspace.
- Add an already registered user to a workspace as a member.
- See the workspace creator identified as its owner.
- Allow only the owner to invite/remove members and rename, delete, or archive the workspace.
- Give owners and members equal access to all non-administrative features.
- Switch between workspaces.
- View the current month by default and navigate to both previous and future months.
- Filter data by one workspace member or view all members together.
- Assign the signed-in creator as record owner automatically.
- Create income, expense, and investment categories.
- Assign repeating monthly budgets to expense categories only.
- Change a budget for an effective month without changing previous months.
- Create payment accounts using a bank and the last four account digits.
- Filter payment accounts and modes by their creating member.
- Create predefined payment modes and link each applicable mode to at most one payment account.
- Link multiple payment modes to the same payment account.
- Use Cash as the workspace-global default payment mode.
- Prevent cross-member account/mode/record linking on create and update while preserving historical display.
- Record monthly and one-time income.
- See recurring income automatically applied to future applicable months without review.
- Record existing loans and select their debit accounts.
- Record monthly loans without selecting a cadence.
- Record one-time and recurring investments, linked to payment modes/accounts, without tracking returns.
- Record one-time and recurring expenses.
- See future entries generated from loans, recurring investments, and recurring expenses.
- See fixed loan EMIs confirmed automatically without review.
- Review current/future recurring expense and investment entries and accept, modify, or delete each one.
- Modify only the amount during review and treat deletion as skipping that month.
- Automatically materialize unreviewed occurrences after their month becomes historical.
- See only approved generated entries in confirmed current-month data.
- Perform monthly review once for the whole workspace.
- Update a recurring source and see future pending entries from the update date update automatically without changing past converted entries.
- Delete a recurring source and stop future generation without removing historical approved entries.
- Retire shared configuration without broken references, using archival/retention or an explicit category-remapping flow.
- Resume and safely retry an interrupted category remap without duplicating changes or losing its completed-stage progress.
- Add and edit income in a focused Income editor while preserving immutable identity and ownership fields.
- Complete the guided new-user setup journey once per user in the prescribed order, with conditional loan and investment steps.
- Skip any onboarding step without having it marked complete.
- Explicitly mark onboarding steps as complete.
- Exit onboarding and later resume from the last incomplete step.
- Analyze spending by payment mode and linked bank account.
- Use the supported dashboard indicators, trends, member allocation, and rule-based observations within the active scope.
- Inspect recurring and future activity through the Planning timeline and maintain supported records through the bulk editor.
- Import supported CSV/XLSX data with row-level results and download a complete versioned JSON workspace export.

## 16. Out of scope for the current version

The following items are explicitly or implicitly outside the confirmed scope:

- Investment profit tracking
- Investment interest tracking
- Investment gain/loss and performance tracking
- Automatic bank transaction import
- Full bank account-number storage
- Additional workspace roles beyond owner and member
- Pause/resume for recurring records
- Recurring exceptions beyond an end date and monthly-review skips
- Attachments on financial records
- New analytics, alerts, and reports beyond the supported Dashboard and Planning capabilities defined in section 14
- Unspecified financial features such as tax planning, bill payment, or money transfers

## 17. Clarification status

All questions from the original clarification set have been resolved and incorporated into this document. No functional clarification from that set remains open.

## 18. Future considerations

The following are natural extensions but are not current requirements:

- Investment valuation and return tracking
- Budget rollover and category carry-forward rules
- Bank integrations and transaction reconciliation
- More granular workspace roles and permissions
- Notifications for pending monthly review
- Forecast-versus-actual reporting
- Audit history for reviewed and modified generated entries
- Recurring-series exception management
