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
