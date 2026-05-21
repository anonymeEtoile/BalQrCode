# Security Specification

1. Data Invariants:
- A user is only authorized if their email is "emile.repellin.31@gmail.com" or if there is a document in `/admins/{email}` where `{email}` matches their verified email address.
- Only authorized admins can read or write any collection.
- A ticket `scanned` field can only be flipped to `true` if `scanActive` in global settings is true.
- A ticket cannot transition from scanned=true back to scanned=false.
- Admins cannot modify ticket prices maliciously.

2. The "Dirty Dozen" Payloads:
- Add a ticket without being an admin
- Read tickets without being an admin
- Add an admin to `/admins/{some_email}` as a non-admin
- Add an admin as an admin but with invalid email format document ID
- Add a ticket with a bad shape
- Update ticket to be scanned=true when scanActive is false
- Update ticket scanned to false when it was true
- Delete a ticket
- Do a blanket read over tickets bypassing admin check
- Add a ticket with fake `createdAt` timestamp
- Add a ticket with spoofed `createdBy` uid
- Modify `scanActive` to something else than boolean

We'll capture these in rules.
