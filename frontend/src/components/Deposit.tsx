import { type ChangeEvent, useState } from "react";
import { type Address, formatEther, parseEther } from "viem";

import { Spinner } from "./Spinner";
import { sendAuthorizedTx } from "../utils/txns";
import { usePrividium } from "../hooks/usePrividium";
import type { ViemClient, ViemSdk } from "@matterlabs/zksync-js/viem";
import { storeDepositETHHashes } from "../utils/storage";

interface Props {
  balance: bigint;
  shadowAccount: Address;
  accountAddress: Address;
  sdk: ViemSdk;
  sdkClient: ViemClient;
}

export function Deposit({
  balance,
  shadowAccount,
  accountAddress,
  sdk,
  sdkClient
}: Props) {
  const [depositAmount, setDepositAmount] = useState<string>("0");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [depositError, setDepositError] = useState<string>();

  const { prividium } = usePrividium();

  const btnsDisabled =
    accountAddress && shadowAccount && balance ? false : true;

  function handleDepositAmountChange(e: ChangeEvent<HTMLInputElement>) {
    const newAmount = parseEther(e.target.value);
    if (newAmount > balance) {
      setDepositAmount(formatEther(balance));
    } else {
      setDepositAmount(e.target.value);
    }
  }

  function handleMaxDeposit() {
    setDepositAmount(formatEther(balance));
  }

  async function depositETH(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSending(true);
    setDepositError(undefined);
    try {
      const amount =
        depositAmount === "" ? undefined : parseEther(depositAmount);
      if (!shadowAccount || !accountAddress)
        throw new Error("missing account info");
      if (!amount) throw new Error("invalid amount");
      console.log("Depositing ETH");
      const bundleHash = await sendAuthorizedTx({
        txnType: "depositToAaveBundle",
        amount,
        prividium,
        sdk,
        sdkClient,
        shadowAccount,
        accountAddress
      });

      console.log("bundleHash", bundleHash)

      // const withdrawHash = await sendAuthorizedTx({
      //   txnType: "withdrawToL1",
      //   amount,
      //   prividium,
      //   sdk,
      //   sdkClient,
      // })
      // storeDepositETHHashes(withdrawHash, bundleHash, accountAddress, amount);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.log("Error depositing ETH:", error);
      setDepositError(
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
      <form id="aave-deposit-form" onSubmit={depositETH}>
        <div className="form-group">
          <div className="label-row">
            <label id="earn-deposit-amount" htmlFor="aaveDepositAmount">
              Amount (ETH)
            </label>
            <span
              className="max-link"
              onClick={btnsDisabled || isSending ? undefined : handleMaxDeposit}
              role="button"
              tabIndex={btnsDisabled || isSending ? -1 : 0}
            >
              Max
            </span>
          </div>
          <input
            type="number"
            id="aaveDepositAmount"
            step="any"
            placeholder="0.01"
            min="0"
            value={depositAmount}
            disabled={btnsDisabled || isSending}
            onChange={handleDepositAmountChange}
          />
        </div>
        <button
          className="w-full enterprise-button-primary"
          id="aaveDepositBtn"
          disabled={btnsDisabled || isSending}
          type="submit"
        >
          {isSending ? (
            <span className="deploying-content">
              <Spinner />
              Depositing...
            </span>
          ) : (
            <span>Deposit to Aave</span>
          )}
        </button>
      </form>

      {depositError && (
        <div id="aave-deposit-error" className="alert alert-error">
          Deposit failed: {depositError};
        </div>
      )}
    </div>
  );
}
