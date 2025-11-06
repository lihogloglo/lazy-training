import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import {
  Brain,
  Dumbbell,
  CheckCircle,
  ArrowRight,
  History,
  Play,
  Pause,
  RotateCw,
  ChevronLeft,
  X,
  FileText,
  Copy,
  PlusCircle,
  BarChart2,
  Home,
  CalendarDays,
  Info,
  FileEdit,
  Bell,
  Edit3,
  Save,
  Trash2,
  Plus,
  Sparkles,
  TrendingUp,
  User,
  Users,
  UserPlus,
  Settings,
  Target,
  Timer,
  Hand,
  Activity,
  Zap,
  Mountain,
  Bike,
  Waves
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = import.meta.env.VITE_FIREBASE_CONFIG
  ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
  : { apiKey: "YOUR_FALLBACK_API_KEY", authDomain: "...", projectId: "..." };

const appId = import.meta.env.VITE_APP_ID || 'lazy-training-app';

// --- Helper Functions ---
const getTodayDayName = () => {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
};

const formatTimer = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Maps exercise names to appropriate Lucide icons
 * @param {string} exerciseName - Name of the exercise
 * @param {string} exerciseType - Type of exercise (repsSetsWeight, timer, hangboard)
 * @returns {React.Component} Lucide icon component
 */
const getExerciseIcon = (exerciseName, exerciseType) => {
  const name = exerciseName.toLowerCase();

  // Hangboard/climbing specific
  if (name.includes('hangboard') || name.includes('crimp') || name.includes('edge')) {
    return Hand;
  }

  // Timer/cardio exercises
  if (exerciseType === 'timer' || name.includes('run') || name.includes('jog') || name.includes('cardio')) {
    return Timer;
  }

  // Swimming
  if (name.includes('swim')) {
    return Waves;
  }

  // Cycling
  if (name.includes('bike') || name.includes('cycle')) {
    return Bike;
  }

  // Climbing/bouldering
  if (name.includes('climb') || name.includes('boulder')) {
    return Mountain;
  }

  // Power/explosive exercises
  if (name.includes('jump') || name.includes('sprint') || name.includes('explosive')) {
    return Zap;
  }

  // Core/abs
  if (name.includes('plank') || name.includes('core') || name.includes('ab')) {
    return Activity;
  }

  // Default to dumbbell for weight training
  return Dumbbell;
};

/**
 * Gets a color class for exercise icons based on sport
 * @param {string} sport - Sport type (climbing, strength, running, etc.)
 * @returns {string} Tailwind color class
 */
const getExerciseIconColor = (sport) => {
  const sportColors = {
    climbing: 'text-orange-400',
    strength: 'text-blue-400',
    running: 'text-green-400',
    cycling: 'text-purple-400',
    swimming: 'text-cyan-400',
  };
  return sportColors[sport] || 'text-gray-400';
};

// --- Progressive Overload Calculation Engine ---

/**
 * Calculates the progressive value for a given exercise detail based on week number
 * @param {number} baseValue - The baseline value from week 1
 * @param {number} weekNumber - Current week number (1-indexed)
 * @param {number} increment - Amount to add per week
 * @param {number} userMultiplier - User adjustment multiplier (0.5-2.0)
 * @param {string} strategy - "linear" or "percentage"
 * @param {number} adaptiveFactor - Adaptive adjustment factor (0.8-1.2)
 * @returns {number} The calculated value for the current week
 */
const calculateProgressiveValue = (baseValue, weekNumber, increment, userMultiplier = 1.0, strategy = 'linear', adaptiveFactor = 1.0) => {
  const weeksProgressed = weekNumber - 1; // Week 1 = baseline

  if (strategy === 'percentage') {
    // Percentage-based: baseValue * (1 + (increment/100))^weeks
    const percentIncrease = increment / 100;
    return baseValue * Math.pow(1 + percentIncrease, weeksProgressed * userMultiplier * adaptiveFactor);
  } else {
    // Linear: baseValue + (increment * weeks * multiplier * adaptiveFactor)
    return baseValue + (increment * weeksProgressed * userMultiplier * adaptiveFactor);
  }
};

/**
 * Calculates adaptive factor based on user's recent performance
 * @param {Array} history - User's workout history
 * @param {number} currentWeek - Current week number
 * @returns {number} Adaptive factor (0.8 = slower, 1.0 = normal, 1.2 = faster)
 */
const calculateAdaptiveFactor = (history, currentWeek) => {
  // Look at last 3 weeks of workouts
  const recentWorkouts = history.filter(log =>
    log.weekNumber >= currentWeek - 3 && log.weekNumber < currentWeek
  );

  if (recentWorkouts.length < 3) {
    return 1.0; // Not enough data, use normal progression
  }

  // Calculate completion rate (completed workouts per week)
  const weeksCovered = Math.min(3, currentWeek - 1);
  const expectedWorkouts = weeksCovered * 4; // Assuming ~4 workouts per week
  const completionRate = recentWorkouts.length / expectedWorkouts;

  // Adjust based on completion rate
  if (completionRate >= 0.9) {
    return 1.1; // User is consistent, slightly increase progression
  } else if (completionRate >= 0.7) {
    return 1.0; // Normal progression
  } else if (completionRate >= 0.5) {
    return 0.95; // Slightly reduce progression
  } else {
    return 0.9; // User is struggling, reduce progression
  }
};

/**
 * Applies progression to exercise details
 * @param {Object} baselineDetails - Baseline exercise details from week 1
 * @param {number} currentWeek - Current week number
 * @param {Object} progressionSettings - Progression settings from plan
 * @param {number} adaptiveFactor - Adaptive factor based on performance
 * @returns {Object} Calculated details for current week
 */
const applyProgression = (baselineDetails, currentWeek, progressionSettings, adaptiveFactor = 1.0) => {
  const { strategy, increments, userMultiplier } = progressionSettings;
  const result = { ...baselineDetails };

  // Apply progression to numeric fields
  if (typeof baselineDetails.sets === 'number' && increments.sets) {
    result.sets = Math.round(calculateProgressiveValue(
      baselineDetails.sets, currentWeek, increments.sets, userMultiplier, strategy, adaptiveFactor
    ));
  }

  // Handle reps (can be number or string like "10s")
  if (baselineDetails.reps) {
    const repsNum = parseFloat(baselineDetails.reps);
    if (!isNaN(repsNum) && increments.reps) {
      const newReps = calculateProgressiveValue(
        repsNum, currentWeek, increments.reps, userMultiplier, strategy, adaptiveFactor
      );
      // Preserve unit if present (e.g., "10s" -> "12s")
      const unit = String(baselineDetails.reps).replace(/[0-9.-]/g, '');
      result.reps = Math.round(newReps) + unit;
    }
  }

  // Handle weight (parse numeric part)
  if (baselineDetails.weight && typeof baselineDetails.weight === 'string') {
    const weightMatch = baselineDetails.weight.match(/([+-]?\d+(?:\.\d+)?)/);
    if (weightMatch && increments.weight) {
      const baseWeight = parseFloat(weightMatch[1]);
      const newWeight = calculateProgressiveValue(
        baseWeight, currentWeek, increments.weight, userMultiplier, strategy, adaptiveFactor
      );
      // Replace numeric part, keep units
      result.weight = baselineDetails.weight.replace(/([+-]?\d+(?:\.\d+)?)/, newWeight.toFixed(1));
    }
  }

  // Handle duration for timer exercises
  if (typeof baselineDetails.duration === 'number' && increments.duration) {
    result.duration = Math.round(calculateProgressiveValue(
      baselineDetails.duration, currentWeek, increments.duration, userMultiplier, strategy, adaptiveFactor
    ));
  }

  return result;
};

// --- Sport Templates ---
const TEMPLATES = {
  climbing: [
    {
      id: 'climbing-v4-v5',
      name: 'V4-V5 Bouldering Progression',
      sport: 'climbing',
      description: '12-week plan to progress from V4 to V5 bouldering',
      durationWeeks: 12,
      baseWeek: {
        days: [
          {
            day: 'Monday',
            focus: 'Finger Strength',
            exercises: [
              { name: 'Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 600, rest: 0, description: '10-min easy climbing warm-up' } },
              { name: 'Hangboard - Half Crimp', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '10s', weight: 'Bodyweight', rest: 180 } },
              { name: 'Hangboard - Open Hand', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '10s', weight: 'Bodyweight', rest: 180 } },
              { name: 'Campus Board Ladders', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '5', weight: 'Bodyweight', rest: 120 } }
            ]
          },
          {
            day: 'Tuesday',
            focus: 'Rest',
            exercises: []
          },
          {
            day: 'Wednesday',
            focus: 'Power & Technique',
            exercises: [
              { name: 'Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 900, rest: 0, description: '15-min easy climbing' } },
              { name: 'Limit Bouldering', type: 'timer', baselineDetails: { sets: 6, duration: 300, rest: 300, description: '5-min hard attempts, 5-min rest' } },
              { name: 'Volume Climbing', type: 'timer', baselineDetails: { sets: 1, duration: 1800, rest: 0, description: '30-min moderate climbing' } }
            ]
          },
          {
            day: 'Thursday',
            focus: 'Antagonist Training',
            exercises: [
              { name: 'Push-ups', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '15', weight: 'Bodyweight', rest: 60 } },
              { name: 'Dips', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '10', weight: 'Bodyweight', rest: 90 } },
              { name: 'Shoulder Press', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '10', weight: '10kg', rest: 90 } }
            ]
          },
          {
            day: 'Friday',
            focus: 'Rest',
            exercises: []
          },
          {
            day: 'Saturday',
            focus: 'Endurance & Volume',
            exercises: [
              { name: 'Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 600, rest: 0, description: '10-min easy climbing' } },
              { name: '4x4 Training', type: 'timer', baselineDetails: { sets: 4, duration: 240, rest: 180, description: '4 problems in 4 minutes, rest 3 min' } },
              { name: 'Cool-down Volume', type: 'timer', baselineDetails: { sets: 1, duration: 1200, rest: 0, description: '20-min easy climbing' } }
            ]
          },
          {
            day: 'Sunday',
            focus: 'Active Recovery',
            exercises: [
              { name: 'Yoga or Stretching', type: 'timer', baselineDetails: { sets: 1, duration: 1800, rest: 0, description: '30-min flexibility work' } }
            ]
          }
        ]
      },
      progressionSettings: {
        strategy: 'linear',
        increments: {
          sets: 0,
          reps: 0.5,
          weight: 1.0,
          duration: 30
        },
        userMultiplier: 1.0,
        adaptiveEnabled: true
      }
    },
    {
      id: 'climbing-v6-v7',
      name: 'V6-V7 Advanced Progression',
      sport: 'climbing',
      description: '12-week plan for advanced climbers pushing to V7',
      durationWeeks: 12,
      baseWeek: {
        days: [
          {
            day: 'Monday',
            focus: 'Max Finger Strength',
            exercises: [
              { name: 'Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 900, rest: 0, description: '15-min progressive warm-up' } },
              { name: 'Weighted Hangboard', type: 'repsSetsWeight', baselineDetails: { sets: 5, reps: '7s', weight: '+10kg', rest: 240 } },
              { name: 'One-Arm Hangs', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '5s', weight: 'Bodyweight', rest: 180 } },
              { name: 'Campus Board Max', type: 'repsSetsWeight', baselineDetails: { sets: 5, reps: '3', weight: 'Bodyweight', rest: 180 } }
            ]
          },
          {
            day: 'Tuesday',
            focus: 'Core & Tension',
            exercises: [
              { name: 'Front Lever Progression', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '5s', weight: 'Bodyweight', rest: 120 } },
              { name: 'Weighted Leg Raises', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '10', weight: '+5kg', rest: 90 } },
              { name: 'Plank Variations', type: 'timer', baselineDetails: { sets: 3, duration: 60, rest: 60, description: 'Side planks and regular' } }
            ]
          },
          {
            day: 'Wednesday',
            focus: 'Rest',
            exercises: []
          },
          {
            day: 'Thursday',
            focus: 'Limit Bouldering',
            exercises: [
              { name: 'Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 1200, rest: 0, description: '20-min progressive warm-up' } },
              { name: 'Project Attempts', type: 'timer', baselineDetails: { sets: 8, duration: 360, rest: 360, description: '6-min work, 6-min rest on limit problems' } }
            ]
          },
          {
            day: 'Friday',
            focus: 'Antagonist & Mobility',
            exercises: [
              { name: 'Weighted Push-ups', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '12', weight: '+10kg', rest: 90 } },
              { name: 'Ring Dips', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '8', weight: 'Bodyweight', rest: 90 } },
              { name: 'Mobility Work', type: 'timer', baselineDetails: { sets: 1, duration: 1200, rest: 0, description: '20-min stretching' } }
            ]
          },
          {
            day: 'Saturday',
            focus: 'Power Endurance',
            exercises: [
              { name: 'Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 900, rest: 0, description: '15-min warm-up' } },
              { name: 'Linked Boulder Problems', type: 'timer', baselineDetails: { sets: 5, duration: 300, rest: 300, description: 'Link 3-4 problems, 5-min rest' } },
              { name: 'Volume Climbing', type: 'timer', baselineDetails: { sets: 1, duration: 1200, rest: 0, description: '20-min moderate climbing' } }
            ]
          },
          {
            day: 'Sunday',
            focus: 'Active Recovery',
            exercises: [
              { name: 'Easy Climbing', type: 'timer', baselineDetails: { sets: 1, duration: 2400, rest: 0, description: '40-min easy climbing or hiking' } }
            ]
          }
        ]
      },
      progressionSettings: {
        strategy: 'linear',
        increments: {
          sets: 0,
          reps: 0.3,
          weight: 2.5,
          duration: 20
        },
        userMultiplier: 1.0,
        adaptiveEnabled: true
      }
    }
  ],
  running: [
    {
      id: 'running-5k',
      name: 'Couch to 5K',
      sport: 'running',
      description: '8-week plan to run your first 5K',
      durationWeeks: 8,
      baseWeek: {
        days: [
          {
            day: 'Monday',
            focus: 'Interval Training',
            exercises: [
              { name: 'Walk Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 300, rest: 0, description: '5-min brisk walk' } },
              { name: 'Run/Walk Intervals', type: 'timer', baselineDetails: { sets: 5, duration: 60, rest: 120, description: '1-min run, 2-min walk' } },
              { name: 'Cool-down Walk', type: 'timer', baselineDetails: { sets: 1, duration: 300, rest: 0, description: '5-min easy walk' } }
            ]
          },
          {
            day: 'Tuesday',
            focus: 'Rest or Cross-train',
            exercises: [
              { name: 'Optional: Cycling or Swimming', type: 'timer', baselineDetails: { sets: 1, duration: 1800, rest: 0, description: '30-min low-intensity cardio' } }
            ]
          },
          {
            day: 'Wednesday',
            focus: 'Easy Run',
            exercises: [
              { name: 'Warm-up Walk', type: 'timer', baselineDetails: { sets: 1, duration: 300, rest: 0, description: '5-min walk' } },
              { name: 'Easy Run', type: 'timer', baselineDetails: { sets: 1, duration: 600, rest: 0, description: '10-min easy pace run' } },
              { name: 'Cool-down Walk', type: 'timer', baselineDetails: { sets: 1, duration: 300, rest: 0, description: '5-min walk' } }
            ]
          },
          {
            day: 'Thursday',
            focus: 'Rest',
            exercises: []
          },
          {
            day: 'Friday',
            focus: 'Interval Training',
            exercises: [
              { name: 'Warm-up Walk', type: 'timer', baselineDetails: { sets: 1, duration: 300, rest: 0, description: '5-min walk' } },
              { name: 'Run/Walk Intervals', type: 'timer', baselineDetails: { sets: 5, duration: 60, rest: 120, description: '1-min run, 2-min walk' } },
              { name: 'Cool-down Walk', type: 'timer', baselineDetails: { sets: 1, duration: 300, rest: 0, description: '5-min walk' } }
            ]
          },
          {
            day: 'Saturday',
            focus: 'Long Run',
            exercises: [
              { name: 'Warm-up Walk', type: 'timer', baselineDetails: { sets: 1, duration: 300, rest: 0, description: '5-min walk' } },
              { name: 'Long Easy Run', type: 'timer', baselineDetails: { sets: 1, duration: 900, rest: 0, description: '15-min easy run' } },
              { name: 'Cool-down Walk', type: 'timer', baselineDetails: { sets: 1, duration: 300, rest: 0, description: '5-min walk' } }
            ]
          },
          {
            day: 'Sunday',
            focus: 'Rest or Yoga',
            exercises: [
              { name: 'Stretching & Mobility', type: 'timer', baselineDetails: { sets: 1, duration: 1200, rest: 0, description: '20-min stretching' } }
            ]
          }
        ]
      },
      progressionSettings: {
        strategy: 'linear',
        increments: {
          sets: 0.5,
          reps: 0,
          weight: 0,
          duration: 60
        },
        userMultiplier: 1.0,
        adaptiveEnabled: true
      }
    },
    {
      id: 'running-10k',
      name: '10K Training Plan',
      sport: 'running',
      description: '10-week plan to complete a 10K race',
      durationWeeks: 10,
      baseWeek: {
        days: [
          {
            day: 'Monday',
            focus: 'Rest or Easy Run',
            exercises: [
              { name: 'Optional Easy Run', type: 'timer', baselineDetails: { sets: 1, duration: 1800, rest: 0, description: '30-min easy pace' } }
            ]
          },
          {
            day: 'Tuesday',
            focus: 'Tempo Run',
            exercises: [
              { name: 'Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 600, rest: 0, description: '10-min easy jog' } },
              { name: 'Tempo Intervals', type: 'timer', baselineDetails: { sets: 3, duration: 600, rest: 180, description: '10-min at tempo pace, 3-min recovery' } },
              { name: 'Cool-down', type: 'timer', baselineDetails: { sets: 1, duration: 600, rest: 0, description: '10-min easy jog' } }
            ]
          },
          {
            day: 'Wednesday',
            focus: 'Easy Run',
            exercises: [
              { name: 'Easy Run', type: 'timer', baselineDetails: { sets: 1, duration: 2400, rest: 0, description: '40-min easy pace' } }
            ]
          },
          {
            day: 'Thursday',
            focus: 'Intervals',
            exercises: [
              { name: 'Warm-up', type: 'timer', baselineDetails: { sets: 1, duration: 600, rest: 0, description: '10-min easy jog' } },
              { name: 'Speed Intervals', type: 'timer', baselineDetails: { sets: 6, duration: 240, rest: 120, description: '4-min hard, 2-min recovery' } },
              { name: 'Cool-down', type: 'timer', baselineDetails: { sets: 1, duration: 600, rest: 0, description: '10-min easy jog' } }
            ]
          },
          {
            day: 'Friday',
            focus: 'Rest',
            exercises: []
          },
          {
            day: 'Saturday',
            focus: 'Long Run',
            exercises: [
              { name: 'Long Run', type: 'timer', baselineDetails: { sets: 1, duration: 3600, rest: 0, description: '60-min long run at easy pace' } }
            ]
          },
          {
            day: 'Sunday',
            focus: 'Recovery Run',
            exercises: [
              { name: 'Recovery Run', type: 'timer', baselineDetails: { sets: 1, duration: 1800, rest: 0, description: '30-min very easy pace' } }
            ]
          }
        ]
      },
      progressionSettings: {
        strategy: 'linear',
        increments: {
          sets: 0,
          reps: 0,
          weight: 0,
          duration: 120
        },
        userMultiplier: 1.0,
        adaptiveEnabled: true
      }
    }
  ],
  strength: [
    {
      id: 'strength-beginner',
      name: 'Starting Strength',
      sport: 'strength training',
      description: 'Classic beginner strength program',
      durationWeeks: 12,
      baseWeek: {
        days: [
          {
            day: 'Monday',
            focus: 'Full Body A',
            exercises: [
              { name: 'Squat', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '5', weight: '40kg', rest: 180 } },
              { name: 'Bench Press', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '5', weight: '30kg', rest: 180 } },
              { name: 'Deadlift', type: 'repsSetsWeight', baselineDetails: { sets: 1, reps: '5', weight: '50kg', rest: 240 } }
            ]
          },
          {
            day: 'Tuesday',
            focus: 'Rest',
            exercises: []
          },
          {
            day: 'Wednesday',
            focus: 'Full Body B',
            exercises: [
              { name: 'Squat', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '5', weight: '40kg', rest: 180 } },
              { name: 'Overhead Press', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '5', weight: '20kg', rest: 180 } },
              { name: 'Barbell Row', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '5', weight: '30kg', rest: 180 } }
            ]
          },
          {
            day: 'Thursday',
            focus: 'Rest',
            exercises: []
          },
          {
            day: 'Friday',
            focus: 'Full Body A',
            exercises: [
              { name: 'Squat', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '5', weight: '40kg', rest: 180 } },
              { name: 'Bench Press', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '5', weight: '30kg', rest: 180 } },
              { name: 'Deadlift', type: 'repsSetsWeight', baselineDetails: { sets: 1, reps: '5', weight: '50kg', rest: 240 } }
            ]
          },
          {
            day: 'Saturday',
            focus: 'Rest',
            exercises: []
          },
          {
            day: 'Sunday',
            focus: 'Active Recovery',
            exercises: [
              { name: 'Walking or Light Cardio', type: 'timer', baselineDetails: { sets: 1, duration: 1800, rest: 0, description: '30-min easy activity' } }
            ]
          }
        ]
      },
      progressionSettings: {
        strategy: 'linear',
        increments: {
          sets: 0,
          reps: 0,
          weight: 2.5,
          duration: 0
        },
        userMultiplier: 1.0,
        adaptiveEnabled: true
      }
    },
    {
      id: 'strength-ppl',
      name: 'Push/Pull/Legs',
      sport: 'strength training',
      description: '6-day split for intermediate lifters',
      durationWeeks: 12,
      baseWeek: {
        days: [
          {
            day: 'Monday',
            focus: 'Push',
            exercises: [
              { name: 'Bench Press', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '6', weight: '60kg', rest: 180 } },
              { name: 'Overhead Press', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '8', weight: '40kg', rest: 120 } },
              { name: 'Incline Dumbbell Press', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '10', weight: '20kg', rest: 90 } },
              { name: 'Tricep Dips', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: 'Bodyweight', rest: 90 } },
              { name: 'Lateral Raises', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '15', weight: '8kg', rest: 60 } }
            ]
          },
          {
            day: 'Tuesday',
            focus: 'Pull',
            exercises: [
              { name: 'Deadlift', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '5', weight: '100kg', rest: 240 } },
              { name: 'Pull-ups', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '8', weight: 'Bodyweight', rest: 120 } },
              { name: 'Barbell Rows', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '8', weight: '60kg', rest: 120 } },
              { name: 'Face Pulls', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '15', weight: '20kg', rest: 60 } },
              { name: 'Bicep Curls', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: '12kg', rest: 60 } }
            ]
          },
          {
            day: 'Wednesday',
            focus: 'Legs',
            exercises: [
              { name: 'Squat', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '6', weight: '80kg', rest: 180 } },
              { name: 'Romanian Deadlift', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '10', weight: '60kg', rest: 120 } },
              { name: 'Leg Press', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: '120kg', rest: 90 } },
              { name: 'Leg Curls', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: '40kg', rest: 60 } },
              { name: 'Calf Raises', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '15', weight: '40kg', rest: 60 } }
            ]
          },
          {
            day: 'Thursday',
            focus: 'Push',
            exercises: [
              { name: 'Overhead Press', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '6', weight: '40kg', rest: 180 } },
              { name: 'Bench Press', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '8', weight: '60kg', rest: 120 } },
              { name: 'Dumbbell Flyes', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: '15kg', rest: 90 } },
              { name: 'Tricep Extensions', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: '20kg', rest: 60 } },
              { name: 'Front Raises', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: '8kg', rest: 60 } }
            ]
          },
          {
            day: 'Friday',
            focus: 'Pull',
            exercises: [
              { name: 'Barbell Rows', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '6', weight: '70kg', rest: 180 } },
              { name: 'Lat Pulldowns', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '10', weight: '60kg', rest: 90 } },
              { name: 'Cable Rows', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: '50kg', rest: 90 } },
              { name: 'Shrugs', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '15', weight: '40kg', rest: 60 } },
              { name: 'Hammer Curls', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '12', weight: '12kg', rest: 60 } }
            ]
          },
          {
            day: 'Saturday',
            focus: 'Legs',
            exercises: [
              { name: 'Front Squat', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '8', weight: '60kg', rest: 180 } },
              { name: 'Lunges', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '10', weight: '20kg', rest: 90 } },
              { name: 'Leg Extensions', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '15', weight: '50kg', rest: 60 } },
              { name: 'Leg Curls', type: 'repsSetsWeight', baselineDetails: { sets: 3, reps: '15', weight: '40kg', rest: 60 } },
              { name: 'Seated Calf Raises', type: 'repsSetsWeight', baselineDetails: { sets: 4, reps: '20', weight: '30kg', rest: 60 } }
            ]
          },
          {
            day: 'Sunday',
            focus: 'Rest',
            exercises: []
          }
        ]
      },
      progressionSettings: {
        strategy: 'linear',
        increments: {
          sets: 0,
          reps: 0,
          weight: 2.5,
          duration: 0
        },
        userMultiplier: 1.0,
        adaptiveEnabled: true
      }
    }
  ]
};

// --- System Prompt for AI Plan Generation (Updated for baseWeek) ---
const AI_PLAN_SYSTEM_PROMPT = `You are an expert fitness planner. The user will provide their background, sport/activity, and goals. Create a structured JSON training plan with a SINGLE REPEATING WEEK that will progress over time.

CRITICAL: The output *must* be ONLY a single JSON object. No markdown code blocks, no comments, no explanations.
- Do NOT include \`\`\`json or \`\`\`
- Do NOT include // comments in the JSON
- Generate a SINGLE base week that repeats (NOT all 12 weeks)
- Return ONLY pure JSON

The user will provide their context and goals in their message. Use that information to create a science-based, week-based plan that progresses automatically through progressive overload.

The JSON structure must be:
{
  "planName": "A catchy name for the plan based on the user's goal",
  "planType": "repeating-week",
  "sport": "the primary sport/activity",
  "durationWeeks": 12,
  "baseWeek": {
    "days": [
      {
        "day": "Monday",
        "focus": "Strength Training",
        "exercises": [
          {
            "name": "Squat",
            "type": "repsSetsWeight",
            "baselineDetails": {
              "sets": 3,
              "reps": "5",
              "weight": "80kg",
              "rest": 180
            }
          },
          {
            "name": "Warm-up",
            "type": "timer",
            "baselineDetails": {
              "sets": 1,
              "duration": 600,
              "rest": 0,
              "description": "10-min warm-up"
            }
          }
        ]
      },
      {
        "day": "Tuesday",
        "focus": "Rest",
        "exercises": []
      },
      {
        "day": "Wednesday",
        "focus": "Cardio",
        "exercises": [...]
      },
      {
        "day": "Thursday",
        "focus": "Strength",
        "exercises": [...]
      },
      {
        "day": "Friday",
        "focus": "Rest",
        "exercises": []
      },
      {
        "day": "Saturday",
        "focus": "Sport Practice",
        "exercises": [...]
      },
      {
        "day": "Sunday",
        "focus": "Active Recovery",
        "exercises": [...]
      }
    ]
  },
  "progressionSettings": {
    "strategy": "linear",
    "increments": {
      "sets": 0,
      "reps": 1,
      "weight": 2.5,
      "duration": 30
    },
    "userMultiplier": 1.0,
    "adaptiveEnabled": true
  }
}

IMPORTANT NOTES:
1. Use "baselineDetails" instead of "details" for exercises - these are the Week 1 starting values
2. The app will automatically calculate progressive overload each week based on progressionSettings
3. For weight increments, use appropriate values: 2.5-5kg for upper body, 5-10kg for lower body
4. For duration increments, 20-60 seconds per week is typical
5. For reps, 0.5-1 rep per week for strength, 1-2 for endurance
6. Include all 7 days (Monday-Sunday) with appropriate rest days
7. Adapt the exercises, focus areas, and progression to match the user's specific sport and goals`;

// --- Global API Helper ---
const callGeminiApi = async (userQuery, systemPrompt) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
  };

  let response;
  let delay = 1000;
  for (let i = 0; i < 5; i++) {
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        } else {
          throw new Error("Invalid response structure from API.");
        }
      } else if (response.status === 429 || response.status >= 500) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        const errText = await response.text();
        throw new Error(`API Error: ${response.status} ${errText}`);
      }
    } catch (e) {
      if (i === 4) throw e;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Failed to get response from API after retries.");
};

// --- React Components ---

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
  </div>
);

const ExerciseInfo = ({ exerciseName }) => {
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState(null);

  const handleGetInfo = async () => {
    if (info) {
      setShowModal(true);
      return;
    }

    setIsLoading(true);
    setShowModal(true);
    setError(null);

    const userQuery = `Explain how to perform the exercise "${exerciseName}" and its primary benefit. Keep it concise (2-3 sentences).`;
    const systemPrompt = "You are a fitness coach. Explain exercises clearly and simply.";

    try {
      const response = await callGeminiApi(userQuery, systemPrompt);
      setInfo(response);
    } catch (err) {
      setError("Failed to load exercise info. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleGetInfo}
        className="absolute top-2 right-2 text-gray-400 hover:text-indigo-400"
        aria-label={`More info about ${exerciseName}`}
      >
        <Info size={20} />
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-white"
            >
              <X size={24} />
            </button>
            <h3 className="text-xl font-semibold mb-4">{exerciseName}</h3>
            {isLoading && <LoadingSpinner />}
            {error && <p className="text-red-400">{error}</p>}
            {info && <p className="text-gray-300">{info}</p>}
          </div>
        </div>
      )}
    </>
  );
};

const TimerComponent = ({ exercise, onComplete }) => {
  const { sets, duration, rest, description } = exercise.details;

  const [currentSet, setCurrentSet] = useState(1);
  const [isResting, setIsResting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isActive, setIsActive] = useState(false);

  const timerRef = useRef(null);

  const startTimer = () => setIsActive(true);
  const pauseTimer = () => setIsActive(false);

  const resetTimer = () => {
    pauseTimer();
    setCurrentSet(1);
    setIsResting(false);
    setTimeLeft(duration);
  };

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            if (!isResting) {
              if (currentSet < sets) {
                setIsResting(true);
                return rest;
              } else {
                clearInterval(timerRef.current);
                setIsActive(false);
                onComplete();
                return 0;
              }
            } else {
              setIsResting(false);
              setCurrentSet((prevSet) => prevSet + 1);
              return duration;
            }
          }
          return prevTime - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isActive, isResting, currentSet, sets, duration, rest, onComplete]);

  const ExerciseIcon = getExerciseIcon(exercise.name, exercise.type);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-800 rounded-lg text-white text-center relative">
      <ExerciseInfo exerciseName={exercise.name} />
      <div className="mb-2 flex items-center justify-center gap-2">
        <div className="p-2 bg-gray-700 rounded-lg">
          <ExerciseIcon size={20} className={getExerciseIconColor(plan?.sport)} />
        </div>
        <div className="text-lg font-semibold">{exercise.name}</div>
      </div>
      {description && <div className="mb-4 text-sm text-gray-400">{description}</div>}

      <div className="text-xl font-medium mb-4">
        Set {currentSet} / {sets}
      </div>

      <div
        className={`my-4 rounded-full w-48 h-48 flex flex-col items-center justify-center border-8 ${isResting ? 'border-blue-500' : 'border-green-500'}`}
      >
        <div className="text-sm uppercase tracking-widest">
          {isResting ? 'REST' : 'WORK'}
        </div>
        <div className="text-6xl font-bold">
          {formatTimer(timeLeft)}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={isActive ? pauseTimer : startTimer}
          className={`px-6 py-3 rounded-full text-white font-semibold text-lg ${isActive ? 'bg-yellow-500' : 'bg-green-500'}`}
        >
          {isActive ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <button
          onClick={resetTimer}
          className="px-6 py-3 rounded-full bg-gray-600 text-white font-semibold"
        >
          <RotateCw size={24} />
        </button>
      </div>
    </div>
  );
};

const RepsSetsWeightComponent = ({ exercise, showSuggested = false, weekNumber = 1, plan }) => {
  // Safety check: ensure details exists
  if (!exercise.details) {
    return (
      <div className="p-6 bg-gray-800 rounded-lg text-white w-full relative">
        <div className="mb-4 text-2xl font-bold text-center">{exercise.name}</div>
        <div className="text-center text-gray-400">Exercise details not available</div>
      </div>
    );
  }

  const { sets, reps, weight, rest, description } = exercise.details;

  // Show baseline vs suggested comparison
  const baseline = exercise.baselineDetails || exercise.details;

  const ExerciseIcon = getExerciseIcon(exercise.name, exercise.type);

  return (
    <div className="p-6 bg-gray-800 rounded-lg text-white w-full relative">
      <ExerciseInfo exerciseName={exercise.name} />
      <div className="mb-4 flex items-center justify-center gap-3">
        <div className="p-2 bg-gray-700 rounded-lg">
          <ExerciseIcon size={24} className={getExerciseIconColor(plan?.sport)} />
        </div>
        <div className="text-2xl font-bold">{exercise.name}</div>
      </div>
      {description && <div className="mb-4 text-sm text-gray-300 text-center">{description}</div>}

      {showSuggested && weekNumber > 1 && (
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-2 bg-green-900 bg-opacity-30 px-3 py-1 rounded-full">
            <TrendingUp size={16} className="text-green-400" />
            <span className="text-sm text-green-400">Week {weekNumber} Progression</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-sm uppercase text-gray-400">Sets</div>
          <div className="text-3xl font-bold">{sets}</div>
          {showSuggested && weekNumber > 1 && sets !== baseline.sets && (
            <div className="text-xs text-green-400 mt-1">+{sets - baseline.sets}</div>
          )}
        </div>
        <div>
          <div className="text-sm uppercase text-gray-400">Reps</div>
          <div className="text-3xl font-bold">{reps}</div>
          {showSuggested && weekNumber > 1 && reps !== baseline.reps && (
            <div className="text-xs text-green-400 mt-1">↑</div>
          )}
        </div>
        <div>
          <div className="text-sm uppercase text-gray-400">Weight</div>
          <div className="text-3xl font-bold">{weight}</div>
          {showSuggested && weekNumber > 1 && weight !== baseline.weight && (
            <div className="text-xs text-green-400 mt-1">↑</div>
          )}
        </div>
      </div>

      {rest > 0 && (
        <div className="mt-6 text-center">
          <div className="text-sm uppercase text-gray-400">Rest Between Sets</div>
          <div className="text-2xl font-bold">{formatTimer(rest)}</div>
        </div>
      )}
    </div>
  );
};

// Component for active set tracking during workout
const SetTrackingComponent = ({ exercise, onComplete, weekNumber = 1, plan }) => {
  if (!exercise.details) {
    return (
      <div className="p-6 bg-gray-800 rounded-lg text-white w-full">
        <div className="mb-4 text-2xl font-bold text-center">{exercise.name}</div>
        <div className="text-center text-gray-400">Exercise details not available</div>
      </div>
    );
  }

  const { sets, reps, weight, rest, description } = exercise.details;
  const baseline = exercise.baselineDetails || exercise.details;

  const [completedSets, setCompletedSets] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const timerRef = useRef(null);

  const handleSetComplete = () => {
    const newCompletedSets = completedSets + 1;
    setCompletedSets(newCompletedSets);

    if (newCompletedSets >= sets) {
      // All sets completed
      if (timerRef.current) clearInterval(timerRef.current);
      onComplete();
    } else if (rest > 0) {
      // Start rest timer
      setIsResting(true);
      setRestTimeLeft(rest);
    }
  };

  useEffect(() => {
    if (isResting && rest > 0) {
      timerRef.current = setInterval(() => {
        setRestTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setIsResting(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isResting, rest]);

  const skipRest = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsResting(false);
    setRestTimeLeft(0);
  };

  const ExerciseIcon = getExerciseIcon(exercise.name, exercise.type);

  return (
    <div className="p-6 bg-gray-800 rounded-lg text-white w-full">
      <ExerciseInfo exerciseName={exercise.name} />
      <div className="mb-4 flex items-center justify-center gap-3">
        <div className="p-3 bg-gray-700 rounded-lg">
          <ExerciseIcon size={28} className={getExerciseIconColor(plan?.sport)} />
        </div>
        <div className="text-2xl font-bold">{exercise.name}</div>
      </div>
      {description && <div className="mb-4 text-sm text-gray-300 text-center">{description}</div>}

      {weekNumber > 1 && (
        <div className="mb-4 text-center">
          <div className="inline-flex items-center gap-2 bg-green-900 bg-opacity-30 px-3 py-1 rounded-full">
            <TrendingUp size={16} className="text-green-400" />
            <span className="text-sm text-green-400">Week {weekNumber} Progression</span>
          </div>
        </div>
      )}

      {/* Target numbers */}
      <div className="grid grid-cols-3 gap-4 text-center mb-6">
        <div>
          <div className="text-sm uppercase text-gray-400">Sets</div>
          <div className="text-3xl font-bold">{sets}</div>
          {weekNumber > 1 && sets !== baseline.sets && (
            <div className="text-xs text-green-400 mt-1">+{sets - baseline.sets}</div>
          )}
        </div>
        <div>
          <div className="text-sm uppercase text-gray-400">Reps</div>
          <div className="text-3xl font-bold">{reps}</div>
          {weekNumber > 1 && reps !== baseline.reps && (
            <div className="text-xs text-green-400 mt-1">+{reps - baseline.reps}</div>
          )}
        </div>
        <div>
          <div className="text-sm uppercase text-gray-400">Weight</div>
          <div className="text-3xl font-bold">{weight}</div>
          {weekNumber > 1 && weight !== baseline.weight && (
            <div className="text-xs text-green-400 mt-1">+{weight - baseline.weight}</div>
          )}
        </div>
      </div>

      {/* Set Progress */}
      <div className="mb-6">
        <div className="text-center mb-3">
          <span className="text-4xl font-bold text-indigo-400">{completedSets}</span>
          <span className="text-2xl text-gray-400"> / {sets}</span>
          <div className="text-sm text-gray-400 mt-1">Sets Completed</div>
        </div>

        <div className="flex gap-2 justify-center flex-wrap">
          {Array.from({ length: sets }).map((_, idx) => (
            <div
              key={idx}
              className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${
                idx < completedSets
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Rest Timer */}
      {isResting ? (
        <div className="text-center mb-6">
          <div className="text-sm uppercase text-gray-400 mb-2">Rest Time</div>
          <div className="text-5xl font-bold text-blue-400 mb-4">{formatTimer(restTimeLeft)}</div>
          <button
            onClick={skipRest}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg"
          >
            Skip Rest
          </button>
        </div>
      ) : completedSets < sets && (
        <button
          onClick={handleSetComplete}
          className="w-full py-4 bg-indigo-600 text-white rounded-lg text-lg font-semibold flex items-center justify-center gap-2"
        >
          <CheckCircle size={24} />
          Set {completedSets + 1} Done
        </button>
      )}

      {rest > 0 && !isResting && (
        <div className="mt-4 text-center text-sm text-gray-400">
          Rest {formatTimer(rest)} between sets
        </div>
      )}
    </div>
  );
};

// Hangboard-specific timer component
const HangboardComponent = ({ exercise, onComplete, weekNumber = 1 }) => {
  if (!exercise.details) {
    return (
      <div className="p-6 bg-gray-800 rounded-lg text-white w-full">
        <div className="mb-4 text-2xl font-bold text-center">{exercise.name}</div>
        <div className="text-center text-gray-400">Exercise details not available</div>
      </div>
    );
  }

  const { sets, duration, rest, description } = exercise.details;
  const baseline = exercise.baselineDetails || exercise.details;

  const [currentSet, setCurrentSet] = useState(1);
  const [isResting, setIsResting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isActive, setIsActive] = useState(false);

  const timerRef = useRef(null);

  const startTimer = () => setIsActive(true);
  const pauseTimer = () => setIsActive(false);

  const resetTimer = () => {
    pauseTimer();
    setCurrentSet(1);
    setIsResting(false);
    setTimeLeft(duration);
  };

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            if (!isResting) {
              if (currentSet < sets) {
                setIsResting(true);
                return rest;
              } else {
                clearInterval(timerRef.current);
                setIsActive(false);
                onComplete();
                return 0;
              }
            } else {
              setIsResting(false);
              setCurrentSet((prevSet) => prevSet + 1);
              return duration;
            }
          }
          return prevTime - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isActive, isResting, currentSet, sets, duration, rest, onComplete]);

  const ExerciseIcon = getExerciseIcon(exercise.name, exercise.type);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-800 rounded-lg text-white text-center">
      <ExerciseInfo exerciseName={exercise.name} />
      <div className="mb-2 flex items-center justify-center gap-2">
        <div className="p-2 bg-gray-700 rounded-lg">
          <ExerciseIcon size={20} className={getExerciseIconColor(plan?.sport)} />
        </div>
        <div className="text-lg font-semibold">{exercise.name}</div>
      </div>
      {description && <div className="mb-4 text-sm text-gray-400">{description}</div>}

      {weekNumber > 1 && (
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 bg-green-900 bg-opacity-30 px-3 py-1 rounded-full">
            <TrendingUp size={16} className="text-green-400" />
            <span className="text-sm text-green-400">Week {weekNumber} Progression</span>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-6 text-center">
        <div>
          <div className="text-sm uppercase text-gray-400">Hang Time</div>
          <div className="text-2xl font-bold">{duration}s</div>
          {weekNumber > 1 && duration !== baseline.duration && (
            <div className="text-xs text-green-400 mt-1">+{duration - baseline.duration}s</div>
          )}
        </div>
        <div>
          <div className="text-sm uppercase text-gray-400">Rest</div>
          <div className="text-2xl font-bold">{rest}s</div>
        </div>
        <div>
          <div className="text-sm uppercase text-gray-400">Sets</div>
          <div className="text-2xl font-bold">{sets}</div>
          {weekNumber > 1 && sets !== baseline.sets && (
            <div className="text-xs text-green-400 mt-1">+{sets - baseline.sets}</div>
          )}
        </div>
      </div>

      <div className="text-xl font-medium mb-4">
        Set {currentSet} / {sets}
      </div>

      <div
        className={`my-4 rounded-full w-48 h-48 flex flex-col items-center justify-center border-8 ${
          isResting ? 'border-blue-500' : 'border-red-500'
        }`}
      >
        <div className="text-sm uppercase tracking-widest">
          {isResting ? 'REST' : 'HANG'}
        </div>
        <div className="text-6xl font-bold">
          {formatTimer(timeLeft)}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={isActive ? pauseTimer : startTimer}
          className={`px-6 py-3 rounded-full text-white font-semibold text-lg ${
            isActive ? 'bg-yellow-500' : 'bg-green-500'
          }`}
        >
          {isActive ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <button
          onClick={resetTimer}
          className="px-6 py-3 rounded-full bg-gray-600 text-white font-semibold"
        >
          <RotateCw size={24} />
        </button>
      </div>
    </div>
  );
};

const ActiveWorkoutView = ({ db, auth, userId, appId, plan, activeProfileId, dayData, showDashboard }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const currentExercise = dayData.exercises[currentIndex];

  const handleNext = () => {
    if (currentIndex < dayData.exercises.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleFinish = async () => {
    setIsCompleting(true);
    try {
      const historyColRef = collection(db, 'artifacts', appId, 'users', userId, 'history');

      const planStartDate = plan.createdAt;
      const today = new Date();
      const diffTime = Math.abs(today - planStartDate);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const currentPlanWeek = (Math.floor(diffDays / 7) % plan.durationWeeks) + 1;

      await addDoc(historyColRef, {
        completedAt: serverTimestamp(),
        planName: plan.planName,
        weekNumber: currentPlanWeek,
        day: dayData.day,
        focus: dayData.focus,
        exercises: dayData.exercises.map(e => e.name),
        profileId: activeProfileId
      });
      showDashboard();
    } catch (error) {
      console.error("Error logging workout:", error);
      setIsCompleting(false);
    }
  };

  const isLastExercise = currentIndex === dayData.exercises.length - 1;

  const handleDone = () => {
    if (isLastExercise) {
      handleFinish();
    } else {
      handleNext();
    }
  };

  const handleSkip = () => {
    if (isLastExercise) {
      handleFinish();
    } else {
      handleNext();
    }
  };

  return (
    <div className="p-4 pt-12 bg-gray-900 text-white min-h-full flex flex-col">
      <button onClick={showDashboard} className="absolute top-4 left-4 text-gray-400">
        <X size={24} />
      </button>
      <h2 className="text-2xl font-bold text-center mb-2">{dayData.focus}</h2>
      <div className="text-center text-gray-400 mb-6">
        Exercise {currentIndex + 1} of {dayData.exercises.length}
      </div>

      <div className="flex-grow flex items-center justify-center">
        {currentExercise.type === 'timer' ? (
          <TimerComponent
            exercise={currentExercise}
            onComplete={handleDone}
          />
        ) : currentExercise.type === 'hangboard' ? (
          <HangboardComponent
            exercise={currentExercise}
            onComplete={handleDone}
            weekNumber={dayData.weekNumber || 1}
          />
        ) : currentExercise.type === 'repsSetsWeight' ? (
          <SetTrackingComponent
            exercise={currentExercise}
            onComplete={handleDone}
            weekNumber={dayData.weekNumber || 1}
            plan={plan}
          />
        ) : (
          <RepsSetsWeightComponent
            exercise={currentExercise}
            showSuggested={true}
            weekNumber={dayData.weekNumber || 1}
            plan={plan}
          />
        )}
      </div>

      <div className="mt-8 space-y-3">
        {currentExercise.type !== 'timer' && currentExercise.type !== 'hangboard' && currentExercise.type !== 'repsSetsWeight' && (
           <button
              onClick={handleDone}
              disabled={isCompleting}
              className={`w-full py-4 rounded-lg text-lg font-semibold flex items-center justify-center gap-2 ${isLastExercise ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'} disabled:bg-gray-500`}
           >
              {isCompleting ? <LoadingSpinner /> : (isLastExercise ? <CheckCircle size={24} /> : <ArrowRight size={24} />)}
              {isLastExercise ? "Finish Workout" : "Done with Exercise"}
           </button>
        )}

        <button
           onClick={handleSkip}
           disabled={isCompleting}
           className="w-full bg-gray-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-500"
        >
           {isLastExercise ? "Skip and Finish" : "Skip Exercise"}
        </button>
      </div>
    </div>
  );
};

const DashboardView = ({ db, auth, userId, appId, plan, history, showCreatePlan, startWorkout, showPlanManagement }) => {
  const [selectedDayName, setSelectedDayName] = useState(getTodayDayName());
  const [isLogging, setIsLogging] = useState(false);
  const todayDayName = getTodayDayName();

  const { currentWeekData, todayWorkoutData, currentPlanWeek, isCompletedToday, adaptiveFactor } = useMemo(() => {
    if (!plan || !plan.createdAt || !plan.baseWeek) {
      return { currentWeekData: null, todayWorkoutData: null, currentPlanWeek: null, isCompletedToday: false, adaptiveFactor: 1.0 };
    }

    const planStartDate = plan.createdAt;
    const today = new Date();

    const diffTime = Math.abs(today - planStartDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const currentPlanWeek = (Math.floor(diffDays / 7) % plan.durationWeeks) + 1;

    // Calculate adaptive factor
    const adaptiveFactor = plan.progressionSettings?.adaptiveEnabled
      ? calculateAdaptiveFactor(history, currentPlanWeek)
      : 1.0;

    // Apply progression to baseWeek to get current week's plan
    const currentWeek = {
      weekNumber: currentPlanWeek,
      days: plan.baseWeek.days.map(day => ({
        ...day,
        exercises: day.exercises.map(ex => ({
          ...ex,
          details: (ex.details || ex.baselineDetails)
            ? applyProgression(
                ex.baselineDetails || ex.details,
                currentPlanWeek,
                plan.progressionSettings || { strategy: 'linear', increments: {}, userMultiplier: 1.0 },
                adaptiveFactor
              )
            : undefined
        }))
      }))
    };

    const todayData = currentWeek.days.find(d => d.day === todayDayName);

    const todayStr = today.toISOString().split('T')[0];
    const completedToday = history.some(log => {
      const logDate = log.completedAt.toISOString().split('T')[0];
      return logDate === todayStr && log.day === todayDayName;
    });

    return {
      currentWeekData: currentWeek,
      todayWorkoutData: todayData,
      currentPlanWeek,
      isCompletedToday: completedToday,
      adaptiveFactor
    };
  }, [plan, history, todayDayName]);

  const selectedDayData = useMemo(() => {
    if (!currentWeekData) return null;
    return currentWeekData.days.find(d => d.day === selectedDayName);
  }, [currentWeekData, selectedDayName]);

  const handleLogAsDone = async () => {
    if (!todayWorkoutData || isLogging || !plan) return;

    setIsLogging(true);
    try {
      const historyColRef = collection(db, 'artifacts', appId, 'users', userId, 'history');

      await addDoc(historyColRef, {
        completedAt: serverTimestamp(),
        planName: plan.planName,
        weekNumber: currentPlanWeek,
        day: todayWorkoutData.day,
        focus: todayWorkoutData.focus,
        exercises: todayWorkoutData.exercises.map(e => e.name),
        profileId: activeProfileId
      });
    } catch (error) {
      console.error("Error logging workout:", error);
    } finally {
      setIsLogging(false);
    }
  };

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Dumbbell size={64} className="text-indigo-400 mb-6" />
        <h2 className="text-2xl font-bold mb-2">Welcome to Your AI Trainer</h2>
        <p className="text-gray-400 mb-8">
          Get started by creating a personalized training plan.
        </p>
        <button
          onClick={() => showCreatePlan('choice')}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 text-lg"
        >
          <PlusCircle size={20} />
          Create Your First Plan
        </button>
      </div>
    );
  }

  if (!currentWeekData || !todayWorkoutData || !selectedDayData) {
    return (
      <div className="p-4 pt-10 text-center">
        <p className="text-gray-400">Loading plan data...</p>
      </div>
    );
  }

  const weekDays = currentWeekData.days.map(d => d.day);

  return (
    <div className="p-4 pt-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">{plan.planName}</h1>
          <p className="text-gray-400">Week {currentPlanWeek} of {plan.durationWeeks}</p>
          {plan.progressionSettings?.adaptiveEnabled && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
              <Sparkles size={12} />
              <span>Adaptive progression: {(adaptiveFactor * 100).toFixed(0)}%</span>
            </div>
          )}
        </div>
        <button onClick={showPlanManagement} className="text-indigo-400 text-sm">
          Manage Plan
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Today's Workout: {todayWorkoutData.focus}</h2>
        {todayWorkoutData.exercises.length === 0 ? (
          <p className="text-gray-400">Rest Day. Enjoy!</p>
        ) : (
          <ul className="list-disc list-inside text-gray-300 mb-6">
            {todayWorkoutData.exercises.map((ex, idx) => (
              <li key={idx}>{ex.name}</li>
            ))}
          </ul>
        )}

        {todayWorkoutData.exercises.length > 0 && (
          isCompletedToday ? (
            <div className="w-full bg-green-600 text-white py-3 rounded-lg text-lg font-semibold flex items-center justify-center gap-2 text-center">
              <CheckCircle size={24} />
              Completed Today!
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => startWorkout({ ...todayWorkoutData, weekNumber: currentPlanWeek })}
                disabled={isLogging}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-lg text-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Play size={20} />
                Start Training
              </button>
              <button
                onClick={handleLogAsDone}
                disabled={isLogging}
                className="flex-1 bg-gray-600 text-white py-3 rounded-lg text-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLogging ? <LoadingSpinner /> : <CheckCircle size={20} />}
                Mark as Done
              </button>
            </div>
          )
        )}
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <CalendarDays size={20} />
          This Week's Plan
        </h3>
        <div className="flex justify-between gap-1 mb-4">
          {weekDays.map(day => (
            <button
              key={day}
              onClick={() => setSelectedDayName(day)}
              className={`flex-1 p-2 rounded-lg text-center ${
                selectedDayName === day
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700'
              } ${
                day === todayDayName ? 'ring-2 ring-indigo-400' : ''
              }`}
            >
              <div className="text-xs font-medium">{day.substring(0, 3)}</div>
            </button>
          ))}
        </div>

        <div className="bg-gray-800 rounded-lg p-4 min-h-[150px]">
          <h4 className="font-semibold text-lg">{selectedDayName}: {selectedDayData.focus}</h4>
          {selectedDayData.exercises.length === 0 ? (
            <p className="text-gray-400 mt-2">Rest Day</p>
          ) : (
            <ul className="list-disc list-inside text-gray-300 mt-2">
              {selectedDayData.exercises.map((ex, idx) => (
                <li key={idx}>{ex.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
const CreatePlanView = ({ db, auth, userId, appId, activeProfileId, showDashboard, defaultView = 'ai' }) => {
  const [goal, setGoal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState(defaultView); // 'ai' or 'manual'
  const [manualJson, setManualJson] = useState('');

  const savePlanToFirestore = async (planObject) => {
    if (!planObject.planName || !planObject.baseWeek || !planObject.durationWeeks) {
      throw new Error("Invalid plan structure. Missing required fields.");
    }

    // Validate baseWeek structure
    if (!planObject.baseWeek.days || !Array.isArray(planObject.baseWeek.days)) {
      throw new Error("Invalid plan structure. baseWeek must have a days array.");
    }
    
    const planWithTimestamp = {
      ...planObject,
      createdAt: serverTimestamp() // Add the creation timestamp
    };

    const planDocRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', activeProfileId, 'plan', 'mainPlan');
    await setDoc(planDocRef, planWithTimestamp);
    
    // Clear history of the old plan
    // In a real app, you might archive this, but for simplicity, we clear it
    const historyColRef = collection(db, 'artifacts', appId, 'users', userId, 'history');
    // Note: Deleting a collection client-side is complex. We'll just start logging new history.
    // New logs will have the new planName.
  };

  const handleGenerate = async () => {
    if (!goal) return;
    setIsLoading(true);
    setError(null);

    try {
      const jsonResponse = await callGeminiApi(goal, AI_PLAN_SYSTEM_PROMPT);

      let parsedPlan;
      try {
        // Clean up the response: remove markdown code blocks and comments
        let cleanedResponse = jsonResponse
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .replace(/\/\/.*$/gm, '')  // Remove single-line comments
          .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove multi-line comments
          .trim();

        parsedPlan = JSON.parse(cleanedResponse);

        // Validate the plan has required fields for repeating-week format
        if (!parsedPlan.planName || !parsedPlan.baseWeek || !parsedPlan.durationWeeks) {
          throw new Error("The AI plan is missing required fields. Please try again.");
        }

        // Validate baseWeek structure
        if (!parsedPlan.baseWeek.days || !Array.isArray(parsedPlan.baseWeek.days)) {
          throw new Error("The AI plan has an invalid baseWeek structure. Please try again.");
        }
      } catch (parseError) {
        console.error("Failed to parse AI response:", jsonResponse);
        throw new Error("The AI returned an invalid plan format. Please try again or use Manual Import.");
      }

      await savePlanToFirestore(parsedPlan);
      showDashboard();
      
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualImport = async () => {
    if (!manualJson) return;
    setIsLoading(true);
    setError(null);

    try {
      let parsedPlan;
      try {
        parsedPlan = JSON.parse(manualJson);
      } catch (parseError) {
        throw new Error("Invalid JSON format. Please check your pasted text.");
      }

      await savePlanToFirestore(parsedPlan);
      showDashboard();

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const copyPrompt = () => {
    // A simple text-based copy
    const textArea = document.createElement("textarea");
    textArea.value = AI_PLAN_SYSTEM_PROMPT;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Failed to copy prompt', err);
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="p-4 pt-12 min-h-full">
      <button onClick={showDashboard} className="absolute top-4 left-4 text-gray-400">
        <ChevronLeft size={24} />
      </button>
      <h2 className="text-3xl font-bold text-center mb-6">Create New Plan</h2>
      
      <div className="flex mb-6 rounded-lg bg-gray-800 p-1">
        <button
          onClick={() => setView('ai')}
          className={`flex-1 py-2 rounded-md font-semibold ${view === 'ai' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
        >
          Generate with AI
        </button>
        <button
          onClick={() => setView('manual')}
          className={`flex-1 py-2 rounded-md font-semibold ${view === 'manual' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}
        >
          Manual Import
        </button>
      </div>

      {view === 'ai' && (
        <div className="flex flex-col gap-4">
          <label htmlFor="goal" className="font-semibold text-gray-300">
            Describe your training goals and background
          </label>
          <p className="text-sm text-gray-400 -mt-2">Include your sport/activity, current fitness level, and what you want to achieve</p>
          <textarea
            id="goal"
            rows="4"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full p-3 bg-gray-800 rounded-lg text-white border border-gray-700 focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g., 'I want to run a 5k in 8 weeks', 'Train for a cycling race', 'Improve my basketball skills', 'Get stronger for powerlifting'"
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !goal}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg text-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-500"
          >
            {isLoading ? <LoadingSpinner /> : <Brain size={20} />}
            Generate Plan
          </button>
        </div>
      )}
      
      {view === 'manual' && (
         <div className="flex flex-col gap-4">
          <p className="text-gray-400 text-sm">
            Generate a plan using an external AI, then paste the raw JSON output below.
          </p>
          <button 
            onClick={copyPrompt}
            className="flex items-center justify-center gap-2 text-indigo-400 bg-gray-800 p-2 rounded-lg"
          >
            <Copy size={16} />
            Copy AI Prompt for Compatible JSON
          </button>
          <textarea
            rows="10"
            value={manualJson}
            onChange={(e) => setManualJson(e.target.value)}
            className="w-full p-3 bg-gray-800 rounded-lg text-white border border-gray-700 font-mono text-sm focus:ring-2 focus:ring-indigo-500"
            placeholder='{ "planName": "...", "durationWeeks": 8, "weeks": [...] }'
          />
          <button
            onClick={handleManualImport}
            disabled={isLoading || !manualJson}
            className="w-full bg-green-600 text-white py-3 rounded-lg text-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-500"
          >
            {isLoading ? <LoadingSpinner /> : <FileText size={20} />}
            Import Plan
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-900 border border-red-700 text-red-100 rounded-lg">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
};

/**
 * HistoryView
 * Displays a log of completed workouts.
 */
const HistoryView = ({ history, plan }) => {
  return (
    <div className="p-4 pt-10">
      <h2 className="text-3xl font-bold mb-6">Workout History</h2>
      
      {history.length === 0 ? (
        <div className="text-center text-gray-400 mt-20">
          <History size={48} className="mx-auto mb-4" />
          <p>You haven't logged any workouts yet.</p>
          <p>Complete your first session to see it here!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map(log => (
            <div key={log.id} className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-lg">{log.focus || log.day}</h3>
                <span className="text-xs text-gray-400">
                  {log.completedAt.toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-300">
                {log.planName} - Week {log.weekNumber}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Completed {log.exercises?.length || 0} exercises.
              </p>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-10 p-4 bg-gray-800 rounded-lg text-center">
         <BarChart2 size={32} className="mx-auto text-indigo-400 mb-3" />
         <h4 className="font-semibold text-lg mb-1">Progression Graphs</h4>
         <p className="text-sm text-gray-400">Graphs and detailed progression tracking are coming soon!</p>
      </div>
    </div>
  );
};

/**
 * PlanView
 * Displays the current plan and settings.
 */
const PlanView = ({ plan, showCreatePlan, showEditPlan }) => {
  
  const handleEnableNotifications = () => {
    // In a real native app, this would trigger the permission prompt
    // e.g., using Capacitor's PushNotifications.requestPermissions()
    // For web, you might use: Notification.requestPermission()
    // Using a custom modal instead of alert
    alert("In a native app, this would ask for notification permissions.");
  };
  
  if (!plan) {
     return (
      <div className="p-4 pt-10 text-center">
        <h2 className="text-3xl font-bold mb-6">My Plan</h2>
        <p className="text-gray-400 mb-6">You don't have an active plan.</p>
         <button
          onClick={() => showCreatePlan('ai')}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 text-lg mx-auto"
        >
          <PlusCircle size={20} />
          Create Your First Plan
        </button>
      </div>
     );
  }
  
  return (
    <div className="p-4 pt-10">
      <h2 className="text-3xl font-bold mb-6">My Plan</h2>
      
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-1">Current Plan</h3>
        <p className="text-2xl text-indigo-300 mb-4">{plan.planName}</p>
        <p className="text-gray-400">{plan.durationWeeks} Week Program</p>
        <button
          onClick={showEditPlan}
          className="w-full mt-4 bg-gray-700 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2"
        >
          <Edit3 size={18} />
          Edit Plan
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-4">Plan Management</h3>
        <div className="space-y-3">
          <button
            onClick={() => showCreatePlan('ai')}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <Brain size={20} />
            Generate New Plan
          </button>
          <button
            onClick={() => showCreatePlan('manual')}
            className="w-full bg-gray-700 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <FileText size={20} />
            Import New Plan
          </button>
        </div>
      </div>
      
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-bold mb-4">Settings</h3>
        <button
          onClick={handleEnableNotifications}
          className="w-full bg-gray-700 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
        >
          <Bell size={20} />
          Enable Daily Notifications
        </button>
      </div>
    </div>
  );
};

/**
 * EditPlanView
 * Allows editing of the current training plan
 */
const EditPlanView = ({ db, userId, appId, plan, activeProfileId, showPlanView }) => {
  const [editedPlan, setEditedPlan] = useState(JSON.parse(JSON.stringify(plan))); // Deep copy
  const [selectedDay, setSelectedDay] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState(null);

  // Use baseWeek structure (not weeks array)
  const currentDay = editedPlan.baseWeek?.days[selectedDay];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const planDocRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', activeProfileId, 'plan', 'mainPlan');
      await setDoc(planDocRef, {
        ...editedPlan,
        createdAt: plan.createdAt // Preserve original creation date
      });
      showPlanView();
    } catch (error) {
      console.error("Error saving plan:", error);
      alert("Failed to save plan. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateExercise = (exerciseIndex, field, value) => {
    const newPlan = { ...editedPlan };
    const exercise = newPlan.baseWeek.days[selectedDay].exercises[exerciseIndex];

    if (field === 'name') {
      exercise.name = value;
    } else if (field.startsWith('details.') || field.startsWith('baselineDetails.')) {
      const detailField = field.split('.')[1];
      // Support both details and baselineDetails for compatibility
      const detailsKey = exercise.baselineDetails ? 'baselineDetails' : 'details';
      if (!exercise[detailsKey]) {
        exercise[detailsKey] = {};
      }
      exercise[detailsKey][detailField] = value;
    }

    setEditedPlan(newPlan);
  };

  const addExercise = () => {
    const newPlan = { ...editedPlan };
    newPlan.baseWeek.days[selectedDay].exercises.push({
      name: "New Exercise",
      type: "repsSetsWeight",
      baselineDetails: { sets: 3, reps: "10", weight: "Bodyweight", rest: 60 }
    });
    setEditedPlan(newPlan);
  };

  const deleteExercise = (exerciseIndex) => {
    const newPlan = { ...editedPlan };
    newPlan.baseWeek.days[selectedDay].exercises.splice(exerciseIndex, 1);
    setEditedPlan(newPlan);
    setExpandedExercise(null);
  };

  const changeDayFocus = (value) => {
    const newPlan = { ...editedPlan };
    newPlan.baseWeek.days[selectedDay].focus = value;
    setEditedPlan(newPlan);
  };

  const changeExerciseType = (exerciseIndex, newType) => {
    const newPlan = { ...editedPlan };
    const exercise = newPlan.baseWeek.days[selectedDay].exercises[exerciseIndex];
    exercise.type = newType;

    // Set default baselineDetails based on type
    if (newType === 'timer') {
      exercise.baselineDetails = { sets: 1, duration: 600, rest: 0, description: "Exercise description" };
    } else if (newType === 'hangboard') {
      exercise.baselineDetails = { sets: 5, duration: 10, rest: 30, description: "Hangboard exercise" };
    } else {
      exercise.baselineDetails = { sets: 3, reps: "10", weight: "Bodyweight", rest: 60 };
    }
    // Remove old details field if it exists
    delete exercise.details;

    setEditedPlan(newPlan);
  };

  return (
    <div className="p-4 pt-12 min-h-full pb-20">
      <div className="flex items-center justify-between mb-6">
        <button onClick={showPlanView} className="text-gray-400 flex items-center gap-2">
          <ChevronLeft size={24} />
          Back
        </button>
        <h2 className="text-2xl font-bold">Edit Plan</h2>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={20} />
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Plan Name */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <label className="text-sm text-gray-400 mb-1 block">Plan Name</label>
        <input
          type="text"
          value={editedPlan.planName}
          onChange={(e) => setEditedPlan({ ...editedPlan, planName: e.target.value })}
          className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Progression Settings */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={18} className="text-green-400" />
          <h3 className="text-lg font-semibold">Weekly Progression Increments</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Configure how much each exercise progresses each week. These increments are applied to your baseline (Week 1) values.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Sets Increment
              <span className="text-gray-500 ml-1">(per week)</span>
            </label>
            <input
              type="number"
              step="0.1"
              value={editedPlan.progressionSettings?.increments?.sets || 0}
              onChange={(e) => setEditedPlan({
                ...editedPlan,
                progressionSettings: {
                  ...editedPlan.progressionSettings,
                  increments: {
                    ...editedPlan.progressionSettings?.increments,
                    sets: parseFloat(e.target.value)
                  }
                }
              })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Reps Increment
              <span className="text-gray-500 ml-1">(per week)</span>
            </label>
            <input
              type="number"
              step="0.1"
              value={editedPlan.progressionSettings?.increments?.reps || 0}
              onChange={(e) => setEditedPlan({
                ...editedPlan,
                progressionSettings: {
                  ...editedPlan.progressionSettings,
                  increments: {
                    ...editedPlan.progressionSettings?.increments,
                    reps: parseFloat(e.target.value)
                  }
                }
              })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Weight Increment
              <span className="text-gray-500 ml-1">(kg/lb per week)</span>
            </label>
            <input
              type="number"
              step="0.5"
              value={editedPlan.progressionSettings?.increments?.weight || 0}
              onChange={(e) => setEditedPlan({
                ...editedPlan,
                progressionSettings: {
                  ...editedPlan.progressionSettings,
                  increments: {
                    ...editedPlan.progressionSettings?.increments,
                    weight: parseFloat(e.target.value)
                  }
                }
              })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              Duration Increment
              <span className="text-gray-500 ml-1">(seconds per week)</span>
            </label>
            <input
              type="number"
              step="1"
              value={editedPlan.progressionSettings?.increments?.duration || 0}
              onChange={(e) => setEditedPlan({
                ...editedPlan,
                progressionSettings: {
                  ...editedPlan.progressionSettings,
                  increments: {
                    ...editedPlan.progressionSettings?.increments,
                    duration: parseFloat(e.target.value)
                  }
                }
              })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 p-3 bg-gray-900 rounded border border-gray-700">
          <div className="text-xs text-gray-400">
            <div className="font-semibold mb-1">Examples:</div>
            <ul className="list-disc list-inside space-y-1 text-gray-500">
              <li>Sets: 0.5 = +1 set every 2 weeks</li>
              <li>Reps: 1 = +1 rep per week</li>
              <li>Weight: 2.5 = +2.5kg per week</li>
              <li>Duration: 10 = +10 seconds per week</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Info Box about Base Week */}
      <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3 mb-4">
        <p className="text-sm text-blue-200">
          <strong>Note:</strong> You're editing the base week template. This week repeats throughout your plan with progressive overload applied automatically based on your progression settings above.
        </p>
      </div>

      {/* Day Selector */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 mb-2 block">Day</label>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {editedPlan.baseWeek?.days.map((day, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedDay(idx)}
              className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap ${
                selectedDay === idx ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}
            >
              {day.day.substring(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Day Focus */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <label className="text-sm text-gray-400 mb-1 block">Day Focus</label>
        <input
          type="text"
          value={currentDay?.focus || ''}
          onChange={(e) => changeDayFocus(e.target.value)}
          className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
          placeholder="e.g., Strength Training, Rest Day"
        />
      </div>

      {/* Exercises List */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Exercises ({currentDay?.exercises.length || 0})</h3>
          <button
            onClick={addExercise}
            className="bg-green-600 text-white px-3 py-2 rounded-lg font-semibold flex items-center gap-2"
          >
            <Plus size={18} />
            Add Exercise
          </button>
        </div>

        {currentDay?.exercises.map((exercise, idx) => (
          <div key={idx} className="bg-gray-800 rounded-lg p-4 mb-3">
            <div className="flex items-center justify-between mb-3">
              <input
                type="text"
                value={exercise.name}
                onChange={(e) => updateExercise(idx, 'name', e.target.value)}
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none font-semibold"
              />
              <button
                onClick={() => setExpandedExercise(expandedExercise === idx ? null : idx)}
                className="ml-2 text-indigo-400"
              >
                <Edit3 size={20} />
              </button>
              <button
                onClick={() => deleteExercise(idx)}
                className="ml-2 text-red-400"
              >
                <Trash2 size={20} />
              </button>
            </div>

            {expandedExercise === idx && (
              <div className="space-y-3 border-t border-gray-700 pt-3">
                {/* Exercise Type */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Exercise Type</label>
                  <select
                    value={exercise.type}
                    onChange={(e) => changeExerciseType(idx, e.target.value)}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="repsSetsWeight">Reps/Sets/Weight</option>
                    <option value="timer">Timer</option>
                    <option value="hangboard">Hangboard</option>
                  </select>
                </div>

                {(() => {
                  // Support both details and baselineDetails for compatibility
                  const exDetails = exercise.baselineDetails || exercise.details || {};
                  return exercise.type === 'repsSetsWeight' ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Sets</label>
                          <input
                            type="number"
                            value={exDetails.sets || 0}
                            onChange={(e) => updateExercise(idx, 'details.sets', parseInt(e.target.value))}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Reps</label>
                          <input
                            type="text"
                            value={exDetails.reps || ''}
                            onChange={(e) => updateExercise(idx, 'details.reps', e.target.value)}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Weight</label>
                        <input
                          type="text"
                          value={exDetails.weight || ''}
                          onChange={(e) => updateExercise(idx, 'details.weight', e.target.value)}
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                          placeholder="e.g., 80kg, Bodyweight, 70% 1RM"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Rest (seconds)</label>
                        <input
                          type="number"
                          value={exDetails.rest || 0}
                          onChange={(e) => updateExercise(idx, 'details.rest', parseInt(e.target.value))}
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Sets</label>
                          <input
                            type="number"
                            value={exDetails.sets || 0}
                            onChange={(e) => updateExercise(idx, 'details.sets', parseInt(e.target.value))}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Duration (sec)</label>
                          <input
                            type="number"
                            value={exDetails.duration || 0}
                            onChange={(e) => updateExercise(idx, 'details.duration', parseInt(e.target.value))}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Rest (seconds)</label>
                        <input
                          type="number"
                          value={exDetails.rest || 0}
                          onChange={(e) => updateExercise(idx, 'details.rest', parseInt(e.target.value))}
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Description</label>
                        <textarea
                          value={exDetails.description || ''}
                          onChange={(e) => updateExercise(idx, 'details.description', e.target.value)}
                          className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-indigo-500 focus:outline-none"
                          rows="2"
                          placeholder="Exercise description or instructions"
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        ))}

        {(!currentDay?.exercises || currentDay.exercises.length === 0) && (
          <div className="text-center text-gray-400 py-8">
            <p>No exercises yet. Click "Add Exercise" to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
};


/**
 * ProfilesView Component
 * Manage user profiles - create, switch, edit, delete
 */
const ProfilesView = ({ db, userId, appId, profiles, activeProfileId, showDashboard }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileSport, setNewProfileSport] = useState('strength');
  const [editingProfile, setEditingProfile] = useState(null);
  const [editName, setEditName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sportOptions = [
    { value: 'strength', label: 'Strength Training', icon: Dumbbell },
    { value: 'climbing', label: 'Climbing', icon: Mountain },
    { value: 'running', label: 'Running', icon: Activity },
    { value: 'cycling', label: 'Cycling', icon: Bike },
    { value: 'swimming', label: 'Swimming', icon: Waves },
    { value: 'general', label: 'General Fitness', icon: Target }
  ];

  const createProfile = async () => {
    if (!newProfileName.trim()) {
      alert('Please enter a profile name');
      return;
    }

    setIsLoading(true);
    try {
      const profileId = `profile_${Date.now()}`;

      // Create profile metadata
      const profileRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', profileId);
      await setDoc(profileRef, {
        name: newProfileName,
        sport: newProfileSport,
        createdAt: serverTimestamp(),
        lastUsed: serverTimestamp()
      });

      // Set as active profile
      const activeProfileRef = doc(db, 'artifacts', appId, 'users', userId, 'activeProfile', 'current');
      await setDoc(activeProfileRef, { profileId });

      setNewProfileName('');
      setNewProfileSport('strength');
      setIsCreating(false);
    } catch (error) {
      console.error('Error creating profile:', error);
      alert('Failed to create profile');
    } finally {
      setIsLoading(false);
    }
  };

  const switchProfile = async (profileId) => {
    setIsLoading(true);
    try {
      const activeProfileRef = doc(db, 'artifacts', appId, 'users', userId, 'activeProfile', 'current');
      await setDoc(activeProfileRef, { profileId });

      // Update lastUsed timestamp
      const profileRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', profileId);
      await setDoc(profileRef, { lastUsed: serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error('Error switching profile:', error);
      alert('Failed to switch profile');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditProfile = (profile) => {
    setEditingProfile(profile.id);
    setEditName(profile.name);
  };

  const saveEditProfile = async (profileId) => {
    if (!editName.trim()) {
      alert('Please enter a profile name');
      return;
    }

    setIsLoading(true);
    try {
      const profileRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', profileId);
      await setDoc(profileRef, { name: editName }, { merge: true });

      setEditingProfile(null);
      setEditName('');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteProfile = async (profileId) => {
    if (profiles.length === 1) {
      alert('Cannot delete your only profile');
      return;
    }

    if (!confirm('Are you sure you want to delete this profile? This will permanently delete the training plan and history associated with it.')) {
      return;
    }

    setIsLoading(true);
    try {
      // Delete profile plan
      const planRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', profileId, 'plan', 'mainPlan');
      await deleteDoc(planRef);

      // Delete profile metadata
      const profileRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', profileId);
      await deleteDoc(profileRef);

      // If this was the active profile, switch to another one
      if (activeProfileId === profileId) {
        const remainingProfile = profiles.find(p => p.id !== profileId);
        if (remainingProfile) {
          await switchProfile(remainingProfile.id);
        }
      }

      // Note: History entries with this profileId will remain but won't be displayed
    } catch (error) {
      console.error('Error deleting profile:', error);
      alert('Failed to delete profile');
    } finally {
      setIsLoading(false);
    }
  };

  const getSportIcon = (sport) => {
    const option = sportOptions.find(opt => opt.value === sport);
    return option ? option.icon : Target;
  };

  return (
    <div className="h-full overflow-auto pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={showDashboard} className="p-2 hover:bg-gray-800 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <Users size={24} className="text-purple-400" />
            <h1 className="text-xl font-bold">Training Profiles</h1>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium"
          >
            <UserPlus size={18} />
            New Profile
          </button>
        </div>
      </div>

      <div className="p-4">
        {/* Create Profile Modal */}
        {isCreating && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Create New Profile</h2>
                <button onClick={() => setIsCreating(false)} className="p-1 hover:bg-gray-700 rounded">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Profile Name</label>
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="e.g., Powerlifting, Skiing, Swimming"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Sport Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {sportOptions.map(option => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setNewProfileSport(option.value)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                            newProfileSport === option.value
                              ? 'bg-purple-600 border-purple-500'
                              : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <Icon size={18} />
                          <span className="text-sm">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createProfile}
                    disabled={isLoading || !newProfileName.trim()}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Creating...' : 'Create Profile'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profiles List */}
        {profiles.length === 0 ? (
          <div className="text-center py-12">
            <Users size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400 mb-4">No profiles yet</p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium"
            >
              Create Your First Profile
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {profiles.map(profile => {
              const SportIcon = getSportIcon(profile.sport);
              const isActive = profile.id === activeProfileId;

              return (
                <div
                  key={profile.id}
                  className={`bg-gray-800 rounded-lg p-4 border-2 ${
                    isActive ? 'border-purple-500' : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`p-3 rounded-lg ${isActive ? 'bg-purple-600' : 'bg-gray-700'}`}>
                        <SportIcon size={24} />
                      </div>
                      <div className="flex-1">
                        {editingProfile === profile.id ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:border-purple-500"
                            autoFocus
                          />
                        ) : (
                          <>
                            <h3 className="text-lg font-semibold">{profile.name}</h3>
                            <p className="text-sm text-gray-400 capitalize">{profile.sport}</p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {editingProfile === profile.id ? (
                        <>
                          <button
                            onClick={() => saveEditProfile(profile.id)}
                            disabled={isLoading}
                            className="p-2 bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                          >
                            <Save size={18} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingProfile(null);
                              setEditName('');
                            }}
                            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                          >
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          {!isActive && (
                            <button
                              onClick={() => switchProfile(profile.id)}
                              disabled={isLoading}
                              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                              Switch
                            </button>
                          )}
                          <button
                            onClick={() => startEditProfile(profile)}
                            className="p-2 hover:bg-gray-700 rounded-lg"
                          >
                            <Edit3 size={18} />
                          </button>
                          <button
                            onClick={() => deleteProfile(profile.id)}
                            disabled={profiles.length === 1}
                            className="p-2 hover:bg-red-600 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <div className="mt-3 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-lg inline-flex items-center gap-2">
                      <CheckCircle size={16} className="text-purple-400" />
                      <span className="text-sm text-purple-400 font-medium">Active Profile</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <div className="flex gap-3">
            <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-300">
              <p className="font-medium text-blue-400 mb-1">About Profiles</p>
              <p>
                Profiles let you maintain separate training plans and history for different sports or goals.
                Switch between profiles anytime without losing your progress.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


/**
 * Main App Component
 * Handles auth, state, and routing.
 */
export default function App() {
  // Firebase state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // App state
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'createPlan', 'activeWorkout', 'history', 'plan', 'editPlan', 'profiles'
  const [plan, setPlan] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [createPlanDefaultView, setCreatePlanDefaultView] = useState('ai');

  // Profile state
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);

  // Data for active views
  const [activeWorkoutDay, setActiveWorkoutDay] = useState(null);

  // --- Firebase Initialization and Auth ---
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);
  
      setDb(dbInstance);
      setAuth(authInstance);
  
      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          try {
            const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
            if (token) {
              await signInWithCustomToken(authInstance, token);
            } else {
              await signInAnonymously(authInstance);
            }
          } catch (error) {
            console.error("Firebase auth failed:", error);
            setIsAuthReady(true); // Still ready, but as anonymous
          }
        }
      });
  
      return () => unsubscribe();
    } catch(e) {
      console.error("Error initializing Firebase: ", e);
      setIsAuthReady(true); // Allow app to load, though Firestore will fail.
    }
  }, []);

  // --- Profile Migration: Convert legacy single plan to profile-based structure ---
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const migrateToProfiles = async () => {
      try {
        // Check if profiles exist
        const profilesColRef = collection(db, 'artifacts', appId, 'users', userId, 'profiles');
        const profilesSnap = await getDocs(profilesColRef);

        if (profilesSnap.empty) {
          // No profiles exist, check if there's a legacy plan to migrate
          const legacyPlanRef = doc(db, 'artifacts', appId, 'users', userId, 'plan', 'mainPlan');
          const legacyPlanSnap = await getDoc(legacyPlanRef);

          if (legacyPlanSnap.exists()) {
            // Migrate legacy plan to first profile
            const legacyPlan = legacyPlanSnap.data();
            const profileId = `profile_${Date.now()}`;

            // Create profile metadata
            const profileMetaRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', profileId);
            await setDoc(profileMetaRef, {
              name: legacyPlan.planName || 'My Training',
              sport: legacyPlan.sport || 'general',
              createdAt: legacyPlan.createdAt || serverTimestamp(),
              lastUsed: serverTimestamp()
            });

            // Move plan to profile's plan subcollection
            const profilePlanRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', profileId, 'plan', 'mainPlan');
            await setDoc(profilePlanRef, legacyPlan);

            // Set as active profile
            const activeProfileRef = doc(db, 'artifacts', appId, 'users', userId, 'activeProfile', 'current');
            await setDoc(activeProfileRef, { profileId });

            // Update history entries with profileId
            const historyColRef = collection(db, 'artifacts', appId, 'users', userId, 'history');
            const historySnap = await getDocs(historyColRef);
            const batch = writeBatch(db);

            historySnap.forEach((historyDoc) => {
              if (!historyDoc.data().profileId) {
                batch.update(historyDoc.ref, { profileId });
              }
            });

            await batch.commit();
          }
        }
      } catch (error) {
        console.error('Error migrating to profiles:', error);
      }
    };

    migrateToProfiles();
  }, [isAuthReady, db, userId, appId]);

  // --- Firestore Data Listeners: Profiles ---
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    setIsLoadingProfiles(true);

    // Listener for profiles collection
    const profilesColRef = collection(db, 'artifacts', appId, 'users', userId, 'profiles');
    const unsubscribeProfiles = onSnapshot(profilesColRef, (querySnapshot) => {
      const profilesData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        let createdAtDate;
        if (data.createdAt && data.createdAt instanceof Timestamp) {
          createdAtDate = data.createdAt.toDate();
        } else {
          createdAtDate = new Date();
        }
        profilesData.push({ ...data, id: doc.id, createdAt: createdAtDate });
      });
      setProfiles(profilesData);
      setIsLoadingProfiles(false);
    }, (error) => {
      console.error("Error listening to profiles:", error);
      setIsLoadingProfiles(false);
    });

    // Listener for active profile
    const activeProfileRef = doc(db, 'artifacts', appId, 'users', userId, 'activeProfile', 'current');
    const unsubscribeActiveProfile = onSnapshot(activeProfileRef, (docSnap) => {
      if (docSnap.exists()) {
        setActiveProfileId(docSnap.data().profileId);
      } else {
        setActiveProfileId(null);
      }
    }, (error) => {
      console.error("Error listening to active profile:", error);
    });

    return () => {
      unsubscribeProfiles();
      unsubscribeActiveProfile();
    };
  }, [isAuthReady, db, userId, appId]);

  // --- Firestore Data Listeners: Plan and History (based on active profile) ---
  useEffect(() => {
    if (!isAuthReady || !db || !userId || !activeProfileId) {
      setPlan(null);
      setHistory([]);
      setIsLoadingPlan(false);
      return;
    }

    setIsLoadingPlan(true);

    // Listener for the active profile's plan
    const planDocRef = doc(db, 'artifacts', appId, 'users', userId, 'profiles', activeProfileId, 'plan', 'mainPlan');
    const unsubscribePlan = onSnapshot(planDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let createdAtDate;
        if (data.createdAt && data.createdAt instanceof Timestamp) {
          createdAtDate = data.createdAt.toDate();
        } else {
          createdAtDate = new Date();
        }
        setPlan({ ...data, id: docSnap.id, createdAt: createdAtDate });
      } else {
        setPlan(null);
      }
      setIsLoadingPlan(false);
    }, (error) => {
      console.error("Error listening to plan:", error);
      setIsLoadingPlan(false);
    });

    // Listener for the active profile's history
    const historyColRef = collection(db, 'artifacts', appId, 'users', userId, 'history');
    const q = query(historyColRef);

    const unsubscribeHistory = onSnapshot(q, (querySnapshot) => {
      const historyData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Only include history for the active profile
        if (data.profileId === activeProfileId && data.completedAt && data.completedAt instanceof Timestamp) {
          historyData.push({ ...data, id: doc.id, completedAt: data.completedAt.toDate() });
        }
      });
      historyData.sort((a, b) => b.completedAt - a.completedAt);
      setHistory(historyData);
    }, (error) => {
      console.error("Error listening to history:", error);
    });

    return () => {
      unsubscribePlan();
      unsubscribeHistory();
    };
  }, [isAuthReady, db, userId, appId, activeProfileId]);

  // --- Navigation Handlers ---
  const showDashboard = () => {
    setCurrentView('dashboard');
    setActiveWorkoutDay(null);
  };

  const showCreatePlan = (defaultView = 'ai') => {
    setCreatePlanDefaultView(defaultView);
    setCurrentView('createPlan');
  };

  const showHistory = () => {
    setCurrentView('history');
  };

  const showPlan = () => {
    setCurrentView('plan');
  };

  const showEditPlan = () => {
    setCurrentView('editPlan');
  };

  const showProfiles = () => {
    setCurrentView('profiles');
  };

  const startWorkout = (dayData) => {
    setActiveWorkoutDay(dayData);
    setCurrentView('activeWorkout');
  };
  
  // --- Render Logic ---

  const renderView = () => {
    if (!isAuthReady || isLoadingPlan) {
      return (
        <div className="h-full flex flex-col justify-center items-center">
          <LoadingSpinner />
          <p className="text-gray-400 mt-4">Loading your data...</p>
        </div>
      );
    }
    
    switch (currentView) {
      case 'createPlan':
        return <CreatePlanView
                  db={db}
                  auth={auth}
                  userId={userId}
                  appId={appId}
                  activeProfileId={activeProfileId}
                  showDashboard={showDashboard}
                  defaultView={createPlanDefaultView}
                />;
      case 'activeWorkout':
        return <ActiveWorkoutView
                  db={db}
                  auth={auth}
                  userId={userId}
                  appId={appId}
                  plan={plan}
                  activeProfileId={activeProfileId}
                  dayData={activeWorkoutDay}
                  showDashboard={showDashboard}
                />;
      case 'history':
        return <HistoryView
                  history={history}
                  plan={plan}
                />;
      case 'plan':
        return <PlanView
                  plan={plan}
                  showCreatePlan={showCreatePlan}
                  showEditPlan={showEditPlan}
                />;
      case 'editPlan':
        return <EditPlanView
                  db={db}
                  userId={userId}
                  appId={appId}
                  plan={plan}
                  activeProfileId={activeProfileId}
                  showPlanView={showPlan}
                />;
      case 'profiles':
        return <ProfilesView
                  db={db}
                  userId={userId}
                  appId={appId}
                  profiles={profiles}
                  activeProfileId={activeProfileId}
                  showDashboard={showDashboard}
                />;
      case 'dashboard':
      default:
        return <DashboardView 
                  db={db}
                  auth={auth}
                  userId={userId}
                  appId={appId}
                  plan={plan} 
                  history={history} 
                  showCreatePlan={showCreatePlan}
                  showPlanManagement={showPlan}
                  startWorkout={startWorkout} 
                />;
    }
  };

  // Main app shell
  return (
    <div className="h-screen w-full bg-gray-900 text-white font-sans">
      <div className="max-w-lg mx-auto h-full flex flex-col">
        <main className="flex-grow overflow-y-auto pb-20">
          {renderView()}
        </main>
        
        {/* Bottom Navigation */}
        {currentView !== 'activeWorkout' && currentView !== 'createPlan' && (
          <nav className="absolute bottom-0 left-0 right-0 max-w-lg mx-auto bg-gray-800 border-t border-gray-700 flex justify-around">
            <button
              onClick={showDashboard}
              className={`flex-1 flex flex-col items-center p-3 ${currentView === 'dashboard' ? 'text-indigo-400' : 'text-gray-500'}`}
            >
              <Home size={24} />
              <span className="text-xs">Home</span>
            </button>
            <button
              onClick={showPlan}
              className={`flex-1 flex flex-col items-center p-3 ${currentView === 'plan' ? 'text-indigo-400' : 'text-gray-500'}`}
            >
              <FileEdit size={24} />
              <span className="text-xs">Plan</span>
            </button>
            <button
              onClick={showHistory}
              className={`flex-1 flex flex-col items-center p-3 ${currentView === 'history' ? 'text-indigo-400' : 'text-gray-500'}`}
            >
              <History size={24} />
              <span className="text-xs">History</span>
            </button>
            <button
              onClick={showProfiles}
              className={`flex-1 flex flex-col items-center p-3 ${currentView === 'profiles' ? 'text-indigo-400' : 'text-gray-500'}`}
            >
              <Users size={24} />
              <span className="text-xs">Profiles</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}


