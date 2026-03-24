import { type ChangeEvent, useState } from "react";
import { type Address, formatEther, parseEther } from "viem";

import { Spinner } from "./Spinner";
import { sendAuthorizedTx } from "../utils/txns";
import type { ViemClient, ViemSdk } from "@matterlabs/zksync-js/viem";
import { usePrividium } from "../hooks/usePrividium";
import { storeWithdrawETHHash } from "../utils/storage";

interface Props {
  aaveBalance: bigint;
  shadowAccount: Address;
  accountAddress: Address;
  sdk: ViemSdk;
  sdkClient: ViemClient;
  shadowEthBalance: bigint;
  requiredEthBuffer: bigint;
  onComplete?: () => void;
}

export function Withdraw({
  aaveBalance,
  shadowAccount,
  accountAddress,
  sdk,
  sdkClient,
  shadowEthBalance,
  requiredEthBuffer,
  onComplete,
}: Props) {
  const [withdrawAmount, setWithdrawAmount] = useState<string>("0");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [withdrawError, setWithdrawError] = useState<string>();

  const { prividium } = usePrividium();
  const hasEnoughEthBuffer = shadowEthBalance >= requiredEthBuffer;
  const shadowBufferMessage = hasEnoughEthBuffer
    ? undefined
    : `Shadow account needs at least ${formatEther(requiredEthBuffer)} ETH to cover the bridge fee, but only has ${formatEther(shadowEthBalance)} ETH.`;

  const btnsDisabled =
    accountAddress && shadowAccount && aaveBalance > 0n ? false : true;

  function handleWithdrawAmountChange(e: ChangeEvent<HTMLInputElement>) {
    const newAmount = parseEther(e.target.value);
    if (newAmount > aaveBalance) {
      setWithdrawAmount(formatEther(aaveBalance));
    } else {
      setWithdrawAmount(e.target.value);
    }
  }

  function handleMaxWithdraw() {
    setWithdrawAmount(formatEther(aaveBalance));
  }

  async function withdrawETH(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSending(true);
    setWithdrawError(undefined);
    try {
      const amount =
        withdrawAmount === "" ? undefined : parseEther(withdrawAmount);
      if (!shadowAccount || !accountAddress)
        throw new Error("missing account info");
      if (!amount) throw new Error("invalid amount");
      if (!hasEnoughEthBuffer) {
        throw new Error(shadowBufferMessage ?? "insufficient ETH buffer");
      }
      console.log("Withdrawing ETH");
      const hash = await sendAuthorizedTx({
        txnType: "withdrawFromAaveBundle",
        amount,
        prividium,
        sdk,
        sdkClient,
        shadowAccount,
        accountAddress
      });
      console.log("HASH:", hash);
      storeWithdrawETHHash(hash, accountAddress, amount);
      onComplete?.();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.log("Error withdrawing from Aave", error);
      setWithdrawError(
        error.message && typeof error.message === "string"
          ? error.message
          : "unknown error",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="card">
      <form id="aave-withdraw-form" onSubmit={withdrawETH}>
        <div className="form-group">
          <div className="label-row">
            <label id="earn-withdraw-amount" htmlFor="aaveWithdrawAmount">
              Amount (ETH)
            </label>
            <span
              className="max-link"
              onClick={
                btnsDisabled || isSending ? undefined : handleMaxWithdraw
              }
              role="button"
              tabIndex={btnsDisabled || isSending ? -1 : 0}
            >
              Max
            </span>
          </div>
          <input
            type="number"
            id="aaveWithdrawAmount"
            step="any"
            min="0"
            placeholder="0.01"
            value={withdrawAmount}
            onChange={handleWithdrawAmountChange}
            disabled={btnsDisabled || isSending}
          />
        </div>
        {shadowBufferMessage && (
          <div className="alert alert-error">
            {shadowBufferMessage}
          </div>
        )}
        <button
          className="w-full enterprise-button-primary disabled:bg-gray-500! disabled:cursor-not-allowed!"
          id="aaveWithdrawBtn"
          disabled={btnsDisabled || isSending || !hasEnoughEthBuffer}
          type="submit"
        >
          {isSending ? (
            <span className="deploying-content">
              <Spinner />
              Withdrawing...
            </span>
          ) : (
            <span>Withdraw from Aave</span>
          )}
        </button>
      </form>

      {withdrawError && (
        <div id="aave-withdraw-error" className="alert alert-error">
          Withdrawal failed: {withdrawError};
        </div>
      )}
    </div>
  );
}
