# 跳跳兔 · Sky Hopper

一只兔子一直往上跳的休闲小游戏：踩平台、弹弹簧、躲会碎的板子、收集星星，越跳越高挑战最高分。

- **网页版**：打开 `index.html` 就能玩；开启 GitHub Pages 后，手机上也能直接打开。
- **安卓 APK**：由 GitHub Actions 自动打包成可安装的 APK，直接下载到手机安装。

## 玩法

| 平台 | 效果 |
| --- | --- |
| 绿色平台 | 正常弹跳 |
| 蓝色移动平台 | 左右移动，注意落点 |
| 棕色平台 | 踩一次后碎裂 |
| 橙色弹簧 | 弹得更高 |

控制：

- 电脑：`←` / `→` 或 `A` / `D` 左右移动，`空格` 开始 / 重开
- 手机：按住屏幕左半边向左，右半边向右，点击开始 / 重开

## 生成 APK

仓库里的 `.github/workflows/build-apk.yml` 负责自动打包，本机不需要安装安卓开发环境。

- 手动打包：`Actions` → `build-apk` → `Run workflow`。
- 想要可直接下载的安装包：在 `Releases` 里创建一个 `v1.0.0` 标签的发布，构建完成后 APK 会自动挂到发布页，任何人点一下就能下载。

## 网页版

直接用浏览器打开 `index.html`；或者打开仓库的 `Settings → Pages`，把分支设为 `main`、目录设为 `/ (root)`，保存后就能得到在线地址。

## 文件结构

```
index.html                        页面结构
style.css                         样式
game.js                           游戏逻辑
package.json                      Capacitor 依赖
capacitor.config.json             APK 应用配置（包名、名称）
.github/workflows/build-apk.yml   GitHub 自动构建 APK 的脚本
```
