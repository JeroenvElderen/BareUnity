"use client";

import { Channel, getChannels, getInitials } from "@/lib/channel-data";

type SidebarProps = {
  onHomeSelect: () => void;
  isHomeActive?: boolean;
  onChannelSelect: (channelId: string) => void;
  activeChannelId?: string;
  channelFilter?: (channel: Channel) => boolean;
};

export default function Sidebar({ onHomeSelect, isHomeActive = false, onChannelSelect, activeChannelId, channelFilter }: SidebarProps) {
  const channels = getChannels();
  const visibleChannels = channelFilter ? channels.filter((channel) => channelFilter(channel)) : channels;

  return (
    <aside className="w-64 border-r border-accent/20 bg-bg/92 px-3 py-5">
      <div className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-accent">Nature Hubs</div>
      <div className="mt-1 flex w-full flex-col gap-2 overflow-y-auto">
        <button type="button" className={`glass-input flex h-11 w-full items-center gap-2 rounded-2xl px-3 text-left text-sm font-semibold ${isHomeActive ? "border-accent/70" : ""}`} onClick={onHomeSelect}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 text-[11px] font-bold uppercase text-text/90">HM</span>
          <span>Home feed</span>
        </button>

        {visibleChannels.map((channel) => {
          const isActive = activeChannelId === channel.id;

          return (
            <button
              key={channel.id}
              type="button"
              className={`glass-input flex h-11 w-full items-center gap-2 rounded-2xl px-3 text-left text-sm font-semibold ${isActive ? "border-accent/70" : ""}`}
              onClick={() => onChannelSelect(channel.id)}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 text-[11px] font-bold uppercase text-text/90">{getInitials(channel.name)}</span>
              <span className="truncate">{channel.name}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
