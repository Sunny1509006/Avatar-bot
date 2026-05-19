# Aria - Live AI 3D Talking Avatar

Aria is a state-of-the-art, fully interactive 3D talking avatar companion built with Three.js, `@pixiv/three-vrm`, FastAPI, and integrated with advanced language models (Google Gemini and OpenAI GPT) and text-to-speech engines.

## 🌟 Features

- **Dynamic Standing A-Pose & Breathing Animation**: Natural idle animations (hip sway, breathing cycle, and micro arm motions) to make the avatar feel alive.
- **Cursor Tracking**: Avatar turns her head and looks dynamically at your cursor.
- **Voice Recognition (Dictation)**: Smooth hands-free conversation using speech-to-text.
- **Real-Time Lip-Sync**: High-fidelity mouth movements synchronized with the speech audio playback.
- **AI Integrations**: Configure your own OpenAI or Google Gemini keys directly in the frontend modal.
- **Text-to-Speech**: Free Google TTS and premium OpenAI TTS options.
- **Local Assets & Robust Fallback**: Features offline-ready local VRM model rendering with automated CDN fallbacks if local files are missing.

---

## 🛠️ Setup & Running

### Prerequisites
- Python 3.10+
- Internet connection (first-time load only, for dependencies)

### Run the Application

Simply run the startup script:

**On Windows (PowerShell):**
```powershell
./run.ps1
```

Once started, open your browser and navigate to:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## ⚙️ Configuration

1. Click on the **Gear icon** in the top-right corner of the web page.
2. Select your preferred **AI Provider** (OpenAI / Gemini).
3. Insert your **API Key** (kept secure locally inside your browser's `localStorage`).
4. Select your **TTS Engine** and adjust visual settings (Camera FOV, Ambient Light).
5. Start talking or type your message to Aria!
