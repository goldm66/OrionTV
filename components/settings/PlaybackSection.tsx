import React, { useCallback } from "react";
import { View, Switch, StyleSheet, Pressable, Animated, Platform, TouchableOpacity } from "react-native";
import { useTVEventHandler } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "./SettingsSection";
import { useSettingsStore } from "@/stores/settingsStore";
import { useButtonAnimation } from "@/hooks/useAnimation";
import { Colors } from "@/constants/Colors";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

interface PlaybackSectionProps {
  onChanged: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/**
 * 播放增强开关：
 *  - 去广告：播放地址走自建站的 m3u8 代理，服务端过滤广告分片（默认开）
 *  - 自动选最快线路：搜索完成后按各源首集的加载耗时自动切到最快源（默认开）
 */
export const PlaybackSection: React.FC<PlaybackSectionProps> = ({ onChanged, onFocus, onBlur }) => {
  const {
    adFilterEnabled,
    autoFastestSource,
    setAdFilterEnabled,
    setAutoFastestSource,
  } = useSettingsStore();
  const [focusedItem, setFocusedItem] = React.useState<"ad" | "fast" | null>(null);
  const deviceType = useResponsiveLayout().deviceType;

  const toggleAd = useCallback(() => {
    setAdFilterEnabled(!adFilterEnabled);
    onChanged();
  }, [adFilterEnabled, setAdFilterEnabled, onChanged]);

  const toggleFast = useCallback(() => {
    setAutoFastestSource(!autoFastestSource);
    onChanged();
  }, [autoFastestSource, setAutoFastestSource, onChanged]);

  // TV 遥控器：焦点在某一项上按确认键切换
  const handleTVEvent = React.useCallback(
    (event: any) => {
      if (event.eventType !== "select" || !focusedItem) return;
      if (focusedItem === "ad") toggleAd();
      else toggleFast();
    },
    [focusedItem, toggleAd, toggleFast]
  );

  useTVEventHandler(handleTVEvent);

  const renderItem = (
    key: "ad" | "fast",
    title: string,
    description: string,
    value: boolean,
    onToggle: () => void
  ) => {
    const isFocused = focusedItem === key;
    return (
      <Pressable
        style={styles.settingItem}
        onFocus={() => {
          setFocusedItem(key);
          onFocus?.();
        }}
        onBlur={() => {
          setFocusedItem((cur) => (cur === key ? null : cur));
          onBlur?.();
        }}
        onPress={() => {
          setFocusedItem(key);
          onToggle();
        }}
      >
        <View style={styles.settingInfo}>
          <ThemedText style={styles.settingName}>{title}</ThemedText>
          <ThemedText style={styles.settingDescription}>{description}</ThemedText>
        </View>
        <Animated.View style={isFocused ? styles.focused : undefined}>
          {Platform.OS === "ios" && Platform.isTV ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setFocusedItem(key);
                onToggle();
              }}
              style={styles.statusLabel}
            >
              <ThemedText style={styles.statusValue}>{value ? "已启用" : "已禁用"}</ThemedText>
            </TouchableOpacity>
          ) : (
            <Switch
              value={value}
              onValueChange={() => {
                setFocusedItem(key);
                onToggle();
              }}
              trackColor={{ false: "#767577", true: Colors.dark.primary }}
              thumbColor={value ? "#ffffff" : "#f4f3f4"}
              disabled={deviceType === "tv"}
            />
          )}
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <SettingsSection>
      <ThemedText style={styles.sectionTitle}>播放增强</ThemedText>
      {renderItem(
        "ad",
        "自动去广告",
        "播放地址走站点的 m3u8 代理，服务端剔除广告分片与插入点",
        !!adFilterEnabled,
        toggleAd
      )}
      <View style={styles.divider} />
      {renderItem(
        "fast",
        "自动选择最快线路",
        "搜索完成后并发测速各资源站，自动切到加载最快的那条线路",
        !!autoFastestSource,
        toggleFast
      )}
    </SettingsSection>
  );
};

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
    paddingRight: 12,
  },
  settingName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: "#888",
  },
  statusLabel: {
    minWidth: 60,
  },
  statusValue: {
    fontSize: 14,
  },
  focused: {
    transform: [{ scale: 1.1 }],
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
  },
});
