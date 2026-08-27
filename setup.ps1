# 雅礼团委-通办 一键部署脚本 (PowerShell 7+)

$ErrorActionPreference = "Stop"

function Step($n, $msg) {
  Write-Host "`n[$n] $msg..." -ForegroundColor Yellow
}

try { $null = node --version; Write-Host "[OK] Node.js" -ForegroundColor Green }
catch { Write-Host "[FAIL] 请先安装 Node.js (https://nodejs.org)" -ForegroundColor Red; exit 1 }

Step "1/7" "安装项目依赖"
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }

Step "2/7" "登录 Cloudflare"
npx wrangler login
if ($LASTEXITCODE -ne 0) { throw "Cloudflare 登录失败" }

Step "3/7" "创建 D1 数据库"
$dbOut = npx wrangler d1 create yali-tongban-db 2>&1 | Out-String
if ($dbOut -match 'database_id:\s*([a-f0-9-]+)') {
  $dbId = $Matches[1]
  $toml = Get-Content wrangler.toml -Raw
  $toml = $toml -replace 'database_id = ""', "database_id = `"$dbId`""
  Set-Content wrangler.toml $toml
  Write-Host "database_id 已写入 wrangler.toml" -ForegroundColor Green
} else { Write-Host "数据库已存在，继续..." -ForegroundColor Yellow }

Step "4/7" "创建 R2 存储桶"
npx wrangler r2 bucket create yali-tongban-images 2>$null
Write-Host "R2 存储桶就绪" -ForegroundColor Green

Step "5/7" "设置 JWT 签名密钥"
$jwtSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$jwtSecret | npx wrangler secret put JWT_SECRET
Write-Host "JWT 密钥已设置" -ForegroundColor Green

Step "6/7" "初始化数据库表 + 创建管理员"
npx wrangler d1 execute yali-tongban-db --file=schema.sql

# 用 Node.js + bcryptjs 生成密码哈希并创建管理员
$adminName = "admin"
$adminPassword = -join ((33..126) | Get-Random -Count 14 | % { [char]$_ })

$nodeScript = @"
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('$adminPassword', 10);
console.log(hash);
"@
$passwordHash = node -e $nodeScript

npx wrangler d1 execute yali-tongban-db `
  --command="INSERT OR IGNORE INTO users (name, password_hash, role) VALUES ('$adminName', '$passwordHash', 'admin');"

Write-Host "管理员账号已创建" -ForegroundColor Green

Step "7/7" "部署到 Cloudflare Pages"
npm run deploy
if ($LASTEXITCODE -ne 0) { throw "部署失败" }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ✅ 部署成功！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  管理员账号: $adminName"
Write-Host "  管理员密码: $adminPassword" -ForegroundColor Magenta
Write-Host ""
Write-Host "  ⚠️  请务必保存好管理员密码！" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
