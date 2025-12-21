import React from "react";
import { Link } from "react-router-dom";

const PresaleList = ({ items }) => {
  if (!items?.length) {
    return <p className="m-0 text-text-muted">No presales detected. Create one above to get started.</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-[rgba(255,255,255,0.15)] p-2 text-left text-text">Owner</th>
            <th className="border-b border-[rgba(255,255,255,0.15)] p-2 text-left text-text">Manager</th>
            <th className="border-b border-[rgba(255,255,255,0.15)] p-2 text-left text-text">Auction</th>
            <th className="border-b border-[rgba(255,255,255,0.15)] p-2 text-left text-text">LBP</th>
            <th className="border-b border-[rgba(255,255,255,0.15)] p-2 text-left text-text">Vesting</th>
            <th className="border-b border-[rgba(255,255,255,0.15)] p-2 text-left text-text">Block</th>
            <th className="border-b border-[rgba(255,255,255,0.15)] p-2 text-left text-text">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.manager}-${index}`}>
              <td className="break-all border-b border-[rgba(255,255,255,0.05)] p-2 text-text-muted">{item.owner}</td>
              <td className="break-all border-b border-[rgba(255,255,255,0.05)] p-2 text-text-muted">{item.manager}</td>
              <td className="break-all border-b border-[rgba(255,255,255,0.05)] p-2 text-text-muted">{item.auction}</td>
              <td className="break-all border-b border-[rgba(255,255,255,0.05)] p-2 text-text-muted">{item.lbp}</td>
              <td className="break-all border-b border-[rgba(255,255,255,0.05)] p-2 text-text-muted">{item.vesting}</td>
              <td className="break-all border-b border-[rgba(255,255,255,0.05)] p-2 text-text-muted">{item.blockNumber}</td>
              <td className="border-b border-[rgba(255,255,255,0.05)] p-2">
                <Link
                  to={`/manager/${item.manager}`}
                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-0 bg-secondary px-4 py-2.5 font-semibold text-[#0f172a] no-underline shadow-[0_10px_20px_rgba(15,163,146,0.3)] transition-all duration-120 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(15,163,146,0.4)]"
                >
                  Open Presale
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PresaleList;
