import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPrividiumChain,
  type PrividiumChain,
  type UserProfile,
} from "prividium";
import { prividiumChain } from "../utils/wagmi";

let prividiumInstance: PrividiumChain | null = null;

let sharedIsAuthenticated = false;
let sharedIsAuthenticating = false;
let sharedUserProfile: UserProfile | null = null;
let sharedAuthError: string | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}


function initializePrividium(): PrividiumChain {
  if (!prividiumInstance) {
    prividiumInstance = createPrividiumChain({
      clientId: import.meta.env.VITE_CLIENT_ID,
      chain: prividiumChain,
      authBaseUrl: import.meta.env.VITE_AUTH_BASE_URL,
      redirectUrl: window.location.origin + "/auth-callback.html",
      prividiumApiBaseUrl: import.meta.env.VITE_PRIVIDIUM_API_URL,
      onAuthExpiry: () => {
        console.log("Authentication expired");
        sharedIsAuthenticated = false;
        sharedUserProfile = null;
        emit();
      },
    });
    const isAuth = prividiumInstance.isAuthorized();
    sharedIsAuthenticated = isAuth;
  }

  return prividiumInstance;
}

async function loadUserProfile() {
  const prividium = initializePrividium();
  try {
    sharedUserProfile = await prividium.fetchUser();
  } catch (err) {
    console.error("Failed to fetch user profile:", err);
    sharedUserProfile = null;
  } finally {
    emit();
  }
}

export function usePrividium() {
  const prividium = useMemo(() => initializePrividium(), []);

  const [isAuthenticated, setIsAuthenticated] = useState(sharedIsAuthenticated);
  const [isAuthenticating, setIsAuthenticating] = useState(
    sharedIsAuthenticating,
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(
    sharedUserProfile,
  );
  const [authError, setAuthError] = useState<string | null>(sharedAuthError);

  useEffect(() => {
    return subscribe(() => {
      setIsAuthenticated(sharedIsAuthenticated);
      setIsAuthenticating(sharedIsAuthenticating);
      setUserProfile(sharedUserProfile);
      setAuthError(sharedAuthError);
    });
  }, []);

  useEffect(() => {
    if (sharedIsAuthenticated && !sharedUserProfile) {
      void loadUserProfile();
    }
  }, []);

  const userEmail = useMemo(
    () => userProfile?.displayName || userProfile?.id || null,
    [userProfile],
  );
  const userName = useMemo(
    () => userProfile?.displayName || "User",
    [userProfile],
  );
  const userRoles = useMemo(() => userProfile?.roles || [], [userProfile]);
  const userWallets = useMemo(
    () => userProfile?.wallets || [],
    [userProfile],
  );

  const authenticate = useCallback(async () => {
    sharedIsAuthenticating = true;
    sharedAuthError = null;
    emit();

    try {
      await prividium.authorize();

      sharedIsAuthenticated = true;
      emit();

      await loadUserProfile();
      return true;
    } catch (err) {
      console.error("Authentication failed:", err);
      sharedAuthError =
        err instanceof Error ? err.message : "Authentication failed";
      sharedIsAuthenticated = false;
      sharedUserProfile = null;
      emit();
      return false;
    } finally {
      sharedIsAuthenticating = false;
      emit();
    }
  }, [prividium]);

  const signOut = useCallback(() => {
    prividium.unauthorize();
    sharedIsAuthenticated = false;
    sharedUserProfile = null;
    sharedAuthError = null;
    emit();
  }, [prividium]);

  const getAuthHeaders = useCallback(() => prividium.getAuthHeaders(), [
    prividium,
  ]);

  const getTransport = useCallback(() => prividium.transport, [prividium]);
  const getChain = useCallback(() => prividium.chain, [prividium]);

  const addNetworkToWallet = useCallback(
    async () => prividium.addNetworkToWallet(),
    [prividium],
  );

  const getWalletToken = useCallback(
    async () => prividium.getWalletToken(),
    [prividium],
  );

  const getWalletRpcUrl = useCallback(
    async () => prividium.getWalletRpcUrl(),
    [prividium],
  );

  async function refreshUserProfile() {
    await loadUserProfile();
    return userProfile;
  }

  return {
    isAuthenticated,
    isAuthenticating,
    userEmail,
    userName,
    userRoles,
    userWallets,
    authError,
    userProfile,
    refreshUserProfile,
    authenticate,
    signOut,
    getAuthHeaders,
    getTransport,
    getChain,
    addNetworkToWallet,
    getWalletToken,
    getWalletRpcUrl,
    prividium,
  };
}
