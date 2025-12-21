import React from "react";

const EventsPanel = React.memo(({ events }) => {
  if (!events || events.length === 0) return null;

  return (
    <div className="mb-8 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.6)] p-8">
      <p className="mb-6 text-xl font-bold text-white">Recent Events (Last 20)</p>
      <div className="flex max-h-96 flex-col gap-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-[rgba(15,23,42,0.5)] scrollbar-thumb-[rgba(255,255,255,0.2)]">
        {events.map((event, idx) => (
          <div key={idx} className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(15,23,42,0.8)] p-4 transition-all duration-300 hover:border-[rgba(99,102,241,0.3)] hover:bg-[rgba(15,23,42,0.95)]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="mb-2 text-base font-semibold text-white">{event.type}</p>
                <p className="break-all whitespace-pre-wrap font-mono text-sm text-[rgba(255,255,255,0.7)]">
                  {event.args && Object.keys(event.args).length > 0
                    ? JSON.stringify(event.args, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
                    : "No args"}
                </p>
              </div>
              <div className="font-mono text-xs text-[rgba(255,255,255,0.5)]">
                Block: {event.blockNumber?.toString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

EventsPanel.displayName = 'EventsPanel';

export default EventsPanel;

