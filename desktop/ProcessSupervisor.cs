using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace BlockHarbor.Desktop
{
    public class ProcessSupervisor
    {
        private Process? _backendProcess;
        private readonly int _port;
        private readonly string _logPath;
        private static readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };

        public ProcessSupervisor(int port)
        {
            _port = port;
            _logPath = Path.Combine(Path.GetTempPath(), "blockharbor-backend.log");
        }

        public static int FindFreePort(int preferred = 8000)
        {
            if (IsPortAvailable(preferred)) return preferred;

            for (int p = 8001; p <= 8099; p++)
            {
                if (IsPortAvailable(p)) return p;
            }

            // Fallback to random dynamic port
            var l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return port;
        }

        private static bool IsPortAvailable(int port)
        {
            try
            {
                var listener = new TcpListener(IPAddress.Loopback, port);
                listener.Start();
                listener.Stop();
                return true;
            }
            catch
            {
                return false;
            }
        }

        public void StartBackend()
        {
            var exePath = LocateBackendExecutable();
            if (string.IsNullOrEmpty(exePath))
            {
                throw new FileNotFoundException("Could not locate BlockHarbor backend executable or runtime script.");
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = exePath,
                WorkingDirectory = Path.GetDirectoryName(exePath) ?? AppDomain.CurrentDomain.BaseDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };

            startInfo.EnvironmentVariables["PORT"] = _port.ToString();
            startInfo.EnvironmentVariables["HOST"] = "127.0.0.1";
            startInfo.EnvironmentVariables["NODE_ENV"] = "production";

            try
            {
                File.WriteAllText(_logPath, $"[BlockHarbor Host] Starting backend process: {exePath} on port {_port}\n");

                _backendProcess = new Process { StartInfo = startInfo };

                _backendProcess.OutputDataReceived += (s, e) =>
                {
                    if (e.Data != null) File.AppendAllText(_logPath, $"[OUT] {e.Data}\n");
                };

                _backendProcess.ErrorDataReceived += (s, e) =>
                {
                    if (e.Data != null) File.AppendAllText(_logPath, $"[ERR] {e.Data}\n");
                };

                _backendProcess.Start();
                _backendProcess.BeginOutputReadLine();
                _backendProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                File.AppendAllText(_logPath, $"[FATAL] Failed to spawn backend: {ex.Message}\n");
                throw;
            }
        }

        private string? LocateBackendExecutable()
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var candidates = new[]
            {
                Path.Combine(baseDir, "BlockHarbor-Backend.exe"),
                Path.Combine(baseDir, "main.exe"),
                Path.Combine(baseDir, "..", "dist", "Kubek-4.0.2-win-x64.exe"),
                Path.Combine(baseDir, "..", "..", "dist", "Kubek-4.0.2-win-x64.exe"),
                Path.Combine(baseDir, "Kubek-4.0.2-win-x64.exe"),
            };

            foreach (var candidate in candidates)
            {
                var full = Path.GetFullPath(candidate);
                if (File.Exists(full)) return full;
            }

            // Check if Bun exists in PATH or user directory
            var bunPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".bun", "bin", "bun.exe");
            if (File.Exists(bunPath)) return bunPath;

            return null;
        }

        public async Task<bool> WaitForHealthAsync(int timeoutSeconds = 25)
        {
            var url = $"http://127.0.0.1:{_port}/";
            var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));

            while (!cts.Token.IsCancellationRequested)
            {
                try
                {
                    var response = await _httpClient.GetAsync(url, cts.Token);
                    if (response.IsSuccessStatusCode || (int)response.StatusCode < 500)
                    {
                        return true;
                    }
                }
                catch
                {
                    // Not ready yet
                }

                if (_backendProcess != null && _backendProcess.HasExited)
                {
                    return false;
                }

                await Task.Delay(500, cts.Token).ContinueWith(_ => {});
            }

            return false;
        }

        public async Task StopBackendAsync()
        {
            if (_backendProcess != null && !_backendProcess.HasExited)
            {
                try
                {
                    // Graceful kill using taskkill tree
                    var psi = new ProcessStartInfo("taskkill", $"/pid {_backendProcess.Id} /T /F")
                    {
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };
                    var p = Process.Start(psi);
                    if (p != null) await p.WaitForExitAsync();
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Failed to kill backend: {ex.Message}");
                }
            }
        }
    }
}
