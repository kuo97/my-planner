# 할 일 위젯 실행기 (2026-10-10)
# 왜: 윈도우 '스마트 앱 컨트롤'이 탐색기(바로가기·시작 프로그램)가 electron.exe 를 직접 켜는 것을 막는다(서명 없는 프로그램).
#     서명된 PowerShell 이 대신 켜면 통과한다. 로그인 직후엔 인터넷이 아직 없어 검증이 실패할 수 있어 연결될 때까지 기다린다.
# 쓰는 곳: 작업 스케줄러 '할 일 위젯 시작'(로그온 때), 작업 표시줄 고정 아이콘, 시작 메뉴 '할 일 위젯'
$ErrorActionPreference = 'SilentlyContinue'
$w = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $w 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $exe)) { exit 1 }
# 이미 떠 있으면 앞으로만 가져온다(위젯 쪽 second-instance 처리)
for ($i = 0; $i -lt 40; $i++) {                       # 최대 약 2분: 인터넷 연결 확인
  try { [void][System.Net.Dns]::GetHostAddresses('www.microsoft.com'); break } catch { Start-Sleep -Seconds 3 }
}
Start-Process -FilePath $exe -ArgumentList ('"{0}"' -f $w) -WorkingDirectory $w
