import PencilKit
import SwiftUI

enum CanvasTool: String, CaseIterable, Identifiable {
    case pen
    case highlighter
    case eraser

    var id: Self { self }

    var title: String {
        switch self {
        case .pen: "钢笔"
        case .highlighter: "荧光笔"
        case .eraser: "橡皮"
        }
    }

    var systemImage: String {
        switch self {
        case .pen: "pencil.tip"
        case .highlighter: "highlighter"
        case .eraser: "eraser"
        }
    }
}

enum InkColor: String, CaseIterable, Identifiable {
    case charcoal
    case blue
    case red
    case green

    var id: Self { self }

    var uiColor: UIColor {
        switch self {
        case .charcoal: UIColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1)
        case .blue: UIColor(red: 0.11, green: 0.38, blue: 0.95, alpha: 1)
        case .red: UIColor(red: 0.91, green: 0.20, blue: 0.22, alpha: 1)
        case .green: UIColor(red: 0.08, green: 0.56, blue: 0.34, alpha: 1)
        }
    }

    var color: Color { Color(uiColor: uiColor) }
}

