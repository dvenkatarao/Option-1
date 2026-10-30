# Security Policy

## Supported versions

Security fixes are made against the latest code on the `main` branch. Older releases may not receive fixes.

## Reporting a vulnerability

Please do not disclose security vulnerabilities in public issues or pull requests. Use the repository's **Security → Report a vulnerability** flow to send a private report. If that option is unavailable, contact the maintainer through an established private channel and ask them to enable GitHub private vulnerability reporting; do not post the report publicly. Include the affected version, impact, and steps to reproduce where possible. We will investigate and coordinate any response privately.

## Current access and data-isolation model

The application currently uses one shared HTTP Basic credential. It does not have user accounts or per-user portfolio ownership: anyone with the credential can access all portfolios and transactions. Treat it as a single-owner deployment; do not share access with unrelated users or use it for separate customer accounts.
