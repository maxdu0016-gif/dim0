import SwiftUI

struct CanvasScreen: View {
    @ObservedObject var model: CanvasViewModel
    @State private var isClearConfirmationPresented = false

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

