# Security Policy

## Supported Versions

| Version | Supported              |
| ------- | ---------------------- |
| 0.0.x   | ✅ Currently supported |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**⚠️ Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report vulnerabilities via one of the following:

1. **GitHub Security Advisories**: [Report a vulnerability](https://github.com/sayandedotcom/chat-automation/security/advisories/new)
2. **Email**: Reach out directly via the contact information on the maintainer's [GitHub profile](https://github.com/sayandedotcom)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected component(s): `web`, `api`, `agent`, `database`, or `infrastructure`
- Potential impact assessment
- Suggested fix (if any)

### Response Timeline

| Action             | Timeline        |
| ------------------ | --------------- |
| Acknowledgment     | Within 48 hours |
| Initial assessment | Within 1 week   |
| Fix & disclosure   | Within 30 days  |

## Security Measures

This project implements the following security practices:

- **Authentication**: Google OAuth 2.0 via Passport.js with secure session management
- **Session Security**: HTTP-only cookies, secure flags, SameSite policy
- **API Security**: tRPC with authenticated procedures, input validation via Zod
- **Dependencies**: Automated updates via Dependabot, vulnerability scanning
- **Secrets**: Environment-based configuration, `.env.example` for safe templating
- **Docker**: Non-root containers, minimal base images
- **OAuth Tokens**: Encrypted storage for third-party service credentials
- **HITL (Human-in-the-Loop)**: AI agent actions requiring approval go through explicit user consent

## Scope

The following are **in scope** for security reports:

- Authentication & authorization bypass
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- SQL injection / Prisma query injection
- Insecure OAuth token handling
- AI agent prompt injection leading to unintended tool execution
- Server-side request forgery (SSRF)
- Sensitive data exposure

The following are **out of scope**:

- Vulnerabilities in third-party services (Google, Notion, Vercel APIs)
- Issues requiring physical access to the server
- Social engineering attacks
- Denial of service (DoS) attacks

Thank you for helping keep Chat Automation secure! 🔒
