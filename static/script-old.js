let mediaRecorder = null;
let audioChunks = []; // 存储音频块数据
let chunkTimestamps = []; // 存储每个chunk的时间戳，用于精确管理
let recordedMimeType = 'audio/webm;codecs=opus'; // 保存实际录制的MIME类型
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let maxRecordingDuration = 10000; // 10秒

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('recordBtn');
    const recordBtnText = document.getElementById('recordBtnText');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordingTime = document.getElementById('recordingTime');
    const transcribeOptions = document.getElementById('transcribeOptions');
    const actionButtons = document.getElementById('actionButtons');
    const playAudioBtn = document.getElementById('playAudioBtn');
    const transcribeBtn = document.getElementById('transcribeBtn');
    const audioPlayer = document.getElementById('audioPlayer');
    const resultSection = document.getElementById('resultSection');
    const transcriptionResult = document.getElementById('transcriptionResult');
    const copyBtn = document.getElementById('copyBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // 录音按钮点击事件
    recordBtn.addEventListener('click', async () => {
        if (!isRecording) {
            await startRecording();
        } else {
            stopRecording();
        }
    });

    // 转录选项按钮点击事件（显示操作按钮）
    document.querySelectorAll('.transcribe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const duration = parseInt(btn.dataset.duration);
            // 显示操作按钮区域
            actionButtons.style.display = 'block';
            // 保存duration到actionButtons的data属性中
            actionButtons.dataset.duration = duration;
        });
    });

    // 播放音频按钮点击事件
    playAudioBtn.addEventListener('click', async () => {
        if (audioChunks.length === 0) {
            alert('没有可用的音频数据');
            return;
        }
        
        // 检查音频是否被清理过（WebM结构可能损坏）
        // MediaRecorder每1秒保存一次数据，所以第一个chunk的时间戳通常是1000ms左右
        // 只有当第一个chunk的时间戳明显大于预期（比如 > 5000ms，即5秒）时，才说明前面的chunk被删除了
        let hasBeenCleaned = false;
        
        if (chunkTimestamps.length > 0) {
            const firstChunkTime = chunkTimestamps[0];
            const lastChunkTime = chunkTimestamps[chunkTimestamps.length - 1];
            
            // 计算实际录音时长：使用最后一个chunk的时间戳（因为它代表录音的总时长）
            // 如果最后一个chunk时间戳小于第一个，说明有问题，使用第一个chunk时间戳
            const actualRecordingDuration = Math.max(firstChunkTime, lastChunkTime) / 1000; // 转换为秒
            
            // MediaRecorder每1秒保存一次数据，所以第一个chunk的时间戳通常是1000-2000ms左右
            // 只有当第一个chunk的时间戳明显大于预期（比如 > 5000ms，即5秒）时，才说明前面的chunk被删除了
            // 或者如果录音时长超过10秒，且chunk数量明显少于预期
            const expectedChunks = Math.ceil(actualRecordingDuration);
            const chunkCountRatio = audioChunks.length / Math.max(expectedChunks, 1);
            
            // 只有当第一个chunk时间戳 > 5000ms（说明前面的chunk被删除了）时才判断为已清理
            // 或者录音时长超过10秒且chunk数量明显不足
            hasBeenCleaned = (firstChunkTime > 5000) || (actualRecordingDuration > 10 && chunkCountRatio < 0.8);
            
            console.log('[INFO] 播放音频检测:');
            console.log('  - 实际录音时长:', actualRecordingDuration.toFixed(2), '秒');
            console.log('  - 音频块数量:', audioChunks.length);
            console.log('  - 预期chunk数量:', expectedChunks);
            console.log('  - Chunk数量比例:', (chunkCountRatio * 100).toFixed(1) + '%');
            console.log('  - 第一个chunk时间戳:', firstChunkTime, 'ms');
            console.log('  - 最后一个chunk时间戳:', lastChunkTime, 'ms');
            console.log('  - 是否被清理:', hasBeenCleaned, '(阈值: 第一个chunk > 5000ms 或 时长>10秒且chunk<80%)');
        } else {
            console.log('[INFO] 播放音频检测: 没有chunk时间戳信息');
        }
        
        try {
            // 计算录音时长
            const elapsed = recordingStartTime ? (Date.now() - recordingStartTime) : 0;
            const actualRecordingDuration = chunkTimestamps.length > 0 
                ? (Math.max(...chunkTimestamps) / 1000)
                : (elapsed / 1000);
            
            // 使用保存的MIME类型
            const actualMimeType = recordedMimeType || 'audio/webm;codecs=opus';
            console.log('[INFO] 播放音频 - MIME类型:', actualMimeType);
            console.log('[INFO] 音频块数量:', audioChunks.length);
            console.log('[INFO] 音频块总大小:', audioChunks.reduce((sum, chunk) => sum + chunk.size, 0), 'bytes');
            console.log('[INFO] 录音时长:', actualRecordingDuration.toFixed(2), '秒');
            console.log('[INFO] 音频是否被清理:', hasBeenCleaned);
            
            // 如果音频超过10秒或被清理过，需要提取最后10秒
            const needExtractLast10Seconds = actualRecordingDuration > 10 || hasBeenCleaned;
            
            let audioBlobToPlay;
            
            if (needExtractLast10Seconds) {
                console.log('[INFO] 音频超过10秒或被清理，将提取最后10秒进行播放');
                try {
                    // 创建完整的音频blob
                    const fullAudioBlob = new Blob(audioChunks, { type: actualMimeType });
                    
                    // 使用Web Audio API提取最后10秒
                    audioBlobToPlay = await extractAudioSegment(fullAudioBlob, 10);
                    console.log('[INFO] ✅ 成功提取最后10秒音频');
                    console.log('[INFO] 提取后的音频大小:', (audioBlobToPlay.size / 1024).toFixed(2), 'KB');
                } catch (extractError) {
                    console.error('[ERROR] 提取最后10秒失败:', extractError);
                    console.error('[ERROR] 错误详情:', extractError.message);
                    
                    // 如果WebM结构损坏无法解码，提示用户
                    if (extractError.name === 'EncodingError' || extractError.message.includes('decode')) {
                        console.warn('[WARNING] WebM文件结构可能损坏，无法解码');
                        alert('⚠️ 音频无法播放\n\n原因：录音时长超过10秒，音频数据已被清理，WebM文件结构损坏无法解码。\n\n建议：请使用"直接转录"功能，服务器端可以正确处理音频文件并提取最后10秒。');
                        return;
                    }
                    
                    // 其他错误，尝试使用完整音频
                    console.log('[INFO] 提取失败，尝试使用完整音频播放');
                    audioBlobToPlay = new Blob(audioChunks, { type: actualMimeType });
                }
            } else {
                // 音频不超过10秒，直接使用完整音频
                audioBlobToPlay = new Blob(audioChunks, { type: actualMimeType });
            }
            
            // 使用处理后的音频Blob创建URL
            const audioUrl = URL.createObjectURL(audioBlobToPlay);
            
            // 检查浏览器是否支持该格式
            const canPlay = audioPlayer.canPlayType(audioBlobToPlay.type);
            console.log('[INFO] 浏览器支持检测:', canPlay);
            console.log('[INFO] 创建的音频URL:', audioUrl);
            console.log('[INFO] Blob大小:', audioBlobToPlay.size, 'bytes');
            console.log('[INFO] Blob类型:', audioBlobToPlay.type);
            
            if (!canPlay || canPlay === '') {
                console.warn('[WARNING] 浏览器可能不支持该音频格式:', audioBlobToPlay.type);
                // 尝试使用通用的webm类型
                const fallbackBlob = new Blob([audioBlobToPlay], { type: 'audio/webm' });
                const fallbackUrl = URL.createObjectURL(fallbackBlob);
                audioPlayer.src = fallbackUrl;
                console.log('[INFO] 尝试使用备用格式: audio/webm');
                // 清理之前的URL
                URL.revokeObjectURL(audioUrl);
            } else {
                audioPlayer.src = audioUrl;
            }
            
            audioPlayer.style.display = 'block';
            
            // 添加错误处理
            let errorHandled = false;
            audioPlayer.onerror = (e) => {
                if (errorHandled) return;
                errorHandled = true;
                
                console.error('[ERROR] 音频播放错误:', e);
                console.error('[ERROR] 错误代码:', audioPlayer.error ? audioPlayer.error.code : 'unknown');
                console.error('[ERROR] 错误消息:', audioPlayer.error ? audioPlayer.error.message : 'unknown');
                
                // 清理URL
                if (audioPlayer.src.startsWith('blob:')) {
                    URL.revokeObjectURL(audioPlayer.src);
                }
                
                alert('播放音频失败\n\n原因：WebM文件可能损坏或浏览器不支持该格式。\n\n建议：请使用"直接转录"功能，服务器端可以正确处理音频文件。');
            };
            
            // 当音频播放结束时，清理URL对象
            audioPlayer.onended = () => {
                console.log('[INFO] 音频播放结束');
                if (audioPlayer.src.startsWith('blob:')) {
                    URL.revokeObjectURL(audioPlayer.src);
                }
            };
            
            // 尝试播放
            await audioPlayer.play();
            console.log('[INFO] 音频播放成功');
            
        } catch (err) {
            console.error('[ERROR] 播放音频异常:', err);
            console.error('[ERROR] 错误名称:', err.name);
            console.error('[ERROR] 错误消息:', err.message);
            
            let errorMsg = '播放音频失败';
            if (err.name === 'NotAllowedError') {
                errorMsg = '播放被阻止，请检查浏览器的自动播放设置';
            } else if (err.name === 'NotSupportedError') {
                errorMsg = '浏览器不支持该音频格式，请尝试使用"直接转录"功能';
            } else {
                errorMsg = `播放失败: ${err.message}\n\n建议：请使用"直接转录"功能，服务器端可以正确处理音频文件。`;
            }
            
            alert(errorMsg);
        }
    });

    // 直接转录按钮点击事件
    transcribeBtn.addEventListener('click', async () => {
        const duration = parseInt(actionButtons.dataset.duration || '10');
        await transcribeAudio(duration);
    });

    // 复制按钮点击事件
    copyBtn.addEventListener('click', () => {
        const text = transcriptionResult.value;
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.innerHTML = '<span>✓</span> 已复制';
                setTimeout(() => {
                    copyBtn.innerHTML = '<span>📋</span> 复制';
                }, 2000);
            }).catch(err => {
                console.error('复制失败:', err);
                // 备用方案：选中文本
                transcriptionResult.select();
                document.execCommand('copy');
                copyBtn.innerHTML = '<span>✓</span> 已复制';
                setTimeout(() => {
                    copyBtn.innerHTML = '<span>📋</span> 复制';
                }, 2000);
            });
        }
    });

    // 开始录音
    let audioStream = null; // 保存音频流，用于重新启动录制
    let dataAvailableHandler = null; // 保存事件处理器引用
    
    async function startRecording() {
        try {
            // 如果stream不存在或已结束，重新获取
            if (!audioStream || !audioStream.getTracks() || audioStream.getTracks().some(track => track.readyState === 'ended')) {
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
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
            
            mediaRecorder = new MediaRecorder(audioStream, options);
            recordedMimeType = options.mimeType; // 保存实际使用的MIME类型
            
            // 如果是第一次开始录音，重置数组
            if (!isRecording) {
                audioChunks = [];
                chunkTimestamps = []; // 重置时间戳数组
            }
            
            console.log('[INFO] 开始录音，使用MIME类型:', recordedMimeType);
            
            // 用于跟踪是否需要重新开始录制
            let restartTimer = null;
            
            // 定义事件处理器函数
            dataAvailableHandler = async (event) => {
                if (event.data.size > 0) {
                    const currentTime = Date.now();
                    const elapsed = currentTime - recordingStartTime; // 从录音开始到现在经过的时间
                    const chunkTimestamp = elapsed; // chunk相对于录音开始的时间戳
                    
                    // 添加新的chunk和时间戳
                    audioChunks.push(event.data);
                    chunkTimestamps.push(chunkTimestamp);
                    
                    // ✅ 新方案：当超过10秒时，重新开始录制，只保留最后10秒
                    // 这样可以确保WebM结构完整，同时节省内存
                    if (elapsed > maxRecordingDuration && mediaRecorder.state === 'recording' && !restartTimer) {
                        restartTimer = setTimeout(async () => {
                            try {
                                console.log(`[INFO] 录音时长超过${maxRecordingDuration/1000}秒，准备重新开始录制以保持WebM结构完整`);
                                
                                // 停止当前录制
                                if (mediaRecorder.state === 'recording') {
                                    mediaRecorder.stop();
                                }
                                
                                // 等待当前chunk处理完成和MediaRecorder完全停止
                                await new Promise(resolve => setTimeout(resolve, 200));
                                
                                // 只保留最后10秒的数据（最后10个chunk）
                                const maxChunks = 10;
                                if (audioChunks.length > maxChunks) {
                                    const removedCount = audioChunks.length - maxChunks;
                                    // 删除最早的chunk，但保留第一个chunk（WebM文件头）
                                    // 注意：我们需要保留第一个chunk（文件头），然后保留最后9个chunk
                                    if (removedCount > 0) {
                                        // 保留第一个chunk（文件头）和最后9个chunk
                                        const firstChunk = audioChunks[0];
                                        const lastChunks = audioChunks.slice(-maxChunks + 1);
                                        audioChunks = [firstChunk, ...lastChunks];
                                        
                                        const firstTimestamp = chunkTimestamps[0];
                                        const lastTimestamps = chunkTimestamps.slice(-maxChunks + 1);
                                        chunkTimestamps = [firstTimestamp, ...lastTimestamps];
                                        
                                        console.log(`[INFO] 清理了 ${removedCount} 个旧音频块（保留第一个chunk和最后 ${maxChunks - 1} 个chunk）`);
                                    }
                                }
                                
                                // 计算保留的音频时长
                                const retainedDuration = chunkTimestamps.length > 0 
                                    ? (chunkTimestamps[chunkTimestamps.length - 1] - chunkTimestamps[0])
                                    : 0;
                                
                                // 调整recordingStartTime，使时间戳正确
                                recordingStartTime = Date.now() - retainedDuration;
                                
                                    // 重新创建MediaRecorder（使用相同的stream）
                                    if (audioStream && audioStream.getTracks() && audioStream.getTracks().some(track => track.readyState === 'live')) {
                                        mediaRecorder = new MediaRecorder(audioStream, {
                                            mimeType: recordedMimeType
                                        });
                                        
                                        // 重新设置事件处理器
                                        mediaRecorder.ondataavailable = dataAvailableHandler;
                                    mediaRecorder.onstop = () => {
                                        // 只在用户手动停止时才停止stream
                                        if (!isRecording) {
                                            audioStream.getTracks().forEach(track => track.stop());
                                        }
                                    };
                                    
                                    // 重新开始录制
                                    console.log(`[INFO] 重新开始录制，保持WebM结构完整`);
                                    mediaRecorder.start(1000); // 每1秒保存一次数据
                                    
                                    console.log(`[INFO] 重新录制后状态:`);
                                    console.log(`  - 保留的音频块数量: ${audioChunks.length}`);
                                    console.log(`  - 保留的音频时长: ${(retainedDuration / 1000).toFixed(2)}秒`);
                                    console.log(`  - 总录音时长: ${(elapsed / 1000).toFixed(2)}秒（仅保留最后10秒）`);
                                } else {
                                    console.error('[ERROR] 音频流已结束，无法重新开始录制');
                                }
                                
                                restartTimer = null;
                            } catch (error) {
                                console.error('[ERROR] 重新开始录制失败:', error);
                                restartTimer = null;
                            }
                        }, 100); // 延迟100ms执行，避免在ondataavailable中直接操作
                    }
                }
            };
            
            // 设置事件处理器
            mediaRecorder.ondataavailable = dataAvailableHandler;
            
            mediaRecorder.onstop = () => {
                if (audioStream && audioStream.getTracks) {
                    audioStream.getTracks().forEach(track => track.stop());
                }
            };
            
            // 每1秒保存一次数据，方便管理
            mediaRecorder.start(1000);
            
            isRecording = true;
            recordingStartTime = Date.now();
            
            // 更新UI
            recordBtn.classList.add('recording');
            recordBtnText.textContent = '停止录音';
            recordingStatus.textContent = '正在录音中...';
            transcribeOptions.style.display = 'none';
            actionButtons.style.display = 'none';
            resultSection.style.display = 'none';
            
            // 更新录音时间
            recordingTimer = setInterval(() => {
                const elapsed = Date.now() - recordingStartTime;
                const seconds = Math.floor(elapsed / 1000);
                const minutes = Math.floor(seconds / 60);
                const displaySeconds = seconds % 60;
                recordingTime.textContent = `${String(minutes).padStart(2, '0')}:${String(displaySeconds).padStart(2, '0')}`;
                
                // 如果超过60秒，显示警告
                if (elapsed > maxRecordingDuration) {
                    recordingStatus.textContent = '录音中（仅保留最后60秒）...';
                }
            }, 100);
            
        } catch (error) {
            console.error('无法访问麦克风:', error);
            alert('无法访问麦克风，请检查权限设置');
        }
    }

    // 停止录音
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        isRecording = false;
        clearInterval(recordingTimer);
        
        // 记录最终状态
        const elapsed = Date.now() - recordingStartTime;
        const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.size, 0);
        // 计算实际保留的音频时长：从最早的chunk到当前时间
        const retainedDuration = chunkTimestamps.length > 0 
            ? (Date.now() - recordingStartTime - chunkTimestamps[0])
            : elapsed;
        
        console.log(`[INFO] 录音停止:`);
        console.log(`  - 总录音时长: ${(elapsed / 1000).toFixed(2)}秒`);
        console.log(`  - 保留的音频块数量: ${audioChunks.length}`);
        console.log(`  - 保留的音频时长: ${(retainedDuration / 1000).toFixed(2)}秒`);
        console.log(`  - 保留的数据大小: ${(totalSize / 1024).toFixed(2)} KB`);
        
        // 如果保留的时长接近10秒，说明清理机制工作正常
        if (retainedDuration >= maxRecordingDuration * 0.95) {
            console.log(`[INFO] ✅ 清理机制工作正常，已保留最后10秒数据`);
        }
        
        // 更新UI
        recordBtn.classList.remove('recording');
        recordBtnText.textContent = '开始录音';
        recordingStatus.textContent = '录音已停止';
        transcribeOptions.style.display = 'block';
        actionButtons.style.display = 'none';
    }

    // 转录音频
    async function transcribeAudio(duration) {
        const startTime = Date.now();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[INFO] 开始转录流程 - 目标时长: ${duration}秒`);
        console.log(`${'='.repeat(80)}\n`);
        
        if (audioChunks.length === 0) {
            console.error('[ERROR] 没有可用的音频数据');
            alert('没有可用的音频数据');
            return;
        }
        
        const elapsed = Date.now() - recordingStartTime;
        const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.size, 0);
        // 计算实际保留的音频时长：从最早的chunk到当前时间
        const retainedDuration = chunkTimestamps.length > 0 
            ? (Date.now() - recordingStartTime - chunkTimestamps[0])
            : elapsed;
        
        console.log(`[INFO] 音频块数量: ${audioChunks.length}`);
        console.log(`[INFO] 录音总时长: ${recordingTime.textContent} (${(elapsed / 1000).toFixed(2)}秒)`);
        console.log(`[INFO] 实际保留的音频时长: ${(retainedDuration / 1000).toFixed(2)}秒`);
        console.log(`[INFO] 实际保留的数据大小: ${(totalSize / 1024).toFixed(2)} KB`);
        
        // 如果保留的时长已经接近或等于请求的时长，就不需要再截取了
        if (retainedDuration <= duration + 1) { // 允许1秒的误差
            console.log(`[INFO] 保留的音频时长 (${(retainedDuration / 1000).toFixed(2)}秒) 已接近请求时长 (${duration}秒)，无需截取`);
        }
        
        loadingIndicator.style.display = 'block';
        resultSection.style.display = 'block';
        transcriptionResult.value = '';
        
        try {
            // 创建完整的音频blob
            const fullAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            console.log(`[INFO] 完整音频 Blob:`);
            console.log(`  - 大小: ${(fullAudioBlob.size / 1024).toFixed(2)} KB`);
            console.log(`  - 类型: ${fullAudioBlob.type}`);
            
            // 决定是否需要截取音频
            // ⚠️ 关键问题：MediaRecorder的chunk不是独立的音频文件，删除前面的chunk会导致WebM文件结构不完整
            let audioToTranscribe = fullAudioBlob;
            let wasSegmented = false;
            let needsServerSideSegmentation = false; // 标记是否需要服务器端截取
            
            // 检查是否经过了清理（如果chunk数量 <= 10，说明可能经过了清理）
            const hasBeenCleaned = audioChunks.length <= 10 && elapsed > maxRecordingDuration;
            
            // 如果保留的时长已经接近或等于请求的时长（允许1秒误差），直接使用完整音频
            if (retainedDuration <= duration + 1) {
                console.log(`[INFO] 保留的音频时长 (${(retainedDuration / 1000).toFixed(2)}秒) 已接近请求时长 (${duration}秒)，直接使用完整音频，无需截取`);
            } else {
                // 如果保留的时长大于请求的时长，需要截取
                console.log(`[INFO] 保留的音频时长 (${(retainedDuration / 1000).toFixed(2)}秒) 大于请求时长 (${duration}秒)，需要截取最后 ${duration} 秒`);
                
                // ⚠️ 优化：如果音频已经过清理（WebM结构可能损坏），直接使用服务器端截取
                // 避免不必要的浏览器端解码尝试，节省时间和资源
                if (hasBeenCleaned) {
                    console.log(`[INFO] 音频已经过清理，WebM文件结构可能不完整`);
                    console.log(`[INFO] 直接使用服务器端截取（跳过浏览器端尝试，节省时间）`);
                    needsServerSideSegmentation = true;
                    audioToTranscribe = fullAudioBlob;
                } else {
                    // 音频未经过清理，WebM结构完整，尝试浏览器端截取
                    console.log(`[INFO] 音频未经过清理，WebM文件结构完整，尝试浏览器端截取`);
                    
                    try {
                        // 尝试解码音频以获取实际时长
                        const arrayBuffer = await fullAudioBlob.arrayBuffer();
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        
                        try {
                            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                            const actualAudioDuration = audioBuffer.length / audioBuffer.sampleRate;
                            audioContext.close();
                            
                            console.log(`[INFO] 检测到音频实际时长: ${actualAudioDuration.toFixed(2)}秒`);
                            
                            // 如果实际时长大于请求的时长，需要截取最后N秒
                            if (actualAudioDuration > duration) {
                                console.log(`[INFO] 音频时长 (${actualAudioDuration.toFixed(2)}秒) 大于请求时长 (${duration}秒)，尝试截取最后 ${duration} 秒`);
                                const originalSize = fullAudioBlob.size;
                                audioToTranscribe = await extractAudioSegment(fullAudioBlob, duration);
                                
                                // 检查是否成功截取（如果大小明显不同，说明截取成功）
                                wasSegmented = (audioToTranscribe.size < originalSize * 0.8) || 
                                               (audioToTranscribe.type !== fullAudioBlob.type);
                                
                                if (wasSegmented) {
                                    console.log(`[INFO] ✅ 浏览器端截取成功`);
                                    console.log(`[INFO] 截取后的音频:`);
                                    console.log(`  - 大小: ${(audioToTranscribe.size / 1024).toFixed(2)} KB`);
                                    console.log(`  - 类型: ${audioToTranscribe.type}`);
                                } else {
                                    console.log(`[WARNING] 浏览器端截取失败，将使用完整音频，由服务器端截取`);
                                    needsServerSideSegmentation = true;
                                    audioToTranscribe = fullAudioBlob;
                                }
                            } else {
                                console.log(`[INFO] 音频时长 (${actualAudioDuration.toFixed(2)}秒) 小于等于请求时长 (${duration}秒)，使用完整音频`);
                            }
                        } catch (decodeError) {
                            console.warn(`[WARNING] Web Audio API 解码失败: ${decodeError.name} - ${decodeError.message}`);
                            console.warn(`[WARNING] 浏览器端无法截取，将发送完整音频到服务器端截取`);
                            audioContext.close();
                            needsServerSideSegmentation = true;
                            audioToTranscribe = fullAudioBlob;
                        }
                    } catch (error) {
                        console.error(`[ERROR] 获取音频时长时发生错误: ${error.message}`);
                        console.warn(`[WARNING] 浏览器端无法截取，将发送完整音频到服务器端截取`);
                        needsServerSideSegmentation = true;
                        audioToTranscribe = fullAudioBlob;
                    }
                }
            }
            
            // 创建 FormData
            const formData = new FormData();
            
            // 根据duration确定文件名
            const extension = audioToTranscribe.type.includes('webm') ? 'webm' : 
                             audioToTranscribe.type.includes('wav') ? 'wav' : 
                             audioToTranscribe.type.includes('mp3') ? 'mp3' : 'mp4';
            const filename = `recording_${duration}s.${extension}`;
            
            console.log(`[INFO] 准备上传:`);
            console.log(`  - 文件名: ${filename}`);
            console.log(`  - 文件大小: ${(audioToTranscribe.size / 1024).toFixed(2)} KB`);
            console.log(`  - 文件类型: ${audioToTranscribe.type}`);
            
            formData.append('audio_file', audioToTranscribe, filename);
            formData.append('duration', duration.toString());
            // 如果浏览器端截取失败或跳过，标记需要服务器端截取
            if (needsServerSideSegmentation) {
                formData.append('needs_segmentation', 'true');
                console.log(`[INFO] 标记：需要服务器端截取最后 ${duration} 秒`);
                // 更新UI提示
                if (transcriptionResult) {
                    const originalText = transcriptionResult.value;
                    transcriptionResult.value = '正在使用服务器端截取音频片段，可能需要更长时间...';
                }
            }
            
            // 发送到服务器
            console.log(`[INFO] 发送请求到服务器...`);
            const requestStartTime = Date.now();
            const response = await fetch('/transcribe-segment', {
                method: 'POST',
                body: formData
            });
            const requestEndTime = Date.now();
            const requestDuration = (requestEndTime - requestStartTime) / 1000;
            
            console.log(`[INFO] 服务器响应:`);
            console.log(`  - 状态码: ${response.status}`);
            console.log(`  - 请求耗时: ${requestDuration.toFixed(2)}秒`);
            console.log(`  - Content-Type: ${response.headers.get('content-type')}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[ERROR] HTTP 错误响应:`);
                console.error(`  - 状态码: ${response.status}`);
                console.error(`  - 响应内容: ${errorText.substring(0, 500)}`);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText.substring(0, 200)}`);
            }
            
            const result = await response.json();
            console.log(`[INFO] 解析后的响应:`);
            console.log(`  - Success: ${result.success}`);
            console.log(`  - Message: ${result.message || 'N/A'}`);
            console.log(`  - Text length: ${result.text ? result.text.length : 0}`);
            
            // 如果有调试信息，也打印出来
            if (result.debug_info) {
                console.log(`[DEBUG] 服务器调试信息:`);
                console.log(JSON.stringify(result.debug_info, null, 2));
            }
            
            if (result.success) {
                transcriptionResult.value = result.text || '未识别到文字';
                console.log(`[SUCCESS] 转录完成`);
            } else {
                let errorMsg = `错误: ${result.message || '转录失败'}`;
                
                // 如果是 WebM 格式错误，提供额外建议
                if (result.message && result.message.includes('WebM')) {
                    errorMsg += '\n\n💡 提示：WebM 格式可能不被支持，可以尝试使用 Google Speech-to-Text API。';
                }
                
                transcriptionResult.value = errorMsg;
                console.error(`[ERROR] 转录失败: ${result.message}`);
                
                // 如果有调试信息，添加到错误消息中
                if (result.debug_info) {
                    console.error(`[DEBUG] 详细错误信息:`, result.debug_info);
                    
                    // 在控制台显示完整的调试信息
                    if (result.debug_info.error_detail) {
                        console.error(`[DEBUG] API 错误详情:`, result.debug_info.error_detail);
                    }
                    if (result.debug_info.error_response_json) {
                        console.error(`[DEBUG] API 错误响应:`, result.debug_info.error_response_json);
                    }
                    if (result.debug_info.error_response_text) {
                        console.error(`[DEBUG] API 错误文本:`, result.debug_info.error_response_text);
                    }
                }
            }
            
            const totalDuration = (Date.now() - startTime) / 1000;
            console.log(`\n${'='.repeat(80)}`);
            console.log(`[INFO] 转录流程完成 - 总耗时: ${totalDuration.toFixed(2)}秒`);
            console.log(`${'='.repeat(80)}\n`);
            
        } catch (error) {
            console.error(`\n${'='.repeat(80)}`);
            console.error(`[EXCEPTION] 转录过程中发生异常`);
            console.error(`  - 错误类型: ${error.name}`);
            console.error(`  - 错误消息: ${error.message}`);
            console.error(`  - 错误堆栈:`, error.stack);
            console.error(`${'='.repeat(80)}\n`);
            transcriptionResult.value = `错误: ${error.message}`;
        } finally {
            loadingIndicator.style.display = 'none';
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
                console.warn(`尝试使用替代方法...`);
                
                // 如果 WebM 解码失败，尝试使用 MediaRecorder 重新编码
                // 或者直接返回原始音频，让服务器处理
                console.warn(`无法在浏览器中截取 WebM 音频，将使用完整音频文件`);
                audioContext.close();
                return audioBlob;
            }
            
            const sampleRate = audioBuffer.sampleRate;
            const channels = audioBuffer.numberOfChannels;
            const totalSamples = audioBuffer.length;
            const totalDuration = totalSamples / sampleRate;
            const targetSamples = sampleRate * durationSeconds;
            
            console.log(`音频信息: 采样率=${sampleRate}Hz, 声道数=${channels}, 总时长=${totalDuration.toFixed(2)}秒`);
            
            // 如果音频时长小于请求的时长，返回完整音频
            if (totalDuration <= durationSeconds) {
                console.log(`音频时长 (${totalDuration.toFixed(2)}秒) 小于请求时长 (${durationSeconds}秒)，返回完整音频`);
                audioContext.close();
                return audioBlob;
            }
            
            // 获取最后N秒的数据
            const startSample = Math.max(0, totalSamples - targetSamples);
            const segmentLength = totalSamples - startSample;
            const actualDuration = segmentLength / sampleRate;
            
            console.log(`提取片段: 起始样本=${startSample}, 长度=${segmentLength}, 实际时长=${actualDuration.toFixed(2)}秒`);
            
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
            console.warn('将使用完整音频文件进行转录');
            return audioBlob; // 如果失败，返回原始blob
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
});
