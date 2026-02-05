# 🚀 Cursor Rules 快速设置脚本
# 自动将通用规则复制到新项目

param(
    [string]$ProjectPath = ".",
    [string]$RulesSource = "$PSScriptRoot\.cursorrules.universal"
)

Write-Host "🎯 Cursor Rules 自动设置工具" -ForegroundColor Cyan
Write-Host ""

# 检查源文件是否存在
if (-not (Test-Path $RulesSource)) {
    Write-Host "❌ 错误: 找不到通用规则文件" -ForegroundColor Red
    Write-Host "   预期位置: $RulesSource" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 提示: 请确保 .cursorrules.universal 文件存在" -ForegroundColor Yellow
    exit 1
}

# 确定目标路径
$targetPath = Join-Path $ProjectPath ".cursorrules"

# 检查是否已存在规则文件
if (Test-Path $targetPath) {
    Write-Host "⚠️  警告: 项目中已存在 .cursorrules 文件" -ForegroundColor Yellow
    Write-Host ""
    $choice = Read-Host "是否要覆盖? (y/N)"
    
    if ($choice -ne 'y' -and $choice -ne 'Y') {
        Write-Host "❌ 取消操作" -ForegroundColor Red
        exit 0
    }
    
    # 备份现有文件
    $backupPath = "$targetPath.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item $targetPath $backupPath
    Write-Host "✅ 已备份到: $backupPath" -ForegroundColor Green
    Write-Host ""
}

# 复制规则文件
try {
    Copy-Item $RulesSource $targetPath -Force
    Write-Host "✅ 成功！通用规则已复制到项目" -ForegroundColor Green
    Write-Host ""
    Write-Host "📁 文件位置: $targetPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🎉 Cursor现在会自动加载这些规则！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📖 包含的原则:" -ForegroundColor Cyan
    Write-Host "   1. 多环境部署原则（测试优先）" -ForegroundColor White
    Write-Host "   2. 探索多种方案原则（不唯一解）" -ForegroundColor White
    Write-Host "   3. 确认机制原则（有疑问先问）" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 提示: 你可以在 .cursorrules 中添加项目特定配置" -ForegroundColor Yellow
    
} catch {
    Write-Host "❌ 错误: 复制失败" -ForegroundColor Red
    Write-Host "   $_" -ForegroundColor Red
    exit 1
}
