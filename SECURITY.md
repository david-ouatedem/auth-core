# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.5.x   | Yes       |
| < 0.5   | No        |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue, email **security@authcore.dev** with:

1. A description of the vulnerability
2. Steps to reproduce
3. The potential impact
4. Any suggested fixes (optional)

You should receive an acknowledgment within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Design Principles

AuthCore follows these security practices:

- **Password hashing**: bcrypt with 12+ rounds
- **Token storage**: tokens are SHA-256 hashed before database storage; raw tokens are returned to the user only once
- **Token comparison**: always uses `crypto.timingSafeEqual` to prevent timing attacks
- **Email enumeration prevention**: forgot-password always returns 200 regardless of whether the email exists
- **Input validation**: all inputs validated with Zod before any processing
- **Token expiry**: password reset tokens expire in 1 hour, email verification in 24 hours, invitation tokens in 48 hours

## Responsible Disclosure

We ask that you:

- Give us reasonable time to fix the issue before public disclosure
- Do not exploit the vulnerability beyond what is necessary to demonstrate it
- Do not access or modify other users' data

We will credit you in the release notes (unless you prefer to remain anonymous).
