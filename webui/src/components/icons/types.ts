import type { ComponentType, SVGProps } from "react"

export type AppIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string
  strokeWidth?: number
}


export type AppIconComponent = ComponentType<AppIconProps>


export type AppIconName =
  | "add"
  | "alert"
  | "board_context"
  | "chat_history"
  | "clock"
  | "code_interpreter"
  | "image_generation"
  | "link"
  | "links"
  | "loader"
  | "lock"
  | "memory_search"
  | "research"
  | "search_engine"
  | "selection_context"
  | "send"
  | "tools_menu"
