import React from "react";
import styles from "./css/EventsPanel.module.css";

const EventsPanel = React.memo(({ events }) => {
  if (!events || events.length === 0) return null;

  return (
    <div className={styles.eventsPanel}>
      <p className={styles.eventsTitle}>Recent Events (Last 20)</p>
      <div className={styles.eventsList}>
        {events.map((event, idx) => (
          <div key={idx} className={styles.eventItem}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <p className={styles.eventType}>{event.type}</p>
                <p className={styles.eventArgs}>
                  {event.args && Object.keys(event.args).length > 0
                    ? JSON.stringify(event.args, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
                    : "No args"}
                </p>
              </div>
              <div className={styles.eventBlock}>
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

