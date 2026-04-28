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
        memoryDecayMaxBoost: 3.0,
        // Topic intelligence
        topicWeakBoost: 1.4,        // multiplier for questions in weak topics
        // Speed pressure
        speedStalenessThreshold: 3, // attempts without speed improvement → resurface
        speedPressureBoost: 1.25,
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

        // Progressive streak scaling (graduated, not binary)
        if (r.streak >= CONFIG.streakBoostThreshold) {
            // streak 3→0.7, 4→0.6, 5+→0.5 (correct streak reduces priority)
            const scale = Math.max(0.5, 0.7 - (r.streak - CONFIG.streakBoostThreshold) * 0.1);
            weight *= scale;
        } else if (r.streak <= -CONFIG.streakBoostThreshold) {
            // streak -3→1.5, -4→1.75, -5+→2.0 (wrong streak aggressively boosts)
            const scale = Math.min(2.0, CONFIG.streakBoostMultiplier + (Math.abs(r.streak) - CONFIG.streakBoostThreshold) * 0.25);
            weight *= scale;
        }

        // Confidence adjustment
        if (r.confidence === 'low') {
            weight *= 1.3;
        } else if (r.confidence === 'high' && r.streak > 0) {
            weight *= 0.8;
        }

        // Memory decay (spaced repetition) — steeper curve after 4h
        if (r.lastSeen) {
            const hoursSince = (Date.now() - r.lastSeen) / (1000 * 60 * 60);
            if (hoursSince > CONFIG.memoryDecayHours) {
                const baseDecay = (hoursSince - CONFIG.memoryDecayHours) * 0.1;
                // After 4 hours, decay accelerates (quadratic ramp)
                const steepDecay = hoursSince > 4 ? Math.pow((hoursSince - 4) * 0.15, 1.3) : 0;
                const decayBoost = Math.min(1 + baseDecay + steepDecay, CONFIG.memoryDecayMaxBoost);
                weight *= decayBoost;
            }
        }

        // Sliding window momentum: compare last 5 vs last 20 for granular trend
        if (r.momentum.length >= 5) {
            const recent5 = r.momentum.slice(-5);
            const recentAcc = recent5.filter(Boolean).length / 5;
            if (r.momentum.length >= 10) {
                // Compare short-term (5) vs mid-term (20) trend
                const window20 = r.momentum.slice(-20);
                const midAcc = window20.filter(Boolean).length / window20.length;
                if (recentAcc < midAcc - 0.15) weight *= 1.3;       // degrading fast
                else if (recentAcc < midAcc - 0.05) weight *= 1.15; // degrading
                else if (recentAcc > midAcc + 0.15) weight *= 0.8;  // improving fast
                else if (recentAcc > midAcc + 0.05) weight *= 0.9;  // improving
            } else {
                const overall = r.correct_count / r.attempts;
                if (recentAcc < overall - 0.1) weight *= 1.2;
                else if (recentAcc > overall + 0.1) weight *= 0.9;
            }
        }

        // Speed pressure: if correct but slow and not improving speed, boost
        if (r.attempts >= CONFIG.speedStalenessThreshold && r.times.length >= 3) {
            const last3 = r.times.slice(-3);
            const avgLast3 = last3.reduce((a, b) => a + b, 0) / 3;
            const acc = r.correct_count / r.attempts;
            // Correct but consistently slow → speed pressure
            if (acc >= 0.6 && avgLast3 > it * 1.2) {
                weight *= CONFIG.speedPressureBoost;
            }
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

    // Topic-level intelligence: aggregate weakness across all questions in a topic
    function getTopicWeight(topic, pool, idealTime) {
        const topicQs = pool.filter(q => (q.topic || `Week ${q.assignment}`) === topic);
        if (topicQs.length === 0) return 1.0;
        const weights = topicQs.map(q => computeWeight(q.id, idealTime));
        return weights.reduce((a, b) => a + b, 0) / weights.length;
    }

    // Get all topics ranked by weakness (highest weight = weakest)
    function getWeakTopics(pool) {
        const idealTime = getIdealTime(pool);
        const topicMap = {};
        pool.forEach(q => {
            const topic = q.topic || `Week ${q.assignment}`;
            if (!topicMap[topic]) topicMap[topic] = [];
            topicMap[topic].push(q);
        });
        const ranked = Object.keys(topicMap).map(topic => {
            const qs = topicMap[topic];
            const avgWeight = qs.map(q => computeWeight(q.id, idealTime)).reduce((a, b) => a + b, 0) / qs.length;
            const attempted = qs.filter(q => getRecord(q.id).attempts > 0).length;
            return { topic, avgWeight, count: qs.length, attempted };
        });
        return ranked.sort((a, b) => b.avgWeight - a.avgWeight);
    }

    function reset() {
        questionData = {};
        localStorage.removeItem(STORAGE_KEY);
    }

    load(); // auto-load on init

    return {
        CONFIG, load, save, getRecord, recordAnswer,
        getIdealTime, computeWeight, getStrength, getBehavior,
        getAllData, getTopicWeight, getWeakTopics, reset,
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
    let pool = [];              // full question pool for the session
    let phase1Queue = [];       // Phase 1: shuffled queue (each question exactly once)
    let totalQuestions = 0;     // max cap (safety limit)
    let servedCount = 0;        
    let recentBuffer = [];      
    const BUFFER_SIZE = 8;
    let adaptiveMode = true;
    let shouldShuffleOpts = true;
    let rapidMode = false;      
    let questionStreaks = {};   // qId -> consecutive correct (used in ALL modes)
    const RAPID_STREAK_LIMIT = 3;   // rapid mode: 3 consecutive correct
    const ADAPTIVE_MASTERY = 2;     // adaptive mode: 2 consecutive correct = mastered
    let ended = false;
    let currentPhase = 1;       // 1 = pure shuffle (cycle 1), 2 = adaptive weighted (cycle 2+)
    let difficultyLevel = 1.0;  // dynamic difficulty evolution
    let sessionResults = [];    // track recent session results for difficulty calc
    let currentCycle = 1;       // which cycle we're on (1 = phase 1, 2+ = adaptive)
    let cycleServed = 0;        // questions served in current cycle
    let errorFreeCycles = 0;    // consecutive cycles with zero errors
    let cycleHadError = false;  // did current cycle have any errors?

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
        
        // In adaptive mode: the input is a max cap, but quiz can end early via mastery
        // In rapid mode: infinity
        // In non-adaptive: exact count
        totalQuestions = rapidMode ? Infinity : (numQs && numQs > 0 ? numQs : pool.length);
        
        // Phase 1 queue: all pool questions in shuffled order (shown exactly once)
        // Both adaptive and rapid mode get Phase 1 (see every question first)
        if (adaptiveMode || rapidMode) {
            phase1Queue = pool.slice(); // already shuffled
        } else {
            phase1Queue = [];
        }
        currentPhase = ((adaptiveMode || rapidMode) && phase1Queue.length > 0) ? 1 : 2;
        
        servedCount = 0;
        recentBuffer = [];
        questionStreaks = {};
        pool.forEach(q => questionStreaks[q.id] = 0);
        ended = false;
        difficultyLevel = 1.0;
        sessionResults = [];
        currentCycle = 1;
        cycleServed = 0;
        errorFreeCycles = 0;
        cycleHadError = false;
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
    function getDifficultyLevel() { return difficultyLevel; }
    function getCycleInfo() { return { cycle: currentCycle, errorFreeCycles, cycleServed }; }
    
    // Returns number of fully mastered questions
    function getMasteredCount() {
        const limit = rapidMode ? RAPID_STREAK_LIMIT : ADAPTIVE_MASTERY;
        return Object.values(questionStreaks).filter(s => s >= limit).length;
    }

    // Called after each answer to track streaks and mastery
    function recordRapidResult(qId, isCorrect) {
        // Track session results for difficulty evolution (all modes)
        sessionResults.push(isCorrect);
        if (sessionResults.length > 20) sessionResults.shift();
        updateDifficulty();
        
        // Track per-question streaks in ALL modes (not just rapid)
        if (isCorrect) {
            questionStreaks[qId] = (questionStreaks[qId] || 0) + 1;
        } else {
            questionStreaks[qId] = 0;
            cycleHadError = true;
        }
        
        // Track cycle progress (both adaptive and rapid modes)
        if ((adaptiveMode || rapidMode) && currentPhase >= 2) {
            cycleServed++;
            // A "cycle" = going through pool.length questions in Phase 2
            // For rapid: use unmastered count as cycle length (shrinks as you master)
            const cycleLength = rapidMode
                ? pool.filter(q => questionStreaks[q.id] < RAPID_STREAK_LIMIT).length || pool.length
                : pool.length;
            if (cycleServed >= cycleLength) {
                // Cycle complete
                if (!cycleHadError) {
                    errorFreeCycles++;
                } else {
                    errorFreeCycles = 0;
                }
                // Reset for next cycle
                currentCycle++;
                cycleServed = 0;
                cycleHadError = false;
                
                // Auto-end: 2 consecutive error-free cycles = mastery achieved
                if (errorFreeCycles >= 2) {
                    ended = true;
                    return true;
                }
            }
        }
        
        // Also check individual mastery: if ALL questions mastered, auto-end
        const limit = rapidMode ? RAPID_STREAK_LIMIT : ADAPTIVE_MASTERY;
        const allMastered = pool.every(q => questionStreaks[q.id] >= limit);
        if (allMastered) {
            ended = true;
            return true;
        }
        
        // For non-adaptive mode, no auto-stop
        if (!adaptiveMode && !rapidMode) return false;
        
        return false;
    }

    // Difficulty Evolution: adjusts based on rolling session performance
    function updateDifficulty() {
        if (sessionResults.length < 5) return;
        const recent = sessionResults.slice(-20);
        const acc = recent.filter(Boolean).length / recent.length;
        if (acc > 0.85) difficultyLevel = Math.min(difficultyLevel + 0.05, 1.5);
        else if (acc > 0.7) difficultyLevel = Math.min(difficultyLevel + 0.02, 1.3);
        else if (acc < 0.4) difficultyLevel = Math.max(difficultyLevel - 0.05, 0.7);
        else if (acc < 0.55) difficultyLevel = Math.max(difficultyLevel - 0.02, 0.8);
    }

    function getNext() {
        if (ended) return null;

        // Max cap — safety limit so it doesn't run literally forever
        if (!rapidMode && servedCount >= totalQuestions) {
            return null;
        }

        // In adaptive mode Phase 2: filter out fully mastered questions
        let candidates = pool;
        if (rapidMode && currentPhase >= 2) {
            candidates = pool.filter(q => questionStreaks[q.id] < RAPID_STREAK_LIMIT);
            if (candidates.length === 0) {
                ended = true;
                return null;
            }
        } else if (adaptiveMode && currentPhase >= 2) {
            // Filter out mastered questions in adaptive Phase 2
            candidates = pool.filter(q => questionStreaks[q.id] < ADAPTIVE_MASTERY);
            if (candidates.length === 0) {
                // All mastered — auto-end
                ended = true;
                return null;
            }
        }

        let question;
        
        // ── Phase 1: Pure Shuffle (Cycle 1 — show each question once) ──
        if (currentPhase === 1 && phase1Queue.length > 0) {
            question = phase1Queue.shift();
            // When Phase 1 queue is exhausted, transition to Phase 2
            if (phase1Queue.length === 0) {
                currentPhase = 2;
                currentCycle = 2;
                cycleServed = 0;
                cycleHadError = false;
            }
        }
        // ── Phase 2: Adaptive Weighted Selection (Cycle 2+) ──
        else if (adaptiveMode || rapidMode) {
            currentPhase = 2;
            question = selectAdaptive(candidates);
        }
        // ── Non-adaptive: sequential ──
        else {
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

        // Compute weights with topic intelligence boost
        const weights = candidates.map(q => {
            let w = WeightEngine.computeWeight(q.id, idealTime);
            
            // Topic-level intelligence: boost questions from weak topics
            const topic = q.topic || `Week ${q.assignment}`;
            const topicWeight = WeightEngine.getTopicWeight(topic, pool, idealTime);
            if (topicWeight > 1.3) {
                w *= WeightEngine.CONFIG.topicWeakBoost;
            }
            
            // Difficulty evolution: at higher difficulty, strong questions get a floor boost
            const strength = WeightEngine.getStrength(q.id, idealTime);
            if (difficultyLevel > 1.1 && strength === 'strong') {
                w = Math.max(w, 0.3 * difficultyLevel);
            }
            
            return w;
        });
        
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

    function getPhase() { return currentPhase; }
    function getProgress() {
        if (rapidMode) return { index: servedCount, total: servedCount };
        if (adaptiveMode && currentPhase >= 2) {
            // In adaptive Phase 2: show mastery progress instead of fixed count
            const mastered = getMasteredCount();
            return { index: servedCount, total: totalQuestions, mastered, poolSize: pool.length };
        }
        return { index: servedCount, total: totalQuestions };
    }
    function isPhase1Complete() { return currentPhase >= 2; }
    function getPool() { return pool; }
    function endSession() { ended = true; }

    return {
        init, getNext, getPhase, getProgress, isPhase1Complete, isAdaptive, isRapidMode,
        getPool, endSession, shuffle, recordRapidResult, getMasteredCount, getRapidStreakLimit,
        getDifficultyLevel, getCycleInfo
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
