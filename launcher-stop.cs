// 曼波棋社停止器 —— 编译成 停止曼波棋社.exe
//
// 与启动器同样的思路：隐藏窗口，图标内嵌，真正的逻辑交给 scripts/stop-mambo.ps1。
//
// 编译（由 scripts/build-launcher.mjs 调用）：
//   csc.exe /nologo /target:winexe /win32icon:mambo.ico
//           /out:停止曼波棋社.exe /r:System.Windows.Forms.dll launcher-stop.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class MamboStop
{
    private const string ScriptRelativePath = @"scripts\stop-mambo.ps1";
    private const string AppTitle = "曼波棋社 · Mambo Chess Club";

    [STAThread]
    private static int Main(string[] args)
    {
        string exePath = System.Reflection.Assembly.GetExecutingAssembly().Location;
        string root = Path.GetDirectoryName(exePath);
        string script = Path.Combine(root, ScriptRelativePath);

        if (!File.Exists(script))
        {
            ShowError("找不到停止脚本：\n" + script);
            return 2;
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };

        try
        {
            Process.Start(startInfo);
            return 0;
        }
        catch (Exception error)
        {
            ShowError("停止失败：\n" + error.Message);
            return 1;
        }
    }

    private static void ShowError(string message)
    {
        try { MessageBox.Show(message, AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error); }
        catch { Console.Error.WriteLine(message); }
    }
}
