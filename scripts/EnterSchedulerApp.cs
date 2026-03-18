using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace EnterSchedulerApp
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    internal sealed class MainForm : Form
    {
        private readonly Timer _timer;
        private readonly TextBox _timesTextBox;
        private readonly TextBox _windowTitleTextBox;
        private readonly TextBox _logTextBox;
        private readonly Label _statusLabel;
        private readonly Button _startButton;
        private readonly Button _stopButton;
        private readonly Button _testButton;
        private readonly CheckBox _useWindowTitleCheckBox;

        private readonly string _settingsPath;
        private List<string> _scheduledTimes = new List<string>();
        private string _lastTriggeredMinute = string.Empty;
        private bool _isRunning;

        public MainForm()
        {
            Text = "엔터 자동 입력기";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            ClientSize = new Size(560, 420);
            Font = new Font("Malgun Gothic", 9F, FontStyle.Regular, GraphicsUnit.Point);

            _settingsPath = Path.Combine(Application.StartupPath, "EnterScheduler.settings.txt");

            var titleLabel = new Label
            {
                Text = "정해진 시간에 엔터 입력",
                Font = new Font("Malgun Gothic", 14F, FontStyle.Bold, GraphicsUnit.Point),
                AutoSize = true,
                Location = new Point(20, 18)
            };

            var subtitleLabel = new Label
            {
                Text = "시간은 쉼표로 구분해 입력하세요. 예: 09:00, 13:30, 18:00",
                AutoSize = true,
                ForeColor = Color.DimGray,
                Location = new Point(22, 52)
            };

            var timesLabel = new Label
            {
                Text = "예약 시간",
                AutoSize = true,
                Location = new Point(20, 92)
            };

            _timesTextBox = new TextBox
            {
                Location = new Point(20, 114),
                Size = new Size(520, 28)
            };

            _useWindowTitleCheckBox = new CheckBox
            {
                Text = "특정 창 제목에 엔터 보내기",
                AutoSize = true,
                Location = new Point(20, 158)
            };
            _useWindowTitleCheckBox.CheckedChanged += delegate { UpdateWindowTitleState(); };

            _windowTitleTextBox = new TextBox
            {
                Location = new Point(20, 184),
                Size = new Size(520, 28),
                Enabled = false
            };

            _startButton = new Button
            {
                Text = "시작",
                Location = new Point(20, 228),
                Size = new Size(100, 34)
            };
            _startButton.Click += delegate { StartScheduler(); };

            _stopButton = new Button
            {
                Text = "중지",
                Location = new Point(128, 228),
                Size = new Size(100, 34),
                Enabled = false
            };
            _stopButton.Click += delegate { StopScheduler(); };

            _testButton = new Button
            {
                Text = "지금 보내기",
                Location = new Point(236, 228),
                Size = new Size(100, 34)
            };
            _testButton.Click += delegate { SendEnterNow(true); };

            _statusLabel = new Label
            {
                Text = "상태: 중지됨",
                AutoSize = true,
                ForeColor = Color.Firebrick,
                Location = new Point(360, 236)
            };

            var logLabel = new Label
            {
                Text = "동작 기록",
                AutoSize = true,
                Location = new Point(20, 282)
            };

            _logTextBox = new TextBox
            {
                Location = new Point(20, 304),
                Size = new Size(520, 96),
                Multiline = true,
                ScrollBars = ScrollBars.Vertical,
                ReadOnly = true
            };

            Controls.Add(titleLabel);
            Controls.Add(subtitleLabel);
            Controls.Add(timesLabel);
            Controls.Add(_timesTextBox);
            Controls.Add(_useWindowTitleCheckBox);
            Controls.Add(_windowTitleTextBox);
            Controls.Add(_startButton);
            Controls.Add(_stopButton);
            Controls.Add(_testButton);
            Controls.Add(_statusLabel);
            Controls.Add(logLabel);
            Controls.Add(_logTextBox);

            _timer = new Timer();
            _timer.Interval = 1000;
            _timer.Tick += HandleTimerTick;

            LoadSettings();
            AppendLog("프로그램이 준비되었습니다.");
        }

        private void UpdateWindowTitleState()
        {
            _windowTitleTextBox.Enabled = _useWindowTitleCheckBox.Checked;
        }

        private void LoadSettings()
        {
            if (!File.Exists(_settingsPath))
            {
                return;
            }

            try
            {
                string[] lines = File.ReadAllLines(_settingsPath);
                if (lines.Length > 0)
                {
                    _timesTextBox.Text = lines[0];
                }

                if (lines.Length > 1)
                {
                    _useWindowTitleCheckBox.Checked = string.Equals(lines[1], "1", StringComparison.Ordinal);
                }

                if (lines.Length > 2)
                {
                    _windowTitleTextBox.Text = lines[2];
                }
            }
            catch (Exception ex)
            {
                AppendLog("설정 불러오기 실패: " + ex.Message);
            }

            UpdateWindowTitleState();
        }

        private void SaveSettings()
        {
            try
            {
                File.WriteAllLines(
                    _settingsPath,
                    new[]
                    {
                        _timesTextBox.Text.Trim(),
                        _useWindowTitleCheckBox.Checked ? "1" : "0",
                        _windowTitleTextBox.Text.Trim()
                    }
                );
            }
            catch (Exception ex)
            {
                AppendLog("설정 저장 실패: " + ex.Message);
            }
        }

        private void StartScheduler()
        {
            List<string> normalizedTimes;
            try
            {
                normalizedTimes = ParseTimes(_timesTextBox.Text);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "시간 입력 오류", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (_useWindowTitleCheckBox.Checked && string.IsNullOrWhiteSpace(_windowTitleTextBox.Text))
            {
                MessageBox.Show(this, "창 제목을 입력하거나 해당 옵션을 해제해주세요.", "창 제목 필요", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            _scheduledTimes = normalizedTimes;
            _lastTriggeredMinute = string.Empty;
            _isRunning = true;
            _timer.Start();
            SaveSettings();
            UpdateUiState();
            AppendLog("스케줄 시작: " + string.Join(", ", _scheduledTimes));
        }

        private void StopScheduler()
        {
            _isRunning = false;
            _timer.Stop();
            UpdateUiState();
            AppendLog("스케줄이 중지되었습니다.");
        }

        private void UpdateUiState()
        {
            _startButton.Enabled = !_isRunning;
            _stopButton.Enabled = _isRunning;
            _statusLabel.Text = _isRunning ? "상태: 실행 중" : "상태: 중지됨";
            _statusLabel.ForeColor = _isRunning ? Color.SeaGreen : Color.Firebrick;
        }

        private static List<string> ParseTimes(string raw)
        {
            string[] tokens = (raw ?? string.Empty)
                .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            var results = new SortedSet<string>(StringComparer.Ordinal);
            foreach (string token in tokens)
            {
                string trimmed = token.Trim();
                if (trimmed.Length == 0)
                {
                    continue;
                }

                DateTime parsed;
                if (
                    !DateTime.TryParseExact(trimmed, "H:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed) &&
                    !DateTime.TryParseExact(trimmed, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed)
                )
                {
                    throw new InvalidOperationException("잘못된 시간 형식입니다: " + trimmed + " (예: 09:00)");
                }

                results.Add(parsed.ToString("HH:mm"));
            }

            if (results.Count == 0)
            {
                throw new InvalidOperationException("최소 1개 이상의 시간을 입력해주세요.");
            }

            return results.ToList();
        }

        private void HandleTimerTick(object sender, EventArgs e)
        {
            string now = DateTime.Now.ToString("HH:mm");
            string minuteMarker = DateTime.Now.ToString("yyyy-MM-dd HH:mm");

            if (_scheduledTimes.Contains(now) && !string.Equals(_lastTriggeredMinute, minuteMarker, StringComparison.Ordinal))
            {
                SendEnterNow(false);
                _lastTriggeredMinute = minuteMarker;
            }
        }

        private void SendEnterNow(bool manual)
        {
            try
            {
                if (_useWindowTitleCheckBox.Checked)
                {
                    bool activated = AppActivate(_windowTitleTextBox.Text.Trim());
                    if (!activated)
                    {
                        AppendLog("창을 찾을 수 없습니다: " + _windowTitleTextBox.Text.Trim());
                        MessageBox.Show(this, "대상 창을 찾을 수 없습니다.", "창 찾기 실패", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        return;
                    }

                    Application.DoEvents();
                    System.Threading.Thread.Sleep(250);
                }

                SendKeys.SendWait("{ENTER}");
                AppendLog((manual ? "수동" : "예약") + " 엔터 입력 완료: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            }
            catch (Exception ex)
            {
                AppendLog("입력 실패: " + ex.Message);
                MessageBox.Show(this, ex.Message, "입력 실패", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static bool AppActivate(string windowTitle)
        {
            if (string.IsNullOrWhiteSpace(windowTitle))
            {
                return false;
            }

            IntPtr handle = NativeMethods.FindWindowByPartialTitle(windowTitle);
            if (handle == IntPtr.Zero)
            {
                return false;
            }

            NativeMethods.ShowWindow(handle, NativeMethods.SW_RESTORE);
            return NativeMethods.SetForegroundWindow(handle);
        }

        private void AppendLog(string message)
        {
            string line = "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + message;
            _logTextBox.AppendText(line + Environment.NewLine);
        }
    }

    internal static class NativeMethods
    {
        internal const int SW_RESTORE = 9;

        internal delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        internal static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        internal static IntPtr FindWindowByPartialTitle(string title)
        {
            IntPtr found = IntPtr.Zero;
            EnumWindows(
                delegate (IntPtr hWnd, IntPtr lParam)
                {
                    if (!IsWindowVisible(hWnd))
                    {
                        return true;
                    }

                    var builder = new StringBuilder(512);
                    GetWindowText(hWnd, builder, builder.Capacity);
                    string currentTitle = builder.ToString();
                    if (currentTitle.IndexOf(title, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        found = hWnd;
                        return false;
                    }

                    return true;
                },
                IntPtr.Zero
            );

            return found;
        }
    }
}
