# Automated Deployment Setup Guide

This guide will help you set up automated deployment from GitHub to your Hostinger VPS.

## Prerequisites

1. GitHub account with your code repository
2. Hostinger VPS with FTP access
3. Your Hostinger FTP credentials

## Setup Steps

### Step 1: Push Your Code to GitHub

If you haven't already, create a GitHub repository:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git branch -M main
git push -u origin main
```

### Step 2: Get Your Hostinger FTP Credentials

1. Login to your Hostinger hPanel
2. Go to **Files** → **FTP Accounts**
3. Note down or create FTP credentials:
   - **FTP Server**: Usually `ftp.yourdomain.com` or an IP address
   - **Username**: Your FTP username
   - **Password**: Your FTP password
   - **Port**: Usually 21 (default)

### Step 3: Configure GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add these secrets one by one:

#### Required Secrets:

| Secret Name | Value | Where to Get It |
|-------------|-------|-----------------|
| `FTP_SERVER` | Your FTP hostname | Hostinger FTP settings (e.g., `ftp.yourdomain.com`) |
| `FTP_USERNAME` | Your FTP username | Hostinger FTP accounts |
| `FTP_PASSWORD` | Your FTP password | Hostinger FTP accounts |
| `VITE_SUPABASE_URL` | Your Supabase URL | Copy from `.env` file |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key | Copy from `.env` file |
| `GOOGLE_PAGESPEED_API_KEY` | Your PageSpeed API key | Copy from `.env` file |
| `OPENAI_API_KEY` | Your OpenAI API key | Copy from `.env` file |

**Current values from your .env file:**
```
VITE_SUPABASE_URL=https://rocmqpfuazwdddvebsdo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvY21xcGZ1YXp3ZGRkdmVic2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzOTUxNDAsImV4cCI6MjA3ODk3MTE0MH0.AH6mUkWVdc9mP4_ejoxrWHCLv3cvotJ8DPpllaxUA2g
GOOGLE_PAGESPEED_API_KEY=YOUR_GOOGLE_PAGESPEED_API_KEY
OPENAI_API_KEY=YOUR _OPENAI_API_KEY

### Step 4: Set Up .htaccess for Single Page Application

Create or update `.htaccess` in your `public_html` directory on Hostinger:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

# Enable GZIP compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>

# Browser caching
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpg "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/gif "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
</IfModule>
```

### Step 5: Test the Deployment

1. Make a small change to your code
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Test automated deployment"
   git push origin main
   ```

3. Watch the deployment:
   - Go to your GitHub repository
   - Click **Actions** tab
   - You'll see the deployment workflow running
   - Wait for it to complete (green checkmark)

4. Visit your website to verify the changes

## Manual Deployment Trigger

You can also trigger deployment manually:

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Deploy to Hostinger VPS** workflow
4. Click **Run workflow** button
5. Select the branch and click **Run workflow**

## Troubleshooting

### Deployment fails with "Connection refused"

- Check your FTP credentials in GitHub Secrets
- Verify your Hostinger FTP server allows connections
- Try using the IP address instead of hostname for `FTP_SERVER`

### Files not appearing on server

- Check `server-dir` path in `.github/workflows/deploy.yml`
- Default is `./public_html/` - adjust if your path is different
- Some Hostinger accounts use `/public_html/` or `/domains/yourdomain.com/public_html/`

### Build fails

- Verify all environment variables are set in GitHub Secrets
- Check the Actions log for specific error messages
- Ensure `package.json` dependencies are correct

### Website shows blank page

- Check browser console for errors
- Verify `.htaccess` file is uploaded
- Ensure all files from `dist` folder were uploaded
- Check that Supabase URLs are correct

## Monitoring Deployments

After each push to main/master:
1. GitHub Actions automatically builds your project
2. Runs the build with your environment variables
3. Uploads the `dist` folder contents to Hostinger via FTP
4. Your site updates automatically (usually takes 2-3 minutes)

## Deployment Notifications

To get notified about deployment status:
1. Watch your repository (click Watch → All Activity)
2. GitHub will email you if deployment fails
3. Check the Actions tab for detailed logs

## Alternative: Deploy via SSH

If you prefer SSH over FTP, see `DEPLOYMENT_SSH.md` for SSH-based deployment setup.

## Security Notes

- Never commit your `.env` file to GitHub
- Store all sensitive keys in GitHub Secrets
- The `VITE_SUPABASE_ANON_KEY` is safe to expose (it's meant to be public)
- Your database is protected by Supabase Row Level Security policies
- Consider rotating your OpenAI API key periodically
