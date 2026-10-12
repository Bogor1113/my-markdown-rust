# 实时监控 MyMdEdit 的进程树内存（主进程 + WebView2 子进程）
# 用法：先运行本脚本，再手动打开若干文件，观察曲线。
#       Ctrl+C 停止，会输出 CSV 路径。

$exe = "D:\my-markdown-rust\output\MyMdEdit-v1.0.94.exe"
$out = "$env:USERPROFILE\Desktop\mymdedit-mem.csv"

"t,total_mb,host_mb,webview_mb" | Out-File -FilePath $out -Encoding utf8

Write-Host "Monitoring. Open files in MyMdEdit now. Ctrl+C to stop." -ForegroundColor Cyan
Write-Host "CSV -> $out" -ForegroundColor DarkGray

while ($true) {
  $procs = Get-CimInstance Win32_Process -Filter "Name='mymdedit.exe' OR Name='MyMdEdit-v1.0.94.exe'"
  if ($procs.Count -eq 0) {
    Start-Sleep -Seconds 2
    continue
  }
  $rootPid = $procs[0].ProcessId
  $all = Get-CimInstance Win32_Process
  $ids = New-Object 'System.Collections.Generic.HashSet[int]'
  [void]$ids.Add($rootPid)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($p in $all) {
      if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
        [void]$ids.Add([int]$p.ProcessId); $changed = $true
      }
    }
  }
  $host = 0; $wv = 0
  foreach ($id in $ids) {
    $p = $all | Where-Object { $_.ProcessId -eq $id }
    if (-not $p) { continue }
    $mb = [int64]$p.WorkingSetSize / 1MB
    if ($p.Name -like '*webview*') { $wv += $mb } else { $host += $mb }
  }
  $t = (Get-Date).ToString('HH:mm:ss')
  "{0},{1},{2},{3}" -f $t, [math]::Round($host + $wv, 1), [math]::Round($host, 1), [math]::Round($wv, 1) |
    Out-File -FilePath $out -Encoding utf8 -Append
  Start-Sleep -Seconds 2
}
