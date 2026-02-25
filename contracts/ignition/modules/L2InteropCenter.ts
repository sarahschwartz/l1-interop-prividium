import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("L2InteropCenterModule", (m) => {
  const L1_INTEROP_HANDLER = '0xc8F8cE6491227a6a2Ab92e67a64011a4Eba1C6CF';

  const center = m.contract("L2InteropCenter", [L1_INTEROP_HANDLER]);
  return { center };
});
