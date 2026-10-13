# Development guide

This project runs on high trust and high autonomy. The owner evaluates business outcomes and production risk. Developers are trusted to exercise professional technical judgment.

## Autonomy

Within the existing technology stack, you have broad authority to:

- Choose implementation details
- Organize and divide work
- Create branches, commits, and pull requests on your own schedule
- Refactor when it improves quality, maintainability, security, or performance
- Recommend better tools, architecture, and workflows
- Coordinate directly with each other
- Fix routine bugs and technical debt without seeking approval for every decision

## Mandatory safeguards

- Never commit directly to `main`
- Use pull requests for production changes
- Automated checks must pass before merging
- Develop and test against staging, not production
- Database schema changes must use reviewed migration files
- Never commit or share passwords, tokens, service-role keys, `.env` files, or production customer data
- In pull requests, clearly identify database changes, new environment variables, security implications, breaking changes, and rollback considerations
- Material changes to product behavior, infrastructure cost, authentication, authorization, customer data, billing, or production architecture require owner awareness before release

## Local setup

```bash
npm install
npm run dev
```

Keep secrets in a local gitignored `.env.local` file; do not commit it.

```bash
cp .env.example .env.local
```

Fill:

- `NEXT_PUBLIC_SUPABASE_URL` — TelesalesOS Staging (`https://ceyaylgqcletophrjlja.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — that project's **publishable** key only
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`

Never put the service-role / secret key in `.env.local` unless a one-off admin
script needs it, and never prefix it with `NEXT_PUBLIC_`.

Point local development at **staging**, never at the unused production Supabase
project. Vercel Preview and (for now) Vercel Production also use staging. How to
set those, and how they drifted before, is in `docs/vercel-environments.md`.
