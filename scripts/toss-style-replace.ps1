$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$dirs = @('app\main\기능부품\관리자전용서브', 'app\main\기능부품\재고관리서브')
$files = Get-ChildItem -Path $dirs -Filter '*.tsx' -Recurse -File -ErrorAction SilentlyContinue

$replacements = @(
  @('border-gray-100','border-[#E5E8EB]'),
  @('border-gray-200','border-[#E5E8EB]'),
  @('text-gray-400','text-[#8B95A1]'),
  @('text-gray-800','text-[#191F28]'),
  @('text-gray-900','text-[#191F28]'),
  @('text-gray-700','text-[#4E5968]'),
  @('text-gray-500','text-[#4E5968]'),
  @('text-gray-600','text-[#4E5968]'),
  @('bg-gray-50','bg-[#F2F4F6]'),
  @('bg-gray-100','bg-[#F2F4F6]'),
  @('font-black','font-bold'),
  @('bg-blue-600','bg-[#3182F6]'),
  @('text-blue-600','text-[#3182F6]'),
  @('focus:ring-blue-100','focus:ring-[#3182F6]/20'),
  @('focus:ring-blue-500','focus:ring-[#3182F6]'),
  @('rounded-xl','rounded-[12px]'),
  @('shadow-xl',"shadow-sm"),
  @('shadow-lg',"shadow-sm")
)

foreach ($f in $files) {
  $content = Get-Content $f.FullName -Raw -Encoding UTF8
  $orig = $content
  foreach ($r in $replacements) { $content = $content.Replace($r[0], $r[1]) }
  if ($content -ne $orig) {
    Set-Content $f.FullName -Value $content -Encoding UTF8 -NoNewline
    Write-Host $f.Name
  }
}
Write-Host "Done."
