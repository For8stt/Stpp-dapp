import React from "react";

const Input = ({ label, name, value, onChange, placeholder, type = "text" }) => (
  <label className="flex flex-col gap-1 text-sm text-white/80">
    <span className="text-white">{label}</span>
    <input
      type={type}
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(name, event.target.value)}
      className="rounded-lg border border-white/10 bg-slate-800/80 px-3 py-2 text-white outline-none transition focus:border-white/40"
    />
  </label>
);

const TextArea = ({ label, name, value, onChange, placeholder }) => (
  <label className="flex flex-col gap-1 text-sm text-white/80 md:col-span-2">
    <span className="text-white">{label}</span>
    <textarea
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(name, event.target.value)}
      className="min-h-[100px] rounded-lg border border-white/10 bg-slate-800/80 px-3 py-2 text-white outline-none transition focus:border-white/40"
    />
  </label>
);

const CreateAuctionForm = ({ values, onChange, onSubmit, disabled }) => (
  <form
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
    className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5"
  >
    <p className="text-lg font-semibold text-white">Create an additional auction</p>
    <div className="grid gap-4 md:grid-cols-2">
      <Input
        label="Sale token"
        name="saleToken"
        value={values.saleToken}
        onChange={onChange}
        placeholder="0x..."
      />
      <Input
        label="Treasury"
        name="treasury"
        value={values.treasury}
        onChange={onChange}
        placeholder="0x..."
      />
      <Input
        label="Start time"
        type="datetime-local"
        name="startTime"
        value={values.startTime}
        onChange={onChange}
      />
      <Input
        label="Commit duration (seconds)"
        name="commitDuration"
        value={values.commitDuration}
        onChange={onChange}
        placeholder="3600"
      />
      <Input
        label="Reveal duration (seconds)"
        name="revealDuration"
        value={values.revealDuration}
        onChange={onChange}
        placeholder="3600"
      />
      <Input
        label="Tokens for sale"
        name="tokensForSale"
        value={values.tokensForSale}
        onChange={onChange}
        placeholder="500000"
      />
      <Input
        label="Bonus reserve"
        name="bonusReserve"
        value={values.bonusReserve}
        onChange={onChange}
        placeholder="20000"
      />
      <Input
        label="Per wallet cap"
        name="perAddressCap"
        value={values.perAddressCap}
        onChange={onChange}
        placeholder="10000"
      />
      <Input
        label="Soft cap"
        name="softCap"
        value={values.softCap}
        onChange={onChange}
        placeholder="100000"
      />
      <Input
        label="Merkle root"
        name="merkleRoot"
        value={values.merkleRoot}
        onChange={onChange}
        placeholder="0x0000..."
      />
      <TextArea
        label="Price ticks (ETH, comma separated)"
        name="priceTicks"
        value={values.priceTicks}
        onChange={onChange}
        placeholder="1,0.95,0.9"
      />
    </div>
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-xl bg-indigo-500 py-3 text-base font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
    >
      {disabled ? "Submitting..." : "Create Auction"}
    </button>
  </form>
);

export default CreateAuctionForm;
