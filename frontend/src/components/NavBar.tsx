import { useState } from "react";
import { Wallet, ChevronDown, Check, Copy, LogOut } from "lucide-react";

import { usePrividium } from "../hooks/usePrividium";
import { formatEther, type Address } from "viem";

interface Props {
    accountBalance: bigint;
    accountAddress: Address;
}

export function NavBar({ accountBalance, accountAddress }: Props) {
  const { signOut } = usePrividium();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(accountAddress);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
        setDropdownOpen(false);
      }, 2000);
    } catch (e) {
      console.error("Failed to copy address:", e);
    }
  };

  const logout = () => {
    try {
      signOut();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <nav className="floating-navbar">
      <div className="floating-navbar-inner">
        <div className="flex items-center gap-4 w-full justify-between">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
                <span className="text-slate-500">Balance</span>
                <span className="font-semibold text-slate-900">
                  {Number(formatEther(accountBalance)).toFixed(4)} ETH
                </span>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 md:px-6 py-2.5 rounded-full transition-all flex items-center gap-2.5 shadow-sm text-sm font-medium"
                >
                  <Wallet className="w-4 h-4 text-slate-500" />
                  <span className="font-mono">
                    {accountAddress.slice(0, 6)}...{accountAddress.slice(-4)}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 text-slate-400 transition-transform ${
                      dropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-50">
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors text-left"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span>{copied ? "Copied!" : "Copy Address"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
        </div>
      </div>
    </nav>
  );
}
