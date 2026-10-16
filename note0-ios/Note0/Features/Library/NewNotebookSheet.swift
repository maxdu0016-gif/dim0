import SwiftUI

struct NewNotebookSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var paper: PaperStyle = .ruled

    let onCreate: (String, PaperStyle) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("标题") {
                    TextField("例如：高等数学", text: $title)
                }
                Section("纸张") {
                    Picker("纸张", selection: $paper) {
                        ForEach(PaperStyle.allCases) { style in
                            Text(style.title).tag(style)
                        }
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle("新建笔记本")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("创建") {
                        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
                        onCreate(trimmed.isEmpty ? "未命名笔记本" : trimmed, paper)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
