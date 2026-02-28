import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors } from "../../theme/colors";
import { useAppStore } from "../../state/useAppStore";
import { PunchInEffect } from "../../types";

const EFFECTS: { id: PunchInEffect; label: string; icon: string; desc: string }[] = [
  { id: "repeat", label: "REPEAT", icon: "⟳", desc: "Loop beat" },
  { id: "double", label: "2× TEMPO", icon: "⏩", desc: "Double speed" },
  { id: "half", label: "½ TEMPO", icon: "⏪", desc: "Half speed" },
  { id: "swap", label: "SWAP", icon: "⇄", desc: "Swap samples" },
];

function PunchInButton({
  effect,
}: {
  effect: (typeof EFFECTS)[number];
}) {
  const punchIn = useAppStore((s) => s.punchIn);
  const isPlaying = useAppStore((s) => s.sequencer.isPlaying);
  const setPunchIn = useAppStore((s) => s.setPunchIn);
  const isActive = punchIn === effect.id;

  return (
    <Pressable
      onPressIn={() => {
        if (isPlaying) setPunchIn(effect.id);
      }}
      onPressOut={() => {
        // Read fresh state to avoid stale closure issue
        const current = useAppStore.getState().punchIn;
        if (current === effect.id) setPunchIn(null);
      }}
      style={({ pressed }) => [
        styles.fxBtn,
        isActive && styles.fxBtnActive,
        !isPlaying && styles.fxBtnDisabled,
        pressed && isPlaying && styles.fxBtnPressed,
      ]}
    >
      <Text style={[styles.fxIcon, isActive && styles.fxTextActive]}>
        {effect.icon}
      </Text>
      <Text style={[styles.fxLabel, isActive && styles.fxTextActive]}>
        {effect.label}
      </Text>
    </Pressable>
  );
}

export function PunchInBar() {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>PUNCH-IN FX</Text>
      <View style={styles.fxRow}>
        {EFFECTS.map((fx) => (
          <PunchInButton key={fx.id} effect={fx} />
        ))}
      </View>
      <Text style={styles.hint}>Hold while playing</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bark,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.pine,
  },
  sectionLabel: {
    color: colors.mint,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
  },
  fxRow: {
    flexDirection: "row",
    gap: 8,
  },
  fxBtn: {
    flex: 1,
    backgroundColor: colors.pine,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  fxBtnActive: {
    backgroundColor: colors.sage,
    borderColor: colors.mint,
  },
  fxBtnDisabled: {
    opacity: 0.4,
  },
  fxBtnPressed: {
    backgroundColor: colors.fern,
  },
  fxIcon: {
    fontSize: 18,
    color: colors.mist,
    marginBottom: 2,
  },
  fxLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.mist,
    letterSpacing: 0.5,
  },
  fxTextActive: {
    color: colors.forest,
  },
  hint: {
    color: colors.stone,
    fontSize: 9,
    textAlign: "center",
    marginTop: 4,
  },
});
