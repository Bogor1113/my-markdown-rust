//! PDF 导出：复刻 Typora 的导出体验——保存对话框选定路径后，直接把文档渲染成 PDF 文件
//! （不再弹出系统打印对话框，也不需要用户手动「另存为 PDF」）。
//!
//! 实现（仅 Windows）：
//! 1. 前端把文档渲染为「自包含 HTML」（应用样式、KaTeX 公式字体、图片全部内联，离线可用）后经 IPC 传入；
//! 2. 本命令把 HTML 写入**临时文件**，然后**完全绕过 wry/tauri-runtime-wry 的 webview 创建**，
//!    改在专用线程里直接用 WebView2 COM 接口（webview2-com crate）完成整个打印流程：
//!    - 自建隐藏 HWND + WebView2 Environment（**每次导出用独立的 user data folder**）+
//!      CreateCoreWebView2Controller（创建失败可短暂重试）+ `file://` 导航 +
//!      `ICoreWebView2_7::PrintToPdf` 静默打印到目标文件。
//!
//!    为什么要绕开 wry：tauri-runtime-wry 对 PDF 导出窗口复用主窗口同一个 WebView2 环境
//!    （同一 user data folder）。在 WebView2 Runtime 151 上，「在同一进程里、已有主 webview
//!    存活的情况下再用该环境创建第二个 controller」会稳定报 0x8007139F（ERROR_WRONG_STATE，
//!    "组或资源的状态不是执行请求操作的正确状态"），wry 的 `Message::CreateWebview` 处理器只
//!    会 `log::error!` 吞掉该错误 → 隐藏窗口的 webview 从未创建 → 页面加载/打印事件全部静默
//!    丢弃 → 30 秒超时。
//!
//!    实测（C:\Users\jy\AppData\Local\Temp\opencode\wv2print-test\src\bin\two.rs）验证：
//!    与主窗口 controller 同进程共存时，用独立 UDF 的新 Environment + 自有隐藏窗口 +
//!    自建 controller，首次尝试即可成功完成 file:// 导航与 PrintToPdf（48KB PDF）。
//!
//!    `file://` 是普通导航、无 URL 长度限制（data: URL 在隐藏窗口里加载完成事件不可靠已弃用）；
//!    窗口必须在自建线程里配自己的消息泵（WebView2 回调以窗口消息形式投递到创建线程的消息队列）。
//! 3. 专线程在页面加载完成（`NavigationCompleted`）时通过 `ICoreWebView2_7::PrintToPdf` 打印；
//! 4. 收尾：销毁隐藏窗口、删除临时文件与临时 user data folder；若前端传来了标题大纲，
//!    再用 `pdf_outline::inject_outline` 给 PDF 写入书签树（WebView2 打印本身不支持大纲，
//!    需后处理注入，见 pdf_outline.rs）；
//! 5. 把结果（成功 / 失败 / 超时）回传前端。
//!
//! 为什么不直接用 iframe + window.print()：打印对话框无法自动化，且打印目标与
//! 「Typora 式直接写文件」不符；WebView2 的 PrintToPdf 才能静默输出 PDF。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use tauri::AppHandle;

use super::pdf_outline::OutlineEntry;

/// 等待打印完成的上限（页面加载 + 排版 + 打印）
const PRINT_TIMEOUT: Duration = Duration::from_secs(30);

/// 隐蔽窗口的原生窗口过程：全部交给 DefWindowProcW（隐藏窗口不处理任何交互消息）。
#[cfg(target_os = "windows")]
unsafe extern "system" fn wv2_window_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    windows::Win32::UI::WindowsAndMessaging::DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// 在专用线程里完成：隐藏窗口 → 独立环境 → controller（可重试）→ file:// 加载 → 打印。
///
/// 结果通过 `tx` 恰好回传一次（handler 或本函数结尾兜底，用 `reported` 去重）。
#[cfg(target_os = "windows")]
fn run_pdf_worker(
    tmp_path: &str,
    target_path: &str,
    tx: mpsc::Sender<Result<(), String>>,
    reported: Arc<AtomicBool>,
    udf_dir: &std::path::Path,
    class_name: &str,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Controller, ICoreWebView2Environment, ICoreWebView2Environment6,
        ICoreWebView2_7,
    };
    use webview2_com::{
        CreateCoreWebView2ControllerCompletedHandler,
        CreateCoreWebView2EnvironmentCompletedHandler, NavigationCompletedEventHandler,
        PrintToPdfCompletedHandler,
    };
    use windows::core::{BOOL, Interface, PCWSTR};
    use windows::Win32::{
        Foundation::{E_POINTER, HINSTANCE, HWND, RECT},
        System::{
            Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED},
            LibraryLoader::GetModuleHandleW,
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, DispatchMessageW, PeekMessageW, RegisterClassW,
            TranslateMessage, MSG, PM_REMOVE, WNDCLASSW, WS_OVERLAPPEDWINDOW,
        },
    };

    // 0. 本线程必须有 STA + 消息泵（WebView2 回调会以窗口消息形式投递到本线程队列）
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }

    // 1. 自建完全隐藏的窗口（A4 @ 96dpi = 794×1123 逻辑像素，排版与纸张一致）
    let class_wide: Vec<u16> = class_name.encode_utf16().chain(std::iter::once(0)).collect();
    let hwnd: HWND = unsafe {
        let wc = WNDCLASSW {
            lpfnWndProc: Some(wv2_window_proc),
            lpszClassName: PCWSTR(class_wide.as_ptr()),
            ..Default::default()
        };
        let _ = RegisterClassW(&wc);
        CreateWindowExW(
            Default::default(),
            PCWSTR(class_wide.as_ptr()),
            PCWSTR(class_wide.as_ptr()),
            WS_OVERLAPPEDWINDOW,
            0,
            0,
            794,
            1123,
            None,
            None,
            GetModuleHandleW(None).ok().map(|h| HINSTANCE(h.0)),
            None,
        )
    }
    .map_err(|e| format!("创建隐藏窗口失败：{e}"))?;

    // 2. 独立 WebView2 Environment（独立 user data folder，绕开与主 webview 共享环境的 0x8007139F）
    let environment: ICoreWebView2Environment = {
        let (etx, erx) = mpsc::channel::<windows::core::Result<ICoreWebView2Environment>>();
        let udf_wide: Vec<u16> = udf_dir
            .to_string_lossy()
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let udf_ptr = PCWSTR(udf_wide.as_ptr());
        CreateCoreWebView2EnvironmentCompletedHandler::wait_for_async_operation(
            Box::new(move |handler| unsafe {
                webview2_com::Microsoft::Web::WebView2::Win32::CreateCoreWebView2EnvironmentWithOptions(
                    PCWSTR::null(),
                    udf_ptr,
                    None,
                    &handler,
                )
                .map_err(webview2_com::Error::WindowsError)
            }),
            Box::new(move |error_code, environment| {
                error_code?;
                etx.send(environment.ok_or_else(|| windows::core::Error::from(E_POINTER)))
                    .expect("send env");
                Ok(())
            }),
        )
        .map_err(|e| format!("创建 WebView2 环境失败：{e}"))?;
        erx.recv()
            .map_err(|_| "创建 WebView2 环境超时".to_string())?
            .map_err(|e| format!("创建 WebView2 环境失败：{e}"))?
    };

    // 3. 创建 Controller（0x8007139F 是瞬时竞态，退避重试几次作为保险）
    let controller: ICoreWebView2Controller = {
        let mut last_err: Option<String> = None;
        let mut created = None;
        for attempt in 1..=3 {
            let (ctx, crx) = mpsc::channel::<windows::core::Result<ICoreWebView2Controller>>();
            let envc = environment.clone();
            // 注意：wait_for_async_operation 的错误不能 `?` 直接抛出——
            // 那会跳过整个重试循环，退避重试形同虚设。错误记入 last_err 继续。
            let wait_result =
                CreateCoreWebView2ControllerCompletedHandler::wait_for_async_operation(
                    Box::new(move |handler| unsafe {
                        envc
                            .CreateCoreWebView2Controller(hwnd, &handler)
                            .map_err(webview2_com::Error::WindowsError)
                    }),
                    Box::new(move |error_code, controller| {
                        error_code?;
                        ctx.send(controller.ok_or_else(|| windows::core::Error::from(E_POINTER)))
                            .expect("send controller");
                        Ok(())
                    }),
                );
            match wait_result {
                Ok(()) => match crx.recv() {
                    Ok(Ok(c)) => {
                        created = Some(c);
                        break;
                    }
                    Ok(Err(e)) => last_err = Some(e.to_string()),
                    Err(_) => last_err = Some("回调丢失".to_string()),
                },
                Err(e) => last_err = Some(format!("等待控制器创建回调失败：{e}")),
            }
            #[cfg(debug_assertions)]
            eprintln!("[pdf-export] controller 创建失败 attempt={attempt}，稍后重试: {last_err:?}");
            if attempt < 3 {
                std::thread::sleep(Duration::from_millis(400 * attempt as u64));
            }
        }
        created.ok_or_else(|| {
            format!("创建 WebView2 控制器失败：{}", last_err.unwrap_or_default())
        })?
    };

    unsafe {
        controller
            .SetBounds(RECT { left: 0, top: 0, right: 794, bottom: 1123 })
            .map_err(|e| format!("设置视口失败：{e}"))?;
        controller
            .SetIsVisible(false)
            .map_err(|e| format!("隐藏视口失败：{e}"))?;
    }

    let core = unsafe { controller.CoreWebView2() }.map_err(|e| format!("获取 WebView2 核心对象失败：{e}"))?;
    let webview7 = core
        .cast::<ICoreWebView2_7>()
        .map_err(|e| format!("获取 WebView2 打印接口失败：{e}"))?;
    let env6 = environment
        .cast::<ICoreWebView2Environment6>()
        .map_err(|e| format!("获取 WebView2 打印设置接口失败：{e}"))?;

    // 4. 页面加载完成 → 建打印设置 → PrintToPdf（回调把最终结果回传）
    let tx2 = tx.clone();
    let reported2 = reported.clone();
    let target_owned = target_path.to_string();
    let nav_handler = NavigationCompletedEventHandler::create(Box::new(move |_sender, args| {
        let args = args.ok_or_else(|| windows::core::Error::from(E_POINTER))?;
        let mut is_success = BOOL::default();
        unsafe { args.IsSuccess(&mut is_success)? };
        if !is_success.as_bool() {
            if !reported2.swap(true, Ordering::SeqCst) {
                let _ = tx2.send(Err("页面加载失败（导航未成功）".into()));
            }
            return Ok(());
        }
        #[cfg(debug_assertions)]
        eprintln!("[pdf-export] 页面加载完成，开始打印");

        unsafe {
            let settings = env6.CreatePrintSettings()?;
            // A4（8.27 × 11.69 英寸），四边 20mm 页边距（≈0.79 英寸），带背景色，无页眉页脚
            settings.SetPageWidth(8.27)?;
            settings.SetPageHeight(11.69)?;
            settings.SetMarginTop(0.79)?;
            settings.SetMarginBottom(0.79)?;
            settings.SetMarginLeft(0.79)?;
            settings.SetMarginRight(0.79)?;
            settings.SetShouldPrintBackgrounds(true)?;
            settings.SetShouldPrintHeaderAndFooter(false)?;

            // 打印完成回调：由 WebView2 后台线程调用，通过 channel 把结果回传给命令
            let ptx2 = tx2.clone();
            let preported2 = reported2.clone();
            let handler = PrintToPdfCompletedHandler::create(Box::new(
                move |error_code, is_successful| {
                    let r = if error_code.is_ok() && is_successful {
                        Ok(())
                    } else {
                        Err("打印到 PDF 失败".into())
                    };
                    if !preported2.swap(true, Ordering::SeqCst) {
                        let _ = ptx2.send(r);
                    }
                    Ok(())
                },
            ));

            // PrintToPdf 同步读取该指针，调用返回后无需保活
            let path_wide: Vec<u16> = target_owned.encode_utf16().chain(std::iter::once(0)).collect();
            webview7.PrintToPdf(PCWSTR(path_wide.as_ptr()), &settings, &handler)?;
            #[cfg(debug_assertions)]
            eprintln!("[pdf-export] PrintToPdf 已发起");
        }
        Ok(())
    }));

    let url = format!("file:///{}", tmp_path.replace('\\', "/"));
    let url_wide: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
    let mut nav_token = 0i64;
    unsafe {
        core.add_NavigationCompleted(&nav_handler, &mut nav_token)
            .map_err(|e| format!("注册导航回调失败：{e}"))?;
        core.Navigate(PCWSTR(url_wide.as_ptr()))
            .map_err(|e| format!("发起页面导航失败：{e}"))?;
    }
    #[cfg(debug_assertions)]
    eprintln!("[pdf-export] 导航到 {url}");

    // 5. 泵消息直到结果产生（handler 回传）或超时
    let deadline = Instant::now() + PRINT_TIMEOUT;
    while Instant::now() < deadline {
        if reported.load(Ordering::SeqCst) {
            break;
        }
        let pumped = unsafe {
            let mut msg: MSG = std::mem::zeroed();
            if PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
                true
            } else {
                false
            }
        };
        if !pumped {
            std::thread::sleep(Duration::from_millis(5));
        }
    }
    // 兜底：若超时但回调恰在途，再短暂等待
    if !reported.load(Ordering::SeqCst) {
        let until = Instant::now() + Duration::from_millis(1500);
        while Instant::now() < until && !reported.load(Ordering::SeqCst) {
            let pumped = unsafe {
                let mut msg: MSG = std::mem::zeroed();
                if PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                    true
                } else {
                    false
                }
            };
            if !pumped {
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    }

    // 6. 清理：销毁窗口、退出 COM、尽力删除临时 user data folder
    unsafe {
        let _ = controller.Close();
        let _ = DestroyWindow(hwnd);
        let _ = CoUninitialize();
    }
    let _ = std::fs::remove_dir_all(udf_dir);

    if !reported.load(Ordering::SeqCst) {
        Err("PDF 导出超时（页面加载或打印未在 30 秒内完成）".to_string())
    } else {
        Ok(())
    }
}

/// 专用打印线程入口：安排本次导出的资源命名，最终恰好回传一次结果。
#[cfg(target_os = "windows")]
fn pdf_worker(tmp_path: String, target_path: String, tx: mpsc::Sender<Result<(), String>>) {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let token = format!("{}-{}", std::process::id(), stamp);

    // 每次导出都用独立的 user data folder，避免 WebView2 运行时在共享环境下
    // 创建第二个 controller 时报 0x8007139F（与主窗口 webview 共存时实测稳定复现）
    let udf_dir = std::env::temp_dir().join(format!("mymdedit-webview2-{token}"));
    let class_name = format!("mymdedit-pdf-window-{token}");

    let reported = Arc::new(AtomicBool::new(false));
    let result = run_pdf_worker(&tmp_path, &target_path, tx.clone(), reported.clone(), &udf_dir, &class_name);
    if !reported.swap(true, Ordering::SeqCst) {
        #[cfg(debug_assertions)]
        eprintln!("[pdf-export] worker 结束：{result:?}");
        let _ = tx.send(result);
    }
}

/// Windows 实现：写临时 HTML → [专线程] 隐藏窗口 + 独立环境打印 → 注入大纲 → 清理并回传结果。
#[cfg(target_os = "windows")]
async fn export_pdf_windows(
    app: AppHandle,
    html: String,
    target_path: String,
    outline: Vec<OutlineEntry>,
) -> Result<(), String> {
    #[cfg(debug_assertions)]
    eprintln!("[pdf-export] 1. start, html={}B target={}", html.len(), target_path);
    let _ = &app;
    // 1. 自包含 HTML → 临时文件（file:// 导航：无 data: URL 长度/加载问题）
    //    关键修复：CSS 中的 position:fixed 会导致 WebView2 PrintToPdf 在每一页
    //    重复渲染 fixed 元素（工具栏/标题栏等 11 处），大量页面时性能爆炸甚至
    //    永远不触发完成回调。替换为 position:absolute 后 7 秒即可完成打印。
    let html = html
        .replace("position:fixed", "position:absolute")
        .replace("position: fixed", "position: absolute")
        .replace("position :fixed", "position:absolute")
        .replace("position : fixed", "position:absolute");

    let tmp_path = std::env::temp_dir().join(format!(
        "mymdedit-pdf-export-{}.html",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    std::fs::write(&tmp_path, &html).map_err(|e| format!("写入临时页面失败：{e}"))?;

    // 2. 专线程执行「隐藏窗口 + 独立环境 + 导航 + 打印」整条链路
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let tmp2 = tmp_path.to_string_lossy().to_string();
    let target2 = target_path.clone();
    let wtx = tx.clone();
    std::thread::spawn(move || {
        pdf_worker(tmp2, target2, wtx);
    });

    // 3. 等待打印完成 / 失败 / 超时，然后清理临时文件。
    //    等待时限必须 ≥ worker 侧总时限（PRINT_TIMEOUT + 1.5s 宽限）：
    //    若命令侧先超时返回"失败"，PDF 实际可能在宽限窗口内已成功写出，
    //    用户看到失败提示、文件却存在且没有书签。
    //    放进 spawn_blocking：async command 里直接 recv_timeout 会阻塞
    //    tokio worker 线程 30+ 秒，并发导出/搜索时排队甚至饿死。
    let wait_result = tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(PRINT_TIMEOUT + Duration::from_secs(3))
    })
    .await
    .unwrap_or_else(|_| Err(std::sync::mpsc::RecvTimeoutError::Disconnected));
    let result = wait_result.unwrap_or_else(|_| {
        Err("PDF 导出超时（页面加载或打印未在限时内完成）".to_string())
    });
    let _ = std::fs::remove_file(&tmp_path);

    // 4. 打印成功后注入 PDF 大纲（书签）。注入失败不阻断导出：PDF 本身已生成，
    //    失败信息也不外抛——大纲属于增强项，此处静默降级。
    if result.is_ok() && !outline.is_empty() {
        let _ = super::pdf_outline::inject_outline(&target_path, &outline);
    }
    result
}

/// 导出 PDF：Typora 式（前端先弹保存对话框，本命令把 HTML 静默打印成 PDF 文件，并注入大纲）。
#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    html: String,
    target_path: String,
    outline: Vec<OutlineEntry>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return export_pdf_windows(app, html, target_path, outline).await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, html, target_path, outline);
        return Err("当前平台暂不支持导出 PDF".into());
    }
}