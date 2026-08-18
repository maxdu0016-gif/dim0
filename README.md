# Dim0 iPad Pencil

基于 [Dim0](https://github.com/vcmf/dim0) 开发的 iPad 无限画布版本，重点优化 iPad Safari / PWA 中的 Apple Pencil 手写体验。

## 已实现

- Apple Pencil 压感笔迹
- Pointer Events 高频采样与合并事件采样
- 稀疏采样点插值，减少笔画断点和大间隔
- 二次曲线平滑，改善笔迹连续性
- 画笔颜色和粗细设置
- 整笔橡皮擦
- 撤销与重做
- 基础防误触：书写时抑制手掌触摸和文字选择
- 手指移动画布、双指缩放
- 本地保存及后端同步

## 当前限制

- Safari / PWA 无法读取 Apple Pencil 的双击或 Apple Pencil Pro 捏合手势。
- 如需双击切换橡皮擦，需要开发 iPad 原生应用，并通过 `UIPencilInteraction` 接入。
- 当前橡皮擦按整条笔画删除，暂不支持局部擦除。
- 暂未加入倾斜笔锋、荧光笔、套索和手写识别。

## 本地运行

需要安装 Node.js 和 npm。

```powershell
cd webui
npm install
npm run dev -- --host 0.0.0.0 --port 4322
```

电脑浏览器访问：

```text
http://localhost:4322
```

## 使用 iPad 测试

1. 确保电脑和 iPad 连接同一个局域网。
2. 在 Windows PowerShell 中查看电脑的局域网 IPv4 地址：

   ```powershell
   Get-NetIPConfiguration | Where-Object IPv4Address | Select-Object InterfaceAlias, IPv4Address
   ```

3. 在 iPad Safari 中访问：

   ```text
   http://电脑的IPv4地址:4322
   ```

4. 如果 Windows 弹出防火墙提示，请允许专用网络访问。
5. 可在 Safari 的分享菜单中选择“添加到主屏幕”，以接近 PWA 的方式测试。

建议重点检查：

- 连续快速书写时是否仍有明显采样间隔
- 手掌放在屏幕上时是否误选字段或拖动画布
- Apple Pencil 压力变化是否影响笔画粗细
- 手指平移和双指缩放是否正常
- 橡皮擦、撤销、重做和刷新后的笔迹恢复是否正常

## 主要代码位置

| 功能 | 文件或目录 |
| --- | --- |
| Apple Pencil 输入与防误触 | `webui/src/features/board/harness/ink/ink-input-layer.tsx` |
| 笔迹插值和平滑 | `webui/src/features/board/harness/ink/ink-geometry.ts` |
| 手写状态与操作 | `webui/src/features/board/harness/ink/` |
| 画布节点类型 | `webui/src/features/board/harness/node-types/` |
| 画布存储与同步 | `webui/src/features/board/harness/persist/`、`webui/src/features/board/harness/sync/` |

## 检查与构建

```powershell
cd webui
npm run check-all
npm run test:run -- src/features/board/harness/ink/ink-geometry.test.ts src/features/board/harness/canvas/custom-node-types.test.ts
npm run build
```

## 上游项目

本项目基于 [vcmf/dim0](https://github.com/vcmf/dim0)。许可证及第三方依赖说明以仓库中的许可证文件和各依赖许可证为准。
