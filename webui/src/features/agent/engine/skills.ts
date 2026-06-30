/**
 * Skill-loading tools (progressive disclosure). Each `learn_generate_*` tool
 * returns a detailed build-guide prompt the model reads before producing that
 * format — mirrors the backend `widget/learn.py`, where the tool's OUTPUT is
 * the skill prompt. Keeps the system prompt lean until a skill is needed.
 */
import { SKILLS, type SkillName } from "@/features/agent/prompts"
import type { Tool } from "./types"


const skillTool = (name: SkillName, description: string): Tool => ({
  name,
  description,
  parameters: { type: "object", properties: {} },
  // The guidance text IS the useful output; the loop feeds it back to the model.
  async run() {
    return SKILLS[name]
  },
})


export const learnGenerateDiagram = skillTool(
  "learn_generate_diagram",
  "Load guidance before composing a structured multi-note answer (mindmap, taxonomy, schema, flowchart).",
)


export const learnGenerateMiniApp = skillTool(
  "learn_generate_mini_app",
  "Load guidance before authoring a sandboxed interactive React mini-app — the default custom-rendered artifact.",
)


export const learnGenerateHtmlWidget = skillTool(
  "learn_generate_html_widget",
  "Load guidance before authoring a raw-HTML widget note (legacy — prefer learn_generate_mini_app).",
)


export const skillTools: Tool[] = [learnGenerateDiagram, learnGenerateMiniApp, learnGenerateHtmlWidget]
