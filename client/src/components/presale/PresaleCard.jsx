import React from "react";
import { Link } from "react-router-dom";

const PresaleCard = ({ presale }) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-white shadow-lg shadow-black/30">
    <div className="flex flex-col gap-1">
      <p className="text-sm uppercase tracking-wide text-white/50">Presale manager</p>
      <p className="font-mono text-sm text-emerald-300 break-all">{presale.manager}</p>
    </div>
    <div className="grid gap-2 text-sm text-white/70 sm:grid-cols-2">
      <div>
        <p className="text-xs uppercase tracking-wide text-white/40">Owner</p>
        <p className="font-mono break-all">{presale.owner}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-white/40">Auction</p>
        <p className="font-mono break-all">{presale.auction}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-white/40">LBP</p>
        <p className="font-mono break-all">{presale.lbp || "—"}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-white/40">Vesting</p>
        <p className="font-mono break-all">{presale.vesting || "—"}</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 pt-2">
      <Link
        to={`/presale/${presale.manager}`}
        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
      >
        View manager
      </Link>
      {presale.auction && (
        <Link
          to={`/presale/${presale.manager}/auction`}
          className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
        >
          Auction
        </Link>
      )}
    </div>
  </div>
);

export default PresaleCard;
