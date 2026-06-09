$ErrorActionPreference = "Stop"
$root = "C:\Users\User\OneDrive\Desktop\Inventory Management"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8123/")
$listener.Start()
Write-Host "serving $root on http://localhost:8123/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path.TrimStart("/"))
    if (Test-Path $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      switch ($ext) {
        ".html" { $ct = "text/html; charset=utf-8" }
        ".js"   { $ct = "text/javascript; charset=utf-8" }
        ".jsx"  { $ct = "text/babel; charset=utf-8" }
        ".css"  { $ct = "text/css; charset=utf-8" }
        ".png"  { $ct = "image/png" }
        default { $ct = "application/octet-stream" }
      }
      $ctx.Response.ContentType = $ct
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes("not found")
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
  } catch {}
  $ctx.Response.Close()
}
