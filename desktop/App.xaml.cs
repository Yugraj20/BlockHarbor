using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;

namespace BlockHarbor.Desktop
{
    public partial class App : System.Windows.Application
    {
        private const string AppMutexName = "Global\\BlockHarbor_SingleInstance_Mutex";
        private Mutex? _appMutex;
        private ProcessSupervisor? _supervisor;

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        private const int SW_RESTORE = 9;

        protected override async void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Single instance enforcement
            _appMutex = new Mutex(true, AppMutexName, out bool isNewInstance);
            if (!isNewInstance)
            {
                // Bring existing instance to foreground
                var current = Process.GetCurrentProcess();
                foreach (var process in Process.GetProcessesByName(current.ProcessName))
                {
                    if (process.Id != current.Id && process.MainWindowHandle != IntPtr.Zero)
                    {
                        ShowWindow(process.MainWindowHandle, SW_RESTORE);
                        SetForegroundWindow(process.MainWindowHandle);
                        break;
                    }
                }

                Shutdown();
                return;
            }

            // Find an open loopback port
            int port = ProcessSupervisor.FindFreePort(8000);

            // Initialize supervisor
            _supervisor = new ProcessSupervisor(port);

            try
            {
                _supervisor.StartBackend();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Backend startup warning: {ex.Message}");
            }

            // Show native application window
            var mainWindow = new MainWindow(port, _supervisor);
            MainWindow = mainWindow;
            mainWindow.Show();
        }

        protected override async void OnExit(ExitEventArgs e)
        {
            if (_supervisor != null)
            {
                await _supervisor.StopBackendAsync();
            }

            _appMutex?.ReleaseMutex();
            _appMutex?.Dispose();

            base.OnExit(e);
        }
    }
}
