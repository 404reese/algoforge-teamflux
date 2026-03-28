const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const browserAutomation = require('./browser-automation');
require('dotenv').config();

const runtimeContext = {
  apiKey: null,
  userRequest: '',
  applicantProfile: null
};

// ─── Live Assist State ────────────────────────────────────────────────────────
let liveSession = null;
let screenCaptureInterval = null;
let mainWin = null;
let toolBusy = false; // prevents concurrent tool call execution

/** Safe sender — skips if window or webContents is gone */
function safeToRenderer(channel, payload) {
  if (!mainWin || mainWin.isDestroyed()) return;
  const wc = mainWin.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send(channel, payload);
}

const BASE_DIR = "E:\\coding ground\\axiom-desktop\\files";

// Ensure BASE_DIR exists
async function ensureBaseDir() {
    try {
        await fs.mkdir(BASE_DIR, { recursive: true });
    } catch (err) {
        console.error("Failed to create BASE_DIR:", err);
    }
}

async function fetchGroqJson(apiKey, systemPrompt, userPrompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '{}';

  try {
    return JSON.parse(rawText);
  } catch (_err) {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Failed to parse JSON response from model.');
  }
}

async function generateApplicantProfile(apiKey, userRequest) {
  const profilePrompt = `Generate a realistic but fictional job applicant profile.
Return JSON only with these keys:
firstName, lastName, email, phone, dob, gender, address, city, state, pincode, qualification, experienceYears, skills, linkedIn, portfolio`;

  const data = await fetchGroqJson(
    apiKey,
    'You generate safe fictional applicant data for automation testing. Output only JSON.',
    `User request: ${userRequest}`
  );

  return {
    firstName: data.firstName || 'Alex',
    lastName: data.lastName || 'Sharma',
    email: data.email || 'alex.sharma@example.com',
    phone: data.phone || '9876543210',
    dob: data.dob || '10 May 1997',
    gender: data.gender || 'Male',
    address: data.address || '123 Lake View Road',
    city: data.city || 'Pune',
    state: data.state || 'Maharashtra',
    pincode: data.pincode || '411001',
    qualification: data.qualification || 'B.Tech Computer Science',
    experienceYears: data.experienceYears || '2',
    skills: data.skills || 'JavaScript, Playwright, API Testing',
    linkedIn: data.linkedIn || 'https://linkedin.com/in/alex-sharma',
    portfolio: data.portfolio || 'https://alex-portfolio.dev'
  };
}

function hasProfilePlaceholder(value) {
  if (typeof value === 'string') return /\{\{\s*profile\.[^}]+\s*\}\}/.test(value);
  if (Array.isArray(value)) return value.some(hasProfilePlaceholder);
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasProfilePlaceholder);
  }
  return false;
}

function resolveProfilePlaceholders(value, profile) {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*profile\.([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
      return profile[key] != null ? String(profile[key]) : '';
    });
  }

  if (Array.isArray(value)) {
    return value.map(item => resolveProfilePlaceholders(item, profile));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveProfilePlaceholders(v, profile)])
    );
  }

  return value;
}

// Security: ensure the resolved path is inside BASE_DIR
function getSafePath(relativePath) {
    if (!relativePath) return BASE_DIR;
    // Normalize path just in case
    const normalizedRelative = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const resolvedPath = path.resolve(BASE_DIR, normalizedRelative);
    if (!resolvedPath.startsWith(BASE_DIR)) {
        throw new Error("Access denied: Path traversal attempted.");
    }
    return resolvedPath;
}

// Execution Engine Actions
const actions = {
    list_files: async () => {
        const files = await fs.readdir(BASE_DIR);
        return `Files: ${files.length > 0 ? files.join(', ') : 'None'}`;
    },
    read_file: async (step) => {
        if (!step.filename) throw new Error("filename is required");
        const safePath = getSafePath(step.filename);
        const content = await fs.readFile(safePath, 'utf-8');
        return `Read ${step.filename} successfully.`;
    },
    write_file: async (step) => {
        if (!step.filename) throw new Error("filename is required");
        const safePath = getSafePath(step.filename);
        await fs.writeFile(safePath, step.content || '');
        return `Wrote to ${step.filename}`;
    },
    delete_file: async (step) => {
        const files = await fs.readdir(BASE_DIR);
        let count = 0;
        for (const file of files) {
            if (!step.pattern || file.includes(step.pattern)) {
                const safePath = getSafePath(file);
                const stat = await fs.stat(safePath);
                if (stat.isFile()) {
                    await fs.unlink(safePath);
                    count++;
                }
            }
        }
        return `Deleted ${count} file(s)`;
    },
    organize_folder: async () => {
        const folders = ['images', 'docs', 'code', 'others'];
        for (const folder of folders) {
            await fs.mkdir(path.join(BASE_DIR, folder), { recursive: true });
        }
        
        const files = await fs.readdir(BASE_DIR);
        let count = 0;
        for (const file of files) {
            const safePath = getSafePath(file);
            const stat = await fs.stat(safePath);
            if (!stat.isFile()) continue;
            
            let targetFolder = 'others';
            if (/\.(png|jpg|jpeg|gif)$/i.test(file)) targetFolder = 'images';
            else if (/\.(pdf|txt|doc|docx)$/i.test(file)) targetFolder = 'docs';
            else if (/\.(js|html|css|py|json|md)$/i.test(file)) targetFolder = 'code';
            
            await fs.rename(safePath, path.join(BASE_DIR, targetFolder, file));
            count++;
        }
        return `Organized ${count} file(s)`;
    },
    wait: async (step) => {
        const ms = step.duration || 1000;
        await new Promise(resolve => setTimeout(resolve, ms));
        return `Waited ${ms}ms`;
    },
    install_app: async (step) => {
        if (!step.app_name) throw new Error("app_name is required for installation");
        
        const installers = {
            chrome: "winget install -e --id Google.Chrome --accept-source-agreements --accept-package-agreements",
            vlc: "winget install -e --id VideoLAN.VLC --accept-source-agreements --accept-package-agreements",
            discord: "winget install -e --id Discord.Discord --accept-source-agreements --accept-package-agreements",
            vscode: "winget install -e --id Microsoft.VisualStudioCode --accept-source-agreements --accept-package-agreements"
        };

        const normalized = step.app_name.toLowerCase();
        let matchedKey = Object.keys(installers).find(k => normalized.includes(k));

        try {
            let res;
            if (matchedKey) {
                const commandArgs = installers[matchedKey].split(' ').slice(1);
                res = await execFile('winget', commandArgs);
            } else {
                res = await execFile('winget', [
                    'install', 
                    step.app_name, 
                    '--accept-source-agreements', 
                    '--accept-package-agreements'
                ]);
            }
            
            return `Successfully started installation of ${step.app_name}. Output: ${res.stdout.trim().substring(0, 150)}...`;
        } catch (error) {
            throw new Error(`Winget failed for ${step.app_name}. Details: ${error.message}`);
        }
    },
    browser: async (step) => {
        if (!step.plan) throw new Error("plan is required for browser action");
      let browserPlan = step.plan;

      if (hasProfilePlaceholder(browserPlan)) {
        if (!runtimeContext.applicantProfile) {
          if (!runtimeContext.apiKey) {
            throw new Error('Missing API key required to generate applicant profile.');
          }
          runtimeContext.applicantProfile = await generateApplicantProfile(
            runtimeContext.apiKey,
            runtimeContext.userRequest
          );
        }
        browserPlan = resolveProfilePlaceholders(browserPlan, runtimeContext.applicantProfile);
      }

      console.log('[Main] Browser action triggered. Plan:', JSON.stringify(browserPlan, null, 2));
      const subLogs = await browserAutomation.executeBrowserPlan(browserPlan);
        const failed = subLogs.filter(l => !l.success).length;
        console.log(`[Main] Browser plan done. ${subLogs.length} steps, ${failed} failed.`);
        // Return detail string that includes all sub-step results
        const detail = subLogs.map((l, i) =>
            `  Step ${i+1} [${l.action}]: ${l.success ? '✓' : '✗'} ${l.detail}`
        ).join('\n');
        return `Browser automation: ${subLogs.length} steps, ${failed} failed.\n${detail}`;
    }
};

async function executePlan(plan) {
    const logs = [];
    if (!plan || !Array.isArray(plan.steps)) {
        throw new Error("Invalid plan format. Expected 'steps' array.");
    }

    for (const step of plan.steps) {
        let result;
        try {
            const actionFn = actions[step.action];
            if (!actionFn) throw new Error(`Unknown action: ${step.action}`);
            
            const message = await actionFn(step);
            result = { success: true, detail: message };
        } catch (err) {
             result = { success: false, detail: err.message };
        }
        
        logs.push({
            action: step.action,
            file: step.filename || step.pattern || 'N/A',
            success: result.success,
            detail: result.detail
        });
    }
    
    return logs;
}

// ─── planAndExecute: voice command → Groq planner → executePlan ─────────────────
async function planAndExecute(command) {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error('GROQ_API_KEY not set.');
    const plan = await fetchGroqJson(
        groqKey,
        SYSTEM_PROMPT,
        command
    );
    return await executePlan(plan);
}

const SYSTEM_PROMPT = `You are an automation planner.
Convert the user request into a JSON plan using ONLY the allowed actions.

ALLOWED ACTIONS:

File Operations:
* list_files (no params needed)
* read_file (requires: filename)
* write_file (requires: filename, content)
* delete_file (optional: pattern)
* organize_folder (no params needed)
* install_app (requires: app_name) - Examples: "vlc", "chrome", "discord", "vscode"
* wait (requires: duration in ms)

Browser Automation:
* browser (with nested browser steps: open_browser, navigate, type, click, press, wait)

Browser step fields:
* type requires: target, text
* click requires: target
* navigate requires: url
* press requires: key

Use {{profile.<field>}} placeholders in browser step text for auto-generated applicant details.
Supported placeholders:
{{profile.firstName}}, {{profile.lastName}}, {{profile.email}}, {{profile.phone}}, {{profile.dob}},
{{profile.gender}}, {{profile.address}}, {{profile.city}}, {{profile.state}}, {{profile.pincode}},
{{profile.qualification}}, {{profile.experienceYears}}, {{profile.skills}}, {{profile.linkedIn}}, {{profile.portfolio}}

KNOWN BROWSER TARGETS:
* google_search → Google search box
* youtube_search → YouTube search bar
* amazon_search → Amazon search box

SUPPORTED APP NAMES FOR install_app:
Available: "vlc", "chrome", "discord", "vscode"

Rules:
* Output ONLY valid JSON with a single "steps" array.
* No explanations outside JSON.
* File operations use relative paths.
* For browser automation, nest browser steps inside { "action": "browser", "plan": { "steps": [...] } }

FILE OPERATION EXAMPLES:

User: organize my files
{
  "steps": [
    { "action": "organize_folder" }
  ]
}

User: install vlc player
{
  "steps": [
    { "action": "install_app", "app_name": "vlc" }
  ]
}

User: install discord
{
  "steps": [
    { "action": "install_app", "app_name": "discord" }
  ]
}

User: list my files
{
  "steps": [
    { "action": "list_files" }
  ]
}

BROWSER AUTOMATION EXAMPLES:

User: search best laptops on google
{
  "steps": [
    {
      "action": "browser",
      "plan": {
        "steps": [
          { "action": "open_browser" },
          { "action": "navigate", "url": "https://google.com" },
          { "action": "wait", "seconds": 2 },
          { "action": "type", "target": "google_search", "text": "best laptops 2026" },
          { "action": "press", "key": "Enter" },
          { "action": "wait", "seconds": 3 }
        ]
      }
    }
  ]
}

User: search headphones on amazon
{
  "steps": [
    {
      "action": "browser",
      "plan": {
        "steps": [
          { "action": "open_browser" },
          { "action": "navigate", "url": "https://amazon.com" },
          { "action": "wait", "seconds": 2 },
          { "action": "type", "target": "amazon_search", "text": "headphones" },
          { "action": "press", "key": "Enter" }
        ]
      }
    }
  ]
}

User: search coding tutorials on youtube
{
  "steps": [

JOB APPLICATION EXAMPLE:
User: search on google tech jobs then open qavbox signup and demoqa practice form and fill details
{
  "steps": [
    {
      "action": "browser",
      "plan": {
        "steps": [
          { "action": "open_browser" },
          { "action": "navigate", "url": "https://google.com" },
          { "action": "wait", "seconds": 2 },
          { "action": "type", "target": "google_search", "text": "tech jobs" },
          { "action": "press", "key": "Enter" },
          { "action": "wait", "seconds": 2 },

          { "action": "navigate", "url": "https://qavbox.github.io/demo/signup/" },
          { "action": "wait", "seconds": 2 },
          { "action": "type", "target": "input[name='name'], input#name", "text": "{{profile.firstName}} {{profile.lastName}}" },
          { "action": "type", "target": "input[name='email'], input[type='email']", "text": "{{profile.email}}" },
          { "action": "type", "target": "input[name='phone'], input[type='tel']", "text": "{{profile.phone}}" },
          { "action": "type", "target": "textarea[name='address'], textarea", "text": "{{profile.address}}, {{profile.city}}" },

          { "action": "navigate", "url": "https://demoqa.com/automation-practice-form" },
          { "action": "wait", "seconds": 2 },
          { "action": "type", "target": "#firstName", "text": "{{profile.firstName}}" },
          { "action": "type", "target": "#lastName", "text": "{{profile.lastName}}" },
          { "action": "type", "target": "#userEmail", "text": "{{profile.email}}" },
          { "action": "click", "target": "label[for='gender-radio-1'], label[for='gender-radio-2']" },
          { "action": "type", "target": "#userNumber", "text": "{{profile.phone}}" },
          { "action": "type", "target": "#subjectsInput", "text": "Automation" },
          { "action": "press", "key": "Enter" },
          { "action": "type", "target": "#currentAddress", "text": "{{profile.address}}" }
        ]
      }
    }
  ]
}
    {
      "action": "browser",
      "plan": {
        "steps": [
          { "action": "open_browser" },
          { "action": "navigate", "url": "https://youtube.com" },
          { "action": "wait", "seconds": 2 },
          { "action": "type", "target": "youtube_search", "text": "coding tutorials" },
          { "action": "press", "key": "Enter" }
        ]
      }
    }
  ]
}`;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  mainWin = win;
  win.loadFile('index.html');
}

app.whenReady().then(async () => {
  await ensureBaseDir();
  createWindow();

  ipcMain.handle('chat:llama', async (event, messages) => {
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey || apiKey === 'your_api_key_here') {
      return { error: 'Please configure GROQ_API_KEY in your .env file.' };
    }
    try {
      runtimeContext.apiKey = apiKey;
      runtimeContext.userRequest = [...messages].reverse().find(m => m.role === 'user')?.content || '';
      runtimeContext.applicantProfile = null;

      // Modify messages to inject the strict system prompt
      const moddedMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.filter(m => m.role !== 'system') // Remove generic system prompts
      ];

      const plannerResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: moddedMessages,
          response_format: { type: "json_object" }
        })
      });

      if (!plannerResponse.ok) {
        const errorText = await plannerResponse.text();
        return { error: `API Error: ${plannerResponse.status} - ${errorText}` };
      }

      const plannerData = await plannerResponse.json();
      const rawText = plannerData.choices?.[0]?.message?.content || '{}';

      let plan;
      try {
        plan = JSON.parse(rawText);
      } catch (e) {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) plan = JSON.parse(jsonMatch[0]);
        else throw new Error("Failed to parse LLM planner JSON output.");
      }
      
      // Execute the plan
      const logs = await executePlan(plan);
      return { logs, plan };
    } catch (error) {
      return { error: error.message };
    }
  });

  // ─── Live Assist IPC Handlers ──────────────────────────────────────────────

  ipcMain.handle('live-assist:start', async () => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        return { error: 'Please add GEMINI_API_KEY to your .env file.' };
      }

      // Dynamically import ESM package
      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      liveSession = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        callbacks: {
          onopen: () => {
            console.log('[LiveAssist] Session opened');
            safeToRenderer('live-assist:status', 'connected');
            toolBusy = false; // reset on new session
          },
          onmessage: async (message) => {
            // ── Audio / transcription responses ──
            const content = message.serverContent;
            if (content?.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData) {
                  safeToRenderer('live-assist:audio-response', part.inlineData.data);
                }
              }
            }
            if (content?.inputTranscription?.text) {
              safeToRenderer('live-assist:transcript', {
                role: 'user',
                text: content.inputTranscription.text
              });
            }
            if (content?.outputTranscription?.text) {
              safeToRenderer('live-assist:transcript', {
                role: 'assistant',
                text: content.outputTranscription.text
              });
            }

            // ── Function / tool calls from Gemini ──
            if (message.toolCall) {
              // Drop the call if a tool is already running (avoid concurrent browser sessions)
              if (toolBusy) {
                console.warn('[LiveAssist] Tool call dropped — previous task still running');
                return;
              }
              toolBusy = true;

              const functionResponses = [];
              for (const fc of message.toolCall.functionCalls) {
                console.log(`[LiveAssist] Tool call: ${fc.name}`, fc.args);
                safeToRenderer('live-assist:tool-call', {
                  name: fc.name,
                  command: fc.args?.command || JSON.stringify(fc.args)
                });
                try {
                  const logs = await planAndExecute(fc.args.command);
                  const summary = logs
                    .map(l => `${l.action}${l.file !== 'N/A' ? ' → ' + l.file : ''}: ${
                      l.success ? l.detail : '✗ ' + l.detail
                    }`)
                    .join('\n');
                  functionResponses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { output: summary }
                  });
                  safeToRenderer('live-assist:tool-result', { success: true, summary });
                } catch (err) {
                  console.error('[LiveAssist] Tool execution error:', err);
                  functionResponses.push({
                    id: fc.id,
                    name: fc.name,
                    response: { output: 'Error: ' + err.message }
                  });
                  safeToRenderer('live-assist:tool-result', { success: false, summary: err.message });
                }
              }

              toolBusy = false;

              // Guard: session may have been closed while the tool was running
              if (liveSession) {
                try {
                  liveSession.sendToolResponse({ functionResponses });
                } catch (e) {
                  console.error('[LiveAssist] sendToolResponse failed:', e.message);
                }
              } else {
                console.warn('[LiveAssist] Session gone — cannot send tool response');
              }
            }
          },
          onerror: (e) => {
            console.error('[LiveAssist] Session error:', e);
            safeToRenderer('live-assist:error', e?.message || 'Unknown error');
          },
          onclose: (e) => {
            console.log('[LiveAssist] Session closed:', e?.reason);
            safeToRenderer('live-assist:status', 'disconnected');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: {
            parts: [{
              text: `You are Axiom, a powerful AI desktop assistant. You can hear the user's voice and see their screen.
You have access to desktop automation tools. When the user asks you to do something on their computer, call the execute_task function.
Examples of tasks you can execute:
- "organize my files" (sorts files into folders)
- "install vlc" / "install discord" / "install chrome" / "install vscode"
- "list my files"
- "search [query] on google/youtube/amazon" (opens browser)
- "write a file called notes.txt with content..."
- "fill the practice form on demoqa"
For anything else (questions, explanations, chat), just respond normally without calling a tool.
Be concise and conversational.`
            }]
          },
          tools: [{
            functionDeclarations: [{
              name: 'execute_task',
              description: 'Execute a desktop automation task on the user\'s computer. Handles file operations, app installation, and browser automation.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  command: {
                    type: 'STRING',
                    description: 'Natural language description of the task. E.g. "organize my files", "install VLC", "search laptops on Amazon", "list files"'
                  }
                },
                required: ['command']
              }
            }]
          }]
        }
      });

      // Start 1-fps screen capture
      screenCaptureInterval = setInterval(async () => {
        if (!liveSession) return;
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 1280, height: 720 }
          });
          if (sources.length > 0) {
            const jpegBuf = sources[0].thumbnail.toJPEG(70);
            liveSession.sendRealtimeInput({
              video: { data: jpegBuf.toString('base64'), mimeType: 'image/jpeg' }
            });
          }
        } catch (err) {
          console.error('[LiveAssist] Screen capture error:', err);
        }
      }, 1000);

      return { success: true };
    } catch (err) {
      console.error('[LiveAssist] Start error:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('live-assist:audio-chunk', async (_event, base64Audio) => {
    if (!liveSession) return;
    try {
      liveSession.sendRealtimeInput({
        audio: { data: base64Audio, mimeType: 'audio/pcm;rate=16000' }
      });
    } catch (err) {
      console.error('[LiveAssist] Audio send error:', err);
    }
  });

  ipcMain.handle('live-assist:stop', async () => {
    try {
      toolBusy = false; // release lock in case a task was interrupted
      if (screenCaptureInterval) {
        clearInterval(screenCaptureInterval);
        screenCaptureInterval = null;
      }
      if (liveSession) {
        liveSession.close();
        liveSession = null;
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
});