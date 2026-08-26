import SwiftUI

struct CanvasScreen: View {
    @ObservedObject var model: CanvasViewModel
    @State private var isClearConfirmationPresented = false
    @State private var isSyncPanelPresented = false

    var body: some View {
        ZStack(alignment: .top) {
            PencilCanvasRepresentable(model: model)
                .ignoresSafeArea()

            toolbar
                .padding(.top, 12)
                .padding(.horizontal, 16)
        }
        .alert("清空这张画布？", isPresented: $isClearConfirmationPresented) {
            Button("取消", role: .cancel) {}
            Button("清空", role: .destructive) {
                model.clearDrawing()
            }
        } message: {
            Text("本机保存的笔迹也会被删除，此操作无法撤销。")
        }
    }

    private var toolbar: some View {
        HStack(spacing: 8) {
            brand
            divider

            ForEach(CanvasTool.allCases) { tool in
                toolButton(tool)
            }

            divider
            colorPicker
            divider

            iconButton("arrow.uturn.backward", enabled: model.canUndo, action: model.undo)
            iconButton("arrow.uturn.forward", enabled: model.canRedo, action: model.redo)

            Spacer(minLength: 12)

            Label(model.saveState.label, systemImage: saveStateImage)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(model.saveState == .failed ? Color.red : Color.secondary)

            syncButton

            Button {
                isClearConfirmationPresented = true
            } label: {
                Image(systemName: "trash")
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding(8)
        .frame(maxWidth: 900)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .stroke(Color.black.opacity(0.08), lineWidth: 1)
        }
        .shadow(color: Color.black.opacity(0.10), radius: 18, y: 8)
    }

    private var brand: some View {
        HStack(spacing: 8) {
            Image(systemName: "scribble.variable")
                .foregroundStyle(Color.accentColor)
            Text("Dim0")
                .font(.system(size: 16, weight: .semibold, design: .rounded))
        }
        .padding(.horizontal, 6)
    }

    private var divider: some View {
        Divider()
            .frame(height: 28)
            .padding(.horizontal, 2)
    }

    private var colorPicker: some View {
        HStack(spacing: 5) {
            ForEach(InkColor.allCases) { inkColor in
                Button {
                    model.selectedColor = inkColor
                } label: {
                    Circle()
                        .fill(inkColor.color)
                        .frame(width: 22, height: 22)
                        .padding(3)
                        .overlay {
                            Circle()
                                .stroke(Color.primary.opacity(model.selectedColor == inkColor ? 0.45 : 0), lineWidth: 2)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("笔迹颜色")
            }
        }
    }

    private var saveStateImage: String {
        switch model.saveState {
        case .loading, .saving: "arrow.triangle.2.circlepath"
        case .saved: "checkmark.circle"
        case .failed: "exclamationmark.triangle"
        }
    }

    private var syncButton: some View {
        Button {
            isSyncPanelPresented = true
        } label: {
            HStack(spacing: 5) {
                Image(systemName: model.connectedComputerCount > 0 ? "desktopcomputer.and.arrow.down" : "arrow.triangle.2.circlepath")
                if model.connectedComputerCount > 0 {
                    Text("\(model.connectedComputerCount)")
                        .font(.system(size: 12, weight: .semibold))
                }
            }
            .frame(minWidth: 36, minHeight: 36)
            .padding(.horizontal, model.connectedComputerCount > 0 ? 5 : 0)
            .background(
                model.connectedComputerCount > 0 ? Color.green.opacity(0.14) : Color.clear,
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
        }
        .buttonStyle(.plain)
        .foregroundStyle(model.connectedComputerCount > 0 ? Color.green : Color.primary)
        .accessibilityLabel("电脑同步")
        .popover(isPresented: $isSyncPanelPresented, arrowEdge: .top) {
            syncPanel
                .presentationCompactAdaptation(.popover)
        }
    }

    private var syncPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("电脑同步", systemImage: "desktopcomputer")
                    .font(.headline)
                Spacer()
                Circle()
                    .fill(model.connectedComputerCount > 0 ? Color.green : Color.orange)
                    .frame(width: 9, height: 9)
            }

            if let address = model.localSyncAddress {
                VStack(alignment: .leading, spacing: 5) {
                    Text("iPad 地址")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(address):\(model.localSyncPort)")
                        .font(.system(.body, design: .monospaced, weight: .semibold))
                        .textSelection(.enabled)
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text("配对码")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(model.pairingCode)
                        .font(.system(size: 28, weight: .bold, design: .monospaced))
                        .tracking(3)
                        .textSelection(.enabled)
                }
            } else {
                Text(localSyncStateMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Text("在电脑画布右上角打开 iPad 同步，输入上面的地址和配对码。两台设备需要连接同一个 Wi-Fi。")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                model.syncNow()
            } label: {
                Label("立即同步到电脑", systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.connectedComputerCount == 0)

            Text(model.lastSyncMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(18)
        .frame(width: 340)
    }

    private var localSyncStateMessage: String {
        switch model.localSyncState {
        case .stopped:
            "同步服务未启动"
        case .starting:
            "正在启动局域网同步"
        case .ready(let address):
            "同步地址：\(address):\(model.localSyncPort)"
        case .failed(let message):
            "同步服务启动失败：\(message)"
        }
    }

    private func toolButton(_ tool: CanvasTool) -> some View {
        Button {
            model.selectedTool = tool
        } label: {
            Image(systemName: tool.systemImage)
                .frame(width: 38, height: 36)
                .background(
                    model.selectedTool == tool ? Color.accentColor.opacity(0.15) : Color.clear,
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                )
        }
        .buttonStyle(.plain)
        .foregroundStyle(model.selectedTool == tool ? Color.accentColor : Color.primary)
        .accessibilityLabel(tool.title)
    }

    private func iconButton(_ image: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: image)
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .foregroundStyle(enabled ? Color.primary : Color.secondary.opacity(0.35))
    }
}
