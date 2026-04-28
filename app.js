/* ============================================================
   ESD Quiz Arena — Application Logic (Adaptive + Auto-Advance)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ── State ──────────────────────────────────────────────
    let selectedAssignments = new Set();
    let currentQuestionIndex = 0;
    let userAnswers = []; // store answers for review
    let score = 0;
    
    // Confidence selection tracking
    let currentSelectedDiv = null;
    let currentSelectedKey = null;
    let currentCorrectKey = null;
    let currentIsCorrect = false;
    let autoAdvanceTimeout = null;

    // ── DOM ────────────────────────────────────────────────
    const sections = {
        hero:    document.getElementById('hero-section'),
        config:  document.getElementById('config-section'),
        quiz:    document.getElementById('quiz-section'),
        results: document.getElementById('results-section'),
        read:    document.getElementById('read-section'),
    };

    const els = {
        // Config
        assignmentGrid:   document.getElementById('assignment-grid'),
        selectAllBtn:     document.getElementById('select-all-btn'),
        numQuestions:     document.getElementById('num-questions'),
        rangeMaxLabel:    document.getElementById('range-max-label'),
        selectedCount:    document.getElementById('selected-count'),
        availableCount:   document.getElementById('available-count'),
        jumbleQuestions:  document.getElementById('jumble-questions'),
        jumbleOptions:    document.getElementById('jumble-options'),
        adaptiveMode:     document.getElementById('adaptive-mode'),
        startBtn:         document.getElementById('start-btn'),
        resetDataBtn:     document.getElementById('reset-data-btn'),
        statTotalQ:       document.getElementById('stat-total-q'),

        // Quiz
        progressBar:      document.getElementById('progress-bar'),
        progressText:     document.getElementById('progress-text'),
        phaseBadge:       document.getElementById('phase-badge'),
        timerDisplay:     document.getElementById('timer-display'),
        pauseBtn:         document.getElementById('pause-btn'),
        liveScore:        document.getElementById('live-score'),
        analyticsToggle:  document.getElementById('analytics-toggle-btn'),
        assignmentBadge:  document.getElementById('assignment-badge'),
        strengthBadge:    document.getElementById('strength-badge'),
        questionText:     document.getElementById('question-text'),
        optionsContainer: document.getElementById('options-container'),
        confSelector:     document.getElementById('confidence-selector'),
        nextBtn:          document.getElementById('next-btn'),
        nextBtnText:      document.getElementById('next-btn-text'),
        endSessionBtn:    document.getElementById('end-session-btn'),
        quizDots:         document.getElementById('quiz-dots'),

        // Results
        resultScore:      document.getElementById('result-score'),
        resultTotal:      document.getElementById('result-total'),
        resultTitle:      document.getElementById('result-title'),
        resultSubtitle:   document.getElementById('result-subtitle'),
        rsCorrect:        document.getElementById('rs-correct'),
        rsIncorrect:      document.getElementById('rs-incorrect'),
        rsPercent:        document.getElementById('rs-percent'),
        rsAvgTime:        document.getElementById('rs-avg-time'),
        ringFill:         document.getElementById('ring-fill'),
        reviewSection:    document.getElementById('review-section'),
        timeStatsGrid:    document.getElementById('time-stats-grid'),
        topicBreakdown:   document.getElementById('topic-breakdown-list'),
        behaviorSummary:  document.getElementById('behavior-summary'),
    };

    // ── Particles Background ──────────────────────────────
    initParticles();

    // ── Init ──────────────────────────────────────────────
    const assignments = [...new Set(questionsData.map(q => q.assignment))].sort((a,b) => a - b);
    els.statTotalQ.textContent = questionsData.length;

    // Build assignment buttons
    assignments.forEach(id => {
        const btn = document.createElement('div');
        btn.className = 'assignment-btn';
        btn.textContent = `Week ${id}`;
        btn.dataset.id = id;
        btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
            if (btn.classList.contains('selected')) selectedAssignments.add(id);
            else selectedAssignments.delete(id);
            updatePoolInfo();
        });
        els.assignmentGrid.appendChild(btn);
    });

    updatePoolInfo();

    // Select All / None
    els.selectAllBtn.addEventListener('click', () => {
        const btns = els.assignmentGrid.querySelectorAll('.assignment-btn');
        if (selectedAssignments.size === assignments.length) {
            btns.forEach(b => b.classList.remove('selected'));
            selectedAssignments.clear();
            els.selectAllBtn.textContent = 'Select All';
        } else {
            btns.forEach(b => b.classList.add('selected'));
            assignments.forEach(id => selectedAssignments.add(id));
            els.selectAllBtn.textContent = 'Deselect All';
        }
        updatePoolInfo();
    });

    els.numQuestions.addEventListener('blur', () => {
        const max = 500;
        let val = parseInt(els.numQuestions.value);
        if (isNaN(val) || val < 1) val = 1;
        if (val > max) val = max;
        els.numQuestions.value = val;
    });

    els.resetDataBtn.addEventListener('click', () => {
        if (confirm("Reset all adaptive learning data (accuracy, times, streak)? This cannot be undone.")) {
            WeightEngine.reset();
            alert("Learning data reset successfully.");
        }
    });

    function updatePoolInfo() {
        const available = questionsData.filter(q => selectedAssignments.has(q.assignment)).length;
        els.availableCount.textContent = available;
        els.selectedCount.textContent = selectedAssignments.size;
        els.numQuestions.max = 500;
        els.rangeMaxLabel.textContent = "500";
        els.startBtn.disabled = available === 0;
        els.selectAllBtn.textContent = selectedAssignments.size === assignments.length ? 'Deselect All' : 'Select All';
    }

    // ── Navigation ────────────────────────────────────────
    function showSection(name) {
        Object.values(sections).forEach(s => s.classList.remove('active-section'));
        sections[name].classList.add('active-section');
        document.body.setAttribute('data-active-section', name);
        document.body.classList.toggle('in-quiz', name === 'quiz');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (name !== 'quiz') {
            TimerEngine.stop();
            if (AnalyticsPanel.isVisible()) AnalyticsPanel.close();
        }
    }

    document.getElementById('hero-start-btn').addEventListener('click', () => showSection('config'));
    document.getElementById('config-back-btn').addEventListener('click', () => showSection('hero'));
    document.getElementById('quiz-back-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to quit this quiz?')) showSection('config');
    });
    document.getElementById('restart-btn').addEventListener('click', () => showSection('config'));
    document.getElementById('hero-read-btn').addEventListener('click', () => { buildReadSection(); showSection('read'); });
    document.getElementById('nav-read-btn').addEventListener('click', () => { buildReadSection(); showSection('read'); });
    document.getElementById('read-back-btn').addEventListener('click', () => showSection('hero'));

    // ── Start Quiz ────────────────────────────────────────
    const rapidModeToggle = document.getElementById('rapid-mode');
    
    // When rapid mode is toggled, disable/enable the question count input
    rapidModeToggle.addEventListener('change', () => {
        const numQBlock = els.numQuestions.closest('.option-block');
        if (rapidModeToggle.checked) {
            numQBlock.style.opacity = '0.3';
            numQBlock.style.pointerEvents = 'none';
        } else {
            numQBlock.style.opacity = '1';
            numQBlock.style.pointerEvents = 'auto';
        }
    });

    els.startBtn.addEventListener('click', () => {
        let pool = questionsData.filter(q => selectedAssignments.has(q.assignment));
        if (pool.length === 0) return;

        let isAdaptive = els.adaptiveMode.checked;
        let isRapid = rapidModeToggle.checked;
        let numQs = parseInt(els.numQuestions.value) || 10;

        QuestionEngine.init(pool, isAdaptive, numQs, els.jumbleQuestions.checked, isRapid);
        AnalyticsEngine.resetSession();
        
        currentQuestionIndex = 0;
        userAnswers = [];
        score = 0;
        els.liveScore.textContent = '0';
        els.quizDots.innerHTML = ''; 
        // Show End Session button in rapid mode and adaptive mode (both run until mastery)
        els.endSessionBtn.style.display = (isRapid || isAdaptive) ? 'block' : 'none';
        
        showSection('quiz');
        renderNextQuestion();
    });

    // ── Render Question ───────────────────────────────────
    function renderNextQuestion() {
        const qData = QuestionEngine.getNext();
        if (!qData) {
            showResults();
            return;
        }

        currentQuestionIndex++;
        const prog = QuestionEngine.getProgress();
        const isRapid = QuestionEngine.isRapidMode();
        
        // Progress bar & text
        if (isRapid) {
            const phase = QuestionEngine.getPhase();
            const mastered = QuestionEngine.getMasteredCount();
            const poolSize = QuestionEngine.getPool().length;
            
            if (phase === 1) {
                // Rapid Phase 1: show all questions once first (green bar)
                els.progressBar.style.width = `${(currentQuestionIndex / poolSize) * 100}%`;
                els.progressBar.style.background = 'linear-gradient(90deg, #f59e0b, #34d399)';
                els.progressBar.style.backgroundSize = '100% 100%';
                els.progressBar.style.animation = 'none';
                els.progressText.textContent = `${currentQuestionIndex} / ${poolSize} · Cycle 1`;
                els.phaseBadge.textContent = '⚡ Phase 1 · Rapid Shuffle';
                els.phaseBadge.style.background = 'rgba(52,211,153,0.15)';
                els.phaseBadge.style.color = '#34d399';
            } else {
                // Rapid Phase 2: adaptive pulsing bar with mastery + cycle info
                const cycleInfo = QuestionEngine.getCycleInfo();
                const masteryPct = poolSize > 0 ? (mastered / poolSize) * 100 : 0;
                els.progressBar.style.width = `${masteryPct}%`;
                els.progressBar.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)';
                els.progressBar.style.backgroundSize = '200% 100%';
                els.progressBar.style.animation = 'rapidPulse 2s linear infinite';
                els.progressText.textContent = `#${currentQuestionIndex} · 🔥 ${mastered}/${poolSize} mastered · Cycle ${cycleInfo.cycle}`;
                els.phaseBadge.textContent = '♾️ Phase 2 · Rapid Adaptive';
                els.phaseBadge.style.background = 'rgba(245,158,11,0.15)';
                els.phaseBadge.style.color = '#f59e0b';
            }
        } else {
            els.progressBar.style.backgroundSize = '100% 100%';
            els.progressBar.style.animation = 'none';
            
            const phase = QuestionEngine.getPhase();
            if (!QuestionEngine.isAdaptive()) {
                // Non-adaptive: simple practice mode
                els.progressBar.style.width = `${(currentQuestionIndex / prog.total) * 100}%`;
                els.progressText.textContent = `${currentQuestionIndex} / ${prog.total}`;
                els.phaseBadge.textContent = 'Practice';
                els.phaseBadge.style.background = 'rgba(52,211,153,0.1)';
                els.phaseBadge.style.color = 'var(--success)';
                els.progressBar.style.background = 'linear-gradient(90deg, var(--accent-1), var(--accent-3))';
            } else if (phase === 1) {
                // Phase 1: Pure shuffle — Cycle 1 showing each question once
                const poolSize = QuestionEngine.getPool().length;
                els.progressBar.style.width = `${(currentQuestionIndex / poolSize) * 100}%`;
                els.progressText.textContent = `${currentQuestionIndex} / ${poolSize} · Cycle 1`;
                els.phaseBadge.textContent = 'Phase 1 · Shuffle';
                els.phaseBadge.style.background = 'rgba(52,211,153,0.12)';
                els.phaseBadge.style.color = '#34d399';
                els.progressBar.style.background = 'linear-gradient(90deg, #34d399, #22d3ee)';
            } else {
                // Phase 2: Adaptive weighted — show cycle + mastery progress
                const cycleInfo = QuestionEngine.getCycleInfo();
                const mastered = QuestionEngine.getMasteredCount();
                const poolSize = QuestionEngine.getPool().length;
                const masteryPct = poolSize > 0 ? (mastered / poolSize) * 100 : 0;
                
                els.progressBar.style.width = `${masteryPct}%`;
                els.progressText.textContent = `#${currentQuestionIndex} · ✅ ${mastered}/${poolSize} mastered · Cycle ${cycleInfo.cycle}`;
                
                const diff = QuestionEngine.getDifficultyLevel();
                const diffLabel = diff >= 1.2 ? ' · Hard' : diff <= 0.85 ? ' · Easy' : '';
                els.phaseBadge.textContent = `Phase 2 · Adaptive${diffLabel}`;
                els.phaseBadge.style.background = 'rgba(99,102,241,0.12)';
                els.phaseBadge.style.color = 'var(--accent-2)';
                els.progressBar.style.background = 'linear-gradient(90deg, var(--accent-1), var(--accent-2))';
            }
        }

        // Setup Question Card
        els.assignmentBadge.textContent = qData.topic || `Week ${qData.assignment}`;
        
        // Strength badge
        const strength = WeightEngine.getStrength(qData.id, WeightEngine.getIdealTime(QuestionEngine.getPool()));
        els.strengthBadge.textContent = strength.toUpperCase();
        els.strengthBadge.className = `qc-strength-badge strength-${strength}`;

        els.questionText.textContent = qData.question;
        els.nextBtn.disabled = true;
        els.nextBtnText.textContent = (!isRapid && currentQuestionIndex === prog.total) ? 'Finish' : 'Next';
        els.confSelector.style.display = 'none';
        if (autoAdvanceTimeout) clearTimeout(autoAdvanceTimeout);

        // Options
        els.optionsContainer.innerHTML = '';
        let optionKeys = Object.keys(qData.options);
        if (els.jumbleOptions.checked) QuestionEngine.shuffle(optionKeys);

        optionKeys.forEach((originalKey, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const div = document.createElement('div');
            div.className = 'option';
            div.innerHTML = `
                <div class="opt-letter">${letter}</div>
                <div class="opt-text">${qData.options[originalKey]}</div>
            `;
            div.addEventListener('click', () => handleAnswer(div, originalKey, qData.answer, qData));
            els.optionsContainer.appendChild(div);
        });

        // Add dot
        const dot = document.createElement('div');
        dot.className = 'quiz-dot current';
        els.quizDots.appendChild(dot);
        // Scroll dots to end if many
        els.quizDots.scrollLeft = els.quizDots.scrollWidth;

        // Animation
        const card = document.getElementById('question-card');
        card.style.animation = 'none';
        card.offsetHeight;
        card.style.animation = 'cardEnter 0.4s ease';

        // Timer Start
        TimerEngine.start((elapsed) => {
            els.timerDisplay.textContent = TimerEngine.formatTime(elapsed);
        });
        els.pauseBtn.textContent = '⏸';
    }

    function handleAnswer(selectedDiv, selectedKey, correctKey, qData) {
        if (selectedDiv.classList.contains('disabled')) return;
        
        const timeTaken = TimerEngine.stop();
        els.timerDisplay.textContent = TimerEngine.formatTime(timeTaken);

        const allOpts = els.optionsContainer.querySelectorAll('.option');
        allOpts.forEach(opt => opt.classList.add('disabled'));

        selectedDiv.classList.add('selected');
        const isCorrect = selectedKey === correctKey;

        if (isCorrect) {
            selectedDiv.classList.add('correct');
            score++;
        } else {
            selectedDiv.classList.add('incorrect');
            const correctText = qData.options[correctKey];
            allOpts.forEach(opt => {
                if (opt.querySelector('.opt-text').textContent === correctText) {
                    opt.classList.add('correct');
                }
            });
        }

        els.liveScore.textContent = score;
        els.nextBtn.disabled = false;

        // Update dot
        const currentDot = els.quizDots.lastChild;
        currentDot.classList.remove('current');
        currentDot.classList.add('answered', isCorrect ? 'correct-dot' : 'incorrect-dot');

        // Record locally to array for final review
        userAnswers.push({
            question: qData,
            isCorrect,
            selectedKey,
            correctKey,
            time: timeTaken
        });

        // Save state for confidence input
        currentSelectedDiv = selectedDiv;
        currentSelectedKey = selectedKey;
        currentCorrectKey = correctKey;
        currentIsCorrect = isCorrect;

        const isRapid = QuestionEngine.isRapidMode();

        // In rapid mode: skip confidence selector, use 1s delay
        if (isRapid) {
            els.confSelector.style.display = 'none';
            autoAdvanceTimeout = setTimeout(() => {
                finalizeAnswerAndNext(qData, isCorrect, timeTaken, null);
            }, 1000);
        } else {
            // Normal mode: show confidence selector, 3s delay
            els.confSelector.style.display = 'flex';
            autoAdvanceTimeout = setTimeout(() => {
                finalizeAnswerAndNext(qData, isCorrect, timeTaken, null);
            }, 3000);
        }
    }

    function finalizeAnswerAndNext(qData, isCorrect, timeTaken, confidence) {
        if (autoAdvanceTimeout) {
            clearTimeout(autoAdvanceTimeout);
            autoAdvanceTimeout = null;
        }
        
        // Record to Engines
        WeightEngine.recordAnswer(qData.id, isCorrect, timeTaken, confidence);
        AnalyticsEngine.record(qData.id, isCorrect, timeTaken, qData.topic || `Week ${qData.assignment}`);
        
        // Check rapid mode streak auto-stop
        const shouldStop = QuestionEngine.recordRapidResult(qData.id, isCorrect);
        if (shouldStop) {
            // All questions mastered — auto-end with celebration
            showResults();
            return;
        }
        
        if (AnalyticsPanel.isVisible()) AnalyticsPanel.refresh();
        
        renderNextQuestion();
    }

    els.confSelector.querySelectorAll('.conf-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const conf = e.target.dataset.conf;
            const qData = userAnswers[userAnswers.length - 1].question;
            const timeTaken = userAnswers[userAnswers.length - 1].time;
            finalizeAnswerAndNext(qData, currentIsCorrect, timeTaken, conf);
        });
    });

    els.nextBtn.addEventListener('click', () => {
        if (els.nextBtn.disabled) return;
        const qData = userAnswers[userAnswers.length - 1].question;
        const timeTaken = userAnswers[userAnswers.length - 1].time;
        finalizeAnswerAndNext(qData, currentIsCorrect, timeTaken, null);
    });

    els.endSessionBtn.addEventListener('click', () => {
        if (confirm("End session and view results?")) {
            QuestionEngine.endSession();
            showResults();
        }
    });

    // ── Pause / Resume ────────────────────────────────────
    els.pauseBtn.addEventListener('click', () => {
        if (TimerEngine.isPaused()) {
            TimerEngine.resume();
            els.pauseBtn.textContent = '⏸';
            els.optionsContainer.style.opacity = '1';
            els.optionsContainer.style.pointerEvents = 'auto';
            els.questionText.style.filter = 'none';
        } else {
            TimerEngine.pause();
            els.pauseBtn.textContent = '▶';
            els.optionsContainer.style.opacity = '0.1';
            els.optionsContainer.style.pointerEvents = 'none';
            els.questionText.style.filter = 'blur(4px)';
        }
    });

    els.analyticsToggle.addEventListener('click', () => {
        AnalyticsPanel.toggle();
    });

    // ── Results ───────────────────────────────────────────
    function showResults() {
        TimerEngine.stop();
        if (AnalyticsPanel.isVisible()) AnalyticsPanel.close();

        const sess = AnalyticsEngine.getSession();
        const total = sess.totalAnswered;
        const correct = sess.correct;
        const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
        const avgTime = AnalyticsEngine.getAvgTime().toFixed(1);

        els.resultScore.textContent = correct;
        els.resultTotal.textContent = `/${total}`;
        els.rsCorrect.textContent = correct;
        els.rsIncorrect.textContent = sess.wrong;
        els.rsPercent.textContent = `${pct}%`;
        els.rsAvgTime.textContent = `${avgTime}s`;
        els.resultSubtitle.textContent = `You scored ${pct}% accuracy`;

        if (pct === 100) els.resultTitle.textContent = 'Perfect Score! 🏆';
        else if (pct >= 80) els.resultTitle.textContent = 'Excellent Work! 🌟';
        else if (pct >= 60) els.resultTitle.textContent = 'Good Effort! 👍';
        else if (pct >= 40) els.resultTitle.textContent = 'Keep Going! 💪';
        else els.resultTitle.textContent = 'Needs Practice 📖';

        // Animate ring
        const circumference = 2 * Math.PI * 54;
        const offset = circumference - (pct / 100) * circumference;
        let ringSvg = document.querySelector('.ring-svg');
        if (!ringSvg.querySelector('defs')) {
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            grad.setAttribute('id', 'ring-gradient');
            const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#6366f1');
            const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#22d3ee');
            grad.appendChild(s1); grad.appendChild(s2);
            defs.appendChild(grad); ringSvg.prepend(defs);
        }
        els.ringFill.style.strokeDasharray = circumference;
        els.ringFill.style.strokeDashoffset = circumference;
        setTimeout(() => { els.ringFill.style.strokeDashoffset = offset; }, 100);

        // Time Stats
        if (sess.times.length > 0) {
            const fastest = Math.min(...sess.times).toFixed(1);
            const slowest = Math.max(...sess.times).toFixed(1);
            els.timeStatsGrid.innerHTML = `
                <div class="stat-box"><span>Avg</span>${avgTime}s</div>
                <div class="stat-box"><span>Fastest</span>${fastest}s</div>
                <div class="stat-box"><span>Slowest</span>${slowest}s</div>
            `;
        }

        // Behavior Summary
        const behaviors = AnalyticsEngine.getBehaviorSummary(QuestionEngine.getPool());
        els.behaviorSummary.innerHTML = `
            <div class="beh-card"><h4>⚡ Fast but Wrong</h4><div class="beh-val">${behaviors['fast-wrong']}</div></div>
            <div class="beh-card"><h4>🐢 Slow but Correct</h4><div class="beh-val">${behaviors['slow-correct']}</div></div>
            <div class="beh-card"><h4>🏆 Mastery</h4><div class="beh-val">${behaviors['mastery']}</div></div>
        `;

        // Topic Breakdown
        const topics = AnalyticsEngine.getTopicPerformance();
        els.topicBreakdown.innerHTML = Object.keys(topics).map(topic => {
            const t = topics[topic];
            return `
                <div class="topic-perf-row">
                    <div class="topic-perf-name">${topic}</div>
                    <div class="topic-perf-bar"><div class="topic-perf-fill" style="width:${t.accuracy}%"></div></div>
                    <div class="topic-perf-pct">${t.accuracy.toFixed(0)}%</div>
                </div>
            `;
        }).join('');

        // Build review
        els.reviewSection.innerHTML = '';
        userAnswers.forEach((ans, i) => {
            if (!ans) return;
            const item = document.createElement('div');
            item.className = `review-item ${ans.isCorrect ? 'rv-correct' : 'rv-incorrect'}`;
            
            const strength = WeightEngine.getStrength(ans.question.id, WeightEngine.getIdealTime(QuestionEngine.getPool()));

            let answerHTML = '';
            if (ans.isCorrect) {
                answerHTML = `<span class="label">Answer: </span><span class="val-correct">${ans.question.options[ans.correctKey]}</span>`;
            } else {
                answerHTML = `
                    <span class="label">Your answer: </span><span class="val-wrong">${ans.question.options[ans.selectedKey]}</span><br>
                    <span class="label">Correct: </span><span class="val-correct">${ans.question.options[ans.correctKey]}</span>
                `;
            }

            item.innerHTML = `
                <div class="rv-q">
                    <span class="rv-q-num">${i + 1}.</span> ${ans.question.question}
                    <div class="rv-badges">
                        <span class="rv-badge">${ans.question.topic || ('Week ' + ans.question.assignment)}</span>
                        <span class="rv-strength-badge strength-${strength}">${strength}</span>
                        <span class="rv-time-badge">⏱ ${ans.time.toFixed(1)}s</span>
                    </div>
                </div>
                <div class="rv-answer">${answerHTML}</div>
            `;
            els.reviewSection.appendChild(item);
        });

        showSection('results');
        if (pct >= 70) fireConfetti();
    }

    // ── Read Quizzes Section ─────────────────────────────────
    let readBuilt = false;
    function buildReadSection() {
        if (readBuilt) return;
        readBuilt = true;

        const container = document.getElementById('read-weeks-list');
        const searchInput = document.getElementById('read-search');
        const expandAllBtn = document.getElementById('read-expand-all');
        const collapseAllBtn = document.getElementById('read-collapse-all');

        const weekMap = {};
        questionsData.forEach(q => {
            if (!weekMap[q.assignment]) weekMap[q.assignment] = [];
            weekMap[q.assignment].push(q);
        });
        const weekIds = Object.keys(weekMap).map(Number).sort((a, b) => a - b);

        weekIds.forEach(weekId => {
            const questions = weekMap[weekId];
            const card = document.createElement('div');
            card.className = 'read-week-card';
            card.dataset.week = weekId;

            card.innerHTML = `
                <div class="read-week-header">
                    <div class="read-week-title">
                        <div class="read-week-num">${weekId}</div>
                        <div>
                            <div class="read-week-label">Week ${weekId}</div>
                            <div class="read-week-count">${questions.length} questions</div>
                        </div>
                    </div>
                    <div class="read-week-meta">
                        <span class="read-week-badge">${questions.length} Qs</span>
                        <svg class="read-week-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                </div>
                <div class="read-week-body">
                    <div class="read-week-body-inner">
                        ${questions.map((q, idx) => {
                            const optKeys = Object.keys(q.options);
                            return `
                                <div class="read-q-item" style="animation-delay:${idx * 0.04}s">
                                    <div class="read-q-header">
                                        <div class="read-q-num">${idx + 1}</div>
                                        <div class="read-q-text">${q.question}</div>
                                    </div>
                                    <div class="read-q-options">
                                        ${optKeys.map(key => `
                                            <div class="read-q-opt ${key === q.answer ? 'is-correct' : ''}">
                                                <span class="rq-letter">${key}.</span>
                                                <span>${q.options[key]}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;

            card.querySelector('.read-week-header').addEventListener('click', () => {
                card.classList.toggle('expanded');
            });

            container.appendChild(card);
        });

        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            const allCards = container.querySelectorAll('.read-week-card');
            let anyVisible = false;

            allCards.forEach(card => {
                const items = card.querySelectorAll('.read-q-item');
                let weekHasMatch = false;

                items.forEach(item => {
                    const text = item.querySelector('.read-q-text').textContent.toLowerCase();
                    const opts = item.querySelectorAll('.read-q-opt span:last-child');
                    let optText = '';
                    opts.forEach(o => optText += o.textContent.toLowerCase() + ' ');

                    if (!query || text.includes(query) || optText.includes(query)) {
                        item.style.display = '';
                        weekHasMatch = true;
                    } else {
                        item.style.display = 'none';
                    }
                });

                if (weekHasMatch) {
                    card.style.display = '';
                    anyVisible = true;
                    if (query) card.classList.add('expanded');
                } else {
                    card.style.display = 'none';
                }
            });

            let noResultsEl = container.querySelector('.read-no-results');
            if (!anyVisible) {
                if (!noResultsEl) {
                    noResultsEl = document.createElement('div');
                    noResultsEl.className = 'read-no-results';
                    noResultsEl.innerHTML = '<span class="read-no-results-icon">🔍</span>No questions match your search.';
                    container.appendChild(noResultsEl);
                }
                noResultsEl.style.display = '';
            } else if (noResultsEl) {
                noResultsEl.style.display = 'none';
            }
        });

        expandAllBtn.addEventListener('click', () => {
            container.querySelectorAll('.read-week-card').forEach(c => c.classList.add('expanded'));
        });
        collapseAllBtn.addEventListener('click', () => {
            container.querySelectorAll('.read-week-card').forEach(c => c.classList.remove('expanded'));
        });
    }

    // ── Background Utils ──────────────────────────────────
    // ── Particle System ───────────────────────────────────
    function initParticles() {
        const canvas = document.getElementById('particle-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let w, h, particles = [];
        const PARTICLE_COUNT = 60;

        function resize() {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        class Particle {
            constructor() { this.reset(); }
            reset() {
                this.x = Math.random() * w;
                this.y = Math.random() * h;
                this.vx = (Math.random() - 0.5) * 0.3;
                this.vy = (Math.random() - 0.5) * 0.3;
                this.radius = Math.random() * 1.5 + 0.5;
                this.opacity = Math.random() * 0.4 + 0.1;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > w) this.vx *= -1;
                if (this.y < 0 || this.y > h) this.vy *= -1;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(99, 102, 241, ${this.opacity})`;
                ctx.fill();
            }
        }

        for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

        function connectParticles() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(99, 102, 241, ${0.06 * (1 - dist / 150)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
        }

        function animate() {
            ctx.clearRect(0, 0, w, h);
            particles.forEach(p => { p.update(); p.draw(); });
            connectParticles();
            requestAnimationFrame(animate);
        }
        animate();
    }

    // ── Confetti ──────────────────────────────────────────
    function fireConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#6366f1', '#a78bfa', '#22d3ee', '#34d399', '#f87171', '#facc15'];
        const pieces = [];

        for (let i = 0; i < 120; i++) {
            pieces.push({
                x: canvas.width / 2 + (Math.random() - 0.5) * 200,
                y: canvas.height / 2,
                vx: (Math.random() - 0.5) * 15,
                vy: Math.random() * -18 - 5,
                w: Math.random() * 8 + 4,
                h: Math.random() * 6 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                rot: Math.random() * 360,
                rv: (Math.random() - 0.5) * 10,
                gravity: 0.35,
                opacity: 1,
            });
        }

        let frame = 0;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let alive = false;
            pieces.forEach(p => {
                p.vy += p.gravity;
                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.rv;
                p.opacity -= 0.005;
                if (p.opacity <= 0) return;
                alive = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rot * Math.PI) / 180);
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            });
            frame++;
            if (alive && frame < 200) requestAnimationFrame(draw);
            else ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        draw();
    }
});
