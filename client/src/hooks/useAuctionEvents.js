import { useState, useCallback, useEffect } from "react";
import { safeQueryEvents } from "../utils/contractUtils";

const MAX_EVENTS = 20;
const DEFAULT_FROM_BLOCK = -1000;

/**
 * Fetches auction events
 */
export const useAuctionEvents = (auctionContract) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEvents = useCallback(async () => {
    if (!auctionContract) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const filter = auctionContract.filters;

      const [commits, reveals, adjustments, finalizations, lbpLaunches] = await Promise.all([
        safeQueryEvents(auctionContract, filter.CommitSubmitted?.(), DEFAULT_FROM_BLOCK),
        safeQueryEvents(auctionContract, filter.BidRevealed?.(), DEFAULT_FROM_BLOCK),
        safeQueryEvents(auctionContract, filter.DynamicAdjustment?.(), DEFAULT_FROM_BLOCK),
        safeQueryEvents(auctionContract, filter.AuctionFinalized?.(), DEFAULT_FROM_BLOCK),
        safeQueryEvents(auctionContract, filter.LBPLaunched?.(), DEFAULT_FROM_BLOCK),
      ]);

      const allEvents = [
        ...commits.map(e => ({ ...e, type: "CommitSubmitted", time: e.blockNumber || 0 })),
        ...reveals.map(e => ({ ...e, type: "BidRevealed", time: e.blockNumber || 0 })),
        ...adjustments.map(e => ({ ...e, type: "DynamicAdjustment", time: e.blockNumber || 0 })),
        ...finalizations.map(e => ({ ...e, type: "AuctionFinalized", time: e.blockNumber || 0 })),
        ...lbpLaunches.map(e => ({ ...e, type: "LBPLaunched", time: e.blockNumber || 0 })),
      ]
        .sort((a, b) => b.time - a.time)
        .slice(0, MAX_EVENTS);

      setEvents(allEvents);
    } catch (err) {
      console.error("Failed to fetch events:", err);
      setError(err.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [auctionContract]);

  useEffect(() => {
    if (auctionContract) {
      fetchEvents();
    } else {
      setEvents([]);
      setError(null);
      setLoading(false);
    }
  }, [auctionContract, fetchEvents]);

  return {
    events,
    loading,
    error,
    fetchEvents,
    refetch: fetchEvents,
  };
};

