fn main() {
    // 前端构建产物目录：dist 内容变化时触发 build script 重跑，
    // 确保 generate_context! 重新嵌入最新 JS/CSS（否则改了前端不重编打出来的包是旧的）
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}