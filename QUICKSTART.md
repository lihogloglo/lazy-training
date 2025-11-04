# Quick Start Guide

## Test the App Locally (5 minutes)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Add your Firebase and Gemini credentials to `.env`**
   - Get Firebase config from [Firebase Console](https://console.firebase.google.com/)
   - Get Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

4. **Start the dev server:**
   ```bash
   npm run dev
   ```

5. **Open in browser:** http://localhost:5173

That's it! You can now test all features in your browser.

---

## Deploy to GitHub Pages (10 minutes)

1. **Create a GitHub repository and push your code**

2. **Go to Settings > Pages** and set Source to "GitHub Actions"

3. **Add secrets** (Settings > Secrets and variables > Actions):
   - `VITE_FIREBASE_CONFIG` - Your Firebase config JSON
   - `VITE_APP_ID` - App identifier (e.g., "lazy-training-app")
   - `VITE_GEMINI_API_KEY` - Your Gemini API key

4. **Push to main branch** - Auto-deploy will start!

5. **Access your app** at: `https://yourusername.github.io/lazy-training/`

---

## Build Android APK (20 minutes)

### Prerequisites:
- Android Studio installed
- Java JDK 17+

### Steps:

1. **Build the web app:**
   ```bash
   npm run build
   ```

2. **Add Android platform:**
   ```bash
   npm run cap:add:android
   ```

3. **Build APK:**
   ```bash
   npm run android:build
   ```

4. **Find your APK at:**
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

5. **Install on your phone:**
   - Transfer the APK file to your phone
   - Enable "Install from Unknown Sources"
   - Open and install the APK

**Or use Android Studio:**
```bash
npm run cap:open:android
```
Then click Build > Build Bundle(s) / APK(s) > Build APK(s)

---

## Updating the App

After making changes to your code:

**For web testing:**
```bash
npm run dev
```

**For Android:**
```bash
npm run cap:sync
npm run cap:open:android
```

**For GitHub Pages:**
Just push to main branch - auto-deploy!

---

## Common Issues

**"Firebase not initialized"**
- Check your `.env` file has valid Firebase config
- Make sure it's valid JSON (use a JSON validator)

**"API key not found"**
- Check `VITE_GEMINI_API_KEY` in `.env`
- Restart dev server after changing `.env`

**Android build fails**
- Run: `cd android && ./gradlew clean && cd ..`
- Make sure JAVA_HOME is set correctly
- Check Android Studio SDK is installed (SDK 34+)

---

Need more help? See [README.md](README.md) for full documentation.
