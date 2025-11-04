# GitHub Pages Deployment Guide

## 🚀 How to Deploy Your App to GitHub Pages

### Step 1: Push Your Code to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - training app"

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/lazy-training.git

# Push to GitHub
git push -u origin main
```

### Step 2: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** tab
3. In the left sidebar, click **Pages**
4. Under "Build and deployment" → Source:
   - Select **GitHub Actions** (NOT "Deploy from a branch")

### Step 3: Add Secrets (CRITICAL!)

This is where most people make mistakes. Follow these exact steps:

1. Go to your repository **Settings**
2. In the left sidebar, expand **Secrets and variables**
3. Click **Actions**
4. Click **New repository secret** button (green button on the right)

#### Add These 3 Secrets:

---

**Secret 1: VITE_FIREBASE_CONFIG**

- Name: `VITE_FIREBASE_CONFIG`
- Value: Copy the ENTIRE JSON from your `.env` file

**IMPORTANT:** Copy EXACTLY what's after the `=` sign in `.env`:

```
{"apiKey":"AIzaSyDDAw6kyqBLvrFJ93Et13nboFOvD4z7ItQ","authDomain":"lazy-training-6ff2b.firebaseapp.com","projectId":"lazy-training-6ff2b","storageBucket":"lazy-training-6ff2b.firebasestorage.app","messagingSenderId":"869267539101","appId":"1:869267539101:web:ca79c400ad21a92e684074"}
```

✅ **Copy the whole line above** (all on ONE line, no line breaks!)
❌ **DON'T** include `VITE_FIREBASE_CONFIG=` - ONLY the JSON part!

Click **Add secret**

---

**Secret 2: VITE_APP_ID**

- Name: `VITE_APP_ID`
- Value: `lazy-training-app`

Click **Add secret**

---

**Secret 3: VITE_GEMINI_API_KEY**

- Name: `VITE_GEMINI_API_KEY`
- Value: `AIzaSyCR8aynCNWJwDz845lAn6wrUqneHVVf-OU`

Click **Add secret**

---

### Step 4: Trigger Deployment

Once all 3 secrets are added:

**Option A: Push a new commit**
```bash
# Make any small change (like adding a comment)
git add .
git commit -m "Trigger deployment"
git push
```

**Option B: Manual trigger**
1. Go to **Actions** tab
2. Click **Deploy to GitHub Pages** workflow
3. Click **Run workflow** button
4. Click the green **Run workflow** button

### Step 5: Check Deployment Status

1. Go to **Actions** tab
2. You'll see a running workflow with a yellow dot 🟡
3. Click on it to see progress
4. Wait for it to turn green ✅ (takes ~2-3 minutes)

If it fails:
- Click on the failed workflow
- Look at the error message
- Most common issue: secrets not set correctly

### Step 6: Access Your App

Once deployment succeeds, your app will be live at:

```
https://YOUR_USERNAME.github.io/lazy-training/
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## 🔧 Troubleshooting

### "Exit 1" Error

**Cause:** Secrets not configured correctly

**Solution:**

1. Go to Settings > Secrets and variables > Actions
2. Check all 3 secrets exist:
   - ✅ VITE_FIREBASE_CONFIG
   - ✅ VITE_APP_ID
   - ✅ VITE_GEMINI_API_KEY

3. Click **Update** on VITE_FIREBASE_CONFIG and verify:
   - ❌ Does NOT include `VITE_FIREBASE_CONFIG=`
   - ✅ Starts with `{` and ends with `}`
   - ✅ Is all on ONE line (no line breaks)
   - ✅ Uses double quotes `"`, not single quotes `'`

4. Re-run the workflow after fixing

### "Module not found" Error

**Cause:** Missing dependencies

**Solution:** The workflow runs `npm ci` which should install everything. If this fails:
- Check `package-lock.json` exists and is committed
- Run `npm install` locally to regenerate it
- Commit and push

### "404 Page Not Found" After Deployment

**Cause:** Wrong base path in `vite.config.js`

**Solution:**
1. Check `vite.config.js` has: `base: '/lazy-training/'`
2. Make sure it matches your repository name
3. If your repo is named differently, change it:
   ```javascript
   base: '/YOUR-REPO-NAME/'
   ```

### App Loads But Features Don't Work

**Cause:** Secrets are set but incorrect values

**Solution:**
1. Verify Firebase config is correct
2. Test Gemini API key works
3. Check browser console (F12) for errors
4. Compare secrets with your local `.env` file

---

## ✅ Verification Checklist

Before pushing to GitHub:

- [ ] Local build works: `npm run build`
- [ ] `.env` file has correct values (test locally)
- [ ] `vite.config.js` base path matches repo name
- [ ] Git repository created
- [ ] Code pushed to GitHub
- [ ] GitHub Pages enabled (Source: GitHub Actions)
- [ ] All 3 secrets added correctly:
  - [ ] VITE_FIREBASE_CONFIG (JSON on one line)
  - [ ] VITE_APP_ID
  - [ ] VITE_GEMINI_API_KEY
- [ ] Workflow triggered (push or manual)

---

## 🎯 Quick Fix for "Exit 1"

Most likely issue: **VITE_FIREBASE_CONFIG secret is wrong**

**Quick check:**
1. Go to repo Settings > Secrets and variables > Actions
2. Look at VITE_FIREBASE_CONFIG secret
3. Click **Update**
4. Paste this value (YOUR actual config from `.env`):
   ```
   {"apiKey":"AIzaSyDDAw6kyqBLvrFJ93Et13nboFOvD4z7ItQ","authDomain":"lazy-training-6ff2b.firebaseapp.com","projectId":"lazy-training-6ff2b","storageBucket":"lazy-training-6ff2b.firebasestorage.app","messagingSenderId":"869267539101","appId":"1:869267539101:web:ca79c400ad21a92e684074"}
   ```
5. Make sure it's all on ONE line
6. Click **Update secret**
7. Go to Actions > Re-run workflow

---

## 🔒 Security Note

**Never commit `.env` file!**

Your `.env` file is already in `.gitignore`, which is good. The secrets are stored securely in GitHub and only accessible during build.

If you accidentally commit `.env`:
```bash
git rm .env --cached
git commit -m "Remove .env file"
git push
```

Then rotate your API keys (create new ones) since they're now public!

---

## 📱 After Successful Deployment

Your app will be live at: `https://YOUR_USERNAME.github.io/lazy-training/`

**Test it:**
1. Open the URL in your browser
2. Try generating a plan
3. Check if Firebase saves data
4. Test all features

**Share it:**
- Send the link to friends
- Add it to your phone's home screen (mobile PWA)
- Use it from any device!

---

Need more help? Check the **Actions** tab for detailed error logs.
