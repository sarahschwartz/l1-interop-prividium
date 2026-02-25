import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("L1InteropHandlerModule", (m) => {
  const BRIDGEHUB_ADDRESS = '0xaab95dfc116d9d9d9dd931cda1fd4142db135365';

  const handler = m.contract("L1InteropHandler", [BRIDGEHUB_ADDRESS]);
  return { handler };
});
