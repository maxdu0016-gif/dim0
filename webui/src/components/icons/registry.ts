import { Claude, DeepSeek, Exa, Gemini, Mistral, Moonshot, OpenAI, Perplexity, Qwen, Tavily, ZAI } from "@lobehub/icons"
import {
  ArrowsClockwiseIcon,
  ArrowsOutSimpleIcon,
  ArrowSquareOutIcon,
  BrainIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChartLineIcon,
  ChartLineUpIcon,
  ChartScatterIcon,
  ChatCenteredDotsIcon,
  ChatsIcon,
  CheckCircleIcon,
  CheckIcon as CheckmarkGlyphIcon,
  CircleIcon,
  ClockIcon as ClockGlyphIcon,
  CloudFogIcon,
  CloudIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  CodeIcon as CodeGlyphIcon,
  CopyIcon,
  DotsSixVerticalIcon,
  DotsThreeIcon,
  DotsThreeOutlineVerticalIcon,
  EnvelopeIcon,
  EyeIcon,
  EyeSlashIcon,
  FileCodeIcon,
  FileDocIcon,
  FilePdfIcon,
  FolderIcon as FolderGlyphIcon,
  FoldersIcon,
  GitForkIcon,
  GlobeHemisphereWestIcon,
  GraduationCapIcon,
  GraphIcon,
  HouseIcon,
  ImageSquareIcon,
  ImagesIcon,
  InfoIcon as InfoGlyphIcon,
  LightbulbIcon,
  LinkSimpleHorizontalIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  ListMagnifyingGlassIcon,
  LockIcon as LockGlyphIcon,
  MapPinIcon as MapPinGlyphIcon,
  MedalIcon,
  MinusIcon as MinusGlyphIcon,
  MonitorIcon as MonitorGlyphIcon,
  MoonIcon as MoonGlyphIcon,
  NotebookIcon as NotebookGlyphIcon,
  NoteIcon as NoteGlyphIcon,
  PaintBrushIcon,
  PaperPlaneRightIcon,
  PencilIcon,
  PlusIcon as PlusGlyphIcon,
  PresentationChartIcon,
  PushPinIcon,
  PushPinSlashIcon,
  SelectionIcon,
  ShareNetworkIcon,
  SidebarSimpleIcon,
  SignOutIcon,
  SlidersIcon,
  SparkleIcon,
  SpinnerGapIcon,
  SpinnerIcon,
  SquaresFourIcon,
  StackIcon,
  StethoscopeIcon as StethoscopeGlyphIcon,
  StopCircleIcon,
  SunIcon as SunGlyphIcon,
  TextAlignCenterIcon as TextAlignCenterGlyphIcon,
  TextAlignLeftIcon as TextAlignLeftGlyphIcon,
  TextAlignRightIcon as TextAlignRightGlyphIcon,
  TranslateIcon,
  TrashIcon,
  TrendDownIcon as TrendDownGlyphIcon,
  TrendUpIcon as TrendUpGlyphIcon,
  TreeStructureIcon,
  UserIcon as UserGlyphIcon,
  UserSquareIcon as UserSquareGlyphIcon,
  WarningCircleIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react"
import { createPhosphorIcon, createReactIcon } from "./icon-base"
import type { AppIconComponent, AppIconName } from "./types"

export const AddIcon = createPhosphorIcon(PlusGlyphIcon)
export const AlertIcon = createPhosphorIcon(WarningCircleIcon)
export const ArrowCollapseIcon = createPhosphorIcon(CaretDownIcon)
export const ArrowExpandIcon = createPhosphorIcon(CaretRightIcon)
export const ArrowRevealIcon = createPhosphorIcon(CaretUpIcon)
export const AwardIcon = createPhosphorIcon(MedalIcon)
export const BoardContextIcon = createPhosphorIcon(BrainIcon)
export const BrowserSearchIcon = createPhosphorIcon(GlobeHemisphereWestIcon)
export const CancelPlainIcon = createPhosphorIcon(XIcon)
export const CancelCircleStatusIcon = createPhosphorIcon(XCircleIcon)
export const CancelStatusIcon = createPhosphorIcon(XCircleIcon)
export const ChatHistoryIcon = createPhosphorIcon(ChatsIcon)
export const ChatNewIcon = createPhosphorIcon(PlusGlyphIcon)
export const ChatTranslateIcon = createPhosphorIcon(TranslateIcon)
export const CheckIcon = createPhosphorIcon(CheckmarkGlyphIcon)
export const CheckCircleStatusIcon = createPhosphorIcon(CheckCircleIcon)
export const CheckmarkIcon = createPhosphorIcon(CheckmarkGlyphIcon)
export const ClockIcon = createPhosphorIcon(ClockGlyphIcon)
export const ChevronDownIcon = createPhosphorIcon(CaretDownIcon)
export const ChevronLeftIcon = createPhosphorIcon(CaretLeftIcon)
export const ChevronRightIcon = createPhosphorIcon(CaretRightIcon)
export const ChevronUpIcon = createPhosphorIcon(CaretUpIcon)
export const CodeInterpreterIcon = createPhosphorIcon(CodeGlyphIcon)
export const CodeBlockIcon = createPhosphorIcon(CodeGlyphIcon)
export const ConsoleIcon = createPhosphorIcon(CodeGlyphIcon)
export const CodeStarterIcon = createPhosphorIcon(FileCodeIcon)
export const CopyActionIcon = createPhosphorIcon(CopyIcon)
export const CreateNoteIcon = createPhosphorIcon(PencilIcon)
export const DashboardAddIcon = createPhosphorIcon(SquaresFourIcon)
export const DashboardIcon = createPhosphorIcon(SquaresFourIcon)
export const DeleteIcon = createPhosphorIcon(TrashIcon)
export const Dim0Icon = createPhosphorIcon(ChatCenteredDotsIcon)
export const DocumentIcon = createPhosphorIcon(FileDocIcon)
export const DownloadIcon = createPhosphorIcon(ArrowSquareOutIcon)
export const DragHandleIcon = createPhosphorIcon(ArrowsOutSimpleIcon)
export const DragGripIcon = createPhosphorIcon(DotsSixVerticalIcon)
export const EditIcon = createPhosphorIcon(PencilIcon)
export const EditNoteIcon = createPhosphorIcon(PencilIcon)
export const EllipsisIcon = createPhosphorIcon(DotsThreeIcon)
export const ExaBrandIcon = createReactIcon(Exa.Color)
export const ExternalLinkIcon = createPhosphorIcon(ArrowSquareOutIcon)
export const FolderIcon = createPhosphorIcon(FolderGlyphIcon)
export const FolderTreeIcon = createPhosphorIcon(FoldersIcon)
export const GeminiBrandIcon = createReactIcon(Gemini.Color)
export const GlobeIcon = createPhosphorIcon(GlobeHemisphereWestIcon)
export const GridViewIcon = createPhosphorIcon(SquaresFourIcon)
export const HomeIcon = createPhosphorIcon(HouseIcon)
export const IdeaIcon = createPhosphorIcon(LightbulbIcon)
export const ImagePlaceholderIcon = createPhosphorIcon(ImageSquareIcon)
export const ImageGenerationIcon = createPhosphorIcon(ImagesIcon)
export const ImageSearchWidgetIcon = createPhosphorIcon(ImagesIcon)
export const InfoCircleIcon = createPhosphorIcon(InfoGlyphIcon)
export const InfoIcon = createPhosphorIcon(InfoGlyphIcon)
export const LoaderRefreshIcon = createPhosphorIcon(ArrowsClockwiseIcon)
export const LearnStarterIcon = createPhosphorIcon(GraduationCapIcon)
export const LinkIcon = createPhosphorIcon(LinkSimpleIcon)
export const LinksIcon = createPhosphorIcon(LinkSimpleHorizontalIcon)
export const ListTreeIcon = createPhosphorIcon(TreeStructureIcon)
export const Loader2Icon = createPhosphorIcon(SpinnerGapIcon)
export const LoaderIcon = createPhosphorIcon(SpinnerIcon)
export const LockIcon = createPhosphorIcon(LockGlyphIcon)
export const LogoutIcon = createPhosphorIcon(SignOutIcon)
export const LayoutIcon = createPhosphorIcon(SquaresFourIcon)
export const MailCheckIcon = createPhosphorIcon(EnvelopeIcon)
export const MailIcon = createPhosphorIcon(EnvelopeIcon)
export const MapPinIcon = createPhosphorIcon(MapPinGlyphIcon)
export const MemorySearchIcon = createPhosphorIcon(BrainIcon)
export const MistralBrandIcon = createReactIcon(Mistral.Color)
export const MinusIcon = createPhosphorIcon(MinusGlyphIcon)
export const MonitorIcon = createPhosphorIcon(MonitorGlyphIcon)
export const MoonIcon = createPhosphorIcon(MoonGlyphIcon)
export const MoonshotBrandIcon = createReactIcon(Moonshot)
export const NavigateIcon = createPhosphorIcon(GlobeHemisphereWestIcon)
export const NotebookIcon = createPhosphorIcon(NotebookGlyphIcon)
export const NoteIcon = createPhosphorIcon(NoteGlyphIcon)
export const OpenAIBrandIcon = createReactIcon(OpenAI)
export const OutlineGeneratorIcon = createPhosphorIcon(ListMagnifyingGlassIcon)
export const PencilEditIcon = createPhosphorIcon(PencilIcon)
export const PaintBoardIcon = createPhosphorIcon(PaintBrushIcon)
export const PerplexityBrandIcon = createReactIcon(Perplexity.Color)
export const PdfIcon = createPhosphorIcon(FilePdfIcon)
export const PinIcon = createPhosphorIcon(PushPinIcon)
export const PinOffIcon = createPhosphorIcon(PushPinSlashIcon)
export const PlayIcon = createPhosphorIcon(PlusGlyphIcon)
export const PlusIcon = createPhosphorIcon(PlusGlyphIcon)
export const PropertyIcon = createPhosphorIcon(SlidersIcon)
export const QwenBrandIcon = createReactIcon(Qwen.Color)
export const ReadNoteIcon = createPhosphorIcon(EyeIcon)
export const ResearchIcon = createPhosphorIcon(ListMagnifyingGlassIcon)
export const RadioIndicatorIcon = createPhosphorIcon(CircleIcon)
export const SchemaMapIcon = createPhosphorIcon(GraphIcon)
export const SearchEngineIcon = createPhosphorIcon(ListMagnifyingGlassIcon)
export const SelectionContextIcon = createPhosphorIcon(SelectionIcon)
export const SendIcon = createPhosphorIcon(PaperPlaneRightIcon)
export const ShareIcon = createPhosphorIcon(ShareNetworkIcon)
export const SidebarMenuIcon = createPhosphorIcon(DotsThreeOutlineVerticalIcon)
export const SparklesFeatureIcon = createPhosphorIcon(SparkleIcon)
export const SparklesIcon = createPhosphorIcon(SparkleIcon)
export const StockWidgetIcon = createPhosphorIcon(ChartLineIcon)
export const StethoscopeIcon = createPhosphorIcon(StethoscopeGlyphIcon)
export const SunIcon = createPhosphorIcon(SunGlyphIcon)
export const SunnyIcon = createPhosphorIcon(SunGlyphIcon)
export const SynthesizerIcon = createPhosphorIcon(NoteGlyphIcon)
export const TavilyBrandIcon = createReactIcon(Tavily.Color)
export const LayerStackIcon = createPhosphorIcon(StackIcon)
export const TextListIcon = createPhosphorIcon(ListBulletsIcon)
export const TextAlignCenterIcon = createPhosphorIcon(TextAlignCenterGlyphIcon)
export const TextParagraphIcon = createPhosphorIcon(TextAlignLeftGlyphIcon)
export const TextAlignRightIcon = createPhosphorIcon(TextAlignRightGlyphIcon)
export const TimeClockIcon = createPhosphorIcon(ClockGlyphIcon)
export const ToolCodeIcon = createPhosphorIcon(CodeGlyphIcon)
export const ToolsMenuIcon = createPhosphorIcon(SlidersIcon)
export const TreeMapIcon = createPhosphorIcon(GitForkIcon)
export const TrendingDownIcon = createPhosphorIcon(TrendDownGlyphIcon)
export const TrendingUpIcon = createPhosphorIcon(TrendUpGlyphIcon)
export const UserProfileIcon = createPhosphorIcon(UserGlyphIcon)
export const UserSquareIcon = createPhosphorIcon(UserSquareGlyphIcon)
export const ViewIcon = createPhosphorIcon(EyeIcon)
export const ViewOffIcon = createPhosphorIcon(EyeSlashIcon)
export const ExpandIcon = createPhosphorIcon(ArrowsOutSimpleIcon)
export const SidebarToggleIcon = createPhosphorIcon(SidebarSimpleIcon)
export const SheetExternalLinkIcon = createPhosphorIcon(ArrowSquareOutIcon)
export const CloseIcon = createPhosphorIcon(XIcon)
export const PresentationIcon = createPhosphorIcon(PresentationChartIcon)
export const StopPresentationIcon = createPhosphorIcon(StopCircleIcon)
export const WarningIcon = createPhosphorIcon(WarningCircleIcon)
export const WeatherCloudIcon = createPhosphorIcon(CloudIcon)
export const WeatherCloudDrizzleIcon = createPhosphorIcon(CloudFogIcon)
export const WeatherCloudRainIcon = createPhosphorIcon(CloudRainIcon)
export const WeatherCloudSnowIcon = createPhosphorIcon(CloudSnowIcon)
export const WeatherCloudSunIcon = createPhosphorIcon(CloudSunIcon)
export const VisualizeStarterIcon = createPhosphorIcon(ChartScatterIcon)
export const WeatherWidgetIcon = createPhosphorIcon(CloudSunIcon)
export const WebCollectorIcon = createPhosphorIcon(GlobeHemisphereWestIcon)
export const WriteNoteStarterIcon = createPhosphorIcon(PencilIcon)
export const WriteNoteToolIcon = createPhosphorIcon(PencilIcon)
export const ZAiBrandIcon = createReactIcon(ZAI)
export const ClaudeBrandIcon = createReactIcon(Claude.Color)
export const DeepSeekBrandIcon = createReactIcon(DeepSeek.Color)
export const LearnWidgetIcon = createPhosphorIcon(ChartLineUpIcon)


export const iconRegistry: Record<AppIconName, AppIconComponent> = {
  add: AddIcon,
  alert: AlertIcon,
  board_context: BoardContextIcon,
  chat_history: ChatHistoryIcon,
  clock: ClockIcon,
  code_interpreter: CodeInterpreterIcon,
  image_generation: ImageGenerationIcon,
  link: LinkIcon,
  links: LinksIcon,
  loader: LoaderIcon,
  lock: LockIcon,
  memory_search: MemorySearchIcon,
  research: ResearchIcon,
  search_engine: SearchEngineIcon,
  selection_context: SelectionContextIcon,
  send: SendIcon,
  tools_menu: ToolsMenuIcon,
}
