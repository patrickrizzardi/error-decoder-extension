# Stripe Go-Live Checklist

Everything needed to switch from test/sandbox to live payments. Test mode products, prices, webhooks, and portal config do NOT carry over — they're separate environments.

## 1. Account Activation (do first, blocks everything)
- [ ] Dashboard > Settings > Account details > Complete activation
- [ ] Business type: Sole Proprietor (SSN works, no LLC needed)
- [ ] Business URL: https://errordecoder.dev
- [ ] Add bank account for payouts (routing + account number)
- [ ] Enable 2FA on Stripe account

## 2. Branding & Public Details
- [ ] Statement descriptor: `ERRORDECODER` (shows on customer card statements)
- [ ] Support email (even personal email works)
- [ ] Upload logo (square, 128x128+ — used on Checkout, Portal, receipts)
- [ ] Set brand color
- [ ] Privacy policy URL: https://errordecoder.dev/privacy
- [ ] Terms of service URL: https://errordecoder.dev/terms

## 3. Refund Policy (we don't have one yet)
- [ ] Add to website (e.g. "Cancel anytime. No refunds for partial billing periods.")
- [ ] Add to Stripe: Dashboard > Settings > Checkout > Policies

## 4. Contact Info on Website
- [ ] Add support email to footer (Stripe can flag accounts without it)

## 5. Customer Portal (separate config in live mode)
- [ ] Switch Dashboard to LIVE mode
- [ ] Dashboard > Settings > Billing > Customer portal
- [ ] Enable: cancel subscription (end of period), update payment method, view invoices
- [ ] Add ToS + privacy links
- [ ] Add logo + business name

## 6. Customer Emails (live mode)
- [ ] Enable successful payment receipts
- [ ] Enable failed payment notifications
- [ ] Enable upcoming renewal reminders
- [ ] Enable expiring card reminders

## 7. Failed Payment Retry (live mode)
- [ ] Same as test: 4 retries in 1 week, then cancel subscription
- [ ] Dashboard > Settings > Billing > Revenue recovery

## 8. Tax
- [ ] Set origin address: Dashboard > Settings > Tax
- [ ] Register home state if it taxes SaaS
- [ ] Code already has `automatic_tax: { enabled: true }` — Stripe handles calculation
- [ ] Don't worry about other states until $100K or 200 transactions

## 9. Create Products + Prices + Webhook
- [ ] Set env: `STRIPE_SECRET_KEY=sk_live_...` and `API_URL=https://production-api-url`
- [ ] Run `bun run stripe:setup` — creates product, prices, webhook in live mode
- [ ] Script has 5-second safety warning for live mode
- [ ] Copy the new live webhook signing secret

## 10. Production Environment Variables
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...   (NEW — different from test)
APP_URL=https://errordecoder.dev
API_URL=https://production-api-url
```

## 11. Checkout Legal Display
- [ ] Dashboard > Settings > Checkout > Legal policies > Enable to show links
- [ ] Optional: enable "agreement to legal terms" checkbox (records explicit consent, protects in disputes)

## 12. Smoke Test (with your real card)
- [ ] Full checkout flow on production — verify branding, legal links, price
- [ ] Verify webhook fires > user upgraded to Pro
- [ ] Verify receipt email arrives
- [ ] Test Customer Portal > update card, cancel
- [ ] Verify cancel webhook > downgraded to Free
- [ ] Refund yourself in Dashboard to get $9 back

## Things You Do NOT Need
- LLC or business license (sole proprietor is fine)
- 1099-K setup (Stripe handles automatically)
- PCI questionnaire (Stripe Checkout = you're covered)
- Custom receipt templates
- Multiple currencies

## Execution Order
1. Account activation + identity + bank
2. Branding + statement descriptor + legal URLs
3. Customer Portal config (live mode)
4. Email settings
5. Tax origin + home state
6. Refund policy on website + Stripe
7. Run stripe:setup with live keys
8. Update production env vars
9. Deploy
10. Smoke test with real card
11. Ship
