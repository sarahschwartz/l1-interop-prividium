export const MOCK_AAVE_CONTRACT_ADDRESS = import.meta.env.VITE_MOCK_AAVE_ADDRESS;
export const L1_INTEROP_HANDLER_ADDRESS = import.meta.env.VITE_L1_INTEROP_HANDLER;
export const L2_INTEROP_CENTER_ADDRESS = import.meta.env.VITE_L2_INTEROP_CENTER;
export const L2_CHAIN_ID = import.meta.env.VITE_CHAIN_ID;
export const BLOCK_EXPLORER_URL = import.meta.env.VITE_BLOCK_EXPLORER_URL;
export const BACKEND_URL = import.meta.env?.VITE_BACKEND_URL || "http://localhost:4340";
export const STATUS_ENDPOINT = `${BACKEND_URL}/status`;