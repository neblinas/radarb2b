$ErrorActionPreference = "Continue"
Set-Location C:\Users\User\RadarB2B\web

Write-Host "=== 1/8 typecheck ==="
npx tsc --noEmit 2>&1 | Select-String "error TS" | Select-Object -First 10
Write-Host "tsc done"

Write-Host "=== 2/8 tests ==="
npm test 2>&1 | Select-String -Pattern "Test Files|Tests " | Select-Object -Last 2

Write-Host "=== 3/8 lint ==="
npm run lint 2>&1 | Select-String -Pattern "error|problem" | Select-Object -First 6
Write-Host "lint done"

Write-Host "=== 4/8 db push ==="
npx supabase db push --yes 2>&1 | Select-String -Pattern "Applying|Finished|error|ERROR|failed" | Select-Object -Last 4

Write-Host "=== 5/8 set sender secret ==="
npx supabase secrets set RESEND_FROM_EMAIL="Adjudata <comercial@adjudata.pt>" --project-ref swelyfjlnvpxgahchpxc 2>&1 | Select-String -Pattern "Finished|error|Setting" | Select-Object -Last 3

Write-Host "=== 6/8 deploy send-commercial-email ==="
npx supabase functions deploy send-commercial-email --project-ref swelyfjlnvpxgahchpxc 2>&1 | Select-String -Pattern "Deployed|Deploying|error|ERROR|failed" | Select-Object -Last 5

Write-Host "=== 7/8 build ==="
npm run build 2>&1 | Select-String -Pattern "Compiled|error|Failed|emails" | Select-Object -Last 8

Write-Host "=== 8/8 git commit + push ==="
git add -A 2>&1 | Out-Null
git commit -m "Add commercial email: send from portal with automatic signature" -m "Remetente unico comercial@adjudata.pt (Opcao A), assinatura automatica (nome + contacto + nota nao-responder), historico de envio (caixa de saida), pagina /backoffice/emails com compositor e edicao de assinatura, botoes de email nos contactos de prospeccao e na lista de clientes. Migracao, edge function Resend e testes." 2>&1 | Select-Object -Last 3
git push origin HEAD 2>&1 | Select-Object -Last 4
Write-Host "done"
