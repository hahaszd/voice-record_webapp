# 🎯 Spark Capture - Detailed Features

**Complete feature breakdown for personal idea capture and learning notes**

---

## 🎤 Audio Capture Modes

### **1. Microphone Capture**
**Best for**: Personal thoughts, brainstorming, voice memos

**How it works**:
- Click the microphone icon
- Browser requests microphone permission (one-time)
- Speak your thoughts naturally
- Stop when done

**Perfect for**:
- 💭 Sudden ideas while working
- 🧠 Brainstorming sessions
- 📝 Voice journaling
- 🎯 Quick reminders to yourself

**Privacy**: Audio only captured when you explicitly click record

---

### **2. System Audio Capture**
**Best for**: YouTube videos, podcasts, online courses, audiobooks

**How it works**:
- Select "System" from audio source dropdown
- Browser asks: "What do you want to share?"
- Choose: Entire Screen, Application Window, or Browser Tab
- Audio from that source is captured

**Perfect for**:
- 📺 YouTube tutorials and lectures
- 🎧 Podcast key moments
- 📚 Online course notes (Coursera, Udemy)
- 🎵 Lyrics or spoken content from any video

**Technical note**: Due to browser security, you need to select the source each time. This protects your privacy—we can't capture audio without your explicit permission.

---

### **3. Both (Microphone + System Audio)**
**Best for**: Active learning, commentary while watching

**How it works**:
- Select "Both" from dropdown
- Grant both microphone and system audio permissions
- You can speak while system audio plays
- Both sources are captured simultaneously

**Perfect for**:
- 📖 Adding your thoughts while watching educational content
- 🎬 Reacting to videos you're researching
- 🎓 Active learning: "The video says X, but I think Y..."
- 💬 Commentary + source audio in one capture

**Example workflow**:
```
1. Playing YouTube video about React
2. Video: "Use hooks for state management"
3. You speak: "This is similar to Vue's composition API"
4. Result: Both the video audio + your commentary transcribed
```

---

## ⏱️ Capture Duration Options

### **Why 5-Minute Maximum?**

Spark Capture is designed for **idea snippets**, not long-form recording. Here's why:

**Benefits of short captures**:
- ⚡ Faster transcription (20-30 seconds vs. minutes)
- 🎯 Forces you to focus on key insights
- 📊 Easier to organize and search later
- 💰 Lower API costs = lower price for you

**If you need longer captures**: Use continuous mode (explained below)

---

### **Duration Presets**

#### **⏱️ 30 Seconds**
```
Perfect for: Flash of insight, quick quote
Example: "Just realized that feature X could solve problem Y"
Transcription time: ~15 seconds
```

#### **⏱️ 1 Minute**
```
Perfect for: Short video clips, brief explanations
Example: Capturing one key point from a YouTube video + your reaction
Transcription time: ~20 seconds
```

#### **⏱️ 5 Minutes** (Default, Recommended)
```
Perfect for: Most use cases
- Longer thoughts and ideas
- Multiple key points from a video
- Mini-lessons or tutorial segments

Transcription time: ~30 seconds
```

---

## 🔄 Continuous Capture Mode

### **Auto-Capture Toggle**

**What it does**: Automatically starts a new capture after the previous one completes

**Perfect for**:
- 📚 Hour-long online courses (auto-captures every 5 minutes)
- 🎧 Long podcasts (breaks it into digestible chunks)
- 💻 Extended work sessions (captures all your thoughts)

### **How it works**:

```
1. Turn on "Auto-Capture" toggle
2. Select duration (e.g., 5 minutes)
3. Click "Start Capturing"

Then:
  → Records for 5 minutes
  → Auto-stops and transcribes
  → Immediately starts new recording
  → Repeats until you stop

Result: Continuous capture broken into 5-minute chunks
```

### **Real-world example**:
```
Watching a 1-hour Coursera lecture:
- Turn on auto-capture (5 min)
- Let it run for the full hour
- Get 12 separate, searchable transcripts
- Each one represents 5 minutes of the lecture
- Easy to review specific sections later
```

---

## 📝 Transcription Features

### **AI-Powered Speech-to-Text**

**Technology**: Google Cloud Speech-to-Text API

**Accuracy**: 
- English: 90-95%
- Clear audio: Even higher
- Background noise: May reduce accuracy

**Speed**: 
- 30 seconds audio → ~15 seconds transcription
- 1 minute audio → ~20 seconds transcription  
- 5 minutes audio → ~30 seconds transcription

**What's transcribed**:
- ✅ Speech and spoken words
- ✅ Basic punctuation (periods, commas)
- ❌ Not yet: Speaker identification, timestamps

---

### **Editable Results**

**After transcription, you can**:
- ✏️ Fix any errors or misheard words
- 📝 Add additional notes or context
- 🔖 Highlight key points (coming soon)
- 🏷️ Add tags (coming soon)

**Your edits are saved locally** and won't be overwritten

---

### **Copy & Export**

#### **Manual Copy**
```
Click the copy button (top-right of text box)
→ Copies to clipboard
→ Paste anywhere (Notion, Google Docs, email)
```

#### **Auto-Copy** (Toggle)
```
Turn on auto-copy toggle
→ Automatically copies text after transcription
→ No need to click copy button
→ Just Cmd/Ctrl+V to paste immediately
```

**Pro tip**: Auto-copy is perfect when you're rapidly capturing multiple ideas and pasting them into a note-taking app.

---

## 🔔 Notifications

### **Transcription Complete Alerts**

**Problem solved**: You switch tabs while waiting for transcription, then forget to check back

**Solution**: Browser notification when transcription completes

### **How it works**:
```
1. Turn on notification toggle
2. Start capture and switch to another tab
3. When transcription completes:
   → Browser notification appears
   → Click notification to return to app
```

**Privacy**: Notification permission is optional. The app works fine without it.

---

## 📚 History Management

### **All Your Ideas, Organized**

**Features**:
- 🗂️ **Searchable**: Find any idea by keyword
- 📅 **Dated**: Know when you captured it
- 🔄 **Sortable**: Newest first, oldest first
- 🗑️ **Deletable**: Remove what you don't need

### **Storage**:
- 📍 **Local-only**: Saved in your browser (IndexedDB)
- 🔒 **Private**: Not sent to any server
- 💾 **Persistent**: Survives browser restarts
- ⚠️ **Careful**: Clearing browser data deletes history

### **Coming soon**:
- 🏷️ Tags and categories
- 📊 Export all history (JSON, CSV)
- ☁️ Optional cloud backup
- 🔗 Notion/Obsidian integration

---

## 🎨 User Experience Features

### **Smart Defaults**
```
✅ 5 minutes selected by default (covers 80% of use cases)
✅ Auto-copy ON (immediately ready to paste)
✅ Notifications ON (don't miss completions)
✅ Microphone mode (most common)
```

**You can change any of these**—they're just sensible starting points.

---

### **Keyboard Shortcuts** (Coming soon)
```
Space: Start/stop capture (when focused)
Cmd/Ctrl+K: Quick capture (global)
Cmd/Ctrl+H: Open history
Escape: Close modals
```

---

### **Visual Feedback**

**While recording**:
- 🟢 Blue button → Orange button (visual cue)
- ⏱️ Timer shows recording duration
- ❌ Cancel button appears

**While transcribing**:
- 🔄 "Capturing your idea..." spinner
- ⏳ Estimated time remaining (coming soon)

**After completion**:
- ✅ Text appears in text box
- 📋 Auto-copied (if enabled)
- 🔔 Notification (if enabled)

---

## 🔐 Privacy & Security Features

### **Local-First**
```
✅ Audio stored in YOUR browser (IndexedDB)
✅ Only uploaded to transcription API
✅ Deleted from API after transcription
✅ Never stored on our servers
```

### **Permission Controls**
```
🎤 Microphone: Requested only when needed
🔊 System Audio: Requested only when selected
📋 Clipboard: Requested only for auto-copy
🔔 Notifications: Requested only if you turn on toggle
```

**You can revoke any permission** through browser settings.

---

### **No Account Required** (Currently)

**Privacy benefits**:
- ✅ No email collection
- ✅ No password to remember
- ✅ No user tracking
- ✅ No data linked to your identity

**Trade-off**: 
- History is local-only (not synced across devices)
- Clearing browser data = losing history

**Future option**: Optional account for cloud sync (fully encrypted)

---

## 🚀 Performance Optimizations

### **Memory Management**
```
Problem: Long recordings can crash browser
Solution: Auto-cleanup of old audio chunks
Result: Stable even during hour-long sessions
```

### **Audio Compression**
```
Problem: Large audio files = slow upload = slow transcription
Solution: Automatic compression (16kHz, mono)
Result: Smaller files, faster transcription, no quality loss for speech
```

### **Instant Feedback**
```
✅ Recording starts instantly (no delay)
✅ Timer updates every second
✅ UI remains responsive during transcription
✅ No "freezing" or "hanging"
```

---

## 🌐 Browser Compatibility

### **Fully Supported** ✅
```
Chrome 90+
Edge 90+
Brave (Chromium-based)
```

### **Mostly Supported** ⚠️
```
Firefox 88+
- System audio has limitations
- Works great for microphone capture
```

### **Limited Support** ⚠️⚠️
```
Safari 14+
- System audio not supported
- Microphone capture works
- Mobile Safari has restrictions
```

### **Not Supported** ❌
```
Internet Explorer
Older browser versions
```

**Recommendation**: Use Chrome or Edge for best experience

---

## 📱 Mobile Support (Coming Soon)

**Current status**: Web app works on mobile, but limited

**Limitations**:
- No system audio (iOS/Android restriction)
- Background recording not reliable
- UI not optimized for small screens

**Coming soon**:
- 📱 Native iOS app
- 🤖 Native Android app
- 🎤 One-tap quick capture
- 🔄 Auto-sync with web version

---

## 🎯 What's Next?

See our [Roadmap](README.md#-roadmap) for upcoming features.

**Most requested**:
1. AI summaries (extract key points automatically)
2. Tags and organization
3. Export to Notion/Obsidian
4. Mobile apps

**Vote on features**: [Feature Voting Board] (coming soon)

---

## 📞 Need Help?

- 📖 [User Guide](README.md#-user-guide)
- 💡 [Use Cases](USE_CASES.md)
- 🔒 [Privacy Details](PRIVACY.md)
- 🐛 [Report a Bug](https://github.com/...)
- 💬 [Join Discord](https://discord.gg/...)

---

**Last Updated**: 2026-01-30  
**Version**: 1.0
