let messages = [
    { role: 'system', content: 'You are a helpful and expert AI assistant. Please respond clearly and concisely.' }
];

let isStopped = false;

const chatHistoryObj = document.getElementById('chat-history');
const chatInputObj   = document.getElementById('chat-input');
const sendBtnObj     = document.getElementById('send-btn');
const stopBtnObj     = document.getElementById('stop-btn');
const clearBtnObj    = document.getElementById('clear-btn');

// Auto-resize textarea
chatInputObj.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function appendMessage(role, content, isHtml = false) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('message', role === 'user' ? 'user-message' : 'ai-message');

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    if (isHtml) contentDiv.innerHTML = content;
    else contentDiv.innerText = content;

    wrapper.appendChild(contentDiv);
    chatHistoryObj.appendChild(wrapper);
    chatHistoryObj.scrollTop = chatHistoryObj.scrollHeight;
    return wrapper;
}

// Live status bubble – returns the element so we can update it in-place
function createStatusBubble() {
    const wrapper = document.createElement('div');
    wrapper.classList.add('message', 'ai-message');
    wrapper.id = 'status-bubble';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content', 'status-bubble-inner');
    contentDiv.innerHTML = `<div class="status-steps" id="status-steps"></div>`;

    wrapper.appendChild(contentDiv);
    chatHistoryObj.appendChild(wrapper);
    chatHistoryObj.scrollTop = chatHistoryObj.scrollHeight;
    return wrapper;
}

function addStatusStep(label, state = 'running') {
    // state: 'running' | 'done' | 'error'
    const steps = document.getElementById('status-steps');
    if (!steps) return;

    const row = document.createElement('div');
    row.classList.add('status-step', `status-step--${state}`);
    row.dataset.label = label;

    const icon = document.createElement('span');
    icon.classList.add('step-icon');
    icon.textContent = state === 'running' ? '◌' : state === 'done' ? '✓' : '✗';

    const text = document.createElement('span');
    text.classList.add('step-text');
    text.textContent = label;

    row.appendChild(icon);
    row.appendChild(text);
    steps.appendChild(row);
    chatHistoryObj.scrollTop = chatHistoryObj.scrollHeight;
    return row;
}

function updateLastStep(label, state) {
    const steps = document.getElementById('status-steps');
    if (!steps) return;
    const rows = steps.querySelectorAll('.status-step');
    if (!rows.length) return;
    const last = rows[rows.length - 1];
    last.className = `status-step status-step--${state}`;
    last.querySelector('.step-icon').textContent = state === 'done' ? '✓' : '✗';
    if (label) last.querySelector('.step-text').textContent = label;
}

function removeStatusBubble() {
    const el = document.getElementById('status-bubble');
    if (el) el.remove();
}

// ─── UI state ─────────────────────────────────────────────────────────────────

function setRunningState(running) {
    chatInputObj.disabled = running;
    sendBtnObj.style.display = running ? 'none' : 'flex';
    stopBtnObj.style.display = running ? 'flex' : 'none';
}

// ─── Clear Chat ───────────────────────────────────────────────────────────────

clearBtnObj.addEventListener('click', () => {
    chatHistoryObj.innerHTML = '';
    messages = [{ role: 'system', content: 'You are a helpful and expert AI assistant. Please respond clearly and concisely.' }];
    appendMessage('assistant', "Chat cleared. How can I help you?");
});

// ─── Stop Button ─────────────────────────────────────────────────────────────

stopBtnObj.addEventListener('click', () => {
    isStopped = true;
    updateLastStep('Stopped by user', 'error');
    setRunningState(false);
    chatInputObj.focus();
});

// ─── Send Message ─────────────────────────────────────────────────────────────

async function sendMessage() {
    const text = chatInputObj.value.trim();
    if (!text) return;

    isStopped = false;

    appendMessage('user', text);
    messages.push({ role: 'user', content: text });

    chatInputObj.value = '';
    chatInputObj.style.height = 'auto';
    setRunningState(true);

    // ── Zepto/grocery keyword interception ────────────────────────────────────────
    const blinkitKeywords = ['blinkit', 'zepto', 'buy ingredients', 'order groceries'];
    if (blinkitKeywords.some(kw => text.toLowerCase().includes(kw))) {
        setRunningState(false);
        BlinkitUI.startFlow(text);
        return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Show live status bubble
    createStatusBubble();
    addStatusStep('Thinking…', 'running');

    try {
        const response = await window.electronAPI.chatWithLlama(messages);

        if (isStopped) return; // User cancelled — discard result

        if (response.error) {
            updateLastStep('Error', 'error');
            // Replace status bubble with error message
            removeStatusBubble();
            appendMessage('assistant', `⚠️ ${response.error}`);
            return;
        }

        const { logs, plan } = response;

        // Animate through each plan step
        updateLastStep('Planning complete', 'done');

        for (let i = 0; i < logs.length; i++) {
            if (isStopped) return;
            const log = logs[i];
            addStatusStep(`Executing: ${log.action}${log.file !== 'N/A' ? ` → ${log.file}` : ''}`, 'running');
            await new Promise(r => setTimeout(r, 120)); // brief visual pause
            updateLastStep(
                `${log.action}${log.file !== 'N/A' ? ` → ${log.file}` : ''}: ${log.detail}`,
                log.success ? 'done' : 'error'
            );
        }

        if (isStopped) return;
        addStatusStep('Done', 'done');

        // Also render a compact result card below the status bubble
        let htmlContent = '';
        logs.forEach(log => {
            const ok = log.success;
            htmlContent += `<div class="result-row ${ok ? 'result-ok' : 'result-err'}">
                <span class="result-icon">${ok ? '✓' : '✗'}</span>
                <span class="result-text"><strong>${log.action}</strong>${log.file !== 'N/A' ? ` — <code>${log.file}</code>` : ''}<br>
                <small>${log.detail}</small></span>
            </div>`;
        });

        // Finalise: replace live bubble with clean result card
        removeStatusBubble();
        appendMessage('assistant', htmlContent, true);

        messages.push({ role: 'assistant', content: JSON.stringify(logs) });

    } catch (error) {
        if (!isStopped) {
            updateLastStep('App error', 'error');
            removeStatusBubble();
            appendMessage('assistant', `⚠️ App Error: ${error.message}`);
        }
    } finally {
        if (!isStopped) setRunningState(false);
        chatInputObj.focus();
    }
}

sendBtnObj.addEventListener('click', sendMessage);

chatInputObj.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  BLINKIT UI CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

const BlinkitUI = (() => {
    // ─── DOM refs ────────────────────────────────────────────────────────────
    const modal            = document.getElementById('blinkit-modal');
    const dishNameEl       = document.getElementById('blinkit-dish-name');
    const ingredientList   = document.getElementById('blinkit-ingredient-list');
    const confirmBtn       = document.getElementById('blinkit-confirm-btn');
    const cancelBtn        = document.getElementById('blinkit-cancel-btn');
    const modalCloseBtn    = document.getElementById('blinkit-modal-close');
    const progressPanel    = document.getElementById('blinkit-progress');
    const progressDish     = document.getElementById('blinkit-progress-dish');
    const progressItems    = document.getElementById('blinkit-progress-items');
    const progressFooter   = document.getElementById('blinkit-progress-footer');
    const abortBtn         = document.getElementById('blinkit-abort-btn');
    const closePanelBtn    = document.getElementById('blinkit-close-btn');

    let aborted = false;
    let currentDish = '';
    let skipCurrent = false;

    // ─── Show ingredient modal ────────────────────────────────────────────────
    function showModal(dish, ingredients) {
        currentDish = dish;
        dishNameEl.textContent = dish;
        ingredientList.innerHTML = '';

        if (!ingredients || ingredients.length === 0) {
            ingredientList.innerHTML = '<p style="padding:12px;color:#6b7280;font-family:var(--font-inter);font-size:0.85rem">No ingredients found. Try again.</p>';
        } else {
            ingredients.forEach((item, i) => {
                const row = document.createElement('div');
                row.className = 'blinkit-ingredient-item';
                row.id = `blinkit-item-check-${i}`;

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = true;
                cb.id = `blinkit-cb-${i}`;

                const label = document.createElement('label');
                label.htmlFor = `blinkit-cb-${i}`;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'blinkit-item-name';
                nameSpan.textContent = item.name;

                const qtySpan = document.createElement('span');
                qtySpan.className = 'blinkit-item-qty';
                qtySpan.textContent = item.qty || '';

                label.appendChild(nameSpan);
                label.appendChild(qtySpan);
                row.appendChild(cb);
                row.appendChild(label);

                // Toggle dim on uncheck
                cb.addEventListener('change', () => {
                    row.classList.toggle('unchecked', !cb.checked);
                });

                ingredientList.appendChild(row);
            });
        }

        modal.style.display = 'flex';
    }

    function hideModal() {
        modal.style.display = 'none';
    }

    // ─── Extract checked ingredients ──────────────────────────────────────────
    function getCheckedIngredients(ingredients) {
        return ingredients.filter((_, i) => {
            const cb = document.getElementById(`blinkit-cb-${i}`);
            return cb && cb.checked;
        });
    }

    // ─── Show progress panel ─────────────────────────────────────────────────
    function showProgressPanel(dish, items) {
        progressDish.textContent = dish;
        progressItems.innerHTML = '';
        progressFooter.style.display = 'none';
        progressPanel.style.display = 'block';

        // Create rows for all items upfront (pending state)
        items.forEach((item, i) => {
            const row = createItemRow(item.name, 'pending', '○', '', i);
            progressItems.appendChild(row);
        });
    }

    function createItemRow(name, state, icon, detail, idx) {
        const row = document.createElement('div');
        row.className = `blinkit-item-row blinkit-item-row--${state}`;
        row.id = `blinkit-row-${idx}`;

        const statusEl = document.createElement('div');
        statusEl.className = 'blinkit-item-status';
        statusEl.id = `blinkit-status-${idx}`;
        statusEl.textContent = icon;

        const info = document.createElement('div');
        info.className = 'blinkit-item-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'blinkit-item-info-name';
        nameEl.textContent = name;

        const detailEl = document.createElement('div');
        detailEl.className = 'blinkit-item-info-detail';
        detailEl.id = `blinkit-detail-${idx}`;
        detailEl.textContent = detail;

        info.appendChild(nameEl);
        info.appendChild(detailEl);

        const skipBtn = document.createElement('button');
        skipBtn.className = 'blinkit-skip-btn';
        skipBtn.id = `blinkit-skip-${idx}`;
        skipBtn.textContent = 'Skip';
        skipBtn.style.display = state === 'running' ? 'block' : 'none';
        skipBtn.addEventListener('click', () => { skipCurrent = true; });

        row.appendChild(statusEl);
        row.appendChild(info);
        row.appendChild(skipBtn);

        return row;
    }

    function updateItemRow(idx, state, icon, detail) {
        const row = document.getElementById(`blinkit-row-${idx}`);
        const statusEl = document.getElementById(`blinkit-status-${idx}`);
        const detailEl = document.getElementById(`blinkit-detail-${idx}`);
        const skipBtn  = document.getElementById(`blinkit-skip-${idx}`);
        if (!row) return;

        row.className = `blinkit-item-row blinkit-item-row--${state}`;
        if (statusEl) statusEl.innerHTML = icon;   // innerHTML so spinner <span> renders
        if (detailEl) detailEl.textContent = detail;
        if (skipBtn)  skipBtn.style.display = state === 'running' ? 'block' : 'none';

        progressItems.scrollTop = progressItems.scrollHeight;
    }

    // ─── Main ordering flow ───────────────────────────────────────────────────
    async function runOrderFlow(dish, ingredients) {
        aborted = false;
        hideModal();
        showProgressPanel(dish, ingredients);

        // Open Blinkit
        const openResult = await window.electronAPI.blinkit.open();
        if (openResult.error) {
            progressItems.innerHTML = `<div class="blinkit-item-row blinkit-item-row--error">
                <div class="blinkit-item-status">✗</div>
                <div class="blinkit-item-info"><div class="blinkit-item-info-name">Failed to open Blinkit</div>
                <div class="blinkit-item-info-detail">${openResult.error}</div></div></div>`;
            progressFooter.style.display = 'flex';
            return;
        }

        // Add each item
        for (let i = 0; i < ingredients.length; i++) {
            if (aborted) break;

            const item = ingredients[i];
            skipCurrent = false;

            // Mark as running
            updateItemRow(i, 'running', '<span class="blinkit-spinner"></span>', 'Searching…');

            // Wait a moment to let skip register if needed
            await new Promise(r => setTimeout(r, 400));
            if (aborted) break;
            if (skipCurrent) {
                updateItemRow(i, 'skipped', '⟳', 'Skipped');
                continue;
            }

            const result = await window.electronAPI.blinkit.addItem(item.name);

            if (aborted) break;

            if (result.success) {
                updateItemRow(i, 'success', '✓', result.detail || 'Added to cart');
            } else {
                updateItemRow(i, 'error', '✗', result.detail || 'Not found');
            }

            // Small pause between items
            await new Promise(r => setTimeout(r, 600));
        }

        if (!aborted) {
            // All done
            progressFooter.style.display = 'flex';
            appendMessage('assistant',
                `🛒 <strong>Zepto order prepared for &ldquo;${dish}&rdquo;</strong><br>
                ${ingredients.length} item(s) processed. <em>Please log in on Zepto to complete your checkout!</em>`,
                true
            );
        }
    }

    // ─── Public: start flow from text input ──────────────────────────────────
    async function startFlow(userText) {
        dishNameEl.textContent = 'Loading…';
        ingredientList.innerHTML = '<p style="padding:12px;color:#6b7280;font-family:var(--font-inter);font-size:0.85rem">⏳ Extracting ingredients…</p>';
        modal.style.display = 'flex';

        const result = await window.electronAPI.blinkit.getIngredients(userText);

        if (result.error) {
            dishNameEl.textContent = 'Error';
            ingredientList.innerHTML = `<p style="padding:12px;color:#ef4444;font-size:0.85rem">${result.error}</p>`;
            return;
        }

        showModal(result.dish, result.ingredients);
    }

    // ─── Event wiring ──────────────────────────────────────────────────────────
    cancelBtn.addEventListener('click', hideModal);
    modalCloseBtn.addEventListener('click', hideModal);

    confirmBtn.addEventListener('click', async () => {
        // Collect checked items from current ingredient list
        const items = [];
        ingredientList.querySelectorAll('.blinkit-ingredient-item').forEach((row, i) => {
            const cb = row.querySelector('input[type="checkbox"]');
            if (cb && cb.checked) {
                const name = row.querySelector('.blinkit-item-name')?.textContent || '';
                const qty  = row.querySelector('.blinkit-item-qty')?.textContent  || '';
                items.push({ name, qty });
            }
        });
        if (items.length === 0) { hideModal(); return; }
        runOrderFlow(currentDish, items);
    });

    abortBtn.addEventListener('click', async () => {
        aborted = true;
        await window.electronAPI.blinkit.close();
        progressPanel.style.display = 'none';
        appendMessage('assistant', '🛒 Zepto order aborted.');
    });

    closePanelBtn.addEventListener('click', () => {
        progressPanel.style.display = 'none';
    });

    // ─── Listen for Live Assist trigger ──────────────────────────────────────
    window.electronAPI.blinkit.onShowModal(({ dish, ingredients, error }) => {
        if (error) {
            appendMessage('assistant', `⚠️ Blinkit: ${error}`);
            return;
        }
        showModal(dish, ingredients);
    });

    return { startFlow };
})();
