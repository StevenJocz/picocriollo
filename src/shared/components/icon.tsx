import type { ComponentType, ReactNode, SVGProps } from 'react';
import {
  AlarmClock, ArrowLeftRight, ArrowRight, Bird, Bell, Bookmark, Camera, CalendarDays, ChartNoAxesColumn, Check, ChevronLeft, CircleCheck, Copy, Download, Egg, Ellipsis,
  Eye, Feather, Filter, Flame, Gavel, Heart, House, Image as ImageIcon, Info, Leaf, ListChecks, LogOut, MapPin, Menu, MessageCircle, Minus, Package, Pause, Pencil, Play, Plus,
  Printer, ReceiptText, Volume2, VolumeX, Wheat, ScanLine, Search, Settings, Share2, ShieldCheck, Sparkles, Sprout, Star, Store, Tag, ThumbsUp, Trash2, TriangleAlert, UserRound, Users, Video, Wallet, X, Zap, TrendingUp,
} from 'lucide-react';

// Sistema de iconos único de la app (Lucide: trazo de 1.8 px, esquinas redondeadas, proporciones consistentes).
// Los nombres son los de siempre (`house`, `bird`, `egg`…): cambiar la librería no obliga a tocar las pantallas.
type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;
const ICONS: Record<string, IconComponent> = {
  alert: TriangleAlert, arrow: ArrowRight, back: ChevronLeft, bell: Bell, bird: Bird, bolt: Zap, bookmark: Bookmark, boxes: Package, calendar: CalendarDays,
  camera: Camera, chart: ChartNoAxesColumn, chat: MessageCircle, check: Check, 'check-circle': CircleCheck, clock: AlarmClock, close: X, copy: Copy,
  download: Download, edit: Pencil, egg: Egg, eye: Eye, feather: Feather, filter: Filter, gavel: Gavel, heart: Heart, house: House, image: ImageIcon,
  info: Info, leaf: Leaf, like: ThumbsUp, list: ListChecks, logout: LogOut, menu: Menu, minus: Minus, more: Ellipsis, pin: MapPin, pause: Pause, play: Play, plus: Plus,
  print: Printer, receipt: ReceiptText, scan: ScanLine, search: Search, settings: Settings, share: Share2, shield: ShieldCheck, sparkles: Sparkles,
  sprout: Sprout, star: Star, store: Store, swap: ArrowLeftRight, tag: Tag, trash: Trash2, trend: TrendingUp, user: UserRound, users: Users,
  video: Video, wheat: Wheat, volume: Volume2, mute: VolumeX, wallet: Wallet, warm: Flame,
};

export function Icon({ name, size = 20, strokeWidth = 1.8, ...props }: { name: string; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  const Glyph = ICONS[name] ?? Leaf;
  return <Glyph width={size} height={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" {...props} />;
}

/** Icono dentro de un contenedor con degradado suave; el tono sale de la clase (`tone-green|gold|blue|rose|slate`). */
export function IconBadge({ name, tone = 'green', size = 44, glyph = 22, className = '', children }: { name: string; tone?: 'green' | 'gold' | 'blue' | 'rose' | 'slate'; size?: number; glyph?: number; className?: string; children?: ReactNode }) {
  return <span className={`icon-badge ib-${tone} ${className}`} style={{ width: size, height: size }}><Icon name={name} size={glyph} />{children}</span>;
}
