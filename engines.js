/* ============================================================
   ADAPTIVE LEARNING ENGINES
   - WeightEngine:    per-question accuracy/time/hybrid scoring
   - TimerEngine:     per-question timing with pause/resume
   - QuestionEngine:  Phase 1 shuffle + Phase 2 adaptive loop
   - AnalyticsEngine: real-time stats, topic perf, behavior
   ============================================================ */

const STORAGE_KEY = 'esd_learning_data';

/* ── WeightEngine ─────────────────────────────────────────── */
const WeightEngine = (() => {
    // Tunable ratios
    const CONFIG = {
        accuracyRatio: 0.7,
        timeRatio: 0.3,
        defaultIdealTime: 15,   // seconds
        streakBoostThreshold: 3,
        streakBoostMultiplier: 1.5,
        memoryDecayHours: 2,
        memoryDecayMaxBoost: 2.0,
    };

    let questionData = {}; // keyed by question id

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) questionData = JSON.parse(raw);
        } catch (e) { questionData = {}; }
    }

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(questionData)); } catch (e) {}
    }

    function getRecord(qId) {
        if (!questionData[qId]) {
            questionData[qId] = {
                attempts: 0,
                correct_count: 0,
                wrong_count: 0,
                times: [],
                avg_time: 0,
                fastest_time: Infinity,
                slowest_time: 0,
                streak: 0,           // positive = correct streak, negative = wrong streak
                confidence: null,    // last confidence input
                lastSeen: null,      // timestamp
                momentum: [],        // last 20 results [true/false]
            };
        }
        return questionData[qId];
    }

    function recordAnswer(qId, isCorrect, timeTaken, confidence) {
        const r = getRecord(qId);
        r.attempts++;
        if (isCorrect) {
            r.correct_count++;
            r.streak = r.streak > 0 ? r.streak + 1 : 1;
        } else {
            r.wrong_count++;
            r.streak = r.streak < 0 ? r.streak - 1 : -1;
        }

        // Time tracking
        if (timeTaken > 0) {
            r.times.push(timeTaken);
            if (r.times.length > 50) r.times.shift(); // keep last 50
            r.avg_time = r.times.reduce((a, b) => a + b, 0) / r.times.length;
            r.fastest_time = Math.min(r.fastest_time === Infinity ? timeTaken : r.fastest_time, timeTaken);
            r.slowest_time = Math.max(r.slowest_time, timeTaken);
        }

        // Confidence
        if (confidence) r.confidence = confidence;

        // Momentum (last 20)
        r.momentum.push(isCorrect);
        if (r.momentum.length > 20) r.momentum.shift();

        // Timestamp
        r.lastSeen = Date.now();

        save();
    }

    function getIdealTime(pool) {
        const allAvgs = [];
        pool.forEach(q => {
            const r = questionData[q.id];
            if (r && r.avg_time > 0) allAvgs.push(r.avg_time);
        });
        if (allAvgs.length < 3) return CONFIG.defaultIdealTime;
        allAvgs.sort((a, b) => a - b);
        return allAvgs[Math.floor(allAvgs.length / 2)]; // median
    }

    function computeWeight(qId, idealTime) {
        const r = getRecord(qId);
        if (r.attempts === 0) return 1.0; // unseen = neutral

        // Accuracy weight
        const accW = (r.wrong_count + 1) / (r.correct_count + 1);

        // Time weight
        const it = idealTime || CONFIG.defaultIdealTime;
        const timeW = r.avg_time > 0 ? r.avg_time / it : 1.0;

        // Hybrid
        let weight = (CONFIG.accuracyRatio * accW) + (CONFIG.timeRatio * timeW);

        // Streak intelligence
        if (r.streak >= CONFIG.streakBoostThreshold) {
            weight *= 0.7; // correct streak → reduce
        } else if (r.streak <= -CONFIG.streakBoostThreshold) {
            weight *= CONFIG.streakBoostMultiplier; // wrong streak → boost
        }

        // Confidence adjustment
        if (r.confidence === 'low') {
            weight *= 1.3;
        } else if (r.confidence === 'high' && r.streak > 0) {
            weight *= 0.8;
        }

        // Memory decay (spaced repetition)
        if (r.lastSeen) {
            const hoursSince = (Date.now() - r.lastSeen) / (1000 * 60 * 60);
            if (hoursSince > CONFIG.memoryDecayHours) {
                const decayBoost = Math.min(1 + (hoursSince - CONFIG.memoryDecayHours) * 0.1, CONFIG.memoryDecayMaxBoost);
                weight *= decayBoost;
            }
        }

        // Momentum: if degrading, boost
        if (r.momentum.length >= 5) {
            const recent5 = r.momentum.slice(-5);
            const recentAcc = recent5.filter(Boolean).length / 5;
            const overall = r.correct_count / r.attempts;
            if (recentAcc < overall - 0.1) weight *= 1.2; // degrading
            else if (recentAcc > overall + 0.1) weight *= 0.9; // improving
        }

        // Floor: strong questions never zero
        return Math.max(weight, 0.1);
    }

    function getStrength(qId, idealTime) {
        const r = getRecord(qId);
        if (r.attempts === 0) return 'unseen';
        const acc = r.correct_count / r.attempts;
        const it = idealTime || CONFIG.defaultIdealTime;
        const slow = r.avg_time > it * 1.3;

        if (acc < 0.5 || r.wrong_count > r.correct_count || slow) return 'weak';
        if (acc >= 0.8 && r.avg_time <= it) return 'strong';
        return 'medium';
    }

    function getBehavior(qId) {
        const r = getRecord(qId);
        if (r.attempts === 0) return null;
        const acc = r.correct_count / r.attempts;
        const fast = r.avg_time > 0 && r.avg_time < 8;
        const slow = r.avg_time > 20;

        if (fast && acc < 0.5) return 'fast-wrong';    // conceptual weakness
        if (slow && acc >= 0.7) return 'slow-correct';  // confidence issue
        if (fast && acc >= 0.8) return 'mastery';
        return null;
    }

    function getAllData() { return questionData; }

    function reset() {
        questionData = {};
        localStorage.removeItem(STORAGE_KEY);
    }

    load(); // auto-load on init

    return {
        CONFIG, load, save, getRecord, recordAnswer,
        getIdealTime, computeWeight, getStrength, getBehavior,
        getAllData, reset,
    };
})();


/* ── TimerEngine ──────────────────────────────────────────── */
const TimerEngine = (() => {
    let startTime = 0;
    let elapsed = 0;
    let paused = false;
    let pauseStart = 0;
    let totalPaused = 0;
    let timerInterval = null;
    let onTickCallback = null;

    function start(onTick) {
        stop();
        startTime = Date.now();
        elapsed = 0;
        paused = false;
        pauseStart = 0;
        totalPaused = 0;
        onTickCallback = onTick || null;
        timerInterval = setInterval(() => {
            if (!paused) {
                elapsed = (Date.now() - startTime - totalPaused) / 1000;
                if (onTickCallback) onTickCallback(elapsed);
            }
        }, 100);
    }

    function pause() {
        if (!paused) {
            paused = true;
            pauseStart = Date.now();
        }
    }

    function resume() {
        if (paused) {
            totalPaused += Date.now() - pauseStart;
            paused = false;
        }
    }

    function stop() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        if (paused && pauseStart) totalPaused += Date.now() - pauseStart;
        elapsed = startTime ? (Date.now() - startTime - totalPaused) / 1000 : 0;
        paused = false;
        return elapsed;
    }

    function getElapsed() {
        if (paused) return (pauseStart - startTime - totalPaused) / 1000;
        return startTime ? (Date.now() - startTime - totalPaused) / 1000 : 0;
    }

    function isPaused() { return paused; }

    function formatTime(secs) {
        const s = Math.max(0, Math.floor(secs));
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    return { start, pause, resume, stop, getElapsed, isPaused, formatTime };
})();


/* ── QuestionEngine ───────────────────────────────────────── */
const QuestionEngine = (() => {
    let pool = [];              // strictly limited question pool for the session
    let totalQuestions = 0;     
    let servedCount = 0;        
    let recentBuffer = [];      
    const BUFFER_SIZE = 8;
    let adaptiveMode = true;
    let shouldShuffleOpts = true;
    let rapidMode = false;      
    let questionStreaks = {};   // qId -> consecutive correct
    const RAPID_STREAK_LIMIT = 3; 
    let ended = false;

    function init(questions, isAdaptive, numQs, shouldShuffle, isRapid) {
        let tempPool = questions.slice();
        if (shouldShuffle !== false) {
            shuffle(tempPool);
        }
        
        // Strict limit to user's selected N IF they want fewer unique questions than available
        if (numQs && numQs > 0 && numQs < tempPool.length) {
            tempPool = tempPool.slice(0, numQs);
        }
        
        pool = tempPool;
        adaptiveMode = isAdaptive !== false;
        shouldShuffleOpts = shouldShuffle !== false;
        rapidMode = isRapid === true;
        
        // If rapid mode, it's infinity.
        // Otherwise, it runs for exactly numQs iterations (or pool.length if numQs isn't set)
        // This allows drilling e.g. 50 available questions for 200 iterations adaptively.
        totalQuestions = rapidMode ? Infinity : (numQs && numQs > 0 ? numQs : pool.length);
        
        servedCount = 0;
        recentBuffer = [];
        questionStreaks = {};
        pool.forEach(q => questionStreaks[q.id] = 0);
        ended = false;
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function isAdaptive() { return adaptiveMode; }
    function isRapidMode() { return rapidMode; }
    function getRapidStreakLimit() { return RAPID_STREAK_LIMIT; }
    
    // Returns number of fully mastered questions in rapid mode
    function getMasteredCount() {
        return Object.values(questionStreaks).filter(s => s >= RAPID_STREAK_LIMIT).length;
    }

    // Called after each answer in rapid mode to track streak
    function recordRapidResult(qId, isCorrect) {
        if (!rapidMode) return false;
        
        if (isCorrect) {
            questionStreaks[qId] = (questionStreaks[qId] || 0) + 1;
        } else {
            questionStreaks[qId] = 0;
        }
        
        // Check if ALL questions in the pool are mastered
        const allMastered = pool.every(q => questionStreaks[q.id] >= RAPID_STREAK_LIMIT);
        if (allMastered) {
            ended = true;
        }
        return allMastered;
    }

    function getNext() {
        if (ended) return null;

        if (!rapidMode && servedCount >= totalQuestions) {
            return null;
        }

        let candidates = pool;
        if (rapidMode) {
            // Filter out mastered questions
            candidates = pool.filter(q => questionStreaks[q.id] < RAPID_STREAK_LIMIT);
            if (candidates.length === 0) {
                ended = true;
                return null;
            }
        }

        let question;
        if (adaptiveMode || rapidMode) {
            question = selectAdaptive(candidates);
        } else {
            question = pool[servedCount] || null;
        }

        if (question) {
            servedCount++;
            addToBuffer(question.id);
        }
        return question;
    }

    function selectAdaptive(candidatesList) {
        const idealTime = WeightEngine.getIdealTime(pool);

        // Build weighted list excluding recent buffer
        let candidates = candidatesList.filter(q => !recentBuffer.includes(q.id));
        if (candidates.length === 0) candidates = candidatesList.slice(); // fallback

        const weights = candidates.map(q => WeightEngine.computeWeight(q.id, idealTime));
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        let rand = Math.random() * totalWeight;
        for (let i = 0; i < candidates.length; i++) {
            rand -= weights[i];
            if (rand <= 0) {
                return candidates[i];
            }
        }
        return candidates[candidates.length - 1];
    }

    function addToBuffer(qId) {
        recentBuffer.push(qId);
        if (recentBuffer.length > BUFFER_SIZE) recentBuffer.shift();
    }

    function getPhase() { return 1; }
    function getProgress() { return { index: servedCount, total: rapidMode ? servedCount : totalQuestions }; }
    function isPhase1Complete() { return !rapidMode && servedCount >= totalQuestions; }
    function getPool() { return pool; }
    function endSession() { ended = true; }

    return {
        init, getNext, getPhase, getProgress, isPhase1Complete, isAdaptive, isRapidMode,
        getPool, endSession, shuffle, recordRapidResult, getMasteredCount, getRapidStreakLimit
    };
})();


/* ── AnalyticsEngine ──────────────────────────────────────── */
const AnalyticsEngine = (() => {
    // Session-level counters (reset each quiz session)
    let session = {
        totalAnswered: 0,
        correct: 0,
        wrong: 0,
        totalTime: 0,
        times: [],
        results: [],       // {qId, isCorrect, time, topic}
        topicStats: {},     // topic -> {correct, wrong, totalTime, count}
    };

    function resetSession() {
        session = {
            totalAnswered: 0, correct: 0, wrong: 0,
            totalTime: 0, times: [], results: [],
            topicStats: {},
        };
    }

    function record(qId, isCorrect, timeTaken, topic) {
        session.totalAnswered++;
        if (isCorrect) session.correct++;
        else session.wrong++;
        session.totalTime += timeTaken;
        session.times.push(timeTaken);
        session.results.push({ qId, isCorrect, time: timeTaken, topic });

        // Topic stats
        if (!session.topicStats[topic]) {
            session.topicStats[topic] = { correct: 0, wrong: 0, totalTime: 0, count: 0 };
        }
        const ts = session.topicStats[topic];
        ts.count++;
        if (isCorrect) ts.correct++;
        else ts.wrong++;
        ts.totalTime += timeTaken;
    }

    function getAccuracy() {
        return session.totalAnswered > 0 ? (session.correct / session.totalAnswered * 100) : 0;
    }

    function getAvgTime() {
        return session.times.length > 0 ? session.totalTime / session.times.length : 0;
    }

    function getStrengthDistribution(pool) {
        const idealTime = WeightEngine.getIdealTime(pool || []);
        const dist = { weak: 0, medium: 0, strong: 0, unseen: 0 };
        (pool || []).forEach(q => {
            const s = WeightEngine.getStrength(q.id, idealTime);
            dist[s] = (dist[s] || 0) + 1;
        });
        return dist;
    }

    function getTopicPerformance() {
        const topics = {};
        Object.keys(session.topicStats).forEach(topic => {
            const ts = session.topicStats[topic];
            topics[topic] = {
                accuracy: ts.count > 0 ? (ts.correct / ts.count * 100) : 0,
                avgTime: ts.count > 0 ? ts.totalTime / ts.count : 0,
                count: ts.count,
                correct: ts.correct,
                wrong: ts.wrong,
            };
        });
        return topics;
    }

    function getMomentumTrend() {
        // Return last 20 results as boolean array for sparkline
        return session.results.slice(-20).map(r => r.isCorrect);
    }

    function getBehaviorSummary(pool) {
        const patterns = { 'fast-wrong': 0, 'slow-correct': 0, 'mastery': 0 };
        (pool || []).forEach(q => {
            const b = WeightEngine.getBehavior(q.id);
            if (b && patterns[b] !== undefined) patterns[b]++;
        });
        return patterns;
    }

    function getSession() { return session; }

    return {
        resetSession, record, getAccuracy, getAvgTime,
        getStrengthDistribution, getTopicPerformance,
        getMomentumTrend, getBehaviorSummary, getSession,
    };
})();
