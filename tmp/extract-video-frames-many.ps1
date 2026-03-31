Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase

$videoPath = 'C:\Users\baek_\OneDrive\바탕화~1\KAKAOT~1.MP4'
$outputDir = 'C:\Users\baek_\newmso\tmp\video_frames_many'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Get-ChildItem -LiteralPath $outputDir -Filter *.png | Remove-Item -Force

$uri = [System.Uri]('file:///' + ($videoPath -replace '\\','/'))
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open($uri)
for ($i = 0; $i -lt 150; $i++) {
  if ($player.NaturalVideoWidth -gt 0 -or $player.NaturalDuration.HasTimeSpan) { break }
  Start-Sleep -Milliseconds 200
}

$duration = if ($player.NaturalDuration.HasTimeSpan) { $player.NaturalDuration.TimeSpan.TotalSeconds } else { 3 }
$width = [int]$player.NaturalVideoWidth
$height = [int]$player.NaturalVideoHeight
if ($width -le 0 -or $height -le 0) { throw "Video metadata unavailable" }

$times = @(0.2,0.6,1.0,1.4,1.8,2.2,2.6) | Where-Object { $_ -lt $duration }
$index = 1
foreach ($seconds in $times) {
  $player.Position = [TimeSpan]::FromSeconds([double]$seconds)
  $player.Play()
  Start-Sleep -Milliseconds 600
  $player.Pause()
  Start-Sleep -Milliseconds 200

  $visual = New-Object System.Windows.Media.DrawingVisual
  $context = $visual.RenderOpen()
  $drawing = New-Object System.Windows.Media.VideoDrawing
  $drawing.Rect = New-Object System.Windows.Rect(0, 0, $width, $height)
  $drawing.Player = $player
  $context.DrawDrawing($drawing)
  $context.Close()

  $bitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($width, $height, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
  $bitmap.Render($visual)
  $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))

  $outputPath = Join-Path $outputDir ('frame-{0:D3}-{1}.png' -f $index, ($seconds.ToString('0.0').Replace('.','_')))
  $stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Create)
  try { $encoder.Save($stream) } finally { $stream.Dispose() }
  $index++
}
$player.Close()
Get-ChildItem -LiteralPath $outputDir -Filter *.png | Sort-Object Name | Select-Object -ExpandProperty FullName
