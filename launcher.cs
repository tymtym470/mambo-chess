// 曼波棋社启动器 —— 编译成 启动曼波棋社.exe
//
// 为什么需要它：原来的 启动曼波棋社.bat 双击时会弹出一个黑色控制台窗口，
// 而且 .bat 在 Windows 上没法自定义图标。这个启动器：
//   1. 完全隐藏窗口（CreateNoWindow，不闪黑框）
//   2. 用嵌入的 .ico 作为文件图标
//   3. 把真正的启动逻辑交给 scripts/start-mambo.ps1（那里面已有端口占用检测、
//      版本比对、复用已有服务等逻辑，不在这里重复实现）
//
// 编译（由 scripts/build-launcher.mjs 调用）：
//   csc.exe /nologo /target:winexe /win32icon:mambo.ico
//           /out:启动曼波棋社.exe /r:System.Windows.Forms.dll launcher.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class MamboLauncher
{
    private const string ScriptRelativePath = @"scripts\start-mambo.ps1";
    private const string AppTitle = "曼波棋社 · Mambo Chess Club";

    [STAThread]
    private static int Main(string[] args)
    {
        // 从 exe 自身位置推项目根目录：exe 就在项目根目录下。
        string exePath = System.Reflection.Assembly.GetExecutingAssembly().Location;
        string root = Path.GetDirectoryName(exePath);
        string script = Path.Combine(root, ScriptRelativePath);

        if (!File.Exists(script))
        {
            ShowError(
                "找不到启动脚本：\n" + script + "\n\n" +
                "请确认 启动曼波棋社.exe 就在项目根目录下（和 server.mjs 同级），" +
                "并且 scripts 目录没有被移动或删除。");
            return 2;
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            // -NoProfile 保证不受用户 PowerShell 配置影响；脚本自己会处理执行策略。
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\"",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };

        // 把用户可能的额外参数透传给脚本（例如 -NoBrowser）。
        if (args != null && args.Length > 0)
        {
            startInfo.Arguments += " " + string.Join(" ", args);
        }

        try
        {
            Process.Start(startInfo);
            return 0;
        }
        catch (Exception error)
        {
            ShowError("启动失败：\n" + error.Message);
            return 1;
        }
    }

    private static void ShowError(string message)
    {
        try
        {
            MessageBox.Show(message, AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch
        {
            // 完全没有图形环境时退回到控制台输出，不让异常吞掉错误信息。
            Console.Error.WriteLine(message);
        }
    }
}
