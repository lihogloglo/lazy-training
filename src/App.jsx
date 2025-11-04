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
  Timestamp
} from 'firebase/firestore';
import { 
  Brain, 
  Dumbbell, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft, 
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
  Bell
} from 'lucide-react';

// --- Firebase Configuration ---
// Read from environment variables (Vite automatically exposes VITE_* variables)
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

// --- System Prompt for AI Plan Generation ---
const AI_PLAN_SYSTEM_PROMPT = `You are an expert fitness planner. The user will provide a goal. Create a structured JSON training plan.

CRITICAL: The output *must* be ONLY a single JSON object. No markdown code blocks, no comments, no explanations.
- Do NOT include \`\`\`json or \`\`\`
- Do NOT include // comments in the JSON
- Generate ALL weeks (if 12 weeks, include all 12 week objects)
- Return ONLY pure JSON

**Use this user context:** 36-year-old male, 76kg, 1m79.
**Goals:** V10 Moonboard, 8a outdoor climbing, one-arm pull-up, maintain Squat/Bench/Deadlift on Mon/Fri (PRs: 120/90/160kg), and include light cardio.
Create a science-based, day-by-day plan that is hassle-free and guides the user.

The JSON structure must be:
{
  "planName": "A catchy name for the plan (e.g., 'Project V10')",
  "durationWeeks": 12,
  "weeks": [
    {
      "weekNumber": 1,
      "days": [
        { "day": "Monday", "focus": "Strength (Legs/Push)", "exercises": [
            { "name": "Squat", "type": "repsSetsWeight", "details": { "sets": 3, "reps": "5", "weight": "80% 1RM", "rest": 180 } },
            { "name": "Bench Press", "type": "repsSetsWeight", "details": { "sets": 3, "reps": "5", "weight": "80% 1RM", "rest": 120 } },
            { "name": "Overhead Press", "type": "repsSetsWeight", "details": { "sets": 3, "reps": "8", "weight": "RPE 8", "rest": 90 } }
        ]},
        { "day": "Tuesday", "focus": "Climbing (Endurance)", "exercises": [
            { "name": "Warm-up", "type": "timer", "details": { "sets": 1, "duration": 600, "rest": 0, "description": "10-min general warm-up, light traversing." } },
            { "name": "4x4s", "type": "timer", "details": { "sets": 4, "duration": 240, "rest": 240, "description": "4 routes back-to-back, 4 min rest. Repeat 4 times." } }
        ]},
        { "day": "Wednesday", "focus": "Hangboard & Core", "exercises": [
            { "name": "Warm-up", "type": "timer", "details": { "sets": 1, "duration": 600, "rest": 0, "description": "10-min warm-up: jumping jacks, arm circles, etc." } },
            { "name": "Max Hangs (20mm)", "type": "timer", "details": { "sets": 5, "duration": 10, "rest": 180, "description": "10s max hang, 3min rest." } },
            { "name": "Plank", "type": "timer", "details": { "sets": 3, "duration": 60, "rest": 60, "description": "1 min plank, 1 min rest." } }
        ]},
        { "day": "Thursday", "focus": "Rest", "exercises": [] },
        { "day": "Friday", "focus": "Strength (Pull/Legs)", "exercises": [
            { "name": "Deadlift", "type": "repsSetsWeight", "details": { "sets": 1, "reps": "5", "weight": "85% 1RM", "rest": 240 } },
            { "name": "One Arm Pull-up Negatives", "type": "repsSetsWeight", "details": { "sets": 3, "reps": "3 (each arm)", "weight": "Bodyweight", "rest": 120 } },
            { "name": "Front Lever Tucks", "type": "repsSetsWeight", "details": { "sets": 3, "reps": "10s hold", "weight": "Bodyweight", "rest": 90 } }
        ]},
        { "day": "Saturday", "focus": "Climbing (Moonboard)", "exercises": [
            { "name": "Warm-up", "type": "timer", "details": { "sets": 1, "duration": 900, "rest": 0, "description": "15-min warm-up, progressively harder boulders." } },
            { "name": "Limit Bouldering", "type": "timer", "details": { "sets": 1, "duration": 3600, "rest": 0, "description": "60 mins: Try V-limit projects on Moonboard. Rest 3-5 mins between attempts." } }
        ]},
        { "day": "Sunday", "focus": "Light Cardio / Rest", "exercises": [
            { "name": "Jog or Walk", "type": "timer", "details": { "sets": 1, "duration": 1800, "rest": 0, "description": "30-minute light jog or brisk walk." } }
        ]}
      ]
    }
  ]
}
`;

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

  // Implement exponential backoff for retries
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
        // Retry on rate limiting or server errors
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        // Don't retry on other client errors
        const errText = await response.text();
        throw new Error(`API Error: ${response.status} ${errText}`);
      }
    } catch (e) {
      if (i === 4) throw e; // Rethrow last error
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Failed to get response from API after retries.");
};


// --- React Components ---

/**
 * LoadingSpinner Component
 * A simple reusable spinner.
 */
const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
  </div>
);

/**
 * ExerciseInfo Component
 * Displays a modal with AI-generated info about an exercise.
 */
const ExerciseInfo = ({ exerciseName }) => {
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState(null);

  const handleGetInfo = async () => {
    if (info) { // Already fetched
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


/**
 * TimerComponent
 * The companion for 'timer' type exercises like hangboarding.
 */
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
            // Timer finished
            if (!isResting) {
              // Work set finished, start rest
              if (currentSet < sets) {
                setIsResting(true);
                return rest;
              } else {
                // All sets finished
                clearInterval(timerRef.current);
                setIsActive(false);
                onComplete();
                return 0;
              }
            } else {
              // Rest finished, start next set
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

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-800 rounded-lg text-white text-center relative">
      <ExerciseInfo exerciseName={exercise.name} />
      <div className="mb-2 text-lg font-semibold">{exercise.name}</div>
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

/**
 * RepsSetsWeightComponent
 * The companion for 'repsSetsWeight' type exercises.
 */
const RepsSetsWeightComponent = ({ exercise }) => {
  const { sets, reps, weight, rest, description } = exercise.details;
  
  return (
    <div className="p-6 bg-gray-800 rounded-lg text-white w-full relative">
      <ExerciseInfo exerciseName={exercise.name} />
      <div className="mb-4 text-2xl font-bold text-center">{exercise.name}</div>
      {description && <div className="mb-4 text-sm text-gray-300 text-center">{description}</div>}
      
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-sm uppercase text-gray-400">Sets</div>
          <div className="text-3xl font-bold">{sets}</div>
        </div>
        <div>
          <div className="text-sm uppercase text-gray-400">Reps</div>
          <div className="text-3xl font-bold">{reps}</div>
        </div>
        <div>
          <div className="text-sm uppercase text-gray-400">Weight</div>
          <div className="text-3xl font-bold">{weight}</div>
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

/**
 * ActiveWorkoutView
 * The main view when a workout is in progress.
 */
const ActiveWorkoutView = ({ db, auth, userId, appId, plan, dayData, showDashboard }) => {
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
      
      // Calculate current plan week
      const planStartDate = plan.createdAt; // FIX: It's already a Date object
      const today = new Date();
      const diffTime = Math.abs(today - planStartDate);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const currentPlanWeek = Math.floor(diffDays / 7) + 1;
      
      await addDoc(historyColRef, {
        completedAt: serverTimestamp(),
        planName: plan.planName,
        weekNumber: currentPlanWeek,
        day: dayData.day,
        focus: dayData.focus,
        exercises: dayData.exercises.map(e => e.name)
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
      handleFinish(); // If skipping last exercise, finish workout
    } else {
      handleNext(); // Go to next exercise
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
        ) : (
          <RepsSetsWeightComponent exercise={currentExercise} />
        )}
      </div>
      
      <div className="mt-8 space-y-3">
        {/* "Done" or "Finish" button (only for non-timer) */}
        {currentExercise.type !== 'timer' && (
           <button
              onClick={handleDone}
              disabled={isCompleting}
              className={`w-full py-4 rounded-lg text-lg font-semibold flex items-center justify-center gap-2 ${isLastExercise ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'} disabled:bg-gray-500`}
           >
              {isCompleting ? <LoadingSpinner /> : (isLastExercise ? <CheckCircle size={24} /> : <ArrowRight size={24} />)}
              {isLastExercise ? "Finish Workout" : "Done with Exercise"}
           </button>
        )}

        {/* "Skip" button (always visible) */}
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

/**
 * DashboardView
 * The main screen of the app.
 */
const DashboardView = ({ db, auth, userId, appId, plan, history, showCreatePlan, startWorkout, showPlanManagement }) => {
  const [selectedDayName, setSelectedDayName] = useState(getTodayDayName());
  const [isLogging, setIsLogging] = useState(false);
  const todayDayName = getTodayDayName();

  const { currentWeekData, todayWorkoutData, currentPlanWeek, isCompletedToday } = useMemo(() => {
    if (!plan || !plan.createdAt) {
      return { currentWeekData: null, todayWorkoutData: null, currentPlanWeek: null, isCompletedToday: false };
    }

    const planStartDate = plan.createdAt; // FIX: It's already a Date object
    const today = new Date();
    
    // Calculate current plan week
    const diffTime = Math.abs(today - planStartDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const currentPlanWeek = (Math.floor(diffDays / 7) % plan.durationWeeks) + 1;

    const weekData = plan.weeks.find(w => w.weekNumber === currentPlanWeek) || plan.weeks[0];
    const todayData = weekData.days.find(d => d.day === todayDayName);
    
    // Check if today's workout is completed
    const todayStr = today.toISOString().split('T')[0];
    const completedToday = history.some(log => {
      const logDate = log.completedAt.toISOString().split('T')[0]; // FIX: It's already a Date
      return logDate === todayStr && log.day === todayDayName;
    });

    return { 
      currentWeekData: weekData, 
      todayWorkoutData: todayData, 
      currentPlanWeek,
      isCompletedToday: completedToday
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
        weekNumber: currentPlanWeek, // Already calculated in useMemo
        day: todayWorkoutData.day,
        focus: todayWorkoutData.focus,
        exercises: todayWorkoutData.exercises.map(e => e.name)
      });
      // The onSnapshot listener will update the UI (isCompletedToday) automatically
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
          Get started by generating a personalized training plan based on your goals.
        </p>
        <button
          onClick={() => showCreatePlan('ai')}
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
  
  const weekDays = currentWeekData.days.map(d => d.day); // Assumes 7 days in order

  return (
    <div className="p-4 pt-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">{plan.planName}</h1>
          <p className="text-gray-400">Week {currentPlanWeek} of {plan.durationWeeks}</p>
        </div>
        <button onClick={showPlanManagement} className="text-indigo-400 text-sm">
          Manage Plan
        </button>
      </div>

      {/* Today's Workout Section */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Today's Workout: {todayWorkoutData.focus}</h2>
        {todayWorkoutData.exercises.length === 0 ? (
          <p className="text-gray-400">Rest Day. Enjoy!</p>
        ) : (
          <ul className="list-disc list-inside text-gray-300 mb-6">
            {todayWorkoutData.exercises.map(ex => (
              <li key={ex.name}>{ex.name}</li>
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
                onClick={() => startWorkout(todayWorkoutData)}
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

      {/* Weekly View Section */}
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
              {selectedDayData.exercises.map(ex => (
                <li key={ex.name}>{ex.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * CreatePlanView
 * The view for generating a new plan via AI or manual input.
 */
const CreatePlanView = ({ db, auth, userId, appId, showDashboard, defaultView = 'ai' }) => {
  const [goal, setGoal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState(defaultView); // 'ai' or 'manual'
  const [manualJson, setManualJson] = useState('');

  const savePlanToFirestore = async (planObject) => {
    if (!planObject.planName || !planObject.weeks || !planObject.durationWeeks) {
      throw new Error("Invalid plan structure. Missing required fields.");
    }
    
    const planWithTimestamp = {
      ...planObject,
      createdAt: serverTimestamp() // Add the creation timestamp
    };

    const planDocRef = doc(db, 'artifacts', appId, 'users', userId, 'plan', 'mainPlan');
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

        // Validate the plan has required fields
        if (!parsedPlan.planName || !parsedPlan.weeks || !parsedPlan.durationWeeks) {
          throw new Error("The AI plan is missing required fields. Please try again.");
        }

        // Check if all weeks are present (warn but don't fail)
        if (parsedPlan.weeks.length < parsedPlan.durationWeeks) {
          console.warn(`Plan says ${parsedPlan.durationWeeks} weeks but only got ${parsedPlan.weeks.length} weeks`);
          // Update durationWeeks to match actual weeks generated
          parsedPlan.durationWeeks = parsedPlan.weeks.length;
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
            What is your training goal?
          </label>
          <textarea
            id="goal"
            rows="4"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full p-3 bg-gray-800 rounded-lg text-white border border-gray-700 focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g., 'I want to run a 5k in 8 weeks' or 'I want to be able to do 10 pull-ups'"
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
const PlanView = ({ plan, showCreatePlan }) => {
  
  const handleEnableNotifications = () => {
    // In a real native app, this would trigger the permission prompt
    // e.g., using Capacitor's PushNotifications.requestPermissions()
    console.log("Requesting notification permissions...");
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
          disabled
          className="w-full text-left mt-4 text-gray-500 text-sm opacity-70"
        >
          Edit Plan (Coming Soon)
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
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'createPlan', 'activeWorkout', 'history', 'plan'
  const [plan, setPlan] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [createPlanDefaultView, setCreatePlanDefaultView] = useState('ai');
  
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

  // --- Firestore Data Listeners ---
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    setIsLoadingPlan(true);
    
    // Listener for the user's plan
    const planDocRef = doc(db, 'artifacts', appId, 'users', userId, 'plan', 'mainPlan');
    const unsubscribePlan = onSnapshot(planDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let createdAtDate;
        // FIX: Always convert Timestamp to JS Date
        if (data.createdAt && data.createdAt instanceof Timestamp) {
          createdAtDate = data.createdAt.toDate();
        } else {
          // Fallback for pending writes or missing data
          createdAtDate = new Date(); 
        }
        setPlan({ ...data, id: docSnap.id, createdAt: createdAtDate });
      } else {
        setPlan(null); // No plan exists
      }
      setIsLoadingPlan(false);
    }, (error) => {
      console.error("Error listening to plan:", error);
      setIsLoadingPlan(false);
    });

    // Listener for the user's history
    const historyColRef = collection(db, 'artifacts', appId, 'users', userId, 'history');
    const q = query(historyColRef); // Can add orderBy('completedAt', 'desc') later
    
    const unsubscribeHistory = onSnapshot(q, (querySnapshot) => {
      const historyData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
         // FIX: Always convert Timestamp to JS Date
         if (data.completedAt && data.completedAt instanceof Timestamp) {
           historyData.push({ ...data, id: doc.id, completedAt: data.completedAt.toDate() });
         }
      });
      // Sort in-memory to avoid Firestore index requirements
      historyData.sort((a, b) => b.completedAt - a.completedAt); // Sort dates directly
      setHistory(historyData);
    }, (error) => {
      console.error("Error listening to history:", error);
    });

    return () => {
      unsubscribePlan();
      unsubscribeHistory();
    };
  }, [isAuthReady, db, userId, appId]);

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
          </nav>
        )}
      </div>
    </div>
  );
}



