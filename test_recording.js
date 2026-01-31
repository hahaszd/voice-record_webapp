const puppeteer = require('puppeteer');

// 测试配置
const SERVER_URL = 'http://localhost:8001';
const TEST_TIMEOUT = 60000; // 60秒超时

// 测试用例
const testCases = [
    {
        name: '5秒录音测试',
        duration: 5,
        shouldPlay: true,
        description: '测试10秒以内的录音（5秒）是否可以正常播放'
    },
    {
        name: '13秒录音测试',
        duration: 13,
        shouldPlay: true,
        description: '测试超过10秒的录音（13秒）是否可以播放最后10秒'
    }
];

// 测试结果
let testResults = [];

// 等待函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 测试单个录音场景
async function testRecording(page, testCase) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`开始测试: ${testCase.name}`);
    console.log(`描述: ${testCase.description}`);
    console.log(`预期录音时长: ${testCase.duration}秒`);
    console.log(`预期可以播放: ${testCase.shouldPlay ? '是' : '否'}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
        // 监听控制台输出
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            if (type === 'error' || type === 'warning') {
                console.log(`[浏览器${type}]: ${text}`);
            }
        });
        
        // 监听页面错误
        page.on('pageerror', error => {
            console.error(`[页面错误]: ${error.message}`);
        });
        
        // 访问页面
        console.log(`[1/6] 访问页面: ${SERVER_URL}`);
        try {
            await page.goto(SERVER_URL, { waitUntil: 'networkidle2', timeout: 30000 });
            await sleep(3000); // 增加等待时间，确保页面完全加载
        } catch (error) {
            // 如果导航失败，尝试重新加载
            console.log(`[WARNING] 页面加载失败，尝试重新加载`);
            try {
                await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                await sleep(3000);
            } catch (reloadError) {
                console.error(`[ERROR] 页面重新加载也失败: ${reloadError.message}`);
                throw new Error(`页面加载失败: ${error.message}`);
            }
        }
        
        // 检查页面是否加载成功
        const title = await page.title();
        console.log(`[2/6] 页面标题: ${title}`);
        
        // 等待页面元素加载
        console.log(`等待页面元素加载...`);
        await page.waitForSelector('#recordBtn', { timeout: 10000 }).catch(() => {
            // 如果找不到按钮，打印页面内容用于调试
            return page.content().then(html => {
                console.log('页面HTML（前500字符）:', html.substring(0, 500));
                throw new Error('找不到录音按钮，页面可能未正确加载');
            });
        });
        
        // 点击开始录音按钮
        console.log(`[3/6] 点击开始录音按钮`);
        const recordBtn = await page.$('#recordBtn');
        if (!recordBtn) {
            // 再次尝试查找按钮
            const allButtons = await page.$$('button');
            console.log(`找到 ${allButtons.length} 个按钮`);
            throw new Error('找不到录音按钮 (#recordBtn)');
        }
        await recordBtn.click();
        await sleep(500);
        
        // 等待录音开始
        const recordingStatus = await page.$('#recordingStatus');
        let statusText = await page.evaluate(el => el.textContent, recordingStatus);
        console.log(`[4/6] 录音状态: ${statusText}`);
        
        // 等待指定时长
        console.log(`[5/6] 录音中... (${testCase.duration}秒)`);
        await sleep(testCase.duration * 1000);
        
        // 点击停止录音按钮
        console.log(`[6/6] 点击停止录音按钮`);
        await recordBtn.click();
        await sleep(1000);
        
        // 检查录音状态
        statusText = await page.evaluate(el => el.textContent, recordingStatus);
        console.log(`录音状态: ${statusText}`);
        
        // 检查录音时长显示
        const recordingTime = await page.$('#recordingTime');
        const timeText = await page.evaluate(el => el.textContent, recordingTime);
        console.log(`显示的录音时长: ${timeText}`);
        
        // 点击"转录最后10秒"按钮
        console.log(`点击"转录最后10秒"按钮`);
        const transcribeBtn = await page.$('#transcribeLast10Btn');
        if (!transcribeBtn) {
            throw new Error('找不到转录最后10秒按钮');
        }
        
        // 监听alert对话框
        let alertMessage = null;
        page.on('dialog', async dialog => {
            alertMessage = dialog.message();
            console.log(`[ALERT] ${alertMessage}`);
            await dialog.accept();
        });
        
        // 点击转录按钮
        await transcribeBtn.click();
        console.log(`等待转录完成和音频生成...`);
        
        // 等待音频播放器出现
        await page.waitForSelector('#audioPlayer[style*="display: block"], #audioPlayer:not([style*="display: none"])', { 
            timeout: 15000,
            visible: true 
        }).catch(() => {
            console.log(`[WARNING] 音频播放器未在15秒内显示`);
        });
        
        await sleep(3000); // 额外等待音频加载
        
        // 检查音频播放器
        const audioPlayer = await page.$('#audioPlayer');
        let isAudioPlayerVisible = false;
        let audioDuration = 0;
        let isPlaying = false;
        let canPlay = false;
        
        if (audioPlayer) {
            try {
                // 检查音频播放器是否可见
                isAudioPlayerVisible = await page.evaluate(el => {
                    if (!el) return false;
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.display !== '';
                }, audioPlayer);
                
                console.log(`音频播放器可见: ${isAudioPlayerVisible}`);
                
                if (isAudioPlayerVisible) {
                    // 获取音频信息
                    const audioInfo = await page.evaluate(el => {
                        return {
                            readyState: el.readyState,
                            duration: el.duration || 0,
                            currentTime: el.currentTime || 0,
                            paused: el.paused,
                            src: el.src || ''
                        };
                    }, audioPlayer);
                    
                    audioDuration = audioInfo.duration || 0;
                    canPlay = audioInfo.readyState >= 2; // HAVE_CURRENT_DATA 或更高
                    isPlaying = !audioInfo.paused && audioInfo.currentTime > 0;
                    
                    console.log(`音频信息:`);
                    console.log(`  - 时长: ${audioDuration > 0 ? audioDuration.toFixed(2) : '未知'}秒`);
                    console.log(`  - 可以播放: ${canPlay}`);
                    console.log(`  - 正在播放: ${isPlaying}`);
                    console.log(`  - ReadyState: ${audioInfo.readyState}`);
                    
                    // 如果音频已加载但未播放，尝试播放
                    if (canPlay && audioInfo.paused) {
                        console.log(`尝试播放音频...`);
                        await page.evaluate(el => {
                            el.play().catch(err => {
                                console.error('播放失败:', err);
                            });
                        }, audioPlayer);
                        await sleep(2000); // 等待播放
                        
                        // 再次检查播放状态
                        const playStatus = await page.evaluate(el => {
                            return {
                                paused: el.paused,
                                currentTime: el.currentTime
                            };
                        }, audioPlayer);
                        isPlaying = !playStatus.paused && playStatus.currentTime > 0;
                        console.log(`播放后状态: ${isPlaying ? '正在播放' : '未播放'}`);
                    }
                }
            } catch (e) {
                console.log(`[WARNING] 检查音频播放器时出错: ${e.message}`);
            }
        } else {
            console.log(`[WARNING] 找不到音频播放器元素`);
        }
        
        // 验证结果
        // 对于5秒录音，期望生成5秒的音频
        // 对于13秒录音，期望生成10秒的音频
        const expectedAudioDuration = testCase.duration <= 10 ? testCase.duration : 10;
        const durationMatch = Math.abs(audioDuration - expectedAudioDuration) < 2; // 允许2秒误差
        
        const testResult = {
            name: testCase.name,
            duration: testCase.duration,
            expectedPlay: testCase.shouldPlay,
            expectedAudioDuration: expectedAudioDuration,
            actualAudioDuration: audioDuration,
            durationMatch: durationMatch,
            actualPlay: isPlaying || canPlay,
            alertMessage: alertMessage,
            audioPlayerVisible: isAudioPlayerVisible,
            recordingTime: timeText,
            success: false
        };
        
        if (testCase.shouldPlay) {
            // 如果预期可以播放
            if (isAudioPlayerVisible && canPlay && durationMatch) {
                testResult.success = true;
                console.log(`✅ 测试通过:`);
                console.log(`   - 音频播放器已显示`);
                console.log(`   - 音频可以播放`);
                console.log(`   - 音频时长正确: ${audioDuration.toFixed(2)}秒 (期望: ${expectedAudioDuration}秒)`);
                if (isPlaying) {
                    console.log(`   - 音频正在播放`);
                }
            } else {
                testResult.success = false;
                console.log(`❌ 测试失败:`);
                if (!isAudioPlayerVisible) {
                    console.log(`   - 音频播放器未显示`);
                }
                if (!canPlay) {
                    console.log(`   - 音频无法播放`);
                }
                if (!durationMatch) {
                    console.log(`   - 音频时长不匹配: ${audioDuration > 0 ? audioDuration.toFixed(2) : '未知'}秒 (期望: ${expectedAudioDuration}秒)`);
                }
                if (alertMessage) {
                    console.log(`   - 错误信息: ${alertMessage}`);
                }
            }
        } else {
            // 如果预期不能播放
            if (alertMessage && alertMessage.includes('无法播放')) {
                testResult.success = true;
                console.log(`✅ 测试通过: 正确阻止了播放`);
            } else {
                testResult.success = false;
                console.log(`❌ 测试失败: 应该阻止播放但没有`);
            }
        }
        
        return testResult;
        
    } catch (error) {
        console.error(`❌ 测试异常: ${error.message}`);
        console.error(error.stack);
        return {
            name: testCase.name,
            duration: testCase.duration,
            expectedPlay: testCase.shouldPlay,
            success: false,
            error: error.message
        };
    }
}

// 主测试函数
async function runTests() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`开始运行录音播放测试`);
    console.log(`服务器地址: ${SERVER_URL}`);
    console.log(`测试用例数量: ${testCases.length}`);
    console.log(`${'='.repeat(60)}\n`);
    
    let browser;
    
    try {
        // 启动浏览器
        console.log('启动浏览器...');
        browser = await puppeteer.launch({
            headless: false, // 显示浏览器窗口，方便调试
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: { width: 1280, height: 720 }
        });
        
        console.log('浏览器已启动\n');
        
        // 运行所有测试用例
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            const page = await browser.newPage();
            try {
                // 设置超时
                page.setDefaultTimeout(TEST_TIMEOUT);
                
                const result = await testRecording(page, testCase);
                testResults.push(result);
            } catch (error) {
                console.error(`测试用例 ${i + 1} 执行失败:`, error);
                testResults.push({
                    name: testCase.name,
                    duration: testCase.duration,
                    expectedPlay: testCase.shouldPlay,
                    success: false,
                    error: error.message
                });
            } finally {
                await page.close();
                await sleep(2000); // 测试间隔，确保资源释放
            }
        }
        
    } catch (error) {
        console.error(`\n❌ 测试运行失败: ${error.message}`);
        console.error(error.stack);
    } finally {
        if (browser) {
            await browser.close();
            console.log('\n浏览器已关闭');
        }
    }
    
    // 打印测试结果摘要
    printSummary();
}

// 打印测试结果摘要
function printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试结果摘要`);
    console.log(`${'='.repeat(60)}\n`);
    
    let passed = 0;
    let failed = 0;
    
    testResults.forEach((result, index) => {
        const status = result.success ? '✅ 通过' : '❌ 失败';
        console.log(`${index + 1}. ${result.name}: ${status}`);
        console.log(`   录音时长: ${result.duration}秒`);
        console.log(`   预期播放: ${result.expectedPlay ? '是' : '否'}`);
        console.log(`   实际播放: ${result.actualPlay ? '是' : '否'}`);
        if (result.alertMessage) {
            console.log(`   提示信息: ${result.alertMessage.substring(0, 50)}...`);
        }
        if (result.error) {
            console.log(`   错误: ${result.error}`);
        }
        console.log('');
        
        if (result.success) {
            passed++;
        } else {
            failed++;
        }
    });
    
    console.log(`${'='.repeat(60)}`);
    console.log(`总计: ${testResults.length} 个测试`);
    console.log(`通过: ${passed} 个`);
    console.log(`失败: ${failed} 个`);
    console.log(`${'='.repeat(60)}\n`);
    
    // 退出码
    process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
if (require.main === module) {
    runTests().catch(error => {
        console.error('未处理的错误:', error);
        process.exit(1);
    });
}

module.exports = { runTests, testCases };
