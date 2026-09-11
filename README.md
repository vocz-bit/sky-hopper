# 跳跳兔 · Sky Hopper

一只兔子一直往上跳的休闲小游戏：踩平台、弹弹簧、躲会碎的板子、收集星星，越跳越高挑战最高分。

本仓库同时提供两个版本：

- **网页版**：打开 `www/index.html` 就能玩，也可以部署成网页。
- **安卓 APK**：推到 GitHub 后，由 GitHub Actions 自动打包成可安装的 APK 文件，直接下载到手机安装。

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

## 一、把代码传到 GitHub

这一步其实**不一定要用命令行**，最简单是下载 [GitHub Desktop](https://desktop.github.com)（图形界面，点几下就能上传）。

如果你要用命令行，先下载 GitHub CLI：

```powershell
winget install --id GitHub.cli
```

或者到 <https://cli.github.com/> 下载安装包。装好后登录：

```bash
gh auth login
```

然后在 GitHub 网页上**新建一个空仓库**（不要勾选生成 README），名字随意，例如 `sky-hopper`。接着在本项目目录执行：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
git remote add origin https://github.com/<你的用户名>/sky-hopper.git
git push -u origin main
```

## 二、让 GitHub 自动生成 APK

代码推上去后，GitHub 会用仓库里的 `.github/workflows/build-apk.yml` 自动打包 APK，**本机不需要安装安卓开发环境**。

两种方式触发：

1. **手动触发**：仓库页面点 `Actions` → 左侧 `build-apk` → `Run workflow` → `Run workflow`（绿色按钮）。
2. **自动发布**：推送一个 `v` 开头的标签，例如：

```bash
git tag v1.0.0
git push origin v1.0.0
```

构建完成后（第一次约需几分钟）：

- 手动触发：进入那次 `build-apk` 运行记录，页面底部 `Artifacts` 里有 `sky-hopper-apk`，点它下载。
- 推送标签：仓库的 `Releases` 页面会自动出现一个发布，APK 直接作为附件挂在上面，别人点一下就能下载。

## 三、在安卓手机上安装

1. 把下载到的 `app-debug.apk` 传到手机。
2. 打开它，如果提示“安装未知来源应用”，允许即可。
3. 安装完成后打开“跳跳兔”就能玩。

> 这是 debug 签名包，用于自己玩和分享，可以直接安装；它不是上架应用商店的正式签名包。

## 四、本地直接玩网页版

双击 `www/index.html` 即可；或者：

```bash
cd www
python -m http.server 8000
```

然后打开 <http://localhost:8000>。

## 文件结构

```
www/                          网页游戏本体
  index.html
  style.css
  game.js
package.json                  Capacitor 依赖
capacitor.config.json         APK 应用配置（包名、名称）
.github/workflows/build-apk.yml   GitHub 自动构建 APK 的脚本
```
