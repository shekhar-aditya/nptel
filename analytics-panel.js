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
