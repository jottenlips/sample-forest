import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { useAppStore } from "../../state/useAppStore";

export function SceneBar() {
  const { scenes, activeSceneId, saveScene, loadScene, deleteScene, updateScene } =
    useAppStore();

  const canAdd = scenes.length < 4;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>SCENES</Text>
      <View style={styles.scenesRow}>
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId;
          return (
            <View key={scene.id} style={styles.sceneItem}>
              <TouchableOpacity
                style={[styles.sceneBtn, isActive && styles.sceneBtnActive]}
                onPress={() => loadScene(scene.id)}
                onLongPress={() => deleteScene(scene.id)}
              >
                <Text
                  style={[styles.sceneBtnText, isActive && styles.sceneBtnTextActive]}
                  numberOfLines={1}
                >
                  {scene.name}
                </Text>
              </TouchableOpacity>
              {isActive && (
                <TouchableOpacity
                  style={styles.updateBtn}
                  onPress={() => updateScene(scene.id)}
                >
                  <Text style={styles.updateBtnText}>Save</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {canAdd && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => saveScene()}
          >
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.forest,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.pine,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    color: colors.mint,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  scenesRow: {
    flexDirection: "row",
    flex: 1,
    gap: 6,
    alignItems: "center",
  },
  sceneItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sceneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.pine,
    minWidth: 60,
    alignItems: "center",
  },
  sceneBtnActive: {
    backgroundColor: colors.sage,
  },
  sceneBtnText: {
    color: colors.mist,
    fontSize: 12,
    fontWeight: "600",
  },
  sceneBtnTextActive: {
    color: colors.forest,
    fontWeight: "700",
  },
  updateBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.fern,
  },
  updateBtnText: {
    color: colors.dew,
    fontSize: 9,
    fontWeight: "700",
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.fern,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: {
    color: colors.fern,
    fontSize: 18,
    fontWeight: "600",
  },
});
