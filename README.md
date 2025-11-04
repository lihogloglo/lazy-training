# Lazy Training - AI Fitness Planner

An AI-powered fitness training app that creates personalized workout plans and tracks your progress.

## Features

- 🧠 AI-generated training plans using Google Gemini
- 📅 Weekly workout schedules
- ⏱️ Built-in workout timer for timed exercises
- 📊 Exercise tracking and history
- 🔥 Firebase backend for data persistence
- 📱 Mobile-ready (web and Android APK)

## Prerequisites

- Node.js 20+
- npm or yarn
- (For Android) Android Studio with SDK 34+
- (For Android) Java JDK 17+

## Setup

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd lazy-training
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

**Firebase Configuration:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Go to Project Settings > General > Your apps
4. Create a Web app and copy the config
5. Set `VITE_FIREBASE_CONFIG` as a JSON string

**Gemini API Key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Set `VITE_GEMINI_API_KEY`

Example `.env`:
```env
VITE_FIREBASE_CONFIG={"apiKey":"AIza...","authDomain":"myapp.firebaseapp.com","projectId":"myapp","storageBucket":"myapp.appspot.com","messagingSenderId":"123456","appId":"1:123456:web:abc123"}
VITE_APP_ID=lazy-training-app
VITE_GEMINI_API_KEY=AIza...
```

### 3. Configure Firebase Firestore

In your Firebase Console:
1. Go to Firestore Database
2. Create a database (start in test mode for development)
3. The app will automatically create the required collections

## Development

### Test Locally (Web Browser)

```bash
npm run dev
```

This will start the development server at `http://localhost:5173`

You can now test the app in your browser!

## Building for Production

### Web Build (GitHub Pages)

```bash
npm run build
```

The production build will be in the `dist/` folder.

### Deploy to GitHub Pages

#### Option 1: Automatic Deployment (Recommended)

1. Push your code to GitHub
2. Go to your repository Settings > Pages
3. Set Source to "GitHub Actions"
4. Add secrets in Settings > Secrets and variables > Actions:
   - `VITE_FIREBASE_CONFIG`
   - `VITE_APP_ID`
   - `VITE_GEMINI_API_KEY`
5. Push to `main` branch - the app will auto-deploy!

Your app will be live at: `https://<username>.github.io/lazy-training/`

#### Option 2: Manual Deployment

```bash
npm run deploy
```

### Android APK Build

#### First Time Setup

1. Build the web app first:
```bash
npm run build
```

2. Add Android platform:
```bash
npm run cap:add:android
```

This creates an `android/` folder with the Android Studio project.

3. Open Android Studio:
```bash
npm run cap:open:android
```

#### Building the APK

**Option 1: From Command Line**

```bash
npm run android:build
```

The APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

**Option 2: Using Android Studio**

1. Sync the project:
```bash
npm run cap:sync
```

2. Open Android Studio:
```bash
npm run cap:open:android
```

3. In Android Studio:
   - Build > Build Bundle(s) / APK(s) > Build APK(s)
   - Or click the "Run" button to test on an emulator/device

#### Install APK on Your Phone

1. Transfer the APK to your phone
2. Enable "Install from Unknown Sources" in Settings
3. Open the APK file and install

**Or use ADB:**
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Project Structure

```
lazy-training/
├── .github/workflows/     # GitHub Actions for auto-deploy
├── public/               # Static assets
├── src/
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind CSS
├── .env.example         # Environment variables template
├── capacitor.config.json # Capacitor configuration
├── index.html           # HTML entry point
├── package.json         # Dependencies and scripts
├── tailwind.config.js   # Tailwind CSS config
└── vite.config.js       # Vite build config
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run deploy` - Deploy to GitHub Pages (manual)
- `npm run cap:sync` - Sync web build to native platforms
- `npm run cap:open:android` - Open project in Android Studio
- `npm run android:build` - Build Android APK

## Troubleshooting

### Firebase Not Working
- Check that your Firebase config in `.env` is valid JSON
- Ensure Firestore is enabled in Firebase Console
- Check browser console for specific errors

### Gemini API Not Working
- Verify your API key is correct
- Check you have billing enabled (if required)
- See browser console for API error messages

### Android Build Fails
- Ensure you have Android SDK 34+ installed
- Make sure JAVA_HOME points to JDK 17+
- Run `npm run cap:sync` before building
- Clean build: `cd android && ./gradlew clean`

### GitHub Pages Shows 404
- Check that base path in `vite.config.js` matches your repo name
- Ensure GitHub Pages is enabled and set to "GitHub Actions"
- Check Actions tab for deployment status

## License

MIT

## Contributing

Pull requests welcome! Feel free to open issues for bugs or feature requests.
