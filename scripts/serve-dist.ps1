$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "apps\web\dist"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:5173/")
$listener.Start()
Write-Output "Workbench web server listening at http://localhost:5173/"

function Get-ContentType([string]$path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".svg" { "image/svg+xml" }
    ".png" { "image/png" }
    ".ico" { "image/x-icon" }
    default { "application/octet-stream" }
  }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)

    if ($requestPath.StartsWith("/api/")) {
      $target = "http://localhost:3000$requestPath"
      if ($context.Request.Url.Query) {
        $target += $context.Request.Url.Query
      }

      $body = $null
      if ($context.Request.HasEntityBody) {
        $reader = [System.IO.StreamReader]::new($context.Request.InputStream, $context.Request.ContentEncoding)
        $body = $reader.ReadToEnd()
        $reader.Dispose()
      }

      $headers = @{}
      foreach ($key in $context.Request.Headers.AllKeys) {
        if ($key -in @("Host", "Content-Length", "Connection")) { continue }
        $headers[$key] = $context.Request.Headers[$key]
      }

      try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $target -Method $context.Request.HttpMethod -Headers $headers -Body $body -ContentType $context.Request.ContentType
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($response.Content)
        $context.Response.StatusCode = [int]$response.StatusCode
        $contentType = $response.Headers["Content-Type"]
        if (-not $contentType) {
          $contentType = "application/json; charset=utf-8"
        }
        $context.Response.ContentType = $contentType
      } catch {
        $status = 500
        if ($_.Exception.Response) {
          $status = [int]$_.Exception.Response.StatusCode
        }
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
        $context.Response.StatusCode = $status
        $context.Response.ContentType = "text/plain; charset=utf-8"
      }

      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $context.Response.Close()
      continue
    }

    $relative = $requestPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($relative)) {
      $relative = "index.html"
    }

    $file = Join-Path $dist $relative
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $file = Join-Path $dist "index.html"
    }

    $bytes = [System.IO.File]::ReadAllBytes($file)
    $context.Response.StatusCode = 200
    $context.Response.ContentType = Get-ContentType $file
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
} finally {
  $listener.Stop()
}
