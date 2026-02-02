# 🔒 VoiceSpark - Privacy & Security

**Your data, your control. Always.**

---

## 🎯 Privacy Promise

**TL;DR**: 
- ✅ Your audio stays on YOUR device
- ✅ Only uploaded for transcription, then deleted
- ✅ No tracking, no analytics, no data mining
- ✅ You control all permissions
- ✅ No account required = no personal data collected

---

## 📊 What Data We Collect (Spoiler: Almost Nothing)

### **Data We DO Collect**

**1. Audio (temporarily, for transcription only)**
```
What: Audio recordings you explicitly capture
Where: Your browser (IndexedDB) → API server (temporarily)
How long: Deleted immediately after transcription
Purpose: Convert speech to text
```

**2. Transcription text (local only)**
```
What: The text result from transcription
Where: Your browser's local storage only
How long: Until you delete it or clear browser data
Purpose: Display your captured ideas
```

**3. Technical logs (anonymous)**
```
What: Error messages, API response times
Where: Server logs (no personal identifiers)
How long: 7 days
Purpose: Debug issues, improve performance
```

---

### **Data We DO NOT Collect**

❌ **No Personal Information**
```
No email addresses
No names
No phone numbers
No payment info (we're free!)
No location data
```

❌ **No Tracking**
```
No Google Analytics
No Facebook Pixel
No tracking cookies
No user fingerprinting
No behavioral data
```

❌ **No Audio Storage**
```
Audio is NOT saved on our servers
Audio is NOT stored long-term
Audio is NOT used for training AI models
Audio is NOT shared with third parties
```

---

## 🔐 How Your Data Flows

### **Step-by-Step Data Journey**

```
YOU → Click "Start Capturing"
  ↓
YOUR BROWSER → Records audio, stores in IndexedDB (local)
  ↓
YOU → Click "Stop" or auto-stop after duration
  ↓
YOUR BROWSER → Uploads audio to our server
  ↓
OUR SERVER → Sends audio to Google Cloud Speech-to-Text API
  ↓
GOOGLE API → Transcribes audio, returns text
  ↓
OUR SERVER → Receives text, sends to your browser, DELETES AUDIO
  ↓
YOUR BROWSER → Displays text, saves in local storage
  ↓
DONE → Audio is gone forever, only text remains (in YOUR browser)
```

---

## 🛡️ Security Measures

### **1. HTTPS Everywhere**
```
✅ All communication encrypted in transit
✅ No one can intercept your audio
✅ Required for microphone/system audio access
```

### **2. No Cloud Storage**
```
✅ Your captures never stored on our servers
✅ We can't access your history
✅ No database of user content
```

### **3. Local-First Architecture**
```
✅ All data stored in YOUR browser (IndexedDB)
✅ Only you can access your history
✅ Clearing browser data = data gone
```

### **4. Minimal Data Transmission**
```
✅ Only audio sent to server (for transcription)
✅ Audio deleted immediately after
✅ Text never sent back to server
```

---

## 🔑 Permissions Explained

### **What Permissions We Request & Why**

#### **🎤 Microphone Access**
```
When: When you select "Microphone" mode
Why: To capture your voice
Scope: Only when you click "Start Capturing"
Control: Revoke anytime in browser settings
```

**Browser prompt**: "spark-capture.com wants to use your microphone"  
**What we do**: Record audio only when button is clicked  
**What we don't do**: Background recording, always-on listening (despite the name!)

---

#### **🔊 System Audio Access (Screen/Tab Capture)**
```
When: When you select "System" or "Both" mode
Why: To capture audio from YouTube, podcasts, etc.
Scope: Only the tab/window you explicitly select
Control: Stop sharing anytime, revoke in browser settings
```

**Browser prompt**: "spark-capture.com wants to share your screen/tab"  
**What we capture**: Only audio from selected source, NO video  
**What we don't do**: Record your screen visually, access other tabs

**Technical note**: We use `getUserMedia({audio: true, video: false})` - only audio, never video.

---

#### **📋 Clipboard Access**
```
When: When you enable "Auto-Copy" toggle
Why: To automatically copy transcription to clipboard
Scope: Only when transcription completes
Control: Disable "Auto-Copy" toggle to revoke
```

**What we do**: Copy text YOU explicitly captured  
**What we don't do**: Read what's already in your clipboard, copy random data

---

#### **🔔 Notification Access**
```
When: When you enable notification toggle
Why: Alert you when transcription completes (if you switch tabs)
Scope: Only for transcription completion
Control: Disable in browser settings
```

**What we send**: "Your idea has been captured!" notification  
**What we don't send**: Spam, ads, random alerts

---

## 🌐 Third-Party Services

### **Google Cloud Speech-to-Text API**

**What they receive**: Audio files we send for transcription  
**What they do**: Convert speech to text, return result  
**What they don't do**: Store audio long-term, use for training (per their enterprise agreement)

**Their privacy policy**: https://cloud.google.com/speech-to-text/docs/data-logging

**Our contract with Google**:
- Audio is NOT logged
- Audio is NOT used for model training
- Audio is processed and immediately discarded
- Subject to Google's privacy commitments

---

## 🚫 What We'll NEVER Do

### **Promises**

❌ **Never sell your data**  
```
We're not a data company. We're a tool.
Your ideas are yours, not a product.
```

❌ **Never train AI models on your audio**  
```
Your voice recordings are NOT used to improve our AI
They're transcribed and immediately deleted
```

❌ **Never share with advertisers**  
```
No ads, no ad networks, no data brokers
We don't even know who you are!
```

❌ **Never require an account** (currently)  
```
No email = no data to breach
No password = no password to leak
Simple.
```

❌ **Never log personally identifiable information**  
```
Our server logs show: "A user transcribed 5 min audio"
NOT: "john@email.com transcribed audio about..."
```

---

## 🛠️ Your Privacy Controls

### **How to Maximize Privacy**

#### **1. Revoke Permissions**
```
Chrome: Settings → Privacy → Site Settings → Permissions
→ Find spark-capture.com
→ Block microphone, camera, notifications
```

#### **2. Clear Local Data**
```
Browser: Settings → Privacy → Clear browsing data
→ Select "Cookies and site data"
→ Choose spark-capture.com
→ Clears all your history (be careful!)
```

#### **3. Use Incognito Mode**
```
Captures work normally
History not saved after closing
Permissions reset each session
(Less convenient, but more private)
```

#### **4. Disable Auto-Copy**
```
Turn off auto-copy toggle
Manually click copy only when needed
Reduces clipboard access
```

---

## 🔍 Transparency

### **What We Can See (Server Logs)**

```json
{
  "timestamp": "2026-01-30T10:30:00Z",
  "event": "transcription_request",
  "audio_duration": 300,
  "audio_size_mb": 2.4,
  "response_time_ms": 2800,
  "status": "success"
}
```

**What this tells us**: Someone transcribed 5 minutes of audio  
**What this doesn't tell us**: Who, what they said, why, or anything personal

---

### **What We CANNOT See**

❌ Your name, email, or identity  
❌ Your transcription text content  
❌ Your capture history  
❌ What videos/podcasts you captured  
❌ Your location  
❌ Your browsing habits  

**Why?** Because we don't collect it in the first place.

---

## 🌍 Data Location & Compliance

### **Where is Data Processed?**

**Your browser (local)**:
- Location: Your device
- Jurisdiction: Where you are
- Control: 100% you

**Our server (API proxy)**:
- Location: [Your server location, e.g., US East]
- Duration: Seconds (during transcription only)
- Purpose: Route audio to Google API

**Google Cloud (transcription)**:
- Location: [Your chosen region, e.g., US or EU]
- Duration: Momentary (real-time processing)
- Compliance: Google Cloud compliance certifications

---

### **GDPR Compliance (EU Users)**

**Your Rights**:
- ✅ **Right to access**: You have all your data (it's in your browser)
- ✅ **Right to deletion**: Clear browser data or click "Delete" in history
- ✅ **Right to portability**: Export history (coming soon)
- ✅ **Right to be forgotten**: We don't know who you are, so you're already forgotten!

**Data Processing**:
- Audio is processed temporarily for transcription
- No long-term storage
- No profiling or automated decision-making

---

### **CCPA Compliance (California Users)**

**Do Not Sell My Personal Information**:
- ✅ We don't sell personal information
- ✅ We don't have personal information to sell
- ✅ No opt-out needed—it's our default

---

## 🔐 In Case of Security Incident

### **Our Response Plan**

**If we discover a data breach**:
```
1. Identify what data was affected
2. Notify users via website banner (no email, since we don't have them!)
3. Publish incident report publicly
4. Explain what happened and what we're doing
```

**Good news**: 
- Since we don't store your data, there's nothing to breach
- Your history is local—only you can access it
- Audio is deleted immediately—nothing to leak

---

## 🔮 Future Privacy Considerations

### **If We Add User Accounts (Optional)**

**What would change**:
- Email collection (for login only)
- Optional cloud sync (encrypted)
- Password (hashed, never plain text)

**What wouldn't change**:
- Audio still deleted immediately
- No tracking or analytics
- Local-first still default
- Account remains optional

**Your choice**: Use account for cloud sync, or stay local-only forever.

---

## 🤝 Trust & Transparency

### **Our Philosophy**

```
"Privacy is not a feature—it's a principle."
```

**Why we care**:
- We build tools we ourselves want to use
- We hate invasive data collection too
- Your ideas are yours, not commodities
- Simple is better than complex (and more secure)

---

### **Open Source Consideration**

**Considering**: Open-sourcing the entire codebase  
**Why**: Ultimate transparency—you can verify everything  
**When**: After initial launch and stabilization

**Want this?** Let us know!

---

## 📞 Privacy Questions?

### **Contact Us**

- 📧 **Email**: privacy@spark-capture.com
- 🔒 **Security issue**: security@spark-capture.com
- 💬 **General questions**: [Discord](#) or [Twitter](#)

**Response time**: Within 48 hours

---

## 📜 Privacy Policy Summary

**Last Updated**: 2026-01-30

### **Quick Facts**

| Question | Answer |
|----------|--------|
| **Do you collect personal data?** | No account = no personal data |
| **Is my audio stored?** | Only temporarily, deleted after transcription |
| **Is my text stored?** | Yes, in YOUR browser (local storage) |
| **Do you track me?** | No analytics, no tracking |
| **Do you sell data?** | Never. We're not a data business. |
| **Can I delete everything?** | Yes, clear browser data anytime |
| **Is it encrypted?** | Yes, HTTPS everywhere |
| **GDPR compliant?** | Yes, minimal data = minimal risk |
| **Who can see my ideas?** | Only you (unless you share them) |
| **Can you recover deleted history?** | No, it's gone forever (truly deleted) |

---

## ✅ Privacy Checklist

**We pledge to**:

- [x] Never store audio long-term
- [x] Never sell user data
- [x] Never use audio for AI training
- [x] Never track users
- [x] Always delete audio after transcription
- [x] Always be transparent about data practices
- [x] Always respect user permissions
- [x] Always prioritize privacy over profit

---

## 🎯 Questions? Concerns?

If anything in this document is unclear, or if you have privacy concerns, please reach out. We're happy to explain anything in more detail.

**Your privacy is not negotiable.**

---

**Version**: 1.0  
**Effective Date**: 2026-01-30  
**Last Reviewed**: 2026-01-30

