# Edge Functions do CRM

## `invite-commercial-member`

Deploy from the `web` directory with the Supabase CLI ligado ao projeto:

```text
supabase functions deploy invite-commercial-member --project-ref swelyfjlnvpxgahchpxc
```

The function has `verify_jwt = false` in `supabase/config.toml` so CORS preflight requests can reach the handler. The handler validates the bearer token and CRM role itself before doing any privileged work.

The function uses the project-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The service role key must remain an Edge Function secret and never be exposed to Next.js/browser code.

Set `SITE_URL` as an Edge Function secret when the production URL is confirmed:

```text
supabase secrets set SITE_URL=https://radarb2b-iota.vercel.app --project-ref swelyfjlnvpxgahchpxc
```

The Supabase Auth invite email template must use `{{ .ConfirmationURL }}` and the redirect URL must be allow-listed in Authentication URL Configuration.
