# ✨ VoiceSpark

**Your always-on companion for capturing ideas, learning notes, and moments of inspiration**

Never miss a spark of insight again. Whether you're watching YouTube, listening to a podcast, brainstorming ideas, or having a sudden moment of inspiration—VoiceSpark is always ready to turn your thoughts and audio into searchable, editable text.

---

## 🎯 What is VoiceSpark?

VoiceSpark is a lightweight, web-based tool designed for **personal idea capture** and **learning note-taking**. Unlike heavy meeting recorders, we focus on:

- **5-Minute Snippets**: Quick captures for ideas, not hour-long meetings
- **Always-On Listening**: Open your browser, and we're ready—no bot, no setup
- **System Audio**: Capture YouTube videos, podcasts, online courses—anything you're listening to
- **Your Voice + Your Thoughts**: Record what you hear, plus add your own commentary
- **Instant Text**: Everything becomes searchable, editable text

---

## 💡 Perfect For

### 🎓 **Learners & Students**
```
Watching online courses? YouTube tutorials?
→ Capture key moments + your notes
→ Review later without rewatching
```

### ✍️ **Content Creators**
```
Researching competitors? Getting inspired?
→ Capture quotes + your reactions
→ Build your content library
```

### 🧠 **Thinkers & Writers**
```
Sudden idea while working?
→ Speak it out, we'll save it
→ Never lose a thought again
```

### 📚 **Knowledge Managers**
```
Building your Second Brain?
→ Voice is faster than typing
→ 5-minute snippets, organized
```

---

## ✨ Core Features

### 🎤 **Flexible Audio Capture**
- **Your Voice**: Capture your thoughts and ideas
- **System Audio**: Record YouTube, podcasts, online courses, any audio playing on your computer
- **Both**: Commentary while watching—perfect for learning notes

### ⚡ **Quick & Focused**
- **30 seconds, 1 minute, or 5 minutes**: Perfect for idea snippets
- **No long meetings**: Optimized for quick captures, not hour-long recordings
- **Continuous mode**: Auto-capture in learning sessions

### 📝 **Instant Transcription**
- **AI-Powered**: Speech-to-text in 20-30 seconds
- **Editable**: Fix errors, add notes, refine ideas
- **Searchable History**: Find any idea instantly

### 🔄 **Smart Workflow**
- **Auto-Copy**: Paste your ideas anywhere immediately
- **Browser Notifications**: Get notified when capture completes
- **History Management**: All your ideas, organized and searchable

---

## 🚀 How It Works

### **Quick Start (30 seconds)**

1. **Open** → Visit the website in your browser
2. **Allow** → Grant microphone permission
3. **Capture** → Click the button, speak or play audio
4. **Done** → Get instant text, edit if needed

### **Example Use Cases**

#### **📺 YouTube Learning**
```
1. Open VoiceSpark in one tab
2. Play YouTube video in another tab
3. Select "System Audio" mode
4. Hit capture when something insightful is said
5. Add your commentary if you want
6. Get text transcript + your thoughts
```

#### **💭 Idea Capture**
```
1. Keep VoiceSpark open while working
2. When inspiration strikes, hit the button
3. Speak your idea (30 seconds)
4. Done—it's saved and searchable
```

#### **🎧 Podcast Notes**
```
1. Set to 5-minute duration + turn on Auto-Capture
2. Listen to the podcast while VoiceSpark runs
3. Hit stop at each key moment — it transcribes the last 5 min and re-arms instantly
4. Review all snippets later
```

---

## 🛠️ Technology

### **Frontend**
- **Pure Web**: No installation, works in any modern browser
- **Web Audio API**: Capture microphone + system audio
- **IndexedDB**: Local storage for privacy
- **Progressive Web App**: Install as desktop app (optional)

### **Backend**
- **FastAPI**: Lightweight Python server
- **AI Transcription**: Google Speech-to-Text API
- **Privacy-First**: Audio uploaded only for transcription, never stored

### **Key Technologies**
```
- HTML/CSS/JavaScript (no frameworks)
- Web Audio API (audio capture)
- MediaRecorder API (recording)
- IndexedDB (local storage)
- Notification API (alerts)
```

---

## 📦 Installation & Setup

### **For Users (Simple)**

**Just visit the website—that's it!**

No installation needed. Works in:
- ✅ Chrome/Edge (best experience)
- ✅ Firefox
- ⚠️ Safari (limited system audio support)

### **For Developers (Self-Hosting)**

#### **Requirements**
- Python 3.8+
- Modern browser
- HTTPS or localhost

#### **Quick Setup**
```bash
# 1. Clone the repository
git clone <repository-url>
cd "Cursor voice record web"

# 2. Install dependencies
pip install fastapi uvicorn python-multipart requests

# 3. Run server
python server2.py

# 4. Open browser
# Visit: http://localhost:8000
```

---

## 🎮 User Guide

### **Choosing Audio Source**

**🎤 Microphone** (default)
```
Use for: Your thoughts, ideas, brainstorming
Perfect for: Quick voice notes, idea capture
```

**🔊 System Audio**
```
Use for: YouTube, podcasts, online courses
Perfect for: Learning notes, content research
Note: Browser will ask you to select audio source
```

**🎤+🔊 Both**
```
Use for: Commentary while watching videos
Perfect for: Active learning, research with notes
```

### **Choosing Duration**

**⏱️ 30 seconds**
```
Quick thoughts, sudden ideas
"Just had an insight..."
```

**⏱️ 1 minute**
```
Short explanations, quotes + commentary
"This video said X, and I think Y..."
```

**⏱️ 5 minutes** (recommended)
```
Learning snippets, podcast notes
Perfect default for most use cases
```

> **How the buttons work:** they don't set a recording length — recording runs until *you* press stop.
> The button chooses how much of the **tail** to keep when you stop: recorded less than the selected
> duration → you keep everything; recorded more → only the **last N seconds** are transcribed.

### **Continuous Capture Mode**

**🔄 Auto-Capture Toggle**
```
Turn on for learning sessions
After each stop, it transcribes and instantly re-arms the next recording
— you press stop to end each segment; it never auto-cuts on a timer
Great for courses, podcasts, long videos
```

---

## 📊 Project Structure

```
voice-record_webapp/
├── server2.py                  # FastAPI backend (the real app; app = ASGI entry)
├── api_fallback.py             # Transcription fallback engine (priority/quota/retry)
├── logging_helper.py           # TranscriptionLogger + audio-format helpers
├── static/
│   ├── index.html             # Main interface
│   ├── style.css              # Styling
│   ├── script.js              # Core frontend logic (recording, VAD, upload, history)
│   └── audio-storage.js       # Local audio storage (IndexedDB)
├── tests/                      # Playwright suite (smoke / functional / mobile)
├── requirements.txt
├── Dockerfile / railway.json   # Deployment
├── README.md                   # This file
├── FEATURES.md                 # Detailed features
├── ARCHITECTURE.md             # Architecture & deploy flow
└── *.md                        # ~160 historical change-logs at repo root (reference only)
```

---

## 🔒 Privacy & Security

### **Your Data is Safe**

✅ **Local Storage**: Audio stored only in your browser (IndexedDB)  
✅ **No Cloud Storage**: Audio never saved on our servers  
✅ **Transcription Only**: Audio uploaded only for text conversion  
✅ **No Tracking**: No analytics, no user tracking  
✅ **Transparent Permissions**: You control what we access  

### **What We Access**

- **Microphone**: Only when you click record
- **System Audio**: Only when you select it
- **Clipboard**: Only when auto-copy is enabled
- **Notifications**: Only if you allow them

You can revoke any permission anytime through browser settings.

---

## 🎯 Roadmap

### **Now (v1.0 - Current)**
- ✅ Basic voice & system audio capture
- ✅ AI transcription
- ✅ Editable results
- ✅ History management

### **Next (v1.5 - Coming Soon)**
- 🔜 AI summaries (key points extraction)
- 🔜 Speaker identification
- 🔜 Tags and organization
- 🔜 Export to Notion/Obsidian
- 🔜 Mobile app (iOS/Android)

### **Future (v2.0+)**
- 💡 Video timestamps (for YouTube captures)
- 💡 Chrome extension (sidebar integration)
- 💡 Highlights and bookmarks
- 💡 Multi-language support
- 💡 Team sharing (optional)

---

## 🤝 Contributing

This is a small, indie project focused on simplicity. If you have ideas or find bugs, feel free to:

- 🐛 **Report bugs**: Open an issue
- 💡 **Suggest features**: Start a discussion
- 🔧 **Submit PRs**: Small improvements welcome

---

## 📄 License

MIT License - Free for personal and commercial use

---

## 👤 About

**VoiceSpark** is built by an indie developer who believes:

- Ideas shouldn't be lost because you didn't have a pen
- Learning should be active, not passive
- Tools should be simple, not overwhelming
- Privacy matters

This is a **small & beautiful** product, not a billion-dollar startup. It's designed for individuals who value their thoughts and want a simple way to capture them.

---

## 🙏 Acknowledgments

- **Google Cloud** - Speech-to-Text API
- **FastAPI** - Excellent Python framework
- **The PKM Community** - Inspiration and feedback

---

## 📞 Contact & Support

- 🌐 **Website**: [Your Website URL]
- 📧 **Email**: [Your Email]
- 💬 **Discord**: [Your Discord Server]
- 🐦 **Twitter**: [@YourHandle]

---

**Version**: v1.0  
**Last Updated**: 2026-07-21  
**Status**: Live & Actively Maintained ✨

---

### ⭐ If VoiceSpark helps you capture your best ideas, please star this project!

