// 全局变量
let mediaRecorder = null;
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let recordedMimeType = 'audio/webm;codecs=opus';
let maxRecordingDuration = 10000; // 10秒
let cleanupTimer = null; // 定期清理定时器

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化IndexedDB存储
    try {
        await audioStorage.init();
        console.log('[INFO] IndexedDB存储初始化成功');
    } catch (error) {
        console.error('[ERROR] IndexedDB初始化失败:', error);
        alert('浏览器存储初始化失败，录音功能可能无法正常使用');
    }

    const recordBtn = document.getElementById('recordBtn');
    const recordBtnText = document.getElementById('recordBtnText');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordingTime = document.getElementById('recordingTime');
    const transcribeOptions = document.getElementById('transcribeOptions');
    const transcribeLast10Btn = document.getElementById('transcribeLast10Btn');
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
            await stopRecording();
        }
    });

    // 转录最后10秒按钮点击事件
    transcribeLast10Btn.addEventListener('click', async () => {
        await transcribeLast10Seconds();
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
    async function startRecording() {
        try {
            // 清空之前的录音数据
            await audioStorage.clearAll();
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
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
            
            console.log('[INFO] 开始录音，使用MIME类型:', recordedMimeType);
            
            // 数据可用事件：保存到IndexedDB
            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    const currentTime = Date.now();
                    const elapsed = currentTime - recordingStartTime;
                    const chunkTimestamp = elapsed;
                    
                    // 保存chunk到IndexedDB
                    try {
                        await audioStorage.saveChunk(event.data, chunkTimestamp);
                        console.log(`[INFO] 保存音频chunk: ${(chunkTimestamp/1000).toFixed(2)}秒`);
                    } catch (error) {
                        console.error('[ERROR] 保存chunk失败:', error);
                    }
                }
            };
            
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
            };
            
            // 每1秒保存一次数据
            mediaRecorder.start(1000);
            
            isRecording = true;
            recordingStartTime = Date.now();
            
            // 启动定期清理任务（每30秒清理一次）
            audioStorage.startCleanupTimer(recordingStartTime);
            
            // 更新UI
            recordBtn.classList.add('recording');
            recordBtnText.textContent = '停止录音';
            recordingStatus.textContent = '正在录音中...';
            transcribeOptions.style.display = 'none';
            resultSection.style.display = 'none';
            
            // 更新录音时间
            recordingTimer = setInterval(() => {
                const elapsed = Date.now() - recordingStartTime;
                const seconds = Math.floor(elapsed / 1000);
                const minutes = Math.floor(seconds / 60);
                const displaySeconds = seconds % 60;
                recordingTime.textContent = `${String(minutes).padStart(2, '0')}:${String(displaySeconds).padStart(2, '0')}`;
                
                // 如果超过10秒，显示提示
                if (elapsed > maxRecordingDuration) {
                    recordingStatus.textContent = '录音中（仅保留最后10秒）...';
                }
            }, 100);
            
        } catch (error) {
            console.error('无法访问麦克风:', error);
            alert('无法访问麦克风，请检查权限设置');
        }
    }

    // 停止录音
    async function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        isRecording = false;
        clearInterval(recordingTimer);
        
        // 停止定期清理任务
        audioStorage.stopCleanupTimer();
        
        // 执行最后一次清理，确保只保留最后10秒
        const currentTime = Date.now();
        await audioStorage.cleanupOldChunks(currentTime);
        
        // 获取存储的数据大小
        const storageSize = await audioStorage.getStorageSize();
        
        const elapsed = Date.now() - recordingStartTime;
        console.log(`[INFO] 录音停止:`);
        console.log(`  - 总录音时长: ${(elapsed / 1000).toFixed(2)}秒`);
        console.log(`  - 存储的数据大小: ${(storageSize / 1024).toFixed(2)} KB`);
        
        // 更新UI
        recordBtn.classList.remove('recording');
        recordBtnText.textContent = '开始录音';
        recordingStatus.textContent = '录音已停止';
        transcribeOptions.style.display = 'block';
    }

    // 转录最后10秒
    async function transcribeLast10Seconds() {
        const startTime = Date.now();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[INFO] 开始转录最后10秒`);
        console.log(`${'='.repeat(80)}\n`);
        
        loadingIndicator.style.display = 'block';
        resultSection.style.display = 'block';
        transcriptionResult.value = '';
        
        try {
            // 从IndexedDB获取所有chunks
            const { chunks, timestamps } = await audioStorage.getAllChunks();
            
            if (chunks.length === 0) {
                alert('没有可用的音频数据');
                loadingIndicator.style.display = 'none';
                return;
            }
            
            console.log(`[INFO] 从IndexedDB获取到 ${chunks.length} 个音频块`);
            
            // 创建完整的音频blob
            const fullAudioBlob = new Blob(chunks, { type: recordedMimeType });
            console.log(`[INFO] 完整音频 Blob:`);
            console.log(`  - 大小: ${(fullAudioBlob.size / 1024).toFixed(2)} KB`);
            console.log(`  - 类型: ${fullAudioBlob.type}`);
            
            // 计算实际录音时长
            const actualDuration = timestamps.length > 0 
                ? (Math.max(...timestamps) - Math.min(...timestamps)) / 1000
                : 0;
            
            console.log(`[INFO] 实际录音时长: ${actualDuration.toFixed(2)}秒`);
            
            // 生成可播放的音频文件（提取最后10秒）
            let audioBlobToPlay;
            let audioBlobToTranscribe;
            
            if (actualDuration > 10) {
                console.log(`[INFO] 录音时长超过10秒，提取最后10秒`);
                try {
                    // 使用Web Audio API提取最后10秒
                    audioBlobToPlay = await extractAudioSegment(fullAudioBlob, 10);
                    audioBlobToTranscribe = audioBlobToPlay;
                    console.log(`[INFO] ✅ 成功提取最后10秒音频`);
                } catch (extractError) {
                    console.error('[ERROR] 提取最后10秒失败:', extractError);
                    // 如果提取失败，使用完整音频，标记需要服务器端截取
                    audioBlobToPlay = fullAudioBlob;
                    audioBlobToTranscribe = fullAudioBlob;
                }
            } else {
                // 录音不超过10秒，直接使用完整音频
                audioBlobToPlay = fullAudioBlob;
                audioBlobToTranscribe = fullAudioBlob;
            }
            
            // 显示可播放的音频文件
            const audioUrl = URL.createObjectURL(audioBlobToPlay);
            audioPlayer.src = audioUrl;
            audioPlayer.style.display = 'block';
            console.log(`[INFO] ✅ 生成可播放的音频文件`);
            
            // 发送到服务器进行转录
            const formData = new FormData();
            const extension = audioBlobToTranscribe.type.includes('webm') ? 'webm' : 
                             audioBlobToTranscribe.type.includes('wav') ? 'wav' : 
                             audioBlobToTranscribe.type.includes('mp3') ? 'mp3' : 'mp4';
            const filename = `recording_last10s.${extension}`;
            
            formData.append('audio_file', audioBlobToTranscribe, filename);
            formData.append('duration', '10');
            
            // 如果录音超过10秒，标记需要服务器端截取
            if (actualDuration > 10) {
                formData.append('needs_segmentation', 'true');
                console.log(`[INFO] 标记：需要服务器端截取最后10秒`);
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
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[ERROR] HTTP 错误响应:`, errorText.substring(0, 500));
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText.substring(0, 200)}`);
            }
            
            const result = await response.json();
            console.log(`[INFO] 解析后的响应:`);
            console.log(`  - Success: ${result.success}`);
            console.log(`  - Message: ${result.message || 'N/A'}`);
            console.log(`  - Text length: ${result.text ? result.text.length : 0}`);
            
            if (result.success) {
                transcriptionResult.value = result.text || '未识别到文字';
                console.log(`[SUCCESS] 转录完成`);
            } else {
                let errorMsg = `错误: ${result.message || '转录失败'}`;
                transcriptionResult.value = errorMsg;
                console.error(`[ERROR] 转录失败: ${result.message}`);
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
                audioContext.close();
                // 如果解码失败，返回原始音频
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
                console.log(`音频时长 (${totalDuration.toFixed(2)}秒) 小于等于请求时长 (${durationSeconds}秒)，返回完整音频`);
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
