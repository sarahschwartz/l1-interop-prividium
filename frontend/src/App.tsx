import { TriangleAlert } from "lucide-react";
import "./App.css";
import { LoggedInView } from "./components/LoggedInView";
import { usePrividium } from "./hooks/usePrividium";
import { NavBar } from "./components/NavBar";
import { useEffect, useMemo, useState } from "react";
import { createPrividiumClient } from "prividium";
import { prividiumChain } from "./utils/wagmi";
import type { PublicClient } from "viem";
import { useConnection } from "wagmi";

function App() {
  const [accountBalance, setAccountBalance] = useState<bigint | null>(null);
  const { address } = useConnection();

  const {
    isAuthenticated,
    isAuthenticating,
    authError,
    authenticate,
    prividium,
  } = usePrividium();

  const login = async () => {
    const success = await authenticate();
    if (success) {
      window.location.reload();
    }
  };

  const rpcClient = useMemo(() => {
    if (isAuthenticated && address) {
      return createPrividiumClient({
        chain: prividiumChain,
        transport: prividium.transport,
        account: address,
      });
    }
  }, [address, prividium.transport, isAuthenticated]);

  useEffect(() => {
    let isMounted = true;

    const syncBalance = async () => {
      if (!rpcClient || !address) {
        if (isMounted) setAccountBalance(null);
        return;
      }

      try {
        const balance = await rpcClient.getBalance({ address });
        if (isMounted) setAccountBalance(balance);
      } catch (err) {
        console.error("Failed to load account balance:", err);
      }
    };

    syncBalance();
    const interval = setInterval(syncBalance, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [address, rpcClient]);

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {address && accountBalance !== null && (
        <NavBar accountBalance={accountBalance} accountAddress={address} />
      )}

      <div className="grow container mx-auto px-4 py-2 md:py-4 max-w-7xl">
        <div className="min-h-[72vh] flex items-center justify-center p-2 md:p-6">
          <div
            className={`w-full enterprise-card overflow-hidden ${isAuthenticated ? "max-w-5xl" : "max-w-md"}`}
          >
            <div className="p-6 md:p-8 lg:p-10">
              {/* AUTHENTICATING STATE */}
              {isAuthenticating && (
                <div className="flex flex-col items-center py-8">
                  <div className="w-10 h-10 border-4 border-accent/10 border-t-accent rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest animate-pulse">
                    Authenticating...
                  </p>
                </div>
              )}

              {isAuthenticated ? (
                <LoggedInView
                  accountBalance={accountBalance}
                  rpcClient={rpcClient as PublicClient}
                />
              ) : (
                <div className="space-y-6">
                  <button
                    onClick={login}
                    className="enterprise-button-primary w-full py-4 text-base tracking-wide"
                  >
                    Authenticate via Prividium
                  </button>
                </div>
              )}

              {authError && (
                <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                  <TriangleAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-bold leading-relaxed">
                    {authError}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
