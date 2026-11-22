# Project PHOENIX — Autonomous AI Software Engineering Organization

> **Autonomous AI Software Engineering Organization for a Single Owner/Developer.**  
> Operates as a **Silent Standalone Windows Desktop Application (`PHOENIX.exe`)** with a **Top-Center Fluid Dynamic Notch / Island Voice Overlay**, backed by **Google Cloud Firestore**, an **OpenAI Agents SDK** multi-agent fleet, deterministic cryptographic policy engine, and a **Swappable Realistic Voice Engine** (J.A.R.V.I.S. British Butler Paul Bettany persona via Microsoft Edge Neural TTS, ElevenLabs, Google Cloud, or local engines).

---

## Key Highlights

* **Silent Standalone Windows Application (`PHOENIX.exe`):** Compiled with PyInstaller into a single, high-performance Windows GUI executable (`console=False`, `CREATE_NO_WINDOW`, zero terminal popups). In-process FastAPI Control Plane and Local Node daemon automatically start and stop silently. Vocalizes *"System online, Sir."* on launch.
* **Top-Center Fluid Dynamic Notch / Island Overlay:** Frameless, transparent, always-on-top overlay anchored at the top-center screen bezel (`WS_EX_TOOLWINDOW`, `HWND_TOPMOST`, `skipTaskbar: true`). Morphs smoothly from a compact 240×38 pill into an expanded 450×350 rounded dark island using `cubic-bezier(0.16, 1, 0.3, 1)` spring physics. Empty canvas areas support full click-through to background Windows apps. Easily collapsed via <kbd>Esc</kbd>, outside click, or right-click context menu.
* **React Bits `<Strands />` WebGL2 Orb:** Integrated directly inside the dynamic island, responding in real time to speech synthesis output volume (`level` via Web Audio API `AnalyserNode`) and microphone listening states.
* **Swappable Realistic Voice Matrix (`SwappableTTSManager`):**
  * **Microsoft Edge Neural (Default, 100% Free):** Studio-quality Microsoft Azure Neural voices (`en-GB-RyanNeural` J.A.R.V.I.S./Paul Bettany, `en-US-ChristopherNeural`, `en-US-JennyNeural`, `en-GB-SoniaNeural`) with zero API key requirement.
  * **ElevenLabs:** Free Tier (10k chars/mo) generative voice AI (`George`, `Adam`, `Rachel`, `Antoni`).
  * **Google Cloud TTS:** Free Tier (1M chars/mo; `Neural2-B`, `Journey-F`).
  * **OpenAI / Local Custom TTS:** Compatible with `tts-1` or self-hosted Kokoro/Piper/Whisper.
  * **Human Speech Sanitization:** Automatically strips raw markdown, code blocks, backticks, and math symbols to speak natural conversational English.
  * **3 Spoken Persona Tones:** *Calm & Concise* (Butler), *Conversational* (Human peer), and *Direct* (Executive brief) with 1-click test preview.
* **Google Cloud Firestore Database:** Real-time document snapshot listeners (`onSnapshot`) providing sub-second streaming updates across tasks, fleet metrics, and approvals without custom WebSocket plumbing. Features native Firestore Vector Search over architectural memory.
* **6 Production Views (Stitch Design Parity):** Command Center, Approvals, Agents, Projects, Settings, and Activity with the Graphite Engineering design system (`#111317` surface, `#adc6ff` primary).
* **React Bits `<HalftoneReveal />` Integration:** Interactive WebGL halftone shader canvas rendering workstation cluster and Docker runner architecture.
* **Zero-Trust Policy Engine:** Deterministic HMAC-SHA256 cryptographic approval tokens for all restricted operations (database schema migrations, production deployments, billable cloud provisioning).

---

## Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                        PROJECT OWNER (EXECUTIVE STAKEHOLDER)                      |
|      PHOENIX.exe Desktop App   |   Top Notch Dynamic Island   |   J.A.R.V.I.S. Voice  |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                            CLOUD CONTROL PLANE (FastAPI)                          |
|  Deterministic Policy Engine | Agents SDK (7 Roles) | Swappable TTS Voice Matrix  |
|  Google Cloud Firestore (Real-time onSnapshot) | Redis 7 Broker | Vector Search   |
+-----------------------------------------------------------------------------------+
                                          ^
                (Outbound Authenticated Reverse Tunnel - Zero Open Inbound Ports)
                                          |
+-----------------------------------------------------------------------------------+
|                       LOCAL EXECUTION NODE (Workstation)                          |
|  Python Execution Daemon | Docker Engine (Per-Project Sandboxes) | Git & GitHub CLI|
+-----------------------------------------------------------------------------------+
```

---

## Quick Start

### 1. Configure Environment
Copy `.env.example` to `.env` and configure your API keys:
```bash
copy .env.example .env
```

### 2. Build Frontend
```bash
cd apps/dashboard
npm install
npm run build
cd ../..
```

### 3. Build & Run Standalone Executable
Execute the automated build script:
```bash
build.bat
```
This produces `dist\PHOENIX.exe`. Double-click `PHOENIX.exe` to launch silently in the background with the top notch dynamic island and system tray!

---

## Detailed Specifications

* **[Stitch Screen References & Assets](docs/stitch_screens/)**
