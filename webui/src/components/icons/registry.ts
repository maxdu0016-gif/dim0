import {
  AiChipIcon,
  AiLearningIcon,
  AiImageIcon,
  AiProgrammingIcon,
  Alert02Icon,
  AnalyticsUpIcon,
  Album02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Award04Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CancelIcon,
  ChatAdd01Icon,
  ChatTranslateIcon as ChatTranslateGlyphIcon,
  ChipIcon,
  ChartBubble02Icon,
  ChartBubbleIcon,
  CheckmarkCircle03Icon,
  Clock02Icon,
  CodeIcon,
  ComputerTerminal01Icon,
  CopyIcon,
  CursorMagicSelection04Icon,
  DashboardCircleAddIcon,
  DashboardSquare03Icon,
  DashboardBrowsingIcon,
  Delete02Icon,
  DragDropIcon,
  DocumentAttachmentIcon,
  Download04Icon,
  EarthIcon,
  Edit01Icon,
  Folder02Icon,
  Folder01Icon,
  GitForkIcon,
  GlobalIcon,
  GridViewIcon as GridViewGlyphIcon,
  Home12Icon,
  InformationCircleIcon,
  Idea01Icon,
  Image01Icon,
  InternetIcon,
  Layout01Icon,
  LeftToRightListBulletIcon,
  Link02Icon,
  Link04Icon,
  LinkSquare02Icon,
  LogoutSquareIcon,
  Mail01Icon,
  Maximize01Icon,
  Message02Icon,
  MicroscopeIcon,
  MinusSignIcon,
  Note02Icon,
  NoteAddIcon,
  NoteEditIcon,
  NoteIcon as NoteGlyphIcon,
  NotebookIcon as NotebookGlyphIcon,
  PencilEditIcon as PencilEditGlyphIcon,
  PaintBoardIcon as PaintBoardGlyphIcon,
  Pdf02Icon,
  PinIcon as PinGlyphIcon,
  PinOffIcon as PinOffGlyphIcon,
  PlusSignIcon,
  PlayIcon as PlayGlyphIcon,
  PropertyNewIcon,
  ReloadIcon,
  SearchList01Icon,
  SidebarLeft01Icon,
  Stethoscope02Icon,
  SquareLock01Icon,
  SourceCodeIcon,
  SparklesIcon as SparklesFeatureGlyphIcon,
  ThermometerWarmIcon,
  TextAlignLeftIcon,
  Tick01Icon,
  ToolsIcon,
  UserSquareIcon as UserSquareGlyphIcon,
  UserIcon,
  ViewIcon as ViewGlyphIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons"
import { Claude, DeepSeek, Exa, Gemini, Mistral, Moonshot, OpenAI, Perplexity, Qwen, Tavily, ZAI } from "@lobehub/icons"
import {
  ArrowUpRightIcon,
  BotMessageSquare,
  Clock,
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudSun,
  Ellipsis,
  EllipsisVertical,
  Info,
  ListTree,
  Loader2,
  LoaderCircle,
  MailCheck,
  MapPin,
  Monitor,
  Moon,
  Send,
  Share,
  CircleIcon as CircleGlyphIcon,
  Sun,
  TrendingDown,
  TrendingUp,
  TriangleAlertIcon,
  XIcon as CloseGlyphIcon,
  ChevronDownIcon as ChevronDownGlyphIcon,
  ChevronRightIcon as ChevronRightGlyphIcon,
  ChevronUpIcon as ChevronUpGlyphIcon,
  CheckIcon as CheckGlyphIcon,
  Sparkles,
} from "lucide-react"
import { createHugeIcon, createLucideIcon, createReactIcon } from "./icon-base"
import type { AppIconComponent, AppIconName } from "./types"

export const AddIcon = createHugeIcon(PlusSignIcon)
export const AlertIcon = createHugeIcon(Alert02Icon)
export const ArrowCollapseIcon = createHugeIcon(ArrowDown01Icon)
export const ArrowExpandIcon = createHugeIcon(ArrowRight01Icon)
export const ArrowRevealIcon = createHugeIcon(ArrowUp01Icon)
export const AwardIcon = createHugeIcon(Award04Icon)
export const BoardContextIcon = createHugeIcon(AiChipIcon)
export const BrowserSearchIcon = createHugeIcon(EarthIcon)
export const CancelPlainIcon = createHugeIcon(Cancel01Icon)
export const CancelCircleStatusIcon = createHugeIcon(CancelCircleIcon)
export const CancelStatusIcon = createHugeIcon(CancelIcon)
export const ChatHistoryIcon = createHugeIcon(Message02Icon)
export const ChatNewIcon = createHugeIcon(ChatAdd01Icon)
export const ChatTranslateIcon = createHugeIcon(ChatTranslateGlyphIcon)
export const CheckIcon = createHugeIcon(Tick01Icon)
export const CheckCircleStatusIcon = createHugeIcon(CheckmarkCircle03Icon)
export const CheckmarkIcon = createLucideIcon(CheckGlyphIcon)
export const ClockIcon = createHugeIcon(Clock02Icon)
export const ChevronDownIcon = createLucideIcon(ChevronDownGlyphIcon)
export const ChevronRightIcon = createLucideIcon(ChevronRightGlyphIcon)
export const ChevronUpIcon = createLucideIcon(ChevronUpGlyphIcon)
export const CodeInterpreterIcon = createHugeIcon(CodeIcon)
export const ConsoleIcon = createHugeIcon(ComputerTerminal01Icon)
export const CodeStarterIcon = createHugeIcon(AiProgrammingIcon)
export const CopyActionIcon = createHugeIcon(CopyIcon)
export const CreateNoteIcon = createHugeIcon(NoteAddIcon)
export const DashboardAddIcon = createHugeIcon(DashboardCircleAddIcon)
export const DashboardIcon = createHugeIcon(DashboardSquare03Icon)
export const DeleteIcon = createHugeIcon(Delete02Icon)
export const Dim0Icon = createReactIcon(BotMessageSquare)
export const DocumentIcon = createHugeIcon(DocumentAttachmentIcon)
export const DownloadIcon = createHugeIcon(Download04Icon)
export const DragHandleIcon = createHugeIcon(DragDropIcon)
export const EditIcon = createHugeIcon(Edit01Icon)
export const EditNoteIcon = createHugeIcon(NoteEditIcon)
export const EllipsisIcon = createLucideIcon(Ellipsis)
export const ExaBrandIcon = createReactIcon(Exa.Color)
export const ExternalLinkIcon = createLucideIcon(ArrowUpRightIcon)
export const FolderIcon = createHugeIcon(Folder02Icon)
export const FolderTreeIcon = createHugeIcon(Folder01Icon)
export const GeminiBrandIcon = createReactIcon(Gemini.Color)
export const GlobeIcon = createHugeIcon(GlobalIcon)
export const GridViewIcon = createHugeIcon(GridViewGlyphIcon)
export const HomeIcon = createHugeIcon(Home12Icon)
export const IdeaIcon = createHugeIcon(Idea01Icon)
export const ImagePlaceholderIcon = createHugeIcon(Image01Icon)
export const ImageGenerationIcon = createHugeIcon(AiImageIcon)
export const ImageSearchWidgetIcon = createHugeIcon(Album02Icon)
export const InfoCircleIcon = createHugeIcon(InformationCircleIcon)
export const InfoIcon = createLucideIcon(Info)
export const LoaderRefreshIcon = createHugeIcon(ReloadIcon)
export const LearnStarterIcon = createHugeIcon(AiLearningIcon)
export const LinkIcon = createHugeIcon(Link02Icon)
export const LinksIcon = createHugeIcon(Link04Icon)
export const ListTreeIcon = createLucideIcon(ListTree)
export const Loader2Icon = createLucideIcon(Loader2)
export const LoaderIcon = createLucideIcon(LoaderCircle)
export const LockIcon = createHugeIcon(SquareLock01Icon)
export const LogoutIcon = createHugeIcon(LogoutSquareIcon)
export const LayoutIcon = createHugeIcon(Layout01Icon)
export const MailCheckIcon = createLucideIcon(MailCheck)
export const MailIcon = createHugeIcon(Mail01Icon)
export const MapPinIcon = createLucideIcon(MapPin)
export const MemorySearchIcon = createHugeIcon(ChipIcon)
export const MistralBrandIcon = createReactIcon(Mistral.Color)
export const MinusIcon = createHugeIcon(MinusSignIcon)
export const MonitorIcon = createLucideIcon(Monitor)
export const MoonIcon = createLucideIcon(Moon)
export const MoonshotBrandIcon = createReactIcon(Moonshot)
export const NavigateIcon = createHugeIcon(EarthIcon)
export const NotebookIcon = createHugeIcon(NotebookGlyphIcon)
export const NoteIcon = createHugeIcon(NoteGlyphIcon)
export const OpenAIBrandIcon = createReactIcon(OpenAI)
export const OutlineGeneratorIcon = createHugeIcon(SearchList01Icon)
export const PencilEditIcon = createHugeIcon(PencilEditGlyphIcon)
export const PaintBoardIcon = createHugeIcon(PaintBoardGlyphIcon)
export const PerplexityBrandIcon = createReactIcon(Perplexity.Color)
export const PdfIcon = createHugeIcon(Pdf02Icon)
export const PinIcon = createHugeIcon(PinGlyphIcon)
export const PinOffIcon = createHugeIcon(PinOffGlyphIcon)
export const PlayIcon = createHugeIcon(PlayGlyphIcon)
export const PlusIcon = createHugeIcon(PlusSignIcon)
export const PropertyIcon = createHugeIcon(PropertyNewIcon)
export const QwenBrandIcon = createReactIcon(Qwen.Color)
export const ReadNoteIcon = createHugeIcon(ViewGlyphIcon)
export const ResearchIcon = createHugeIcon(MicroscopeIcon)
export const RadioIndicatorIcon = createLucideIcon(CircleGlyphIcon)
export const SchemaMapIcon = createHugeIcon(ChartBubbleIcon)
export const SearchEngineIcon = createHugeIcon(InternetIcon)
export const SelectionContextIcon = createHugeIcon(CursorMagicSelection04Icon)
export const SendIcon = createLucideIcon(Send)
export const ShareIcon = createLucideIcon(Share)
export const SidebarMenuIcon = createLucideIcon(EllipsisVertical)
export const SparklesFeatureIcon = createHugeIcon(SparklesFeatureGlyphIcon)
export const SparklesIcon = createLucideIcon(Sparkles)
export const StockWidgetIcon = createHugeIcon(DashboardBrowsingIcon)
export const StethoscopeIcon = createHugeIcon(Stethoscope02Icon)
export const SunIcon = createLucideIcon(Sun)
export const SunnyIcon = createLucideIcon(Sun)
export const SynthesizerIcon = createHugeIcon(NoteGlyphIcon)
export const TavilyBrandIcon = createReactIcon(Tavily.Color)
export const TextListIcon = createHugeIcon(LeftToRightListBulletIcon)
export const TextParagraphIcon = createHugeIcon(TextAlignLeftIcon)
export const TimeClockIcon = createLucideIcon(Clock)
export const ToolCodeIcon = createHugeIcon(SourceCodeIcon)
export const ToolsMenuIcon = createHugeIcon(ToolsIcon)
export const TreeMapIcon = createHugeIcon(GitForkIcon)
export const TrendingDownIcon = createLucideIcon(TrendingDown)
export const TrendingUpIcon = createLucideIcon(TrendingUp)
export const UserProfileIcon = createHugeIcon(UserIcon)
export const UserSquareIcon = createHugeIcon(UserSquareGlyphIcon)
export const ViewIcon = createHugeIcon(ViewGlyphIcon)
export const ViewOffIcon = createHugeIcon(ViewOffSlashIcon)
export const ExpandIcon = createHugeIcon(Maximize01Icon)
export const SidebarToggleIcon = createHugeIcon(SidebarLeft01Icon)
export const SheetExternalLinkIcon = createHugeIcon(LinkSquare02Icon)
export const CloseIcon = createLucideIcon(CloseGlyphIcon)
export const WarningIcon = createLucideIcon(TriangleAlertIcon)
export const WeatherCloudIcon = createLucideIcon(Cloud)
export const WeatherCloudDrizzleIcon = createLucideIcon(CloudDrizzle)
export const WeatherCloudRainIcon = createLucideIcon(CloudRain)
export const WeatherCloudSnowIcon = createLucideIcon(CloudSnow)
export const WeatherCloudSunIcon = createLucideIcon(CloudSun)
export const VisualizeStarterIcon = createHugeIcon(ChartBubble02Icon)
export const WeatherWidgetIcon = createHugeIcon(ThermometerWarmIcon)
export const WebCollectorIcon = createHugeIcon(EarthIcon)
export const WriteNoteStarterIcon = createHugeIcon(Note02Icon)
export const WriteNoteToolIcon = createHugeIcon(NoteAddIcon)
export const ZAiBrandIcon = createReactIcon(ZAI)
export const ClaudeBrandIcon = createReactIcon(Claude.Color)
export const DeepSeekBrandIcon = createReactIcon(DeepSeek.Color)
export const LearnWidgetIcon = createHugeIcon(AnalyticsUpIcon)


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
