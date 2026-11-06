# HighCastle UX Copy System — Builder, Developer, Consent, Failures

## Voice
Confident, precise, humane. Security is important but do not scare or patronize. Avoid broad 'unrestricted hacker' framing, '100% safe', fabricated vulnerability scores and copied Sandchest taglines.

## Brand
Hero: 'Your personal AI hacker.'
Supporting: 'HighCastle tests the weak points in the apps you build, captures what actually happens, and helps you verify the fix—inside authorized isolated environments.'
Primary CTA 'Try the controlled demo'; secondary 'How HighCastle proves a finding'.
Feature: 'Prove the risk. Prove the fix.'
Safety: 'You decide what HighCastle may test.'

## Onboarding
Builder: 'Let's check the app you're building.' / 'Choose a safe test environment.' / 'We'll use example accounts, not your real users.' / 'Review exactly what this security check is allowed to do.'
Developer: 'Select source revision.' / 'Map the authorized target environment.' / 'Review test pack and scope hash.' / 'Run BOLA verification.'
Demo ribbon: 'This is a deliberately vulnerable sample app. All accounts, invoices and outcomes are synthetic, and the tests execute in isolated infrastructure.'

## Scan
Queued: 'Your assessment is waiting for an isolated runner.'
Planning: 'HighCastle is identifying what to test. Nothing runs until the policy permits it.'
Preparing: 'Creating the disposable test environment.'
Executing: 'The approved test is running.'
Verifying: 'Comparing observed behavior with the expected security rule.'
Completed: 'Assessment complete. Review only the checks we actually ran.'
Partial: 'Some checks finished; others did not. Evidence is preserved.'
Canceled: 'The assessment was canceled. Runner cleanup is being verified.'
Blocked: 'That action was outside the authorized scope and was blocked.'
Model unavailable: 'The AI planning service did not respond. We did not substitute made-up results.'

## Finding
Builder: 'A test customer could read another test customer's invoice.'
Developer: 'Cross-account invoice read reproduced — broken object-level authorization.'
Confirmation: 'Confirmed by execution in the controlled test environment.' 
Inconclusive: 'The test did not establish whether this weakness exists. Try again after fixing the test setup.'
No results: 'No issues were reproduced in this assessment. That does not mean the entire application was security-tested.'

## Fix and replay
Prompt CTA: 'Copy fix instructions'.
Replay CTA: 'Verify against updated test app'.
Fix passed: 'The original cross-account check no longer reproduces, and the legitimate invoice workflow still works.'
Fix failed: 'The same unauthorized read is still possible in the test app.'
Regression: 'The unauthorized read stopped, but a legitimate workflow also broke.'
Unknown: 'We couldn't verify the patch outcome from the available evidence.'

## Consent dialog copy
Title: 'Authorize this security assessment'
Body: 'HighCastle will run only the listed non-destructive checks against our controlled synthetic invoice lab. No other site is in scope. You can cancel during the run.'
Rows: Allowed target, environment revision, synthetic identities, test class, time/request cap, expiry.
CTA 'Authorize and start'; secondary 'Review scope'. Server must enforce exact same fields.

## Error copy
403: 'You don't have permission to access this project.'
Scope expired: 'This testing permission has expired. Reauthorize before running again.'
Missing target: 'Connect a safe test environment to run executable checks.'
Evidence expired: 'This artifact is no longer available under the retention policy.'
Session expired: 'Sign in again to continue. Your scan continues on the server.'
Out of credits: 'Your workspace has reached its run limit. No new test has started.'

## Content SEO / public docs ethics
Describe authorized security testing, evidence-based analysis, scoped automation. Never promise an active scan for URL submitted without control proof, or claim exploit success with a hypothetical PoC. Screenshots of sample results require demo label.
