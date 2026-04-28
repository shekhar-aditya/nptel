/* ============================================================
   ESD Quiz Arena — Application Logic
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ── State ──────────────────────────────────────────────
    let selectedAssignments = new Set();
    let currentQuizQuestions = [];
    let currentQuestionIndex = 0;
    let userAnswers = [];
    let score = 0;

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
        startBtn:         document.getElementById('start-btn'),
        statTotalQ:       document.getElementById('stat-total-q'),

        // Quiz
        progressBar:      document.getElementById('progress-bar'),
        progressText:     document.getElementById('progress-text'),
        liveScore:        document.getElementById('live-score'),
        assignmentBadge:  document.getElementById('assignment-badge'),
        questionText:     document.getElementById('question-text'),
        optionsContainer: document.getElementById('options-container'),
        nextBtn:          document.getElementById('next-btn'),
        nextBtnText:      document.getElementById('next-btn-text'),
        quizDots:         document.getElementById('quiz-dots'),

        // Results
        resultScore:   document.getElementById('result-score'),
        resultTotal:   document.getElementById('result-total'),
        resultTitle:   document.getElementById('result-title'),
        resultSubtitle:document.getElementById('result-subtitle'),
        rsCorrect:     document.getElementById('rs-correct'),
        rsIncorrect:   document.getElementById('rs-incorrect'),
        rsPercent:     document.getElementById('rs-percent'),
        ringFill:      document.getElementById('ring-fill'),
        reviewSection: document.getElementById('review-section'),
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

    // Number input — clamp value on blur
    els.numQuestions.addEventListener('blur', () => {
        const max = parseInt(els.numQuestions.max) || 120;
        let val = parseInt(els.numQuestions.value);
        if (isNaN(val) || val < 1) val = 1;
        if (val > max) val = max;
        els.numQuestions.value = val;
    });

    function updatePoolInfo() {
        const available = questionsData.filter(q => selectedAssignments.has(q.assignment)).length;
        els.availableCount.textContent = available;
        els.selectedCount.textContent = selectedAssignments.size;
        els.numQuestions.max = available || 1;
        els.rangeMaxLabel.textContent = available;
        if (parseInt(els.numQuestions.value) > available) {
            els.numQuestions.value = available;
        }
        els.startBtn.disabled = available === 0;
        els.selectAllBtn.textContent = selectedAssignments.size === assignments.length ? 'Deselect All' : 'Select All';
    }

    // ── Navigation ────────────────────────────────────────
    function showSection(name) {
        Object.values(sections).forEach(s => s.classList.remove('active-section'));
        sections[name].classList.add('active-section');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.getElementById('hero-start-btn').addEventListener('click', () => showSection('config'));
    document.getElementById('config-back-btn').addEventListener('click', () => showSection('hero'));
    document.getElementById('quiz-back-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to quit this quiz?')) showSection('config');
    });
    document.getElementById('restart-btn').addEventListener('click', () => showSection('config'));

    // Read Quizzes Navigation
    document.getElementById('hero-read-btn').addEventListener('click', () => {
        buildReadSection();
        showSection('read');
    });
    document.getElementById('nav-read-btn').addEventListener('click', () => {
        buildReadSection();
        showSection('read');
    });
    document.getElementById('read-back-btn').addEventListener('click', () => showSection('hero'));

    // ── Read Quizzes Section ─────────────────────────────────
    let readBuilt = false;

    function buildReadSection() {
        if (readBuilt) return;
        readBuilt = true;

        const container = document.getElementById('read-weeks-list');
        const searchInput = document.getElementById('read-search');
        const expandAllBtn = document.getElementById('read-expand-all');
        const collapseAllBtn = document.getElementById('read-collapse-all');

        // Group questions by assignment
        const weekMap = {};
        questionsData.forEach(q => {
            if (!weekMap[q.assignment]) weekMap[q.assignment] = [];
            weekMap[q.assignment].push(q);
        });
        const weekIds = Object.keys(weekMap).map(Number).sort((a, b) => a - b);

        // Build week accordion cards
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

            // Toggle accordion
            card.querySelector('.read-week-header').addEventListener('click', () => {
                card.classList.toggle('expanded');
            });

            container.appendChild(card);
        });

        // Search / Filter
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            const allCards = container.querySelectorAll('.read-week-card');
            let anyVisible = false;

            allCards.forEach(card => {
                const weekId = card.dataset.week;
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

            // Show/hide no results message
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

        // Expand / Collapse All
        expandAllBtn.addEventListener('click', () => {
            container.querySelectorAll('.read-week-card').forEach(c => c.classList.add('expanded'));
        });
        collapseAllBtn.addEventListener('click', () => {
            container.querySelectorAll('.read-week-card').forEach(c => c.classList.remove('expanded'));
        });
    }

    // ── Start Quiz ────────────────────────────────────────
    els.startBtn.addEventListener('click', () => {
        let pool = questionsData.filter(q => selectedAssignments.has(q.assignment));
        if (pool.length === 0) return;

        if (els.jumbleQuestions.checked) shuffle(pool);

        let count = Math.min(parseInt(els.numQuestions.value) || 10, pool.length);
        currentQuizQuestions = pool.slice(0, count);
        currentQuestionIndex = 0;
        userAnswers = new Array(count).fill(null);
        score = 0;

        // Build dots
        els.quizDots.innerHTML = '';
        currentQuizQuestions.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'quiz-dot';
            dot.addEventListener('click', () => {
                // Allow jumping only to answered or current
                if (i <= currentQuestionIndex) {
                    currentQuestionIndex = i;
                    renderQuestion();
                }
            });
            els.quizDots.appendChild(dot);
        });

        els.liveScore.textContent = '0';
        showSection('quiz');
        renderQuestion();
    });

    // ── Render Question ───────────────────────────────────
    function renderQuestion() {
        const qData = currentQuizQuestions[currentQuestionIndex];
        const total = currentQuizQuestions.length;

        // Progress
        els.progressBar.style.width = `${((currentQuestionIndex) / total) * 100}%`;
        els.progressText.textContent = `${currentQuestionIndex + 1} / ${total}`;
        els.assignmentBadge.textContent = `Week ${qData.assignment} · Assignment`;
        els.questionText.textContent = qData.question;

        // Next button
        els.nextBtn.disabled = true;
        els.nextBtnText.textContent = currentQuestionIndex === total - 1 ? 'Finish' : 'Next';

        // Update dots
        const dots = els.quizDots.querySelectorAll('.quiz-dot');
        dots.forEach((d, i) => {
            d.className = 'quiz-dot';
            if (i === currentQuestionIndex) d.classList.add('current');
            if (userAnswers[i]) {
                d.classList.add('answered');
                d.classList.add(userAnswers[i].isCorrect ? 'correct-dot' : 'incorrect-dot');
            }
        });

        // Options
        els.optionsContainer.innerHTML = '';
        let optionKeys = Object.keys(qData.options);
        if (els.jumbleOptions.checked) shuffle(optionKeys);

        // If already answered, restore state
        const existingAnswer = userAnswers[currentQuestionIndex];

        optionKeys.forEach((originalKey, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const div = document.createElement('div');
            div.className = 'option';
            div.innerHTML = `
                <div class="opt-letter">${letter}</div>
                <div class="opt-text">${qData.options[originalKey]}</div>
            `;

            if (existingAnswer) {
                // Already answered — show result state
                div.classList.add('disabled');
                if (originalKey === qData.answer) div.classList.add('correct');
                if (originalKey === existingAnswer.selectedKey && !existingAnswer.isCorrect) div.classList.add('incorrect');
                if (originalKey === existingAnswer.selectedKey) div.classList.add('selected');
                els.nextBtn.disabled = false;
            } else {
                div.addEventListener('click', () => handleAnswer(div, originalKey, qData.answer));
            }

            els.optionsContainer.appendChild(div);
        });

        // Animate card
        const card = document.getElementById('question-card');
        card.style.animation = 'none';
        card.offsetHeight; // trigger reflow
        card.style.animation = 'cardEnter 0.4s ease';
    }

    function handleAnswer(selectedDiv, selectedKey, correctKey) {
        const allOpts = els.optionsContainer.querySelectorAll('.option');
        allOpts.forEach(opt => opt.classList.add('disabled'));

        selectedDiv.classList.add('selected');
        const isCorrect = selectedKey === correctKey;

        if (isCorrect) {
            selectedDiv.classList.add('correct');
            score++;
        } else {
            selectedDiv.classList.add('incorrect');
            const qData = currentQuizQuestions[currentQuestionIndex];
            const correctText = qData.options[correctKey];
            allOpts.forEach(opt => {
                if (opt.querySelector('.opt-text').textContent === correctText) {
                    opt.classList.add('correct');
                }
            });
        }

        userAnswers[currentQuestionIndex] = {
            question: currentQuizQuestions[currentQuestionIndex],
            isCorrect,
            selectedKey,
            correctKey,
        };

        els.liveScore.textContent = score;
        els.nextBtn.disabled = false;

        // Update progress
        els.progressBar.style.width = `${((currentQuestionIndex + 1) / currentQuizQuestions.length) * 100}%`;

        // Update dot
        const dots = els.quizDots.querySelectorAll('.quiz-dot');
        dots[currentQuestionIndex].classList.add('answered', isCorrect ? 'correct-dot' : 'incorrect-dot');
    }

    els.nextBtn.addEventListener('click', () => {
        currentQuestionIndex++;
        if (currentQuestionIndex < currentQuizQuestions.length) {
            renderQuestion();
        } else {
            showResults();
        }
    });

    // ── Results ───────────────────────────────────────────
    function showResults() {
        const total = currentQuizQuestions.length;
        const pct = Math.round((score / total) * 100);

        els.resultScore.textContent = score;
        els.resultTotal.textContent = `/${total}`;
        els.rsCorrect.textContent = score;
        els.rsIncorrect.textContent = total - score;
        els.rsPercent.textContent = `${pct}%`;
        els.resultSubtitle.textContent = `You scored ${pct}% accuracy`;

        if (pct === 100) els.resultTitle.textContent = 'Perfect Score! 🏆';
        else if (pct >= 80) els.resultTitle.textContent = 'Excellent Work! 🌟';
        else if (pct >= 60) els.resultTitle.textContent = 'Good Effort! 👍';
        else if (pct >= 40) els.resultTitle.textContent = 'Keep Going! 💪';
        else els.resultTitle.textContent = 'Needs Practice 📖';

        // Animate ring
        const circumference = 2 * Math.PI * 54; // r=54
        const offset = circumference - (pct / 100) * circumference;
        // Add SVG gradient if not present
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

        // Build review
        els.reviewSection.innerHTML = '';
        userAnswers.forEach((ans, i) => {
            if (!ans) return;
            const item = document.createElement('div');
            item.className = `review-item ${ans.isCorrect ? 'rv-correct' : 'rv-incorrect'}`;

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
                    <span class="rv-badge">Week ${ans.question.assignment}</span>
                </div>
                <div class="rv-answer">${answerHTML}</div>
            `;
            els.reviewSection.appendChild(item);
        });

        showSection('results');

        // Confetti if good score
        if (pct >= 70) fireConfetti();
    }

    // ── Utilities ─────────────────────────────────────────
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ── Particle System ───────────────────────────────────
    function initParticles() {
        const canvas = document.getElementById('particle-canvas');
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
