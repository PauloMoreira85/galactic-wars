# Remove o fundo dos JPGs (nim.video) e salva PNG transparente com o nome certo.
#
# COMO USAR:
#   1) Salve os JPGs das naves em  art\ships_raw\   (ex.: artemis.jpg, perseu.jpg ...)
#      e os emblemas das raças em  art\races_raw\   (ex.: humanos.jpg ...)
#   2) Clique com o botão direito neste arquivo > "Executar com PowerShell"
#      (ou rode:  powershell -ExecutionPolicy Bypass -File remover-fundo.ps1)
#
# Resultado: PNGs transparentes em art\ships\ e art\races\, prontos pro jogo.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Acha o rembg: primeiro no PATH, senão no caminho do Python da Microsoft Store.
$rembg = (Get-Command rembg -ErrorAction SilentlyContinue).Source
if (-not $rembg) {
  $store = "$env:LOCALAPPDATA\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\Scripts\rembg.exe"
  if (Test-Path $store) { $rembg = $store }
}
if (-not $rembg) {
  Write-Host "ERRO: rembg nao encontrado. Instale com:  pip install `"rembg[cli]`"" -ForegroundColor Red
  exit 1
}
Write-Host "Usando rembg: $rembg" -ForegroundColor Cyan

function Processar($rawDir, $outDir, $label) {
  if (-not (Test-Path $rawDir)) { return }
  $files = Get-ChildItem $rawDir -File -Include *.jpg,*.jpeg,*.png,*.webp -ErrorAction SilentlyContinue
  if (-not $files) { Write-Host "($label) nada em $rawDir — pulei." -ForegroundColor DarkGray; return }
  New-Item -ItemType Directory -Force $outDir | Out-Null
  Write-Host "($label) processando $($files.Count) arquivo(s)..." -ForegroundColor Yellow
  & $rembg p $rawDir $outDir
  Write-Host "($label) pronto -> $outDir" -ForegroundColor Green
}

Processar "$here\ships_raw" "$here\ships" "naves"
Processar "$here\races_raw" "$here\races" "racas"

Write-Host "`nConcluido! Os PNGs transparentes estao em art\ships e art\races." -ForegroundColor Green
