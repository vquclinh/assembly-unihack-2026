"use client";

import { useParams } from "next/navigation";
import { type Address, isAddress } from "viem";
import { StatsGrid, verdict } from "@/components/Reputation";
import { ReportList } from "@/components/ScamReport";
import { TrustCard, TrustChip } from "@/components/TrustBadge";
import { Badge, Card, Spinner } from "@/components/ui";
import { explorerAddress } from "@/lib/config";
import { useStats } from "@/lib/hooks";
import { useT } from "@/lib/i18n";

export default function ProfilePage() {
  const { address } = useParams<{ address: string }>();
  const t = useT();
  const p = t.profile;
  const valid = isAddress(address);
  const { data } = useStats(valid ? (address as Address) : undefined);
  if (!valid) return <p className="text-zinc-400">{p.invalid}</p>;
  if (!data) return <Spinner className="text-zinc-500" />;
  const vl = verdict(data.landlord, "landlord", t);
  const vt = verdict(data.tenant, "tenant", t);
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight">{p.title}</h1>
          <TrustChip address={address as Address} />
        </div>
        <p className="break-all font-mono text-sm text-zinc-400">{address}</p>
        {explorerAddress(address) && (
          <a href={explorerAddress(address)} className="text-xs text-zinc-400 underline" target="_blank" rel="noreferrer">
            {p.explorer}
          </a>
        )}
      </div>
      <p className="max-w-2xl text-sm text-zinc-400">{p.body}</p>
      <TrustCard address={address as Address} completed={data.landlord.completed} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-bold">{p.asLandlord}</h2>
            <Badge tone={vl.tone}>{vl.label}</Badge>
          </div>
          <StatsGrid s={data.landlord} role="landlord" />
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-bold">{p.asTenant}</h2>
            <Badge tone={vt.tone}>{vt.label}</Badge>
          </div>
          <StatsGrid s={data.tenant} role="tenant" />
        </Card>
      </div>
      <ReportList landlord={address as Address} />
      {(data.mediatorResolved > 0 || data.mediatorTimedOut > 0) && (
        <Card>
          <h2 className="mb-2 font-bold">{p.asMediator}</h2>
          <p className="text-sm">{p.mediatorLine(data.mediatorResolved, data.mediatorTimedOut)}</p>
        </Card>
      )}
    </div>
  );
}
