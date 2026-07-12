import { create } from "zustand"
import type { ToolName } from "../types/stream"
import type { LlmModel } from "../types/llm"
import type { WebSearchEngine } from "../types/web"
import type { PublicModel } from "../types/model-catalog"
import { AUTO_LLM_OPTION, defaultServices, type Services } from "../types/services"

const DEFAULT_LLM_MODEL: LlmModel = "auto"


/**
 * Store for managing chat streams.
 *
 * @property streams - A map of chat IDs to their respective stream messages.
 * @property isStreaming - A boolean indicating if a message is currently being streamed.
 * @property setIsStreaming - Function to set the streaming state.
 * @property setStream - Function to set the stream for a specific chat.
 * @property clearStream - Function to clear the stream for a specific chat.
 */
export interface ChatStore {
  isStreaming: boolean
  llmModel: LlmModel
  webSearchEngine: WebSearchEngine
  enabledTools: ToolName[]
  useDeepResearch: boolean
  enableMessageBoardContextSelection: boolean
  services: Services
  /** Full public model catalog (id → per-provider routes) for BYOK translation. */
  llmCatalog: PublicModel[]
  setModelCatalog: (models: PublicModel[]) => void
  setLlmModel: (model: LlmModel) => void
  setWebSearchEngine: (engine: WebSearchEngine) => void
  setEnabledTools: (tools: ToolName[]) => void
  setIsStreaming: (isStreaming: boolean) => void
  setUseDeepResearch: (useDeepResearch: boolean) => void
  setEnableMessageBoardContextSelection: (enabled: boolean) => void
  syncDefaults: (availableServices: Services) => void
}


/**
 * Create a Zustand store for managing chat streams.
 *
 * @returns A Zustand store with methods to add and clear chat streams.
 */
export const useChatStore = create<ChatStore>((set) => ({
  llmModel: DEFAULT_LLM_MODEL,

  webSearchEngine: "linkup",

  enabledTools: [
    "web_search",
    "memory_search",
    "code_interpreter",
    "get_note",
    "write_note",
    "edit_note",
    "link_notes",
    "navigate",
    "image_generation",
    "display_stock_widget",
    "display_weather_widget",
    "display_image_search_widget",
    "learn_generate_html_widget",
    "learn_generate_mini_app",
    "learn_generate_diagram"
  ],

  isStreaming: false,

  useDeepResearch: false,

  enableMessageBoardContextSelection: true,

  services: defaultServices(),

  llmCatalog: [],

  // The model picker's options come from the public catalog (everyone, incl.
  // signed-out BYOK) — the single source for services.llm.
  setModelCatalog: (models) =>
    set((state) => {
      const llm = [
        AUTO_LLM_OPTION,
        ...models.map((m) => ({
          name: m.id,
          label: m.label,
          family: m.family,
          tier: m.tier ?? undefined,
          available: true,
        })),
      ]
      const valid = llm.some((o) => o.name === state.llmModel)
      return {
        llmCatalog: models,
        services: { ...state.services, llm },
        llmModel: valid ? state.llmModel : DEFAULT_LLM_MODEL,
      }
    }),

  setLlmModel: (model) => set({ llmModel: model }),

  setWebSearchEngine: (engine) => set({ webSearchEngine: engine }),

  setEnabledTools: (tools) => set({ enabledTools: tools }),

  setIsStreaming: (isStreaming) => set({ isStreaming }),

  setUseDeepResearch: (useDeepResearch) => set({ useDeepResearch }),

  setEnableMessageBoardContextSelection: (enableMessageBoardContextSelection) => (
    set({ enableMessageBoardContextSelection })
  ),

  syncDefaults: (services: Services) => {
    // The model list is owned by the public catalog (setModelCatalog); /utils/services
    // only informs search/code/tool availability, so keep the existing llm here.
    const firstAvailableSearch = services.search.find((service) => service.available)
    if (firstAvailableSearch) {
      set({ webSearchEngine: firstAvailableSearch.name as WebSearchEngine })
    }
    // init with default available tools
    const enabledTools: ToolName[] = [
      "memory_search",
      "get_note",
      "write_note",
      "edit_note",
      "link_notes",
      "display_stock_widget",
      "display_weather_widget",
      "display_image_search_widget",
      "learn_generate_html_widget",
      "learn_generate_mini_app",
      "learn_generate_diagram",
    ]
    if (services.code.filter((service) => service.available).length > 0) {
      enabledTools.push("code_interpreter")
    }
    if (services.navigate.filter((service) => service.available).length > 0) {
      enabledTools.push("navigate")
    }
    if (services.search.filter((service) => service.available).length > 0) {
      enabledTools.push("web_search")
    }
    if (services.imageGeneration.filter((service) => service.available).length > 0) {
      enabledTools.push("image_generation")
    }
    set({ enabledTools })

    set((state) => ({ services: { ...services, llm: state.services.llm } }))
  }
}))
