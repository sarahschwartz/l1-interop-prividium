# Lottery App

🚧 Under construction 🚧

A simple game where players can guess a number and win some money.
Built for Prividium™️.

## Running locally

### Setup a local Prividium

Run a local Prividium chain with [`local-prividium`](https://github.com/matter-labs/local-prividium) with a bundler service enabled and entrypoint contract deployed (still to be added).

### Sign in and fund your admin account

In order to deploy the contracts, you will need to be authenticated with a Prividium admin account and have your wallet funded.

In your metamask wallet add an account from this private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`.

Then go to [`http://localhost:3001/`](http://localhost:3001/) and sign in with this wallet.

Click on the "Wallets" tab in the user panel and then click on the "Add Network to Wallet" button.
If you have previously added the network to your metamask, you may have to edit the network configuration to make sure the correct RPC Access token is being used by deleting the old RPC urls.

Finally, run the command below to ensure the account has some funds:

```bash
cast send -r http://localhost:5050 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  --value 10000000000000000000 --private-key 0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110
```

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

### Deploy the game

```bash
bun deploy-game
```

### Deploy the paymaster

```bash
bun deploy-paymaster
```

#### Fund the paymaster

In `contracts/scripts/setup.ts` update the `PAYMASTER_CONTRACT_ADDRESS` with your deployed paymaster contract address.

Then run:

```bash
bun fund-paymaster
```

### Configure contracts and permissions on admin panel

Go to `http://localhost:3000/contracts`[http://localhost:3000/contracts] and add the game and paymaster contracts and ABIs to the admin panel contracts.

> To copy the abi for the game, go into the `contracts/artifacts/contracts/NumberGuessingGame.sol/NumberGuessingGame.json` file
> and copy the entire array for the `"abi"`.
> Do the same for the Paymaster contract at `contracts/artifacts/contracts/AcceptAllPaymaster.sol/AcceptAllPaymaster.json`.

You can configure the permissions of all contract functions to allow all users.

### Create a new application ID

In the admin panel add a new application under "Apps".
The whitelisted origin should be `http://localhost:5173` and the redirect URI should be `http://localhost:5173/auth-callback.html`.

### Setup the SSO contracts and run the backend

Clone the `prividium-template-vue`[https://github.com/uF4No/prividium-template-vue] and follow the instructions to run the setup script.
This will deploy and configure the SSO contracts for you.

Then follow the instructions to run the backend locally.
This will be used for deploying SSO accounts.

### Configure the frontend `.env` file

Use the `.env.example` file as a template.
Add the deployed game and paymaster contract address,
the OAuth Client ID as the `VITE_CLIENT_ID`,
and the webauthn validator contract for SSO as `VITE_SSO_WEBAUTHN_VALIDATOR`.

### Run the frontend

```bash
cd frontend
bun install
bun dev
```

### Create a new SSO account

Open the app at [`http://localhost:5173`](`http://localhost:5173`) and create a new passkey and SSO account.
Once logged in, copy your account address in the top right dropdown,
and set it as the `newAdminAddress` in the `contracts/scripts/add-admin.ts` script.
Then run the script to add this address as a game admin.

```bash
cd contracts
bun add-admin
```

### Create a new game session

Refresh the app at [`http://localhost:5173`](`http://localhost:5173`)
and you will see a game "admin panel".
Select the max numbers that can be guessed, the length of time the session will last, and the payout amount if there is a winner.
Then create the session.
You will have the use the passkey you just created to authenticate the transaction.

### Play the game

Using another browser, log in to the user panel with the keycloak login `user@local.dev` with the password `password` to login.
Then create a new passkey and SSO account.

Make sure in the admin panel that this user has the role `user`,
or else an error will occur when trying to pick a number.
Then open the app to guess a number for the session.

### Draw the winner

Once the time has passed for the session the admin account can choose a winner.

> Note: without any other activity on your chain, you will need to send another transaction for the block timestamp to advance.
> Try sending a transaction after the expiration time should have passed.

The admin panel will show an option to choose a winning number once the block timestamp has advanced passed the deadline.

If no player chose the winning number, the payout will be returned to the admin wallet.
If a player did select the winning number,
the player will see a claim button on the app for them to claim the winning amount.
