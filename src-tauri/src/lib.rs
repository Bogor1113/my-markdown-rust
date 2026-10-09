mod commands;

use std::path::Path;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, LogicalPosition, LogicalSize, Manager, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::commands::lock_ok;

/// 前端同步过来的未保存文件列表（用于窗口关闭确认）
pub struct DirtyFiles(pub Mutex<Vec<String>>);

/// 呼出主界面：显示 + 还原最小化 + 聚焦（托盘菜单「打开主界面」/ 单击托盘图标）
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 把主窗口的尺寸与位置限制进**当前显示器的工作区**。
///
/// 起因：配置里默认 1280×820、minHeight 600，而本项目 `decorations: false` ——
/// 最小化/最大化/关闭三个按钮由前端画在窗口右上角。在低分辨率或**高缩放**的机器上
/// （例：1366×768 屏幕 @125% 缩放，逻辑工作区只有约 819×582），窗口既比屏幕大、
/// 最小尺寸也大于可用高度 → 底部被切掉、又缩不动，右上角关闭按钮可能落到屏幕外点不到。
///
/// 规则：
/// - 目标尺寸 = min(配置期望值, 工作区 × 96%)，保证窗口完整可见；
/// - 最小尺寸同步下调为 min(配置最小值, 目标尺寸)，否则"最小高度 > 屏幕可用高度"会让
///   用户想缩小也缩不动；
/// - 位置在工作区内居中后再夹一次边界，多显示器 / 负坐标（副屏在主屏左侧）也正确；
/// - `work_area` 已排除任务栏，且是物理像素，需除以 scale_factor 换算到逻辑像素。
///
/// 启动时自动调用一次；托盘菜单「窗口适配到屏幕」可随时手动复位（换显示器/改缩放后救急）。
fn fit_window_to_work_area<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        eprintln!("[window-fit] 拿不到显示器信息，跳过窗口适配（沿用配置尺寸）");
        return;
    };

    let scale = monitor.scale_factor().max(0.1);
    let wa = monitor.work_area();
    let wa_w = wa.size.width as f64 / scale;
    let wa_h = wa.size.height as f64 / scale;
    let wa_x = wa.position.x as f64 / scale;
    let wa_y = wa.position.y as f64 / scale;

    // 与 tauri.conf.json 的期望值保持一致
    const WANT_W: f64 = 1280.0;
    const WANT_H: f64 = 820.0;
    const MIN_W: f64 = 900.0;
    const MIN_H: f64 = 600.0;
    // 留边比例：既不贴满屏幕，也不至于太小
    const EDGE: f64 = 0.96;

    let w = (WANT_W.min(wa_w * EDGE)).max(480.0).floor();
    let h = (WANT_H.min(wa_h * EDGE)).max(360.0).floor();

    let _ = window.set_size(tauri::Size::Logical(LogicalSize::new(w, h)));
    // 最小尺寸必须 ≤ 目标尺寸，否则小屏上依然会溢出
    let _ = window.set_min_size(Some(tauri::Size::Logical(LogicalSize::new(
        MIN_W.min(w),
        MIN_H.min(h),
    ))));

    let x = (wa_x + (wa_w - w) / 2.0).clamp(wa_x, (wa_x + wa_w - w).max(wa_x));
    let y = (wa_y + (wa_h - h) / 2.0).clamp(wa_y, (wa_y + wa_h - h).max(wa_y));
    let _ = window.set_position(tauri::Position::Logical(LogicalPosition::new(x, y)));

    eprintln!(
        "[window-fit] 工作区 {:.0}x{:.0} @{:.0},{:.0}（缩放 {:.2}）→ 窗口 {:.0}x{:.0} @{:.0},{:.0}",
        wa_w, wa_h, wa_x, wa_y, scale, w, h, x, y
    );
}

/// 托盘「退出程序」：有未保存文件时弹系统确认框，确认后才真正退出
fn confirm_quit(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        app.exit(0);
        return;
    };
    let dirty = lock_ok(&window.state::<DirtyFiles>().0).clone();
    // 无未保存 → 直接退出
    if dirty.is_empty() {
        app.exit(0);
        return;
    }
    // 有未保存 → 弹原生确认框，确认后才退出
    let win = window.clone();
    let app_handle = app.clone();
    let names = dirty.iter().take(3).cloned().collect::<Vec<_>>().join("、");
    let count = dirty.len();
    let msg = if count > 3 {
        format!("有 {count} 个文件未保存（{names} 等），确定退出？")
    } else {
        format!("有 {count} 个文件未保存（{names}），确定退出？")
    };
    win.dialog()
        .message(msg)
        .title("未保存的修改")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("退出".into(), "取消".into()))
        .show(move |confirmed| {
            if confirmed {
                let _ = app_handle.exit(0);
            }
        });
}

/// 前端在标签页/内容变化时调用，同步当前未保存文件列表
#[tauri::command]
fn set_dirty_files(state: tauri::State<DirtyFiles>, files: Vec<String>) {
    *lock_ok(&state.0) = files;
}

/// 获取文件大小（字节），用于大文件保护判断
#[tauri::command]
fn file_size(path: &str) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// 系统临时目录（「用系统查看器打开」远程图片时先下载到此目录）
#[tauri::command]
fn temp_dir() -> String {
    std::env::temp_dir().to_string_lossy().to_string()
}

/// 启动时通过命令行/文件关联（双击 .md 文件）传入的待打开文件列表
pub struct PendingOpenFiles(pub Mutex<Vec<String>>);

/// 前端启动后调用：取走并清空待打开文件列表（取走即清空，避免重复打开）
#[tauri::command]
fn take_pending_open_files(state: tauri::State<PendingOpenFiles>) -> Vec<String> {
    std::mem::take(&mut *lock_ok(&state.0))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // 当第二个实例启动时（双击 .md 文件），将文件路径发送给主实例
            // argv[0] 是 exe 路径，后续参数是文件路径
            let file_paths: Vec<String> = argv
                .iter()
                .skip(1) // 跳过 exe 路径
                .filter(|a| {
                    let p = std::path::Path::new(a);
                    !a.starts_with("--") && p.is_file()
                })
                .cloned()
                .collect();
            
            // 无论是否带文件参数都要唤起主窗口：主窗口在托盘/最小化时双击 exe
            // 或开始菜单图标，第二实例被插件终止——若只在带文件参数时才 show/focus，
            // 用户会以为"程序点不开"
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            if !file_paths.is_empty() {
                // 发送事件到主窗口，通知前端打开这些文件
                let _ = app.emit("single-instance-open-files", file_paths);
            }
        }))
        .manage(DirtyFiles(Mutex::new(Vec::new())))
        .manage(PendingOpenFiles(Mutex::new(Vec::new())))
        .manage(commands::watcher::DirWatcher(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::file::read_file,
            commands::file::write_file,
            commands::file::save_image,
            commands::file::read_file_bytes,
            commands::file::read_file_b64,
            commands::file::save_image_b64,
            commands::file::create_file,
            commands::file::create_directory,
            commands::file::rename_path,
            commands::file::delete_path,
            commands::directory::list_directory,
            commands::association::check_md_association,
            commands::association::set_md_association,
            commands::search::search_files,
            commands::search::replace_files,
            commands::pdf::export_pdf,
            commands::watcher::watch_directory,
            commands::watcher::stop_watching,
            set_dirty_files,
            file_size,
            temp_dir,
            take_pending_open_files,
        ])
.setup(|app| {
            // 窗口标题带版本号：MyMdEdit-波哥自研V{版本}（版本取�?tauri 配置，与打包版本一致）
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_title(&format!(
                    "MyMdEdit-波哥自研V{}",
                    app.package_info().version
                ));
                // 低分辨率 / 高缩放机器适配：避免窗口大于屏幕导致底部被切、
                // 右上角（自绘的）关闭按钮落到屏幕外点不到
                fit_window_to_work_area(&win);
            }
            // 仅 debug 构建：启动后自动打开 DevTools，便于定位生产环境运行时报错
            #[cfg(debug_assertions)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.open_devtools();
                }
            }
            // 收集命令行传入的文件路径（双击 .md 文件通过文件关联启动的场景）
            // 用 state 传递而非事件：setup 执行时 WebView 尚未加载，事件监听会丢失
            let pending: Vec<String> = std::env::args()
                .skip(1) // 第一个是 exe 自身路径
                .filter(|a| {
                    // 仅收集存在的普通文件（自动排除 --xxx 调试参数、目录等）
                    let p = Path::new(a);
                    !a.starts_with("--") && p.is_file()
                })
                .collect();
            if !pending.is_empty() {
                *lock_ok(&app.state::<PendingOpenFiles>().0) = pending;
            }
            // 启动时自动检查并设置 .md 文件关联（后台执行，不阻塞窗口）
            std::thread::spawn(|| {
                let _ = commands::association::ensure_md_association();
            });

            // 窗口显示兜底已移除：窗口配置为 visible:true 直显，前端 JS 挂载后也立即
            // 调用 show()（见 App.tsx）。此前这里在启动 1.5s 后对已显示窗口再 show() 一次，
            // 在 Windows WebView2 上会触发「隐藏/重复显示 → 输入命中失效」问题，
            // 表现为界面能渲染但鼠标/键盘/悬停全部无响应（连 F12 都按不了）。
            // 此兜底本是为旧 visible:false 防白屏设计的历史遗留，现在已多余，故删除。

            // 系统托盘：关闭按钮最小化到托盘，托盘菜单支持「新建文件 / 打开主界面 / 退出程序」
            let new_file_item = MenuItem::with_id(app, "new-file", "新建文件", true, None::<&str>)?;
            let show_item = MenuItem::with_id(app, "show-main", "打开主界面", true, None::<&str>)?;
            // 救生入口：换显示器 / 改缩放 / 改分辨率后窗口若跑到屏幕外，
            // 用户点不到标题栏时可以从托盘一键把窗口拉回屏幕内。
            let fit_item = MenuItem::with_id(app, "fit-window", "窗口适配到屏幕", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&new_file_item, &show_item, &fit_item, &quit_item])?;
            // 图标加载失败不 panic：只损失托盘图标显示，不能让整个应用无法启动
            let tray_builder = match app.default_window_icon() {
                Some(icon) => TrayIconBuilder::new().icon(icon.clone()),
                None => {
                    eprintln!("[tray] default window icon unavailable, tray will have no icon");
                    TrayIconBuilder::new()
                }
            };
            let _tray = tray_builder
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    // 新建文件：先呼出主界面，再通知前端弹出新建对话框
                    "new-file" => {
                        show_main_window(app);
                        let _ = app.emit("tray-new-file", ());
                    }
                    // 打开主界面
                    "show-main" => show_main_window(app),
                    // 窗口适配到屏幕（尺寸 + 位置复位）
                    "fit-window" => {
                        if let Some(win) = app.get_webview_window("main") {
                            fit_window_to_work_area(&win);
                        }
                        show_main_window(app);
                    }
                    // 退出程序：有未保存文件时先确认
                    "quit" => confirm_quit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 单击托盘图标（左键）→ 打开主界面
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭拦截：主界面点击关闭按钮 → 最小化到托盘（隐藏窗口，不退出）。
            // 真正退出只走托盘菜单「退出程序」（confirm_quit，含未保存确认）。
            // 放在 Rust 主进程侧实现，不依赖 WebView JS 事件循环。
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            // 拖入文件：当用户将文件或文件夹拖入窗口时，
            // .md 文件路径通过 app-drag-drop 事件通知前端打开，
            // 文件夹路径通过 app-drag-drop-folder 事件通知前端设为根目录
            if let WindowEvent::DragDrop(event) = event {
                if let tauri::DragDropEvent::Drop { paths, .. } = event {
                    let mut md_paths: Vec<String> = Vec::new();
                    let mut folder_paths: Vec<String> = Vec::new();
                    for p in paths {
                        if p.is_dir() {
                            folder_paths.push(p.to_string_lossy().to_string());
                        } else {
                            let lower = p.to_string_lossy().to_lowercase();
                            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                                md_paths.push(p.to_string_lossy().to_string());
                            }
                        }
                    }
                    if !folder_paths.is_empty() {
                        let _ = window.emit("app-drag-drop-folder", folder_paths);
                    }
                    if !md_paths.is_empty() {
                        let _ = window.emit("app-drag-drop", md_paths);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
