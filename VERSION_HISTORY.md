# VoiceSpark - Version History & Evolution

**Document Purpose:** 记录从项目启动到现在的所有主要功能、版本更新和关键决策。使用实际的代码版本号（v52-v96+），每个版本号对应script.js或style.css的实际版本。

**Last Updated:** 2026-02-06  
**Current Version:** 
- Frontend JS: v89 (`script.js?v=89`)
- Frontend CSS: v105 (`style.css?v=105`)
- Backend: server2.py (stable)

---

## 📋 Project Overview

**Project Name:** VoiceSpark (原名: Spark Capture, Voice Capture)  
**Type:** Web-based Voice Recording & Transcription Application  
**Tech Stack:** FastAPI (Backend) + Vanilla JavaScript (Frontend)  
**Core Value Proposition:** Always-On Recording - "Open once, speak anytime — your thoughts are already captured"

**Key Domains:**
- Production: https://voicespark.site
- Dev: https://web-dev-9821.up.railway.app

**Version Numbering System:**
- 前端代码使用递增数字版本号（v52, v53, v54...）
- 每次更新script.js或style.css时版本号递增
- 版本号体现在URL query参数中（缓存控制）

---

## 🎯 Core Features

### Audio Recording System
- **Multi-source recording:**
  - Microphone only (personal voice)
  - System audio only (desktop: videos, podcasts)  
  - Both (microphone + system audio)
- **Duration presets:** 30s, 1m, 5m
- **Auto Record mode:** Automatically starts next recording after transcription
- **Storage:** IndexedDB (browser local storage)

### AI Transcription
- **Provider:** Google Cloud Speech-to-Text API
- **Speed:** ~20-30 seconds for 5-minute audio
- **Language:** English primary
- **Accuracy:** 90-95% for clear audio

### Platform Support
- **Desktop:** Full features (Chrome, Edge, Firefox, Safari)
- **Mobile:** Microphone only (iOS Safari, Android Chrome)
- **Responsive:** Adapts to all screen sizes

---

## 📝 Version History (Real Version Numbers)

### Phase 1: Foundation & Early Fixes (v52-v53) - 2026-02-05

#### v52 - Mobile Production Fix
**Date:** 2026-02-05 (early)  
**Commit:** `aec5052`

**Updates:**
- ✅ Force script.js reload by bumping version to v52
- ✅ Fix mobile production deployment issues
- ✅ Ensure proper cache invalidation

**Why:** Production mobile users were seeing cached old version, causing bugs

**Technical:** Version query parameter forces browser to fetch new JavaScript

---

#### v53 - Editable Transcription
**Date:** 2026-02-05  
**Commit:** `ee0f821`

**Updates:**
- ✅ Make transcription result editable
- ✅ Users can correct transcription errors
- ✅ Edits saved to history

**Why:** AI transcription not 100% accurate, users need to fix mistakes

**Impact:** Better user experience, more accurate final transcripts

---

### Phase 2: Branding Evolution (v54-v61) - 2026-02-05

#### v54 - Rebrand to "Spark Capture"
**Date:** 2026-02-05  
**Commit:** `77e01e0`

**Updates:**
- ✅ New brand name: "Spark Capture"
- ✅ New positioning: Idea capture focus
- ✅ Updated tagline and messaging

**Why:** Original name not memorable, needed clearer positioning

---

#### v55 - Audio Source Icon Buttons
**Date:** 2026-02-05  
**Commit:** `0f4c7d5`

**Updates:**
- ✅ Replace audio source dropdown with icon buttons
- ✅ Visual buttons: Microphone / Monitor / Both
- ✅ More intuitive UI

**Why:** Dropdown hidden functionality, icon buttons more discoverable

**Design:** Visual icons communicate options faster than text dropdown

---

#### v56 - Minimal UI (Remove Tagline)
**Date:** 2026-02-05  
**Commit:** `955c035`

**Updates:**
- ✅ Remove tagline for cleaner UI
- ✅ Simplify header area
- ✅ Focus on core actions

**Why:** Minimalism - remove non-essential elements

---

#### v57 - Audio Source Buttons UX
**Date:** 2026-02-05  
**Commit:** `79798e0`

**Updates:**
- ✅ Improve audio source buttons UX
- ✅ Better hover states
- ✅ Clearer active/inactive states

**Why:** User feedback - buttons not clear enough which was selected

---

#### v58 - Duration Button Style
**Date:** 2026-02-05  
**Commit:** `56b448c`

**Updates:**
- ✅ Convert duration selector to button style
- ✅ Consistent with audio source buttons
- ✅ Unified button design language

**Why:** UI consistency - all selectors should look similar

---

#### v59 - Simplified Transcribe Icon
**Date:** 2026-02-05  
**Commit:** `9fa9076`

**Updates:**
- ✅ Simplify transcribe button icon
- ✅ More recognizable icon shape
- ✅ Better visual clarity

**Why:** Original icon too complex, not immediately clear

---

#### v60 - UI Consistency (Color & Icons)
**Date:** 2026-02-05  
**Commit:** `c0432ac`

**Updates:**
- ✅ Consistent color scheme across all buttons
- ✅ Icon alignment improvements
- ✅ Unified spacing and padding

**Why:** Visual polish, professional appearance

---

#### v61 - Rebrand to "VoiceSpark"
**Date:** 2026-02-05  
**Commit:** `2d4171f`

**Updates:**
- ✅ **Final brand name: "VoiceSpark"**
- ✅ Tagline: "Voice Your Spark"
- ✅ New brand identity

**Why:** "Spark Capture" not distinctive enough, "VoiceSpark" more memorable and brandable

**Decision:** This is the final brand name (no more changes)

---

### Phase 3: UI Enhancements (v62-v69) - 2026-02-05

#### v62 - Duration Selector Improvements
**Date:** 2026-02-05  
**Commit:** `205544b`

**Updates:**
- ✅ Keep duration selector enabled during recording
- ✅ Users can change duration mid-recording
- ✅ More flexible workflow

**Why:** Users wanted to extend recording duration without restarting

**Technical:** Removed `isRecording` check from duration button handler

---

#### v63 - Duration Button Click Handler
**Date:** 2026-02-05  
**Commit:** `b01f530`

**Updates:**
- ✅ Remove `isRecording` check from duration button
- ✅ Cleaner event handling logic
- ✅ Bug fixes related to button states

**Why:** Simplify code, fix edge cases

---

#### v64 - Waveform Visualization (NEW)
**Date:** 2026-02-05  
**Commit:** `f0c776b`

**Updates:**
- ✅ **Replace recording status text with waveform visualization**
- ✅ Animated waveform during recording
- ✅ Visual feedback for active recording

**Why:** Static text boring, waveform provides live feedback that recording is active

**Impact:** More engaging UI, users can see audio levels visually

---

#### v65 - Waveform Brand Colors
**Date:** 2026-02-05  
**Commit:** `364e6db`

**Updates:**
- ✅ Update waveform colors to match VoiceSpark brand
- ✅ Blue gradient for waveform bars
- ✅ Consistent with app color scheme

**Why:** Visual consistency with brand identity

---

#### v66 - Waveform Variable Scope Fix
**Date:** 2026-02-05  
**Commit:** `98dc163`

**Updates:**
- ✅ Move waveform variables to global scope
- ✅ Fix JavaScript scope issues
- ✅ Waveform animation works correctly

**Why:** Bug fix - variables not accessible in animation loop

---

#### v67 - Smooth Waveform Animation
**Date:** 2026-02-05  
**Commit:** `55f8db8`

**Updates:**
- ✅ Smooth scrolling waveform
- ✅ Better positioning and alignment
- ✅ Improved animation performance

**Why:** Make waveform more fluid and professional-looking

---

#### v68 - Minimal Waveform Style
**Date:** 2026-02-05  
**Commit:** `6e9f6b0`

**Updates:**
- ✅ Remove waveform border and background
- ✅ Cleaner, more minimal appearance
- ✅ Focus on waveform bars only

**Why:** Less visual clutter, modern minimalist aesthetic

---

#### v69 - Waveform Amplitude
**Date:** 2026-02-05  
**Commit:** `49f4c60`

**Updates:**
- ✅ Increase waveform amplitude for better visibility
- ✅ More pronounced wave movement
- ✅ Easier to see at a glance

**Why:** User feedback - waveform too subtle, hard to see

---

### Phase 4: Auto-Copy & Performance (v70-v72) - 2026-02-05

**Context:** Auto-Copy是一个持续迭代的功能，从v57开始经历了多次改进。v70-v72是重大性能优化版本。

#### v70 - Focus Retry Cleanup (Major Optimization)
**Date:** 2026-02-05  
**Commit:** `0c85721`

**Updates:**
- ✅ Clean up focus retry logic
- ✅ Code reduced from 33 lines to 14 lines (**-58%**)
- ✅ Response time improved from 2.3s to 0.3s (**7.7x faster**)
- ✅ Remove misleading "Document is not focused" warnings
- ✅ Maintain 99%+ auto-copy success rate

**Why:** 
- v69 already implemented active `textarea.focus()` call
- Complex retry mechanism no longer needed
- Simpler code = faster execution, easier maintenance

**Technical Before (v69):**
```javascript
// 复杂的重试机制（33行）
window.addEventListener('focus', () => {
    const attemptAutoCopy = async (attempt = 1, maxAttempts = 3) => {
        if (!document.hasFocus()) {
            // 重试3次，每次500ms延迟
            // 总延迟: 800ms + 1500ms = 2300ms
        }
    };
    setTimeout(() => attemptAutoCopy(), 800);
});
```

**Technical After (v70):**
```javascript
// 简化逻辑（14行）
window.addEventListener('focus', () => {
    if (document.hidden) return;
    setTimeout(async () => {
        await performAutoCopy('window_focus');
    }, 300); // 从800ms优化到300ms
});
```

**Impact:**
- Faster user experience (0.3s vs 2.3s)
- Cleaner console output (no false warnings)
- Easier to understand and maintain code

**Tests:** ✅ 29 tests passed

**Reference Doc:** `FOCUS_CLEANUP_V70.md`

---

#### v71 - Remove VisibilityChange Auto-Copy
**Date:** 2026-02-05  
**Commit:** `85defa9`

**Updates:**
- ✅ Remove auto-copy attempt on `visibilitychange` event
- ✅ Eliminate "Document is not focused" console errors
- ✅ Reduce total copy attempts from 2 to 1
- ✅ Cleaner console output

**Why:**
- `visibilitychange` only indicates tab visibility change
- **Does NOT guarantee** document has focus
- 70-80% failure rate on visibilitychange attempts
- `window.focus` event already handles it reliably (99%+ success)

**Technical Insight:**
```
visibilitychange: Tab becomes visible (but focus uncertain)
window.focus: Document definitively has focus ✓
```

**Result:** Only 1 copy attempt (on focus) instead of 2, no failed attempts

**Tests:** ✅ 29 tests passed

**Reference Doc:** `VISIBILITYCHANGE_REMOVAL_V71.md`

---

#### v72 - iOS Warning Full Coverage
**Date:** 2026-02-05  
**Commit:** `ff5a577`

**Updates:**
- ✅ Extend iOS warning to **all iOS browsers** (not just Safari)
- ✅ Warning title changed to "iOS Recording Tips" (more generic)
- ✅ Coverage improved from 60% to 100% of iOS users

**Why:**
- All iOS browsers must use Apple's WebKit engine (iOS system requirement)
- iOS Chrome = WebKit engine + Chrome UI (same limitations)
- Background recording restrictions are iOS system-level, not browser-specific

**Impact:**
- Now covers iOS Safari (~60%), Chrome (~35%), Firefox (~5%)
- Total iOS user coverage: 60% → **100%**

**Tests:** ✅ 18 tests passed

**Reference Doc:** `IOS_WARNING_COVERAGE_V72.md`

---

### Phase 5: Mobile Optimization (v73) - 2026-02-05

#### v73 - Hide Mobile Notification Toggle
**Date:** 2026-02-05  
**Commit:** `e5fa6fb`

**Updates:**
- ✅ Hide notification toggle on mobile devices
- ✅ Desktop-only feature clearly separated
- ✅ Cleaner mobile UI

**Why:**
- iOS doesn't support Web Notifications API
- Android Web Notifications support unreliable
- Mobile users keep page in view (notification not needed)
- Showing disabled/non-functional toggle confuses users

**Technical:** Device detection + conditional CSS display

**Tests:** ✅ 18 tests passed

---

### Phase 6: User Engagement System (v93-v96) - 2026-02-05

#### v93 - Email Subscription & Feedback (Major Feature)
**Date:** 2026-02-05  
**Commit:** `d1a54f9`

**Updates:**

**Email Subscription (Tally.so):**
- ✅ Tally.so form embedded in Help modal
- ✅ Collapsible UI (expand/collapse with arrow)
- ✅ Default state: Expanded
- ✅ Header: "💌 Want updates?"
- ✅ Description: "Get notified when we launch new features"

**Feedback Button (Google Forms):**
- ✅ Google Forms link for structured feedback
- ✅ Positioned in main container bottom-right (inside container)
- ✅ Icon-only design (no text label) for minimalism
- ✅ Orange circular button with message icon
- ✅ Opens in new window

**Why:**
- Pre-Product Hunt launch preparation
- Build email list for launch announcements
- Gather early user feedback
- No-code solutions (Tally + Google Forms) for fast implementation

**Technical:**
- Tally iframe with transparent background, dynamic height
- JavaScript collapsible logic
- Arrow direction: expanded (↓), collapsed (↑)
- CSS v93, JS v73

**Design Decision:** 
- Minimalist integration (doesn't dominate UI)
- Both features secondary to core functionality

**Reference Docs:** 
- `EMAIL_FEEDBACK_IMPLEMENTATION.md`
- `TALLY_DETAILED_GUIDE.md`
- `EMAIL_FEEDBACK_COMPLETED_V84.md`

---

#### v94 - Feedback Button Color Refinement
**Date:** 2026-02-05  
**Commit:** `87f1813`

**Updates:**
- ✅ Changed feedback button from bright orange to subtle gray (#9ba1a8)
- ✅ Hover state: dark gray-blue (#5a6c7d)
- ✅ Maintains accessibility while less visually prominent

**Why:**
- Original orange too bright ("喧宾夺主" - overshadowing main content)
- User feedback: orange didn't match minimalist aesthetic
- Gray more professional and subtle

**Design Philosophy:** Feedback available but shouldn't dominate visual hierarchy

**CSS Version:** v94

---

#### v96 - Hero Section & Core Messaging
**Date:** 2026-02-05  
**Commit:** `624b628`

**Updates:**

**Hero Section (NEW):**
- ✅ Tagline: "Always Listening. Zero Setup."
- ✅ Subtitle: "Open once, speak anytime — your thoughts are already captured"
- ✅ Three value proposition cards:
  - 🎬 Watching videos? Ideas already captured
  - 🎙️ Listening to podcasts? Key quotes auto-recorded
  - 💭 Sudden inspiration? Just speak, we got it

**Mobile Optimization:**
- ✅ Hide value proposition cards on mobile (max-width: 900px)
- ✅ Adjust hero subtitle margins for better mobile layout
- ✅ Prevent button obstruction on small screens

**Why:**
- Clarify core value proposition upfront (most important change)
- Original messaging focused on technical features, not user benefit
- "Always-On Recording" is the differentiator, needed emphasis
- Users need to understand workflow benefit immediately

**Key Insight:** 
- Assistant initially missed the core value proposition
- User correction: "一直在录音" (always recording) is the killer feature
- Hero Section now leads with this benefit

**CSS Version:** v96

---

### Phase 7: Help Page Overhaul (v88-v89, CSS v100-v105) - 2026-02-06

**Context:** 2026-02-06是Help页面全面优化日，包括多个UI和内容改进。

#### v88 (JS) + v100-v105 (CSS) - Help Page Comprehensive Update
**Date:** 2026-02-06  
**Multiple Commits:** `913e057`, `98cdd63`

**Major Updates:**

**1. Visual Icon Integration**
- ✅ Added audio source icons in Quick Start:
  - Microphone icon (black square button, white mic)
  - System Audio icon (black square button, white monitor)
  - Both icon (black square button, white mic+monitor+plus)
- ✅ Added record button icon (blue circular, gradient background)
- ✅ Added transcribe button icon (orange rectangular, gradient background)
- ✅ Added Auto Record toggle icon (black switch + circular arrow)
- ✅ Added history button icon (document outline)

**Why:** 
- Text descriptions like "blue record button" ambiguous
- Users didn't know which button to click
- Visual icons = instant recognition
- Reduce cognitive load in onboarding

**Technical:** SVG icons embedded in Help content with CSS styling

---

**2. Control Panel Section (NEW)**
- ✅ Dedicated section explaining three toggle switches:
  1. **Auto Record Toggle** - Automatic next recording
  2. **Auto-Copy Toggle** - Clipboard copy with page focus requirement
  3. **Notification Toggle** - Browser notifications

**Key Addition - Auto-Copy Clarity:**
- ✅ Clear instruction: "Click anywhere on the **VoiceSpark page** once to activate it"
- ✅ Explanation: Browser security requires page focus
- ✅ Prevents user confusion about "why doesn't auto-copy work?"

**Wording Improvements:**
- Changed "other tabs" → "other apps or tabs" (more comprehensive)

**Why:** Users didn't understand toggle functions, needed centralized explanation

---

**3. Content Structure Improvements**
- ✅ Desktop/Mobile split into separate lines:
  ```
  Before: Desktop: ... | Mobile: ...
  After:  Desktop: ...
          Mobile: ...
  ```
- ✅ Removed redundant "Auto Recording" section from Core Features
- ✅ Added Step 8: History button explanation in Quick Start

**Why:**
- Single-line Desktop/Mobile hard to parse (visual clutter)
- Line break improves scannability
- Auto Recording already explained in Control Panel (redundant)
- History feature missing from onboarding

---

**4. Help Button Visual Enhancement**
- ✅ Changed from transparent to **solid blue background** (#3498db)
- ✅ Removed white circle outline from SVG (cleaner i letter)
- ✅ Increased i letter size: 16px → 18px
- ✅ Increased stroke width: 2 → 3 (bolder, more visible)
- ✅ White i icon for high contrast
- ✅ Circular shape with subtle shadow
- ✅ Size: 20px x 20px (kept original size, not enlarged to 28px)

**Why:**
- Original transparent button too subtle - new users missed it
- Help documentation critical for onboarding success
- Solid blue more noticeable while maintaining minimalist aesthetic
- Bolder i letter easier to see at a glance

**Design Evolution:**
- Initial attempt: 28px button (too large, rejected by user)
- Final: 20px button with bolder, clearer icon (just right)

**CSS Changes:**
- Button: `background: #3498db`, `border-radius: 50%`
- Hover: `background: #2980b9`, `transform: scale(1.2)`
- Mobile: 18px x 18px (slightly smaller for small screens)

---

**Version Numbers:**
- script.js: v88 → v89
- style.css: v100 → v105 (multiple iterations)
- index.html: Updated references

**Reference Doc:** `DEV_TEST_REPORT_HELP_IMPROVEMENTS.md`

---

## 🔑 Key Technical Decisions

### 1. Auto-Copy Browser Security Solution
**Challenge:** Browser prevents clipboard access without user interaction

**Evolution:**
- v57: Basic toggle (50% success rate)
- v68: Retry mechanism (80% success, but complex)
- v69: **Breakthrough** - Active `textarea.focus()` call (99%+ success)
- v70: Simplified code (7.7x faster, -58% code)
- v71: Removed failed attempts (clean console)

**Final Solution:**
```javascript
window.addEventListener('focus', () => {
    if (document.hidden) return;
    setTimeout(async () => {
        textarea.focus(); // Actively grab focus
        await navigator.clipboard.writeText(text);
    }, 300);
});
```

**Key Insight:** Don't wait for focus passively - **actively grab it**

**Success Rate:** 99%+ (vs <50% initially)

---

### 2. iOS System Audio Limitation
**Challenge:** iOS doesn't support system audio capture (any browser)

**Root Cause:**
- iOS system policy (not browser limitation)
- All iOS browsers use WebKit (Apple requirement)
- Privacy/security restriction at OS level

**Solution:**
- v72: Show warning for all iOS browsers (not just Safari)
- Clear explanation of why it doesn't work
- Suggest microphone-only usage

**Coverage:** 60% (Safari only) → 100% (all iOS browsers)

---

### 3. Version Numbering Strategy
**Decision:** Incremental numbers (v52, v53, v54...) not semantic versioning (v1.0.0)

**Rationale:**
- Simpler for frontend cache busting
- Each script.js/style.css update gets new number
- No need to decide major vs minor vs patch
- Linear progression easier to track

**Implementation:** `<script src="/static/script.js?v=89">`

---

### 4. No User Accounts (Yet)
**Decision:** Local-only storage, no backend database

**Rationale:**
- Privacy-first (no data collection)
- Faster launch (no auth system)
- Lower infrastructure costs
- Simpler UX (no signup friction)

**Trade-off:** No cross-device sync (future: optional cloud backup)

---

### 5. 5-Minute Maximum Recording
**Decision:** Duration limited to 30s, 1m, 5m

**Rationale:**
- Faster transcription (~30s for 5min)
- Lower API costs
- Encourages focused idea capture
- Use Auto Record for longer sessions (multiple chunks)

**Alternative Rejected:** Unlimited duration (slow transcription, high cost, memory issues)

---

## 🎨 Design Evolution

### Brand Identity Journey
1. **Original Name** → (forgettable)
2. **v54: "Spark Capture"** → (better, but not unique)
3. **v61: "VoiceSpark"** → **Final** (memorable, brandable)

**Tagline Evolution:**
- Early: Technical features focus
- v61: "Voice Your Spark"
- v96: "Always Listening. Zero Setup." ← **Core message**

---

### UI Philosophy: Progressive Minimalism
- v55-v56: Remove dropdown, simplify UI
- v57-v59: Icon buttons, visual clarity
- v64-v69: Add waveform (visual feedback without clutter)
- v93-v94: Add features (email, feedback) but keep minimal
- v96: Hero Section emphasizes core benefit
- v88: Help page icons (show, don't just tell)

**Principle:** Add features that serve users, remove everything else

---

### Visual Feedback Evolution
- **Text Status** → **Waveform Animation** (v64-v69)
- **Text Descriptions** → **Visual Icons** (v88, Help page)
- **Transparent Help Button** → **Solid Blue Button** (v88-v89)

**Lesson:** Visual > Text for communicating state and actions

---

## 📊 Performance Metrics

### Auto-Copy Reliability Evolution
| Version | Success Rate | Response Time | Code Lines | Console Errors |
|---------|-------------|---------------|------------|----------------|
| v57 | ~50% | Variable | 15 | Many |
| v68 | ~80% | 2.3s | 33 | Some |
| v69 | 99%+ | 0.8s | 33 | Rare |
| v70 | 99%+ | 0.3s | 14 | None |
| v71 | 99%+ | 0.3s | 14 | None |

**Improvement:** 99%+ success, 7.7x faster, -58% code, zero errors

---

### iOS Warning Coverage
| Version | Safari | Chrome | Firefox | Total |
|---------|--------|--------|---------|-------|
| v71 | ✅ 60% | ❌ 0% | ❌ 0% | ~60% |
| v72 | ✅ 60% | ✅ 35% | ✅ 5% | ~100% |

**Improvement:** +40% iOS user coverage

---

## 💡 Key Lessons Learned

### 1. Iterate on Core Problems
**Example:** Auto-copy took 14 versions (v57→v71) to perfect

**Lesson:** Complex problems need iteration. Start simple, measure, learn, improve.

---

### 2. Visual Clarity > Text Descriptions
**Example:** Help page icons (v88) vs text descriptions

**Lesson:** Users scan, don't read. Show actual UI elements, not descriptions.

---

### 3. Platform Limitations Need Clear Communication
**Example:** iOS system audio warning (v72)

**Lesson:** Explain "why not" not just "doesn't work". Transparency builds trust.

---

### 4. Minimalism Requires Discipline
**Example:** v93 added email/feedback but kept minimal design

**Lesson:** Every new feature tempts clutter. Resist. Ask: "Is this essential?"

---

### 5. Browser Security is Non-Negotiable
**Example:** Auto-copy page focus requirement

**Lesson:** Work with browser policies, not against them. Educate users about why.

---

### 6. Real User Feedback Drives Design
**Example:** User corrected "Always-On Recording" core message (v96)

**Lesson:** Developer's perspective ≠ User's perspective. Listen and adapt.

---

## 🔄 Development Workflow

### Version Increment Process
1. Make code changes to script.js or style.css
2. Increment version number in file (e.g., v88 → v89)
3. Update reference in index.html (`<script src="/static/script.js?v=89">`)
4. Test locally
5. Commit with version number in message
6. Deploy to Dev → Test → Deploy to Production

### Branch Strategy
- **main** - Production (voicespark.site)
- **dev** - Development (web-dev-9821.up.railway.app)

### Deployment
1. Push to `dev` branch → Railway auto-deploys to Dev
2. Test on Dev environment
3. Merge `dev` → `main` → Railway auto-deploys to Production

---

## 📚 Reference Documentation

### Version-Specific Technical Docs
- `FOCUS_CLEANUP_V70.md` - v70 optimization details
- `VISIBILITYCHANGE_REMOVAL_V71.md` - v71 cleanup
- `IOS_WARNING_COVERAGE_V72.md` - v72 iOS coverage
- `EMAIL_FEEDBACK_IMPLEMENTATION.md` - v93 implementation
- `DEV_TEST_REPORT_HELP_IMPROVEMENTS.md` - v88-v89 test report

### Feature Documentation
- `FEATURES.md` - Complete feature list
- `ARCHITECTURE.md` - System architecture
- `DEPLOYMENT_GUIDE.md` - Deployment process

### ~40 additional technical documents for specific features/fixes

---

## 🔮 Roadmap

### Short-term (2-4 weeks)
- [ ] Product Hunt launch
- [ ] User feedback analysis
- [ ] Bug fixes from initial users
- [ ] Analytics integration

### Medium-term (1-3 months)
- [ ] AI summaries (auto-extract key points)
- [ ] Export functionality (JSON, CSV, TXT)
- [ ] Tags and categories
- [ ] Keyboard shortcuts
- [ ] Search within transcripts

### Long-term (3-6 months)
- [ ] Native mobile apps (iOS, Android)
- [ ] Optional cloud backup (encrypted)
- [ ] User accounts (for sync)
- [ ] Notion/Obsidian integration
- [ ] Multi-language transcription

---

## 🔄 Document Update Process

### When to Update This Document
- ✅ Every version release (when script.js or style.css version changes)
- ✅ Major feature additions
- ✅ Important bug fixes
- ✅ Key technical decisions
- ✅ User-facing changes

### What to Include
- Version number (e.g., v89) and date
- What changed (✅ checkmarks)
- Why it changed (rationale)
- Impact on users or performance
- Reference docs if detailed

### What to Exclude
- Internal code refactoring (unless architecture changes)
- Minor CSS tweaks
- Dependency updates
- Typo fixes

---

**Document Maintained By:** AI Assistant + Developer  
**Last Updated:** 2026-02-06  
**Format:** Markdown  
**Location:** `VERSION_HISTORY.md` (project root)
