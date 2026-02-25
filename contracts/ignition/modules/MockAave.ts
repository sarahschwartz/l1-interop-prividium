import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MockAaveModule", (m) => {
  const mockAave = m.contract("MockAave");
  return { mockAave };
});
