// 全局变量
let transcriptionHistory = []; // 转录历史记录（Session级别）
let mediaRecorder = null;
let isRecording = false;
let isTranscribing = false; // 是否正在转录（转录期间禁用转录按钮）
let recordingStartTime = null;
let recordingTimer = null;
let recordedMimeType = 'audio/webm;codecs=opus';
let maxRecordingDuration = 300000; // 5分钟（毫秒）
let cleanupTimer = null; // 定期清理定时器
let firstRecordedChunk = null; // 保存第一个chunk（包含WebM头部）
let allChunks = []; // 存储所有录音chunks（内存中，用于快速访问）
let memoryCleanupTimer = null; // 内存清理定时器
let audioContext = null; // Web Audio API context
let micStream = null; // 麦克风流
let systemStream = null; // 系统音频流
let combinedStream = null; // 混合后的流
let currentAudioSource = null; // 当前选择的音频源
let audioStreamsReady = false; // 音频流是否已准备好
let pendingStorageClear = null; // 待清空IndexedDB的回调

// 🌍 GA Environment - 从 index.html 中的全局变量获取（避免重复声明）
// deployEnvironment 在 index.html 的 GA 初始化脚本中已定义
// 使用 try-catch 确保移动端也能正常工作
let gaEnvironment = 'production';
try {
    // 添加详细日志帮助调试移动端问题
    console.log('[DEBUG] window.deployEnvironment:', window.deployEnvironment);
    console.log('[DEBUG] typeof window.deployEnvironment:', typeof window.deployEnvironment);
    
    gaEnvironment = window.deployEnvironment || 'production';
    console.log(`[GA] Tracking environment: ${gaEnvironment}`);
} catch (error) {
    console.error('[GA] Failed to detect environment, using production as default:', error);
    console.error('[GA] Error stack:', error.stack);
    gaEnvironment = 'production';
}

// 添加脚本加载成功的标记
console.log('[INFO] ✅ script.js loaded successfully');

// Waveform visualization variables
let waveformCanvas = null;
let waveformCtx = null;
let waveformAnalyser = null;
let waveformAnimationId = null;
let waveformDataArray = null;
let waveformHistory = []; // Store historical waveform data for scrolling effect

// Mobile Device Detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAndroid = /Android/.test(navigator.userAgent);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
let hasShownIOSWarning = false; // 避免重复提示
let hasShownAndroidWarning = false; // 避免重复提示

// 页面关闭/刷新时清理音频流
window.addEventListener('beforeunload', () => {
    console.log('[INFO] 页面即将关闭，清理音频流');
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
    }
    if (systemStream) {
        systemStream.getTracks().forEach(track => track.stop());
    }
    if (combinedStream) {
        combinedStream.getTracks().forEach(track => track.stop());
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }
});

// Pending auto-copy text (when user was away)
let pendingAutoCopyText = null;

// 🎯 统一的复制函数（包含视觉反馈和多种fallback方法）
async function copyToClipboardWithFeedback(text, isAutomatic = false) {
    if (!text) {
        console.warn('[WARNING] No text to copy');
        return false;
    }
    
    console.log(`[COPY] Attempting to copy ${text.length} characters (automatic: ${isAutomatic})`);
    
    let success = false;
    let method = '';
    
    // 方法1: Clipboard API (现代浏览器)
    try {
        await navigator.clipboard.writeText(text);
        success = true;
        method = 'clipboard_api';
        console.log('[COPY] ✅ Success with Clipboard API');
    } catch (err) {
        console.warn('[COPY] Clipboard API failed:', err.message);
        
        // 方法2: 创建临时textarea（兼容性更好）
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '-9999px';
            textarea.style.opacity = '0';
            textarea.setAttribute('readonly', '');
            document.body.appendChild(textarea);
            
            // 在iOS上，需要先focus才能select
            // 使用contentEditable可能更可靠
            textarea.contentEditable = true;
            textarea.readOnly = false;
            
            // 确保元素可以被选中
            const range = document.createRange();
            range.selectNodeContents(textarea);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            // 备选方法：直接select
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, text.length);
            
            // 尝试使用execCommand
            const result = document.execCommand('copy');
            
            // 清理
            selection.removeAllRanges();
            document.body.removeChild(textarea);
            
            if (result) {
                success = true;
                method = 'exec_command';
                console.log('[COPY] ✅ Success with execCommand');
            } else {
                console.warn('[COPY] execCommand returned false');
            }
        } catch (fallbackErr) {
            console.error('[COPY] ❌ All copy methods failed:', fallbackErr);
        }
    }
    
    if (success) {
        // ✨ 显示复制成功的视觉反馈
        if (copyBtn) {
            copyBtn.classList.add('success');
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            
            // 2秒后恢复原状
            setTimeout(() => {
                copyBtn.classList.remove('success');
                copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            }, 2000);
        }
        
        // 📊 Google Analytics
        if (typeof gtag !== 'undefined') {
            const eventName = isAutomatic ? 'auto_copy_on_visible' : 'copy_button_clicked';
            const eventLabel = isAutomatic ? 'Auto-copied when page became visible' : 'User copied text manually';
            
            gtag('event', eventName, {
                'event_category': isAutomatic ? 'AutoCopy' : 'Interaction',
                'event_label': eventLabel,
                'text_length': text.length,
                'copy_method': method,
                'environment': gaEnvironment
            });
        }
    }
    
    return success;
}

// 🔥 执行自动复制的核心逻辑（可以被多个事件触发）
async function performAutoCopy(triggerSource = 'unknown') {
    console.log(`[AUTO_COPY] Triggered by: ${triggerSource}`);
    
    // 🎯 自动focus到文本框，获取文档焦点以支持clipboard操作
    if (transcriptionResult && transcriptionResult.value.trim()) {
        try {
            transcriptionResult.focus();
            console.log('[AUTO_COPY] Focused on textarea to enable clipboard access');
        } catch (e) {
            console.warn('[AUTO_COPY] Failed to focus textarea:', e.message);
        }
    }
    
    // 优先复制待复制文本，否则复制转录结果区域的内容
    let textToCopy = null;
    
    if (pendingAutoCopyText) {
        textToCopy = pendingAutoCopyText;
        pendingAutoCopyText = null; // Clear pending text
        console.log('[AUTO_COPY] ✨ Attempting pending auto-copy');
    } else if (transcriptionResult && transcriptionResult.value.trim()) {
        textToCopy = transcriptionResult.value.trim();
        console.log('[AUTO_COPY] ✨ Attempting to copy existing transcription result');
    }
    
    if (textToCopy) {
        const success = await copyToClipboardWithFeedback(textToCopy, true);
        if (success) {
            console.log(`[AUTO_COPY] ✅✅✅ Auto-copy successful (triggered by: ${triggerSource})`);
        } else {
            console.warn(`[AUTO_COPY] ⚠️ Auto-copy failed (triggered by: ${triggerSource})`);
        }
    } else {
        console.log('[AUTO_COPY] No text to copy');
    }
}

// 页面可见性监测（iOS 后台检测）
// v71改进：不再在visibilitychange时执行auto-copy，只保留iOS录音警告
// 原因：visibilitychange只表示Tab可见性变化，不保证document获得焦点
// 解决：依赖window.focus事件处理auto-copy，它保证document真正获得焦点
document.addEventListener('visibilitychange', () => {
    console.log(`[VISIBILITY] Page visibility changed: ${document.hidden ? 'HIDDEN' : 'VISIBLE'}`);
    console.log(`[VISIBILITY] Current pendingAutoCopyText: ${pendingAutoCopyText ? pendingAutoCopyText.substring(0, 50) + '...' : 'null'}`);
    
    if (document.hidden && isRecording) {
        console.warn('[iOS WARNING] Page hidden during recording - iOS Safari may pause recording');
        if (isIOS && isSafari) {
            console.warn('[iOS] 页面进入后台，录音可能会被 iOS Safari 暂停');
            // 可以选择显示一个提示或保存当前状态
        }
    } else if (!document.hidden && isRecording) {
        console.log('[INFO] Page visible again, recording should resume');
    }
    
    // 🎯 v71优化：不再在visibilitychange时执行auto-copy
    // window.focus事件会在Tab切换回来时自动触发，且保证有焦点
    // 这样可以避免"Document is not focused"错误，提升成功率到99%+
});

// 🔥 窗口获得焦点时自动复制（从其他APP切换回来）- v70简化版
// v69的textarea.focus()已经解决了焦点问题，不再需要复杂的重试机制
window.addEventListener('focus', () => {
    console.log('[FOCUS] Window gained focus');
    
    // 检查页面是否可见
    if (document.hidden) {
        console.log('[FOCUS] Page is hidden, skipping auto-copy');
        return;
    }
    
    // 短暂延迟后直接执行（performAutoCopy内部会主动focus textarea）
    setTimeout(async () => {
        await performAutoCopy('window_focus');
    }, 300); // 从800ms优化到300ms，响应更快
});

// 显示 iOS 使用提示（所有iOS浏览器）
// v72改进：覆盖所有iOS浏览器（Safari、Chrome、Firefox等）
// 原因：iOS上所有浏览器都使用Safari的WebKit引擎，都有相同的后台录音限制
function showIOSWarning() {
    if (!isIOS || hasShownIOSWarning) return;  // 移除isSafari检查
    
    const warning = document.createElement('div');
    warning.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #fff3cd;
        border: 2px solid #ffc107;
        border-radius: 12px;
        padding: 15px 20px;
        max-width: 90%;
        width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1001;
        font-size: 0.9em;
        line-height: 1.5;
        animation: slideUp 0.3s ease;
    `;
    
    warning.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 1.5em; flex-shrink: 0;">📱</span>
            <div style="flex: 1;">
                <strong style="color: #856404;">iOS Recording Tips:</strong><br>
                <span style="color: #856404;">Keep screen on and stay in this tab to ensure recording continues.</span>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 1.2em; cursor: pointer; color: #856404; padding: 0; margin-left: 5px;">×</button>
        </div>
    `;
    
    document.body.appendChild(warning);
    hasShownIOSWarning = true;
    
    // 8秒后自动消失
    setTimeout(() => {
        if (warning.parentElement) {
            warning.style.opacity = '0';
            warning.style.transition = 'opacity 0.3s ease';
            setTimeout(() => warning.remove(), 300);
        }
    }, 8000);
    
    console.log('[iOS] 已显示 iOS 使用提示');
}

// 显示 iOS 系统音频不可用提示
function showIOSSystemAudioWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #f8d7da;
        border: 2px solid #f5c6cb;
        border-radius: 12px;
        padding: 15px 20px;
        max-width: 90%;
        width: 450px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1001;
        font-size: 0.9em;
        line-height: 1.6;
        animation: slideUp 0.3s ease;
    `;
    
    warning.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 1.5em; flex-shrink: 0;">🚫</span>
            <div style="flex: 1;">
                <strong style="color: #721c24;">System Audio Not Available on iOS</strong><br>
                <span style="color: #721c24; font-size: 0.95em;">iOS does not allow web apps to capture system audio. Please use a desktop browser (Chrome/Edge/Safari on Mac/PC) for this feature.</span>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 1.2em; cursor: pointer; color: #721c24; padding: 0; margin-left: 5px;">×</button>
        </div>
    `;
    
    document.body.appendChild(warning);
    
    // 10秒后自动消失
    setTimeout(() => {
        if (warning.parentElement) {
            warning.style.opacity = '0';
            warning.style.transition = 'opacity 0.3s ease';
            setTimeout(() => warning.remove(), 300);
        }
    }, 10000);
    
    console.log('[iOS] 已显示系统音频不可用提示');
}

// 显示 Android 系统音频使用提示
function showAndroidSystemAudioTip() {
    if (hasShownAndroidWarning) {
        console.log('[Android] 已显示过提示，跳过');
        return;
    }
    
    const warning = document.createElement('div');
    warning.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #d1ecf1;
        border: 2px solid #bee5eb;
        border-radius: 12px;
        padding: 15px 20px;
        max-width: 90%;
        width: 450px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1001;
        font-size: 0.9em;
        line-height: 1.6;
        animation: slideUp 0.3s ease;
    `;
    
    warning.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <span style="font-size: 1.5em; flex-shrink: 0;">💡</span>
            <div style="flex: 1;">
                <strong style="color: #0c5460;">Android System Audio Tip</strong><br>
                <span style="color: #0c5460; font-size: 0.95em;">When selecting system audio, remember to check "Share system audio" in the permission dialog. For best results, use Chrome browser.</span>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 1.2em; cursor: pointer; color: #0c5460; padding: 0; margin-left: 5px;">×</button>
        </div>
    `;
    
    document.body.appendChild(warning);
    hasShownAndroidWarning = true;
    
    // 8秒后自动消失
    setTimeout(() => {
        if (warning.parentElement) {
            warning.style.opacity = '0';
            warning.style.transition = 'opacity 0.3s ease';
            setTimeout(() => warning.remove(), 300);
        }
    }, 8000);
    
    console.log('[Android] 已显示系统音频使用提示');
}

// 检查并请求通知权限（带友好提示）
async function checkNotificationPermission() {
    console.log('[INFO] 检查通知权限');
    
    // 检查浏览器是否支持通知
    if (!('Notification' in window)) {
        console.warn('[WARNING] 浏览器不支持通知功能');
        return false;
    }
    
    try {
        const permission = Notification.permission;
        console.log(`[INFO] 通知权限状态: ${permission}`);
        
        if (permission === 'granted') {
            console.log('[SUCCESS] 通知权限已授予');
            return true;
        } else if (permission === 'default') {
            // 显示友好提示，询问用户是否要开启通知
            const userWantsNotification = await showNotificationPermissionDialog();
            
            if (userWantsNotification) {
                // 请求权限
                console.log('[INFO] 用户同意，请求通知权限');
                const result = await Notification.requestPermission();
                console.log(`[INFO] 用户响应: ${result}`);
                return result === 'granted';
            } else {
                console.log('[INFO] 用户暂不需要通知功能');
                // 用户拒绝，关闭通知开关
                const autoNotifyToggle = document.getElementById('autoNotifyToggle');
                if (autoNotifyToggle) {
                    autoNotifyToggle.checked = false;
                }
                return false;
            }
        } else if (permission === 'denied') {
            console.warn('[WARNING] 用户已拒绝通知权限');
            // 权限被拒绝，关闭通知开关
            const autoNotifyToggle = document.getElementById('autoNotifyToggle');
            if (autoNotifyToggle) {
                autoNotifyToggle.checked = false;
            }
            return false;
        }
        
        return false;
    } catch (error) {
        console.error('[ERROR] 检查通知权限时出错:', error);
        return false;
    }
}

// 显示通知权限请求的友好对话框
function showNotificationPermissionDialog() {
    return new Promise((resolve) => {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        `;
        
        // 创建对话框
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            max-width: 450px;
            text-align: center;
            animation: slideIn 0.3s ease;
        `;
        
        dialog.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 15px;">🔔</div>
            <h3 style="margin: 0 0 15px 0; color: #333; font-size: 1.3em;">Enable Completion Notifications?</h3>
            <p style="margin: 0 0 25px 0; color: #666; line-height: 1.6; font-size: 0.95em;">
                Receive browser notifications when transcription completes,<br>
                even when you're on another tab.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="notifyDecline" style="
                    padding: 10px 24px;
                    border: 2px solid #e0e0e0;
                    background: white;
                    color: #666;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.95em;
                    transition: all 0.3s ease;
                ">Not Now</button>
                <button id="notifyAccept" style="
                    padding: 10px 24px;
                    border: none;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.95em;
                    font-weight: 500;
                    transition: all 0.3s ease;
                ">Enable</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideIn {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            #notifyDecline:hover {
                background: #f5f5f5;
                border-color: #ccc;
            }
            #notifyAccept:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
        `;
        document.head.appendChild(style);
        
        // 按钮事件
        document.getElementById('notifyAccept').onclick = () => {
            document.body.removeChild(overlay);
            document.head.removeChild(style);
            resolve(true);
        };
        
        document.getElementById('notifyDecline').onclick = () => {
            document.body.removeChild(overlay);
            document.head.removeChild(style);
            resolve(false);
        };
        
        // 点击遮罩层关闭（视为拒绝）
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                document.head.removeChild(style);
                resolve(false);
            }
        };
    });
}

// 发送浏览器通知
function sendTranscriptionNotification(text) {
    console.log('[INFO] 尝试发送转录完成通知');
    
    // 检查用户是否开启了通知开关
    const autoNotifyToggle = document.getElementById('autoNotifyToggle');
    if (autoNotifyToggle && !autoNotifyToggle.checked) {
        console.log('[INFO] 用户已关闭通知开关，跳过通知');
        return;
    }
    
    // 检查权限
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        console.log('[INFO] 通知权限未授予，跳过通知');
        return;
    }
    
    try {
        // 截取前50个字符作为预览
        const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
        
        const notification = new Notification('🎤 Transcription Complete', {
            body: preview,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎤</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✓</text></svg>',
            tag: 'transcription-complete', // 相同tag的通知会替换，避免多个通知堆积
            requireInteraction: false, // 自动消失
            silent: false // 播放声音
        });
        
        // 点击通知时聚焦到页面并触发自动复制
        notification.onclick = function() {
            console.log('[INFO] 用户点击了通知，聚焦页面并触发自动复制');
            window.focus();
            notification.close();
            
            // 🔥 v113: 点击通知后，延迟触发自动复制
            // 等待页面完全获得焦点后再执行
            setTimeout(async () => {
                console.log('[NOTIFICATION] Triggering auto-copy after notification click');
                await performAutoCopy('notification_click');
            }, 500); // 给500ms让窗口完全激活
        };
        
        // 5秒后自动关闭
        setTimeout(() => {
            notification.close();
        }, 5000);
        
        console.log('[SUCCESS] 通知已发送');
    } catch (error) {
        console.error('[ERROR] 发送通知失败:', error);
    }
}

// 检查并请求剪贴板权限
async function checkClipboardPermission() {
    console.log('[INFO] 检查剪贴板权限');
    
    try {
        // 尝试使用 Permissions API 检查权限
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'clipboard-write' });
                console.log(`[INFO] 剪贴板权限状态: ${permissionStatus.state}`);
                
                if (permissionStatus.state === 'granted') {
                    console.log('[SUCCESS] 剪贴板权限已授予');
                    return true;
                } else if (permissionStatus.state === 'prompt') {
                    console.log('[INFO] 需要请求剪贴板权限');
                }
            } catch (permError) {
                // 某些浏览器不支持 clipboard-write 权限查询
                console.log('[INFO] 浏览器不支持剪贴板权限查询，将直接测试');
            }
        }
        
        // 通过实际写入测试剪贴板功能
        await navigator.clipboard.writeText('权限测试');
        console.log('[SUCCESS] 剪贴板功能可用');
        return true;
        
    } catch (error) {
        console.warn('[WARNING] 剪贴板权限未授予或不可用:', error);
        console.warn('[WARNING] ⚠️ Clipboard permission required for auto-copy');
        
        return false;
    }
}

// ==================== Waveform Visualization ====================

// Initialize waveform analyser from audio stream
function initWaveformAnalyser(stream) {
    try {
        if (!waveformCanvas || !waveformCtx) {
            console.warn('[WAVEFORM] Canvas not available');
            return;
        }
        
        // Create audio context for visualization only (doesn't affect recording)
        const visualAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = visualAudioContext.createMediaStreamSource(stream);
        
        waveformAnalyser = visualAudioContext.createAnalyser();
        waveformAnalyser.fftSize = 256; // Smaller for smoother scrolling
        waveformAnalyser.smoothingTimeConstant = 0.92; // Higher = smoother (0-1)
        
        const bufferLength = waveformAnalyser.frequencyBinCount;
        waveformDataArray = new Uint8Array(bufferLength);
        waveformHistory = []; // Reset history
        
        source.connect(waveformAnalyser);
        
        console.log('[WAVEFORM] Analyser initialized');
    } catch (error) {
        console.error('[WAVEFORM] Failed to initialize analyser:', error);
    }
}

// Draw waveform on canvas with smooth scrolling effect
function drawWaveform() {
    if (!waveformCanvas || !waveformCtx || !waveformAnalyser) {
        return;
    }
    
    waveformAnimationId = requestAnimationFrame(drawWaveform);
    
    waveformAnalyser.getByteTimeDomainData(waveformDataArray);
    
    // Calculate average amplitude for smoother display
    let sum = 0;
    for (let i = 0; i < waveformDataArray.length; i++) {
        sum += Math.abs(waveformDataArray[i] - 128);
    }
    const average = sum / waveformDataArray.length;
    
    // Add new data point to history (normalized amplitude)
    waveformHistory.push(average);
    
    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = waveformCanvas.getBoundingClientRect();
    waveformCanvas.width = rect.width * dpr;
    waveformCanvas.height = rect.height * dpr;
    waveformCtx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const maxPoints = Math.floor(width / 2); // One point every 2 pixels for smooth look
    
    // Keep only recent history (scrolling window)
    if (waveformHistory.length > maxPoints) {
        waveformHistory.shift(); // Remove oldest point (left side)
    }
    
    // Clear canvas (transparent background)
    waveformCtx.clearRect(0, 0, width, height);
    
    // Draw waveform (scrolling from right to left)
    waveformCtx.lineWidth = 2.5;
    waveformCtx.strokeStyle = '#e67e22'; // Brand orange
    waveformCtx.shadowBlur = 8;
    waveformCtx.shadowColor = 'rgba(230, 126, 34, 0.3)';
    waveformCtx.beginPath();
    
    const sliceWidth = width / maxPoints;
    const centerY = height / 2;
    const amplitudeScale = height * 0.8; // Scale factor for wave height (increased 2-3x for visibility)
    
    // Draw from left (oldest) to right (newest)
    for (let i = 0; i < waveformHistory.length; i++) {
        const x = i * sliceWidth;
        const amplitude = waveformHistory[i];
        const y = centerY + (amplitude * amplitudeScale / 128); // More visible amplitude
        
        if (i === 0) {
            waveformCtx.moveTo(x, y);
        } else {
            waveformCtx.lineTo(x, y);
        }
    }
    
    waveformCtx.stroke();
    
    // Draw center line for reference
    waveformCtx.strokeStyle = 'rgba(230, 126, 34, 0.2)';
    waveformCtx.lineWidth = 1;
    waveformCtx.setLineDash([5, 5]);
    waveformCtx.beginPath();
    waveformCtx.moveTo(0, centerY);
    waveformCtx.lineTo(width, centerY);
    waveformCtx.stroke();
    waveformCtx.setLineDash([]);
}

// Start waveform visualization
function startWaveform(stream) {
    if (!waveformCanvas) {
        console.error('[WAVEFORM] Canvas element not found!');
        return;
    }
    
    console.log('[WAVEFORM] Starting waveform visualization...');
    console.log('[WAVEFORM] Canvas element:', waveformCanvas);
    console.log('[WAVEFORM] Canvas current classes:', waveformCanvas.className);
    
    initWaveformAnalyser(stream);
    waveformCanvas.classList.add('recording'); // 添加 recording 类来显示
    
    console.log('[WAVEFORM] Added "recording" class');
    console.log('[WAVEFORM] Canvas classes after add:', waveformCanvas.className);
    console.log('[WAVEFORM] Canvas computed visibility:', window.getComputedStyle(waveformCanvas).visibility);
    
    drawWaveform();
    console.log('[WAVEFORM] Visualization started');
}

// Stop waveform visualization
function stopWaveform() {
    if (!waveformCanvas) return;
    
    if (waveformAnimationId) {
        cancelAnimationFrame(waveformAnimationId);
        waveformAnimationId = null;
    }
    
    waveformCanvas.classList.remove('recording'); // 移除 recording 类来隐藏
    waveformAnalyser = null;
    waveformDataArray = null;
    console.log('[WAVEFORM] Visualization stopped');
}

// ==================== End Waveform Visualization ====================

// ==================== Client-side VAD (Voice Activity Detection) ====================

/**
 * 检测音频中语音的起始点，裁掉前导静音/噪音，返回裁剪后的 WAV Blob。
 * 若语音在前 500ms 内即起始，则直接返回原始 Blob 不做处理。
 *
 * @param {Blob} audioBlob - 原始录音 Blob（WebM/Opus）
 * @param {Object} opts
 * @param {number} opts.threshold       - RMS 能量阈值，默认 0.008（可适当调低以捕捉轻声）
 * @param {number} opts.windowMs        - 检测窗口大小（ms），默认 30ms
 * @param {number} opts.triggerCount    - 连续多少个窗口超阈值才算语音起始，默认 3
 * @param {number} opts.paddingMs       - 语音起始前保留的缓冲（ms），默认 350ms
 * @param {number} opts.minTrimMs       - 最少裁掉多长静噪才值得处理（ms），默认 600ms
 * @returns {Promise<Blob>} 裁剪后的 WAV Blob，或原始 Blob（无需裁剪时）
 */
async function trimLeadingSilence(audioBlob, opts = {}) {
    const {
        threshold    = 0.008,
        windowMs     = 30,
        triggerCount = 3,
        paddingMs    = 350,
        minTrimMs    = 600,
    } = opts;

    let audioCtx;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await audioBlob.arrayBuffer();
        let audioBuffer;
        try {
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        } catch (decodeErr) {
            console.warn('[VAD] 音频解码失败，跳过裁剪:', decodeErr.message);
            return audioBlob;
        }

        const sampleRate    = audioBuffer.sampleRate;
        const windowSamples = Math.floor(sampleRate * windowMs / 1000);
        const totalSamples  = audioBuffer.length;

        // 混合所有声道到单声道进行 VAD 分析
        const mono = new Float32Array(totalSamples);
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
            const ch = audioBuffer.getChannelData(c);
            for (let i = 0; i < totalSamples; i++) {
                mono[i] += ch[i] / audioBuffer.numberOfChannels;
            }
        }

        // 滑动窗口 RMS 检测
        let consecutiveAbove = 0;
        let speechStartSample = -1;

        for (let i = 0; i < totalSamples - windowSamples; i += windowSamples) {
            let sumSq = 0;
            for (let j = i; j < i + windowSamples; j++) {
                sumSq += mono[j] * mono[j];
            }
            const rms = Math.sqrt(sumSq / windowSamples);

            if (rms > threshold) {
                consecutiveAbove++;
                if (consecutiveAbove >= triggerCount) {
                    // 回溯到连续段的起点
                    speechStartSample = i - (triggerCount - 1) * windowSamples;
                    break;
                }
            } else {
                consecutiveAbove = 0;
            }
        }

        if (speechStartSample < 0) {
            // 全程未检测到语音，返回原始 Blob
            console.log('[VAD] 未检测到语音，返回原始音频');
            return audioBlob;
        }

        // 向前留 paddingMs 缓冲，确保不切掉开头辅音
        const paddingSamples = Math.floor(sampleRate * paddingMs / 1000);
        speechStartSample = Math.max(0, speechStartSample - paddingSamples);

        const minTrimSamples = Math.floor(sampleRate * minTrimMs / 1000);
        if (speechStartSample < minTrimSamples) {
            console.log(`[VAD] 语音起始于 ${(speechStartSample / sampleRate * 1000).toFixed(0)}ms，无需裁剪`);
            return audioBlob;
        }

        const trimmedMs = (speechStartSample / sampleRate * 1000).toFixed(0);
        const remainingMs = ((totalSamples - speechStartSample) / sampleRate * 1000).toFixed(0);
        console.log(`[VAD] ✂️ 裁剪前导静噪 ${trimmedMs}ms，保留 ${remainingMs}ms 音频`);

        // 构造裁剪后的 AudioBuffer
        const trimmedLength = totalSamples - speechStartSample;
        const trimmedBuffer = audioCtx.createBuffer(
            audioBuffer.numberOfChannels,
            trimmedLength,
            sampleRate
        );
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
            trimmedBuffer.copyToChannel(
                audioBuffer.getChannelData(c).slice(speechStartSample),
                c
            );
        }

        return encodeAudioBufferToWav(trimmedBuffer);

    } catch (err) {
        console.warn('[VAD] 处理出错，返回原始音频:', err.message);
        return audioBlob;
    } finally {
        if (audioCtx) audioCtx.close().catch(() => {});
    }
}

/**
 * 将 AudioBuffer 编码为 16-bit PCM WAV Blob（单声道，保持原始采样率）
 * @param {AudioBuffer} audioBuffer
 * @returns {Blob} audio/wav Blob
 */
function encodeAudioBufferToWav(audioBuffer) {
    const numChannels = 1; // 输出单声道，Whisper 效果最佳
    const sampleRate  = audioBuffer.sampleRate;
    const numSamples  = audioBuffer.length;
    const bitsPerSample = 16;
    const blockAlign  = numChannels * bitsPerSample / 8;
    const byteRate    = sampleRate * blockAlign;
    const dataSize    = numSamples * blockAlign;

    // 混合到单声道
    const mono = new Float32Array(numSamples);
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const ch = audioBuffer.getChannelData(c);
        for (let i = 0; i < numSamples; i++) {
            mono[i] += ch[i] / audioBuffer.numberOfChannels;
        }
    }

    const buffer = new ArrayBuffer(44 + dataSize);
    const view   = new DataView(buffer);

    const writeStr = (offset, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0,  'RIFF');
    view.setUint32(4,  36 + dataSize, true);
    writeStr(8,  'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);         // PCM chunk size
    view.setUint16(20, 1,  true);         // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate,   true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, mono[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

// ==================== End VAD ====================

// 检查并请求麦克风权限
async function checkMicrophonePermission() {
    console.log('[INFO] 检查麦克风权限');
    
    try {
        // 尝试使用 Permissions API 检查权限
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                console.log(`[INFO] 麦克风权限状态: ${permissionStatus.state}`);
                
                if (permissionStatus.state === 'granted') {
                    console.log('[SUCCESS] 麦克风权限已授予');
                    return true;
                } else if (permissionStatus.state === 'prompt') {
                    console.log('[INFO] 需要请求麦克风权限');
                } else if (permissionStatus.state === 'denied') {
                    console.warn('[WARNING] 麦克风权限被拒绝');
                    showPermissionWarning('microphone', '麦克风权限被拒绝，无法录音');
                    return false;
                }
            } catch (permError) {
                // 某些浏览器不支持 microphone 权限查询
                console.log('[INFO] 浏览器不支持麦克风权限查询，将直接请求');
            }
        }
        
        // 通过实际请求测试麦克风权限
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[SUCCESS] 麦克风权限已授予');
        
        // 立即停止测试流
        stream.getTracks().forEach(track => track.stop());
        
        return true;
        
    } catch (error) {
        console.warn('[WARNING] 麦克风权限未授予或不可用:', error);
        
        let message = '需要麦克风权限才能录音';
        if (error.name === 'NotAllowedError') {
            message = '麦克风权限被拒绝';
        } else if (error.name === 'NotFoundError') {
            message = '未找到麦克风设备';
        }
        
        showPermissionWarning('microphone', message);
        return false;
    }
}

// 显示权限警告提示（使用console记录）
function showPermissionWarning(permissionType, message) {
    console.warn(`[PERMISSION WARNING] ${permissionType}: ${message}`);
}

// ================================
// Help Content (Bilingual)
// ================================
const helpContent = {
    en: {
        title: 'Welcome to VoiceSpark',
        content: `
            <div class="help-highlight">
                <strong>✨ Always Listening. Zero Setup.</strong>
            </div>
            <p style="text-align: center; color: #7f8c8d; margin-top: 10px; margin-bottom: 20px;">
                Open once, speak anytime — your thoughts are already captured
            </p>
            
            <h3>⚡ Quick Start (30 seconds)</h3>
            <div class="help-steps">
                <ol>
                    <li><strong>Desktop:</strong> Select audio source (
                        <span class="help-icon-audio-source">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                            </svg>
                        </span>
                        Microphone / 
                        <span class="help-icon-audio-source">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                                <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                        </span>
                        System Audio / 
                        <span class="help-icon-audio-source" style="padding: 6px 10px;">
                            <svg width="40" height="20" viewBox="0 0 70 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 1a4 4 0 0 0-4 4v8a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/>
                                <path d="M15 10v3a6 6 0 0 1-12 0v-3"/>
                                <line x1="9" y1="19" x2="9" y2="23"/>
                                <line x1="29" y1="7" x2="29" y2="17"/>
                                <line x1="24" y1="12" x2="34" y2="12"/>
                                <rect x="46" y="3" width="20" height="14" rx="2" ry="2"/>
                                <line x1="51" y1="20" x2="61" y2="20"/>
                                <line x1="56" y1="17" x2="56" y2="20"/>
                            </svg>
                        </span>
                        Both)
                        <br>
                        <strong>Mobile:</strong> Uses microphone automatically</li>
                    <li>Choose recording duration (30s / 1m / 5m)</li>
                    <li><strong>Pro Tip:</strong> Enable 
                        <span class="help-icon-toggle">
                            <span class="help-icon-toggle-switch"></span>
                            <span class="help-icon-toggle-arrow">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                            </span>
                        </span>
                        <strong>Auto Record</strong> for continuous listening — then <strong>forget about it</strong>
                    </li>
                    <li>Click the 
                        <span class="help-icon help-icon-record">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                            </svg>
                        </span>
                        <strong>Record button</strong> once to start
                    </li>
                    <li><strong>Speak whenever</strong> — your voice is being captured automatically</li>
                    <li>When done speaking, click the 
                        <span class="help-icon help-icon-transcribe">
                            <svg width="24" height="12" viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="4" y1="12" x2="22" y2="12" />
                                <polyline points="18,8 22,12 18,16" />
                                <g transform="translate(26, 2)">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                </g>
                            </svg>
                        </span>
                        <strong>Transcribe button</strong> to get text
                    </li>
                    <li><strong>That's it!</strong> With 
                        <span class="help-icon-toggle">
                            <span class="help-icon-toggle-switch"></span>
                            <span class="help-icon-toggle-arrow">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                            </span>
                        </span>
                        <strong>Auto Record</strong> enabled, a new recording starts automatically — just speak anytime
                    </li>
                    <li><strong>View all your transcripts:</strong> Click the 
                        <span class="help-icon-history">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                            </svg>
                        </span>
                        <strong>History button</strong> to see all your past recordings and transcripts
                    </li>
                </ol>
            </div>

            <h3>🎛️ Control Panel</h3>
            <ul>
                <li>
                    <span class="help-icon-toggle">
                        <span class="help-icon-toggle-switch"></span>
                        <span class="help-icon-toggle-arrow">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                        </span>
                    </span>
                    <strong>Auto Record Toggle:</strong> Enable to automatically start a new recording after each transcription. Perfect for continuous listening sessions.
                </li>
                <li>
                    <span style="display: inline-flex; align-items: center; width: 44px; height: 24px; background: #2d3436; border-radius: 24px; position: relative; padding: 3px; box-sizing: border-box; margin: 0 6px; vertical-align: middle;">
                        <span style="width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; right: 3px;"></span>
                    </span>
                    <span style="display: inline-flex; align-items: center; justify-content: center; border: 2px solid #7f8c8d; border-radius: 4px; padding: 4px 6px; margin: 0 3px; vertical-align: middle;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f8c8d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </span>
                    <strong>Auto-Copy Toggle:</strong> Automatically copy transcribed text to clipboard when transcription completes. <strong>Note:</strong> Click anywhere on the VoiceSpark page once to activate it—browser security requires the page to be focused for auto-copy to work.
                </li>
                <li>
                    <span style="display: inline-flex; align-items: center; width: 44px; height: 24px; background: #2d3436; border-radius: 24px; position: relative; padding: 3px; box-sizing: border-box; margin: 0 6px; vertical-align: middle;">
                        <span style="width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; right: 3px;"></span>
                    </span>
                    <span style="display: inline-flex; align-items: center; justify-content: center; border: 2px solid #7f8c8d; border-radius: 4px; padding: 4px 6px; margin: 0 3px; vertical-align: middle;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f8c8d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                    </span>
                    <strong>Notification Toggle:</strong> Enable browser notifications to alert you when transcription completes. Perfect when working in other apps or tabs. (Desktop only)
                </li>
            </ul>

            <h3>🎤 Core Features</h3>
            
            <h4>🔄 Always-On Recording</h4>
            <ul>
                <li><strong>Open once, forget about it</strong> - Runs quietly in background</li>
                <li><strong>Speak anytime</strong> - Your thoughts are already being captured</li>
                <li><strong>Zero prep time</strong> - No buttons to click before speaking</li>
            </ul>

            <h4>🎧 Audio Source Selection</h4>
            <ul>
                <li><strong>🎤 Microphone:</strong> Record your voice</li>
                <li><strong>🖥️ System Audio:</strong> Capture computer sound (videos, podcasts, music)</li>
                <li><strong>🎤+🖥️ Both:</strong> Record microphone + system audio simultaneously (perfect for online meetings, discussions)</li>
            </ul>
            
            <div class="help-highlight">
                <strong>📱 Mobile vs 💻 Desktop Support</strong>
            </div>
            <p><strong>Mobile Devices (Phones & Tablets):</strong></p>
            <ul>
                <li>✅ <strong>Microphone only</strong> - Audio source buttons are hidden on mobile</li>
                <li>❌ <strong>System audio not available</strong> - Browser and OS limitation</li>
                <li>ℹ️ <strong>Why?</strong> Mobile browsers don't provide APIs for system audio capture due to:
                    <ul>
                        <li>🔒 Privacy protection (prevents unauthorized audio recording)</li>
                        <li>🛡️ Security considerations (blocks malicious websites)</li>
                        <li>🔋 Battery optimization (reduces background audio processing)</li>
                        <li>📱 Mobile OS restrictions (iOS/Android policies)</li>
                    </ul>
                </li>
                <li>ℹ️ The interface automatically adapts - you'll only see what works</li>
            </ul>
            <p><strong>Desktop (PC & Mac):</strong></p>
            <ul>
                <li>✅ <strong>All three options available</strong> - Microphone, System Audio, or Both</li>
                <li>✅ Full control over audio sources</li>
                <li>✅ Perfect for capturing videos, podcasts, and online meetings</li>
            </ul>

            <h3>💡 Perfect For</h3>
            <ul>
                <li>🎬 <strong>Watching videos?</strong> - Ideas already captured</li>
                <li>🎙️ <strong>Listening to podcasts?</strong> - Key quotes auto-recorded</li>
                <li>💭 <strong>Sudden inspiration?</strong> - Just speak, we got it</li>
                <li>✅ Take live notes while learning</li>
                <li>✅ Change recording duration even while recording</li>
                <li>✅ <strong>(Mobile)</strong> Use shorter durations (30s/1m) for better stability</li>
            </ul>

            <h3>❓ FAQ</h3>
            
            <h4>Q: Where is my recording data stored?</h4>
            <p>All data is saved <strong>locally in your browser</strong>. Nothing is uploaded to any server.</p>

            <h4>Q: Why limit recordings to 5 minutes?</h4>
            <p>VoiceSpark focuses on <strong>capturing inspiration</strong>, not long meeting recordings. Short bursts keep you focused on ideas that matter.</p>

            <h4>Q: How do I record system audio?</h4>
            <p><strong>Desktop only:</strong> Select "System Audio", then your browser will ask you to choose which tab or window to share. Select the tab playing audio (e.g., YouTube, Spotify).</p>
            <p><strong>Note:</strong> System audio is not available on mobile devices (phones/tablets) due to browser and OS limitations. Use a desktop browser (Chrome/Edge/Safari on PC/Mac) for system audio capture.</p>

            <h4>Q: Can I edit the transcribed text?</h4>
            <p>Yes! Click on the text area to edit directly. Your changes will be copied when you click the copy button.</p>

            <h4>🌐 Q: Can I speak in multiple languages in one recording?</h4>
            <p><strong>⚠️ Best Practice: Use one language per recording for optimal results.</strong></p>
            <p>Mixing multiple languages in the same recording may cause:</p>
            <ul>
                <li>❌ Partial transcription failure</li>
                <li>❌ Missed or inaccurate words</li>
                <li>❌ Lower overall transcription quality</li>
            </ul>
            <p><strong>Recommended approach:</strong></p>
            <ul>
                <li>✅ Stick to one language throughout each recording</li>
                <li>✅ If you need to switch languages, stop and start a new recording</li>
                <li>✅ Select the appropriate language from the dropdown before recording</li>
            </ul>
            <p><em>Note: Single-language recordings provide the most accurate and complete transcriptions.</em></p>

            <h4>📱 Q: Recording stops on iPhone/iPad Safari?</h4>
            <p><strong>This is a Safari/iOS limitation, not a VoiceSpark bug.</strong></p>
            <p>iOS Safari automatically pauses audio recording when:</p>
            <ul>
                <li>❌ You switch to another app</li>
                <li>❌ You lock the screen</li>
                <li>❌ The page is in the background for too long</li>
            </ul>
            <p><strong>How to ensure continuous recording on iOS:</strong></p>
            <ul>
                <li>✅ <strong>Keep the screen on</strong> - Don't lock your device</li>
                <li>✅ <strong>Stay in Safari</strong> - Keep VoiceSpark tab active</li>
                <li>✅ <strong>Use shorter durations</strong> - 30s or 1m recommended</li>
                <li>✅ <strong>Transcribe promptly</strong> - Convert to text right after recording</li>
            </ul>
            <p><em>Note: This limitation applies to all web apps on iOS Safari due to Apple's power-saving policies.</em></p>

            <h4>🚫 Q: System Audio not working on iOS?</h4>
            <p><strong>iOS does not support system audio capture - this is an Apple restriction.</strong></p>
            <p><strong>Why?</strong></p>
            <ul>
                <li>🔒 Privacy protection - Prevents unauthorized audio recording</li>
                <li>🛡️ Security - Blocks malicious websites from capturing system sounds</li>
                <li>🍎 iOS policy - All browsers on iOS use Safari's engine with the same limitations</li>
            </ul>
            <p><strong>What works on iOS:</strong></p>
            <ul>
                <li>✅ Microphone recording (your voice)</li>
                <li>❌ System audio (videos, music, apps)</li>
                <li>❌ Microphone + System audio</li>
            </ul>
            <p><strong>To capture system audio, use:</strong></p>
            <ul>
                <li>💻 Desktop browser (Chrome/Edge/Safari on Mac/PC)</li>
                <li>📱 Native iOS recording apps (with proper permissions)</li>
            </ul>

            <h4>📱 Q: How to use System Audio on Android?</h4>
            <p><strong>Android supports system audio capture, but requires specific steps:</strong></p>
            <p><strong>Recommended Setup:</strong></p>
            <ul>
                <li>✅ Use <strong>Chrome</strong> or <strong>Edge</strong> browser (Chrome 74+)</li>
                <li>✅ When permission dialog appears, check <strong>"Share system audio"</strong></li>
                <li>✅ Select the <strong>entire screen</strong> or <strong>specific app</strong> to share</li>
            </ul>
            <p><strong>Common Issues:</strong></p>
            <ul>
                <li>❌ <strong>Firefox/Samsung Browser</strong> - Limited support, use Chrome instead</li>
                <li>❌ <strong>Forgot to check "Share system audio"</strong> - You'll get video only, no sound</li>
                <li>❌ <strong>Permission denied</strong> - Try again and allow all permissions</li>
            </ul>
            <p><strong>What works on Android:</strong></p>
            <ul>
                <li>✅ Microphone recording (your voice) - All browsers</li>
                <li>✅ System audio - Chrome/Edge only, with "Share system audio" checked</li>
                <li>✅ Microphone + System audio - Chrome/Edge only</li>
            </ul>
            <p><em>Note: System audio capture on Android uses screen sharing API. You don't need to actually share your screen - just the audio.</em></p>

            <h3>🔒 Privacy Promise</h3>
            <ul>
                <li>✅ All data stays in your browser</li>
                <li>✅ No personal info collected</li>
                <li>✅ Clear your history anytime</li>
            </ul>

            <div class="help-footer">
                <strong>VoiceSpark</strong> - Never miss your spark<br>
                <a href="https://voicespark.app" class="help-link" target="_blank">voicespark.app</a>
            </div>
        `
    },
    zh: {
        title: '欢迎使用 VoiceSpark',
        content: `
            <div class="help-highlight">
                <strong>✨ 始终在线，零准备</strong>
            </div>
            <p style="text-align: center; color: #7f8c8d; margin-top: 10px; margin-bottom: 20px;">
                打开一次，随时说话 —— 你的想法已经被捕捉了
            </p>
            
            <h3>⚡ 30秒快速开始</h3>
            <div class="help-steps">
                <ol>
                    <li><strong>桌面端：</strong>选择音频源（
                        <span class="help-icon-audio-source">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                            </svg>
                        </span>
                        麦克风 / 
                        <span class="help-icon-audio-source">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                                <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                        </span>
                        系统音频 / 
                        <span class="help-icon-audio-source" style="padding: 6px 10px;">
                            <svg width="40" height="20" viewBox="0 0 70 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 1a4 4 0 0 0-4 4v8a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/>
                                <path d="M15 10v3a6 6 0 0 1-12 0v-3"/>
                                <line x1="9" y1="19" x2="9" y2="23"/>
                                <line x1="29" y1="7" x2="29" y2="17"/>
                                <line x1="24" y1="12" x2="34" y2="12"/>
                                <rect x="46" y="3" width="20" height="14" rx="2" ry="2"/>
                                <line x1="51" y1="20" x2="61" y2="20"/>
                                <line x1="56" y1="17" x2="56" y2="20"/>
                            </svg>
                        </span>
                        两者都要）
                        <br>
                        <strong>移动端：</strong>自动使用麦克风</li>
                    <li>选择录音时长（30秒 / 1分钟 / 5分钟）</li>
                    <li><strong>推荐：</strong>打开 
                        <span class="help-icon-toggle">
                            <span class="help-icon-toggle-switch"></span>
                            <span class="help-icon-toggle-arrow">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                            </span>
                        </span>
                        <strong>Auto Record</strong> 开启持续倾听 — 然后<strong>忘掉它</strong>
                    </li>
                    <li>点击 
                        <span class="help-icon help-icon-record">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                            </svg>
                        </span>
                        <strong>录音按钮</strong>开始录音
                    </li>
                    <li><strong>随时说话</strong> — 你的声音会被自动捕捉</li>
                    <li>说完后，点击 
                        <span class="help-icon help-icon-transcribe">
                            <svg width="24" height="12" viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="4" y1="12" x2="22" y2="12" />
                                <polyline points="18,8 22,12 18,16" />
                                <g transform="translate(26, 2)">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                    <line x1="16" y1="13" x2="8" y2="13"/>
                                    <line x1="16" y1="17" x2="8" y2="17"/>
                                </g>
                            </svg>
                        </span>
                        <strong>转录按钮</strong>获取文字
                    </li>
                    <li><strong>完成！</strong>开启 
                        <span class="help-icon-toggle">
                            <span class="help-icon-toggle-switch"></span>
                            <span class="help-icon-toggle-arrow">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                            </span>
                        </span>
                        <strong>Auto Record</strong> 后，新录音会自动开始 — 随时说话即可
                    </li>
                    <li><strong>查看所有记录：</strong>点击 
                        <span class="help-icon-history">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                            </svg>
                        </span>
                        <strong>历史记录按钮</strong>查看所有过往录音和转录文字
                    </li>
                </ol>
            </div>

            <h3>🎛️ 控制面板说明</h3>
            <ul>
                <li>
                    <span class="help-icon-toggle">
                        <span class="help-icon-toggle-switch"></span>
                        <span class="help-icon-toggle-arrow">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                        </span>
                    </span>
                    <strong>自动录音开关：</strong>开启后，每次转录完成会自动开始新的录音。适合长时间持续使用。
                </li>
                <li>
                    <span style="display: inline-flex; align-items: center; width: 44px; height: 24px; background: #2d3436; border-radius: 24px; position: relative; padding: 3px; box-sizing: border-box; margin: 0 6px; vertical-align: middle;">
                        <span style="width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; right: 3px;"></span>
                    </span>
                    <span style="display: inline-flex; align-items: center; justify-content: center; border: 2px solid #7f8c8d; border-radius: 4px; padding: 4px 6px; margin: 0 3px; vertical-align: middle;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f8c8d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </span>
                    <strong>自动复制开关：</strong>转录完成后自动将文字复制到剪贴板。<strong>注意：</strong>请先点击 VoiceSpark 页面任意位置激活它——浏览器的安全机制要求页面处于活跃状态才能自动复制。
                </li>
                <li>
                    <span style="display: inline-flex; align-items: center; width: 44px; height: 24px; background: #2d3436; border-radius: 24px; position: relative; padding: 3px; box-sizing: border-box; margin: 0 6px; vertical-align: middle;">
                        <span style="width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; right: 3px;"></span>
                    </span>
                    <span style="display: inline-flex; align-items: center; justify-content: center; border: 2px solid #7f8c8d; border-radius: 4px; padding: 4px 6px; margin: 0 3px; vertical-align: middle;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f8c8d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                    </span>
                    <strong>浏览器通知开关：</strong>开启后，转录完成时会弹出浏览器通知提醒你。适合在其他应用或标签页工作时使用。（仅桌面端）
                </li>
            </ul>

            <h3>🎤 核心功能</h3>
            
            <h4>🎧 音频源选择</h4>
            <ul>
                <li><strong>🎤 麦克风：</strong>录制你的声音</li>
                <li><strong>🖥️ 系统音频：</strong>捕捉电脑播放的内容（视频、播客、音乐）</li>
                <li><strong>🎤+🖥️ 两者都要：</strong>同时录制麦克风和系统音频（适合在线会议、讨论）</li>
            </ul>
            
            <div class="help-highlight">
                <strong>📱 移动端 vs 💻 桌面端支持</strong>
            </div>
            <p><strong>移动设备（手机和平板）：</strong></p>
            <ul>
                <li>✅ <strong>仅支持麦克风</strong> - 移动端不显示音频源选择按钮</li>
                <li>❌ <strong>不支持系统音频</strong> - 浏览器和操作系统限制</li>
                <li>ℹ️ <strong>为什么？</strong>移动浏览器不提供系统音频捕获API，原因包括：
                    <ul>
                        <li>🔒 隐私保护（防止未经授权的音频录制）</li>
                        <li>🛡️ 安全考虑（阻止恶意网站）</li>
                        <li>🔋 电池优化（减少后台音频处理）</li>
                        <li>📱 移动操作系统限制（iOS/Android政策）</li>
                    </ul>
                </li>
                <li>ℹ️ 界面会自动适配 - 只显示可用的功能</li>
            </ul>
            <p><strong>桌面端（电脑和Mac）：</strong></p>
            <ul>
                <li>✅ <strong>三个选项都可用</strong> - 麦克风、系统音频、两者都要</li>
                <li>✅ 完整的音频源控制</li>
                <li>✅ 完美捕获视频、播客和在线会议</li>
            </ul>

            <h4>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2c3e50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                自动录音
            </h4>
            <ul>
                <li>开启后，转录完成自动开始下一段录音</li>
                <li>无缝连接，适合长时间学习</li>
                <li>切换 
                    <span class="help-icon-toggle">
                        <span class="help-icon-toggle-switch"></span>
                        <span class="help-icon-toggle-arrow">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="23 4 23 10 17 10"/>
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                        </span>
                    </span>
                    <strong>Auto Record</strong> 开关来启用/禁用
                </li>
            </ul>

            <h3>💡 完美适用于</h3>
            <ul>
                <li>🎬 <strong>看视频？</strong> - 想法已被捕捉</li>
                <li>🎙️ <strong>听播客？</strong> - 金句自动记录</li>
                <li>💭 <strong>灵感突现？</strong> - 直接说，我们搞定</li>
                <li>✅ 学习时做实时笔记</li>
                <li>✅ 录音过程中可随时切换时长</li>
                <li>✅ <strong>（移动端）</strong>使用较短时长（30秒/1分钟）以获得更好的稳定性</li>
            </ul>

            <h3>❓ 常见问题</h3>
            
            <h4>Q: 录音数据保存在哪里？</h4>
            <p>所有数据仅保存在<strong>您的浏览器本地</strong>，不会上传到任何服务器。</p>

            <h4>Q: 为什么最长只有5分钟？</h4>
            <p>VoiceSpark 专注于<strong>灵感捕捉</strong>，而非长篇会议记录。短时录音让您专注于真正重要的想法。</p>

            <h4>Q: 如何录制系统音频？</h4>
            <p><strong>仅限桌面端：</strong>选择"系统音频"后，浏览器会要求您选择要共享的标签页或窗口。选择正在播放音频的标签页（如 YouTube、Spotify）。</p>
            <p><strong>注意：</strong>由于浏览器和操作系统限制，移动设备（手机/平板）不支持系统音频。需要捕获系统音频请使用桌面浏览器（Mac/PC上的Chrome/Edge/Safari）。</p>

            <h4>Q: 可以编辑转录的文字吗？</h4>
            <p>可以！点击文本框直接编辑。修改后的内容会在您点击复制按钮时被复制。</p>

            <h4>🌐 Q: 可以在同一录音中使用多种语言吗？</h4>
            <p><strong>⚠️ 最佳实践：每次录音请尽量使用同一种语言，以获得最佳效果。</strong></p>
            <p>在同一录音中混用多种语言可能导致：</p>
            <ul>
                <li>❌ 部分语音转录失败</li>
                <li>❌ 漏词或识别不准确</li>
                <li>❌ 整体转录质量下降</li>
            </ul>
            <p><strong>推荐做法：</strong></p>
            <ul>
                <li>✅ 整段录音保持使用同一种语言</li>
                <li>✅ 如需切换语言，请停止当前录音并开始新的录音</li>
                <li>✅ 录音前从下拉菜单选择对应的语言</li>
            </ul>
            <p><em>注意：单一语言录音能提供最准确和完整的转录结果。</em></p>

            <h4>📱 Q: iPhone/iPad Safari 上录音会中断？</h4>
            <p><strong>这是 iOS Safari 的系统限制，不是 VoiceSpark 的问题。</strong></p>
            <p>iOS Safari 会在以下情况自动暂停音频录制：</p>
            <ul>
                <li>❌ 切换到其他应用</li>
                <li>❌ 锁定屏幕</li>
                <li>❌ 页面在后台时间过长</li>
            </ul>
            <p><strong>iOS 上确保录音不中断的方法：</strong></p>
            <ul>
                <li>✅ <strong>保持屏幕开启</strong> - 不要锁屏或休眠</li>
                <li>✅ <strong>停留在 Safari</strong> - 保持 VoiceSpark 标签页激活</li>
                <li>✅ <strong>使用较短时长</strong> - 建议 30秒 或 1分钟</li>
                <li>✅ <strong>及时转录</strong> - 录音完成后立即转换为文字</li>
            </ul>
            <p><em>注意：由于苹果的省电策略，所有 iOS Safari 网页应用都有此限制。</em></p>

            <h4>🚫 Q: iOS 上系统音频不可用？</h4>
            <p><strong>iOS 不支持系统音频捕获 - 这是苹果的系统限制。</strong></p>
            <p><strong>为什么？</strong></p>
            <ul>
                <li>🔒 隐私保护 - 防止未经授权的音频录制</li>
                <li>🛡️ 安全考虑 - 阻止恶意网站捕获系统声音</li>
                <li>🍎 iOS 政策 - 所有 iOS 浏览器都使用 Safari 引擎，受相同限制</li>
            </ul>
            <p><strong>iOS 上可用功能：</strong></p>
            <ul>
                <li>✅ 麦克风录音（你的声音）</li>
                <li>❌ 系统音频（视频、音乐、应用声音）</li>
                <li>❌ 麦克风+系统音频</li>
            </ul>
            <p><strong>要捕获系统音频，请使用：</strong></p>
            <ul>
                <li>💻 桌面浏览器（Mac/PC 上的 Chrome/Edge/Safari）</li>
                <li>📱 原生 iOS 录音应用（需要相应权限）</li>
            </ul>

            <h4>📱 Q: Android 上如何使用系统音频？</h4>
            <p><strong>Android 支持系统音频捕获，但需要正确的操作步骤：</strong></p>
            <p><strong>推荐设置：</strong></p>
            <ul>
                <li>✅ 使用 <strong>Chrome</strong> 或 <strong>Edge</strong> 浏览器（Chrome 74+）</li>
                <li>✅ 权限弹窗出现时，勾选 <strong>"共享系统音频"</strong></li>
                <li>✅ 选择 <strong>整个屏幕</strong> 或 <strong>特定应用</strong> 进行共享</li>
            </ul>
            <p><strong>常见问题：</strong></p>
            <ul>
                <li>❌ <strong>使用 Firefox/三星浏览器</strong> - 支持有限，建议改用 Chrome</li>
                <li>❌ <strong>忘记勾选"共享系统音频"</strong> - 只会共享屏幕，没有声音</li>
                <li>❌ <strong>权限被拒绝</strong> - 重新尝试，并允许所有权限</li>
            </ul>
            <p><strong>Android 上可用功能：</strong></p>
            <ul>
                <li>✅ 麦克风录音（你的声音）- 所有浏览器</li>
                <li>✅ 系统音频 - 仅 Chrome/Edge，需勾选"共享系统音频"</li>
                <li>✅ 麦克风+系统音频 - 仅 Chrome/Edge</li>
            </ul>
            <p><em>注意：Android 系统音频捕获使用屏幕共享 API。你不需要真的共享屏幕 - 只需要音频。</em></p>

            <h3>🔒 隐私承诺</h3>
            <ul>
                <li>✅ 数据仅存储在本地浏览器</li>
                <li>✅ 不收集任何个人信息</li>
                <li>✅ 随时可以清除历史记录</li>
            </ul>

            <div class="help-footer">
                <strong>VoiceSpark</strong> - 让灵感不再溜走<br>
                <a href="https://voicespark.app" class="help-link" target="_blank">voicespark.app</a>
            </div>
        `
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[INFO] 🚀 DOMContentLoaded event fired');
    console.log('[INFO] Starting app initialization...');
    
    // 初始化IndexedDB存储
    try {
        await audioStorage.init();
        console.log('[INFO] IndexedDB存储初始化成功');
    } catch (error) {
        console.error('[ERROR] IndexedDB初始化失败:', error);
        alert('Browser storage initialization failed. Recording may not work properly.');
    }
    
    // 检查剪贴板权限
    await checkClipboardPermission();
    
    // 检查麦克风权限
    await checkMicrophonePermission();
    
    // 检查通知权限
    await checkNotificationPermission();
    

    const recordBtn = document.getElementById('recordBtn');
    const recordingTime = document.getElementById('recordingTime');
    const cancelRecordBtn = document.getElementById('cancelRecordBtn');
    const playbackSection = document.getElementById('playbackSection');
    const resultSection = document.getElementById('resultSection');
    const transcriptionResult = document.getElementById('transcriptionResult');
    const copyBtn = document.getElementById('copyBtn');
    // 🔥 v112: 注释掉调试用的按钮定义
    // const playAudioBtn = document.getElementById('playAudioBtn');
    // const downloadAudioBtn = document.getElementById('downloadAudioBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const autoCopyToggle = document.getElementById('autoCopyToggle');
    const autoRecordToggle = document.getElementById('autoRecordToggle');
    const autoNotifyToggle = document.getElementById('autoNotifyToggle');
    const audioSourceBtns = document.querySelectorAll('.audio-source-btn');
    const durationBtns = document.querySelectorAll('.duration-btn');
    const historyBtn = document.getElementById('historyBtn');
    const historyModal = document.getElementById('historyModal');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    const langBtns = document.querySelectorAll('.lang-btn');
    
    // 存储最后录制的音频
    let lastRecordedAudioBlob = null;
    let currentAudioPlayer = null;
    
    // 验证关键元素是否找到
    console.log('[INFO] Key elements found:', {
        recordBtn: !!recordBtn,
        copyBtn: !!copyBtn,
        transcriptionResult: !!transcriptionResult,
        loadingIndicator: !!loadingIndicator,
        audioSourceBtns: audioSourceBtns.length,
        durationBtns: durationBtns.length
    });
    
    // Initialize waveform visualization variables
    waveformCanvas = document.getElementById('waveformCanvas');
    waveformCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;
    
    // 当前选择的音频源
    let selectedAudioSource = 'microphone'; // 默认麦克风
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const historyList = document.getElementById('historyList');
    
    let transcriptionWarningTimer = null; // 转录进行中警告定时器
    
    // 显示转录进行中警告（带自动隐藏）
    function showTranscriptionInProgressWarning() {
        // 临时创建一个警告元素显示在录音状态下方
        const existingWarning = document.getElementById('transcriptionInProgressWarning');
        if (existingWarning) {
            // 如果已存在，重置定时器
            existingWarning.classList.add('show');
        } else {
            // 创建新的警告元素
            const warning = document.createElement('div');
            warning.id = 'transcriptionInProgressWarning';
            warning.className = 'transcription-in-progress-warning show';
            warning.textContent = '💡 Transcription in progress. Please wait...';
            // Insert after waveform canvas
            if (waveformCanvas && waveformCanvas.parentNode) {
                waveformCanvas.parentNode.insertBefore(warning, waveformCanvas.nextSibling);
            }
        }
        
        console.log('[INFO] 显示转录进行中警告');
        
        // 清除之前的定时器
        if (transcriptionWarningTimer) {
            clearTimeout(transcriptionWarningTimer);
        }
        
        // 3秒后自动隐藏
        transcriptionWarningTimer = setTimeout(() => {
            const warning = document.getElementById('transcriptionInProgressWarning');
            if (warning) {
                warning.classList.remove('show');
            }
            console.log('[INFO] 转录进行中警告自动隐藏');
        }, 3000);
    }
    
    // 🔥 移动设备限制：处理系统音频选项
    if (isIOS) {
        console.log('[iOS] 检测到 iOS 设备，禁用系统音频选项');
        
        audioSourceBtns.forEach(btn => {
            const source = btn.dataset.source;
            if (source === 'system' || source === 'both') {
                // 禁用按钮
                btn.disabled = true;
                btn.style.opacity = '0.4';
                btn.style.cursor = 'not-allowed';
                
                // 更新 tooltip
                const originalTitle = btn.getAttribute('title');
                btn.setAttribute('title', 'Not available on iOS - iOS does not support system audio capture');
                
                console.log(`[iOS] 已禁用音频源: ${source}`);
            }
        });
        
        // 确保麦克风是选中状态
        const micBtn = document.querySelector('.audio-source-btn[data-source="microphone"]');
        if (micBtn && !micBtn.classList.contains('active')) {
            audioSourceBtns.forEach(b => b.classList.remove('active'));
            micBtn.classList.add('active');
            selectedAudioSource = 'microphone';
            console.log('[iOS] 已自动选择麦克风作为音频源');
        }
    } else if (isAndroid && !isChrome) {
        // Android 非 Chrome 浏览器：部分支持，添加警告提示
        console.log('[Android] 检测到 Android 非 Chrome 浏览器，系统音频可能不可用');
        
        audioSourceBtns.forEach(btn => {
            const source = btn.dataset.source;
            if (source === 'system' || source === 'both') {
                // 不禁用，但更新 tooltip 提示
                const originalTitle = btn.getAttribute('title');
                btn.setAttribute('title', originalTitle + ' - Recommended: Use Chrome for best system audio support');
                console.log(`[Android] 已更新音频源提示: ${source}`);
            }
        });
    }
    
    // 处理音频源按钮点击
    audioSourceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // iOS 上禁止选择系统音频
            if (isIOS && (btn.dataset.source === 'system' || btn.dataset.source === 'both')) {
                console.warn('[iOS] iOS 不支持系统音频捕获');
                showIOSSystemAudioWarning();
                return;
            }
            
            // Android 上选择系统音频时显示使用提示
            if (isAndroid && (btn.dataset.source === 'system' || btn.dataset.source === 'both')) {
                console.log('[Android] Android 用户选择系统音频，显示使用提示');
                showAndroidSystemAudioTip();
            }
            
            // 如果正在录音，不允许切换
            if (isRecording) {
                console.log('[WARNING] 录音期间无法切换音频源');
                return;
            }
            
            // 移除所有按钮的active类
            audioSourceBtns.forEach(b => b.classList.remove('active'));
            
            // 添加active类到当前按钮
            btn.classList.add('active');
            
            // 更新选择的音频源
            selectedAudioSource = btn.dataset.source;
            console.log('[INFO] 音频源已切换:', selectedAudioSource);
            
            // 📊 Google Analytics - 音频源切换
            if (typeof gtag !== 'undefined') {
                gtag('event', 'audio_source_changed', {
                    'event_category': 'Settings',
                    'event_label': `Changed to ${selectedAudioSource}`,
                    'audio_source': selectedAudioSource,
                    'environment': gaEnvironment
                });
            }
            
            // 清理现有流
            if (audioStreamsReady) {
                console.log('[INFO] 清理现有音频流');
                cleanupAudioStreams(true);
                audioStreamsReady = false;
            }
        });
    });
    
    // 处理转录时长按钮点击
    durationBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 允许录音期间切换时长（用户体验优化）
            
            // 移除所有按钮的active类
            durationBtns.forEach(b => b.classList.remove('active'));
            
            // 添加active类到当前按钮
            btn.classList.add('active');
            
            const statusText = isRecording ? '（录音中）' : '';
            console.log(`[INFO] 设置转录时长: ${btn.dataset.duration}秒 ${statusText}`);
        });
    });

    // 录音按钮点击事件
    recordBtn.addEventListener('click', async () => {
        if (!isRecording) {
            // 开始录音前检查麦克风权限
            const hasMicPermission = await checkMicrophonePermission();
            if (!hasMicPermission) {
                console.error('[ERROR] 麦克风权限未授予，无法开始录音');
                return;
            }
            await startRecording();
        } else {
            // 如果正在转录，阻止转录并显示提示
            if (isTranscribing) {
                showTranscriptionInProgressWarning();
                console.log('[INFO] 转录进行中，无法再次点击转录');
                return;
            }
            await stopRecording();
        }
    });

    // 🔥 取消录音按钮点击事件
    cancelRecordBtn.addEventListener('click', async () => {
        if (isRecording) {
            console.log('[INFO] 用户点击取消录音');
            
            // 📊 Google Analytics - 取消录音
            if (typeof gtag !== 'undefined') {
                gtag('event', 'recording_cancelled', {
                    'event_category': 'Recording',
                    'event_label': 'User cancelled recording',
                    'environment': gaEnvironment
                });
            }
            
            // 停止录音
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            
            // 停止定时器
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }
            
            // 停止内存监控
            if (memoryCleanupTimer) {
                clearInterval(memoryCleanupTimer);
                memoryCleanupTimer = null;
            }
            
            // 🔥 优化：不再有定期清理任务，已取消
            // audioStorage.stopCleanupTimer();
            
            // 清空数据
            allChunks = [];
            firstRecordedChunk = null;
            await audioStorage.clearAll();
            console.log('[INFO] 已清空所有录音数据');
            
            // 重置状态
            isRecording = false;
            mediaRecorder = null;
            recordingStartTime = null;
            
            // 更新UI
            recordBtn.classList.remove('recording');
            // 恢复麦克风图标
            recordBtn.innerHTML = `
                <svg class="btn-icon" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                </svg>
            `;
            recordBtn.title = 'Start recording';
            recordingTime.textContent = '00:00';
            
            // 停止波形可视化
            stopWaveform();
            
            cancelRecordBtn.style.display = 'none';
            
            // 恢复音频源选择器（时长选择器一直可用，无需恢复）
            audioSourceBtns.forEach(btn => btn.disabled = false);
            
            console.log('[SUCCESS] 录音已取消，数据已清空');
        }
    });

    // 复制按钮点击事件
    copyBtn.addEventListener('click', async () => {
        const text = transcriptionResult.value;
        if (text) {
            await copyToClipboardWithFeedback(text, false);
        }
    });
    
    // 🔥 v112: 隐藏调试用的播放和下载按钮
    // 以下代码已注释掉
    /*
    // 🔥 v104: 播放音频按钮
    if (playAudioBtn) {
        playAudioBtn.addEventListener('click', () => {
            if (!lastRecordedAudioBlob) {
                console.error('[ERROR] No audio to play');
                return;
            }
            
            // 如果正在播放，停止
            if (currentAudioPlayer && !currentAudioPlayer.paused) {
                currentAudioPlayer.pause();
                currentAudioPlayer.currentTime = 0;
                playAudioBtn.classList.remove('playing');
                playAudioBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                `;
                return;
            }
            
            // 创建音频URL并播放
            const audioUrl = URL.createObjectURL(lastRecordedAudioBlob);
            currentAudioPlayer = new Audio(audioUrl);
            
            playAudioBtn.classList.add('playing');
            playAudioBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                </svg>
            `;
            
            currentAudioPlayer.play();
            
            currentAudioPlayer.onended = () => {
                playAudioBtn.classList.remove('playing');
                playAudioBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                `;
                URL.revokeObjectURL(audioUrl);
            };
            
            currentAudioPlayer.onerror = (e) => {
                console.error('[ERROR] Audio playback failed:', e);
                playAudioBtn.classList.remove('playing');
                playAudioBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                `;
            };
        });
    }
    */
    
    // 🔥 v112: 隐藏调试用的下载按钮（已在 HTML 中注释掉）
    /*
    // 🔥 v104: 下载音频按钮
    if (downloadAudioBtn) {
        downloadAudioBtn.addEventListener('click', () => {
            if (!lastRecordedAudioBlob) {
                console.error('[ERROR] No audio to download');
                return;
            }
            
            downloadAudioBtn.classList.add('downloading');
            
            const audioUrl = URL.createObjectURL(lastRecordedAudioBlob);
            const a = document.createElement('a');
            a.href = audioUrl;
            
            // 生成文件名：voicespark-YYYYMMDD-HHMMSS.wav
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
            a.download = `voicespark-${dateStr}.wav`;
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setTimeout(() => {
                URL.revokeObjectURL(audioUrl);
                downloadAudioBtn.classList.remove('downloading');
            }, 1000);
        });
    }
    */

    // 获取音频流（复用已有流或创建新流）
    async function getAudioStreams() {
        const audioSource = selectedAudioSource;
        
        // 检查流是否真正可用（不仅存在，而且处于活跃状态）
        const isMicStreamActive = micStream && micStream.getAudioTracks().length > 0 && 
                                   micStream.getAudioTracks()[0].readyState === 'live';
        const isSystemStreamActive = systemStream && systemStream.getAudioTracks().length > 0 && 
                                      systemStream.getAudioTracks()[0].readyState === 'live';
        const isCombinedStreamActive = combinedStream && combinedStream.getAudioTracks().length > 0 && 
                                        combinedStream.getAudioTracks()[0].readyState === 'live';
        
        // 如果音频源未变化且流真正活跃，直接返回现有流
        if (currentAudioSource === audioSource) {
            if (audioSource === 'microphone' && isMicStreamActive) {
                console.log('[INFO] ✅ 复用现有麦克风流（活跃状态）');
                return micStream;
            } else if (audioSource === 'system' && isSystemStreamActive) {
                console.log('[INFO] ✅ 复用现有系统音频流（活跃状态）');
                return systemStream;
            } else if (audioSource === 'both' && isCombinedStreamActive && isMicStreamActive && isSystemStreamActive) {
                console.log('[INFO] ✅ 复用现有混合音频流（活跃状态）');
                return combinedStream;
            }
        }
        
        // 如果需要重新获取，先清理旧的流
        console.log('[INFO] 需要创建新的音频流，音频源:', audioSource);
        
        // 如果是系统音频，提示用户
        if (audioSource === 'system' || audioSource === 'both') {
            console.log('[INFO] ⚠️ 系统音频需要用户选择源（浏览器安全限制）');
        }
        
        currentAudioSource = audioSource;
        
        try {
            if (audioSource === 'microphone') {
                // 仅麦克风
                if (isMicStreamActive) {
                    console.log('[INFO] ✅ 复用现有麦克风流');
                    return micStream;
                }
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioStreamsReady = true;
                return micStream;
            } else if (audioSource === 'system') {
                // 仅系统音频
                if (isSystemStreamActive) {
                    console.log('[INFO] ✅ 复用现有系统音频流');
                    return systemStream;
                }
                
                // 🔥 关键：getDisplayMedia 必须由用户手动选择（浏览器安全限制）
                // 我们尽量复用已有的流，只在必要时才重新请求
                systemStream = await navigator.mediaDevices.getDisplayMedia({ 
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    },
                    video: true // 需要视频权限才能捕获音频
                });
                
                // 🔥 修复：检查是否成功获取音频轨道
                const audioTracks = systemStream.getAudioTracks();
                if (audioTracks.length === 0) {
                    console.error('[ERROR] 未能获取系统音频轨道。请确保在浏览器弹窗中勾选"分享音频"选项');
                    // 清理视频轨道
                    systemStream.getVideoTracks().forEach(track => track.stop());
                    systemStream = null;
                    throw new Error('未能获取系统音频。请在浏览器弹窗中勾选"分享音频"选项，或选择"标签页音频"');
                }
                
                console.log('[INFO] ✅ 成功获取系统音频轨道:', audioTracks.length, '个');
                
                // 停止视频轨道，我们只需要音频
                const videoTracks = systemStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    videoTracks.forEach(track => track.stop());
                    console.log('[INFO] 已停止视频轨道，仅保留音频');
                }
                
                // 监听流结束事件（用户手动停止共享）
                audioTracks[0].addEventListener('ended', () => {
                    console.log('[WARNING] 系统音频流已被用户停止');
                    audioStreamsReady = false;
                    systemStream = null;
                });
                
                audioStreamsReady = true;
                console.log('[INFO] ✅ 系统音频流已创建');
                return systemStream;
            } else {
                // 麦克风 + 系统音频（混合）
                
                // 复用已有的流（如果活跃）
                if (!isMicStreamActive) {
                    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                } else {
                    console.log('[INFO] ✅ 复用现有麦克风流');
                }
                
                if (!isSystemStreamActive) {
                    systemStream = await navigator.mediaDevices.getDisplayMedia({ 
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false
                        },
                        video: true
                    });
                    
                    // 🔥 修复：检查是否成功获取音频轨道
                    const audioTracks = systemStream.getAudioTracks();
                    if (audioTracks.length === 0) {
                        console.error('[ERROR] 未能获取系统音频轨道。请确保在浏览器弹窗中勾选"分享音频"选项');
                        // 清理视频轨道
                        systemStream.getVideoTracks().forEach(track => track.stop());
                        throw new Error('未能获取系统音频。请在浏览器弹窗中勾选"分享音频"选项，或选择"标签页音频"');
                    }
                    
                    console.log('[INFO] ✅ 成功获取系统音频轨道:', audioTracks.length, '个');
                    
                    // 停止视频轨道（只保留音频）
                    const videoTracks = systemStream.getVideoTracks();
                    if (videoTracks.length > 0) {
                        videoTracks.forEach(track => track.stop());
                        console.log('[INFO] 已停止视频轨道，仅保留音频');
                    }
                    
                    // 监听流结束事件
                    audioTracks[0].addEventListener('ended', () => {
                        console.log('[WARNING] 系统音频流已被用户停止');
                        audioStreamsReady = false;
                        systemStream = null;
                        combinedStream = null;
                        // 清理 AudioContext
                        if (audioContext && audioContext.state !== 'closed') {
                            audioContext.close();
                            audioContext = null;
                        }
                    });
                } else {
                    console.log('[INFO] ✅ 复用现有系统音频流');
                }
                
                // 🔥 修复：使用 Web Audio API 混合两个音频流
                // 如果已有 AudioContext 且未关闭，先关闭
                if (audioContext && audioContext.state !== 'closed') {
                    console.log('[INFO] 关闭之前的 AudioContext');
                    await audioContext.close();
                }
                
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const destination = audioContext.createMediaStreamDestination();
                
                // 🔥 v103: 强制单声道输出，确保两个音频源混合到同一声道
                destination.channelCount = 1;
                destination.channelCountMode = 'explicit';
                destination.channelInterpretation = 'speakers';
                
                console.log('[INFO] 🎛️ Destination配置: 单声道输出（强制混合）');
                
                // 🔥 修复：验证音频轨道存在再创建源
                const micAudioTracks = micStream.getAudioTracks();
                const systemAudioTracks = systemStream.getAudioTracks();
                
                console.log('[INFO] 混合音频 - 麦克风轨道:', micAudioTracks.length, '系统音频轨道:', systemAudioTracks.length);
                
                if (micAudioTracks.length === 0) {
                    throw new Error('麦克风音频轨道不可用');
                }
                if (systemAudioTracks.length === 0) {
                    throw new Error('系统音频轨道不可用。请确保在浏览器弹窗中勾选"分享音频"');
                }
                
                const micSource = audioContext.createMediaStreamSource(micStream);
                const systemSource = audioContext.createMediaStreamSource(systemStream);
                
                // 🔥 v102: 简化连接逻辑，直接连接到destination
                const micGain = audioContext.createGain();
                const systemGain = audioContext.createGain();
                
                // 固定增益
                micGain.gain.value = 1.0;
                systemGain.gain.value = 5.0;
                
                // 直接连接：source → gain → destination
                micSource.connect(micGain);
                systemSource.connect(systemGain);
                micGain.connect(destination);
                systemGain.connect(destination);
                
                console.log('[INFO] 🎚️ v103: 简化音频连接 + 强制单声道混合');
                console.log('[INFO] 麦克风增益:', micGain.gain.value, 'x');
                console.log('[INFO] 系统音频增益:', systemGain.gain.value, 'x');
                console.log('[DEBUG] AudioContext:', audioContext.state, '@ ', audioContext.sampleRate, 'Hz');
                console.log('[DEBUG] Destination声道:', destination.channelCount, '(强制单声道)');
                
                combinedStream = destination.stream;
                audioStreamsReady = true;
                
                // 🔥 v104: 添加 destination.stream 的音频轨道检测
                const destTracks = combinedStream.getAudioTracks();
                console.log('[DEBUG-v104] Destination stream tracks:', destTracks.length);
                if (destTracks.length > 0) {
                    console.log('[DEBUG-v104] Destination track details:', {
                        id: destTracks[0].id,
                        label: destTracks[0].label,
                        enabled: destTracks[0].enabled,
                        muted: destTracks[0].muted,
                        readyState: destTracks[0].readyState,
                        contentHint: destTracks[0].contentHint
                    });
                } else {
                    console.error('[ERROR-v104] ❌ Destination stream has NO audio tracks!');
                }
                
                // 🔥 v104: 测试 destination stream 是否真的有音频数据
                const testContext = new AudioContext();
                const testSource = testContext.createMediaStreamSource(combinedStream);
                const testAnalyser = testContext.createAnalyser();
                testAnalyser.fftSize = 256;
                testSource.connect(testAnalyser);
                
                setTimeout(() => {
                    const testData = new Uint8Array(testAnalyser.frequencyBinCount);
                    testAnalyser.getByteFrequencyData(testData);
                    const testSum = testData.reduce((a, b) => a + b, 0);
                    const testAvg = testSum / testData.length;
                    console.log('[DEBUG-v104] Destination stream audio level test:', (testAvg / 255 * 100).toFixed(1), '%');
                    if (testAvg < 1) {
                        console.error('[ERROR-v104] ❌ Destination stream appears to be SILENT!');
                    }
                    testContext.close();
                }, 1000);
                
                // 🔥 监控：创建analyser用于诊断（不影响音频连接）
                const micAnalyser = audioContext.createAnalyser();
                const systemAnalyser = audioContext.createAnalyser();
                micAnalyser.fftSize = 256;
                systemAnalyser.fftSize = 256;
                
                // 连接analyser（仅用于监控，不影响主音频流）
                micSource.connect(micAnalyser);
                systemSource.connect(systemAnalyser);
                
                // 🔥 定期监控音频电平（仅用于诊断，不做调整）
                function getAudioLevel(analyser) {
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(dataArray);
                    const sum = dataArray.reduce((a, b) => a + b, 0);
                    const average = sum / dataArray.length;
                    return average / 255;
                }
                
                let monitorInterval = setInterval(() => {
                    const micLevel = getAudioLevel(micAnalyser);
                    const systemLevel = getAudioLevel(systemAnalyser);
                    
                    // 每隔一段时间报告一次状态
                    if (Math.random() < 0.03) {
                        console.log('[MONITOR] 麦克风:', (micLevel * 100).toFixed(1), '%, 系统音频:', (systemLevel * 100).toFixed(1), '%');
                    }
                }, 100);
                
                if (!window.audioBalanceIntervals) {
                    window.audioBalanceIntervals = [];
                }
                window.audioBalanceIntervals.push(monitorInterval);
                
                combinedStream = destination.stream;
                audioStreamsReady = true;
                
                // 🔥 v97: Startup verification - Check system audio levels after 2s (informational only)
                setTimeout(() => {
                    const checkSystemLevel = getAudioLevel(systemAnalyser);
                    const checkMicLevel = getAudioLevel(micAnalyser);
                    
                    console.log('[STARTUP-CHECK] Audio levels 2s after recording started - Mic:', (checkMicLevel * 100).toFixed(1), '%, System:', (checkSystemLevel * 100).toFixed(1), '%');
                    
                    // If system audio is very low, log informational message (no popup)
                    if (checkSystemLevel < 0.01 && checkMicLevel > 0.05) {
                        console.log('[INFO] ℹ️ System audio level is currently low');
                        console.log('[INFO] This is normal if:');
                        console.log('[INFO] - Video/audio hasn\'t started playing yet');
                        console.log('[INFO] - Media is paused');
                        console.log('[INFO] - You\'re recording mic-only content first');
                        console.log('[INFO] If you intended to record system audio, make sure:');
                        console.log('[INFO] 1. You checked "Share tab audio" in the browser dialog');
                        console.log('[INFO] 2. The selected tab has audio playing');
                    } else if (checkSystemLevel > 0.01) {
                        console.log('[STARTUP-CHECK] ✅ System audio detected and working');
                    }
                }, 2000);
                
                // 🔥 调试：验证混合流的音频轨道
                const combinedTracks = combinedStream.getAudioTracks();
                console.log('[SUCCESS] ✅ 音频混合完成，combined stream tracks:', combinedTracks.length);
                console.log('[DEBUG] Combined stream track details:', {
                    trackId: combinedTracks[0]?.id,
                    trackLabel: combinedTracks[0]?.label,
                    trackEnabled: combinedTracks[0]?.enabled,
                    trackMuted: combinedTracks[0]?.muted,
                    trackReadyState: combinedTracks[0]?.readyState
                });
                console.log('[DEBUG] Original streams:', {
                    micTracks: micStream.getAudioTracks().length,
                    systemTracks: systemStream.getAudioTracks().length
                });
                
                return combinedStream;
            }
        } catch (error) {
            console.error('[ERROR] 获取音频流失败:', error);
            audioStreamsReady = false;
            throw error;
    }
}

// 🔥 新增：内存监控函数
function startMemoryMonitor() {
    // 每30秒监控一次内存使用情况
    memoryCleanupTimer = setInterval(() => {
        const chunksCount = allChunks.length;
        const chunksSize = allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
        const sizeMB = (chunksSize / 1024 / 1024).toFixed(2);
        
        console.log(`[MEMORY] 内存中的chunks: ${chunksCount}个, 总大小: ${sizeMB}MB`);
        
        // 如果内存使用超过100MB，强制清理
        if (chunksSize > 100 * 1024 * 1024) {
            console.warn(`[MEMORY] 内存使用过高(${sizeMB}MB)，强制清理旧chunks`);
            const elapsed = Date.now() - recordingStartTime;
            if (elapsed > maxRecordingDuration) {
                const maxChunks = Math.ceil(maxRecordingDuration / 1000);
                if (allChunks.length > maxChunks) {
                    const toRemove = allChunks.length - maxChunks;
                    console.log(`[MEMORY] 强制移除 ${toRemove} 个旧chunks`);
                    allChunks = allChunks.slice(toRemove);
                }
            }
        }
        
        // 如果使用 performance.memory API（仅Chrome支持）
        if (performance.memory) {
            const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
            const totalMB = (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
            const limitMB = (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
            console.log(`[MEMORY] JS堆: ${usedMB}MB / ${totalMB}MB (限制: ${limitMB}MB)`);
            
            // 如果接近内存限制的80%，发出警告
            if (performance.memory.usedJSHeapSize > performance.memory.jsHeapSizeLimit * 0.8) {
                console.error(`[MEMORY] ⚠️ 警告：内存使用接近限制！建议停止录音。`);
                showPermissionWarning('memory', '内存使用过高，建议停止录音');
            }
        }
    }, 30000); // 30秒检查一次
    
    console.log('[MEMORY] 启动内存监控');
}

function stopMemoryMonitor() {
    if (memoryCleanupTimer) {
        clearInterval(memoryCleanupTimer);
        memoryCleanupTimer = null;
        console.log('[MEMORY] 停止内存监控');
    }
}

// 清理音频流（仅在强制清理或切换音频源时调用）
function cleanupAudioStreams(force = false) {
        // 默认不清理流，保持音频流在整个会话期间活跃
        if (!force) {
            console.log('[INFO] 保持音频流活跃，不清理');
            return;
        }
        
        console.log('[INFO] 强制清理音频流');
        if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
            micStream = null;
        }
        if (systemStream) {
            systemStream.getTracks().forEach(track => track.stop());
            systemStream = null;
        }
        if (combinedStream) {
            combinedStream.getTracks().forEach(track => track.stop());
            combinedStream = null;
        }
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
            audioContext = null;
        }
        audioStreamsReady = false;
        currentAudioSource = null;
    }

    // 开始录音
    async function startRecording(waitForStorageClear = false) {
        let stream = null;
        try {
            // 📊 Google Analytics 事件跟踪
            if (typeof gtag !== 'undefined') {
                gtag('event', 'recording_started', {
                    'event_category': 'Recording',
                    'event_label': 'User started recording',
                    'audio_source': currentAudioSource || 'microphone',
                    'environment': gaEnvironment
                });
            }
            
            // 🔥 iOS 用户提示（所有iOS浏览器，仅首次显示）
            // v72改进：覆盖所有iOS浏览器，不只是Safari
            if (isIOS && autoRecordToggle.checked) {
                showIOSWarning();
            }
            
            // 🔥 关键修复：无论是否等待转录，都要立即清空 IndexedDB
            // 因为新的录音会立即开始写入chunks，不能和旧数据混在一起
            console.log('[INFO] 开始新录音，立即清空 IndexedDB');
            await audioStorage.clearAll();
            pendingStorageClear = null; // 清除待执行的回调
            
            firstRecordedChunk = null; // 清空第一个chunk
            allChunks = []; // 清空chunks数组
            
            // 获取音频流
            stream = await getAudioStreams();
            
            // 使用 MediaRecorder API
            // 优先 WebM/Opus（全浏览器兼容，幻觉率更低），AAC 已弃用
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 };
            } else {
                options = { mimeType: 'audio/webm', audioBitsPerSecond: 64000 };
            }
            
            mediaRecorder = new MediaRecorder(stream, options);
            recordedMimeType = options.mimeType;
            
            const audioSource = selectedAudioSource;
            const sourceText = audioSource === 'microphone' ? '麦克风' : 
                             audioSource === 'system' ? '系统音频' : 
                             '麦克风+系统音频';
            console.log(`[INFO] 开始录音，音频源: ${sourceText}，使用MIME类型:`, recordedMimeType);
            
            // 🔥 调试：验证传给 MediaRecorder 的流
            const recordingTracks = stream.getAudioTracks();
            console.log('[DEBUG] MediaRecorder 使用的 stream:', {
                tracksCount: recordingTracks.length,
                trackDetails: recordingTracks.map(t => ({
                    id: t.id,
                    label: t.label,
                    enabled: t.enabled,
                    muted: t.muted,
                    readyState: t.readyState
                }))
            });
            console.log('[DEBUG] 当前音频源变量:', {
                selectedAudioSource,
                currentAudioSource,
                micStreamActive: micStream?.getAudioTracks()[0]?.readyState,
                systemStreamActive: systemStream?.getAudioTracks()[0]?.readyState
            });
            
            // 数据可用事件：保存到IndexedDB和内存
            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    const currentTime = Date.now();
                    const elapsed = currentTime - recordingStartTime;
                    const chunkTimestamp = elapsed;
                    
                    // 保存第一个chunk到全局变量（用于确保WebM头部完整性）
                    if (!firstRecordedChunk) {
                        firstRecordedChunk = event.data;
                        console.log(`[INFO] 保存第一个chunk（WebM头部）: ${(event.data.size / 1024).toFixed(2)} KB`);
                    }
                    
                    // 保存到内存数组（用于快速访问，但会定期清理）
                    allChunks.push(event.data);
                    
                    // 异步保存chunk到IndexedDB（不等待完成，避免阻塞）
                    audioStorage.saveChunk(event.data, chunkTimestamp).then(() => {
                        console.log(`[INFO] 保存音频chunk: ${(chunkTimestamp/1000).toFixed(2)}秒`);
                    }).catch(error => {
                        console.error('[ERROR] 保存chunk失败:', error);
                    });
                    
                    // 🔥 关键修复：定期清理内存中的 allChunks 数组
                    // 只保留最后5分钟的 chunks（但保留第一个chunk）
                    if (elapsed > maxRecordingDuration) {
                        // 计算需要保留的chunk数量（假设每秒1个chunk）
                        const maxChunks = Math.ceil(maxRecordingDuration / 1000);
                        if (allChunks.length > maxChunks + 1) { // +1 for the first chunk
                            const toRemove = allChunks.length - maxChunks - 1;
                            console.log(`[INFO] 内存清理: 移除 ${toRemove} 个旧chunks（保留第一个chunk + 最新 ${maxChunks} 个）`);
                            // 保留第一个chunk + 最新的chunks
                            allChunks = [firstRecordedChunk, ...allChunks.slice(toRemove + 1)];
                        }
                    }
                }
            };
            
            // 保存stream引用以便在stopRecording中使用
            mediaRecorder._stream = stream;
            
            mediaRecorder.onstop = () => {
                // 保持音频流活跃，不关闭以便下次使用
                console.log('[INFO] MediaRecorder已停止，保持音频流活跃');
                // 不关闭stream，让音频流持续可用
            };
            
            // 每1秒保存一次数据
            mediaRecorder.start(1000);
            
            isRecording = true;
            recordingStartTime = Date.now();
            
            // 🔥 优化：不再启动定期清理任务（避免重复操作）
            // IndexedDB将在录音停止时清理一次即可
            // audioStorage.startCleanupTimer(recordingStartTime);
            
            // 🔥 新增：启动内存监控定时器
            startMemoryMonitor();
            
            // 更新UI
            recordBtn.classList.add('recording');
            // 切换图标为转换图标（箭头→文档）
            recordBtn.innerHTML = `
                <svg class="btn-icon" width="55" height="55" viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <!-- 左侧：箭头 -->
                    <line x1="4" y1="12" x2="22" y2="12" />
                    <polyline points="18,8 22,12 18,16" />
                    
                    <!-- 右侧：文档（与历史按钮图标一致） -->
                    <g transform="translate(26, 2)">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <line x1="10" y1="9" x2="9" y2="9"/>
                    </g>
                </svg>
            `;
            recordBtn.title = 'Click to transcribe';
            
            // 🔥 显示取消录音按钮
            cancelRecordBtn.style.display = 'block';
            
            // 🔥 启动波形可视化
            startWaveform(stream);
            
            // 🔥 录音期间禁用音频源选择器（不能切换音频源），但保持时长选择器可用
            audioSourceBtns.forEach(btn => btn.disabled = true);
            console.log('[INFO] 录音期间禁用音频源选择器（时长选择器保持可用）');
            
            // 禁用复制按钮
            copyBtn.disabled = true;
            
            // 清空之前的转录结果
            transcriptionResult.value = '';
            
            // 更新录音时间
            recordingTimer = setInterval(() => {
                const elapsed = Date.now() - recordingStartTime;
                const seconds = Math.floor(elapsed / 1000);
                const minutes = Math.floor(seconds / 60);
                const displaySeconds = seconds % 60;
                recordingTime.textContent = `${String(minutes).padStart(2, '0')}:${String(displaySeconds).padStart(2, '0')}`;
                
                // 🔥 新增：超过12小时自动停止录音（防止长时间录音导致崩溃）
                if (elapsed > 12 * 60 * 60 * 1000) { // 12小时
                    console.warn('[WARNING] 录音时长超过12小时，自动停止');
                    stopRecording();
                }
            }, 1000);
            
        } catch (error) {
            console.error('无法访问麦克风:', error);
            alert('Cannot access microphone. Please check permission settings.');
        }
    }

    // 停止录音
    async function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            // 等待MediaRecorder停止并收集所有剩余数据
            await new Promise((resolve) => {
                // 保存原始的onstop处理器和stream引用
                const originalOnStop = mediaRecorder.onstop;
                const streamToClose = mediaRecorder._stream || null;
                
                mediaRecorder.onstop = () => {
                    // 不关闭底层音频流，保持流活跃
                    console.log('[INFO] MediaRecorder已停止，音频流保持活跃');
                    // 不调用原始处理器，避免关闭stream
                    // 音频流将在整个会话期间保持活跃
                    
                    // 等待一小段时间确保所有dataavailable事件都触发
                    setTimeout(() => {
                        console.log(`[INFO] 停止录音完成: ${allChunks.length} 个chunks在内存中`);
                        resolve();
                    }, 100);
                };
                
                mediaRecorder.stop();
            });
        }
        
        isRecording = false;
        clearInterval(recordingTimer);
        
        // 🔥 优化：不再有定期清理任务，已取消
        // audioStorage.stopCleanupTimer();
        
        // 停止内存监控
        stopMemoryMonitor();
        
        // 不清理音频流，保持活跃状态
        // cleanupAudioStreams() 不再在这里调用
        
        const elapsed = Date.now() - recordingStartTime;
        console.log(`[INFO] 录音停止:`);
        console.log(`  - 总录音时长: ${(elapsed / 1000).toFixed(2)}秒`);
        console.log(`  - 内存中的chunks数量: ${allChunks.length}`);
        
        // 🔥 优化：在录音停止时清理一次IndexedDB（如果录音超过5分钟）
        if (elapsed > maxRecordingDuration) {
            console.log('[INFO] 录音超过5分钟，执行IndexedDB清理');
            await audioStorage.cleanupOldChunks(recordingStartTime);
        } else {
            console.log('[INFO] 录音未超过5分钟，无需清理IndexedDB');
        }
        
        // 更新UI
        recordBtn.classList.remove('recording');
        // 恢复麦克风图标
        recordBtn.innerHTML = `
            <svg class="btn-icon" width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
        `;
        recordBtn.title = 'Start recording';
        
        // 🔥 停止波形可视化
        stopWaveform();
        
        // 🔥 隐藏取消录音按钮
        cancelRecordBtn.style.display = 'none';
        
        // 🔥 录音停止后重新启用音频源选择器
        audioSourceBtns.forEach(btn => btn.disabled = false);
        console.log('[INFO] 录音停止，重新启用音频源选择器');
        
        // 检查是否需要自动转录和自动录音
        const shouldAutoRecord = autoRecordToggle.checked;
        const activeDurationBtn = document.querySelector('.duration-btn.active');
        
        if (activeDurationBtn) {
            const defaultDuration = parseInt(activeDurationBtn.dataset.duration);
            console.log(`[INFO] 检测到转录时长: ${defaultDuration}秒，自动开始转录`);
            
            // 🔥 关键修复：等待500ms确保IndexedDB写入完成
            // MediaRecorder的最后一个dataavailable事件需要时间处理
            console.log('[INFO] 等待500ms确保所有音频数据写入IndexedDB...');
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('[INFO] 等待完成，开始转录');
            
            // 开始转录
            generateAndPlayAudio(defaultDuration);
            
            // 如果自动录音开启，立即开始新录音
            // 新录音会自动清空 IndexedDB，不会包含旧数据
            if (shouldAutoRecord) {
                console.log('[INFO] 自动录音已开启，立即开始新录音');
                setTimeout(async () => {
                    if (!isRecording) {
                        // 自动录音前也检查麦克风权限
                        const hasMicPermission = await checkMicrophonePermission();
                        if (hasMicPermission) {
                            console.log('[INFO] 开始自动录音（IndexedDB会被自动清空）');
                            await startRecording(); // 不需要 waitForStorageClear 参数
                        } else {
                            console.warn('[WARNING] 麦克风权限不可用，取消自动录音');
                        }
                    }
                }, 200); // 快速启动新录音
            } else {
                // 🔥 如果自动录音关闭，重置计时显示为 00:00
                recordingTime.textContent = '00:00';
                console.log('[INFO] 自动录音已关闭，重置计时显示');
            }
        } else if (shouldAutoRecord) {
            // 如果没有默认转录时长，但自动录音开启，立即开始新录音
            console.log('[INFO] 自动录音已开启，立即开始新录音');
            setTimeout(async () => {
                if (!isRecording) {
                    const hasMicPermission = await checkMicrophonePermission();
                    if (hasMicPermission) {
                        console.log('[INFO] 开始自动录音');
                        await startRecording();
                    } else {
                        console.warn('[WARNING] 麦克风权限不可用，取消自动录音');
                    }
                }
            }, 200);
        } else {
            // 🔥 如果既没有转录时长，也没有自动录音，重置计时显示
            recordingTime.textContent = '00:00';
            console.log('[INFO] 无自动转录/录音，重置计时显示');
        }
    }

    // 生成音频并转录
    async function generateAndPlayAudio(requestedDuration = 10) {
        const totalStartTime = Date.now();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[INFO] 开始生成音频并转录（请求时长: ${requestedDuration}秒）`);
        console.log(`[PERF] 总计时器开始: ${new Date().toISOString()}`);
        console.log(`${'='.repeat(80)}\n`);
        
        // 📊 Google Analytics 事件跟踪
        if (typeof gtag !== 'undefined') {
            gtag('event', 'transcription_started', {
                'event_category': 'Transcription',
                'event_label': 'User started transcription',
                'requested_duration': requestedDuration,
                'environment': gaEnvironment
            });
        }
        
        // 🔥 设置转录状态（禁用转录按钮）
        isTranscribing = true;
        recordBtn.disabled = true;
        console.log('[INFO] 转录开始，禁用转录按钮');
        
        // 显示加载指示器
        loadingIndicator.style.visibility = 'visible';
        transcriptionResult.value = '';
        
        // 禁用复制按钮（防止重复点击）
        copyBtn.disabled = true;
        
        try {
            // 从IndexedDB获取所有chunks
            const dbReadStart = Date.now();
            const allChunksFromDB = await audioStorage.getAllChunks();
            const dbReadTime = Date.now() - dbReadStart;
            console.log(`[PERF] IndexedDB读取耗时: ${dbReadTime}ms`);
            
            if (allChunksFromDB.length === 0) {
                alert('No audio data available');
                return;
            }
            
            console.log(`[INFO] 从IndexedDB获取到 ${allChunksFromDB.length} 个音频块`);
            
            // 确定有效的转录时长（5分钟 vs 用户请求的时长）
            const effectiveDurationMs = requestedDuration * 1000;
            const maxRetentionMs = maxRecordingDuration; // 5分钟
            
            // 获取当前时间（相对于录音开始）
            const currentElapsed = recordingStartTime ? (Date.now() - recordingStartTime) : 0;
            
            // 计算时间窗口：保留最近 effectiveDurationMs 的数据
            let cutoffTime;
            if (effectiveDurationMs >= maxRetentionMs || effectiveDurationMs >= currentElapsed) {
                // 如果请求的时长 >= 5分钟 或 >= 实际录音时长，使用所有数据
                cutoffTime = 0;
                console.log(`[INFO] 使用所有可用数据（请求=${requestedDuration}s >= 保留窗口=${maxRetentionMs/1000}s）`);
            } else {
                // 否则，只使用最近 effectiveDurationMs 的数据
                cutoffTime = Math.max(0, currentElapsed - effectiveDurationMs);
                console.log(`[INFO] 使用最近 ${requestedDuration}秒的数据（cutoff=${cutoffTime}ms）`);
            }
            
            // 🔥 关键修复：构建音频blob，确保包含第一个chunk（WebM头部）
            let chunksToUse;
            if (allChunksFromDB.length > 0) {
                const firstChunk = allChunksFromDB[0]; // 第一个chunk包含WebM头部
                const recentChunks = allChunksFromDB.filter(chunk => chunk.timestamp >= cutoffTime);
                
                // 如果第一个chunk不在recentChunks中，手动添加
                if (recentChunks.length === 0 || recentChunks[0].timestamp !== firstChunk.timestamp) {
                    chunksToUse = [firstChunk, ...recentChunks];
                    console.log(`[INFO] 添加第一个chunk（WebM头部）+ ${recentChunks.length} 个最近的chunks`);
                } else {
                    chunksToUse = recentChunks;
                    console.log(`[INFO] 使用 ${recentChunks.length} 个chunks（已包含第一个chunk）`);
                }
            } else {
                chunksToUse = [];
            }
            
            if (chunksToUse.length === 0) {
                alert('No matching audio data');
                return;
            }
            
            // 🔥 检查chunks数量和时间范围
            if (chunksToUse.length < 5) {
                console.warn(`[WARN] Chunks数量过少 (${chunksToUse.length})，音频可能不完整`);
                const timestamps = chunksToUse.map(c => c.timestamp);
                const timeRange = Math.max(...timestamps) - Math.min(...timestamps);
                if (timeRange < 500) {
                    alert('录音时间太短（少于0.5秒），请录制至少1秒的音频后再转录');
                    return;
                }
            }
            
            // 创建音频blob
            const audioBlob = new Blob(chunksToUse.map(c => c.data), { type: recordedMimeType });
            
            // 🔥 检查音频大小
            const minSizeKB = 10; // 最小10KB
            if (audioBlob.size < minSizeKB * 1024) {
                console.error(`[ERROR] 音频文件过小 (${(audioBlob.size / 1024).toFixed(2)} KB < ${minSizeKB} KB)`);
                alert(`录音数据不足（${(audioBlob.size / 1024).toFixed(2)} KB），请确保已正确录音至少1秒`);
                return;
            }
            
            console.log(`[INFO] 音频 Blob:`);
            console.log(`  - 大小: ${(audioBlob.size / 1024).toFixed(2)} KB`);
            console.log(`  - 类型: ${audioBlob.type}`);
            console.log(`  - Chunks数量: ${chunksToUse.length}`);
            
            // 保存原始音频用于本地播放/下载（浏览器原生支持 WebM 播放）
            lastRecordedAudioBlob = audioBlob;

            // 客户端 VAD：裁剪前导静音/噪音，帮助 Whisper 准确检测语言
            // 若语音起始于前 600ms 内则不裁剪，否则裁剪并重编为 WAV
            const audioToTranscribe = await trimLeadingSilence(audioBlob);
            
            console.log(`[INFO] ✅ 音频准备完成（VAD 裁剪模式）`);
            console.log(`[INFO] 原始: ${audioBlob.type} ${(audioBlob.size / 1024).toFixed(2)} KB`);
            console.log(`[INFO] 转录: ${audioToTranscribe.type} ${(audioToTranscribe.size / 1024).toFixed(2)} KB`);
            
            const frontendProcessTime = Date.now() - totalStartTime;
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[INFO] 音频准备完成，开始转录`);
            console.log(`[PERF] 前端处理总耗时: ${frontendProcessTime}ms (${(frontendProcessTime/1000).toFixed(2)}秒)`);
            console.log(`${'='.repeat(80)}\n`);
            
            // 发送到服务器进行转录
            const formData = new FormData();
            const extension = audioToTranscribe.type.includes('wav') ? 'wav' : 
                             audioToTranscribe.type.includes('webm') ? 'webm' : 
                             audioToTranscribe.type.includes('mp3') ? 'mp3' : 'mp4';
            const filename = `recording_last${requestedDuration}s.${extension}`;
            
            formData.append('audio_file', audioToTranscribe, filename);
            formData.append('duration', String(requestedDuration));
            // 🎙️ v110: 传递音频源信息（用于智能 API 路由）
            formData.append('audio_source', currentAudioSource || 'microphone');
            console.log(`[v110-ROUTING] 📤 发送音频源信息: ${currentAudioSource || 'microphone'}`);
            
            // 发送到服务器
            console.log(`[INFO] 发送转录请求到服务器...`);
            console.log(`[PERF] 文件大小: ${(audioToTranscribe.size / 1024 / 1024).toFixed(2)} MB`);
            const uploadStartTime = Date.now();
            const requestStartTime = Date.now();
            const response = await fetch('/transcribe-segment', {
                method: 'POST',
                body: formData
            });
            const requestEndTime = Date.now();
            const requestDuration = (requestEndTime - requestStartTime) / 1000;
            const uploadTime = requestEndTime - uploadStartTime;
            
            console.log(`[INFO] 服务器响应:`);
            console.log(`  - 状态码: ${response.status}`);
            console.log(`  - 请求耗时: ${requestDuration.toFixed(2)}秒`);
            console.log(`[PERF] 上传+API处理总耗时: ${uploadTime}ms (${(uploadTime/1000).toFixed(2)}秒)`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[ERROR] HTTP 错误响应:`, errorText.substring(0, 500));
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log(`[INFO] 解析后的响应:`);
            console.log(`  - Success: ${result.success}`);
            console.log(`  - Message: ${result.message || 'N/A'}`);
            console.log(`  - Text length: ${result.text ? result.text.length : 0}`);
            
            // 🔥 v96: 显示使用的 API
            if (result.api_used) {
                console.log(`  - API Used: ${result.api_used}`);
                const apiNames = {
                    'ai_builder': 'AI Builder Space (免费)',
                    'openai': 'OpenAI Whisper',
                    'google': 'Google Cloud STT'
                };
                console.log(`  - API Name: ${apiNames[result.api_used] || result.api_used}`);
            }
            
            // 显示 API 状态（如果有）
            if (result.api_status) {
                console.log(`[API_STATUS] 当前 API 状态:`, result.api_status);
            };
            
            if (result.success) {
                transcriptionResult.value = result.text || '未识别到文字';
                console.log(`[SUCCESS] 转录完成`);
                
                // 📊 Google Analytics - 转录成功
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'transcription_completed', {
                        'event_category': 'Transcription',
                        'event_label': 'Transcription successful',
                        'text_length': result.text ? result.text.length : 0,
                        'duration': requestedDuration,
                        'environment': gaEnvironment
                    });
                }
                
                // 🔥 添加到历史记录
                if (result.text) {
                    addToHistory(
                        result.text,
                        audioToTranscribe,
                        currentAudioSource || 'microphone'
                    );
                }
                
                // 🔥 发送浏览器通知
                if (result.text) {
                    sendTranscriptionNotification(result.text);
                }
                
                // 启用复制按钮
                if (result.text) {
                    copyBtn.disabled = false;
                    
                    // 如果开启了自动复制，则自动复制到剪贴板
                    if (autoCopyToggle.checked) {
                        // 🔥 v104: 简化自动复制逻辑，统一使用 performAutoCopy
                        console.log('[INFO] Auto-copy enabled, preparing to copy...');
                        
                        // 先将文本存储为 pending，然后调用统一的复制函数
                        pendingAutoCopyText = result.text;
                        
                        // 检查页面是否可见
                        if (document.hidden) {
                            // 页面不可见，等待用户返回时自动触发（window.focus 事件）
                            console.log('[INFO] Page hidden, text stored for auto-copy when page gains focus');
                        } else {
                            // 页面可见，立即执行复制（统一使用 performAutoCopy）
                            setTimeout(async () => {
                                await performAutoCopy('transcription_completed');
                            }, 300); // 短暂延迟确保 UI 更新完成
                        }
                    }
                    
                    // 🔥 注意：自动录音逻辑已移至 stopRecording() 函数
                    // 自动录音现在在转录开始前就已经启动（无缝衔接）
                    // 这里不再需要启动录音，因为录音已经在后台进行
                }
            } else {
                transcriptionResult.value = `Error: ${result.message || 'Transcription failed'}`;
                console.error(`[ERROR] 转录失败: ${result.message}`);
                
                // 📊 Google Analytics - 转录失败
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'transcription_failed', {
                        'event_category': 'Transcription',
                        'event_label': 'Transcription failed',
                        'error_message': result.message || 'Unknown error',
                        'environment': gaEnvironment
                    });
                }
            }
            
            const totalTime = Date.now() - totalStartTime;
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[INFO] 音频生成和转录完成`);
            console.log(`[PERF] ⏱️  总耗时: ${totalTime}ms (${(totalTime/1000).toFixed(2)}秒)`);
            console.log(`[PERF] 性能分解:`);
            console.log(`  - 前端处理: ${frontendProcessTime}ms (${((frontendProcessTime/totalTime)*100).toFixed(1)}%)`);
            console.log(`  - 网络+API: ${uploadTime}ms (${((uploadTime/totalTime)*100).toFixed(1)}%)`);
            console.log(`[PERF] 音频时长: ${requestedDuration}秒`);
            console.log(`[PERF] 转录速度比: ${(totalTime/1000/requestedDuration).toFixed(2)}x (${(totalTime/1000/requestedDuration) < 1 ? '快于' : '慢于'}实时)`);
            console.log(`${'='.repeat(80)}\n`);
            
        } catch (error) {
            console.error(`\n${'='.repeat(80)}`);
            console.error(`[EXCEPTION] 生成音频或转录过程中发生异常`);
            console.error(`  - 错误类型: ${error.name}`);
            console.error(`  - 错误消息: ${error.message}`);
            console.error(`  - 错误堆栈:`, error.stack);
            console.error(`${'='.repeat(80)}\n`);
            
            // 📊 Google Analytics - 转录异常
            if (typeof gtag !== 'undefined') {
                gtag('event', 'transcription_error', {
                    'event_category': 'Transcription',
                    'event_label': 'Transcription exception',
                    'error_type': error.name,
                    'error_message': error.message,
                    'environment': gaEnvironment
                });
            }
            
            // 显示错误
            transcriptionResult.value = `错误: ${error.message}`;
        } finally {
            loadingIndicator.style.visibility = 'hidden';
            
            // 🔥 恢复转录状态（启用转录按钮）
            isTranscribing = false;
            recordBtn.disabled = false;
            console.log('[INFO] 转录完成，启用转录按钮');
        }
    }

    // 提取音频片段（最后N秒）
    async function extractAudioSegment(audioBlob, durationSeconds) {
        try {
            console.log(`开始提取最后 ${durationSeconds} 秒的音频...`);
            
            // 使用 Web Audio API 处理音频
            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log(`音频文件大小: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 尝试解码音频数据
            let audioBuffer;
            try {
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
            } catch (decodeError) {
                console.warn(`Web Audio API 解码失败: ${decodeError.name} - ${decodeError.message}`);
                audioContext.close();
                // 如果解码失败，抛出异常以触发fallback逻辑
                throw new Error(`无法解码音频数据: ${decodeError.message}`);
            }
            
            const sampleRate = audioBuffer.sampleRate;
            const channels = audioBuffer.numberOfChannels;
            const totalSamples = audioBuffer.length;
            const totalDuration = totalSamples / sampleRate;
            const targetSamples = sampleRate * durationSeconds;
            
            console.log(`音频信息: 采样率=${sampleRate}Hz, 声道数=${channels}, 总时长=${totalDuration.toFixed(2)}秒`);
            
            // 如果音频时长小于请求的时长，转换为WAV后返回完整音频
            if (totalDuration <= durationSeconds) {
                console.log(`音频时长 (${totalDuration.toFixed(2)}秒) 小于等于请求时长 (${durationSeconds}秒)，转换为WAV后返回完整音频`);
                const wavBlob = await audioBufferToWav(audioBuffer);
                audioContext.close();
                return wavBlob;
            }
            
            // 获取最后N秒的数据
            const startSample = Math.max(0, totalSamples - targetSamples);
            const segmentLength = Math.max(1, totalSamples - startSample); // 确保至少1个样本
            const actualDuration = segmentLength / sampleRate;
            
            console.log(`[DEBUG] 音频提取详情:`);
            console.log(`  - 总样本数: ${totalSamples}`);
            console.log(`  - 目标样本数: ${targetSamples}`);
            console.log(`  - 起始样本: ${startSample}`);
            console.log(`  - 片段长度: ${segmentLength}`);
            console.log(`  - 实际时长: ${actualDuration.toFixed(2)}秒`);
            console.log(`提取片段: 起始样本=${startSample}, 长度=${segmentLength}, 实际时长=${actualDuration.toFixed(2)}秒`);
            
            // 验证segmentLength
            if (segmentLength <= 0) {
                throw new Error(`无效的片段长度: ${segmentLength}`);
            }
            
            // 创建新的 AudioBuffer
            const segmentBuffer = audioContext.createBuffer(channels, segmentLength, sampleRate);
            
            for (let channel = 0; channel < channels; channel++) {
                const originalData = audioBuffer.getChannelData(channel);
                const segmentData = segmentBuffer.getChannelData(channel);
                segmentData.set(originalData.subarray(startSample));
            }
            
            // 转换为 WAV
            const wavBlob = await audioBufferToWav(segmentBuffer);
            console.log(`WAV 文件大小: ${(wavBlob.size / 1024).toFixed(2)} KB`);
            
            audioContext.close();
            
            return wavBlob;
            
        } catch (error) {
            console.error('提取音频片段失败:', error);
            console.error('错误类型:', error.name);
            console.error('错误消息:', error.message);
            console.error('错误堆栈:', error.stack);
            console.warn('将使用完整音频文件');
            return audioBlob; // 如果失败，返回原始blob
        }
    }

    // 将WebM转换为WAV（用于确保可以播放）
    async function convertWebMToWAV(webmBlob) {
        try {
            console.log(`[INFO] 开始转换WebM到WAV`);
            const arrayBuffer = await webmBlob.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 解码WebM
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
            audioContext.close();
            
            // 转换为WAV
            const wavBlob = audioBufferToWav(audioBuffer);
            console.log(`[INFO] ✅ WebM转WAV成功，大小: ${(wavBlob.size / 1024).toFixed(2)} KB`);
            return wavBlob;
        } catch (error) {
            console.error(`[ERROR] WebM转WAV失败: ${error.message}`);
            throw error;
        }
    }

    // AudioBuffer 转 WAV Blob（降采样到 16kHz 单声道以控制文件大小）
    async function audioBufferToWav(buffer, targetSampleRate = 16000, mono = true) {
        // 使用 OfflineAudioContext 进行重采样和混音，Whisper/Deepgram 只需 16kHz 单声道
        const outChannels = mono ? 1 : buffer.numberOfChannels;
        const outLength = Math.ceil(buffer.length * targetSampleRate / buffer.sampleRate);

        const offlineCtx = new OfflineAudioContext(outChannels, outLength, targetSampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        const rendered = await offlineCtx.startRendering();

        const length = rendered.length;
        const sampleRate = rendered.sampleRate;
        const channels = rendered.numberOfChannels;
        const bytesPerSample = 2; // 16-bit
        const blockAlign = channels * bytesPerSample;
        const dataSize = length * blockAlign;
        const arrayBuffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(arrayBuffer);

        // WAV 文件头
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        // RIFF header
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');

        // fmt chunk
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);

        // data chunk
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        // 写入音频数据
        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < channels; channel++) {
                const channelData = rendered.getChannelData(channel);
                const sample = Math.max(-1, Math.min(1, channelData[i]));
                const int16Sample = sample < 0
                    ? Math.max(-32768, Math.round(sample * 0x8000))
                    : Math.min(32767, Math.round(sample * 0x7FFF));
                view.setInt16(offset, int16Sample, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }
    
    // 监听通知开关变化
    autoNotifyToggle.addEventListener('change', async () => {
        if (autoNotifyToggle.checked) {
            // 用户开启通知，检查并请求权限
            console.log('[INFO] 用户开启通知开关');
            const granted = await checkNotificationPermission();
            if (!granted) {
                // 如果权限未授予，关闭开关
                autoNotifyToggle.checked = false;
                console.log('[INFO] 通知权限未授予，已关闭通知开关');
            }
        } else {
            // 用户关闭通知
            console.log('[INFO] 用户关闭通知开关');
        }
    });
    
    // ================================
    // 转录历史记录功能
    // ================================
    
    // 添加转录到历史记录
    function addToHistory(text, audioBlob = null, audioSource = 'microphone') {
        if (!text || text.trim() === '') return;
        
        const historyItem = {
            id: Date.now(),
            timestamp: new Date(),
            text: text.trim(),
            audioBlob: audioBlob || null,
            audioSource: audioSource || 'microphone'
        };
        
        transcriptionHistory.unshift(historyItem); // 添加到开头（最新的在前）
        console.log(`[INFO] 已添加转录到历史记录，总数: ${transcriptionHistory.length}`);
        
        // 更新History按钮状态
        updateHistoryButton();
    }
    
    // 更新History按钮状态和计数
    function updateHistoryButton() {
        const count = transcriptionHistory.length;
        const historyCount = historyBtn.querySelector('.history-count');
        
        if (count > 0) {
            historyBtn.disabled = false;
            historyCount.textContent = `(${count})`;
        } else {
            historyBtn.disabled = true;
            historyCount.textContent = '(0)';
        }
    }
    
    // 格式化时间戳
    function formatTimestamp(date) {
        const now = new Date();
        const diff = now - date;
        
        // 小于1分钟显示"刚刚"
        if (diff < 60000) {
            return 'Just now';
        }
        
        // 小于1小时显示"X分钟前"
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
        }
        
        // 今天显示"今天 HH:MM"
        if (date.toDateString() === now.toDateString()) {
            return `Today ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
        }
        
        // 昨天显示"昨天 HH:MM"
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return `Yesterday ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
        }
        
        // 其他显示完整日期时间
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        });
    }
    
    function findHistoryItemById(itemId) {
        return transcriptionHistory.find(item => String(item.id) === String(itemId));
    }

    async function retranscribeHistoryItem(itemId, preferredApi = 'auto') {
        const item = findHistoryItemById(itemId);
        if (!item || !item.audioBlob) {
            console.warn('[HISTORY] 未找到可重转录的音频');
            return;
        }

        const resultBox = historyList.querySelector(`.history-item-retranscribe-result[data-id="${item.id}"]`);
        const itemTextEl = historyList.querySelector(`.history-item[data-id="${item.id}"] .history-item-text`);
        const apiLabelMap = {
            auto: 'Auto',
            openai: 'OpenAI Whisper',
            ai_builder: 'AI Builder',
            google: 'Google STT'
        };

        if (resultBox) {
            resultBox.classList.remove('hidden');
            resultBox.classList.add('loading');
            resultBox.textContent = `Re-transcribing with ${apiLabelMap[preferredApi] || preferredApi}...`;
        }

        try {
            const formData = new FormData();
            const mimeType = item.audioBlob.type || 'audio/wav';
            const extension = mimeType.includes('wav') ? 'wav' :
                            mimeType.includes('webm') ? 'webm' :
                            mimeType.includes('mp3') ? 'mp3' : 'mp4';

            formData.append('audio_file', item.audioBlob, `history_retry.${extension}`);
            formData.append('duration', '300');
            formData.append('audio_source', item.audioSource || 'microphone');
            if (preferredApi && preferredApi !== 'auto') {
                formData.append('preferred_api', preferredApi);
            }

            const response = await fetch('/transcribe-segment', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 300)}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Transcription failed');
            }

            const newText = (result.text || '').trim();
            if (!newText) {
                throw new Error('Empty transcription text');
            }

            // 更新历史项文本 + 主结果区
            item.text = newText;
            if (itemTextEl) itemTextEl.textContent = newText;
            transcriptionResult.value = newText;

            if (resultBox) {
                resultBox.classList.remove('loading');
                resultBox.classList.add('success');
                resultBox.textContent = `Done via ${apiLabelMap[result.api_used] || result.api_used || apiLabelMap[preferredApi]}.`;
            }
            console.log(`[HISTORY] 重转录成功: item=${item.id}, api=${result.api_used || preferredApi}`);

        } catch (error) {
            console.error('[HISTORY] 重转录失败:', error);
            if (resultBox) {
                resultBox.classList.remove('loading', 'success');
                resultBox.classList.add('error');
                resultBox.textContent = `Failed: ${error.message}`;
            }
        }
    }

    async function playHistoryAudio(itemId) {
        const item = findHistoryItemById(itemId);
        if (!item || !item.audioBlob) return;

        const audioUrl = URL.createObjectURL(item.audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        audio.onerror = () => URL.revokeObjectURL(audioUrl);
        await audio.play();
    }

    // 渲染历史记录列表
    function renderHistoryList() {
        if (transcriptionHistory.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty">
                    No transcription history yet. Start recording to create your first transcript!
                </div>
            `;
            return;
        }
        
        historyList.innerHTML = transcriptionHistory.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="history-item-header">
                    <span class="history-item-time">${formatTimestamp(item.timestamp)}</span>
                    <div class="history-item-actions">
                        <button class="history-item-copy" data-text="${encodeURIComponent(item.text)}" title="Copy to clipboard">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            Copy
                        </button>
                        ${item.audioBlob ? `
                        <button class="history-item-play" data-id="${item.id}" title="Play audio">Play</button>
                        <div class="history-item-retry-wrap">
                            <button class="history-item-retry-toggle" data-id="${item.id}" title="Retry with different API">
                                Re-transcribe
                            </button>
                            <div class="history-item-retry-menu hidden" data-id="${item.id}">
                                <button class="history-item-retry-option" data-id="${item.id}" data-api="auto">Auto (fallback)</button>
                                <button class="history-item-retry-option" data-id="${item.id}" data-api="openai">OpenAI Whisper</button>
                                <button class="history-item-retry-option" data-id="${item.id}" data-api="ai_builder">AI Builder</button>
                                <button class="history-item-retry-option" data-id="${item.id}" data-api="google">Google STT</button>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="history-item-text">${item.text}</div>
                <div class="history-item-retranscribe-result hidden" data-id="${item.id}"></div>
            </div>
        `).join('');
        
        // 添加复制按钮事件监听
        historyList.querySelectorAll('.history-item-copy').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const text = decodeURIComponent(btn.dataset.text);
                try {
                    await navigator.clipboard.writeText(text);
                    
                    // 显示复制成功反馈
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
                    btn.style.background = '#2ecc71';
                    
                    setTimeout(() => {
                        btn.innerHTML = originalHTML;
                        btn.style.background = '';
                    }, 2000);
                    
                    console.log('[INFO] 历史记录已复制到剪贴板');
                } catch (error) {
                    console.error('[ERROR] 复制失败:', error);
                    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Failed';
                    btn.style.background = '#e74c3c';
                    
                    setTimeout(() => {
                        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
                        btn.style.background = '';
                    }, 2000);
                }
            });
        });

        // 播放按钮
        historyList.querySelectorAll('.history-item-play').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await playHistoryAudio(btn.dataset.id);
                } catch (err) {
                    console.error('[HISTORY] 播放失败:', err);
                }
            });
        });

        // 关闭所有重试菜单
        const closeAllRetryMenus = () => {
            historyList.querySelectorAll('.history-item-retry-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
        };

        // 切换菜单显示
        historyList.querySelectorAll('.history-item-retry-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = historyList.querySelector(`.history-item-retry-menu[data-id="${btn.dataset.id}"]`);
                if (!menu) return;
                const willShow = menu.classList.contains('hidden');
                closeAllRetryMenus();
                if (willShow) menu.classList.remove('hidden');
            });
        });

        // 点击具体 API 重试
        historyList.querySelectorAll('.history-item-retry-option').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                closeAllRetryMenus();
                await retranscribeHistoryItem(btn.dataset.id, btn.dataset.api || 'auto');
            });
        });

        // 点击 historyList 空白区域关闭菜单（只绑定一次，避免重复绑定）
        if (!historyList.dataset.retryMenuCloseBound) {
            historyList.addEventListener('click', () => {
                historyList.querySelectorAll('.history-item-retry-menu').forEach(menu => {
                    menu.classList.add('hidden');
                });
            });
            historyList.dataset.retryMenuCloseBound = '1';
        }
    }
    
    // 打开历史记录Modal
    historyBtn.addEventListener('click', () => {
        renderHistoryList();
        historyModal.classList.add('show');
        console.log('[INFO] 打开转录历史记录');
    });
    
    // 关闭历史记录Modal
    closeHistoryBtn.addEventListener('click', () => {
        historyModal.classList.remove('show');
        console.log('[INFO] 关闭转录历史记录');
    });
    
    // 点击Modal背景关闭
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) {
            historyModal.classList.remove('show');
            console.log('[INFO] 点击背景关闭转录历史记录');
        }
    });
    
    // 清空历史记录
    clearHistoryBtn.addEventListener('click', () => {
        if (transcriptionHistory.length === 0) {
            return;
        }
        
        if (confirm('Are you sure you want to clear all transcription history?')) {
            transcriptionHistory = [];
            renderHistoryList();
            updateHistoryButton();
            console.log('[INFO] 已清空所有转录历史记录');
        }
    });
    
    // ================================
    // Help Modal Functions
    // ================================
    
    let currentLang = 'en'; // Default language
    
    // Load help content
    function loadHelpContent(lang) {
        const helpModalTitle = document.getElementById('helpModalTitle');
        const helpContentDiv = document.getElementById('helpContent');
        const content = helpContent[lang];
        
        if (content) {
            // Update title
            const iconSvg = helpModalTitle.querySelector('svg').outerHTML;
            helpModalTitle.innerHTML = iconSvg + content.title;
            
            // Update content
            helpContentDiv.innerHTML = content.content;
            
            currentLang = lang;
            console.log(`[INFO] 加载帮助内容: ${lang}`);
        }
    }
    
    // Open help modal
    helpBtn.addEventListener('click', () => {
        loadHelpContent(currentLang);
        helpModal.classList.add('show');
        console.log('[INFO] 打开帮助指南');
    });
    
    // Close help modal
    closeHelpBtn.addEventListener('click', () => {
        helpModal.classList.remove('show');
        console.log('[INFO] 关闭帮助指南');
    });
    
    // Click modal background to close
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.classList.remove('show');
            console.log('[INFO] 点击背景关闭帮助指南');
        }
    });
    
    // Language switch
    langBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.dataset.lang;
            
            // Update active state
            langBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Load content
            loadHelpContent(lang);
        });
    });
    
    // ================================
    // Email Signup Collapse/Expand
    // ================================
    const emailCollapsed = document.getElementById('emailCollapsed');
    const emailExpanded = document.getElementById('emailExpanded');
    const emailExpandBtn = document.getElementById('emailExpandBtn');
    const emailCollapseBtn = document.getElementById('emailCollapseBtn');
    
    // Expand form
    if (emailExpandBtn) {
        emailExpandBtn.addEventListener('click', () => {
            emailCollapsed.style.display = 'none';
            emailExpanded.style.display = 'block';
            console.log('[INFO] Email signup form expanded');
        });
    }
    
    // Click collapsed area to expand
    if (emailCollapsed) {
        emailCollapsed.addEventListener('click', () => {
            emailCollapsed.style.display = 'none';
            emailExpanded.style.display = 'block';
            console.log('[INFO] Email signup form expanded');
        });
    }
    
    // Collapse form
    if (emailCollapseBtn) {
        emailCollapseBtn.addEventListener('click', () => {
            emailExpanded.style.display = 'none';
            emailCollapsed.style.display = 'flex';
            console.log('[INFO] Email signup form collapsed');
        });
    }
    
    // ESC键关闭Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (historyModal.classList.contains('show')) {
                historyModal.classList.remove('show');
                console.log('[INFO] ESC键关闭转录历史记录');
            }
            if (helpModal.classList.contains('show')) {
                helpModal.classList.remove('show');
                console.log('[INFO] ESC键关闭帮助指南');
            }
        }
    });
    
    // 初始化完成标记
    console.log('[INFO] ✅ All event listeners registered successfully');
    console.log('[INFO] ✅ App initialization complete');
    console.log('[INFO] 📱 Device: iOS=' + isIOS + ', Android=' + isAndroid + ', Safari=' + isSafari);
});
