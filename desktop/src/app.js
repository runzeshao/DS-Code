const API_BASE = '';

let currentThreadId = null;
let isProcessing = false;
let abortController = null;
let thinkingVisible = false;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    updateStatus('connecting', '正在连接后端...');
    await connectBackend();
});

async function connectBackend() {
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    while (attempts < maxAttempts) {
        try {
            const res = await fetch(`${API_BASE}/health`, {
                mode: 'cors',
                signal: AbortSignal.timeout(3000)
            });
            if (res.ok) {
                const data = await res.json();
                console.log('Backend connected:', data);
                updateStatus('online', `已连接`);
                return;
            }
        } catch (e) {
            if (attempts === 0 || attempts === 10 || attempts === 30) {
                console.log(`Waiting for backend... (${attempts + 1}/${maxAttempts})`);
                updateStatus('connecting', `正在连接后端... (${attempts + 1}s)`);
            }
        }
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
    }
    updateStatus('offline', '连接失败 - 请确认 ds-tui 已启动');
}

function updateStatus(state, text) {
    const dot = document.getElementById('status-indicator');
    const label = document.getElementById('status-text');
    dot.className = `status-dot ${state}`;
    label.textContent = text;
}

function newChat() {
    currentThreadId = null;
    document.getElementById('messages').innerHTML = `
        <div class="welcome" id="welcome-screen">
            <h2>DS Code AI 编程助手</h2>
            <p>基于 DeepSeek V4 模型，帮你写代码、解问题。</p>
            <div class="suggestions">
                <button class="suggestion-btn" onclick="sendPrompt('用 Python 写一个快速排序')">用 Python 写一个快速排序</button>
                <button class="suggestion-btn" onclick="sendPrompt('解释什么是 RESTful API')">解释什么是 RESTful API</button>
                <button class="suggestion-btn" onclick="sendPrompt('帮我优化这段代码：')">帮我优化这段代码：</button>
            </div>
        </div>`;
    document.getElementById('thinking-panel').classList.add('hidden');
    document.getElementById('prompt-input').value = '';
    document.getElementById('send-btn').disabled = true;
    document.getElementById('chat-title').textContent = '新对话';
    document.getElementById('welcome-screen').scrollIntoView({ behavior: 'smooth' });
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Debounce for input to enable/disable send button
document.getElementById('prompt-input').addEventListener('input', function() {
    document.getElementById('send-btn').disabled = this.value.trim() === '' || isProcessing;
});

function sendMessage() {
    const input = document.getElementById('prompt-input');
    const text = input.value.trim();
    if (!text || isProcessing) return;
    sendPrompt(text);
    input.value = '';
    document.getElementById('send-btn').disabled = true;
}

function sendPrompt(text) {
    if (isProcessing) return;

    // Remove welcome screen
    const welcome = document.getElementById('welcome-screen');
    if (welcome) welcome.remove();

    // Add user message
    addMessage('user', text);

    // Show thinking panel
    showThinking(true);
    isProcessing = true;
    document.getElementById('send-btn').disabled = true;

    // Update chat title on first message
    if (!currentThreadId) {
        document.getElementById('chat-title').textContent = text.length > 30 ? text.substring(0, 30) + '...' : text;
    }

    // Create AI message placeholder
    const aiMsgDiv = addMessage('ai', '', true);
    const aiBubble = aiMsgDiv.querySelector('.bubble');

    // Start SSE stream
    abortController = new AbortController();
    const thinkingEl = document.getElementById('thinking-content');
    thinkingEl.textContent = '';

    fetch(`${API_BASE}/v1/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: text,
            thread_id: currentThreadId,
            stream: true
        }),
        signal: abortController.signal
    }).then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let thinkingContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (!data) continue;

                    try {
                        const event = JSON.parse(data);
                        handleStreamEvent(event, aiBubble, thinkingEl);

                        if (event.type === 'message.delta') {
                            fullContent += event.content || '';
                            aiBubble.innerHTML = renderMarkdown(fullContent);
                            scrollToBottom();
                        } else if (event.type === 'thinking.delta') {
                            thinkingContent += event.content || '';
                            thinkingEl.textContent = thinkingContent;
                        } else if (event.type === 'turn.completed' || event.type === 'done') {
                            if (event.thread_id) currentThreadId = event.thread_id;
                        }
                    } catch (e) {
                        // Skip malformed JSON
                    }
                }
            }
        }
    }).catch((err) => {
        if (err.name !== 'AbortError') {
            aiBubble.textContent = `错误：${err.message}`;
            aiBubble.style.color = 'var(--error)';
        }
    }).finally(() => {
        isProcessing = false;
        document.getElementById('send-btn').disabled = false;
        showThinking(false);
    });
}

function handleStreamEvent(event, bubble, thinkingEl) {
    switch (event.type) {
        case 'turn.started':
            break;
        case 'thinking.delta':
            thinkingEl.textContent = (thinkingEl.textContent || '') + (event.content || '');
            break;
        case 'message.delta':
            // Handled in the main loop
            break;
        case 'tool.started':
            addToolCall(event.tool_name, event.args);
            break;
        case 'tool.completed':
            updateToolResult(event.tool_name, event.result);
            break;
        case 'turn.completed':
            if (event.thread_id) currentThreadId = event.thread_id;
            break;
        case 'error':
            bubble.textContent = `错误：${event.message}`;
            bubble.style.color = 'var(--error)';
            break;
    }
}

function addMessage(role, content, isStreaming = false) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message message-${role === 'user' ? 'user' : 'ai'}${isStreaming ? ' typing' : ''}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (role === 'user') {
        bubble.textContent = content;
    } else if (content) {
        bubble.innerHTML = renderMarkdown(content);
    }

    div.appendChild(bubble);
    container.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    const container = document.getElementById('messages');
    container.scrollTop = container.scrollHeight;
}

function showThinking(show) {
    const panel = document.getElementById('thinking-panel');
    if (show) {
        panel.classList.remove('hidden');
        document.getElementById('thinking-content').textContent = '';
    } else {
        panel.classList.add('hidden');
    }
}

function toggleThinking() {
    const panel = document.getElementById('thinking-panel');
    panel.classList.toggle('expanded');
    const btn = panel.querySelector('.thinking-toggle');
    btn.textContent = panel.classList.contains('expanded') ? '收起' : '展开';
}

function renderMarkdown(text) {
    if (!text) return '';
    let html = text;

    // Code blocks (must be first)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const escaped = escapeHtml(code.trim());
        return `<pre><code>${escaped}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Lists
    html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');
    html = html.replace(/^\d+\. (.*?)$/gm, '<li>$1</li>');

    // Paragraphs (double newlines)
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/^(?!<[hupcli]|<pre)/, '<p>');
    html = html.replace(/$/, '</p>');

    // Clean up wrapping issues
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p><li>/g, '<li>');
    html = html.replace(/<\/li><\/p>/g, '</li>');
    html = html.replace(/<ul><p>/g, '<ul>');
    html = html.replace(/<\/p><\/ul>/g, '</ul>');

    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addToolCall(name, args) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'message message-ai';
    div.innerHTML = `<div class="bubble" style="font-size:12px;color:var(--text-muted);background:var(--thinking-bg);padding:8px 12px;">
        🔧 使用工具: ${escapeHtml(name)}
    </div>`;
    container.appendChild(div);
    scrollToBottom();
}

function updateToolResult(name, result) {
    // Could update the tool call with result
}
