import type { PublicClient } from "viem";
import { usePrividium } from "../hooks/usePrividium";
import { injected, useConnect, useConnection } from "wagmi";
import { EarnTab } from "./EarnTab";

interface Props {
  rpcClient: PublicClient;
  accountBalance: bigint | null;
}

export function LoggedInView({ rpcClient, accountBalance }: Props) {
  const { isAuthenticated } = usePrividium();
  const { isConnected, isConnecting, connector, address } = useConnection();
  const connect = useConnect();

  const connectorLoaded = connector?.getProvider;

  return (
    <div className="px-2 py-2 text-slate-900">
      {isAuthenticated && (
        <>
          {isConnected && rpcClient && accountBalance !== null && connectorLoaded && address ? (
            <>
              <EarnTab balance={accountBalance}
                rpcClient={rpcClient}
                connector={connector}
                accountAddress={address} />
            </>
          ) : (
            <div className="flex w-full justify-center">
              <button
                type="button"
                disabled={isConnecting}
                onClick={() => connect.mutate({ connector: injected() })}
                className="enterprise-button-primary transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConnecting ? "Connecting wallet..." : "Connect wallet"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
