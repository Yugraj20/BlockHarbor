using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Web.WebView2.Core;
using Forms = System.Windows.Forms;

namespace BlockHarbor.Desktop
{
    public partial class MainWindow : Window
    {
        [DllImport("dwmapi.dll", PreserveSig = true)]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private const int DWMWA_CAPTION_COLOR = 35;
        private const int DWMWA_TEXT_COLOR = 36;

        private readonly int _port;
        private readonly ProcessSupervisor _supervisor;
        private Forms.NotifyIcon? _notifyIcon;
        private bool _isExplicitExit = false;

        public MainWindow(int port, ProcessSupervisor supervisor)
        {
            _port = port;
            _supervisor = supervisor;
            InitializeComponent();

            SourceInitialized += MainWindow_SourceInitialized;

            try
            {
                var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
                if (File.Exists(iconPath))
                {
                    Icon = System.Windows.Media.Imaging.BitmapFrame.Create(new Uri(iconPath, UriKind.Absolute));
                }
                else
                {
                    Icon = System.Windows.Media.Imaging.BitmapFrame.Create(new Uri("pack://application:,,,/app.ico"));
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to set window icon: {ex.Message}");
            }

            try
            {
                var splashPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "icon.png");
                if (File.Exists(splashPath))
                {
                    SplashImage.Source = new System.Windows.Media.Imaging.BitmapImage(new Uri(splashPath, UriKind.Absolute));
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to set splash image: {ex.Message}");
            }

            InitializeSystemTray();
            Loaded += MainWindow_Loaded;
            Closing += MainWindow_Closing;
        }

        private void MainWindow_SourceInitialized(object? sender, EventArgs e)
        {
            try
            {
                var hwnd = new WindowInteropHelper(this).Handle;
                if (hwnd != IntPtr.Zero)
                {
                    int useDarkMode = 1;
                    // Apply immersive dark mode to native Windows title bar
                    if (DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref useDarkMode, sizeof(int)) != 0)
                    {
                        DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1, ref useDarkMode, sizeof(int));
                    }

                    // On Windows 11, set caption color to dark charcoal #0c1210 (COLORREF 0x0010120C)
                    int captionColor = 0x0010120C;
                    DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, ref captionColor, sizeof(int));

                    // Title bar text color to off-white #f4f4f5 (COLORREF 0x00F5F4F4)
                    int textColor = 0x00F5F4F4;
                    DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, ref textColor, sizeof(int));
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to set immersive dark mode: {ex.Message}");
            }
        }

        private void InitializeSystemTray()
        {
            try
            {
                _notifyIcon = new Forms.NotifyIcon
                {
                    Text = "BlockHarbor - Minecraft Server Platform",
                    Visible = true
                };

                var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
                if (File.Exists(iconPath))
                {
                    _notifyIcon.Icon = new System.Drawing.Icon(iconPath);
                }
                else
                {
                    _notifyIcon.Icon = System.Drawing.SystemIcons.Application;
                }

                var contextMenu = new Forms.ContextMenuStrip();

                var openItem = new Forms.ToolStripMenuItem("Open BlockHarbor");
                openItem.Click += (s, e) => ShowAndActivate();
                contextMenu.Items.Add(openItem);

                contextMenu.Items.Add(new Forms.ToolStripSeparator());

                var serversDirItem = new Forms.ToolStripMenuItem("Open Servers Directory");
                serversDirItem.Click += (s, e) =>
                {
                    var dir = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "servers"));
                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                    Process.Start(new ProcessStartInfo("explorer.exe", dir) { UseShellExecute = true });
                };
                contextMenu.Items.Add(serversDirItem);

                var logsItem = new Forms.ToolStripMenuItem("View Backend Logs");
                logsItem.Click += (s, e) =>
                {
                    var logFile = Path.Combine(Path.GetTempPath(), "blockharbor-backend.log");
                    if (File.Exists(logFile))
                    {
                        Process.Start(new ProcessStartInfo("notepad.exe", logFile) { UseShellExecute = true });
                    }
                };
                contextMenu.Items.Add(logsItem);

                contextMenu.Items.Add(new Forms.ToolStripSeparator());

                var exitItem = new Forms.ToolStripMenuItem("Exit BlockHarbor");
                exitItem.Click += async (s, e) =>
                {
                    _isExplicitExit = true;
                    await GracefulShutdownAsync();
                    Close();
                };
                contextMenu.Items.Add(exitItem);

                _notifyIcon.ContextMenuStrip = contextMenu;
                _notifyIcon.DoubleClick += (s, e) => ShowAndActivate();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to init system tray: {ex.Message}");
            }
        }

        public void ShowAndActivate()
        {
            Show();
            WindowState = WindowState.Normal;
            Activate();
            Focus();
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            await InitializeWebViewAsync();
        }

        private async Task InitializeWebViewAsync()
        {
            LoadingStatusText.Text = "Connecting to BlockHarbor local engine...";
            ErrorPanel.Visibility = Visibility.Collapsed;

            try
            {
                // Wait for backend health check
                var isHealthy = await _supervisor.WaitForHealthAsync(timeoutSeconds: 30);
                if (!isHealthy)
                {
                    ShowStartupError("The local BlockHarbor backend did not respond within 30 seconds.");
                    return;
                }

                // Initialize WebView2 environment
                var userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "BlockHarbor",
                    "WebView2Data"
                );
                Directory.CreateDirectory(userDataFolder);

                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await MainWebView.EnsureCoreWebView2Async(env);

                // Configure settings
                MainWebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                MainWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;

                // Handle external navigation
                MainWebView.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;
                MainWebView.CoreWebView2.NavigationCompleted += CoreWebView2_NavigationCompleted;

                // Navigate to local dashboard
                var dashboardUrl = $"http://127.0.0.1:{_port}";
                MainWebView.CoreWebView2.Navigate(dashboardUrl);
            }
            catch (Exception ex)
            {
                ShowStartupError($"WebView2 initialization failed: {ex.Message}");
            }
        }

        private void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri))
            {
                // Open external links in default OS browser
                if (uri.Host != "127.0.0.1" && uri.Host != "localhost")
                {
                    e.Cancel = true;
                    try
                    {
                        Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true });
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"Failed to open external link: {ex.Message}");
                    }
                }
            }
        }

        private void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess)
            {
                // Hide splash loading overlay once loaded
                LoadingOverlay.Visibility = Visibility.Collapsed;
            }
            else
            {
                ShowStartupError($"Failed to load dashboard: {e.WebErrorStatus}");
            }
        }

        private void ShowStartupError(string message)
        {
            LoadingStatusText.Text = "Startup encountered an issue";
            ErrorMessageText.Text = message;
            ErrorPanel.Visibility = Visibility.Visible;
            LoadingProgressBar.Visibility = Visibility.Collapsed;
        }

        private async void BtnRetry_Click(object sender, RoutedEventArgs e)
        {
            LoadingProgressBar.Visibility = Visibility.Visible;
            ErrorPanel.Visibility = Visibility.Collapsed;
            await InitializeWebViewAsync();
        }

        private void BtnViewLogs_Click(object sender, RoutedEventArgs e)
        {
            var logFile = Path.Combine(Path.GetTempPath(), "blockharbor-backend.log");
            if (File.Exists(logFile))
            {
                Process.Start(new ProcessStartInfo("notepad.exe", logFile) { UseShellExecute = true });
            }
            else
            {
                System.Windows.MessageBox.Show("No log file found yet.", "BlockHarbor", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            if (!_isExplicitExit)
            {
                // Minimize to tray instead of hard closing
                e.Cancel = true;
                Hide();
                _notifyIcon?.ShowBalloonTip(
                    2000,
                    "BlockHarbor Running in Background",
                    "BlockHarbor and your servers continue running in the system tray.",
                    Forms.ToolTipIcon.Info
                );
            }
            else
            {
                _notifyIcon?.Dispose();
            }
        }

        private async Task GracefulShutdownAsync()
        {
            if (_notifyIcon != null)
            {
                _notifyIcon.Text = "BlockHarbor - Shutting down servers...";
            }

            await _supervisor.StopBackendAsync();
        }
    }
}
