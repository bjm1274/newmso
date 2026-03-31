Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase

$videoPath = 'C:\Users\baek_\OneDrive\바탕화~1\KAKAOT~1.MP4'
$outputDir = 'C:\Users\baek_\newmso\tmp\video_frames'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$uri = [System.Uri]('file:///' + ($videoPath -replace '\\','/'))
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open($uri)
for ($i = 0; $i -lt 150; $i++) {
  if ($player.NaturalVideoWidth -gt 0 -or $player.NaturalDuration.HasTimeSpan) { break }
  Start-Sleep -Milliseconds 200
}

$duration = if ($player.NaturalDuration.HasTimeSpan) { $player.NaturalDuration.TimeSpan.TotalSeconds } else { 0 }
$width = [int]$player.NaturalVideoWidth
$height = [int]$player.NaturalVideoHeight
if ($width -le 0 -or $height -le 0) {
  throw "Video metadata unavailable. width=$width height=$height duration=$duration"
}

$times = if ($duration -gt 0) {
  @([Math]::Max([Math]::Round($duration * 0.15, 2), 0.5), [Math]::Max([Math]::Round($duration * 0.5, 2), 1.0), [Math]::Max([Math]::Round($duration * 0.85, 2), 1.5)) | Select-Object -Unique
} else {
  @(1,2,3)
}

$index = 1
foreach ($seconds in $times) {
  $player.Position = [TimeSpan]::FromSeconds([double]$seconds)
  $player.Play()
  Start-Sleep -Milliseconds 800
  $player.Pause()
  Start-Sleep -Milliseconds 300

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

  $outputPath = Join-Path $outputDir ('frame-{0:D3}.png' -f $index)
  $stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Create)
  try {
    $encoder.Save($stream)
  } finally {
    $stream.Dispose()
  }
  $index++
}

$player.Close()
[PSCustomObject]@{
  DurationSeconds = [Math]::Round($duration, 2)
  Width = $width
  Height = $height
  Frames = (Get-ChildItem -LiteralPath $outputDir -Filter *.png | Sort-Object Name | Select-Object -ExpandProperty FullName)
} | ConvertTo-Json -Depth 3
