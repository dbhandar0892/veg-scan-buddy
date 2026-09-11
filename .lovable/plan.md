# Require sign-in before scanning

## Changes
- Redirect signed-out visitors from the Scan page to Sign In once account status finishes loading.
- Carry a safe return destination so Google, Apple, and email sign-in return users to Scan.
- Remove the optional “Skip” action when Sign In was opened for scanning.
- Keep the existing seven-day trial and expired-trial screen unchanged for signed-in users.

## Technical details
- Add a validated `redirect` query parameter to `/auth`, restricted to known same-origin app paths.
- Update OAuth and email callback destinations and the existing-session redirect to use that destination.
- Verify signed-out and signed-in navigation behavior in the preview.
