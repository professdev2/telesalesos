# Forwards Stripe test webhooks to local Next.js.
# Keep this terminal open while testing Billing checkout.
$ErrorActionPreference = "Stop"
$root = "C:\tele"
$envFile = Join-Path $root ".env.local"
$stripeExe = Join-Path $PSScriptRoot "stripe.exe"

if (-not (Test-Path $stripeExe)) { throw "Missing $stripeExe" }
if (-not (Test-Path $envFile)) { throw "Missing $envFile" }

$skLine = Select-String -Path $envFile -Pattern '^STRIPE_SECRET_KEY=(.+)$' | Select-Object -First 1
if (-not $skLine) { throw "STRIPE_SECRET_KEY not found in .env.local" }
$sk = $skLine.Matches.Groups[1].Value.Trim()

Write-Host ""
Write-Host "Stripe listen -> http://localhost:3000/api/stripe/webhook"
Write-Host "1) Copy the whsec_... webhook signing secret from the output below"
Write-Host "2) Add to .env.local:  STRIPE_WEBHOOK_SECRET=whsec_..."
Write-Host "3) Restart npm run dev"
Write-Host ""

& $stripeExe listen --forward-to localhost:3000/api/stripe/webhook --api-key $sk
