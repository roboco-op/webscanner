# Deploying Secrets to Supabase Edge Functions

## Quick Fix: Set RESEND_API_KEY in Supabase Dashboard

Since CLI installation is proving complex, use the Supabase Dashboard directly:

### Step 1: Go to Supabase Dashboard
1. Visit: https://app.supabase.com
2. Select your project: `cxyswtdklznjqrfzzelj`
3. Go to **Settings** → **Edge Functions** (or **Functions**)

### Step 2: Set the Secret
1. Click on the **send-report** function
2. Look for **Secrets** or **Environment Variables** section
3. Add new secret:
   - **Name:** `RESEND_API_KEY`
   - **Value:** `81f8f59c981142db129f3ee2d6af1dc6e479fb194b6e6bb1bdff9bf7b0e715d1`

### Step 3: Deploy Function
```bash
# From project root:
supabase functions deploy send-report --project-ref cxyswtdklznjqrfzzelj
```

Or manually redeploy via Dashboard:
1. Go to the **send-report** function
2. Click **Deploy** or **Redeploy**

### Step 4: Test
1. Open frontend at http://localhost:5173
2. Run a scan
3. Try sending an email report
4. Check function logs in Dashboard for errors

## Verify Secret is Set

In Supabase Dashboard, check function logs:
- **Settings** → **Functions** → **Logs**
- Look for: `RESEND_API_KEY value (first 10 chars): 81f8f59c98`

If it shows `NOT SET`, the secret wasn't applied correctly.

## All Required Secrets

Make sure these are set in Supabase:
- ✅ `RESEND_API_KEY` = `81f8f59c981142db129f3ee2d6af1dc6e479fb194b6e6bb1bdff9bf7b0e715d1`
- ✅ `GEMINI_API_KEY` = Already set (update if expired)
- ✅ `GOOGLE_PAGESPEED_API_KEY` = Already set
