import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/services/api";
import { LoginCredentialsManager } from "@/services/storage";
import { PRESET } from "@/constants/Defaults";
import { useSettingsStore } from "./settingsStore";
import Toast from "react-native-toast-message";
import Logger from "@/utils/Logger";

const logger = Logger.withTag('AuthStore');

interface AuthState {
  isLoggedIn: boolean;
  isLoginModalVisible: boolean;
  showLoginModal: () => void;
  hideLoginModal: () => void;
  checkLoginStatus: (apiBaseUrl?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  isLoginModalVisible: false,
  showLoginModal: () => set({ isLoginModalVisible: true }),
  hideLoginModal: () => set({ isLoginModalVisible: false }),
  checkLoginStatus: async (apiBaseUrl?: string) => {
    if (!apiBaseUrl) {
      set({ isLoggedIn: false, isLoginModalVisible: false });
      return;
    }
    try {
      // Wait for server config to be loaded if it's currently loading
      const settingsState = useSettingsStore.getState();
      let serverConfig = settingsState.serverConfig;

      // If server config is loading, wait a bit for it to complete
      if (settingsState.isLoadingServerConfig) {
        // Wait up to 3 seconds for server config to load
        const maxWaitTime = 3000;
        const checkInterval = 100;
        let waitTime = 0;

        while (waitTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitTime += checkInterval;
          const currentState = useSettingsStore.getState();
          if (!currentState.isLoadingServerConfig) {
            serverConfig = currentState.serverConfig;
            break;
          }
        }
      }

      if (!serverConfig?.StorageType) {
        // Only show error if we're not loading and have tried to fetch the config
        if (!settingsState.isLoadingServerConfig) {
          Toast.show({ type: "error", text1: "请检查网络或者服务器地址是否可用" });
        }
        return;
      }

      const authToken = await AsyncStorage.getItem('authCookies');
      if (!authToken) {
        // 出厂预置：先用内建凭据（或上次成功登录保存的凭据）自动登录，省去在电视上敲字。
        // 注意 localstorage 模式的站点只校验密码、不校验用户名（服务端固定用默认用户名），
        // 所以这种模式下用户名传 undefined。
        const saved = await LoginCredentialsManager.get();
        const isLocalStorage = serverConfig?.StorageType === 'localstorage';
        const presetCreds = PRESET.password
          ? { username: isLocalStorage ? '' : PRESET.username, password: PRESET.password }
          : null;
        const creds = saved ?? presetCreds;
        if (creds && creds.password && serverConfig) {
          try {
            const result = await api.login(isLocalStorage ? undefined : creds.username, creds.password);
            if (result && result.ok) {
              await LoginCredentialsManager.save(creds);
              set({ isLoggedIn: true, isLoginModalVisible: false });
              return;
            }
          } catch (e) {
            logger.info('预置凭据自动登录未成功，回退到手动登录', e);
          }
        }
        if (serverConfig && serverConfig.StorageType === "localstorage") {
          const loginResult = await api.login().catch(() => {
            set({ isLoggedIn: false, isLoginModalVisible: true });
          });
          if (loginResult && loginResult.ok) {
            set({ isLoggedIn: true });
          }
        } else {
          set({ isLoggedIn: false, isLoginModalVisible: true });
        }
      } else {
        set({ isLoggedIn: true, isLoginModalVisible: false });
      }
    } catch (error) {
      logger.error("Failed to check login status:", error);
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        set({ isLoggedIn: false, isLoginModalVisible: true });
      } else {
        set({ isLoggedIn: false });
      }
    }
  },
  logout: async () => {
    try {
      await api.logout();
      set({ isLoggedIn: false, isLoginModalVisible: true });
    } catch (error) {
      logger.error("Failed to logout:", error);
    }
  },
}));

export default useAuthStore;
