# QA Firebase Regression Report

Generated: 2026-06-17T16:16:03.095Z
Workspace: qa-regression-workspace
Result: Pass (52 passed, 0 failed)

## Automated Checks
| Check |Command |Exit |Duration |Output Tail |
| --- | --- | --- | --- | --- |
| Unit suite | npm.cmd test -- --watch=false | 0 | 35s | <br>> budget-battowski@0.0.0 test<br>> ng test --watch=false<br><br>> Building...<br>√ Building...<br>Application bundle generation complete. [7.541 seconds] - 2026-06-17T16:16:13.313Z<br><br><br> RUN  v4.1.8 C:/Users/dilic/OneDrive/Documents/budget-battowski<br><br><br> Test Files  1 passed (1)<br>      Tests  91 passed (91)<br>   Start at  21:46:13<br>   Duration  23.97s (transform 735ms, setup 575ms, import 1.52s, tests 19.58s, environment 1.98s)<br><br> |
| QA build | npm.cmd run build:qa | 0 | 9s | <br>> budget-battowski@0.0.0 build:qa<br>> ng build --configuration qa<br><br>> Building...<br>√ Building...<br>Initial chunk files \| Names              \|  Raw size<br>chunk-K4JNWTPB.js   \| -                  \|   2.40 MB \| <br>chunk-WBPCJOWA.js   \| -                  \| 931.63 kB \| <br>chunk-HVVLSL7Q.js   \| -                  \| 209.88 kB \| <br>main.js             \| main               \| 158.22 kB \| <br>styles.css          \| styles             \|  94.63 kB \| <br>chunk-MWNXQ4MQ.js   \| -                  \|  84.61 kB \| <br>chunk-CGQ43HW5.js   \| -                  \|  60.03 kB \| <br>chunk-QR6ZBNF5.js   \| -                  \|  26.40 kB \| <br>chunk-GOMI4DH3.js   \| -                  \|   1.37 kB \| <br><br>                    \| Initial total      \|   3.97 MB<br><br>Lazy chunk files    \| Names              \|  Raw size<br>chunk-Q5TDD4LL.js   \| xlsx               \| 872.23 kB \| <br>chunk-AZNKOY4W.js   \| index-esm          \| 811.06 kB \| <br>chunk-IO2CURYC.js   \| index-esm          \| 341.55 kB \| <br>chunk-KY6UALQM.js   \| payment-modes-page \| 157.76 kB \| <br>chunk-YAVR5SN3.js   \| browser            \| 153.79 kB \| <br>chunk-7U2YGBU7.js   \| expenses-page      \|  38.29 kB \| <br>chunk-IBLZWG2C.js   \| dashboard-page     \|  34.39 kB \| <br>chunk-E4VT3A4J.js   \| -                  \|  33.02 kB \| <br>chunk-NH6V2KRK.js   \| planning-page      \|  31.82 kB \| <br>chunk-GKDOZSC5.js   \| investments-page   \|  30.22 kB \| <br>chunk-F7I4UBTJ.js   \| workspace-page     \|  29.77 kB \| <br>chunk-YU2M65JM.js   \| loans-page         \|  25.85 kB \| <br>chunk-R722NRKL.js   \| categories-page    \|  22.72 kB \| <br>chunk-4PSEBSKL.js   \| -                  \|  15.65 kB \| <br>chunk-U22I33E7.js   \| import-export-page \|  13.84 kB \| <br>...and 1 more lazy chunks files. Use "--verbose" to show all the files.<br><br>Application bundle generation complete. [7.095 seconds] - 2026-06-17T16:16:46.919Z<br><br>Output location: C:\Users\dilic\OneDrive\Documents\budget-battowski\dist\budget-battowski<br><br> |

## Coverage
| Area |Account |Scenario |Result |Notes |
| --- | --- | --- | --- | --- |
| Pre-flight |  | Unit suite | Pass | Exit 0; 35s |
| Pre-flight |  | QA build | Pass | Exit 0; 9s |
| Auth/workspace | qa.owner@budget.test | Owner password login | Pass | QA login form authenticated and loaded workspace. |
| Accessibility and route smoke | qa.owner@budget.test | desktop /dashboard | Pass | Rendered Dashboard |
| Accessibility and route smoke | qa.owner@budget.test | desktop /expenses | Pass | Rendered Monthly Expenses |
| Accessibility and route smoke | qa.owner@budget.test | desktop /planning | Pass | Rendered Planning |
| Accessibility and route smoke | qa.owner@budget.test | desktop /investments | Pass | Rendered Investments |
| Accessibility and route smoke | qa.owner@budget.test | desktop /loans | Pass | Rendered Loans |
| Accessibility and route smoke | qa.owner@budget.test | desktop /categories | Pass | Rendered Categories |
| Accessibility and route smoke | qa.owner@budget.test | desktop /payment-modes | Pass | Rendered Payment Modes |
| Accessibility and route smoke | qa.owner@budget.test | desktop /import-export | Pass | Rendered Import |
| Accessibility and route smoke | qa.owner@budget.test | desktop /workspace | Pass | Rendered Workspace |
| Accessibility and route smoke | qa.owner@budget.test | desktop /settings | Pass | Rendered Settings |
| Accessibility and route smoke | qa.owner@budget.test | mobile /dashboard | Pass | Rendered Dashboard |
| Accessibility and route smoke | qa.owner@budget.test | mobile /expenses | Pass | Rendered Monthly Expenses |
| Accessibility and route smoke | qa.owner@budget.test | mobile /planning | Pass | Rendered Planning |
| Accessibility and route smoke | qa.owner@budget.test | mobile /investments | Pass | Rendered Investments |
| Accessibility and route smoke | qa.owner@budget.test | mobile /loans | Pass | Rendered Loans |
| Accessibility and route smoke | qa.owner@budget.test | mobile /categories | Pass | Rendered Categories |
| Accessibility and route smoke | qa.owner@budget.test | mobile /payment-modes | Pass | Rendered Payment Modes |
| Accessibility and route smoke | qa.owner@budget.test | mobile /import-export | Pass | Rendered Import |
| Accessibility and route smoke | qa.owner@budget.test | mobile /workspace | Pass | Rendered Workspace |
| Accessibility and route smoke | qa.owner@budget.test | mobile /settings | Pass | Rendered Settings |
| Functional regression | qa.owner@budget.test | Owner can manage workspace | Pass | true |
| Functional regression | qa.owner@budget.test | Seeded collections loaded | Pass | {"categories":9,"expenses":7,"loans":3} |
| Functional regression | qa.owner@budget.test | Dashboard totals populated | Pass | {"income":35000,"outflow":64370.75,"debtEmi":55000} |
| Functional regression | qa.owner@budget.test | Member filter changes selected state | Pass | Editor member outflow compared with all-member outflow. |
| Functional regression | qa.owner@budget.test | Archive payment mode | Pass |  |
| Functional regression | qa.owner@budget.test | Restore payment mode | Pass |  |
| Functional regression | qa.owner@budget.test | Mapped account archive is blocked | Pass | Remove mapped payment modes before archiving this account |
| Functional regression | qa.owner@budget.test | Restore archived payment account | Pass |  |
| Functional regression | qa.owner@budget.test | Monthly review has pending rows | Pass | 8 |
| Functional regression | qa.owner@budget.test | Monthly review approve row | Pass | {"id":"expense:tpl-annual-renewal","sourceId":"tpl-annual-renewal","sourceType":"expense","label":"Annual Software Renewal","categoryName":"Utilities","memberName":"QA Editor","amount":11911,"pendingDelete":false} |
| Functional regression | qa.owner@budget.test | Monthly review delete/skip row | Pass | {"id":"expense:tpl-insurance-quarterly","sourceId":"tpl-insurance-quarterly","sourceType":"expense","label":"Quarterly Insurance","categoryName":"Health","memberName":"QA Owner","amount":7200,"pendingDelete":true} |
| Functional regression | qa.owner@budget.test | Past month recurring/EMI prefill | Pass | {"before":1,"after":5,"templateIds":["tpl-skipped-current","loan:loan-personal","tpl-rent-monthly","tpl-ended-subscription"]} |
| Functional regression | qa.owner@budget.test | Create one-time expense | Pass |  |
| Functional regression | qa.owner@budget.test | Update one-time expense | Pass |  |
| Functional regression | qa.owner@budget.test | Delete one-time expense | Pass |  |
| Functional regression | qa.owner@budget.test | Create one-time investment | Pass |  |
| Functional regression | qa.owner@budget.test | Update investment | Pass |  |
| Functional regression | qa.owner@budget.test | Delete investment | Pass |  |
| Functional regression | qa.owner@budget.test | Create loan | Pass |  |
| Functional regression | qa.owner@budget.test | Update loan | Pass |  |
| Functional regression | qa.owner@budget.test | Delete loan | Pass |  |
| Auth/workspace | qa.editor@budget.test | qa.editor@budget.test password login | Pass | QA login form authenticated and loaded workspace. |
| Role and permission regression | qa.editor@budget.test | Workspace member can load QA workspace | Pass | {"email":"qa.editor@budget.test","workspaceId":"qa-regression-workspace","categories":9} |
| Role and permission regression | qa.editor@budget.test | Workspace management permission is owner-only | Pass | false |
| Role and permission regression | qa.editor@budget.test | Workspace member can write subcollection records | Pass | qa.editor@budget.test |
| Auth/workspace | qa.member@budget.test | qa.member@budget.test password login | Pass | QA login form authenticated and loaded workspace. |
| Role and permission regression | qa.member@budget.test | Workspace member can load QA workspace | Pass | {"email":"qa.member@budget.test","workspaceId":"qa-regression-workspace","categories":9} |
| Role and permission regression | qa.member@budget.test | Workspace management permission is owner-only | Pass | false |
| Role and permission regression | qa.member@budget.test | Workspace member can write subcollection records | Pass | qa.member@budget.test |

## Issues
No blocking issues observed in the automated QA Firebase regression run.

## Console Errors
No browser console errors captured by the CDP runner.

## Residual Risk
- Bulk-editor form typing was not exhaustively driven field-by-field; create/update/delete coverage was exercised through the authenticated app store and Firestore listener path.
- Import/export was covered by route/control smoke and existing unit coverage, not by uploading a binary file in this browser run.
- The final QA workspace is intentionally left in its post-regression mutated state for debugging; rerun `npm run qa:seed` to reset it.
