/**
 * 音频存储管理模块
 * 使用IndexedDB在浏览器缓存中存储音频数据
 * 只保留最后5分钟的录音，每10秒清理一次
 */

class AudioStorage {
    constructor() {
        this.dbName = 'voiceRecordingDB';
        this.storeName = 'audioChunks';
        this.db = null;
        this.maxDuration = 300000; // 5分钟（毫秒）= 300秒
        this.cleanupInterval = 10000; // 10秒清理一次（更频繁）
        this.cleanupTimer = null;
    }

    /**
     * 初始化IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => {
                console.error('[AudioStorage] IndexedDB打开失败:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[AudioStorage] IndexedDB初始化成功');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'timestamp' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: true });
                    console.log('[AudioStorage] 创建对象存储:', this.storeName);
                }
            };
        });
    }

    /**
     * 保存音频chunk到IndexedDB
     */
    async saveChunk(chunk, timestamp) {
        if (!this.db) {
            await this.init();
        }

        // 先将Blob转换为ArrayBuffer
        const buffer = await chunk.arrayBuffer();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const data = {
                timestamp: timestamp,
                data: buffer,
                size: chunk.size,
                type: chunk.type
            };
            
            const request = store.put(data);
            request.onsuccess = () => {
                resolve();
            };
            request.onerror = () => {
                console.error('[AudioStorage] 保存chunk失败:', request.error);
                reject(request.error);
            };
            
            transaction.onerror = () => {
                console.error('[AudioStorage] 事务失败:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * 从IndexedDB获取所有chunk（返回完整对象以便时间戳过滤）
     */
    async getAllChunks() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.getAll();

            request.onsuccess = () => {
                // 按timestamp排序，确保chunks顺序正确
                const sortedData = request.result.sort((a, b) => a.timestamp - b.timestamp);
                
                // 返回完整对象数组，包括 {timestamp, data (Blob), type, size}
                const allChunks = sortedData.map(item => ({
                    timestamp: item.timestamp,
                    data: new Blob([item.data], { type: item.type }),
                    type: item.type,
                    size: item.size
                }));
                
                if (allChunks.length > 0) {
                    const timestamps = allChunks.map(c => c.timestamp);
                    console.log(`[AudioStorage] 获取到 ${allChunks.length} 个chunks，时间戳范围: ${Math.min(...timestamps)} - ${Math.max(...timestamps)} ms`);
                } else {
                    console.log(`[AudioStorage] 没有可用的chunks`);
                }
                
                resolve(allChunks);
            };

            request.onerror = () => {
                console.error('[AudioStorage] 获取chunks失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 清理超过5分钟的旧数据（使用滚动窗口策略）
     * @param {number} recordingStartTime - 录音开始的绝对时间戳（Date.now()）
     */
    async cleanupOldChunks(recordingStartTime) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            
            // 使用 Date.now() 作为基准，计算5分钟前的cutoff时间（相对时间戳）
            const currentTime = Date.now();
            const elapsed = currentTime - recordingStartTime;
            const cutoffTime = Math.max(0, elapsed - this.maxDuration);
            
            console.log(`[AudioStorage] 清理检查: 当前经过时间=${elapsed}ms, cutoff=${cutoffTime}ms (保留最近${this.maxDuration}ms)`);

            // 获取所有数据
            const getAllRequest = index.getAll();
            getAllRequest.onsuccess = () => {
                const allData = getAllRequest.result;
                
                if (allData.length === 0) {
                    resolve(0);
                    return;
                }
                
                // 按timestamp排序
                const sortedData = allData.sort((a, b) => a.timestamp - b.timestamp);
                
                // 🔥 关键修复：始终保留第一个chunk（包含WebM头部），即使它超过了5分钟限制
                const firstChunkTimestamp = sortedData[0].timestamp;
                const toDelete = sortedData.filter(item => 
                    item.timestamp < cutoffTime && item.timestamp !== firstChunkTimestamp
                );
                
                if (toDelete.length === 0) {
                    resolve(0);
                    return;
                }

                // 删除旧数据（但保留第一个chunk）
                let deletedCount = 0;
                toDelete.forEach(item => {
                    const deleteRequest = store.delete(item.timestamp);
                    deleteRequest.onsuccess = () => {
                        deletedCount++;
                        if (deletedCount === toDelete.length) {
                            console.log(`[AudioStorage] 清理了 ${deletedCount} 个旧音频块（保留第一个chunk以确保WebM结构完整）`);
                            resolve(deletedCount);
                        }
                    };
                    deleteRequest.onerror = () => {
                        console.error('[AudioStorage] 删除chunk失败:', deleteRequest.error);
                    };
                });
            };

            getAllRequest.onerror = () => {
                console.error('[AudioStorage] 获取chunks失败:', getAllRequest.error);
                reject(getAllRequest.error);
            };
        });
    }

    /**
     * 启动定期清理任务
     * ⚠️ 已废弃：v40版本后不再使用定期清理，改为在录音停止时清理一次
     * 保留此方法仅用于向后兼容
     */
    startCleanupTimer(recordingStartTime) {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(async () => {
            if (recordingStartTime) {
                const elapsed = Date.now() - recordingStartTime;
                // 只有当录音时长超过5分钟时才清理
                if (elapsed > this.maxDuration) {
                    await this.cleanupOldChunks(recordingStartTime);
                }
            }
        }, this.cleanupInterval);

        console.log(`[AudioStorage] 启动定期清理任务，每${this.cleanupInterval/1000}秒清理一次`);
    }

    /**
     * 停止定期清理任务
     * ⚠️ 已废弃：v40版本后不再使用定期清理
     * 保留此方法仅用于向后兼容
     */
    stopCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            console.log('[AudioStorage] 停止定期清理任务');
        }
    }

    /**
     * 清空所有数据
     */
    async clearAll() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('[AudioStorage] 清空所有数据');
                resolve();
            };

            request.onerror = () => {
                console.error('[AudioStorage] 清空数据失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 获取存储的数据大小（估算）
     */
    async getStorageSize() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const totalSize = request.result.reduce((sum, item) => sum + item.size, 0);
                resolve(totalSize);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// 导出单例
const audioStorage = new AudioStorage();
