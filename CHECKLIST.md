# Setup Checklist

Use this checklist to ensure everything is configured correctly.

## ☐ Initial Setup

- [ ] Node.js 20+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Dependencies installed (`npm install`)

## ☐ Firebase Configuration

- [ ] Created Firebase project at https://console.firebase.google.com/
- [ ] Added Web app to Firebase project
- [ ] Enabled Firestore Database
- [ ] Copied Firebase config to `.env` file
- [ ] Firebase config is valid JSON

## ☐ Gemini API Setup

- [ ] Got API key from https://makersuite.google.com/app/apikey
- [ ] Added API key to `.env` file as `VITE_GEMINI_API_KEY`

## ☐ Local Testing

- [ ] `.env` file exists with correct values
- [ ] Ran `npm run dev` successfully
- [ ] App loads at http://localhost:5173
- [ ] Can create a test plan (AI generates plan)
- [ ] Firebase saves data (check Firestore console)
- [ ] No errors in browser console

## ☐ GitHub Pages Deployment (Optional)

- [ ] Created GitHub repository
- [ ] Pushed code to GitHub
- [ ] Enabled GitHub Pages (Settings > Pages)
- [ ] Set source to "GitHub Actions"
- [ ] Added GitHub secrets:
  - [ ] `VITE_FIREBASE_CONFIG`
  - [ ] `VITE_APP_ID`
  - [ ] `VITE_GEMINI_API_KEY`
- [ ] Pushed to main branch
- [ ] Deployment successful (check Actions tab)
- [ ] App accessible at GitHub Pages URL

## ☐ Android APK Build (Optional)

### Prerequisites
- [ ] Android Studio installed
- [ ] Java JDK 17+ installed
- [ ] Android SDK 34+ installed
- [ ] JAVA_HOME environment variable set

### Build Steps
- [ ] Ran `npm run build` successfully
- [ ] Ran `npm run cap:add:android` (first time only)
- [ ] Android folder created
- [ ] Ran `npm run android:build` OR used Android Studio
- [ ] APK file generated at `android/app/build/outputs/apk/debug/app-debug.apk`
- [ ] APK tested on physical device or emulator
- [ ] App launches and works on Android

## ☐ Verification Tests

Test each feature to ensure everything works:

- [ ] **Authentication**: App loads without errors
- [ ] **Create Plan**:
  - [ ] Can generate plan with AI
  - [ ] Can import manual JSON plan
- [ ] **Dashboard**:
  - [ ] Shows today's workout
  - [ ] Can view weekly plan
  - [ ] Can navigate between days
- [ ] **Active Workout**:
  - [ ] Timer exercises work
  - [ ] Rep/set exercises display correctly
  - [ ] Can complete workout
  - [ ] Workout saves to history
- [ ] **History**:
  - [ ] Shows completed workouts
  - [ ] Displays correct dates
- [ ] **Plan Management**:
  - [ ] Can create new plan
  - [ ] Can switch between plans

## ☐ Production Checklist

Before deploying to production:

- [ ] Changed Firestore rules from test mode to production rules
- [ ] Added proper Firebase security rules
- [ ] API keys secured (using secrets, not hardcoded)
- [ ] Tested on multiple devices/browsers
- [ ] No console errors in production build
- [ ] Performance is acceptable
- [ ] Images/assets load correctly

## 🔧 Troubleshooting Reference

**If app won't start:**
1. Check `.env` file exists and has valid values
2. Run `npm install` again
3. Clear browser cache
4. Check browser console for errors

**If Firebase errors:**
1. Verify Firestore is enabled in Firebase Console
2. Check Firebase config is valid JSON
3. Ensure test mode is enabled (for development)

**If Android build fails:**
1. Check Android Studio is installed
2. Verify JDK 17+ is installed
3. Run `cd android && ./gradlew clean`
4. Update Android SDK in Android Studio

---

## 📚 Documentation Links

- [README.md](README.md) - Complete documentation
- [QUICKSTART.md](QUICKSTART.md) - Quick start guide
- [SETUP_SUMMARY.md](SETUP_SUMMARY.md) - Setup overview

---

**Current Status:**
- Date: ___________
- Completed: ☐ Local Testing | ☐ GitHub Pages | ☐ Android APK
- Notes: _________________________________
