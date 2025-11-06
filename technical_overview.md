# Lazy Training - Technical Overview

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Application Purpose](#application-purpose)
3. [Technical Architecture](#technical-architecture)
4. [Data Structures](#data-structures)
5. [Core Features](#core-features)
6. [Progressive Overload System](#progressive-overload-system)
7. [Component Architecture](#component-architecture)
8. [Firebase Integration](#firebase-integration)
9. [AI Integration](#ai-integration)
10. [Known Issues & Bug Fixes](#known-issues--bug-fixes)
11. [Recommendations](#recommendations)

---

## Executive Summary

**Lazy Training** is a progressive web app (PWA) and Android application that provides AI-powered fitness training plans with automatic progressive overload. The app uses a single repeating week template that evolves over time based on user performance and configured progression settings.

**Tech Stack:**
- Frontend: React 18.2.0 + Vite
- Styling: Tailwind CSS
- Backend: Firebase (Firestore + Auth)
- AI: Google Gemini API
- Mobile: Capacitor 6.0 (Android support)
- Icons: Lucide React

**Key Innovation:** Unlike traditional training apps that store 12 separate weeks, Lazy Training stores a single `baseWeek` template and calculates the current week's workouts dynamically using mathematical progression formulas.

---

## Application Purpose

Lazy Training solves the problem of creating and managing progressive training plans for various sports:

1. **For Users:**
   - Generate personalized training plans via AI (Gemini)
   - Automatic workout progression (progressive overload)
   - Track workout completion history
   - Adaptive progression based on performance
   - Timer-based and rep-based exercise support

2. **Supported Sports:**
   - Rock climbing (bouldering)
   - Running (5K, 10K)
   - Strength training
   - Custom sports via AI or manual JSON import

3. **Platform Support:**
   - Web browser (development & production)
   - GitHub Pages deployment
   - Android APK

---

## Technical Architecture

### Single-File Architecture

The entire application is contained in a single monolithic file: `/src/App.jsx` (2,652 lines)

**Structure:**
```
src/App.jsx
├── Firebase Configuration
├── Helper Functions (3)
│   ├── getTodayDayName()
│   ├── formatTimer()
├── Progressive Overload Engine (3 core functions)
│   ├── calculateProgressiveValue()
│   ├── calculateAdaptiveFactor()
│   └── applyProgression()
├── Template Library (TEMPLATES object)
├── AI Integration
│   ├── callGeminiApi()
│   └── AI_PLAN_SYSTEM_PROMPT
├── React Components (13)
│   ├── LoadingSpinner
│   ├── ExerciseInfo
│   ├── TimerComponent
│   ├── RepsSetsWeightComponent
│   ├── SetTrackingComponent
│   ├── HangboardComponent
│   ├── ActiveWorkoutView
│   ├── DashboardView
│   ├── CreatePlanView
│   ├── HistoryView
│   ├── PlanView
│   ├── EditPlanView
│   └── App (main)
└── Firebase Listeners
```

**Entry Point:** `/src/main.jsx` renders the App component

**Styling:** Tailwind CSS via `/src/index.css`

---

## Data Structures

### Training Plan Structure

The plan uses a **single repeating week pattern** that progresses over time:

```javascript
{
  planName: "V4-V5 Bouldering Progression",
  planType: "repeating-week",
  sport: "climbing",
  durationWeeks: 12,
  createdAt: Firebase Timestamp,

  baseWeek: {
    days: [
      {
        day: "Monday",
        focus: "Finger Strength",
        exercises: [
          {
            name: "Hangboard Repeaters",
            type: "hangboard",  // Options: "repsSetsWeight", "timer", "hangboard"
            baselineDetails: {  // Week 1 baseline values
              sets: 5,
              duration: 10,
              rest: 30,
              description: "20mm edge"
            }
          }
        ]
      },
      // ... 6 more days (Tuesday-Sunday)
    ]
  },

  progressionSettings: {
    strategy: "linear",  // or "percentage"
    increments: {
      sets: 0,      // +0 sets per week (0.5 = +1 set every 2 weeks)
      reps: 0.5,    // +0.5 reps per week
      weight: 2.5,  // +2.5kg per week
      duration: 5   // +5 seconds per week
    },
    userMultiplier: 1.0,  // User can adjust (0.5-2.0)
    adaptiveEnabled: true // Enable adaptive progression based on completion history
  }
}
```

**Key Points:**
- Only ONE `baseWeek` is stored (not 12 separate weeks)
- Progressive overload is calculated on-the-fly
- Week 1 values are in `baselineDetails`
- Current week values are computed: `baselineDetails + (increment × weeks × multiplier × adaptiveFactor)`

### Exercise Types

1. **repsSetsWeight** - Traditional strength training
   - Fields: sets, reps, weight, rest
   - Example: "Squat: 3×5 @ 80kg, 3min rest"

2. **timer** - Time-based exercises
   - Fields: sets, duration, rest, description
   - Example: "Warm-up: 1×600sec, 0sec rest"

3. **hangboard** - Climbing-specific
   - Fields: sets, duration, rest, description
   - Example: "20mm edge: 5×10sec, 30sec rest"

### Workout History Structure

```javascript
{
  planName: "V4-V5 Bouldering Progression",
  weekNumber: 3,
  dayName: "Monday",
  dayFocus: "Finger Strength",
  exercises: [
    {
      name: "Hangboard Repeaters",
      type: "hangboard",
      details: { /* values for week 3 */ },
      completed: true
    }
  ],
  completedAt: Firebase Timestamp,
  notes: "Felt strong today"
}
```

### Firestore Collections

```
/artifacts/{appId}/users/{userId}/
  ├── plan/
  │   └── mainPlan (document)
  └── history/ (collection)
      ├── {workoutId1}
      ├── {workoutId2}
      └── ...
```

---

## Core Features

### 1. Plan Creation

**Method A: AI Generation (Recommended)**
- User describes goals in natural language
- Gemini API generates structured JSON plan
- Validates structure before saving
- Schema enforced via `AI_PLAN_SYSTEM_PROMPT`

**Method B: Manual JSON Import**
- User pastes JSON directly
- Validates structure
- Useful for custom plans or templates

**Validation Rules:**
- Must have: `planName`, `baseWeek`, `durationWeeks`
- `baseWeek.days` must be an array of 7 days
- Each exercise must have `type` and `baselineDetails`

### 2. Plan Viewing

- Displays plan name, sport, duration
- Shows base week schedule (7 days)
- Edit and delete options
- Can switch to dashboard or create new plan

### 3. Plan Editing (Fixed in latest version)

- Edit plan name
- Configure progression settings (increments per week)
- Edit base week template:
  - Change day focus
  - Add/remove/edit exercises
  - Modify baseline values
- Changes apply to all future weeks

**Bug Fix Applied:**
- Previously tried to access `editedPlan.weeks` array
- Now correctly uses `editedPlan.baseWeek` structure
- Supports both `baselineDetails` and legacy `details` field names

### 4. Dashboard

**Current Week Display:**
- Calculates current week: `Math.floor(daysSinceCreation / 7) % durationWeeks + 1`
- Shows today's workout with applied progression
- Displays current week's full schedule

**Workout Logging:**
- Quick log completed workout
- Add notes (optional)
- Saves to history collection

**Adaptive Factor Display:**
- Shows current progression multiplier
- Based on last 3 weeks completion rate

### 5. Active Workout View

**Features:**
- Exercise-by-exercise walkthrough
- Exercise info lookup via Gemini API
- Set tracking with completion checkboxes
- Built-in timer for timed/hangboard exercises
- Navigation: previous/next exercise
- Complete workout button

**Timer Features:**
- Visual countdown
- Set counter (e.g., "Set 2 of 5")
- Rest timer after each set
- Auto-advance to next set

### 6. Workout History

- Chronological list of completed workouts
- Shows date, week number, day name, focus
- Exercise completion status
- User notes
- Firebase real-time updates

---

## Progressive Overload System

### How It Works

Progressive overload is the principle of gradually increasing stress on the body to drive adaptation. Lazy Training implements this mathematically:

#### Linear Strategy (Default)

```javascript
currentValue = baseValue + (increment × weeksProgressed × userMultiplier × adaptiveFactor)
```

**Example:** Squat progression
- Week 1 baseline: 80kg
- Increment: 2.5kg/week
- User multiplier: 1.0
- Adaptive factor: 1.0

Week 3 weight: `80 + (2.5 × 2 × 1.0 × 1.0) = 85kg`

#### Percentage Strategy

```javascript
currentValue = baseValue × (1 + increment/100)^(weeksProgressed × userMultiplier × adaptiveFactor)
```

**Example:** Pull-up progression
- Week 1 baseline: 5 reps
- Increment: 5% per week

Week 3 reps: `5 × (1.05)^2 = 5.5 reps` → rounds to 6

### Adaptive Progression

The system analyzes the last 3 weeks of workout history and adjusts progression:

```javascript
completionRate = completedWorkouts / expectedWorkouts

if (completionRate >= 0.9)  adaptiveFactor = 1.1  // Faster progression
if (completionRate >= 0.7)  adaptiveFactor = 1.0  // Normal
if (completionRate >= 0.5)  adaptiveFactor = 0.95 // Slightly slower
if (completionRate < 0.5)   adaptiveFactor = 0.9  // Significantly slower
```

**Benefits:**
- Prevents injury from progressing too fast
- Accounts for life stress (missed workouts)
- Automatic deload during low-compliance periods

### User Multiplier

Users can adjust progression speed (0.5-2.0):
- 0.5 = Half speed (conservative)
- 1.0 = Normal (default)
- 1.5 = 50% faster (aggressive)
- 2.0 = Double speed (very aggressive)

---

## Component Architecture

### Main App Component

**Responsibilities:**
- Firebase initialization and authentication
- State management (plan, history, currentView)
- Real-time Firestore listeners
- View routing

**Views:**
- `dashboard` - Home screen with current week
- `createPlan` - AI or manual plan creation
- `plan` - View/manage current plan
- `editPlan` - Edit plan details
- `activeWorkout` - In-progress workout
- `history` - Past workout log

**Authentication:**
- Anonymous Firebase auth
- Custom token support via URL parameter
- Automatic sign-in on mount

### Component Hierarchy

```
App
├── DashboardView
│   ├── Current week display
│   ├── Workout log form
│   └── Navigation buttons
├── CreatePlanView
│   ├── AI generation form
│   ├── Manual JSON import
│   └── Template library (future)
├── PlanView
│   ├── Plan details
│   └── Edit/Delete actions
├── EditPlanView (FIXED)
│   ├── Plan name editor
│   ├── Progression settings
│   └── Base week editor
├── ActiveWorkoutView
│   ├── Exercise display
│   ├── RepsSetsWeightComponent
│   ├── TimerComponent
│   ├── HangboardComponent
│   ├── SetTrackingComponent
│   └── ExerciseInfo modal
└── HistoryView
    └── Workout history list
```

---

## Firebase Integration

### Firestore Structure

**Plan Document:**
```
/artifacts/{appId}/users/{userId}/plan/mainPlan
```
- Single document per user
- Contains entire plan structure
- Real-time updates via `onSnapshot`

**History Collection:**
```
/artifacts/{appId}/users/{userId}/history/{workoutId}
```
- One document per completed workout
- Sorted by `completedAt` timestamp
- Real-time updates via `onSnapshot`

### Authentication Flow

1. App loads → Firebase initializes
2. Anonymous sign-in OR custom token (from URL param)
3. `userId` obtained from auth
4. Firestore listeners attached
5. Plan and history loaded

### Data Loading

```javascript
// Plan listener
const planDocRef = doc(db, 'artifacts', appId, 'users', userId, 'plan', 'mainPlan');
const unsubscribePlan = onSnapshot(planDocRef, (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    const createdAtDate = data.createdAt.toDate();
    setPlan({ ...data, id: docSnap.id, createdAt: createdAtDate });
  } else {
    setPlan(null);
  }
});

// History listener
const historyColRef = collection(db, 'artifacts', appId, 'users', userId, 'history');
const unsubscribeHistory = onSnapshot(historyColRef, (querySnapshot) => {
  const historyData = [];
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    historyData.push({ ...data, id: doc.id, completedAt: data.completedAt.toDate() });
  });
  setHistory(historyData);
});
```

**Key Points:**
- Real-time updates (no manual refresh needed)
- Timestamp conversion handled (Firebase Timestamp → JS Date)
- Graceful handling of missing data

---

## AI Integration

### Google Gemini API

**Model:** `gemini-1.5-flash-latest`

**Temperature:** 0.7 (balanced creativity/consistency)

**Usage:**
1. **Plan Generation** - Creates structured training plans
2. **Exercise Info** - Provides technique tips and descriptions

### Plan Generation Prompt

The system uses a detailed prompt (`AI_PLAN_SYSTEM_PROMPT`) that:
- Enforces JSON-only output (no markdown)
- Specifies exact schema with examples
- Requires single repeating week (not all 12 weeks)
- Includes exercise type guidelines
- Provides progression settings template

**Validation:**
- JSON parsing with cleanup (removes code blocks, comments)
- Schema validation (required fields check)
- Structure validation (baseWeek.days array check)
- Error handling with user-friendly messages

### Exercise Info Lookup

Users can tap info icon during workouts to get:
- Proper form and technique
- Common mistakes to avoid
- Variations and modifications
- Safety tips

---

## Known Issues & Bug Fixes

### Critical Bug Fixed: EditPlanView.weeks Undefined

**Problem:**
- EditPlanView expected `editedPlan.weeks` array
- Actual structure has `editedPlan.baseWeek` object
- Caused crash: "can't access property 0, editedPlan.weeks is undefined"

**Root Cause:**
- Mismatch between expected and actual data structure
- EditPlanView was written for multi-week structure
- App actually uses single repeating week pattern

**Fix Applied:**
- Changed all `editedPlan.weeks[selectedWeek]` → `editedPlan.baseWeek`
- Removed week selector (only one base week)
- Added info box explaining base week concept
- Fixed all exercise update functions
- Changed `details` → `baselineDetails` for consistency

**Files Modified:**
- `/src/App.jsx` lines 1979-2399

**Testing Required:**
- Load existing plan → Edit Plan
- Modify exercises, progression settings
- Save changes → Verify Firestore update
- Test on fresh plan creation

### Minor Issues

1. **Field Name Inconsistency**
   - Old field: `details`
   - New field: `baselineDetails`
   - Fix: Code now supports both for backward compatibility

2. **Timestamp Conversion**
   - Firebase Timestamps must be converted to JS Date
   - Fix: Proper conversion in all listeners

---

## Recommendations

### Immediate Actions

1. **Test EditPlanView Fix**
   - Create a plan
   - Edit the plan
   - Verify all fields update correctly
   - Check Firestore to confirm structure

2. **Add Error Boundaries**
   - Wrap main components in React error boundaries
   - Prevent single component failure from crashing app

3. **Add Loading States**
   - Show spinner while plan loads
   - Disable buttons during save operations

### Short-Term Improvements

1. **Code Refactoring**
   - Split `App.jsx` into multiple files:
     ```
     src/
     ├── components/
     │   ├── Dashboard/
     │   ├── CreatePlan/
     │   ├── EditPlan/
     │   ├── ActiveWorkout/
     │   ├── History/
     │   └── shared/
     ├── hooks/
     │   ├── useFirestore.js
     │   ├── usePlan.js
     │   └── useProgression.js
     ├── utils/
     │   ├── progression.js
     │   ├── validation.js
     │   └── formatting.js
     ├── services/
     │   ├── firebase.js
     │   └── gemini.js
     └── App.jsx
     ```

2. **Add Unit Tests**
   - Test progression calculations
   - Test validation functions
   - Test timestamp conversions

3. **Add Form Validation**
   - Validate inputs in EditPlanView
   - Prevent negative values
   - Ensure required fields filled

4. **Improve UX**
   - Add confirmation dialogs (delete plan, discard changes)
   - Add success/error toast notifications
   - Add inline help text

### Long-Term Enhancements

1. **Multiple Plans**
   - Allow users to have multiple active plans
   - Switch between plans
   - Archive completed plans

2. **Plan Templates**
   - Pre-built plans for common goals
   - User can select and customize

3. **Exercise Library**
   - Database of exercises with videos
   - Search and add to plan
   - Technique guides

4. **Analytics Dashboard**
   - Volume progression over time
   - Completion rate trends
   - Performance graphs

5. **Social Features**
   - Share plans with friends
   - Workout with partners
   - Community plans library

6. **Offline Support**
   - Cache plans locally
   - Sync when online
   - Service worker for PWA

7. **Multi-Sport Support**
   - Sport-specific exercise types
   - Sport-specific progression strategies
   - Cross-training plans

---

## Conclusion

Lazy Training is a functional and innovative fitness planning app with a unique approach to progressive overload. The recent bug fix resolves the critical EditPlanView crash, making the app fully functional.

**Strengths:**
- Innovative single-week progressive system
- AI-powered plan generation
- Real-time Firebase sync
- Adaptive progression based on compliance
- Multi-platform support (web + Android)

**Areas for Improvement:**
- Code organization (split monolithic file)
- Test coverage
- Error handling and user feedback
- Performance optimization

**Next Steps:**
1. Thoroughly test EditPlanView fix
2. Add error boundaries
3. Begin code refactoring
4. Add unit tests
5. Implement template library
