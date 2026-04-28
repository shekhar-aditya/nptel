/* ============================================================
   ANALYTICS PANEL — Floating Slide-Out Dashboard
   Renders real-time learning analytics during quiz sessions.
   ============================================================ */

const AnalyticsPanel = (() => {
    let panel = null;
    let isOpen = false;

    function create() {
        if (panel) return;
        panel = document.createElement('div');
        panel.id = 'analytics-panel';
        panel.className = 'analytics-panel';
        panel.innerHTML = `
            <div class="ap-header">
                <h3 class="ap-title">📊 Live Analytics</h3>
                <button class="ap-close" id="ap-close-btn">✕</button>
            </div>
            <div class="ap-body" id="ap-body">
                <div class="ap-section">
                    <div class="ap-stat-grid">
                        <div class="ap-stat-card">
                            <span class="ap-stat-label">Accuracy</span>
                            <span class="ap-stat-value" id="ap-accuracy">0%</span>
                        </div>
                        <div class="ap-stat-card">
                            <span class="ap-stat-label">Avg Time</span>
                            <span class="ap-stat-value" id="ap-avg-time">0s</span>
                        </div>
                        <div class="ap-stat-card">
                            <span class="ap-stat-label">Answered</span>
                            <span class="ap-stat-value" id="ap-answered">0</span>
                        </div>
                        <div class="ap-stat-card">
                            <span class="ap-stat-label">Streak</span>
                            <span class="ap-stat-value" id="ap-streak">0</span>
                        </div>
                    </div>
                </div>
                <div class="ap-section">
                    <h4 class="ap-section-title">Strength Distribution</h4>
                    <div class="ap-strength-bars" id="ap-strength-bars"></div>
                </div>
                <div class="ap-section">
                    <h4 class="ap-section-title">🎯 Phase & Difficulty</h4>
                    <div class="ap-phase-info" id="ap-phase-info"></div>
                </div>
                <div class="ap-section">
                    <h4 class="ap-section-title">🔥 Weak Topics</h4>
                    <div class="ap-weak-topics" id="ap-weak-topics"></div>
                </div>
                <div class="ap-section">
                    <h4 class="ap-section-title">Momentum (Last 20)</h4>
                    <div class="ap-momentum" id="ap-momentum"></div>
                </div>
                <div class="ap-section">
                    <h4 class="ap-section-title">Behavior Patterns</h4>
                    <div class="ap-behaviors" id="ap-behaviors"></div>
                </div>
                <div class="ap-section">
                    <h4 class="ap-section-title">Topic Performance</h4>
                    <div class="ap-topics" id="ap-topics"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('ap-close-btn').addEventListener('click', () => toggle());
    }

    function toggle() {
        if (!panel) create();
        isOpen = !isOpen;
        panel.classList.toggle('open', isOpen);
        if (isOpen) refresh();
    }

    function refresh() {
        if (!panel || !isOpen) return;

        const sess = AnalyticsEngine.getSession();
        const pool = typeof QuestionEngine !== 'undefined' ? QuestionEngine.getPool() : [];

        // Basic stats
        document.getElementById('ap-accuracy').textContent = AnalyticsEngine.getAccuracy().toFixed(1) + '%';
        document.getElementById('ap-avg-time').textContent = AnalyticsEngine.getAvgTime().toFixed(1) + 's';
        document.getElementById('ap-answered').textContent = sess.totalAnswered;

        // Current streak
        let streak = 0;
        if (sess.results.length > 0) {
            const last = sess.results[sess.results.length - 1];
            for (let i = sess.results.length - 1; i >= 0; i--) {
                if (sess.results[i].isCorrect === last.isCorrect) streak++;
                else break;
            }
            if (!last.isCorrect) streak = -streak;
        }
        const streakEl = document.getElementById('ap-streak');
        streakEl.textContent = streak > 0 ? `+${streak} ✓` : streak < 0 ? `${streak} ✗` : '0';
        streakEl.style.color = streak > 0 ? 'var(--success)' : streak < 0 ? 'var(--danger)' : 'var(--text-2)';

        // Strength distribution
        const dist = AnalyticsEngine.getStrengthDistribution(pool);
        const total = dist.weak + dist.medium + dist.strong + dist.unseen;
        const strengthBars = document.getElementById('ap-strength-bars');
        strengthBars.innerHTML = `
            <div class="ap-bar-row">
                <span class="ap-bar-label weak-label">Weak</span>
                <div class="ap-bar-track"><div class="ap-bar-fill weak-fill" style="width:${total ? (dist.weak/total*100) : 0}%"></div></div>
                <span class="ap-bar-count">${dist.weak}</span>
            </div>
            <div class="ap-bar-row">
                <span class="ap-bar-label medium-label">Medium</span>
                <div class="ap-bar-track"><div class="ap-bar-fill medium-fill" style="width:${total ? (dist.medium/total*100) : 0}%"></div></div>
                <span class="ap-bar-count">${dist.medium}</span>
            </div>
            <div class="ap-bar-row">
                <span class="ap-bar-label strong-label">Strong</span>
                <div class="ap-bar-track"><div class="ap-bar-fill strong-fill" style="width:${total ? (dist.strong/total*100) : 0}%"></div></div>
                <span class="ap-bar-count">${dist.strong}</span>
            </div>
            <div class="ap-bar-row">
                <span class="ap-bar-label unseen-label">Unseen</span>
                <div class="ap-bar-track"><div class="ap-bar-fill unseen-fill" style="width:${total ? (dist.unseen/total*100) : 0}%"></div></div>
                <span class="ap-bar-count">${dist.unseen}</span>
            </div>
        `;

        // Momentum sparkline
        const momentum = AnalyticsEngine.getMomentumTrend();
        const momEl = document.getElementById('ap-momentum');
        if (momentum.length === 0) {
            momEl.innerHTML = '<span class="ap-empty">No data yet</span>';
        } else {
            momEl.innerHTML = momentum.map(v =>
                `<div class="ap-spark-dot ${v ? 'spark-correct' : 'spark-wrong'}"></div>`
            ).join('');
        }

        // Behavior patterns
        const behaviors = AnalyticsEngine.getBehaviorSummary(pool);
        const behEl = document.getElementById('ap-behaviors');
        behEl.innerHTML = `
            <div class="ap-beh-chip beh-fast-wrong"><span>⚡✗</span> Fast but Wrong: ${behaviors['fast-wrong']}</div>
            <div class="ap-beh-chip beh-slow-correct"><span>🐢✓</span> Slow but Correct: ${behaviors['slow-correct']}</div>
            <div class="ap-beh-chip beh-mastery"><span>🏆</span> Mastery: ${behaviors['mastery']}</div>
        `;

        // Phase, Cycle & Difficulty info
        const phaseEl = document.getElementById('ap-phase-info');
        const phase = typeof QuestionEngine !== 'undefined' ? QuestionEngine.getPhase() : 1;
        const diff = typeof QuestionEngine !== 'undefined' ? QuestionEngine.getDifficultyLevel() : 1.0;
        const cycleInfo = typeof QuestionEngine !== 'undefined' ? QuestionEngine.getCycleInfo() : { cycle: 1, errorFreeCycles: 0 };
        const mastered = typeof QuestionEngine !== 'undefined' ? QuestionEngine.getMasteredCount() : 0;
        const poolLen = pool.length;
        const phaseLabel = phase === 1 ? 'Phase 1 · Shuffle' : 'Phase 2 · Adaptive';
        const phaseColor = phase === 1 ? '#34d399' : '#a78bfa';
        const diffLabel = diff >= 1.2 ? 'Hard' : diff <= 0.85 ? 'Easy' : 'Normal';
        const diffColor = diff >= 1.2 ? '#f87171' : diff <= 0.85 ? '#34d399' : '#94a3b8';
        phaseEl.innerHTML = `
            <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
                <div class="ap-stat-card" style="flex:1;min-width:80px">
                    <span class="ap-stat-label">Phase</span>
                    <span class="ap-stat-value" style="color:${phaseColor};font-size:0.8rem">${phaseLabel}</span>
                </div>
                <div class="ap-stat-card" style="flex:1;min-width:80px">
                    <span class="ap-stat-label">Cycle</span>
                    <span class="ap-stat-value" style="color:#22d3ee">${cycleInfo.cycle}</span>
                </div>
                <div class="ap-stat-card" style="flex:1;min-width:80px">
                    <span class="ap-stat-label">Mastered</span>
                    <span class="ap-stat-value" style="color:#34d399">${mastered}/${poolLen}</span>
                </div>
                <div class="ap-stat-card" style="flex:1;min-width:80px">
                    <span class="ap-stat-label">Difficulty</span>
                    <span class="ap-stat-value" style="color:${diffColor}">${diff.toFixed(2)}× ${diffLabel}</span>
                </div>
            </div>
            ${cycleInfo.errorFreeCycles > 0 ? `<div style="margin-top:0.5rem;font-size:0.75rem;color:#34d399">🔥 ${cycleInfo.errorFreeCycles} error-free cycle(s) — ${cycleInfo.errorFreeCycles >= 2 ? 'Mastery achieved!' : '2 needed to auto-complete'}</div>` : ''}
        `;

        // Weak Topics (ranked by weight from WeightEngine)
        const weakTopicsEl = document.getElementById('ap-weak-topics');
        const weakTopics = WeightEngine.getWeakTopics(pool);
        if (weakTopics.length === 0 || weakTopics.every(t => t.attempted === 0)) {
            weakTopicsEl.innerHTML = '<span class="ap-empty">Answer some questions first</span>';
        } else {
            const maxWeight = Math.max(...weakTopics.map(t => t.avgWeight), 1);
            weakTopicsEl.innerHTML = weakTopics
                .filter(t => t.attempted > 0)
                .slice(0, 6)
                .map(t => {
                    const pct = Math.min((t.avgWeight / maxWeight) * 100, 100);
                    const barColor = t.avgWeight > 1.3 ? '#f87171' : t.avgWeight > 0.8 ? '#f59e0b' : '#34d399';
                    const label = t.avgWeight > 1.3 ? 'Weak' : t.avgWeight > 0.8 ? 'Medium' : 'Strong';
                    return `
                        <div class="ap-topic-row">
                            <div class="ap-topic-info">
                                <span class="ap-topic-name">${t.topic}</span>
                                <span class="ap-topic-meta">${t.attempted}/${t.count} seen · ${label}</span>
                            </div>
                            <div class="ap-topic-bar-track">
                                <div class="ap-topic-bar-fill" style="width:${pct}%;background:${barColor}"></div>
                            </div>
                            <span class="ap-topic-pct" style="color:${barColor}">${t.avgWeight.toFixed(2)}</span>
                        </div>
                    `;
                }).join('');
        }

        // Topic performance
        const topicPerf = AnalyticsEngine.getTopicPerformance();
        const topEl = document.getElementById('ap-topics');
        const topicKeys = Object.keys(topicPerf);
        if (topicKeys.length === 0) {
            topEl.innerHTML = '<span class="ap-empty">Answer some questions first</span>';
        } else {
            topEl.innerHTML = topicKeys.map(topic => {
                const tp = topicPerf[topic];
                return `
                    <div class="ap-topic-row">
                        <div class="ap-topic-info">
                            <span class="ap-topic-name">${topic}</span>
                            <span class="ap-topic-meta">${tp.correct}/${tp.count} · ${tp.avgTime.toFixed(1)}s avg</span>
                        </div>
                        <div class="ap-topic-bar-track">
                            <div class="ap-topic-bar-fill" style="width:${tp.accuracy}%"></div>
                        </div>
                        <span class="ap-topic-pct">${tp.accuracy.toFixed(0)}%</span>
                    </div>
                `;
            }).join('');
        }
    }

    function isVisible() { return isOpen; }
    function close() { if (isOpen) toggle(); }

    return { create, toggle, refresh, isVisible, close };
})();
