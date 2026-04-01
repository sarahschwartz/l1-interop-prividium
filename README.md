# L1 Interop with Prividium

🚧 Under construction 🚧

A simple demo for L1 interop with Prividium™️.

## Running locally

### Setup a local Prividium

Run a local Prividium chain with [`local-prividium`](https://github.com/matter-labs/local-prividium) with a bundler service enabled and entrypoint contract deployed (still to be added).

### Sign in and fund your admin account

In order to deploy the contracts, you will need to be authenticated with a Prividium admin account and have your wallet funded.

In your metamask wallet add an account from this private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`.

Then go to [`http://localhost:3001/`](http://localhost:3001/) and sign in with this wallet.

Click on the "Wallets" tab in the user panel and then click on the "Add Network to Wallet" button.
If you have previously added the network to your metamask, you may have to edit the network configuration to make sure the correct RPC Access token is being used by deleting the old RPC urls.

Finally, ensure the account has some funds by either going to the "Bridge" tab in the user panel and bridging some funds, or running the command below:

```bash
cast send -r http://localhost:5050 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  --value 10000000000000000000 --private-key 0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110
```

### Enable withdrawals on Prividium

(TODO: fix once UI is updated to enable this).
Add the `L2_BASE_TOKEN_ADDRESS` system contract in the [admin panel](http://localhost:3000/) and enable withdrawals.
Warning: editing permissions for this contract could result in balances being public.
This is just for demo purposes until the admin panel adds an option to safely enable withdrawals.

The base token address is `0x000000000000000000000000000000000000800A`.
You can find the ABI in `contracts/abis/BaseToken.json`.

### Enable `L2NativeTokenVault` functions

This system contract should already show up in the admin panel.
Enable these functions to allow users to deposit and withdraw. (TODO: verify which ones are needed)

### Install contract deps

```bash
cd contracts
bun install
```

### Run a local proxy

Make sure you are logged in with your admin account in the Prividium user panel.
Then run:

```bash
npx prividium proxy
```

or

```bash
cd frontend
bun install
bun prividium proxy
```

### Get the bridgehub address

```bash
bun bridgehub
```

Use this address to update the `BRIDGEHUB_ADDRESS` value in `contracts/ignition/modules/L1InteropHandler.ts`.

### Deploy the `L1InteropHandler`

```bash
bun deploy:l1-interop
```

Then use this address to update the `L1_INTEROP_HANDLER` value in `contracts/ignition/modules/L2InteropCenter.ts`.

### Deploy the `L2InteropCenter`

```bash
bun deploy:l2-interop
```

Once deployed, add this contract in your admin panel and configure the permissions so any user can call any of its functions.

You can find the ABI in `contracts/artifacts/contracts/L2InteropCenter.sol/L2InteropCenter.json` under `abi`.

### Deploy the mock Aave contract

```bash
bun deploy:aave
```

### Create a new application ID

In the admin panel add a new application under "Apps".
The whitelisted origin should be `http://localhost:5173` and the redirect URI should be `http://localhost:5173/auth-callback.html`.

### Configure the frontend `.env` file

Use the `.env.example` file as a template.
Add the deployed contract addresses and
the OAuth Client ID from the previous step as the `VITE_CLIENT_ID`.

### Run the frontend

```bash
cd frontend
bun install
bun dev
```

### Connect your wallet

Use a Prividium-connected wallet to connect to the app.
Send some ETH on the L1 to your shadow account to pay for gas for Aave withdrawals.
Then you can deposit and withdraw from the mock Aave contract on the L1.
