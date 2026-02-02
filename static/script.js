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
        
        // 点击通知时聚焦到页面
        notification.onclick = function() {
            console.log('[INFO] 用户点击了通知，聚焦页面');
            window.focus();
            notification.close();
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
        
        // 显示提示信息
        const statusDiv = document.getElementById('recordingStatus');
        if (statusDiv) {
            const originalText = statusDiv.textContent;
            statusDiv.textContent = '⚠️ Clipboard permission required for auto-copy';
            statusDiv.style.color = '#f5576c';
            
            // 3秒后恢复
            setTimeout(() => {
                statusDiv.textContent = originalText;
                statusDiv.style.color = '';
            }, 3000);
        }
        
        return false;
    }
}

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

// 显示权限警告提示
function showPermissionWarning(permissionType, message) {
    const statusDiv = document.getElementById('recordingStatus');
    if (statusDiv) {
        const originalText = statusDiv.textContent;
        const originalColor = statusDiv.style.color;
        
        statusDiv.textContent = `⚠️ ${message}`;
        statusDiv.style.color = '#f5576c';
        
        // 5秒后恢复
        setTimeout(() => {
            statusDiv.textContent = originalText;
            statusDiv.style.color = originalColor;
        }, 5000);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
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
    const recordBtnText = document.getElementById('recordBtnText');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordingTime = document.getElementById('recordingTime');
    const cancelRecordBtn = document.getElementById('cancelRecordBtn');
    const playbackSection = document.getElementById('playbackSection');
    const resultSection = document.getElementById('resultSection');
    const transcriptionResult = document.getElementById('transcriptionResult');
    const copyBtn = document.getElementById('copyBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const autoCopyToggle = document.getElementById('autoCopyToggle');
    const autoRecordToggle = document.getElementById('autoRecordToggle');
    const autoNotifyToggle = document.getElementById('autoNotifyToggle');
    const audioSourceSelect = document.getElementById('audioSource');
    const historyBtn = document.getElementById('historyBtn');
    const historyModal = document.getElementById('historyModal');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
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
            recordingStatus.parentNode.insertBefore(warning, recordingStatus.nextSibling);
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
    
    // 监听音频源变化，切换时清理现有流
    audioSourceSelect.addEventListener('change', () => {
        if (audioStreamsReady && !isRecording) {
            console.log('[INFO] 音频源已切换，强制清理现有音频流');
            cleanupAudioStreams(true);
        }
    });
    
    // 处理默认转录时长的 checkbox
    const defaultDurationCheckboxes = document.querySelectorAll('.default-duration-check');
    defaultDurationCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (checkbox.checked) {
                // 取消其他 checkbox 的选中状态，保持只有一个被选中
                defaultDurationCheckboxes.forEach(cb => {
                    if (cb !== checkbox) {
                        cb.checked = false;
                    }
                });
                console.log(`[INFO] 设置默认转录时长: ${checkbox.dataset.duration}秒`);
            } else {
                console.log('[INFO] 取消默认转录时长');
            }
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
            
            // 停止清理定时器
            audioStorage.stopCleanupTimer();
            
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
            recordBtnText.textContent = 'Record';
            recordingTime.textContent = '00:00';
            recordingStatus.textContent = 'Recording cancelled';
            cancelRecordBtn.style.display = 'none';
            
            // 恢复音频源选择器
            audioSourceSelect.disabled = false;
            
            console.log('[SUCCESS] 录音已取消，数据已清空');
            
            // 3秒后恢复状态提示
            setTimeout(() => {
                if (!isRecording) {
                    recordingStatus.textContent = 'Ready';
                }
            }, 3000);
        }
    });

    // 复制按钮点击事件
    copyBtn.addEventListener('click', async () => {
        const text = transcriptionResult.value;
        if (text) {
            try {
                await navigator.clipboard.writeText(text);
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                copyBtn.style.background = '#2ecc71';
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.style.background = '';
                }, 2000);
            } catch (err) {
                console.error('[ERROR] 复制失败:', err);
                // 降级方案：使用 execCommand
                try {
                    transcriptionResult.select();
                    document.execCommand('copy');
                    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                    }, 2000);
                } catch (execErr) {
                    console.error('[ERROR] execCommand 复制也失败:', execErr);
                    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
                    copyBtn.style.background = '#f5576c';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                        copyBtn.style.background = '';
                    }, 2000);
                    
                    // 请求剪贴板权限
                    await checkClipboardPermission();
                }
            }
        }
    });

    // 获取音频流（复用已有流或创建新流）
    async function getAudioStreams() {
        const audioSource = audioSourceSelect.value;
        
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
            // 更新UI提示
            recordingStatus.textContent = 'Please select system audio source in the popup...';
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
                // 停止视频轨道，我们只需要音频
                systemStream.getVideoTracks().forEach(track => track.stop());
                
                // 监听流结束事件（用户手动停止共享）
                systemStream.getAudioTracks()[0].addEventListener('ended', () => {
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
                    // 停止视频轨道
                    systemStream.getVideoTracks().forEach(track => track.stop());
                    
                    // 监听流结束事件
                    systemStream.getAudioTracks()[0].addEventListener('ended', () => {
                        console.log('[WARNING] 系统音频流已被用户停止');
                        audioStreamsReady = false;
                        systemStream = null;
                        combinedStream = null;
                    });
                } else {
                    console.log('[INFO] ✅ 复用现有系统音频流');
                }
                
                // 使用 Web Audio API 混合两个音频流
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const destination = audioContext.createMediaStreamDestination();
                
                const micSource = audioContext.createMediaStreamSource(micStream);
                const systemSource = audioContext.createMediaStreamSource(systemStream);
                
                micSource.connect(destination);
                systemSource.connect(destination);
                
                combinedStream = destination.stream;
                audioStreamsReady = true;
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
            // 🔥 关键修复：无论是否等待转录，都要立即清空 IndexedDB
            // 因为新的录音会立即开始写入chunks，不能和旧数据混在一起
            console.log('[INFO] 开始新录音，立即清空 IndexedDB');
            await audioStorage.clearAll();
            pendingStorageClear = null; // 清除待执行的回调
            
            firstRecordedChunk = null; // 清空第一个chunk
            allChunks = []; // 清空chunks数组
            
            // 显示正在获取权限的提示
            recordingStatus.textContent = 'Requesting microphone permission...';
            
            // 获取音频流
            stream = await getAudioStreams();
            
            // 使用 MediaRecorder API
            const options = {
                mimeType: 'audio/webm;codecs=opus'
            };
            
            // 如果不支持 webm，尝试其他格式
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/webm';
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options.mimeType = 'audio/mp4';
                }
            }
            
            mediaRecorder = new MediaRecorder(stream, options);
            recordedMimeType = options.mimeType;
            
            const audioSource = audioSourceSelect.value;
            const sourceText = audioSource === 'microphone' ? '麦克风' : 
                             audioSource === 'system' ? '系统音频' : 
                             '麦克风+系统音频';
            console.log(`[INFO] 开始录音，音频源: ${sourceText}，使用MIME类型:`, recordedMimeType);
            
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
            
            // 启动定期清理任务（每10秒清理一次IndexedDB）
            audioStorage.startCleanupTimer(recordingStartTime);
            
            // 🔥 新增：启动内存监控定时器
            startMemoryMonitor();
            
            // 更新UI
            recordBtn.classList.add('recording');
            recordBtnText.textContent = 'Transcribe';
            recordingStatus.textContent = 'Recording...';
            
            // 🔥 显示取消录音按钮
            cancelRecordBtn.style.display = 'block';
            
            // 🔥 录音期间禁用音频源选择器，防止用户修改
            audioSourceSelect.disabled = true;
            console.log('[INFO] 录音期间禁用音频源选择器');
            
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
                
                // 🔥 新增：超过5分钟显示警告
                if (elapsed > 300000) { // 5分钟 = 300000毫秒
                    recordingStatus.textContent = 'Recording (5min max)...';
                }
                
                // 🔥 新增：超过12小时自动停止录音（防止长时间录音导致崩溃）
                if (elapsed > 12 * 60 * 60 * 1000) { // 12小时
                    console.warn('[WARNING] 录音时长超过12小时，自动停止');
                    recordingStatus.textContent = '⚠️ Recording too long, auto-stopped';
                    recordingStatus.style.color = '#f5576c';
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
        
        // 停止定期清理任务
        audioStorage.stopCleanupTimer();
        
        // 停止内存监控
        stopMemoryMonitor();
        
        // 不清理音频流，保持活跃状态
        // cleanupAudioStreams() 不再在这里调用
        
        const elapsed = Date.now() - recordingStartTime;
        console.log(`[INFO] 录音停止:`);
        console.log(`  - 总录音时长: ${(elapsed / 1000).toFixed(2)}秒`);
        console.log(`  - 内存中的chunks数量: ${allChunks.length}`);
        
        // 更新UI
        recordBtn.classList.remove('recording');
        recordBtnText.textContent = 'Record';
        recordingStatus.textContent = 'Recording stopped';
        
        // 🔥 隐藏取消录音按钮
        cancelRecordBtn.style.display = 'none';
        
        // 🔥 录音停止后重新启用音频源选择器
        audioSourceSelect.disabled = false;
        console.log('[INFO] 录音停止，重新启用音频源选择器');
        
        // 检查是否需要自动转录和自动录音
        const shouldAutoRecord = autoRecordToggle.checked;
        const defaultDurationCheckbox = document.querySelector('.default-duration-check:checked');
        
        if (defaultDurationCheckbox) {
            const defaultDuration = parseInt(defaultDurationCheckbox.dataset.duration);
            console.log(`[INFO] 检测到默认转录时长: ${defaultDuration}秒，自动开始转录`);
            
            // 立即开始转录
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
        }
    }

    // 生成音频并转录
    async function generateAndPlayAudio(requestedDuration = 10) {
        const totalStartTime = Date.now();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[INFO] 开始生成音频并转录（请求时长: ${requestedDuration}秒）`);
        console.log(`[PERF] 总计时器开始: ${new Date().toISOString()}`);
        console.log(`${'='.repeat(80)}\n`);
        
        // 🔥 设置转录状态（禁用转录按钮）
        isTranscribing = true;
        recordBtn.disabled = true;
        recordingStatus.textContent = 'Transcribing... ⏳';
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
            
            // 创建音频blob
            const audioBlob = new Blob(chunksToUse.map(c => c.data), { type: recordedMimeType });
            
            console.log(`[INFO] 音频 Blob:`);
            console.log(`  - 大小: ${(audioBlob.size / 1024).toFixed(2)} KB`);
            console.log(`  - 类型: ${audioBlob.type}`);
            console.log(`  - Chunks数量: ${chunksToUse.length}`);
            
            // 生成可播放的音频文件
            // 策略：尝试解码WebM并转换为WAV格式
            let audioBlobToPlay;
            let decodedDuration = 0;
            
            // 首先尝试解码WebM以获取实际时长和验证格式
            const decodeStart = Date.now();
            try {
                console.log(`[INFO] 尝试解码WebM验证格式完整性`);
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                decodedDuration = audioBuffer.duration;
                await audioContext.close();
                const decodeTime = Date.now() - decodeStart;
                console.log(`[INFO] ✅ WebM格式验证成功，实际音频时长: ${decodedDuration.toFixed(2)}秒`);
                console.log(`[PERF] 音频解码耗时: ${decodeTime}ms`);
            } catch (decodeError) {
                console.error(`[ERROR] WebM解码失败: ${decodeError.name} - ${decodeError.message}`);
                throw new Error(`音频格式损坏或不完整: ${decodeError.message}`);
            }
            
            // 确定要提取的时长（根据用户选择的时长，但不超过实际录音时长）
            const targetDuration = Math.min(decodedDuration, requestedDuration);
            console.log(`[INFO] 请求时长: ${requestedDuration}秒，实际时长: ${decodedDuration.toFixed(2)}秒，目标时长: ${targetDuration.toFixed(2)}秒`);
            
            // 尝试提取目标时长并转换为WAV
            const extractStart = Date.now();
            try {
                console.log(`[INFO] 尝试提取 ${targetDuration.toFixed(2)}秒音频并转换为WAV`);
                audioBlobToPlay = await extractAudioSegment(audioBlob, targetDuration);
                const extractTime = Date.now() - extractStart;
                console.log(`[INFO] ✅ 成功提取并转换音频为WAV，时长: ${targetDuration.toFixed(2)}秒`);
                console.log(`[PERF] 音频提取转换耗时: ${extractTime}ms`);
            } catch (extractError) {
                console.error('[ERROR] 提取音频失败:', extractError.message);
                // 如果提取失败，尝试直接转换整个WebM到WAV
                try {
                    console.log(`[INFO] 尝试直接转换整个WebM到WAV`);
                    const wavBlob = await convertWebMToWAV(audioBlob);
                    
                    // 如果转换成功，但需要截取指定时长
                    if (decodedDuration > requestedDuration) {
                        console.log(`[INFO] WAV转换成功，现在提取最后${requestedDuration}秒`);
                        audioBlobToPlay = await extractAudioSegment(wavBlob, requestedDuration);
                    } else {
                        audioBlobToPlay = wavBlob;
                    }
                    console.log(`[INFO] ✅ WebM转WAV成功`);
                } catch (convertError) {
                    console.error('[ERROR] WebM转WAV也失败:', convertError.message);
                    // 如果都失败，抛出错误，不返回无法播放的WebM
                    throw new Error(`无法转换音频格式: ${convertError.message}`);
                }
            }
            
            console.log(`[INFO] ✅ 音频准备完成`);
            console.log(`[INFO] 音频类型: ${audioBlobToPlay.type}`);
            console.log(`[INFO] 音频大小: ${(audioBlobToPlay.size / 1024).toFixed(2)} KB`);
            
            const frontendProcessTime = Date.now() - totalStartTime;
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[INFO] 音频生成完成，开始转录`);
            console.log(`[PERF] 前端处理总耗时: ${frontendProcessTime}ms (${(frontendProcessTime/1000).toFixed(2)}秒)`);
            console.log(`${'='.repeat(80)}\n`);
            
            // 🔥 检查文件大小，如果超过25 MB，尝试压缩
            const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
            let audioToTranscribe = audioBlobToPlay;
            const originalSize = audioBlobToPlay.size;
            
            console.log(`[INFO] 检查文件大小: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
            
            if (originalSize > MAX_FILE_SIZE) {
                console.warn(`[WARNING] ⚠️ 文件过大 (${(originalSize / 1024 / 1024).toFixed(2)} MB)，超过25 MB限制`);
                console.log(`[INFO] 尝试降低音频质量以减小文件大小...`);
                
                const compressStart = Date.now();
                try {
                    // 降低采样率和比特深度来压缩音频
                    const arrayBuffer = await audioBlobToPlay.arrayBuffer();
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                    
                    // 降低采样率到16kHz（语音识别足够）
                    const targetSampleRate = 16000;
                    const offlineContext = new OfflineAudioContext(
                        1, // 单声道
                        audioBuffer.duration * targetSampleRate,
                        targetSampleRate
                    );
                    
                    const source = offlineContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(offlineContext.destination);
                    source.start();
                    
                    const compressedBuffer = await offlineContext.startRendering();
                    audioContext.close();
                    
                    // 转换为WAV（但采样率更低，单声道）
                    const compressedWav = audioBufferToWav(compressedBuffer);
                    audioToTranscribe = new Blob([compressedWav], { type: 'audio/wav' });
                    
                    const compressedSize = audioToTranscribe.size;
                    const compressTime = Date.now() - compressStart;
                    console.log(`[INFO] ✅ 压缩完成: ${(originalSize / 1024 / 1024).toFixed(2)} MB → ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`[INFO] 压缩比: ${((1 - compressedSize / originalSize) * 100).toFixed(1)}%`);
                    console.log(`[PERF] 音频压缩耗时: ${compressTime}ms`);
                    
                    // 如果压缩后仍然太大，提示用户
                    if (compressedSize > MAX_FILE_SIZE) {
                        const errorMsg = `Audio file too large (${(compressedSize / 1024 / 1024).toFixed(2)}MB). Limit: 25MB. Try shorter duration.`;
                        console.error(`[ERROR] ${errorMsg}`);
                        transcriptionResult.value = `错误: ${errorMsg}`;
                        return;
                    }
                } catch (compressionError) {
                    console.error('[ERROR] 压缩失败:', compressionError.message);
                    const errorMsg = `Audio file too large (${(originalSize / 1024 / 1024).toFixed(2)}MB). Limit: 25MB. Try shorter duration.`;
                    transcriptionResult.value = `错误: ${errorMsg}`;
                    return;
                }
            }
            
            // 发送到服务器进行转录
            const formData = new FormData();
            const extension = audioToTranscribe.type.includes('wav') ? 'wav' : 
                             audioToTranscribe.type.includes('webm') ? 'webm' : 
                             audioToTranscribe.type.includes('mp3') ? 'mp3' : 'mp4';
            const filename = `recording_last${requestedDuration}s.${extension}`;
            
            formData.append('audio_file', audioToTranscribe, filename);
            formData.append('duration', String(requestedDuration));
            
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
            
            if (result.success) {
                transcriptionResult.value = result.text || '未识别到文字';
                console.log(`[SUCCESS] 转录完成`);
                
                // 🔥 添加到历史记录
                if (result.text) {
                    addToHistory(result.text);
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
                        try {
                            await navigator.clipboard.writeText(result.text);
                            console.log('[INFO] ✅ 自动复制成功');
                            // 显示复制成功提示
                            const originalHTML = copyBtn.innerHTML;
                            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                            copyBtn.style.background = '#2ecc71';
                            setTimeout(() => {
                                copyBtn.innerHTML = originalHTML;
                                copyBtn.style.background = '';
                            }, 2000);
                        } catch (err) {
                            // 🔥 改进：区分不同的错误类型
                            if (err.name === 'NotAllowedError' && err.message.includes('not focused')) {
                                console.warn('[WARNING] ⚠️ 自动复制失败：文档未聚焦（用户可能在其他标签页）');
                                console.log('[INFO] 将在用户返回页面时尝试复制');
                                
                                // 显示温和的提示，不显示为错误
                                const originalHTML = copyBtn.innerHTML;
                                copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                                copyBtn.style.background = '#4a9eff'; // 蓝色，提示操作
                                
                                // 监听文档重新获得焦点，自动尝试复制
                                const autoRetry = async () => {
                                    try {
                                        await navigator.clipboard.writeText(result.text);
                                        console.log('[INFO] ✅ 重新聚焦后自动复制成功');
                                        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
                                        copyBtn.style.background = '#2ecc71';
                                        setTimeout(() => {
                                            copyBtn.innerHTML = originalHTML;
                                            copyBtn.style.background = '';
                                        }, 2000);
                                        // 移除监听器
                                        window.removeEventListener('focus', autoRetry);
                                    } catch (retryErr) {
                                        console.log('[INFO] 重试复制失败，用户需要手动点击');
                                    }
                                };
                                
                                // 当用户返回页面时自动重试
                                window.addEventListener('focus', autoRetry, { once: true });
                                
                                // 10秒后恢复按钮样式
                                setTimeout(() => {
                                    copyBtn.innerHTML = originalText;
                                    copyBtn.style.background = '';
                                }, 10000);
                            } else {
                                // 其他类型的错误
                                console.error('[ERROR] 自动复制失败:', err.name, '-', err.message);
                                const originalText = copyBtn.innerHTML;
                                copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
                                copyBtn.style.background = '#f5576c';
                                setTimeout(() => {
                                    copyBtn.innerHTML = originalText;
                                    copyBtn.style.background = '';
                                }, 2000);
                            }
                        }
                    }
                    
                    // 🔥 注意：自动录音逻辑已移至 stopRecording() 函数
                    // 自动录音现在在转录开始前就已经启动（无缝衔接）
                    // 这里不再需要启动录音，因为录音已经在后台进行
                }
            } else {
                transcriptionResult.value = `Error: ${result.message || 'Transcription failed'}`;
                console.error(`[ERROR] 转录失败: ${result.message}`);
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
            
            // 显示错误
            transcriptionResult.value = `错误: ${error.message}`;
        } finally {
            loadingIndicator.style.visibility = 'hidden';
            
            // 🔥 恢复转录状态（启用转录按钮）
            isTranscribing = false;
            recordBtn.disabled = false;
            // 如果仍在录音，恢复录音状态显示
            if (isRecording) {
                recordingStatus.textContent = 'Recording...';
            } else {
                recordingStatus.textContent = 'Recording stopped';
            }
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
                const wavBlob = audioBufferToWav(audioBuffer);
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
            const wavBlob = audioBufferToWav(segmentBuffer);
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

    // AudioBuffer 转 WAV Blob
    function audioBufferToWav(buffer) {
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;
        const channels = buffer.numberOfChannels;
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
        view.setUint32(4, 36 + dataSize, true); // File size - 8
        writeString(8, 'WAVE');
        
        // fmt chunk
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 1, true); // Audio format (1 = PCM)
        view.setUint16(22, channels, true); // Number of channels
        view.setUint32(24, sampleRate, true); // Sample rate
        view.setUint32(28, sampleRate * blockAlign, true); // Byte rate
        view.setUint16(32, blockAlign, true); // Block align
        view.setUint16(34, 16, true); // Bits per sample
        
        // data chunk
        writeString(36, 'data');
        view.setUint32(40, dataSize, true); // Data size
        
        // 写入音频数据（交错格式：L, R, L, R, ...）
        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < channels; channel++) {
                const channelData = buffer.getChannelData(channel);
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
    function addToHistory(text) {
        if (!text || text.trim() === '') return;
        
        const historyItem = {
            id: Date.now(),
            timestamp: new Date(),
            text: text.trim()
        };
        
        transcriptionHistory.unshift(historyItem); // 添加到开头（最新的在前）
        console.log(`[INFO] 已添加转录到历史记录，总数: ${transcriptionHistory.length}`);
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
                    <button class="history-item-copy" data-text="${encodeURIComponent(item.text)}" title="Copy to clipboard">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy
                    </button>
                </div>
                <div class="history-item-text">${item.text}</div>
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
            console.log('[INFO] 已清空所有转录历史记录');
        }
    });
    
    // ESC键关闭Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && historyModal.classList.contains('show')) {
            historyModal.classList.remove('show');
            console.log('[INFO] ESC键关闭转录历史记录');
        }
    });
});
