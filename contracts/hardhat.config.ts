import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  ignition: {
    requiredConfirmations: 1,
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    localL1: {
      type: "http",
      chainType: "l1",
      url: "http://localhost:5010",
      // local L1 rich wallet
      // WARNING: change to use configVariable for mainnet/testnet
      accounts: ["0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110"],
    },
    localPrividium: {
      type: "http",
      chainType: "generic",
      // npx prividium proxy
      url: "http://127.0.0.1:24101/rpc",
      // local prividium admin account
      // WARNING: change to use configVariable for mainnet/testnet
      accounts: ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"],
    },
  },
});
